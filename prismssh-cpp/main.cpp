#define WIN32_LEAN_AND_MEAN
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

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ws2_32.lib")

using namespace Microsoft::WRL;

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
    
    std::string outputBuffer;
    std::mutex bufferMutex;
    bool running = false;
    HANDLE hReadThread = NULL;

    SSHSession(const std::string& id) : sessionId(id) {}

    ~SSHSession() override {
        Disconnect();
    }

    bool Connect(const std::string& hostname, int port, const std::string& username, const std::string& password, int cols = 80, int rows = 24) {
        WSADATA wsaData;
        WSAStartup(MAKEWORD(2, 2), &wsaData);

        struct addrinfo hints = { 0 }, *addrs = NULL;
        hints.ai_family = AF_UNSPEC;
        hints.ai_socktype = SOCK_STREAM;
        hints.ai_protocol = IPPROTO_TCP;

        std::string portStr = std::to_string(port);
        if (getaddrinfo(hostname.c_str(), portStr.c_str(), &hints, &addrs) != 0) {
            return false;
        }

        for (struct addrinfo* addr = addrs; addr != NULL; addr = addr->ai_next) {
            sock = socket(addr->ai_family, addr->ai_socktype, addr->ai_protocol);
            if (sock == INVALID_SOCKET) continue;

            if (connect(sock, addr->ai_addr, (int)addr->ai_addrlen) == 0) {
                break;
            }
            closesocket(sock);
            sock = INVALID_SOCKET;
        }
        freeaddrinfo(addrs);

        if (sock == INVALID_SOCKET) return false;

        int bufSize = 256 * 1024;
        setsockopt(sock, SOL_SOCKET, SO_RCVBUF, (char*)&bufSize, sizeof(bufSize));
        setsockopt(sock, SOL_SOCKET, SO_SNDBUF, (char*)&bufSize, sizeof(bufSize));
        BOOL noDelay = TRUE;
        setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, (char*)&noDelay, sizeof(noDelay));

        sshSession = libssh2_session_init();
        if (!sshSession) {
            closesocket(sock);
            sock = INVALID_SOCKET;
            return false;
        }

        if (libssh2_session_handshake(sshSession, sock) != 0) {
            libssh2_session_free(sshSession);
            sshSession = NULL;
            closesocket(sock);
            sock = INVALID_SOCKET;
            return false;
        }

        if (libssh2_userauth_password(sshSession, username.c_str(), password.c_str()) != 0) {
            libssh2_session_free(sshSession);
            sshSession = NULL;
            closesocket(sock);
            sock = INVALID_SOCKET;
            return false;
        }

        sshChannel = libssh2_channel_open_session(sshSession);
        if (!sshChannel) {
            libssh2_session_free(sshSession);
            sshSession = NULL;
            closesocket(sock);
            sock = INVALID_SOCKET;
            return false;
        }

        if (libssh2_channel_request_pty(sshChannel, "xterm-256color") != 0) {
            libssh2_channel_free(sshChannel);
            sshChannel = NULL;
            libssh2_session_free(sshSession);
            sshSession = NULL;
            closesocket(sock);
            sock = INVALID_SOCKET;
            return false;
        }

        if (libssh2_channel_shell(sshChannel) != 0) {
            libssh2_channel_free(sshChannel);
            sshChannel = NULL;
            libssh2_session_free(sshSession);
            sshSession = NULL;
            closesocket(sock);
            sock = INVALID_SOCKET;
            return false;
        }

        libssh2_channel_request_pty_size(sshChannel, cols, rows);

        running = true;
        hReadThread = CreateThread(NULL, 0, StaticReadThread, this, 0, NULL);

        return true;
    }

    bool SendInput(const std::string& data) override {
        if (!running || !sshChannel) return false;
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
            libssh2_channel_request_pty_size(sshChannel, cols, rows);
        }
    }

    void Disconnect() override {
        if (!running) return;
        running = false;

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

private:
    static DWORD WINAPI StaticReadThread(LPVOID param) {
        SSHSession* self = (SSHSession*)param;
        self->ReadLoop();
        return 0;
    }

    void ReadLoop() {
        char buffer[16384];
        while (running && sshChannel) {
            int readBytes = libssh2_channel_read(sshChannel, buffer, sizeof(buffer) - 1);
            if (readBytes > 0) {
                std::lock_guard<std::mutex> lock(bufferMutex);
                outputBuffer.append(buffer, readBytes);
            } else if (readBytes == LIBSSH2_ERROR_EAGAIN) {
                Sleep(5);
            } else {
                std::lock_guard<std::mutex> lock(bufferMutex);
                outputBuffer.append("\r\n[SSH Connection closed]\r\n");
                running = false;
                break;
            }
        }
    }
};

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
                retObj["error"] = "SSH connection failed before opening a shell";
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
