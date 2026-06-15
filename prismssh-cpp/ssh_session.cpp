#define WIN32_LEAN_AND_MEAN
#define _WINSOCK_DEPRECATED_NO_WARNINGS
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

extern HWND hWnd;
#define WM_POST_WEB_MESSAGE (WM_USER + 101)
#include <thread>
#include <chrono>
#include <algorithm>
#include <sstream>
#include <fstream>
#include <nlohmann/json.hpp>
#include "ssh_session.h"
#include "common_utils.h"
#include "crypto_utils.h"
#include "sftp_pipeline.hpp"

#pragma comment(lib, "ws2_32.lib")

// Static thread worker forward declarations
struct LocalListenerArgs {
    std::shared_ptr<SSHSession> session;
    std::shared_ptr<PortForwardInfo> pfInfo;
};

struct RemoteListenerArgs {
    std::shared_ptr<SSHSession> session;
    std::shared_ptr<PortForwardInfo> pfInfo;
};

struct DynamicListenerArgs {
    std::shared_ptr<SSHSession> session;
    std::shared_ptr<PortForwardInfo> pfInfo;
};

struct JumpTunnelArgs {
    SOCKET listenSock;
    LIBSSH2_SESSION* jumpSshSession;
    std::string targetHost;
    int targetPort;
};

static void SockToChannelPump(SOCKET sock, LIBSSH2_CHANNEL* channel, bool* active) {
    char buf[16384];
    while (*active) {
        int nRecv = recv(sock, buf, sizeof(buf), 0);
        if (nRecv <= 0) {
            break;
        }
        int totalSent = 0;
        while (totalSent < nRecv && *active) {
            int nSent = libssh2_channel_write(channel, buf + totalSent, nRecv - totalSent);
            if (nSent < 0) {
                if (nSent == LIBSSH2_ERROR_EAGAIN) {
                    Sleep(5);
                    continue;
                }
                break;
            }
            totalSent += nSent;
        }
    }
    *active = false;
}

static void ChannelToSockPump(LIBSSH2_CHANNEL* channel, SOCKET sock, bool* active) {
    char buf[16384];
    while (*active) {
        int nRead = libssh2_channel_read(channel, buf, sizeof(buf));
        if (nRead < 0) {
            if (nRead == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            break;
        }
        if (nRead == 0) {
            break;
        }
        int totalSent = 0;
        while (totalSent < nRead && *active) {
            int nSent = send(sock, buf + totalSent, nRead - totalSent, 0);
            if (nSent <= 0) {
                break;
            }
            totalSent += nSent;
        }
    }
    *active = false;
}

static DWORD WINAPI JumpTunnelListenerThread(LPVOID param) {
    std::unique_ptr<JumpTunnelArgs> args((JumpTunnelArgs*)param);
    
    SOCKET clientSock = accept(args->listenSock, NULL, NULL);
    if (clientSock == INVALID_SOCKET) {
        return 0;
    }
    
    LIBSSH2_CHANNEL* jumpChannel = libssh2_channel_direct_tcpip(
        args->jumpSshSession, 
        args->targetHost.c_str(), 
        args->targetPort, 
        "127.0.0.1", 
        0
    );
    
    if (!jumpChannel) {
        closesocket(clientSock);
        return 0;
    }
    
    bool tunnelActive = true;
    std::thread t1(SockToChannelPump, clientSock, jumpChannel, &tunnelActive);
    std::thread t2(ChannelToSockPump, jumpChannel, clientSock, &tunnelActive);
    
    if (t1.joinable()) t1.join();
    if (t2.joinable()) t2.join();
    
    libssh2_channel_free(jumpChannel);
    closesocket(clientSock);
    return 0;
}

static DWORD WINAPI LocalForwardListenerThread(LPVOID param);
static DWORD WINAPI RemoteForwardListenerThread(LPVOID param);
static DWORD WINAPI DynamicForwardListenerThread(LPVOID param);

// Define globalSessionManager instance
SessionManager globalSessionManager;

// SSHSession constructor / destructor
SSHSession::SSHSession(const std::string& id) : sessionId(id) {}

SSHSession::~SSHSession() {
    Disconnect();
}

// Session virtual interfaces implementation
bool SSHSession::SendInput(const std::string& data) {
    if (!running || !sshChannel) return false;
    std::lock_guard<std::mutex> lock(sshMutex);
    int written = 0;
    int totalWritten = 0;
    int size = (int)data.size();
    while (totalWritten < size && running) {
        written = libssh2_channel_write(sshChannel, data.data() + totalWritten, size - totalWritten);
        if (written < 0) {
            if (written == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            return false;
        }
        totalWritten += written;
    }
    return true;
}

std::string SSHSession::GetOutput() {
    std::lock_guard<std::mutex> lock(bufferMutex);
    if (outputBuffer.empty()) return "";
    const size_t maxChunk = 65536;
    if (outputBuffer.size() <= maxChunk) {
        std::string out = outputBuffer;
        outputBuffer.clear();
        return out;
    } else {
        std::string out = outputBuffer.substr(0, maxChunk);
        outputBuffer = outputBuffer.substr(maxChunk);
        return out;
    }
}

void SSHSession::Resize(int cols, int rows) {
    if (running && sshChannel) {
        std::lock_guard<std::mutex> lock(sshMutex);
        libssh2_channel_request_pty_size(sshChannel, cols, rows);
    }
}

void SSHSession::Disconnect() {
    if (!running) return;
    running = false;

    // Stop all port forwards
    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        for (auto& pair : portForwards) {
            auto pf = pair.second;
            pf->active = false;
            if (pf->serverSocket != INVALID_SOCKET) {
                closesocket(pf->serverSocket);
            }
        }
    }
    
    // Wait for port forwarding listener threads to exit
    {
        std::vector<HANDLE> threadsToWait;
        {
            std::lock_guard<std::mutex> lock(forwardMutex);
            for (auto& pair : portForwards) {
                if (pair.second->hThread) {
                    threadsToWait.push_back(pair.second->hThread);
                }
            }
        }
        for (HANDLE h : threadsToWait) {
            WaitForSingleObject(h, 200);
            CloseHandle(h);
        }
        std::lock_guard<std::mutex> lock(forwardMutex);
        portForwards.clear();
    }

    {
        std::lock_guard<std::mutex> lock(sshMutex);
        if (sftpSession) {
            libssh2_sftp_shutdown(sftpSession);
            sftpSession = NULL;
        }

        if (sshChannel) {
            libssh2_channel_send_eof(sshChannel);
            libssh2_channel_close(sshChannel);
            libssh2_channel_free(sshChannel);
            sshChannel = NULL;
        }

        if (sshSession) {
            libssh2_session_disconnect(sshSession, "Normal Shutdown");
            libssh2_session_free(sshSession);
            sshSession = NULL;
        }
    }

    if (sock != INVALID_SOCKET) {
        closesocket(sock);
        sock = INVALID_SOCKET;
    }

    if (hReadThread) {
        WaitForSingleObject(hReadThread, INFINITE);
        CloseHandle(hReadThread);
        hReadThread = NULL;
    }

    // 关闭并清理堡垒机第一跳的资源
    if (jumpListenSock != INVALID_SOCKET) {
        closesocket(jumpListenSock);
        jumpListenSock = INVALID_SOCKET;
    }
    if (hJumpThread) {
        WaitForSingleObject(hJumpThread, 500);
        CloseHandle(hJumpThread);
        hJumpThread = NULL;
    }
    if (jumpSshSession) {
        libssh2_session_disconnect(jumpSshSession, "Jump Host Shutdown");
        libssh2_session_free(jumpSshSession);
        jumpSshSession = NULL;
    }
    if (jumpSock != INVALID_SOCKET) {
        closesocket(jumpSock);
        jumpSock = INVALID_SOCKET;
    }
}

bool SSHSession::IsConnected() {
    return running;
}

// Connect options implementation
bool SSHSession::Connect(const std::string& hostname, int port, const std::string& username, const std::string& password, const std::string& keyPath, const std::string& keyPassphrase, int cols, int rows, const JumpHostConfig& jumpConfig) {
    lastError = "";
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        lastError = "WSAStartup failed";
        return false;
    }

    bool hasJump = !jumpConfig.jumpHost.empty();
    int connectPort = port;
    std::string connectHost = hostname;

    if (hasJump) {
        PrismLog("INFO", "SSHSession connecting via Jump Host: " + jumpConfig.jumpHost);
        
        // 1. 建立与堡垒机的第一跳 TCP 连接
        jumpSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (jumpSock == INVALID_SOCKET) {
            lastError = "Failed to create jump socket";
            return false;
        }
        
        struct addrinfo hints = { 0 }, *jumpAddrs = NULL;
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_STREAM;
        hints.ai_protocol = IPPROTO_TCP;
        std::string jumpPortStr = std::to_string(jumpConfig.jumpPort);
        if (getaddrinfo(jumpConfig.jumpHost.c_str(), jumpPortStr.c_str(), &hints, &jumpAddrs) != 0) {
            closesocket(jumpSock);
            jumpSock = INVALID_SOCKET;
            lastError = "getaddrinfo failed for jump host: " + jumpConfig.jumpHost;
            return false;
        }
        
        bool jumpConnected = false;
        for (struct addrinfo* addr = jumpAddrs; addr != NULL; addr = addr->ai_next) {
            if (connect(jumpSock, addr->ai_addr, (int)addr->ai_addrlen) == 0) {
                jumpConnected = true;
                break;
            }
        }
        freeaddrinfo(jumpAddrs);
        
        if (!jumpConnected) {
            closesocket(jumpSock);
            jumpSock = INVALID_SOCKET;
            lastError = "Failed to connect to jump host: " + jumpConfig.jumpHost;
            return false;
        }
        
        // 2. 第一跳 SSH 握手与鉴权
        jumpSshSession = libssh2_session_init();
        if (!jumpSshSession) {
            closesocket(jumpSock);
            jumpSock = INVALID_SOCKET;
            lastError = "Failed to init jump ssh session";
            return false;
        }
        
        int jumpHandshake = libssh2_session_handshake(jumpSshSession, jumpSock);
        if (jumpHandshake != 0) {
            libssh2_session_free(jumpSshSession);
            jumpSshSession = NULL;
            closesocket(jumpSock);
            jumpSock = INVALID_SOCKET;
            lastError = "Jump host SSH handshake failed";
            return false;
        }
        
        int jumpAuth = -1;
        if (!jumpConfig.jumpKey.empty()) {
            std::string localKeyPath = Utf8ToLocalAnsi(jumpConfig.jumpKey);
            jumpAuth = libssh2_userauth_publickey_fromfile(
                jumpSshSession,
                jumpConfig.jumpUser.c_str(),
                NULL,
                localKeyPath.c_str(),
                jumpConfig.jumpKeyPassphrase.empty() ? NULL : jumpConfig.jumpKeyPassphrase.c_str()
            );
        } else {
            jumpAuth = libssh2_userauth_password(jumpSshSession, jumpConfig.jumpUser.c_str(), jumpConfig.jumpPass.c_str());
        }
        
        if (jumpAuth != 0) {
            char* err_msg = NULL;
            int err_len = 0;
            libssh2_session_last_error(jumpSshSession, &err_msg, &err_len, 0);
            lastError = "Jump host auth failed: " + (err_msg ? std::string(err_msg, err_len) : "unknown");
            libssh2_session_free(jumpSshSession);
            jumpSshSession = NULL;
            closesocket(jumpSock);
            jumpSock = INVALID_SOCKET;
            return false;
        }
        
        // 3. 开启本地环回代理端口监听
        jumpListenSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        struct sockaddr_in listenAddr = { 0 };
        listenAddr.sin_family = AF_INET;
        listenAddr.sin_addr.s_addr = inet_addr("127.0.0.1");
        listenAddr.sin_port = 0; // 随机端口
        
        if (bind(jumpListenSock, (struct sockaddr*)&listenAddr, sizeof(listenAddr)) != 0) {
            closesocket(jumpListenSock);
            jumpListenSock = INVALID_SOCKET;
            libssh2_session_disconnect(jumpSshSession, "Bind Failed");
            libssh2_session_free(jumpSshSession);
            jumpSshSession = NULL;
            closesocket(jumpSock);
            jumpSock = INVALID_SOCKET;
            lastError = "Jump host tunnel bind failed";
            return false;
        }
        listen(jumpListenSock, 1);
        
        int len = sizeof(listenAddr);
        getsockname(jumpListenSock, (struct sockaddr*)&listenAddr, &len);
        int localListenPort = ntohs(listenAddr.sin_port);
        
        // 4. 启动后台中转线程
        JumpTunnelArgs* args = new JumpTunnelArgs();
        args->listenSock = jumpListenSock;
        args->jumpSshSession = jumpSshSession;
        args->targetHost = hostname;
        args->targetPort = port;
        
        hJumpThread = CreateThread(NULL, 0, JumpTunnelListenerThread, args, 0, NULL);
        
        // 5. 让第二跳的握手目标直接指向本地随机监听端口！
        connectHost = "127.0.0.1";
        connectPort = localListenPort;
    }

    struct addrinfo hints = { 0 }, *addrs = NULL;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    std::string portStr = std::to_string(connectPort);
    int gai_res = getaddrinfo(connectHost.c_str(), portStr.c_str(), &hints, &addrs);
    if (gai_res != 0) {
        lastError = "getaddrinfo failed for " + connectHost + ":" + portStr + " (error: " + std::to_string(gai_res) + ")";
        return false;
    }

    int connect_err = 0;
    for (struct addrinfo* addr = addrs; addr != NULL; addr = addr->ai_next) {
        sock = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
        if (sock == INVALID_SOCKET) continue;

        if (connect(sock, addr->ai_addr, (int)addr->ai_addrlen) == 0) {
            break;
        }
        connect_err = WSAGetLastError();
        closesocket(sock);
        sock = INVALID_SOCKET;
    }
    freeaddrinfo(addrs);

    if (sock == INVALID_SOCKET) {
        lastError = "socket connect failed (WSAGetLastError: " + std::to_string(connect_err) + ")";
        return false;
    }

    int bufSize = 256 * 1024;
    setsockopt(sock, SOL_SOCKET, SO_RCVBUF, (char*)&bufSize, sizeof(bufSize));
    setsockopt(sock, SOL_SOCKET, SO_SNDBUF, (char*)&bufSize, sizeof(bufSize));
    BOOL noDelay = TRUE;
    setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, (char*)&noDelay, sizeof(noDelay));

    sshSession = libssh2_session_init();
    if (!sshSession) {
        closesocket(sock);
        sock = INVALID_SOCKET;
        lastError = "libssh2_session_init failed";
        return false;
    }

    int handshake_res = libssh2_session_handshake(sshSession, sock);
    if (handshake_res != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        lastError = "libssh2 handshake failed (code: " + std::to_string(handshake_res) + ", detail: " + detail + ")";
        libssh2_session_free(sshSession);
        sshSession = NULL;
        closesocket(sock);
        sock = INVALID_SOCKET;
        return false;
    }

    int auth_res = -1;
    if (!keyPath.empty()) {
        std::string localKeyPath = Utf8ToLocalAnsi(keyPath);
        auth_res = libssh2_userauth_publickey_fromfile(
            sshSession, 
            username.c_str(), 
            NULL, 
            localKeyPath.c_str(), 
            keyPassphrase.empty() ? NULL : keyPassphrase.c_str()
        );
    } else {
        auth_res = libssh2_userauth_password(sshSession, username.c_str(), password.c_str());
    }
    if (auth_res != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        lastError = "SSH auth failed (code: " + std::to_string(auth_res) + ", detail: " + detail + ")";
        libssh2_session_free(sshSession);
        sshSession = NULL;
        closesocket(sock);
        sock = INVALID_SOCKET;
        return false;
    }

    sshChannel = libssh2_channel_open_session(sshSession);
    if (!sshChannel) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        lastError = "libssh2 open session channel failed (detail: " + detail + ")";
        libssh2_session_free(sshSession);
        sshSession = NULL;
        closesocket(sock);
        sock = INVALID_SOCKET;
        return false;
    }

    int pty_res = libssh2_channel_request_pty(sshChannel, "xterm-256color");
    if (pty_res != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        lastError = "libssh2 request pty failed (code: " + std::to_string(pty_res) + ", detail: " + detail + ")";
        libssh2_channel_free(sshChannel);
        sshChannel = NULL;
        libssh2_session_free(sshSession);
        sshSession = NULL;
        closesocket(sock);
        sock = INVALID_SOCKET;
        return false;
    }

    int shell_res = libssh2_channel_shell(sshChannel);
    if (shell_res != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        lastError = "libssh2 shell request failed (code: " + std::to_string(shell_res) + ", detail: " + detail + ")";
        libssh2_channel_free(sshChannel);
        sshChannel = NULL;
        libssh2_session_free(sshSession);
        sshSession = NULL;
        closesocket(sock);
        sock = INVALID_SOCKET;
        return false;
    }

    libssh2_channel_request_pty_size(sshChannel, cols, rows);
    sftpSession = libssh2_sftp_init(sshSession);
    libssh2_session_set_blocking(sshSession, 0);

    // Configure keepalive: send keepalive every 10 seconds, timeout after 3 failed attempts
    libssh2_keepalive_config(sshSession, 1, 10);

    running = true;
    hReadThread = CreateThread(NULL, 0, StaticReadThread, this, 0, NULL);

    return true;
}

