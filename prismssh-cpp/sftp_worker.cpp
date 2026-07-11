#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wrl.h>
#include <WebView2.h>
#include <nlohmann/json.hpp>
#include "sftp_worker.h"
#include "common_utils.h"
#include "crypto_utils.h"

// Reference global WebView2 window pointer from main.cpp
extern Microsoft::WRL::ComPtr<ICoreWebView2> webviewWindow;

void AsyncDownloadFileThread(std::string reqId, std::shared_ptr<SSHSession> session, std::string remotePath, std::wstring localPath) {
    bool ok = session->DownloadFile(remotePath, localPath);
    
    nlohmann::json response;
    response["id"] = reqId;
    response["status"] = "success";
    
    nlohmann::json res;
    res["success"] = ok;
    if (!ok) {
        res["error"] = session->lastError;
    }
    response["result"] = res.dump();
    
    if (webviewWindow != nullptr) {
        std::wstring responseW = Utf8ToUtf16(response.dump());
        webviewWindow->PostWebMessageAsJson(responseW.c_str());
    }
}

void AsyncUploadFileThread(std::string reqId, std::shared_ptr<SSHSession> session, std::wstring localPath, std::string remotePath) {
    bool ok = session->UploadFile(localPath, remotePath);
    
    nlohmann::json response;
    response["id"] = reqId;
    response["status"] = "success";
    
    nlohmann::json res;
    res["success"] = ok;
    if (!ok) {
        res["error"] = session->lastError;
    }
    response["result"] = res.dump();
    
    if (webviewWindow != nullptr) {
        std::wstring responseW = Utf8ToUtf16(response.dump());
        webviewWindow->PostWebMessageAsJson(responseW.c_str());
    }
}

void CleanupEditMappings() {
    std::lock_guard<std::mutex> lock(editMappingMutex);
    for (auto& pair : editMappings) {
        DeleteFileW(pair.first.c_str());
    }
    editMappings.clear();
}

void UploadThread(std::shared_ptr<SSHSession> session, std::string fileData, std::string remotePath, std::string uploadId) {
    long long totalBytes = fileData.size();
    long long transferred = 0;
    std::string sftpError;
    if (!session->EnsureSftpSession(sftpError)) {
        globalProgressManager.SetProgress(uploadId, 0, totalBytes, true, sftpError);
        return;
    }
    
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            handle = libssh2_sftp_open(session->sftpSession, remotePath.c_str(), LIBSSH2_FXF_WRITE | LIBSSH2_FXF_CREAT | LIBSSH2_FXF_TRUNC, 0644);
            if (handle) break;
            int err = libssh2_session_last_errno(session->sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                globalProgressManager.SetProgress(uploadId, 0, totalBytes, true, "Failed to open remote file");
                return;
            }
        }
        Sleep(5);
    }
    
    const int chunkSize = 32768; // 32KB
    while (transferred < totalBytes) {
        if (globalProgressManager.IsCancelled(uploadId)) {
            break;
        }
        
        int toWrite = (int)std::min((long long)chunkSize, totalBytes - transferred);
        int written = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            written = libssh2_sftp_write(handle, fileData.data() + transferred, toWrite);
        }
        
        if (written < 0) {
            if (written == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            while (true) {
                int c_rc = 0;
                {
                    std::lock_guard<std::mutex> lock(session->sshMutex);
                    c_rc = libssh2_sftp_close(handle);
                }
                if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                Sleep(5);
            }
            globalProgressManager.SetProgress(uploadId, transferred, totalBytes, true, "Write failed");
            return;
        }
        
        transferred += written;
        globalProgressManager.SetProgress(uploadId, transferred, totalBytes);
        Sleep(1);
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    
    if (globalProgressManager.IsCancelled(uploadId)) {
        globalProgressManager.SetProgress(uploadId, transferred, totalBytes, true, "Cancelled");
    } else {
        globalProgressManager.SetProgress(uploadId, totalBytes, totalBytes, true);
    }
}

