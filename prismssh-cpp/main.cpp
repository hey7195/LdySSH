#define _WINSOCK_DEPRECATED_NO_WARNINGS
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

struct EditMapping {
    std::string sessionId;
    std::string remotePath;
    FILETIME lastWriteTime;
};
std::unordered_map<std::wstring, EditMapping> editMappings;
std::mutex editMappingMutex;

bool SyncEditedFile(const std::wstring& tempPath);

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

std::string TrimString(const std::string& str) {
    if (str.empty()) return "";
    size_t first = str.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\r\n");
    return str.substr(first, (last - first + 1));
}

std::vector<std::string> SplitString(const std::string& str, char delim) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream tokenStream(str);
    while (std::getline(tokenStream, token, delim)) {
        tokens.push_back(token);
    }
    return tokens;
}

std::vector<std::string> SplitStringWhitespace(const std::string& str) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream tokenStream(str);
    while (tokenStream >> token) {
        tokens.push_back(token);
    }
    return tokens;
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

// AES-128-CBC Encryption via Windows BCrypt (CNG)
std::string EncryptAES128CBC(const std::string& key, const std::string& iv, const std::string& plaintext) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_KEY_HANDLE hKey = NULL;
    DWORD cbKeyObject = 0, cbData = 0;
    PBYTE pbKeyObject = NULL;
    std::string ciphertext;

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

    // PKCS7 Padding
    size_t padLen = 16 - (plaintext.size() % 16);
    std::string paddedText = plaintext;
    paddedText.append(padLen, (char)padLen);

    std::string ivCopy = iv;
    DWORD cbCipherText = 0;

    if (BCryptEncrypt(hKey, (PBYTE)paddedText.data(), (ULONG)paddedText.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), NULL, 0, &cbCipherText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    ciphertext.resize(cbCipherText);
    if (BCryptEncrypt(hKey, (PBYTE)paddedText.data(), (ULONG)paddedText.size(), NULL, (PBYTE)ivCopy.data(), (ULONG)ivCopy.size(), (PBYTE)ciphertext.data(), cbCipherText, &cbCipherText, 0) != 0) {
        BCryptDestroyKey(hKey);
        HeapFree(GetProcessHeap(), 0, pbKeyObject);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    BCryptDestroyKey(hKey);
    HeapFree(GetProcessHeap(), 0, pbKeyObject);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    return ciphertext;
}

std::string CalculateHmacSha256(const std::string& key, const std::string& data) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    DWORD cbHash = 0, cbData = 0;
    std::string hashVal;

    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG) != 0) return "";

    if (BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PBYTE)&cbHash, sizeof(DWORD), &cbData, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptCreateHash(hAlg, &hHash, NULL, 0, (PBYTE)key.data(), (ULONG)key.size(), 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    if (BCryptHashData(hHash, (PBYTE)data.data(), (ULONG)data.size(), 0) != 0) {
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    hashVal.resize(cbHash);
    if (BCryptFinishHash(hHash, (PBYTE)hashVal.data(), cbHash, 0) != 0) {
        BCryptDestroyHash(hHash);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }

    BCryptDestroyHash(hHash);
    BCryptCloseAlgorithmProvider(hAlg, 0);

    return hashVal;
}

std::string EncryptFernetPassword(const std::string& fernetKeyBase64, const std::string& plainText) {
    std::string rawKey = Base64Decode(fernetKeyBase64);
    if (rawKey.size() != 32) return "";

    std::string iv(16, '\0');
    BCRYPT_ALG_HANDLE hRng = NULL;
    if (BCryptOpenAlgorithmProvider(&hRng, BCRYPT_RNG_ALGORITHM, NULL, 0) == 0) {
        BCryptGenRandom(hRng, (PUCHAR)iv.data(), 16, 0);
        BCryptCloseAlgorithmProvider(hRng, 0);
    } else {
        for (int i = 0; i < 16; ++i) iv[i] = (char)(rand() % 256);
    }

    std::string header(9, '\0');
    header[0] = (char)0x80;
    
    long long timestamp = (long long)time(NULL);
    for (int i = 0; i < 8; ++i) {
        header[8 - i] = (char)(timestamp & 0xFF);
        timestamp >>= 8;
    }

    std::string aesKey = rawKey.substr(16, 16);
    std::string ciphertext = EncryptAES128CBC(aesKey, iv, plainText);
    if (ciphertext.empty()) return "";

    std::string signTarget = header + iv + ciphertext;

    std::string hmacKey = rawKey.substr(0, 16);
    std::string hmacVal = CalculateHmacSha256(hmacKey, signTarget);
    if (hmacVal.empty()) return "";

    std::string finalRaw = signTarget + hmacVal;
    return Base64Encode(finalRaw);
}

std::string GetOrCreateFernetKey() {
    std::wstring configDir = GetConfigDirectory();
    std::wstring keyPath = configDir + L"\\.key";
    std::string keyData = ReadFileToUtf8(keyPath);
    if (!keyData.empty()) {
        return keyData;
    }

    std::string rawKey(32, '\0');
    BCRYPT_ALG_HANDLE hRng = NULL;
    if (BCryptOpenAlgorithmProvider(&hRng, BCRYPT_RNG_ALGORITHM, NULL, 0) == 0) {
        BCryptGenRandom(hRng, (PUCHAR)rawKey.data(), 32, 0);
        BCryptCloseAlgorithmProvider(hRng, 0);
    } else {
        for (int i = 0; i < 32; ++i) rawKey[i] = (char)(rand() % 256);
    }

    std::string keyBase64 = Base64Encode(rawKey);
    WriteUtf8ToFile(keyPath, keyBase64);
    
    std::wstring keyInfoPath = configDir + L"\\.key_info";
    std::string rawSalt(32, '\0');
    if (BCryptOpenAlgorithmProvider(&hRng, BCRYPT_RNG_ALGORITHM, NULL, 0) == 0) {
        BCryptGenRandom(hRng, (PUCHAR)rawSalt.data(), 32, 0);
        BCryptCloseAlgorithmProvider(hRng, 0);
    }
    WriteUtf8ToFile(keyInfoPath, rawSalt);

    return keyBase64;
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

struct PortForwardInfo {
    std::string id;
    std::string type; // "local", "remote", "dynamic"
    int local_port = 0;
    std::string remote_host;
    int remote_port = 0;
    std::string local_host;
    int remote_port_remote = 0;
    bool active = false;
    int connections = 0;
    std::string description;
    SOCKET serverSocket = INVALID_SOCKET;
    HANDLE hThread = NULL;
};

// SSH Remote Interactive Session Class
class SSHSession : public Session {
public:
    std::string sessionId;
    std::unordered_map<std::string, std::shared_ptr<PortForwardInfo>> portForwards;
    std::mutex forwardMutex;

    std::string CreateLocalPortForward(std::shared_ptr<SSHSession> self, int localPort, const std::string& remoteHost, int remotePort);
    std::string CreateRemotePortForward(std::shared_ptr<SSHSession> self, int remotePort, const std::string& localHost, int localPort);
    std::string CreateDynamicPortForward(std::shared_ptr<SSHSession> self, int localPort);
    bool StopPortForward(const std::string& forwardId);
    std::string ListPortForwards();
    void RelayData(SOCKET localSock, LIBSSH2_CHANNEL* channel, std::shared_ptr<SSHSession> session, std::shared_ptr<PortForwardInfo> pfInfo);
    bool DownloadFile(const std::string& remotePath, const std::wstring& localPath);
    bool UploadFile(const std::wstring& localPath, const std::string& remotePath);
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

        // 停止所有端口转发
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
        // 等待这些线程退出
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
            WaitForSingleObject(hReadThread, 500);
            CloseHandle(hReadThread);
            hReadThread = NULL;
        }
    }

    bool IsConnected() override {
        return running;
    }

    std::string osType = "";

    std::string ExecuteCommand(const std::string& command) {
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

    std::string DetectOS() {
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

    std::string GetSystemInfo() {
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

    std::string GetSystemStats() {
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
                        double usage = total > 0 ? (double)(total - idle) / total * 100.0 : 0.0;
                        char buf[64];
                        sprintf_s(buf, "%.1f%%", usage);
                        stats["cpu_usage"] = buf;
                    } catch (...) {}
                }
            } else {
                std::string top_output = ExecuteCommand("top -bn1 | grep \"Cpu(s)\" | head -1");
                size_t id_pos = top_output.find("id,");
                if (id_pos != std::string::npos) {
                    auto left = top_output.substr(0, id_pos);
                    auto parts = SplitStringWhitespace(left);
                    if (!parts.empty()) {
                        try {
                            double idle = std::stod(parts.back());
                            double usage = 100.0 - idle;
                            char buf[64];
                            sprintf_s(buf, "%.1f%%", usage);
                            stats["cpu_usage"] = buf;
                        } catch (...) {}
                    }
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

    std::string GetProcessList() {
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

    std::string GetDiskUsage() {
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

    std::string GetNetworkInfo() {
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
        } else if (os == "linux") {
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
        }
        return net_array.dump();
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

void SSHSession::RelayData(SOCKET localSock, LIBSSH2_CHANNEL* channel, std::shared_ptr<SSHSession> session, std::shared_ptr<PortForwardInfo> pfInfo) {
    u_long mode = 1;
    ioctlsocket(localSock, FIONBIO, &mode);

    char localBuf[16384];
    char sshBuf[16384];
    
    int localLen = 0;
    int sshLen = 0;
    
    bool localClosed = false;
    bool sshClosed = false;
    
    while (pfInfo->active && session->running && !localClosed && !sshClosed) {
        if (localLen == 0) {
            int rc = recv(localSock, localBuf, sizeof(localBuf), 0);
            if (rc > 0) {
                localLen = rc;
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
            } else if (sent < 0) {
                int err = WSAGetLastError();
                if (err != WSAEWOULDBLOCK) {
                    localClosed = true;
                }
            }
        }
        
        if (localLen == 0 && sshLen == 0) {
            Sleep(1);
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

bool SSHSession::DownloadFile(const std::string& remotePath, const std::wstring& localPath) {
    if (!sftpSession) {
        lastError = "SFTP session not initialized";
        return false;
    }
    
    std::ofstream out(localPath.c_str(), std::ios::binary);
    if (!out.is_open()) {
        lastError = "Failed to open local file for writing";
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

    char buffer[32768];
    bool success = true;
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
            break;
        }
        if (rc == 0) break;
        out.write(buffer, rc);
        if (!out) {
            lastError = "write to local file failed";
            success = false;
            break;
        }
    }
    
    out.close();
    
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

bool SSHSession::UploadFile(const std::wstring& localPath, const std::string& remotePath) {
    if (!sftpSession) {
        lastError = "SFTP session not initialized";
        return false;
    }
    
    std::ifstream in(localPath.c_str(), std::ios::binary);
    if (!in.is_open()) {
        lastError = "Failed to open local file for reading";
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
    
    char buffer[32768];
    bool success = true;
    while (true) {
        in.read(buffer, sizeof(buffer));
        std::streamsize bytesRead = in.gcount();
        if (bytesRead <= 0) break;
        
        int totalWritten = 0;
        while (totalWritten < bytesRead) {
            int rc = 0;
            {
                std::lock_guard<std::mutex> lock(sshMutex);
                rc = libssh2_sftp_write(handle, buffer + totalWritten, (size_t)(bytesRead - totalWritten));
            }
            if (rc < 0) {
                if (rc == LIBSSH2_ERROR_EAGAIN) {
                    Sleep(5);
                    continue;
                }
                lastError = "write failed";
                success = false;
                break;
            }
            totalWritten += rc;
        }
        
        if (!success) break;
    }
    
    in.close();
    
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

FILETIME GetLastWriteTime(const std::wstring& filePath) {
    FILETIME ftWrite = { 0 };
    HANDLE hFile = CreateFileW(filePath.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile != INVALID_HANDLE_VALUE) {
        GetFileTime(hFile, NULL, NULL, &ftWrite);
        CloseHandle(hFile);
    }
    return ftWrite;
}

bool IsFileTimeNewer(const FILETIME& ft1, const FILETIME& ft2) {
    ULARGE_INTEGER u1, u2;
    u1.LowPart = ft1.dwLowDateTime;
    u1.HighPart = ft1.dwHighDateTime;
    u2.LowPart = ft2.dwLowDateTime;
    u2.HighPart = ft2.dwHighDateTime;
    return u1.QuadPart > u2.QuadPart;
}

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

void CleanupEditMappings() {
    std::lock_guard<std::mutex> lock(editMappingMutex);
    for (auto& pair : editMappings) {
        DeleteFileW(pair.first.c_str());
    }
    editMappings.clear();
}

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

std::string SafeGetJsonString(const nlohmann::json& j, const std::string& key, const std::string& defaultVal = "") {
    if (j.contains(key) && !j[key].is_null()) {
        try {
            if (j[key].is_string()) {
                return j[key].get<std::string>();
            }
        } catch(...) {}
    }
    return defaultVal;
}

bool SafeGetJsonBool(const nlohmann::json& j, const std::string& key, bool defaultVal = false) {
    if (j.contains(key) && !j[key].is_null()) {
        try {
            if (j[key].is_boolean()) {
                return j[key].get<bool>();
            }
        } catch(...) {}
    }
    return defaultVal;
}

int SafeGetJsonInt(const nlohmann::json& j, const std::string& key, int defaultVal = 0) {
    if (j.contains(key) && !j[key].is_null()) {
        try {
            if (j[key].is_number()) {
                return j[key].get<int>();
            }
        } catch(...) {}
    }
    return defaultVal;
}

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
            std::string hostname = SafeGetJsonString(params, "hostname", "");
            int port = SafeGetJsonInt(params, "port", 22);
            std::string username = SafeGetJsonString(params, "username", "");
            std::string password = SafeGetJsonString(params, "password", "");
            
            if (SafeGetJsonBool(params, "save", false)) {
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
                
                std::string storeKey = hostname + "@" + username;
                conns[storeKey] = connObj;
                
                WriteUtf8ToFile(connPath, conns.dump(2));
            }

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
        else if (action == "get_system_info") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->GetSystemInfo();
            } else {
                res = "{\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "get_system_stats") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->GetSystemStats();
            } else {
                res = "{\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "get_process_list") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->GetProcessList();
            } else {
                res = "{\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "get_disk_usage") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->GetDiskUsage();
            } else {
                res = "{\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "get_network_info") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->GetNetworkInfo();
            } else {
                res = "{\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "create_local_port_forward") {
            std::string sessId = args[0].get<std::string>();
            int localPort = 0;
            if (args[1].is_number()) localPort = args[1].get<int>();
            else if (args[1].is_string()) localPort = std::stoi(args[1].get<std::string>());
            
            std::string remoteHost = args[2].get<std::string>();
            
            int remotePort = 0;
            if (args[3].is_number()) remotePort = args[3].get<int>();
            else if (args[3].is_string()) remotePort = std::stoi(args[3].get<std::string>());
            
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string resId = "";
            if (sshSess) {
                resId = sshSess->CreateLocalPortForward(sshSess, localPort, remoteHost, remotePort);
            }
            response["status"] = "success";
            response["result"] = resId;
        }
        else if (action == "create_remote_port_forward") {
            std::string sessId = args[0].get<std::string>();
            int remotePort = 0;
            if (args[1].is_number()) remotePort = args[1].get<int>();
            else if (args[1].is_string()) remotePort = std::stoi(args[1].get<std::string>());
            
            std::string localHost = args[2].get<std::string>();
            
            int localPort = 0;
            if (args[3].is_number()) localPort = args[3].get<int>();
            else if (args[3].is_string()) localPort = std::stoi(args[3].get<std::string>());
            
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string resId = "";
            if (sshSess) {
                resId = sshSess->CreateRemotePortForward(sshSess, remotePort, localHost, localPort);
            }
            response["status"] = "success";
            response["result"] = resId;
        }
        else if (action == "create_dynamic_port_forward") {
            std::string sessId = args[0].get<std::string>();
            int localPort = 0;
            if (args[1].is_number()) localPort = args[1].get<int>();
            else if (args[1].is_string()) localPort = std::stoi(args[1].get<std::string>());
            
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string resId = "";
            if (sshSess) {
                resId = sshSess->CreateDynamicPortForward(sshSess, localPort);
            }
            response["status"] = "success";
            response["result"] = resId;
        }
        else if (action == "stop_port_forward") {
            std::string sessId = args[0].get<std::string>();
            std::string forwardId = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            bool ok = false;
            if (sshSess) {
                ok = sshSess->StopPortForward(forwardId);
            }
            response["status"] = "success";
            response["result"] = ok;
        }
        else if (action == "list_port_forwards") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string resList = "[]";
            if (sshSess) {
                resList = sshSess->ListPortForwards();
            }
            response["status"] = "success";
            response["result"] = resList;
        }
        else if (action == "edit_file") {
            std::string sessId = args[0].get<std::string>();
            std::string remotePath = args[1].get<std::string>();
            
            nlohmann::json res;
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            if (sshSess) {
                std::string downloadRes = sshSess->DownloadFileContent(remotePath);
                try {
                    auto j = nlohmann::json::parse(downloadRes);
                    if (j.value("success", false)) {
                        std::string base64Content = j.value("content", "");
                        std::string fileData = Base64Decode(base64Content);
                        
                        wchar_t tempDir[MAX_PATH];
                        GetTempPathW(MAX_PATH, tempDir);
                        
                        size_t slashPos = remotePath.find_last_of("/\\");
                        std::string rawFilename = (slashPos == std::string::npos) ? remotePath : remotePath.substr(slashPos + 1);
                        std::wstring wFilename = Utf8ToUtf16(rawFilename);
                        
                        std::wstring fullTempPath = std::wstring(tempDir) + L"prism_edit_" + std::to_wstring(GetTickCount64()) + L"_" + wFilename;
                        
                        std::ofstream f(fullTempPath, std::ios::binary);
                        if (f.is_open()) {
                            f.write(fileData.data(), fileData.size());
                            f.close();
                            
                            FILETIME ft = GetLastWriteTime(fullTempPath);
                            {
                                std::lock_guard<std::mutex> lock(editMappingMutex);
                                editMappings[fullTempPath] = { sessId, remotePath, ft };
                            }
                            
                            ShellExecuteW(NULL, L"open", fullTempPath.c_str(), NULL, NULL, SW_SHOWNORMAL);
                            
                            std::thread([fullTempPath]() {
                                while (true) {
                                    Sleep(500);
                                    
                                    bool mappingExists = false;
                                    {
                                        std::lock_guard<std::mutex> lock(editMappingMutex);
                                        if (editMappings.find(fullTempPath) != editMappings.end()) {
                                            mappingExists = true;
                                        }
                                    }
                                    
                                    if (!mappingExists) {
                                        DeleteFileW(fullTempPath.c_str());
                                        break;
                                    }
                                    
                                    SyncEditedFile(fullTempPath);
                                }
                            }).detach();
                            
                            res["success"] = true;
                            res["temp_path"] = Utf16ToUtf8(fullTempPath);
                            res["file_name"] = rawFilename;
                        } else {
                            res["success"] = false;
                            res["error"] = "Failed to write local temp file";
                        }
                    } else {
                        res["success"] = false;
                        res["error"] = j.value("error", "Failed to download file content");
                    }
                } catch (const std::exception& e) {
                    res["success"] = false;
                    res["error"] = e.what();
                }
            } else {
                res["success"] = false;
                res["error"] = "Session not found";
            }
            
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "sync_edited_file") {
            std::string tempPathUtf8 = args[0].get<std::string>();
            std::wstring tempPath = Utf8ToUtf16(tempPathUtf8);
            
            bool ok = SyncEditedFile(tempPath);
            nlohmann::json res;
            res["success"] = ok;
            if (ok) res["message"] = "File synced successfully";
            else res["error"] = "Failed to sync file";
            
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "cleanup_temp_file") {
            std::string tempPathUtf8 = args[0].get<std::string>();
            std::wstring tempPath = Utf8ToUtf16(tempPathUtf8);
            
            {
                std::lock_guard<std::mutex> lock(editMappingMutex);
                editMappings.erase(tempPath);
            }
            
            nlohmann::json res;
            res["success"] = true;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "download_file" || action == "download_file_to_path") {
            std::string sessId = args[0].get<std::string>();
            std::string remotePath = args[1].get<std::string>();
            std::string localPathUtf8 = args[2].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            
            if (sshSess) {
                std::wstring localPath = Utf8ToUtf16(localPathUtf8);
                std::thread(AsyncDownloadFileThread, reqId, sshSess, remotePath, localPath).detach();
            } else {
                nlohmann::json response;
                response["id"] = reqId;
                response["status"] = "success";
                nlohmann::json res;
                res["success"] = false;
                res["error"] = "Session not found";
                response["result"] = res.dump();
                
                if (webviewWindow != nullptr) {
                    std::wstring responseW = Utf8ToUtf16(response.dump());
                    webviewWindow->PostWebMessageAsJson(responseW.c_str());
                }
            }
            return;
        }
        else if (action == "upload_file") {
            std::string sessId = args[0].get<std::string>();
            std::string localPathUtf8 = args[1].get<std::string>();
            std::string remotePath = args[2].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            
            if (sshSess) {
                std::wstring localPath = Utf8ToUtf16(localPathUtf8);
                std::thread(AsyncUploadFileThread, reqId, sshSess, localPath, remotePath).detach();
            } else {
                nlohmann::json response;
                response["id"] = reqId;
                response["status"] = "success";
                nlohmann::json res;
                res["success"] = false;
                res["error"] = "Session not found";
                response["result"] = res.dump();
                
                if (webviewWindow != nullptr) {
                    std::wstring responseW = Utf8ToUtf16(response.dump());
                    webviewWindow->PostWebMessageAsJson(responseW.c_str());
                }
            }
            return;
        }
        else if (action == "cancel_upload") {
            std::string sessId = args[0].get<std::string>();
            std::string uploadId = args[1].get<std::string>();
            globalProgressManager.Cancel(uploadId);
            nlohmann::json res;
            res["success"] = true;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "get_pending_host_verification") {
            nlohmann::json res;
            res["pending"] = false;
            response["status"] = "success";
            response["result"] = res.dump();
        }
        else if (action == "verify_host_key") {
            nlohmann::json res;
            res["success"] = true;
            response["status"] = "success";
            response["result"] = res.dump();
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
    CleanupEditMappings();
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
        CleanupEditMappings();
        PostQuitMessage(0);
        break;
    default:
        return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}