// SFTP operations implementation
std::string SSHSession::ListFiles(const std::string& path) {
    return ListDirectory(path);
}

std::string SSHSession::DownloadFileContent(const std::string& path) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            handle = libssh2_sftp_open(sftpSession, path.c_str(), LIBSSH2_FXF_READ, 0);
            if (handle) break;
            int err = libssh2_session_last_errno(sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                char *err_msg = NULL;
                int err_msg_len = 0;
                libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
                std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
                return "{\"success\":false,\"error\":\"open failed: " + detail + "\"}";
            }
        }
        Sleep(5);
    }

    std::string fileData;
    char buffer[16384];
    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_read(handle, buffer, sizeof(buffer));
        }
        if (rc < 0) {
            if (rc == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            while (true) {
                int c_rc = 0;
                {
                    std::lock_guard<std::mutex> lock(sshMutex);
                    c_rc = libssh2_sftp_close(handle);
                }
                if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                Sleep(5);
            }
            return "{\"success\":false,\"error\":\"read failed\"}";
        }
        if (rc == 0) break;
        fileData.append(buffer, rc);
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }

    nlohmann::json response;
    response["success"] = true;
    response["content"] = Base64Encode(fileData);
    return response.dump();
}

std::string SSHSession::UploadFileContent(const std::string& base64Content, const std::string& path) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            handle = libssh2_sftp_open(sftpSession, path.c_str(), LIBSSH2_FXF_WRITE | LIBSSH2_FXF_CREAT | LIBSSH2_FXF_TRUNC, 0644);
            if (handle) break;
            int err = libssh2_session_last_errno(sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                char *err_msg = NULL;
                int err_msg_len = 0;
                libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
                std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
                return "{\"success\":false,\"error\":\"open failed: " + detail + "\"}";
            }
        }
        Sleep(5);
    }

    std::string fileData = Base64Decode(base64Content);
    int size = (int)fileData.size();
    int totalWritten = 0;
    while (totalWritten < size) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_write(handle, fileData.data() + totalWritten, size - totalWritten);
        }
        if (rc < 0) {
            if (rc == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            while (true) {
                int c_rc = 0;
                {
                    std::lock_guard<std::mutex> lock(sshMutex);
                    c_rc = libssh2_sftp_close(handle);
                }
                if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                Sleep(5);
            }
            return "{\"success\":false,\"error\":\"write failed\"}";
        }
        totalWritten += rc;
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    return "{\"success\":true}";
}

std::string SSHSession::CreateFolder(const std::string& remotePath) {
    return CreateDirectory(remotePath);
}

std::string SSHSession::DeleteFileOrFolder(const std::string& remotePath) {
    std::string res = DeleteFile(remotePath);
    try {
        auto j = nlohmann::json::parse(res);
        if (j.value("success", false)) return res;
    } catch(...) {}
    return DeleteDirectory(remotePath);
}

std::string SSHSession::RenameFileOrFolder(const std::string& oldPath, const std::string& newPath) {
    return RenameFile(oldPath, newPath);
}

// Windows static read thread implementation
DWORD WINAPI SSHSession::StaticReadThread(LPVOID param) {
    SSHSession* self = (SSHSession*)param;
    self->ReadLoop();
    return 0;
}

void SSHSession::ReadLoop() {
    char buffer[16384];
    auto lastKeepalive = std::chrono::steady_clock::now();
    while (running && sshChannel) {
        fd_set fd;
        FD_ZERO(&fd);
        FD_SET(sock, &fd);
        timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 50000;
        int select_res = select(0, &fd, NULL, NULL, &tv);
        if (select_res > 0) {
            std::lock_guard<std::mutex> lock(sshMutex);
            if (!running || !sshChannel) {
                break;
            }
            int readBytes = libssh2_channel_read(sshChannel, buffer, sizeof(buffer) - 1);
            if (readBytes > 0) {
                std::string accum(buffer, readBytes);
                
                while (accum.size() < 65536) {
                    int readNow = libssh2_channel_read(sshChannel, buffer, sizeof(buffer) - 1);
                    if (readNow > 0) {
                        accum.append(buffer, readNow);
                    } else {
                        break;
                    }
                }

                nlohmann::json pushMsg;
                pushMsg["action"] = "push_output";
                pushMsg["sessionId"] = sessionId;
                pushMsg["data"] = Base64Encode(accum);
                
                if (hWnd != NULL) {
                    std::wstring* pStr = new std::wstring(Utf8ToUtf16(pushMsg.dump()));
                    if (!PostMessageW(hWnd, WM_POST_WEB_MESSAGE, 0, (LPARAM)pStr)) {
                        delete pStr;
                    }
                }
            } else if (readBytes <= 0 && readBytes != LIBSSH2_ERROR_EAGAIN) {
                nlohmann::json pushMsg;
                pushMsg["action"] = "push_output";
                pushMsg["sessionId"] = sessionId;
                pushMsg["data"] = Base64Encode("\r\n[SSH Connection closed]\r\n");
                
                if (hWnd != NULL) {
                    std::wstring* pStr = new std::wstring(Utf8ToUtf16(pushMsg.dump()));
                    if (!PostMessageW(hWnd, WM_POST_WEB_MESSAGE, 0, (LPARAM)pStr)) {
                        delete pStr;
                    }
                }
                running = false;
                break;
            }
        } else if (select_res < 0) {
            running = false;
            break;
        }

        // Periodically send keepalive every 10 seconds
        auto now = std::chrono::steady_clock::now();
        if (std::chrono::duration_cast<std::chrono::seconds>(now - lastKeepalive).count() >= 10) {
            std::lock_guard<std::mutex> lock(sshMutex);
            if (sshSession && running) {
                int seconds_to_next = 0;
                libssh2_keepalive_send(sshSession, &seconds_to_next);
            }
            lastKeepalive = now;
        }
    }
}