void UploadFromPathThread(std::shared_ptr<SSHSession> session, std::wstring localPath, std::string remotePath, std::string uploadId) {
    std::ifstream localFile(localPath, std::ios::binary);
    if (!localFile.is_open()) {
        globalProgressManager.SetProgress(uploadId, 0, 0, true, "Failed to open local file");
        return;
    }
    
    localFile.seekg(0, std::ios::end);
    long long totalBytes = localFile.tellg();
    localFile.seekg(0, std::ios::beg);
    
    globalProgressManager.SetProgress(uploadId, 0, totalBytes);
    std::string sftpError;
    if (!session->EnsureSftpSession(sftpError)) {
        localFile.close();
        globalProgressManager.SetProgress(uploadId, 0, totalBytes, true, sftpError);
        return;
    }
    
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            handle = libssh2_sftp_open(session->sftpSession, remotePath.c_str(), LIBSSH2_FXF_WRITE | LIBSSH2_FXF_CREAT | LIBSSH2_FXF_TRUNC, 0644);
            if (handle) break;
            int err = libssh2_session_last_errno(session->sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                localFile.close();
                globalProgressManager.SetProgress(uploadId, 0, totalBytes, true, "Failed to open remote file");
                return;
            }
        }
        Sleep(5);
    }
    
    const int chunkSize = 32768;
    std::vector<char> buffer(chunkSize);
    long long transferred = 0;
    
    while (transferred < totalBytes) {
        if (globalProgressManager.IsCancelled(uploadId)) {
            break;
        }
        
        localFile.read(buffer.data(), chunkSize);
        int toWrite = (int)localFile.gcount();
        if (toWrite <= 0) break;
        
        int writtenTotal = 0;
        while (writtenTotal < toWrite) {
            if (globalProgressManager.IsCancelled(uploadId)) {
                break;
            }
            int written = 0;
            {
                std::lock_guard<std::mutex> lock(session->sshMutex);
                written = libssh2_sftp_write(handle, buffer.data() + writtenTotal, toWrite - writtenTotal);
            }
            if (written < 0) {
                if (written == LIBSSH2_ERROR_EAGAIN) {
                    Sleep(5);
                    continue;
                }
                while (true) {
                    int c_rc = 0;
                    {
                        std::lock_guard<std::mutex> lock(session->sshMutex);
                        c_rc = libssh2_sftp_close(handle);
                    }
                    if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                    Sleep(5);
                }
                localFile.close();
                globalProgressManager.SetProgress(uploadId, transferred, totalBytes, true, "Write failed");
                return;
            }
            writtenTotal += written;
        }
        
        transferred += toWrite;
        globalProgressManager.SetProgress(uploadId, transferred, totalBytes);
        Sleep(1);
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    localFile.close();
    
    if (globalProgressManager.IsCancelled(uploadId)) {
        globalProgressManager.SetProgress(uploadId, transferred, totalBytes, true, "Cancelled");
    } else {
        globalProgressManager.SetProgress(uploadId, totalBytes, totalBytes, true);
    }
}

