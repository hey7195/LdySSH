#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdlib.h>
#include <string>
#include <tchar.h>
#include <wrl.h>
#include <WebView2.h>
#include <shlwapi.h>
#include <fstream>
#include <sstream>
#include <vector>
#include <bcrypt.h>
#include <dwmapi.h>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <libssh2.h>
#include <libssh2_sftp.h>
#include <thread>
#include <algorithm>
#include <commdlg.h>
#include <shlobj.h>
#include <shellapi.h>

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "comdlg32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")

using namespace Microsoft::WRL;

// Global Transfer Progress Tracker
struct TransferProgress {
    std::string id;
    long long transferredBytes = 0;
    long long totalBytes = 0;
    int percentage = 0;
    bool completed = false;
    bool cancelled = false;
    std::string error;
    std::string content;
};

class ProgressManager {
private:
    std::unordered_map<std::string, TransferProgress> progresses;
    std::mutex mtx;

public:
    void SetProgress(const std::string& id, long long transferred, long long total, bool completed = false, const std::string& error = "") {
        std::lock_guard<std::mutex> lock(mtx);
        TransferProgress& p = progresses[id];
        p.id = id;
        p.transferredBytes = transferred;
        p.totalBytes = total;
        p.completed = completed;
        p.error = error;
        if (total > 0) {
            p.percentage = (int)((transferred * 100) / total);
        } else {
            p.percentage = completed ? 100 : 0;
        }
    }

    void SetCompletedWithContent(const std::string& id, long long transferred, long long total, const std::string& content) {
        std::lock_guard<std::mutex> lock(mtx);
        TransferProgress& p = progresses[id];
        p.id = id;
        p.transferredBytes = transferred;
        p.totalBytes = total;
        p.completed = true;
        p.content = content;
        p.percentage = 100;
    }

    void Cancel(const std::string& id) {
        std::lock_guard<std::mutex> lock(mtx);
        if (progresses.find(id) != progresses.end()) {
            progresses[id].cancelled = true;
        }
    }

    bool IsCancelled(const std::string& id) {
        std::lock_guard<std::mutex> lock(mtx);
        if (progresses.find(id) != progresses.end()) {
            return progresses[id].cancelled;
        }
        return false;
    }

    std::string GetProgressJson(const std::string& id) {
        std::lock_guard<std::mutex> lock(mtx);
        if (progresses.find(id) == progresses.end()) {
            return "{\"success\":false,\"error\":\"Not found\"}";
        }
        const TransferProgress& p = progresses[id];
        nlohmann::json res;
        res["success"] = true;
        res["id"] = p.id;
        res["transferred"] = p.transferredBytes;
        res["downloaded"] = p.transferredBytes;
        res["total"] = p.totalBytes;
        res["percentage"] = p.percentage;
        res["completed"] = p.completed;
        res["cancelled"] = p.cancelled;
        
        if (p.cancelled) {
            res["status"] = "cancelled";
        } else if (!p.error.empty()) {
            res["status"] = "error";
            res["error"] = p.error;
        } else if (p.completed) {
            res["status"] = "completed";
        } else {
            res["status"] = "downloading";
        }

        if (p.completed && !p.content.empty()) {
            res["content"] = p.content;
        }
        return res.dump();
    }

    void Clear(const std::string& id) {
        std::lock_guard<std::mutex> lock(mtx);
        progresses.erase(id);
    }
};

ProgressManager globalProgressManager;

// Global variables
HINSTANCE hInst;
HWND hWnd;
ComPtr<ICoreWebView2Controller> webviewController;
ComPtr<ICoreWebView2> webviewWindow;



// UTF-8 & UTF-16 Conversion Helpers
std::string Utf16ToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, NULL, 0, NULL, NULL);
    std::string str(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, NULL, NULL);
    if (!str.empty() && str.back() == '\0') str.pop_back();
    return str;
}

std::wstring Utf8ToUtf16(const std::string& str) {
    if (str.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, NULL, 0);
    std::wstring wstr(size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], size);
    if (!wstr.empty() && wstr.back() == L'\0') wstr.pop_back();
    return wstr;
}

// File Utility Helpers
std::string ReadFileToUtf8(const std::wstring& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f.is_open()) return "";
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

std::wstring ReadFileToString(const std::wstring& path) {
    std::string content = ReadFileToUtf8(path);
    if (content.empty()) return L"";
    return Utf8ToUtf16(content);
}

bool WriteUtf8ToFile(const std::wstring& path, const std::string& content) {
    std::ofstream f(path, std::ios::binary);
    if (!f.is_open()) return false;
    f.write(content.data(), content.size());
    return true;
}

std::wstring GetExeDirectory() {
    wchar_t buffer[MAX_PATH];
    GetModuleFileName(NULL, buffer, MAX_PATH);
    PathRemoveFileSpec(buffer);
    return std::wstring(buffer);
}

std::wstring GetConfigDirectory() {
    wchar_t* userProfile = nullptr;
    size_t len = 0;
    if (_wdupenv_s(&userProfile, &len, L"USERPROFILE") == 0 && userProfile != nullptr) {
        std::wstring path = std::wstring(userProfile) + L"\\.ldyssh";
        free(userProfile);
        return path;
    }
    return L"";
}

// Base64 Helpers
static const std::string base64_chars = 
             "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
             "abcdefghijklmnopqrstuvwxyz"
             "0123456789+/";

inline bool is_base64(unsigned char c) {
  return (isalnum(c) || (c == '+') || (c == '/'));
}

std::string Base64Encode(const std::string& data) {
    std::string out;
    int val = 0, valb = -6;
    for (unsigned char c : data) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            out.push_back(base64_chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) out.push_back(base64_chars[((val << 8) >> (valb + 8)) & 0x3F]);
    while (out.size() % 4) out.push_back('=');
    return out;
}