// Inner SFTP operations helper implementations
std::string SSHSession::ListDirectory(const std::string& path) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            handle = libssh2_sftp_opendir(sftpSession, path.c_str());
            if (handle) break;
            int err = libssh2_session_last_errno(sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                char *err_msg = NULL;
                int err_msg_len = 0;
                libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
                std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
                return "{\"success\":false,\"error\":\"opendir failed: " + detail + "\"}";
            }
        }
        Sleep(5);
    }

    nlohmann::json filesList = nlohmann::json::array();
    char mem[512];
    LIBSSH2_SFTP_ATTRIBUTES attrs;
    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_readdir(handle, mem, sizeof(mem) - 1, &attrs);
        }
        if (rc == LIBSSH2_ERROR_EAGAIN) {
            Sleep(5);
            continue;
        }
        if (rc <= 0) break;

        mem[rc] = '\0';
        std::string name(mem);
        if (name == "." || name == "..") continue;

        nlohmann::json item;
        item["name"] = name;
        if (attrs.flags & LIBSSH2_SFTP_ATTR_SIZE) {
            item["size"] = attrs.filesize;
            item["raw_size"] = attrs.filesize;
            double sz = (double)attrs.filesize;
            char szBuf[64];
            if (sz < 1024) sprintf_s(szBuf, "%.0f B", sz);
            else if (sz < 1024 * 1024) sprintf_s(szBuf, "%.1f KB", sz / 1024);
            else if (sz < 1024 * 1024 * 1024) sprintf_s(szBuf, "%.1f MB", sz / (1024 * 1024));
            else sprintf_s(szBuf, "%.1f GB", sz / (1024 * 1024 * 1024));
            item["size"] = std::string(szBuf);
        } else {
            item["size"] = "0 B";
            item["raw_size"] = 0;
        }

        bool isDir = false;
        if (attrs.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS) {
            item["permissions"] = attrs.permissions;
            if (LIBSSH2_SFTP_S_ISDIR(attrs.permissions)) {
                isDir = true;
            }
        }
        item["type"] = isDir ? "directory" : "file";

        if (attrs.flags & LIBSSH2_SFTP_ATTR_ACMODTIME) {
            item["mtime"] = attrs.mtime;
            time_t t = attrs.mtime;
            struct tm tm_info;
            if (localtime_s(&tm_info, &t) == 0) {
                char timeBuf[64];
                strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", &tm_info);
                item["date"] = std::string(timeBuf);
            } else {
                item["date"] = "";
            }
        } else {
            item["mtime"] = 0;
            item["date"] = "";
        }
        filesList.push_back(item);
    }

    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_closedir(handle);
        }
        if (rc == LIBSSH2_ERROR_EAGAIN) {
            Sleep(5);
            continue;
        }
        break;
    }

    nlohmann::json response;
    response["success"] = true;
    response["files"] = filesList;
    return response.dump();
}

std::string SSHSession::CreateDirectory(const std::string& path) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    int rc = 0;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_mkdir(sftpSession, path.c_str(), LIBSSH2_SFTP_S_IRWXU | LIBSSH2_SFTP_S_IRGRP | LIBSSH2_SFTP_S_IXGRP | LIBSSH2_SFTP_S_IROTH | LIBSSH2_SFTP_S_IXOTH);
            if (rc != LIBSSH2_ERROR_EAGAIN) break;
        }
        Sleep(5);
    }
    if (rc != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        return "{\"success\":false,\"error\":\"mkdir failed: " + detail + "\"}";
    }
    return "{\"success\":true}";
}

std::string SSHSession::DeleteFile(const std::string& path) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    int rc = 0;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_unlink(sftpSession, path.c_str());
            if (rc != LIBSSH2_ERROR_EAGAIN) break;
        }
        Sleep(5);
    }
    if (rc != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        return "{\"success\":false,\"error\":\"unlink failed: " + detail + "\"}";
    }
    return "{\"success\":true}";
}

std::string SSHSession::DeleteDirectory(const std::string& path) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    int rc = 0;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_rmdir(sftpSession, path.c_str());
            if (rc != LIBSSH2_ERROR_EAGAIN) break;
        }
        Sleep(5);
    }
    if (rc != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        return "{\"success\":false,\"error\":\"rmdir failed: " + detail + "\"}";
    }
    return "{\"success\":true}";
}

std::string SSHSession::RenameFile(const std::string& oldPath, const std::string& newPath) {
    if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
    int rc = 0;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_rename(sftpSession, oldPath.c_str(), newPath.c_str());
            if (rc != LIBSSH2_ERROR_EAGAIN) break;
        }
        Sleep(5);
    }
    if (rc != 0) {
        char *err_msg = NULL;
        int err_msg_len = 0;
        libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
        std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
        return "{\"success\":false,\"error\":\"rename failed: " + detail + "\"}";
    }
    return "{\"success\":true}";
}

// Helper commands runner
std::string SSHSession::ExecuteCommand(const std::string& command) {
    if (!running || !sshSession) return "";
    
    LIBSSH2_CHANNEL* channel = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            channel = libssh2_channel_open_session(sshSession);
            if (channel) break;
            int err = libssh2_session_last_errno(sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                return "";
            }
        }
        Sleep(5);
    }
    
    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_channel_exec(channel, command.c_str());
        }
        if (rc == 0) break;
        if (rc != LIBSSH2_ERROR_EAGAIN) {
            while (true) {
                int c_rc = 0;
                {
                    std::lock_guard<std::mutex> lock(sshMutex);
                    c_rc = libssh2_channel_free(channel);
                }
                if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
                Sleep(5);
            }
            return "";
        }
        Sleep(5);
    }
    
    std::string output;
    char buffer[2048];
    while (true) {
        int readBytes = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            readBytes = libssh2_channel_read(channel, buffer, sizeof(buffer) - 1);
        }
        if (readBytes > 0) {
            output.append(buffer, readBytes);
        } else if (readBytes < 0) {
            if (readBytes == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            break;
        } else {
            break;
        }
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            c_rc = libssh2_channel_free(channel);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    
    return output;
}

std::string SSHSession::DetectOS() {
    if (!osType.empty()) return osType;
    std::string result = ExecuteCommand("echo %OS%");
    if (result.find("Windows") != std::string::npos) {
        osType = "windows";
        return osType;
    }
    result = ExecuteCommand("uname -s");
    if (!result.empty()) {
        osType = "linux";
        return osType;
    }
    osType = "unknown";
    return osType;
}

// System Monitoring metrics implementation
std::string SSHSession::GetSystemInfo() {
    std::string os = DetectOS();
    nlohmann::json info = nlohmann::json::object();
    if (os == "windows") {
        std::string os_info = ExecuteCommand("systeminfo | findstr /B /C:\"OS Name\" /C:\"OS Version\" /C:\"System Type\"");
        auto lines = SplitString(os_info, '\n');
        for (auto& line : lines) {
            line = TrimString(line);
            if (line.find("OS Name") != std::string::npos) {
                size_t pos = line.find(':');
                if (pos != std::string::npos) info["os_name"] = TrimString(line.substr(pos + 1));
            } else if (line.find("OS Version") != std::string::npos) {
                size_t pos = line.find(':');
                if (pos != std::string::npos) info["os_version"] = TrimString(line.substr(pos + 1));
            } else if (line.find("System Type") != std::string::npos) {
                size_t pos = line.find(':');
                if (pos != std::string::npos) info["architecture"] = TrimString(line.substr(pos + 1));
            }
        }
        std::string hostname = TrimString(ExecuteCommand("hostname"));
        info["hostname"] = hostname;

        std::string uptime = ExecuteCommand("systeminfo | findstr /B /C:\"System Boot Time\"");
        if (!uptime.empty()) {
            size_t pos = uptime.find(':');
            if (pos != std::string::npos) info["uptime"] = TrimString(uptime.substr(pos + 1));
        }

        std::string cpu_info = ExecuteCommand("wmic cpu get name /value");
        auto cpu_lines = SplitString(cpu_info, '\n');
        for (auto& line : cpu_lines) {
            line = TrimString(line);
            if (line.rfind("Name=", 0) == 0) {
                info["cpu"] = TrimString(line.substr(5));
                break;
            }
        }

        std::string mem_info = ExecuteCommand("systeminfo | findstr /B /C:\"Total Physical Memory\"");
        if (!mem_info.empty()) {
            size_t pos = mem_info.find(':');
            if (pos != std::string::npos) info["total_memory"] = TrimString(mem_info.substr(pos + 1));
        }
    } else if (os == "linux") {
        std::string os_release = ExecuteCommand("cat /etc/os-release");
        if (!os_release.empty()) {
            auto lines = SplitString(os_release, '\n');
            for (auto& line : lines) {
                line = TrimString(line);
                if (line.rfind("PRETTY_NAME=", 0) == 0) {
                    std::string val = line.substr(12);
                    if (!val.empty() && val.front() == '"') val = val.substr(1, val.size() - 2);
                    info["os_name"] = val;
                } else if (line.rfind("VERSION=", 0) == 0) {
                    std::string val = line.substr(8);
                    if (!val.empty() && val.front() == '"') val = val.substr(1, val.size() - 2);
                    info["os_version"] = val;
                }
            }
        } else {
            info["os_name"] = TrimString(ExecuteCommand("uname -s"));
            info["os_version"] = TrimString(ExecuteCommand("uname -r"));
        }

        info["hostname"] = TrimString(ExecuteCommand("hostname"));
        info["architecture"] = TrimString(ExecuteCommand("uname -m"));

        std::string uptime = TrimString(ExecuteCommand("uptime -s"));
        if (!uptime.empty()) {
            info["uptime"] = "Since " + uptime;
        }

        std::string cpu_info = ExecuteCommand("cat /proc/cpuinfo | grep \"model name\" | head -1");
        if (!cpu_info.empty()) {
            size_t pos = cpu_info.find(':');
            if (pos != std::string::npos) info["cpu"] = TrimString(cpu_info.substr(pos + 1));
        }

        std::string mem_info = ExecuteCommand("cat /proc/meminfo | grep MemTotal");
        if (!mem_info.empty()) {
            size_t pos = mem_info.find(':');
            if (pos != std::string::npos) info["total_memory"] = TrimString(mem_info.substr(pos + 1));
        }
    } else {
        info["error"] = "Unknown operating system";
    }
    return info.dump();
}