void DownloadThread(std::shared_ptr<SSHSession> session, std::string remotePath, std::string downloadId) {
    std::string sftpError;
    if (!session->EnsureSftpSession(sftpError)) {
        globalProgressManager.SetProgress(downloadId, 0, 0, true, sftpError);
        return;
    }

    LIBSSH2_SFTP_HANDLE* handle = NULL;
    LIBSSH2_SFTP_ATTRIBUTES attrs;
    long long totalBytes = 0;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            handle = libssh2_sftp_open(session->sftpSession, remotePath.c_str(), LIBSSH2_FXF_READ, 0);
            if (handle) {
                if (libssh2_sftp_stat(session->sftpSession, remotePath.c_str(), &attrs) == 0) {
                    totalBytes = (attrs.flags & LIBSSH2_SFTP_ATTR_SIZE) ? attrs.filesize : 0;
                }
                break;
            }
            int err = libssh2_session_last_errno(session->sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                globalProgressManager.SetProgress(downloadId, 0, 0, true, "Failed to open remote file");
                return;
            }
        }
        Sleep(5);
    }
    
    globalProgressManager.SetProgress(downloadId, 0, totalBytes);
    
    std::string fileData;
    if (totalBytes > 0) fileData.reserve(totalBytes);
    
    const int chunkSize = 32768;
    char buffer[chunkSize];
    long long transferred = 0;
    
    while (true) {
        if (globalProgressManager.IsCancelled(downloadId)) {
            break;
        }
        
        int readBytes = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            readBytes = libssh2_sftp_read(handle, buffer, chunkSize);
        }
        
        if (readBytes < 0) {
            if (readBytes == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            while (true) {
                int c_rc = 0;
                {
                    std::lock_guard<std::mutex> lock(session->sshMutex);
                    c_rc = libssh2_sftp_close(handle);
                }
                if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                Sleep(5);
            }
            globalProgressManager.SetProgress(downloadId, transferred, totalBytes, true, "Read failed");
            return;
        }
        if (readBytes == 0) break;
        
        fileData.append(buffer, readBytes);
        transferred += readBytes;
        globalProgressManager.SetProgress(downloadId, transferred, totalBytes);
        Sleep(1);
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    
    if (globalProgressManager.IsCancelled(downloadId)) {
        globalProgressManager.SetProgress(downloadId, transferred, totalBytes, true, "Cancelled");
    } else {
        std::string b64 = Base64Encode(fileData);
        globalProgressManager.SetCompletedWithContent(downloadId, transferred, totalBytes, b64);
    }
}

void DownloadToPathThread(std::shared_ptr<SSHSession> session, std::string remotePath, std::wstring localPath, std::string downloadId) {
    std::string sftpError;
    if (!session->EnsureSftpSession(sftpError)) {
        globalProgressManager.SetProgress(downloadId, 0, 0, true, sftpError);
        return;
    }

    std::ofstream localFile(localPath, std::ios::binary);
    if (!localFile.is_open()) {
        globalProgressManager.SetProgress(downloadId, 0, 0, true, "Failed to open local file for writing");
        return;
    }
    
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    LIBSSH2_SFTP_ATTRIBUTES attrs;
    long long totalBytes = 0;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            handle = libssh2_sftp_open(session->sftpSession, remotePath.c_str(), LIBSSH2_FXF_READ, 0);
            if (handle) {
                if (libssh2_sftp_stat(session->sftpSession, remotePath.c_str(), &attrs) == 0) {
                    totalBytes = (attrs.flags & LIBSSH2_SFTP_ATTR_SIZE) ? attrs.filesize : 0;
                }
                break;
            }
            int err = libssh2_session_last_errno(session->sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                localFile.close();
                globalProgressManager.SetProgress(downloadId, 0, 0, true, "Failed to open remote file");
                return;
            }
        }
        Sleep(5);
    }
    
    globalProgressManager.SetProgress(downloadId, 0, totalBytes);
    
    const int chunkSize = 32768;
    char buffer[chunkSize];
    long long transferred = 0;
    
    while (true) {
        if (globalProgressManager.IsCancelled(downloadId)) {
            break;
        }
        
        int readBytes = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            readBytes = libssh2_sftp_read(handle, buffer, chunkSize);
        }
        
        if (readBytes < 0) {
            if (readBytes == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            while (true) {
                int c_rc = 0;
                {
                    std::lock_guard<std::mutex> lock(session->sshMutex);
                    c_rc = libssh2_sftp_close(handle);
                }
                if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                Sleep(5);
            }
            localFile.close();
            globalProgressManager.SetProgress(downloadId, transferred, totalBytes, true, "Read failed");
            return;
        }
        if (readBytes == 0) break;
        
        localFile.write(buffer, readBytes);
        transferred += readBytes;
        globalProgressManager.SetProgress(downloadId, transferred, totalBytes);
        Sleep(1);
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    localFile.close();
    
    if (globalProgressManager.IsCancelled(downloadId)) {
        globalProgressManager.SetProgress(downloadId, transferred, totalBytes, true, "Cancelled");
    } else {
        globalProgressManager.SetProgress(downloadId, transferred, totalBytes, true);
    }
}