std::string Base64Decode(std::string const& encoded_string) {
  int i = 0;
  int j = 0;
  int in_ = 0;
  unsigned char char_array_4[4], char_array_3[3];
  std::string ret;

  std::string clean_encoded = encoded_string;
  for (char& c : clean_encoded) {
      if (c == '-') c = '+';
      else if (c == '_') c = '/';
  }
  while (clean_encoded.size() % 4 != 0) {
      clean_encoded += '=';
  }

  int in_len = (int)clean_encoded.size();

  while (in_len-- && ( clean_encoded[in_] != '=') && is_base64(clean_encoded[in_])) {
    char_array_4[i++] = clean_encoded[in_]; in_++;
    if (i == 4) {
      for (i = 0; i < 4; i++)
        char_array_4[i] = (unsigned char)base64_chars.find(char_array_4[i]);

      char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
      char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
      char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

      for (i = 0; i < 3; i++)
        ret += char_array_3[i];
      i = 0;
    }
  }

  if (i) {
    for (j = i; j < 4; j++)
      char_array_4[j] = 0;

    for (j = 0; j < 4; j++)
      char_array_4[j] = (unsigned char)base64_chars.find(char_array_4[j]);

    char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
    char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
    char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

    for (j = 0; (j < i - 1); j++) ret += char_array_3[j];
  }

  return ret;
}