std::string SSHSession::GetSystemStats() {
    std::string os = DetectOS();
    nlohmann::json stats = nlohmann::json::object();
    if (os == "windows") {
        std::string cpu_usage = ExecuteCommand("wmic cpu get loadpercentage /value");
        auto lines = SplitString(cpu_usage, '\n');
        for (auto& line : lines) {
            line = TrimString(line);
            if (line.rfind("LoadPercentage=", 0) == 0) {
                stats["cpu_usage"] = TrimString(line.substr(15)) + "%";
                break;
            }
        }

        std::string mem_total = ExecuteCommand("wmic OS get TotalVisibleMemorySize /value");
        std::string mem_free = ExecuteCommand("wmic OS get FreePhysicalMemory /value");
        long long total_kb = 0;
        long long free_kb = 0;
        auto total_lines = SplitString(mem_total, '\n');
        for (auto& line : total_lines) {
            line = TrimString(line);
            if (line.rfind("TotalVisibleMemorySize=", 0) == 0) {
                try { total_kb = std::stoll(line.substr(23)); } catch (...) {}
                break;
            }
        }
        auto free_lines = SplitString(mem_free, '\n');
        for (auto& line : free_lines) {
            line = TrimString(line);
            if (line.rfind("FreePhysicalMemory=", 0) == 0) {
                try { free_kb = std::stoll(line.substr(19)); } catch (...) {}
                break;
            }
        }
        if (total_kb > 0) {
            long long used_kb = total_kb - free_kb;
            double usage_percent = (double)used_kb / total_kb * 100.0;
            char buf[64];
            sprintf_s(buf, "%.1f%%", usage_percent);
            stats["memory_usage"] = buf;
            stats["memory_used"] = std::to_string(used_kb / 1024) + " MB";
            stats["memory_total"] = std::to_string(total_kb / 1024) + " MB";
        }

        std::string disk_info = ExecuteCommand("wmic logicaldisk where size!=0 get size,freespace,caption");
        auto disk_lines = SplitString(disk_info, '\n');
        for (auto& line : disk_lines) {
            line = TrimString(line);
            auto parts = SplitStringWhitespace(line);
            if (parts.size() >= 3 && parts[0].find("C:") != std::string::npos) {
                try {
                    long long free_space = std::stoll(parts[1]);
                    long long size = std::stoll(parts[2]);
                    long long used_space = size - free_space;
                    double usage_percent = (double)used_space / size * 100.0;
                    char buf[64];
                    sprintf_s(buf, "%.1f%%", usage_percent);
                    stats["disk_usage"] = buf;
                    
                    sprintf_s(buf, "%.1f GB", (double)used_space / (1024.0 * 1024.0 * 1024.0));
                    stats["disk_used"] = buf;
                    sprintf_s(buf, "%.1f GB", (double)size / (1024.0 * 1024.0 * 1024.0));
                    stats["disk_total"] = buf;
                } catch (...) {}
                break;
            }
        }
    } else if (os == "linux") {
        std::string cpu_info = ExecuteCommand("cat /proc/stat | grep \"cpu \" | head -1");
        if (!cpu_info.empty()) {
            auto parts = SplitStringWhitespace(cpu_info);
            if (parts.size() >= 8) {
                try {
                    long long idle = std::stoll(parts[4]);
                    long long total = 0;
                    for (size_t i = 1; i < 8 && i < parts.size(); ++i) {
                        total += std::stoll(parts[i]);
                    }
                    
                    double usage = 0.0;
                    if (lastCpuTotal > 0 && total > lastCpuTotal) {
                        long long diff_idle = idle - lastCpuIdle;
                        long long diff_total = total - lastCpuTotal;
                        if (diff_total > 0) {
                            usage = (double)(diff_total - diff_idle) / diff_total * 100.0;
                        }
                    } else {
                        usage = total > 0 ? (double)(total - idle) / total * 100.0 : 0.0;
                    }
                    
                    lastCpuIdle = idle;
                    lastCpuTotal = total;
                    
                    char buf[64];
                    sprintf_s(buf, "%.1f%%", usage);
                    stats["cpu_usage"] = buf;
                } catch (...) {}
            }
        } else {
            std::string vm_output = ExecuteCommand("vmstat 1 2 | tail -1");
            auto parts = SplitStringWhitespace(vm_output);
            if (parts.size() >= 15) {
                try {
                    double idle = std::stod(parts[parts.size() - 3]);
                    double usage = 100.0 - idle;
                    char buf[64];
                    sprintf_s(buf, "%.1f%%", usage);
                    stats["cpu_usage"] = buf;
                } catch (...) {
                    stats["cpu_usage"] = "0.0%";
                }
            } else {
                stats["cpu_usage"] = "0.0%";
            }
        }

        std::string mem_info = ExecuteCommand("cat /proc/meminfo | grep -E \"MemTotal|MemAvailable\"");
        long long mem_total = 0;
        long long mem_available = 0;
        auto mem_lines = SplitString(mem_info, '\n');
        for (auto& line : mem_lines) {
            line = TrimString(line);
            auto parts = SplitStringWhitespace(line);
            if (parts.size() >= 2) {
                if (parts[0] == "MemTotal:") {
                    try { mem_total = std::stoll(parts[1]) * 1024; } catch (...) {}
                } else if (parts[0] == "MemAvailable:") {
                    try { mem_available = std::stoll(parts[1]) * 1024; } catch (...) {}
                }
            }
        }
        if (mem_total > 0) {
            long long mem_used = mem_total - mem_available;
            double usage_percent = (double)mem_used / mem_total * 100.0;
            char buf[64];
            sprintf_s(buf, "%.1f%%", usage_percent);
            stats["memory_usage"] = buf;
            stats["memory_used"] = std::to_string(mem_used / (1024 * 1024)) + " MB";
            stats["memory_total"] = std::to_string(mem_total / (1024 * 1024)) + " MB";
        }

        std::string disk_info = ExecuteCommand("df -h / | tail -1");
        if (!disk_info.empty()) {
            auto parts = SplitStringWhitespace(disk_info);
            if (parts.size() >= 6) {
                stats["disk_total"] = parts[1];
                stats["disk_used"] = parts[2];
                stats["disk_usage"] = parts[4];
            }
        }
    } else {
        stats["error"] = "Unknown operating system";
    }
    return stats.dump();
}

std::string SSHSession::GetProcessList() {
    std::string os = DetectOS();
    nlohmann::json process_array = nlohmann::json::array();
    if (os == "windows") {
        std::string output = ExecuteCommand("wmic process get Name,ProcessId,WorkingSetSize /format:csv | sort /r");
        auto lines = SplitString(output, '\n');
        int count = 0;
        for (auto& line : lines) {
            line = TrimString(line);
            if (line.empty()) continue;
            auto parts = SplitString(line, ',');
            if (parts.size() >= 4) {
                if (parts[1] == "Name" || parts[1].empty()) continue;
                try {
                    nlohmann::json proc;
                    proc["name"] = parts[1];
                    proc["pid"] = parts[2];
                    proc["cpu"] = "-";
                    long long ws = std::stoll(parts[3]);
                    proc["memory"] = std::to_string(ws / 1024) + " KB";
                    process_array.push_back(proc);
                    if (++count >= 10) break;
                } catch (...) {}
            }
        }
    } else if (os == "linux") {
        std::string output = ExecuteCommand("ps aux --sort=-%cpu | head -11");
        auto lines = SplitString(output, '\n');
        int count = 0;
        for (auto& line : lines) {
            line = TrimString(line);
            if (line.empty()) continue;
            if (line.rfind("USER", 0) == 0) continue;
            auto parts = SplitStringWhitespace(line);
            if (parts.size() >= 11) {
                std::string cmd = parts[10];
                for (size_t i = 11; i < parts.size(); ++i) {
                    cmd += " " + parts[i];
                }
                nlohmann::json proc;
                proc["name"] = cmd.size() > 30 ? cmd.substr(0, 30) + "..." : cmd;
                proc["pid"] = parts[1];
                proc["cpu"] = parts[2] + "%";
                proc["memory"] = parts[3] + "%";
                process_array.push_back(proc);
                if (++count >= 10) break;
            }
        }
    }
    return process_array.dump();
}

std::string SSHSession::GetDiskUsage() {
    std::string os = DetectOS();
    nlohmann::json disk_array = nlohmann::json::array();
    if (os == "windows") {
        std::string output = ExecuteCommand("wmic logicaldisk where size!=0 get size,freespace,caption");
        auto lines = SplitString(output, '\n');
        for (auto& line : lines) {
            line = TrimString(line);
            auto parts = SplitStringWhitespace(line);
            if (parts.size() >= 3) {
                if (parts[0] == "Caption") continue;
                try {
                    long long free_space = std::stoll(parts[1]);
                    long long size = std::stoll(parts[2]);
                    long long used_space = size - free_space;
                    double usage_percent = (double)used_space / size * 100.0;
                    char buf[64];
                    
                    nlohmann::json disk;
                    disk["device"] = parts[0];
                    sprintf_s(buf, "%.1f GB", (double)size / (1024.0 * 1024.0 * 1024.0));
                    disk["total"] = buf;
                    sprintf_s(buf, "%.1f GB", (double)used_space / (1024.0 * 1024.0 * 1024.0));
                    disk["used"] = buf;
                    sprintf_s(buf, "%.1f GB", (double)free_space / (1024.0 * 1024.0 * 1024.0));
                    disk["free"] = buf;
                    sprintf_s(buf, "%.1f%%", usage_percent);
                    disk["usage"] = buf;
                    disk_array.push_back(disk);
                } catch (...) {}
            }
        }
    } else if (os == "linux") {
        std::string output = ExecuteCommand("df -h | grep -E \"^/dev/\"");
        auto lines = SplitString(output, '\n');
        for (auto& line : lines) {
            line = TrimString(line);
            if (line.empty()) continue;
            auto parts = SplitStringWhitespace(line);
            if (parts.size() >= 6) {
                nlohmann::json disk;
                disk["device"] = parts[0];
                disk["total"] = parts[1];
                disk["used"] = parts[2];
                disk["free"] = parts[3];
                disk["usage"] = parts[4];
                disk["mount"] = parts[5];
                disk_array.push_back(disk);
            }
        }
    }
    return disk_array.dump();
}

static std::string LocalFormatSpeed(double bytes_per_sec) {
    char buf[64];
    if (bytes_per_sec >= 1024.0 * 1024.0) {
        sprintf_s(buf, "%.2f MB/s", bytes_per_sec / (1024.0 * 1024.0));
    } else if (bytes_per_sec >= 1024.0) {
        sprintf_s(buf, "%.1f KB/s", bytes_per_sec / 1024.0);
    } else {
        sprintf_s(buf, "%.0f B/s", bytes_per_sec);
    }
    return buf;
}

std::string SSHSession::GetNetworkInfo() {
    std::string os = DetectOS();
    nlohmann::json net_array = nlohmann::json::array();
    
    if (os == "windows") {
        std::string output = ExecuteCommand("ipconfig");
        auto lines = SplitString(output, '\n');
        nlohmann::json current_interface = nlohmann::json::object();
        for (auto& line : lines) {
            std::string trimmed = TrimString(line);
            if (trimmed.empty()) continue;
            if (trimmed.find("adapter") != std::string::npos && trimmed.find(":") != std::string::npos) {
                if (current_interface.find("name") != current_interface.end()) {
                    net_array.push_back(current_interface);
                }
                current_interface = nlohmann::json::object();
                current_interface["name"] = trimmed.substr(0, trimmed.find(":"));
            } else if (current_interface.find("name") != current_interface.end() && trimmed.find("IPv4 Address") != std::string::npos) {
                size_t pos = trimmed.find(":");
                if (pos != std::string::npos) current_interface["ip"] = TrimString(trimmed.substr(pos + 1));
            } else if (current_interface.find("name") != current_interface.end() && trimmed.find("Subnet Mask") != std::string::npos) {
                size_t pos = trimmed.find(":");
                if (pos != std::string::npos) current_interface["netmask"] = TrimString(trimmed.substr(pos + 1));
            }
        }
        if (current_interface.find("name") != current_interface.end()) {
            net_array.push_back(current_interface);
        }
        
        std::string ns_out = ExecuteCommand("netstat -e");
        unsigned long long cur_rx = 0, cur_tx = 0;
        auto ns_lines = SplitString(ns_out, '\n');
        for (auto& line : ns_lines) {
            std::string trimmed = TrimString(line);
            if (trimmed.rfind("Bytes", 0) == 0 || trimmed.rfind("字节", 0) == 0) {
                auto parts = SplitStringWhitespace(trimmed);
                if (parts.size() >= 3) {
                    try {
                        cur_rx = std::stoull(parts[1]);
                        cur_tx = std::stoull(parts[2]);
                    } catch(...) {}
                }
                break;
            }
        }
        
        auto now = std::chrono::steady_clock::now();
        double seconds = 1.0;
        if (lastNetTime.time_since_epoch().count() > 0) {
            seconds = std::chrono::duration<double>(now - lastNetTime).count();
            if (seconds <= 0) seconds = 1.0;
        }
        lastNetTime = now;
        
        double down_speed = 0;
        double up_speed = 0;
        if (lastRxBytes.count("total") > 0 && cur_rx >= lastRxBytes["total"]) {
            down_speed = (cur_rx - lastRxBytes["total"]) / seconds;
        }
        if (lastTxBytes.count("total") > 0 && cur_tx >= lastTxBytes["total"]) {
            up_speed = (cur_tx - lastTxBytes["total"]) / seconds;
        }
        lastRxBytes["total"] = cur_rx;
        lastTxBytes["total"] = cur_tx;
        
        std::string speed_str = "▲ " + LocalFormatSpeed(up_speed) + "  ▼ " + LocalFormatSpeed(down_speed);
        for (auto& iface : net_array) {
            if (iface.find("ip") != iface.end()) {
                iface["traffic"] = speed_str;
                iface["status"] = "connected";
            } else {
                iface["traffic"] = "-";
                iface["status"] = "disconnected";
            }
        }
        
    } else if (os == "linux") {
        std::string dev_out = ExecuteCommand("cat /proc/net/dev");
        auto dev_lines = SplitString(dev_out, '\n');
        std::unordered_map<std::string, std::pair<unsigned long long, unsigned long long>> cur_traffic;
        for (auto& line : dev_lines) {
            std::string trimmed = TrimString(line);
            size_t colon_pos = trimmed.find(":");
            if (colon_pos != std::string::npos) {
                std::string iface_name = TrimString(trimmed.substr(0, colon_pos));
                if (iface_name == "lo") continue;
                std::string traffic_data = trimmed.substr(colon_pos + 1);
                auto parts = SplitStringWhitespace(traffic_data);
                if (parts.size() >= 9) {
                    try {
                        unsigned long long rx = std::stoull(parts[0]);
                        unsigned long long tx = std::stoull(parts[8]);
                        cur_traffic[iface_name] = {rx, tx};
                    } catch (...) {}
                }
            }
        }
        
        auto now = std::chrono::steady_clock::now();
        double seconds = 1.0;
        if (lastNetTime.time_since_epoch().count() > 0) {
            seconds = std::chrono::duration<double>(now - lastNetTime).count();
            if (seconds <= 0) seconds = 1.0;
        }
        lastNetTime = now;
        
        std::string output = ExecuteCommand("ip addr show");
        bool parse_success = false;
        if (!output.empty()) {
            auto lines = SplitString(output, '\n');
            nlohmann::json current_interface = nlohmann::json::object();
            for (auto& line : lines) {
                std::string trimmed = TrimString(line);
                if (trimmed.empty()) continue;
                if (isdigit((unsigned char)trimmed[0]) && trimmed.find(":") != std::string::npos) {
                    if (current_interface.find("name") != current_interface.end() && current_interface.find("ip") != current_interface.end()) {
                        net_array.push_back(current_interface);
                    }
                    current_interface = nlohmann::json::object();
                    auto parts = SplitString(trimmed, ':');
                    if (parts.size() >= 2) {
                        auto space_parts = SplitStringWhitespace(parts[1]);
                        if (!space_parts.empty()) current_interface["name"] = space_parts[0];
                    }
                } else if (current_interface.find("name") != current_interface.end() && trimmed.rfind("inet ", 0) == 0 && trimmed.find("scope global") != std::string::npos) {
                    auto parts = SplitStringWhitespace(trimmed);
                    if (parts.size() >= 2) {
                        std::string ip_cidr = parts[1];
                        current_interface["ip"] = ip_cidr.substr(0, ip_cidr.find("/"));
                        current_interface["cidr"] = ip_cidr;
                    }
                }
            }
            if (current_interface.find("name") != current_interface.end() && current_interface.find("ip") != current_interface.end()) {
                net_array.push_back(current_interface);
            }
            parse_success = !net_array.empty();
        }

        if (!parse_success) {
            std::string ifconfig_out = ExecuteCommand("ifconfig");
            auto lines = SplitString(ifconfig_out, '\n');
            nlohmann::json current_interface = nlohmann::json::object();
            for (auto& line : lines) {
                std::string raw_line = line;
                if (!raw_line.empty() && raw_line[0] != ' ' && raw_line[0] != '\t') {
                    if (current_interface.find("name") != current_interface.end() && current_interface.find("ip") != current_interface.end()) {
                        net_array.push_back(current_interface);
                    }
                    current_interface = nlohmann::json::object();
                    current_interface["name"] = TrimString(raw_line.substr(0, raw_line.find(":")));
                } else if (current_interface.find("name") != current_interface.end() && raw_line.find("inet ") != std::string::npos) {
                    auto parts = SplitStringWhitespace(raw_line);
                    for (size_t i = 0; i < parts.size(); ++i) {
                        if (parts[i] == "inet" && i + 1 < parts.size()) {
                            current_interface["ip"] = parts[i + 1];
                            break;
                        }
                    }
                }
            }
            if (current_interface.find("name") != current_interface.end() && current_interface.find("ip") != current_interface.end()) {
                net_array.push_back(current_interface);
            }
        }
        
        for (auto& iface : net_array) {
            std::string name = iface.value("name", "");
            if (cur_traffic.count(name) > 0) {
                unsigned long long rx = cur_traffic[name].first;
                unsigned long long tx = cur_traffic[name].second;
                
                double down_speed = 0;
                double up_speed = 0;
                if (lastRxBytes.count(name) > 0 && rx >= lastRxBytes[name]) {
                    down_speed = (rx - lastRxBytes[name]) / seconds;
                }
                if (lastTxBytes.count(name) > 0 && tx >= lastTxBytes[name]) {
                    up_speed = (tx - lastTxBytes[name]) / seconds;
                }
                lastRxBytes[name] = rx;
                lastTxBytes[name] = tx;
                
                iface["traffic"] = "▲ " + LocalFormatSpeed(up_speed) + "  ▼ " + LocalFormatSpeed(down_speed);
                iface["status"] = "connected";
            } else {
                iface["traffic"] = "-";
                iface["status"] = "disconnected";
            }
        }
    }
    
    return net_array.dump();
}

// SessionManager implementations
std::string SessionManager::CreateLocalSession() {
    std::lock_guard<std::mutex> lock(managerMutex);
    std::string sessionId = "local_" + std::to_string(GetTickCount64()) + "_" + std::to_string(rand() % 1000);
    auto session = std::make_shared<LocalSession>(sessionId);
    if (session->Connect()) {
        sessions[sessionId] = session;
        return sessionId;
    }
    return "";
}

void SessionManager::AddSession(const std::string& id, std::shared_ptr<Session> session) {
    std::lock_guard<std::mutex> lock(managerMutex);
    sessions[id] = session;
}

std::shared_ptr<Session> SessionManager::GetSession(const std::string& id) {
    std::lock_guard<std::mutex> lock(managerMutex);
    auto it = sessions.find(id);
    if (it != sessions.end()) {
        return it->second;
    }
    return nullptr;
}

void SessionManager::DisconnectSession(const std::string& id) {
    std::lock_guard<std::mutex> lock(managerMutex);
    auto it = sessions.find(id);
    if (it != sessions.end()) {
        it->second->Disconnect();
        sessions.erase(it);
    }
}

void SessionManager::Cleanup() {
    std::lock_guard<std::mutex> lock(managerMutex);
    for (auto& pair : sessions) {
        pair.second->Disconnect();
    }
    sessions.clear();
}

// Local helper file write time functions
static FILETIME GetLastWriteTime(const std::wstring& filePath) {
    FILETIME ftWrite = { 0 };
    HANDLE hFile = CreateFileW(filePath.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile != INVALID_HANDLE_VALUE) {
        GetFileTime(hFile, NULL, NULL, &ftWrite);
        CloseHandle(hFile);
    }
    return ftWrite;
}

static bool IsFileTimeNewer(const FILETIME& ft1, const FILETIME& ft2) {
    ULARGE_INTEGER u1, u2;
    u1.LowPart = ft1.dwLowDateTime;
    u1.HighPart = ft1.dwHighDateTime;
    u2.LowPart = ft2.dwLowDateTime;
    u2.HighPart = ft2.dwHighDateTime;
    return u1.QuadPart > u2.QuadPart;
}

#include <wrl.h>
#include <WebView2.h>

extern Microsoft::WRL::ComPtr<ICoreWebView2> webviewWindow;