// AES-128-CBC Decryption via Windows BCrypt (CNG)
std::string DecryptAES128CBC(const std::string& key, const std::string& iv, const std::string& ciphertext) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_KEY_HANDLE hKey = NULL;
    DWORD cbKeyObject = 0, cbData = 0;
    PBYTE pbKeyObject = NULL;
    std::string plaintext;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, NULL, 0) != 0) return "";
    
    if (BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PBYTE)BCRYPT_CHAIN_MODE_CBC, sizeof(BCRYPT_CHAIN_MODE_CBC), 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbKeyObject, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    pbKeyObject = (PBYTE)HeapAlloc(GetProcessHeap(), 0, cbKeyObject);
    if (pbKeyObject == NULL) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptGenerateSymmetricKey(hAlg, &hKey, pbKeyObject, cbKeyObject, (PBYTE)key.data(), (ULONG)key.size(), 0) != 0) {
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    std::string ivCopy = iv;
    DWORD cbPlainText = 0;

    if (BCryptDecrypt(hKey, (PBYTE)ciphertext.data(), (ULONG)ciphertext.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), NULL, 0, &cbPlainText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    plaintext.resize(cbPlainText);
    if (BCryptDecrypt(hKey, (PBYTE)ciphertext.data(), (ULONG)ciphertext.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), (PBYTE)plaintext.data(), cbPlainText, &cbPlainText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    // PKCS7 Unpadding
    if (!plaintext.empty()) {
        unsigned char padVal = plaintext.back();
        if (padVal >= 1 && padVal <= 16) {
            bool validPad = true;
            for (size_t i = plaintext.size() - padVal; i < plaintext.size(); ++i) {
                if (plaintext[i] != padVal) {
                    validPad = false;
                    break;
                }
            }
            if (validPad) {
                plaintext.resize(plaintext.size() - padVal);
            }
        }
    }

    BCryptDestroyKey(hKey);
    HeapFree(GetProcessHeap(), 0, pbKeyObject);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    return plaintext;
}

std::string DecryptFernetPassword(const std::string& fernetKeyBase64, const std::string& cipherTextBase64) {
    std::string rawKey = Base64Decode(fernetKeyBase64);
    if (rawKey.size() != 32) return "";

    std::string rawCipher = Base64Decode(cipherTextBase64);
    if (rawCipher.size() < 9 + 16 + 32) return "";

    if ((unsigned char)rawCipher[0] != 0x80) return "";

    std::string iv = rawCipher.substr(9, 16);
    std::string actualCiphertext = rawCipher.substr(25, rawCipher.size() - 25 - 32);
    std::string aesKey = rawKey.substr(16, 16);

    return DecryptAES128CBC(aesKey, iv, actualCiphertext);
}

// Session Interface
class Session {
public:
    virtual ~Session() {}
    virtual bool SendInput(const std::string& data) = 0;
    virtual std::string GetOutput() = 0;
    virtual void Resize(int cols, int rows) = 0;
    virtual void Disconnect() = 0;
    virtual bool IsConnected() = 0;
};

// Local CMD Pseudo Console Session Class
class LocalSession : public Session {
public:
    std::string sessionId;
    HPCON hPC = NULL;
    HANDLE hProcess = NULL;
    HANDLE hThread = NULL;
    HANDLE hPipeInWrite = NULL;
    HANDLE hPipeOutRead = NULL;
    HANDLE hPipeInRead = NULL;
    HANDLE hPipeOutWrite = NULL;
    
    std::string outputBuffer;
    std::mutex bufferMutex;
    bool running = false;
    HANDLE hReadThread = NULL;

    LocalSession(const std::string& id) : sessionId(id) {}

    ~LocalSession() override {
        Disconnect();
    }

    bool Connect(int cols = 80, int rows = 24) {
        if (!CreatePipe(&hPipeInRead, &hPipeInWrite, NULL, 0)) return false;
        if (!CreatePipe(&hPipeOutRead, &hPipeOutWrite, NULL, 0)) {
            CleanupPipes();
            return false;
        }

        COORD size = { (SHORT)cols, (SHORT)rows };
        HRESULT hr = CreatePseudoConsole(size, hPipeInRead, hPipeOutWrite, 0, &hPC);
        if (FAILED(hr)) {
            CleanupPipes();
            return false;
        }

        STARTUPINFOEXW siEx = { 0 };
        siEx.StartupInfo.cb = sizeof(STARTUPINFOEXW);
        
        SIZE_T bytesRequired = 0;
        InitializeProcThreadAttributeList(NULL, 1, 0, &bytesRequired);
        siEx.lpAttributeList = (PPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(), 0, bytesRequired);
        if (!siEx.lpAttributeList) {
            ClosePseudoConsole(hPC); hPC = NULL;
            CleanupPipes();
            return false;
        }

        if (!InitializeProcThreadAttributeList(siEx.lpAttributeList, 1, 0, &bytesRequired)) {
            HeapFree(GetProcessHeap(), 0, siEx.lpAttributeList);
            ClosePseudoConsole(hPC); hPC = NULL;
            CleanupPipes();
            return false;
        }

        if (!UpdateProcThreadAttribute(siEx.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, hPC, sizeof(HPCON), NULL, NULL)) {
            DeleteProcThreadAttributeList(siEx.lpAttributeList);
            HeapFree(GetProcessHeap(), 0, siEx.lpAttributeList);
            ClosePseudoConsole(hPC); hPC = NULL;
            CleanupPipes();
            return false;
        }

        wchar_t cmdPath[MAX_PATH] = L"C:\\Windows\\System32\\cmd.exe";
        size_t len = 0;
        _wgetenv_s(&len, cmdPath, MAX_PATH, L"COMSPEC");

        PROCESS_INFORMATION pi = { 0 };
        BOOL success = CreateProcessW(
            NULL,
            cmdPath,
            NULL,
            NULL,
            TRUE,
            EXTENDED_STARTUPINFO_PRESENT,
            NULL,
            NULL,
            (LPSTARTUPINFOW)&siEx,
            &pi
        );

        DeleteProcThreadAttributeList(siEx.lpAttributeList);
        HeapFree(GetProcessHeap(), 0, siEx.lpAttributeList);

        if (!success) {
            ClosePseudoConsole(hPC); hPC = NULL;
            CleanupPipes();
            return false;
        }

        hProcess = pi.hProcess;
        hThread = pi.hThread;
        running = true;

        hReadThread = CreateThread(NULL, 0, StaticReadThread, this, 0, NULL);
        return true;
    }

    bool SendInput(const std::string& data) override {
        if (!running || !hPipeInWrite) return false;
        DWORD written = 0;
        return WriteFile(hPipeInWrite, data.data(), (DWORD)data.size(), &written, NULL);
    }

    std::string GetOutput() override {
        std::lock_guard<std::mutex> lock(bufferMutex);
        std::string out = outputBuffer;
        outputBuffer.clear();
        return out;
    }

    void Resize(int cols, int rows) override {
        if (running && hPC) {
            COORD size = { (SHORT)cols, (SHORT)rows };
            ResizePseudoConsole(hPC, size);
        }
    }

    void Disconnect() override {
        if (!running) return;
        running = false;

        if (hPipeInWrite) {
            CloseHandle(hPipeInWrite);
            hPipeInWrite = NULL;
        }

        if (hProcess) {
            WaitForSingleObject(hProcess, 300);
            TerminateProcess(hProcess, 0);
            CloseHandle(hProcess);
            hProcess = NULL;
        }
        if (hThread) {
            CloseHandle(hThread);
            hThread = NULL;
        }

        if (hPC) {
            ClosePseudoConsole(hPC);
            hPC = NULL;
        }

        CleanupPipes();

        if (hReadThread) {
            WaitForSingleObject(hReadThread, 500);
            CloseHandle(hReadThread);
            hReadThread = NULL;
        }
    }

    bool IsConnected() override {
        return running;
    }

private:
    void CleanupPipes() {
        if (hPipeInRead) { CloseHandle(hPipeInRead); hPipeInRead = NULL; }
        if (hPipeOutRead) { CloseHandle(hPipeOutRead); hPipeOutRead = NULL; }
        if (hPipeOutWrite) { CloseHandle(hPipeOutWrite); hPipeOutWrite = NULL; }
    }

    static DWORD WINAPI StaticReadThread(LPVOID param) {
        LocalSession* self = (LocalSession*)param;
        self->ReadLoop();
        return 0;
    }

    void ReadLoop() {
        char buffer[8192];
        DWORD readBytes = 0;
        while (running && hPipeOutRead) {
            if (ReadFile(hPipeOutRead, buffer, sizeof(buffer) - 1, &readBytes, NULL)) {
                if (readBytes > 0) {
                    std::lock_guard<std::mutex> lock(bufferMutex);
                    outputBuffer.append(buffer, readBytes);
                }
            } else {
                std::lock_guard<std::mutex> lock(bufferMutex);
                outputBuffer.append("\r\n[Process exited]\r\n");
                running = false;
                break;
            }
        }
    }
};

// SSH Remote Interactive Session Class
class SSHSession : public Session {
public:
    std::string sessionId;
    SOCKET sock = INVALID_SOCKET;
    LIBSSH2_SESSION* sshSession = NULL;
    LIBSSH2_CHANNEL* sshChannel = NULL;
    LIBSSH2_SFTP* sftpSession = NULL;
    
    std::string outputBuffer;
    std::mutex bufferMutex;
    std::mutex sshMutex;
    bool running = false;
    HANDLE hReadThread = NULL;
    std::string lastError;

    SSHSession(const std::string& id) : sessionId(id) {}

    ~SSHSession() override {
        Disconnect();
    }

    bool Connect(const std::string& hostname, int port, const std::string& username, const std::string& password, int cols = 80, int rows = 24) {
        lastError = "";
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            lastError = "WSAStartup failed";
            return false;
        }

        struct addrinfo hints = { 0 }, *addrs = NULL;
        hints.ai_family = AF_UNSPEC;
        hints.ai_socktype = SOCK_STREAM;
        hints.ai_protocol = IPPROTO_TCP;

        std::string portStr = std::to_string(port);
        int gai_res = getaddrinfo(hostname.c_str(), portStr.c_str(), &hints, &addrs);
        if (gai_res != 0) {
            lastError = "getaddrinfo failed for " + hostname + ":" + portStr + " (error: " + std::to_string(gai_res) + ")";
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

        int auth_res = libssh2_userauth_password(sshSession, username.c_str(), password.c_str());
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

        // 初始化 SFTP
        sftpSession = libssh2_sftp_init(sshSession);

        // 设置为非阻塞模式
        libssh2_session_set_blocking(sshSession, 0);

        running = true;
        hReadThread = CreateThread(NULL, 0, StaticReadThread, this, 0, NULL);

        return true;
    }

    bool SendInput(const std::string& data) override {
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

    std::string GetOutput() override {
        std::lock_guard<std::mutex> lock(bufferMutex);
        std::string out = outputBuffer;
        outputBuffer.clear();
        return out;
    }

    void Resize(int cols, int rows) override {
        if (running && sshChannel) {
            std::lock_guard<std::mutex> lock(sshMutex);
            libssh2_channel_request_pty_size(sshChannel, cols, rows);
        }
    }

    void Disconnect() override {
        if (!running) return;
        running = false;

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
            WaitForSingleObject(hReadThread, 500);
            CloseHandle(hReadThread);
            hReadThread = NULL;
        }
    }

    bool IsConnected() override {
        return running;
    }

    // SFTP Operations
    std::string ListDirectory(const std::string& path) {
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

    std::string CreateDirectory(const std::string& path) {
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

    std::string DeleteFile(const std::string& path) {
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

    std::string DeleteDirectory(const std::string& path) {
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

    std::string RenameFile(const std::string& oldPath, const std::string& newPath) {
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

    std::string GetFileInfo(const std::string& path) {
        if (!sftpSession) return "{\"success\":false,\"error\":\"SFTP session not initialized\"}";
        LIBSSH2_SFTP_ATTRIBUTES attrs;
        int rc = 0;
        while (true) {
            {
                std::lock_guard<std::mutex> lock(sshMutex);
                rc = libssh2_sftp_stat(sftpSession, path.c_str(), &attrs);
                if (rc != LIBSSH2_ERROR_EAGAIN) break;
            }
            Sleep(5);
        }
        if (rc != 0) {
            char *err_msg = NULL;
            int err_msg_len = 0;
            libssh2_session_last_error(sshSession, &err_msg, &err_msg_len, 0);
            std::string detail = (err_msg && err_msg_len > 0) ? std::string(err_msg, err_msg_len) : "unknown error";
            return "{\"success\":false,\"error\":\"stat failed: " + detail + "\"}";
        }
        nlohmann::json info;
        info["size"] = (attrs.flags & LIBSSH2_SFTP_ATTR_SIZE) ? attrs.filesize : 0;
        info["permissions"] = (attrs.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS) ? attrs.permissions : 0;
        info["mtime"] = (attrs.flags & LIBSSH2_SFTP_ATTR_ACMODTIME) ? attrs.mtime : 0;
        info["is_dir"] = (attrs.flags & LIBSSH2_SFTP_ATTR_PERMISSIONS) ? LIBSSH2_SFTP_S_ISDIR(attrs.permissions) : false;

        nlohmann::json response;
        response["success"] = true;
        response["info"] = info;
        return response.dump();
    }

    std::string DownloadFileContent(const std::string& path) {
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

    std::string UploadFileContent(const std::string& base64Content, const std::string& path) {
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

private:
    static DWORD WINAPI StaticReadThread(LPVOID param) {
        SSHSession* self = (SSHSession*)param;
        self->ReadLoop();
        return 0;
    }

    void ReadLoop() {
        char buffer[16384];
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
                int readBytes = libssh2_channel_read(sshChannel, buffer, sizeof(buffer) - 1);
                if (readBytes > 0) {
                    std::lock_guard<std::mutex> lock(bufferMutex);
                    outputBuffer.append(buffer, readBytes);
                } else if (readBytes < 0 && readBytes != LIBSSH2_ERROR_EAGAIN) {
                    std::lock_guard<std::mutex> lock(bufferMutex);
                    outputBuffer.append("\r\n[SSH Connection closed]\r\n");
                    running = false;
                    break;
                }
            } else if (select_res < 0) {
                running = false;
                break;
            }
        }
    }
};

// 异步文件上传线程
void UploadThread(std::shared_ptr<SSHSession> session, std::string fileData, std::string remotePath, std::string uploadId) {
    long long totalBytes = fileData.size();
    long long transferred = 0;
    
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

// 异步本地路径上传线程
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

// 异步内存下载线程
void DownloadThread(std::shared_ptr<SSHSession> session, std::string remotePath, std::string downloadId) {
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

// 异步直接下载到本地路径线程
void DownloadToPathThread(std::shared_ptr<SSHSession> session, std::string remotePath, std::wstring localPath, std::string downloadId) {
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

// Win32 Helpers
bool CopyToClipboard(const std::wstring& wtext) {
    if (!OpenClipboard(NULL)) return false;
    EmptyClipboard();
    size_t size = (wtext.size() + 1) * sizeof(wchar_t);
    HGLOBAL hMem = GlobalAlloc(GMEM_MOVEABLE, size);
    if (!hMem) {
        CloseClipboard();
        return false;
    }
    memcpy(GlobalLock(hMem), wtext.c_str(), size);
    GlobalUnlock(hMem);
    SetClipboardData(CF_UNICODETEXT, hMem);
    CloseClipboard();
    return true;
}

std::wstring GetClipboardText() {
    if (!OpenClipboard(NULL)) return L"";
    HANDLE hData = GetClipboardData(CF_UNICODETEXT);
    if (!hData) {
        CloseClipboard();
        return L"";
    }
    wchar_t* pText = static_cast<wchar_t*>(GlobalLock(hData));
    std::wstring text(pText);
    GlobalUnlock(hData);
    CloseClipboard();
    return text;
}

std::wstring GetDownloadsDirectory() {
    wchar_t* pPath = NULL;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_Downloads, 0, NULL, &pPath))) {
        std::wstring path(pPath);
        CoTaskMemFree(pPath);
        return path;
    }
    wchar_t* userProfile = nullptr;
    size_t len = 0;
    if (_wdupenv_s(&userProfile, &len, L"USERPROFILE") == 0 && userProfile != nullptr) {
        std::wstring path = std::wstring(userProfile) + L"\\Downloads";
        free(userProfile);
        return path;
    }
    return L"";
}

std::wstring GetCollisionFreePath(const std::wstring& filename) {
    std::wstring dir = GetDownloadsDirectory();
    if (dir.empty()) return filename;
    
    std::wstring fullPath = dir + L"\\" + filename;
    if (!PathFileExistsW(fullPath.c_str())) {
        return fullPath;
    }
    
    size_t dot = filename.find_last_of(L'.');
    std::wstring base = (dot == std::wstring::npos) ? filename : filename.substr(0, dot);
    std::wstring ext = (dot == std::wstring::npos) ? L"" : filename.substr(dot);
    
    int counter = 1;
    while (true) {
        std::wstring newName = base + L" (" + std::to_wstring(counter) + L")" + ext;
        std::wstring newFullPath = dir + L"\\" + newName;
        if (!PathFileExistsW(newFullPath.c_str())) {
            return newFullPath;
        }
        counter++;
    }
}

std::wstring ShowSaveFileDialog(const std::wstring& defaultName) {
    wchar_t szFile[MAX_PATH] = { 0 };
    wcscpy_s(szFile, defaultName.c_str());
    
    OPENFILENAMEW ofn = { 0 };
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = hWnd;
    ofn.lpstrFile = szFile;
    ofn.nMaxFile = sizeof(szFile) / sizeof(wchar_t);
    ofn.lpstrFilter = L"All Files\0*.*\0";
    ofn.nFilterIndex = 1;
    ofn.lpstrFileTitle = NULL;
    ofn.nMaxFileTitle = 0;
    ofn.lpstrInitialDir = NULL;
    ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_OVERWRITEPROMPT;
    
    if (GetSaveFileNameW(&ofn)) {
        return std::wstring(szFile);
    }
    return L"";
}

bool OpenLocalFile(const std::wstring& filePath) {
    // 强制转换为 HINSTANCE，并核对其值
    HINSTANCE res = ShellExecuteW(NULL, L"open", filePath.c_str(), NULL, NULL, SW_SHOWNORMAL);
    return ((INT_PTR)res > 32);
}

// Global Session Manager supporting both local and remote SSH sessions
class SessionManager {
public:
    std::unordered_map<std::string, std::shared_ptr<Session>> sessions;
    std::mutex managerMutex;
    
    std::string CreateLocalSession() {
        std::lock_guard<std::mutex> lock(managerMutex);
        std::string sessionId = "local_" + std::to_string(GetTickCount64()) + "_" + std::to_string(rand() % 1000);
        auto session = std::make_shared<LocalSession>(sessionId);
        if (session->Connect()) {
            sessions[sessionId] = session;
            return sessionId;
        }
        return "";
    }
    
    void AddSession(const std::string& id, std::shared_ptr<Session> session) {
        std::lock_guard<std::mutex> lock(managerMutex);
        sessions[id] = session;
    }
    
    std::shared_ptr<Session> GetSession(const std::string& id) {
        std::lock_guard<std::mutex> lock(managerMutex);
        auto it = sessions.find(id);
        if (it != sessions.end()) {
            return it->second;
        }
        return nullptr;
    }
    
    void DisconnectSession(const std::string& id) {
        std::lock_guard<std::mutex> lock(managerMutex);
        auto it = sessions.find(id);
        if (it != sessions.end()) {
            it->second->Disconnect();
            sessions.erase(it);
        }
    }
    
    void Cleanup() {
        std::lock_guard<std::mutex> lock(managerMutex);
        for (auto& pair : sessions) {
            pair.second->Disconnect();
        }
        sessions.clear();
    }
};

SessionManager globalSessionManager;

// API router and handler
void HandleApiCall(const std::string& reqId, const std::string& action, const nlohmann::json& args) {
    nlohmann::json response;
    response["id"] = reqId;
    
    try {
        if (action == "get_saved_connections") {
            std::wstring configDir = GetConfigDirectory();
            std::wstring connPath = configDir + L"\\connections.json";
            std::wstring keyPath = configDir + L"\\.key";
            
            std::string connData = ReadFileToUtf8(connPath);
            std::string keyData = ReadFileToUtf8(keyPath);
            
            nlohmann::json result = nlohmann::json::array();
            if (!connData.empty()) {
                nlohmann::json conns = nlohmann::json::parse(connData);
                for (auto it = conns.begin(); it != conns.end(); ++it) {
                    std::string key = it.key();
                    nlohmann::json conn = it.value();
                    conn["key"] = key;
                    
                    if (conn.contains("password_encrypted") && conn["password_encrypted"].get<bool>()) {
                        std::string encryptedPassword = conn["password"].get<std::string>();
                        if (!keyData.empty()) {
                            std::string decrypted = DecryptFernetPassword(keyData, encryptedPassword);
                            if (!decrypted.empty()) {
                                conn["password"] = decrypted;
                            } else {
                                conn["password"] = "";
                                conn["password_unavailable"] = true;
                            }
                        } else {
                            conn["password"] = "";
                            conn["password_unavailable"] = true;
                        }
                        conn.erase("password_encrypted");
                    }
                    result.push_back(conn);
                }
            }
            response["status"] = "success";
            response["result"] = result.dump();
        }
        else if (action == "delete_saved_connection") {
            std::string keyToDelete = args[0].get<std::string>();
            std::wstring configDir = GetConfigDirectory();
            std::wstring connPath = configDir + L"\\connections.json";
            
            std::string connData = ReadFileToUtf8(connPath);
            bool deleted = false;
            if (!connData.empty()) {
                nlohmann::json conns = nlohmann::json::parse(connData);
                if (conns.contains(keyToDelete)) {
                    conns.erase(keyToDelete);
                    WriteUtf8ToFile(connPath, conns.dump(2));
                    deleted = true;
                }
            }
            
            nlohmann::json retObj;
            retObj["success"] = deleted;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_command_library") {
            std::wstring configDir = GetConfigDirectory();
            std::wstring cmdPath = configDir + L"\\command_library.json";
            std::string cmdData = ReadFileToUtf8(cmdPath);
            
            nlohmann::json retObj;
            retObj["success"] = true;
            if (cmdData.empty()) {
                retObj["folders"] = nlohmann::json::array();
            } else {
                try {
                    retObj["folders"] = nlohmann::json::parse(cmdData);
                } catch(...) {
                    retObj["folders"] = nlohmann::json::array();
                }
            }
            
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "save_command_library") {
            std::string cmdData = args[0].get<std::string>();
            std::wstring configDir = GetConfigDirectory();
            std::wstring cmdPath = configDir + L"\\command_library.json";
            bool success = WriteUtf8ToFile(cmdPath, cmdData);
            
            nlohmann::json retObj;
            retObj["success"] = success;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "create_local_session") {
            std::string sessionId = globalSessionManager.CreateLocalSession();
            response["status"] = "success";
            response["result"] = sessionId;
        }
        else if (action == "connect") {
            std::string sessId = args[0].get<std::string>();
            std::string paramsStr = args[1].get<std::string>();
            
            auto params = nlohmann::json::parse(paramsStr);
            std::string hostname = params.value("hostname", "");
            int port = params.value("port", 22);
            std::string username = params.value("username", "");
            std::string password = params.value("password", "");
            
            auto session = std::make_shared<SSHSession>(sessId);
            bool success = session->Connect(hostname, port, username, password);
            
            nlohmann::json retObj;
            if (success) {
                globalSessionManager.AddSession(sessId, session);
                retObj["success"] = true;
            } else {
                retObj["success"] = false;
                retObj["error"] = session->lastError.empty() ? "SSH connection failed before opening a shell" : session->lastError;
            }
            
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "send_input") {
            std::string sessId = args[0].get<std::string>();
            std::string data = args[1].get<std::string>();
            auto session = globalSessionManager.GetSession(sessId);
            bool success = false;
            if (session) {
                success = session->SendInput(data);
            }
            
            nlohmann::json retObj;
            retObj["success"] = success;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_output") {
            std::string sessId = args[0].get<std::string>();
            auto session = globalSessionManager.GetSession(sessId);
            std::string output = "";
            if (session) {
                output = session->GetOutput();
            }
            
            nlohmann::json retObj;
            retObj["output"] = output;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "resize_terminal") {
            std::string sessId = args[0].get<std::string>();
            int cols = args[1].get<int>();
            int rows = args[2].get<int>();
            auto session = globalSessionManager.GetSession(sessId);
            if (session) {
                session->Resize(cols, rows);
            }
            
            nlohmann::json retObj;
            retObj["success"] = true;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "disconnect") {
            std::string sessId = args[0].get<std::string>();
            globalSessionManager.DisconnectSession(sessId);
            
            nlohmann::json retObj;
            retObj["success"] = true;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_status") {
            std::string sessId = args[0].get<std::string>();
            auto session = globalSessionManager.GetSession(sessId);
            nlohmann::json status;
            if (session) {
                status["connected"] = session->IsConnected();
                status["id"] = sessId;
                status["hostname"] = "Session";
                status["username"] = "user";
            } else {
                status["connected"] = false;
                status["id"] = sessId;
            }
            response["status"] = "success";
            response["result"] = status.dump();
        }
        else if (action == "window_minimize") {
            ShowWindow(hWnd, SW_MINIMIZE);
            response["status"] = "success";
            response["result"] = "null";
        }
        else if (action == "window_toggle_maximize") {
            WINDOWPLACEMENT wp = { sizeof(wp) };
            GetWindowPlacement(hWnd, &wp);
            if (wp.showCmd == SW_SHOWMAXIMIZED) {
                ShowWindow(hWnd, SW_RESTORE);
            } else {
                ShowWindow(hWnd, SW_MAXIMIZE);
            }
            response["status"] = "success";
            response["result"] = "null";
        }
        else if (action == "window_close") {
            DestroyWindow(hWnd);
            response["status"] = "success";
            response["result"] = "null";
        }
        else if (action == "create_session") {
            std::string sessionId = "ssh_" + std::to_string(GetTickCount64()) + "_" + std::to_string(rand() % 1000);
            response["status"] = "success";
            response["result"] = sessionId;
        }
        else if (action == "list_directory") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->ListDirectory(path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found or not an SSH session\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "create_directory") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->CreateDirectory(path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "delete_file") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->DeleteFile(path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "delete_directory") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->DeleteDirectory(path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "rename_file") {
            std::string sessId = args[0].get<std::string>();
            std::string oldPath = args[1].get<std::string>();
            std::string newPath = args[2].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->RenameFile(oldPath, newPath);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "get_file_info") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->GetFileInfo(path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "download_file_content") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->DownloadFileContent(path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "upload_file_content") {
            std::string sessId = args[0].get<std::string>();
            std::string content = args[1].get<std::string>();
            std::string path = args[2].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->UploadFileContent(content, path);
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "start_upload_with_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string base64Content = args[1].get<std::string>();
            std::string remotePath = args[2].get<std::string>();
            std::string uploadId = args[3].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            
            nlohmann::json res;
            if (sshSess) {
                std::thread(UploadThread, sshSess, base64Content, remotePath, uploadId).detach();
                res["success"] = true;
            } else {
                res["success"] = false;
                res["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "upload_from_path_with_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string localPathUtf8 = args[1].get<std::string>();
            std::string remotePath = args[2].get<std::string>();
            std::string uploadId = args[3].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            
            nlohmann::json res;
            if (sshSess) {
                std::wstring localPath = Utf8ToUtf16(localPathUtf8);
                std::thread(UploadFromPathThread, sshSess, localPath, remotePath, uploadId).detach();
                res["success"] = true;
            } else {
                res["success"] = false;
                res["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "get_upload_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string uploadId = args[1].get<std::string>();
            std::string progressJson = globalProgressManager.GetProgressJson(uploadId);
            response["status"] = "success";
            response["result"] = progressJson;
        }
        else if (action == "clear_upload_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string uploadId = args[1].get<std::string>();
            globalProgressManager.Clear(uploadId);
            nlohmann::json res;
            res["success"] = true;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "start_download_with_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string remotePath = args[1].get<std::string>();
            std::string downloadId = args[2].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            
            nlohmann::json res;
            if (sshSess) {
                std::thread(DownloadThread, sshSess, remotePath, downloadId).detach();
                res["success"] = true;
            } else {
                res["success"] = false;
                res["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "start_direct_download_with_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string remotePath = args[1].get<std::string>();
            std::string localPathUtf8 = args[2].get<std::string>();
            std::string downloadId = args[3].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            
            nlohmann::json res;
            if (sshSess) {
                std::wstring localPath = Utf8ToUtf16(localPathUtf8);
                std::thread(DownloadToPathThread, sshSess, remotePath, localPath, downloadId).detach();
                res["success"] = true;
            } else {
                res["success"] = false;
                res["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "get_download_progress") {
            std::string sessId = args[0].get<std::string>();
            std::string downloadId = args[1].get<std::string>();
            std::string progressJson = globalProgressManager.GetProgressJson(downloadId);
            response["status"] = "success";
            response["result"] = progressJson;
        }
        else if (action == "cancel_download") {
            std::string sessId = args[0].get<std::string>();
            std::string downloadId = args[1].get<std::string>();
            globalProgressManager.Cancel(downloadId);
            nlohmann::json res;
            res["success"] = true;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "clipboard_copy") {
            std::string text = args[0].get<std::string>();
            bool ok = CopyToClipboard(Utf8ToUtf16(text));
            nlohmann::json res;
            res["success"] = ok;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "clipboard_paste") {
            std::wstring wtext = GetClipboardText();
            nlohmann::json res;
            res["success"] = true;
            res["text"] = Utf16ToUtf8(wtext);
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "get_quick_download_path") {
            std::string fileName = args[0].get<std::string>();
            std::wstring freePath = GetCollisionFreePath(Utf8ToUtf16(fileName));
            nlohmann::json res;
            res["success"] = true;
            res["path"] = Utf16ToUtf8(freePath);
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "show_save_file_dialog") {
            std::string defaultName = args[0].get<std::string>();
            std::wstring savePath = ShowSaveFileDialog(Utf8ToUtf16(defaultName));
            nlohmann::json res;
            if (!savePath.empty()) {
                res["success"] = true;
                res["path"] = Utf16ToUtf8(savePath);
            } else {
                res["success"] = false;
                res["cancelled"] = true;
            }
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "open_local_file") {
            std::string filePath = args[0].get<std::string>();
            bool ok = OpenLocalFile(Utf8ToUtf16(filePath));
            nlohmann::json res;
            res["success"] = ok;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "get_encryption_status") {
            nlohmann::json res;
            res["available"] = true;
            res["warning_needed"] = false;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "mark_encryption_warning_shown") {
            response["status"] = "success";
            response["result"] = "null";
        }
        else if (action == "get_openai_settings") {
            nlohmann::json res;
            res["api_key"] = "";
            res["base_url"] = "";
            res["model"] = "";
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "open_chatgpt_window") {
            response["status"] = "success";
            response["result"] = "null";
        }
        else if (action == "window_drag") {
            ReleaseCapture();
            SendMessage(hWnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
            response["status"] = "success";
            response["result"] = "null";
        }
        else {
            nlohmann::json errObj;
            errObj["success"] = false;
            errObj["error"] = "API method not implemented in C++: " + action;
            response["status"] = "success";
            response["result"] = errObj.dump();
        }
    }
    catch (const std::exception& e) {
        response["status"] = "error";
        response["error"] = e.what();
    }
    
    std::wstring responseW = Utf8ToUtf16(response.dump());
    webviewWindow->PostWebMessageAsJson(responseW.c_str());
}

LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM);

int CALLBACK WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    hInst = hInstance;
    libssh2_init(0);

    WNDCLASSEX wcex;
    wcex.cbSize = sizeof(WNDCLASSEX);
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.cbClsExtra = 0;
    wcex.cbWndExtra = 0;
    wcex.hInstance = hInstance;
    wcex.hIcon = LoadIcon(hInstance, IDI_APPLICATION);
    wcex.hCursor = LoadCursor(NULL, IDC_ARROW);
    wcex.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wcex.lpszMenuName = NULL;
    wcex.lpszClassName = _T("PrismSSHCppWindowClass");
    wcex.hIconSm = LoadIcon(wcex.hInstance, IDI_APPLICATION);

    if (!RegisterClassEx(&wcex)) {
        MessageBox(NULL, _T("Call to RegisterClassEx failed!"), _T("PrismSSH C++"), 0);
        return 1;
    }

    hWnd = CreateWindow(
        _T("PrismSSHCppWindowClass"),
        _T("LdySSH"),
        WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX,
        CW_USEDEFAULT, CW_USEDEFAULT,
        1200, 800,
        NULL,
        NULL,
        hInstance,
        NULL
    );

    if (!hWnd) {
        MessageBox(NULL, _T("Call to CreateWindow failed!"), _T("PrismSSH C++"), 0);
        return 1;
    }

    MARGINS margins = { 1, 1, 1, 1 };
    DwmExtendFrameIntoClientArea(hWnd, &margins);

    ShowWindow(hWnd, nCmdShow);
    UpdateWindow(hWnd);

    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(nullptr, nullptr, nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [](HRESULT result, ICoreWebView2Environment* env) -> HRESULT {
                if (FAILED(result)) return result;

                env->CreateCoreWebView2Controller(hWnd, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT {
                        if (FAILED(result)) return result;

                        webviewController = controller;
                        webviewController->get_CoreWebView2(&webviewWindow);

                        RECT bounds;
                        GetClientRect(hWnd, &bounds);
                        webviewController->put_Bounds(bounds);

                        webviewWindow->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                            [](ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                                LPWSTR message;
                                args->TryGetWebMessageAsString(&message);
                                if (message != nullptr) {
                                    std::string msgUtf8 = Utf16ToUtf8(message);
                                    CoTaskMemFree(message);
                                    
                                    try {
                                        auto j = nlohmann::json::parse(msgUtf8);
                                        std::string reqId = j["id"].get<std::string>();
                                        std::string action = j["action"].get<std::string>();
                                        auto apiArgs = j["args"];
                                        
                                        HandleApiCall(reqId, action, apiArgs);
                                    }
                                    catch (...) {
                                    }
                                }
                                return S_OK;
                            }).Get(), nullptr);

                        std::wstring polyfillScript = L"(function() {\n"
                            L"    window.pywebview = {\n"
                            L"        api: new Proxy({}, {\n"
                            L"            get: function(target, prop) {\n"
                            L"                return function(...args) {\n"
                            L"                    return new Promise((resolve, reject) => {\n"
                            L"                        const requestId = 'req_' + Math.random().toString(36).substr(2, 9);\n"
                            L"                        window.__pendingPromises = window.__pendingPromises || {};\n"
                            L"                        window.__pendingPromises[requestId] = { resolve, reject };\n"
                            L"                        window.chrome.webview.postMessage(JSON.stringify({\n"
                            L"                            id: requestId,\n"
                            L"                            action: prop,\n"
                            L"                            args: args\n"
                            L"                        }));\n"
                            L"                    });\n"
                            L"                };\n"
                            L"            }\n"
                            L"        })\n"
                            L"    };\n"
                            L"    window.windowMinimize = function() { window.pywebview.api.window_minimize(); };\n"
                            L"    window.windowMaximize = function() { window.pywebview.api.window_toggle_maximize(); };\n"
                            L"    window.windowClose = function() { window.pywebview.api.window_close(); };\n"
                            L"    window.chrome.webview.addEventListener('message', function(event) {\n"
                            L"        try {\n"
                            L"            let response = event.data;\n"
                            L"            if (typeof response === 'string') {\n"
                            L"                response = JSON.parse(response);\n"
                            L"            }\n"
                            L"            if (response && response.id && window.__pendingPromises) {\n"
                            L"                const promise = window.__pendingPromises[response.id];\n"
                            L"                if (promise) {\n"
                            L"                    if (response.status === 'success') {\n"
                            L"                        promise.resolve(response.result);\n"
                            L"                    } else {\n"
                            L"                        promise.reject(new Error(response.error));\n"
                            L"                    }\n"
                            L"                    delete window.__pendingPromises[response.id];\n"
                            L"                }\n"
                            L"            }\n"
                            L"        } catch(e) { console.error(e); }\n"
                            L"    });\n"
                            L"    document.addEventListener('mousedown', function(e) {\n"
                            L"        let el = e.target;\n"
                            L"        while (el && el !== document.body) {\n"
                            L"            if (el.classList && el.classList.contains('pywebview-drag-region')) {\n"
                            L"                if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {\n"
                            L"                    window.chrome.webview.postMessage(JSON.stringify({\n"
                            L"                        id: 'drag',\n"
                            L"                        action: 'window_drag',\n"
                            L"                        args: []\n"
                            L"                    }));\n"
                            L"                    break;\n"
                            L"                }\n"
                            L"            }\n"
                            L"            el = el.parentElement;\n"
                            L"        }\n"
                            L"    });\n"
                            L"})();";

                        webviewWindow->AddScriptToExecuteOnDocumentCreated(polyfillScript.c_str(), nullptr);

                        std::wstring exeDir = GetExeDirectory();
                        std::wstring commandsJson = ReadFileToString(exeDir + L"\\ui\\static\\commands.json");
                        if (commandsJson.empty()) {
                            commandsJson = L"[]";
                        }
                        std::wstring suggestionsScript = L"window.LINUX_COMMAND_SUGGESTIONS = " + commandsJson + L";";
                        webviewWindow->AddScriptToExecuteOnDocumentCreated(suggestionsScript.c_str(), nullptr);

                        // Try to map virtual host name to enable localStorage
                        ComPtr<ICoreWebView2_3> webviewWindow3;
                        if (SUCCEEDED(webviewWindow.As(&webviewWindow3))) {
                            std::wstring uiPath = exeDir + L"\\ui";
                            webviewWindow3->SetVirtualHostNameToFolderMapping(
                                L"prismssh.local",
                                uiPath.c_str(),
                                COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW
                            );
                            webviewWindow->OpenDevToolsWindow();
                            webviewWindow->Navigate(L"https://prismssh.local/template.html");
                        } else {
                            // Fallback to NavigateToString
                            std::wstring html = ReadFileToString(exeDir + L"\\ui\\template.html");
                            std::wstring css = ReadFileToString(exeDir + L"\\ui\\static\\styles.css");
                            std::wstring js = ReadFileToString(exeDir + L"\\ui\\static\\app.js");

                            // Precise CSS injection
                            size_t cssPos = html.find(L"static/styles.css");
                            if (cssPos != std::wstring::npos) {
                                size_t tagStart = html.rfind(L"<link", cssPos);
                                size_t tagEnd = html.find(L">", cssPos);
                                if (tagStart != std::wstring::npos && tagEnd != std::wstring::npos) {
                                    html.replace(tagStart, tagEnd - tagStart + 1, L"<style>\n" + css + L"\n</style>");
                                }
                            } else {
                                size_t headPos = html.find(L"</head>");
                                if (headPos != std::wstring::npos) {
                                    html.insert(headPos, L"<style>\n" + css + L"\n</style>\n");
                                }
                            }

                            // Precise JS injection
                            size_t jsPos = html.find(L"static/app.js");
                            if (jsPos != std::wstring::npos) {
                                size_t tagStart = html.rfind(L"<script", jsPos);
                                size_t tagEnd = html.find(L"</script>", jsPos);
                                if (tagStart != std::wstring::npos && tagEnd != std::wstring::npos) {
                                    html.replace(tagStart, tagEnd - tagStart + 9, L"<script>\n" + js + L"\n</script>");
                                }
                            } else {
                                size_t bodyPos = html.find(L"</body>");
                                if (bodyPos != std::wstring::npos) {
                                    html.insert(bodyPos, L"<script>\n" + js + L"\n</script>\n");
                                }
                            }

                            webviewWindow->OpenDevToolsWindow();
                            webviewWindow->NavigateToString(html.c_str());
                        }
                        return S_OK;
                    }).Get());
                return S_OK;
            }).Get());

    if (FAILED(hr)) {
        MessageBox(NULL, _T("WebView2 Environment creation failed!"), _T("PrismSSH C++"), 0);
    }

    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    globalSessionManager.Cleanup();
    libssh2_exit();

    return (int)msg.wParam;
}

LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_SIZE:
        if (webviewController != nullptr) {
            RECT bounds;
            GetClientRect(hWnd, &bounds);
            webviewController->put_Bounds(bounds);
        }
        break;
    case WM_DESTROY:
        globalSessionManager.Cleanup();
        PostQuitMessage(0);
        break;
    default:
        return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}