bool SyncEditedFile(const std::wstring& tempPath) {
    std::string sessId;
    std::string remotePath;
    FILETIME originalMtime;
    
    {
        std::lock_guard<std::mutex> lock(editMappingMutex);
        auto it = editMappings.find(tempPath);
        if (it == editMappings.end()) return false;
        sessId = it->second.sessionId;
        remotePath = it->second.remotePath;
        originalMtime = it->second.lastWriteTime;
    }

    FILETIME currentMtime = GetLastWriteTime(tempPath);
    if (!IsFileTimeNewer(currentMtime, originalMtime)) {
        return true; 
    }

    std::ifstream file(tempPath, std::ios::binary);
    if (!file.is_open()) return false;
    std::string fileData((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    file.close();

    auto session = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
    if (!session) return false;

    std::string base64Content = Base64Encode(fileData);
    std::string uploadRes = session->UploadFileContent(base64Content, remotePath);
    
    try {
        auto j = nlohmann::json::parse(uploadRes);
        if (j.value("success", false)) {
            {
                std::lock_guard<std::mutex> lock(editMappingMutex);
                if (editMappings.find(tempPath) != editMappings.end()) {
                    editMappings[tempPath].lastWriteTime = currentMtime;
                }
            }
            
            size_t pos = remotePath.find_last_of("/\\");
            std::string filename = (pos == std::string::npos) ? remotePath : remotePath.substr(pos + 1);
            std::wstring filenameW = Utf8ToUtf16(filename);
            
            if (webviewWindow != nullptr) {
                webviewWindow->ExecuteScript((L"if (typeof showSyncNotification === 'function') { showSyncNotification(\"" + filenameW + L"\"); }").c_str(), nullptr);
            }
            return true;
        }
    } catch (...) {}
    return false;
}


// -------------------------------------------------------------
// Port Forwarding Thread Workers implementations
// -------------------------------------------------------------

static DWORD WINAPI LocalForwardListenerThread(LPVOID param) {
    auto* args = static_cast<LocalListenerArgs*>(param);
    auto session = args->session;
    auto pfInfo = args->pfInfo;
    delete args;

    SOCKET serverSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serverSock == INVALID_SOCKET) {
        pfInfo->active = false;
        return 0;
    }
    pfInfo->serverSocket = serverSock;

    int optval = 1;
    setsockopt(serverSock, SOL_SOCKET, SO_REUSEADDR, (char*)&optval, sizeof(optval));

    sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(pfInfo->local_port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(serverSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        closesocket(serverSock);
        pfInfo->serverSocket = INVALID_SOCKET;
        pfInfo->active = false;
        return 0;
    }

    if (listen(serverSock, SOMAXCONN) == SOCKET_ERROR) {
        closesocket(serverSock);
        pfInfo->serverSocket = INVALID_SOCKET;
        pfInfo->active = false;
        return 0;
    }

    u_long mode = 1;
    ioctlsocket(serverSock, FIONBIO, &mode);

    while (pfInfo->active && session->running) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(serverSock, &fds);
        timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 200000;
        int sel = select(0, &fds, NULL, NULL, &tv);

        if (sel > 0) {
            SOCKET clientSock = accept(serverSock, NULL, NULL);
            if (clientSock != INVALID_SOCKET) {
                struct LocalConnArgs {
                    std::shared_ptr<SSHSession> session;
                    std::shared_ptr<PortForwardInfo> pfInfo;
                    SOCKET clientSock;
                };
                auto* connArgs = new LocalConnArgs{session, pfInfo, clientSock};
                
                {
                    std::lock_guard<std::mutex> lock(session->forwardMutex);
                    pfInfo->connections++;
                }

                HANDLE hConnThread = CreateThread(NULL, 0, [](LPVOID p) -> DWORD {
                    auto* cArgs = static_cast<LocalConnArgs*>(p);
                    auto sess = cArgs->session;
                    auto pf = cArgs->pfInfo;
                    SOCKET cSock = cArgs->clientSock;
                    delete cArgs;

                    sockaddr_in peerAddr;
                    int peerLen = sizeof(peerAddr);
                    std::string clientIp = "127.0.0.1";
                    int clientPort = 0;
                    if (getpeername(cSock, (sockaddr*)&peerAddr, &peerLen) == 0) {
                        clientIp = inet_ntoa(peerAddr.sin_addr);
                        clientPort = ntohs(peerAddr.sin_port);
                    }

                    LIBSSH2_CHANNEL* channel = NULL;
                    while (pf->active && sess->running) {
                        {
                            std::lock_guard<std::mutex> lock(sess->sshMutex);
                            channel = libssh2_channel_direct_tcpip_ex(
                                sess->sshSession,
                                pf->remote_host.c_str(),
                                pf->remote_port,
                                clientIp.c_str(),
                                clientPort
                            );
                            if (channel) break;
                            int err = libssh2_session_last_errno(sess->sshSession);
                            if (err != LIBSSH2_ERROR_EAGAIN) {
                                break;
                            }
                        }
                        Sleep(5);
                    }

                    if (channel) {
                        sess->RelayData(cSock, channel, sess, pf);
                    } else {
                        closesocket(cSock);
                        std::lock_guard<std::mutex> lock(sess->forwardMutex);
                        pf->connections = (std::max)(0, pf->connections - 1);
                    }
                    return 0;
                }, connArgs, 0, NULL);
                if (hConnThread) {
                    CloseHandle(hConnThread);
                } else {
                    closesocket(clientSock);
                    std::lock_guard<std::mutex> lock(session->forwardMutex);
                    pfInfo->connections = (std::max)(0, pfInfo->connections - 1);
                }
            }
        } else if (sel < 0) {
            break;
        }
    }

    closesocket(serverSock);
    pfInfo->serverSocket = INVALID_SOCKET;
    pfInfo->active = false;
    return 0;
}

static DWORD WINAPI RemoteForwardListenerThread(LPVOID param) {
    auto* args = static_cast<RemoteListenerArgs*>(param);
    auto session = args->session;
    auto pfInfo = args->pfInfo;
    delete args;

    LIBSSH2_LISTENER* listener = NULL;
    while (pfInfo->active && session->running) {
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            int bound_port = 0;
            listener = libssh2_channel_forward_listen_ex(
                session->sshSession,
                "0.0.0.0",
                pfInfo->remote_port_remote,
                &bound_port,
                16
            );
            if (listener) break;
            int err = libssh2_session_last_errno(session->sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                pfInfo->active = false;
                return 0;
            }
        }
        Sleep(5);
    }

    if (!listener) {
        pfInfo->active = false;
        return 0;
    }

    while (pfInfo->active && session->running) {
        LIBSSH2_CHANNEL* channel = NULL;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            channel = libssh2_channel_forward_accept(listener);
        }

        if (channel) {
            struct RemoteConnArgs {
                std::shared_ptr<SSHSession> session;
                std::shared_ptr<PortForwardInfo> pfInfo;
                LIBSSH2_CHANNEL* channel;
            };
            auto* connArgs = new RemoteConnArgs{session, pfInfo, channel};

            {
                std::lock_guard<std::mutex> lock(session->forwardMutex);
                pfInfo->connections++;
            }

            HANDLE hConnThread = CreateThread(NULL, 0, [](LPVOID p) -> DWORD {
                auto* cArgs = static_cast<RemoteConnArgs*>(p);
                auto sess = cArgs->session;
                auto pf = cArgs->pfInfo;
                LIBSSH2_CHANNEL* chan = cArgs->channel;
                delete cArgs;

                SOCKET localSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
                if (localSock == INVALID_SOCKET) {
                    while (true) {
                        int rc = 0;
                        {
                            std::lock_guard<std::mutex> lock(sess->sshMutex);
                            rc = libssh2_channel_free(chan);
                        }
                        if (rc != LIBSSH2_ERROR_EAGAIN) break;
                        Sleep(5);
                    }
                    std::lock_guard<std::mutex> lock(sess->forwardMutex);
                    pf->connections = (std::max)(0, pf->connections - 1);
                    return 0;
                }

                struct addrinfo hints = { 0 }, *addrs = NULL;
                hints.ai_family = AF_INET;
                hints.ai_socktype = SOCK_STREAM;
                hints.ai_protocol = IPPROTO_TCP;

                std::string portStr = std::to_string(pf->local_port);
                int gai_res = getaddrinfo(pf->local_host.c_str(), portStr.c_str(), &hints, &addrs);
                if (gai_res != 0) {
                    closesocket(localSock);
                    while (true) {
                        int rc = 0;
                        {
                            std::lock_guard<std::mutex> lock(sess->sshMutex);
                            rc = libssh2_channel_free(chan);
                        }
                        if (rc != LIBSSH2_ERROR_EAGAIN) break;
                        Sleep(5);
                    }
                    std::lock_guard<std::mutex> lock(sess->forwardMutex);
                    pf->connections = (std::max)(0, pf->connections - 1);
                    return 0;
                }

                bool connected = false;
                for (struct addrinfo* addr = addrs; addr != NULL; addr = addr->ai_next) {
                    if (connect(localSock, addr->ai_addr, (int)addr->ai_addrlen) == 0) {
                        connected = true;
                        break;
                    }
                }
                freeaddrinfo(addrs);

                if (!connected) {
                    closesocket(localSock);
                    while (true) {
                        int rc = 0;
                        {
                            std::lock_guard<std::mutex> lock(sess->sshMutex);
                            rc = libssh2_channel_free(chan);
                        }
                        if (rc != LIBSSH2_ERROR_EAGAIN) break;
                        Sleep(5);
                    }
                    std::lock_guard<std::mutex> lock(sess->forwardMutex);
                    pf->connections = (std::max)(0, pf->connections - 1);
                    return 0;
                }

                sess->RelayData(localSock, chan, sess, pf);
                return 0;
            }, connArgs, 0, NULL);
            if (hConnThread) {
                CloseHandle(hConnThread);
            } else {
                while (true) {
                    int rc = 0;
                    {
                        std::lock_guard<std::mutex> lock(session->sshMutex);
                        rc = libssh2_channel_free(channel);
                    }
                    if (rc != LIBSSH2_ERROR_EAGAIN) break;
                    Sleep(5);
                }
                std::lock_guard<std::mutex> lock(session->forwardMutex);
                pfInfo->connections = (std::max)(0, pfInfo->connections - 1);
            }
        } else {
            int err = libssh2_session_last_errno(session->sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                break;
            }
            Sleep(10);
        }
    }

    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            rc = libssh2_channel_forward_cancel(listener);
        }
        if (rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    pfInfo->active = false;
    return 0;
}

static DWORD WINAPI DynamicForwardListenerThread(LPVOID param) {
    auto* args = static_cast<DynamicListenerArgs*>(param);
    auto session = args->session;
    auto pfInfo = args->pfInfo;
    delete args;

    SOCKET serverSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serverSock == INVALID_SOCKET) {
        pfInfo->active = false;
        return 0;
    }
    pfInfo->serverSocket = serverSock;

    int optval = 1;
    setsockopt(serverSock, SOL_SOCKET, SO_REUSEADDR, (char*)&optval, sizeof(optval));

    sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(pfInfo->local_port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(serverSock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        closesocket(serverSock);
        pfInfo->serverSocket = INVALID_SOCKET;
        pfInfo->active = false;
        return 0;
    }

    if (listen(serverSock, SOMAXCONN) == SOCKET_ERROR) {
        closesocket(serverSock);
        pfInfo->serverSocket = INVALID_SOCKET;
        pfInfo->active = false;
        return 0;
    }

    u_long mode = 1;
    ioctlsocket(serverSock, FIONBIO, &mode);

    while (pfInfo->active && session->running) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(serverSock, &fds);
        timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 200000;
        int sel = select(0, &fds, NULL, NULL, &tv);

        if (sel > 0) {
            SOCKET clientSock = accept(serverSock, NULL, NULL);
            if (clientSock != INVALID_SOCKET) {
                struct SocksConnArgs {
                    std::shared_ptr<SSHSession> session;
                    std::shared_ptr<PortForwardInfo> pfInfo;
                    SOCKET clientSock;
                };
                auto* connArgs = new SocksConnArgs{session, pfInfo, clientSock};

                {
                    std::lock_guard<std::mutex> lock(session->forwardMutex);
                    pfInfo->connections++;
                }

                HANDLE hConnThread = CreateThread(NULL, 0, [](LPVOID p) -> DWORD {
                    auto* cArgs = static_cast<SocksConnArgs*>(p);
                    auto sess = cArgs->session;
                    auto pf = cArgs->pfInfo;
                    SOCKET cSock = cArgs->clientSock;
                    delete cArgs;

                    int timeout = 5000;
                    setsockopt(cSock, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout));
                    u_long blocking_mode = 0;
                    ioctlsocket(cSock, FIONBIO, &blocking_mode);

                    unsigned char version = 0;
                    if (recv(cSock, (char*)&version, 1, 0) <= 0) {
                        closesocket(cSock);
                        std::lock_guard<std::mutex> lock(sess->forwardMutex);
                        pf->connections = (std::max)(0, pf->connections - 1);
                        return 0;
                    }

                    std::string destHost = "";
                    int destPort = 0;
                    bool socksSuccess = false;

                    if (version == 5) {
                        unsigned char nmethods = 0;
                        if (recv(cSock, (char*)&nmethods, 1, 0) > 0) {
                            std::vector<unsigned char> methods(nmethods);
                            recv(cSock, (char*)methods.data(), nmethods, 0);
                            
                            unsigned char resp[2] = { 0x05, 0x00 };
                            send(cSock, (char*)resp, 2, 0);

                            unsigned char reqHeader[4] = { 0 };
                            if (recv(cSock, (char*)reqHeader, 4, 0) == 4) {
                                if (reqHeader[0] == 0x05 && reqHeader[1] == 0x01) {
                                    unsigned char atyp = reqHeader[3];
                                    if (atyp == 1) {
                                        unsigned char ip[4];
                                        unsigned char portBytes[2];
                                        if (recv(cSock, (char*)ip, 4, 0) == 4 && recv(cSock, (char*)portBytes, 2, 0) == 2) {
                                            destHost = std::to_string(ip[0]) + "." + std::to_string(ip[1]) + "." + std::to_string(ip[2]) + "." + std::to_string(ip[3]);
                                            destPort = (portBytes[0] << 8) | portBytes[1];
                                            socksSuccess = true;
                                        }
                                    } else if (atyp == 3) {
                                        unsigned char domainLen = 0;
                                        if (recv(cSock, (char*)&domainLen, 1, 0) == 1) {
                                            std::vector<char> domain(domainLen + 1, 0);
                                            if (recv(cSock, domain.data(), domainLen, 0) == domainLen) {
                                                destHost = domain.data();
                                                unsigned char portBytes[2];
                                                if (recv(cSock, (char*)portBytes, 2, 0) == 2) {
                                                    destPort = (portBytes[0] << 8) | portBytes[1];
                                                    socksSuccess = true;
                                                }
                                            }
                                        }
                                    } else if (atyp == 4) {
                                        unsigned char ip[16];
                                        unsigned char portBytes[2];
                                        if (recv(cSock, (char*)ip, 16, 0) == 16 && recv(cSock, (char*)portBytes, 2, 0) == 2) {
                                            char ipv6Str[128] = { 0 };
                                            sprintf_s(ipv6Str, "%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x",
                                                ip[0], ip[1], ip[2], ip[3], ip[4], ip[5], ip[6], ip[7],
                                                ip[8], ip[9], ip[10], ip[11], ip[12], ip[13], ip[14], ip[15]);
                                            destHost = ipv6Str;
                                            destPort = (portBytes[0] << 8) | portBytes[1];
                                            socksSuccess = true;
                                        }
                                    }
                                }
                            }
                        }

                        if (!socksSuccess) {
                            unsigned char errResp[10] = { 0x05, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
                            send(cSock, (char*)errResp, 10, 0);
                            closesocket(cSock);
                            std::lock_guard<std::mutex> lock(sess->forwardMutex);
                            pf->connections = (std::max)(0, pf->connections - 1);
                            return 0;
                        }
                    } else if (version == 4) {
                        unsigned char cmd = 0;
                        unsigned char portBytes[2] = { 0 };
                        unsigned char ip[4] = { 0 };
                        if (recv(cSock, (char*)&cmd, 1, 0) == 1 &&
                            recv(cSock, (char*)portBytes, 2, 0) == 2 &&
                            recv(cSock, (char*)ip, 4, 0) == 4) {
                            
                            if (cmd == 1) {
                                destPort = (portBytes[0] << 8) | portBytes[1];
                                
                                char dummy;
                                while (recv(cSock, &dummy, 1, 0) == 1 && dummy != '\0');
                                
                                if (ip[0] == 0 && ip[1] == 0 && ip[2] == 0 && ip[3] != 0) {
                                    std::string domain = "";
                                    char c;
                                    while (recv(cSock, &c, 1, 0) == 1 && c != '\0') {
                                        domain += c;
                                    }
                                    destHost = domain;
                                } else {
                                    destHost = std::to_string(ip[0]) + "." + std::to_string(ip[1]) + "." + std::to_string(ip[2]) + "." + std::to_string(ip[3]);
                                }
                                socksSuccess = true;
                            }
                        }

                        if (!socksSuccess) {
                            unsigned char errResp[8] = { 0x00, 0x5b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
                            send(cSock, (char*)errResp, 8, 0);
                            closesocket(cSock);
                            std::lock_guard<std::mutex> lock(sess->forwardMutex);
                            pf->connections = (std::max)(0, pf->connections - 1);
                            return 0;
                        }
                    } else {
                        closesocket(cSock);
                        std::lock_guard<std::mutex> lock(sess->forwardMutex);
                        pf->connections = (std::max)(0, pf->connections - 1);
                        return 0;
                    }

                    LIBSSH2_CHANNEL* channel = NULL;
                    while (pf->active && sess->running) {
                        {
                            std::lock_guard<std::mutex> lock(sess->sshMutex);
                            channel = libssh2_channel_direct_tcpip_ex(
                                sess->sshSession,
                                destHost.c_str(),
                                destPort,
                                "127.0.0.1",
                                0
                            );
                            if (channel) break;
                            int err = libssh2_session_last_errno(sess->sshSession);
                            if (err != LIBSSH2_ERROR_EAGAIN) {
                                break;
                            }
                        }
                        Sleep(5);
                    }

                    if (channel) {
                        if (version == 5) {
                            unsigned char okResp[10] = { 0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
                            send(cSock, (char*)okResp, 10, 0);
                        } else {
                            unsigned char okResp[8] = { 0x00, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
                            send(cSock, (char*)okResp, 8, 0);
                        }
                        
                        sess->RelayData(cSock, channel, sess, pf);
                    } else {
                        if (version == 5) {
                            unsigned char errResp[10] = { 0x05, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
                            send(cSock, (char*)errResp, 10, 0);
                        } else {
                            unsigned char errResp[8] = { 0x00, 0x5b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
                            send(cSock, (char*)errResp, 8, 0);
                        }
                        closesocket(cSock);
                        std::lock_guard<std::mutex> lock(sess->forwardMutex);
                        pf->connections = (std::max)(0, pf->connections - 1);
                    }
                    return 0;
                }, connArgs, 0, NULL);
                if (hConnThread) {
                    CloseHandle(hConnThread);
                } else {
                    closesocket(clientSock);
                    std::lock_guard<std::mutex> lock(session->forwardMutex);
                    pfInfo->connections = (std::max)(0, pfInfo->connections - 1);
                }
            }
        } else if (sel < 0) {
            break;
        }
    }

    closesocket(serverSock);
    pfInfo->serverSocket = INVALID_SOCKET;
    pfInfo->active = false;
    return 0;
}

// =================== ListPortForwards ===================
std::string SSHSession::ListPortForwards() {
    nlohmann::json arr = nlohmann::json::array();
    std::lock_guard<std::mutex> lock(forwardMutex);
    for (auto& pair : portForwards) {
        auto pf = pair.second;
        nlohmann::json obj;
        obj["id"] = pf->id;
        obj["type"] = pf->type;
        obj["active"] = pf->active;
        obj["connections"] = pf->connections;
        obj["description"] = pf->description;
        if (pf->type == "local") {
            obj["local_port"] = pf->local_port;
            obj["remote_host"] = pf->remote_host;
            obj["remote_port"] = pf->remote_port;
        } else if (pf->type == "remote") {
            obj["remote_port"] = pf->remote_port_remote;
            obj["local_host"] = pf->local_host;
            obj["local_port"] = pf->local_port;
        } else if (pf->type == "dynamic") {
            obj["local_port"] = pf->local_port;
        }
        arr.push_back(obj);
    }
    return arr.dump();
}

// =================== StopPortForward ===================
bool SSHSession::StopPortForward(const std::string& forwardId) {
    std::shared_ptr<PortForwardInfo> pf = nullptr;
    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        auto it = portForwards.find(forwardId);
        if (it != portForwards.end()) {
            pf = it->second;
            portForwards.erase(it);
        }
    }

    if (!pf) return false;

    pf->active = false;
    if (pf->serverSocket != INVALID_SOCKET) {
        closesocket(pf->serverSocket);
    }

    if (pf->hThread) {
        WaitForSingleObject(pf->hThread, 500);
        CloseHandle(pf->hThread);
        pf->hThread = NULL;
    }

    return true;
}

// =================== CreateDynamicPortForward ===================
std::string SSHSession::CreateDynamicPortForward(std::shared_ptr<SSHSession> self, int localPort) {
    std::string forwardId = "D_" + std::to_string(localPort);
    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        if (portForwards.find(forwardId) != portForwards.end()) {
            return forwardId;
        }
    }

    SOCKET testSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (testSock != INVALID_SOCKET) {
        sockaddr_in addr = {0};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(localPort);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");
        int rc = bind(testSock, (sockaddr*)&addr, sizeof(addr));
        closesocket(testSock);
        if (rc == SOCKET_ERROR) {
            return ""; 
        }
    }

    auto pfInfo = std::make_shared<PortForwardInfo>();
    pfInfo->id = forwardId;
    pfInfo->type = "dynamic";
    pfInfo->local_port = localPort;
    pfInfo->active = true;
    pfInfo->connections = 0;
    pfInfo->description = "SOCKS proxy on port " + std::to_string(localPort);

    auto* dargs = new DynamicListenerArgs{ self, pfInfo };
    pfInfo->hThread = CreateThread(NULL, 0, DynamicForwardListenerThread, dargs, 0, NULL);
    if (!pfInfo->hThread) {
        delete dargs;
        return "";
    }

    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        portForwards[forwardId] = pfInfo;
    }
    return forwardId;
}

// =================== CreateRemotePortForward ===================
std::string SSHSession::CreateRemotePortForward(std::shared_ptr<SSHSession> self, int remotePort, const std::string& localHost, int localPort) {
    std::string forwardId = "R_" + std::to_string(remotePort) + "_" + localHost + "_" + std::to_string(localPort);
    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        if (portForwards.find(forwardId) != portForwards.end()) {
            return forwardId;
        }
    }

    auto pfInfo = std::make_shared<PortForwardInfo>();
    pfInfo->id = forwardId;
    pfInfo->type = "remote";
    pfInfo->local_port = localPort;
    pfInfo->local_host = localHost;
    pfInfo->remote_port_remote = remotePort;
    pfInfo->active = true;
    pfInfo->connections = 0;
    pfInfo->description = "Remote " + std::to_string(remotePort) + " -> " + localHost + ":" + std::to_string(localPort);

    auto* rargs = new RemoteListenerArgs{ self, pfInfo };
    pfInfo->hThread = CreateThread(NULL, 0, RemoteForwardListenerThread, rargs, 0, NULL);
    if (!pfInfo->hThread) {
        delete rargs;
        return "";
    }

    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        portForwards[forwardId] = pfInfo;
    }
    return forwardId;
}

// =================== CreateLocalPortForward ===================
std::string SSHSession::CreateLocalPortForward(std::shared_ptr<SSHSession> self, int localPort, const std::string& remoteHost, int remotePort) {
    std::string forwardId = "L_" + std::to_string(localPort) + "_" + remoteHost + "_" + std::to_string(remotePort);
    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        if (portForwards.find(forwardId) != portForwards.end()) {
            return forwardId;
        }
    }

    SOCKET testSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (testSock != INVALID_SOCKET) {
        sockaddr_in addr = {0};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(localPort);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");
        int rc = bind(testSock, (sockaddr*)&addr, sizeof(addr));
        closesocket(testSock);
        if (rc == SOCKET_ERROR) {
            return ""; 
        }
    }

    auto pfInfo = std::make_shared<PortForwardInfo>();
    pfInfo->id = forwardId;
    pfInfo->type = "local";
    pfInfo->local_port = localPort;
    pfInfo->remote_host = remoteHost;
    pfInfo->remote_port = remotePort;
    pfInfo->active = true;
    pfInfo->connections = 0;
    pfInfo->description = "Local " + std::to_string(localPort) + " -> " + remoteHost + ":" + std::to_string(remotePort);

    auto* largs = new LocalListenerArgs{ self, pfInfo };
    pfInfo->hThread = CreateThread(NULL, 0, LocalForwardListenerThread, largs, 0, NULL);
    if (!pfInfo->hThread) {
        delete largs;
        return "";
    }

    {
        std::lock_guard<std::mutex> lock(forwardMutex);
        portForwards[forwardId] = pfInfo;
    }
    return forwardId;
}

// =================== RelayData ===================
void SSHSession::RelayData(SOCKET localSock, LIBSSH2_CHANNEL* channel, std::shared_ptr<SSHSession> session, std::shared_ptr<PortForwardInfo> pfInfo) {
    u_long mode = 1;
    ioctlsocket(localSock, FIONBIO, &mode);

    char localBuf[16384];
    char sshBuf[16384];
    
    int localLen = 0;
    int sshLen = 0;
    
    bool localClosed = false;
    bool sshClosed = false;
    
    int idleSleep = 1;
    while (pfInfo->active && session->running && !localClosed && !sshClosed) {
        bool progressed = false;

        if (localLen == 0) {
            int rc = recv(localSock, localBuf, sizeof(localBuf), 0);
            if (rc > 0) {
                localLen = rc;
                progressed = true;
            } else if (rc == 0) {
                localClosed = true;
            } else {
                int err = WSAGetLastError();
                if (err != WSAEWOULDBLOCK) {
                    localClosed = true;
                }
            }
        }
        
        if (localLen > 0) {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            int written = libssh2_channel_write(channel, localBuf, localLen);
            if (written > 0) {
                if (written < localLen) {
                    memmove(localBuf, localBuf + written, localLen - written);
                }
                localLen -= written;
                progressed = true;
            } else if (written < 0) {
                if (written != LIBSSH2_ERROR_EAGAIN) {
                    sshClosed = true;
                }
            }
        }
        
        if (sshLen == 0) {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            int readBytes = libssh2_channel_read(channel, sshBuf, sizeof(sshBuf));
            if (readBytes > 0) {
                sshLen = readBytes;
                progressed = true;
            } else if (readBytes < 0) {
                if (readBytes != LIBSSH2_ERROR_EAGAIN) {
                    sshClosed = true;
                }
            } else {
                sshClosed = true;
            }
        }
        
        if (sshLen > 0) {
            int sent = send(localSock, sshBuf, sshLen, 0);
            if (sent > 0) {
                if (sent < sshLen) {
                    memmove(sshBuf, sshBuf + sent, sshLen - sent);
                }
                sshLen -= sent;
                progressed = true;
            } else if (sent < 0) {
                int err = WSAGetLastError();
                if (err != WSAEWOULDBLOCK) {
                    localClosed = true;
                }
            }
        }
        
        if (progressed) {
            idleSleep = 1;
        } else {
            Sleep(idleSleep);
            if (idleSleep < 15) {
                idleSleep += 2;
            }
        }
    }
    
    closesocket(localSock);
    
    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            rc = libssh2_channel_close(channel);
        }
        if (rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(session->sshMutex);
            rc = libssh2_channel_free(channel);
        }
        if (rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    
    std::lock_guard<std::mutex> lock(session->forwardMutex);
    pfInfo->connections = (std::max)(0, pfInfo->connections - 1);
}

// =================== UploadFile ===================
bool SSHSession::UploadFile(const std::wstring& localPath, const std::string& remotePath) {
    if (!sftpSession) {
        lastError = "SFTP session not initialized";
        return false;
    }
    
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            handle = libssh2_sftp_open(sftpSession, remotePath.c_str(), LIBSSH2_FXF_WRITE | LIBSSH2_FXF_CREAT | LIBSSH2_FXF_TRUNC, 0644);
            if (handle) break;
            int err = libssh2_session_last_errno(sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                char *err_msg = NULL;
                int err_msg_len = 0;
                libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
                lastError = "open failed: " + ((err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error");
                return false;
            }
        }
        Sleep(5);
    }

    auto pipeline = std::make_shared<SftpPipeline>(8);
    bool readSuccess = true;
    std::string readError = "";
    
    std::thread readerThread([localPath, pipeline, &readSuccess, &readError]() {
        std::ifstream in(localPath.c_str(), std::ios::binary);
        if (!in.is_open()) {
            readSuccess = false;
            readError = "Failed to open local file for reading";
            pipeline->Cancel();
            return;
        }
        
        char buffer[32768];
        while (true) {
            in.read(buffer, sizeof(buffer));
            std::streamsize bytesRead = in.gcount();
            if (bytesRead <= 0) break;
            
            auto block = std::make_shared<SftpBlock>();
            block->data.assign(buffer, buffer + bytesRead);
            if (!pipeline->Push(block)) break;
        }
        
        auto eofBlock = std::make_shared<SftpBlock>();
        eofBlock->is_eof = true;
        pipeline->Push(eofBlock);
    });

    bool success = true;
    while (true) {
        auto block = pipeline->Pop();
        if (!block || block->is_eof) {
            if (!block) {
                success = false;
                lastError = "Upload cancelled or failed in reader";
            }
            break;
        }
        
        int totalWritten = 0;
        int bytesToWrite = (int)block->data.size();
        while (totalWritten < bytesToWrite) {
            int rc = 0;
            {
                std::lock_guard<std::mutex> lock(sshMutex);
                rc = libssh2_sftp_write(handle, block->data.data() + totalWritten, (size_t)(bytesToWrite - totalWritten));
            }
            if (rc < 0) {
                if (rc == LIBSSH2_ERROR_EAGAIN) {
                    Sleep(5);
                    continue;
                }
                lastError = "write failed";
                success = false;
                pipeline->Cancel();
                break;
            }
            totalWritten += rc;
        }
        if (!success) break;
    }

    if (readerThread.joinable()) {
        readerThread.join();
    }
    
    if (!readSuccess) {
        success = false;
        lastError = readError;
    }
    
    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }
    
    return success;
}

// =================== DownloadFile ===================
bool SSHSession::DownloadFile(const std::string& remotePath, const std::wstring& localPath) {
    if (!sftpSession) {
        lastError = "SFTP session not initialized";
        return false;
    }
    
    LIBSSH2_SFTP_HANDLE* handle = NULL;
    while (true) {
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            handle = libssh2_sftp_open(sftpSession, remotePath.c_str(), LIBSSH2_FXF_READ, 0);
            if (handle) break;
            int err = libssh2_session_last_errno(sshSession);
            if (err != LIBSSH2_ERROR_EAGAIN) {
                char *err_msg = NULL;
                int err_msg_len = 0;
                libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
                lastError = "open failed: " + ((err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error");
                return false;
            }
        }
        Sleep(5);
    }

    auto pipeline = std::make_shared<SftpPipeline>(8);
    bool writeSuccess = true;
    std::string writeError = "";
    
    std::thread writerThread([localPath, pipeline, &writeSuccess, &writeError]() {
        std::ofstream out(localPath.c_str(), std::ios::binary);
        if (!out.is_open()) {
            writeSuccess = false;
            writeError = "Failed to open local file for writing";
            pipeline->Cancel();
            return;
        }
        
        while (true) {
            auto block = pipeline->Pop();
            if (!block || block->is_eof) break;
            
            out.write(block->data.data(), block->data.size());
            if (!out) {
                writeSuccess = false;
                writeError = "write to local file failed";
                pipeline->Cancel();
                break;
            }
        }
        out.close();
    });

    bool success = true;
    char buffer[32768];
    while (true) {
        int rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            rc = libssh2_sftp_read(handle, buffer, sizeof(buffer));
        }
        if (rc < 0) {
            if (rc == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
                continue;
            }
            lastError = "read failed";
            success = false;
            pipeline->Cancel();
            break;
        }
        if (rc == 0) {
            auto eofBlock = std::make_shared<SftpBlock>();
            eofBlock->is_eof = true;
            pipeline->Push(eofBlock);
            break;
        }
        
        auto block = std::make_shared<SftpBlock>();
        block->data.assign(buffer, buffer + rc);
        if (!pipeline->Push(block)) break;
    }

    if (writerThread.joinable()) {
        writerThread.join();
    }

    if (!writeSuccess) {
        success = false;
        lastError = writeError;
    }

    while (true) {
        int c_rc = 0;
        {
            std::lock_guard<std::mutex> lock(sshMutex);
            c_rc = libssh2_sftp_close(handle);
        }
        if (c_rc != LIBSSH2_ERROR_EAGAIN) break;
        Sleep(5);
    }

    if (!success) {
        ::DeleteFileW(localPath.c_str());
    }

    return success;
}

void HandleConnectApi(const std::string& reqId, const nlohmann::json& args, nlohmann::json& response) {
    std::string sessId = args[0].get<std::string>();
    std::string paramsStr = args[1].get<std::string>();
    
    auto params = nlohmann::json::parse(paramsStr);
    std::string hostname = SafeGetJsonString(params, "hostname", "");
    int port = SafeGetJsonInt(params, "port", 22);
    std::string username = SafeGetJsonString(params, "username", "");
    std::string password = SafeGetJsonString(params, "password", "");
    
    std::string storeKey = hostname + "@" + username;
    
    if (SafeGetJsonBool(params, "save", false)) {
        NamedMutexLock lock(L"Global\\PrismSSHConfigMutex");
        std::wstring configDir = GetConfigDirectory();
        std::wstring connPath = configDir + L"\\connections.json";
        std::string connData = ReadFileToUtf8(connPath);
        
        nlohmann::json conns = nlohmann::json::object();
        if (!connData.empty()) {
            try {
                conns = nlohmann::json::parse(connData);
            } catch(...) {}
        }
        
        nlohmann::json connObj;
        connObj["hostname"] = hostname;
        connObj["port"] = port;
        connObj["username"] = username;
        connObj["name"] = SafeGetJsonString(params, "name", username + "@" + hostname);
        connObj["keyPath"] = SafeGetJsonString(params, "keyPath", "");
        
        if (!password.empty()) {
            std::string fernetKey = GetOrCreateFernetKey();
            std::string encrypted = EncryptFernetPassword(fernetKey, password);
            if (!encrypted.empty()) {
                connObj["password"] = encrypted;
                connObj["password_encrypted"] = true;
            } else {
                connObj["password"] = password;
                connObj["password_encrypted"] = false;
            }
        } else {
            connObj["password"] = "";
            connObj["password_encrypted"] = false;
        }
        
        conns[storeKey] = connObj;
        
        WriteUtf8ToFile(connPath, conns.dump(2));
    }

    std::string keyPath = SafeGetJsonString(params, "keyPath", "");
    std::string keyPassphrase = SafeGetJsonString(params, "keyPassphrase", "");

    auto session = std::make_shared<SSHSession>(sessId);
    PrismLog("INFO", "SSHSession connect initiated for " + storeKey);
    bool success = session->Connect(hostname, port, username, password, keyPath, keyPassphrase);
    
    nlohmann::json retObj;
    if (success) {
        PrismLog("INFO", "SSHSession connect success for " + storeKey);
        globalSessionManager.AddSession(sessId, session);
        retObj["success"] = true;
    } else {
        PrismLog("ERROR", "SSHSession connect failed for " + storeKey + ", error: " + (session->lastError.empty() ? "unknown" : session->lastError));
        retObj["success"] = false;
        retObj["error"] = session->lastError.empty() ? "SSH connection failed before opening a shell" : session->lastError;
    }
    
    response["status"] = "success";
    response["result"] = retObj.dump();
}
