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
#include <unordered_map>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <thread>
#include <algorithm>
#include <commdlg.h>
#include <shlobj.h>
#include <shellapi.h>
#include <dwmapi.h>

// Project Header Files
#include "common_utils.h"
#include "crypto_utils.h"
#include "session.h"
#include "ssh_session.h"
#include "sftp_worker.h"
#include "chatgpt_subwindow.h"
#include "ui_assets.hpp"

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "comdlg32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "crypt32.lib")

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Callback;

#define WM_POST_WEB_MESSAGE (WM_USER + 101)
#define WM_TOPOLOGY_HEARTBEAT_UPDATE (WM_USER + 102)
#define IDI_APP_ICON 101

// Global variables
HINSTANCE hInst;
HWND hWnd;
ComPtr<ICoreWebView2Controller> webviewController;
ComPtr<ICoreWebView2> webviewWindow;
ComPtr<ICoreWebView2Environment> webviewEnv;

struct HeartbeatUpdate {
    std::string hostname;
    int delay;
    std::string status;
};

// Forward declaration
std::wstring Utf8ToUtf16(const std::string& utf8);

// Non-blocking socket ping thread
void PingHostThread(std::string hostname, int port) {
    SOCKET connSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (connSocket == INVALID_SOCKET) {
        HeartbeatUpdate* update = new HeartbeatUpdate{hostname, -1, "disconnected"};
        PostMessage(hWnd, WM_TOPOLOGY_HEARTBEAT_UPDATE, 0, (LPARAM)update);
        return;
    }

    u_long mode = 1;
    ioctlsocket(connSocket, FIONBIO, &mode);

    sockaddr_in clientService;
    clientService.sin_family = AF_INET;
    
    hostent* host = gethostbyname(hostname.c_str());
    if (host == nullptr) {
        clientService.sin_addr.s_addr = inet_addr(hostname.c_str());
        if (clientService.sin_addr.s_addr == INADDR_NONE) {
            closesocket(connSocket);
            HeartbeatUpdate* update = new HeartbeatUpdate{hostname, -1, "disconnected"};
            PostMessage(hWnd, WM_TOPOLOGY_HEARTBEAT_UPDATE, 0, (LPARAM)update);
            return;
        }
    } else {
        clientService.sin_addr.s_addr = *(u_long*)host->h_addr_list[0];
    }
    clientService.sin_port = htons(port);

    LARGE_INTEGER frequency;
    LARGE_INTEGER start;
    LARGE_INTEGER end;
    QueryPerformanceFrequency(&frequency);
    QueryPerformanceCounter(&start);

    connect(connSocket, (SOCKADDR*)&clientService, sizeof(clientService));

    fd_set writeSet;
    FD_ZERO(&writeSet);
    FD_SET(connSocket, &writeSet);
    
    timeval timeout;
    timeout.tv_sec = 1;
    timeout.tv_usec = 500000;

    int selectRet = select(0, nullptr, &writeSet, nullptr, &timeout);
    int delay = -1;
    std::string status = "disconnected";

    if (selectRet > 0 && FD_ISSET(connSocket, &writeSet)) {
        QueryPerformanceCounter(&end);
        delay = (int)((end.QuadPart - start.QuadPart) * 1000 / frequency.QuadPart);
        status = "connected";
    }

    closesocket(connSocket);

    HeartbeatUpdate* update = new HeartbeatUpdate{hostname, delay, status};
    PostMessage(hWnd, WM_TOPOLOGY_HEARTBEAT_UPDATE, 0, (LPARAM)update);
}

// Heartbeat Loop Thread
void TopologyHeartbeatLoop() {
    // Wait for the window and WebView to be fully initialized first
    std::this_thread::sleep_for(std::chrono::seconds(5));

    while (true) {
        std::wstring configDir = GetConfigDirectory();
        std::wstring connPath = configDir + L"\\connections.json";
        std::string connData = ReadConnectionConfigWithRecovery(connPath);

        if (!connData.empty()) {
            try {
                nlohmann::json conns = nlohmann::json::parse(connData);
                std::vector<std::thread> pingThreads;
                
                for (auto it = conns.begin(); it != conns.end(); ++it) {
                    nlohmann::json conn = it.value();
                    if (conn.contains("hostname")) {
                        std::string hostname = conn["hostname"].get<std::string>();
                        int port = conn.contains("port") ? conn["port"].get<int>() : 22;
                        pingThreads.push_back(std::thread(PingHostThread, hostname, port));
                    }
                }

                for (auto& t : pingThreads) {
                    if (t.joinable()) {
                        t.join();
                    }
                }
            }
            catch (...) {
            }
        }
        
        std::this_thread::sleep_for(std::chrono::seconds(8));
    }
}

// Clipboard Helpers
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

// Dialog & Local File Utilities
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

std::wstring ShowOpenFileDialog() {
    wchar_t szFile[MAX_PATH] = { 0 };
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
    ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST;
    
    if (GetOpenFileNameW(&ofn)) {
        return std::wstring(szFile);
    }
    return L"";
}

bool OpenLocalFile(const std::wstring& filePath) {
    HINSTANCE res = ShellExecuteW(NULL, L"open", filePath.c_str(), NULL, NULL, SW_SHOWNORMAL);
    return ((INT_PTR)res > 32);
}

// API router and handler
void HandleApiCall(const std::string& reqId, const std::string& action, const nlohmann::json& args) {
    nlohmann::json response;
    response["id"] = reqId;
    
    try {
        if (action == "fallback_retry") {
            std::wstring exeDir = GetExeDirectory();
            std::wstring uiPath = exeDir + L"\\ui";
            std::wstring templatePath = uiPath + L"\\template.html";
            
            DWORD attrib = GetFileAttributesW(templatePath.c_str());
            bool uiFolderExists = (attrib != INVALID_FILE_ATTRIBUTES && !(attrib & FILE_ATTRIBUTE_DIRECTORY));
            
            if (uiFolderExists) {
                ComPtr<ICoreWebView2_3> webviewWindow3;
                if (SUCCEEDED(webviewWindow.As(&webviewWindow3))) {
                    webviewWindow3->SetVirtualHostNameToFolderMapping(
                        L"ldyssh.local",
                        uiPath.c_str(),
                        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW
                    );
                    webviewWindow->Navigate(L"https://ldyssh.local/template.html");
                }
            } else {
                std::wstring wFallbackHtml = Utf8ToUtf16(EMBEDDED_FALLBACK_HTML);
                webviewWindow->NavigateToString(wFallbackHtml.c_str());
            }
            return;
        }

        if (action == "get_saved_connections") {
            NamedMutexLock lock(L"Global\\LdySSHConfigMutex");
            std::wstring configDir = GetConfigDirectory();
            std::wstring connPath = configDir + L"\\connections.json";
            std::wstring keyPath = configDir + L"\\.key";
            
            std::string connData = ReadConnectionConfigWithRecovery(connPath);
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

                    if (conn.contains("jumpPass_encrypted") && conn["jumpPass_encrypted"].get<bool>()) {
                        std::string encryptedJumpPass = conn["jumpPass"].get<std::string>();
                        if (!keyData.empty()) {
                            std::string decrypted = DecryptFernetPassword(keyData, encryptedJumpPass);
                            if (!decrypted.empty()) {
                                conn["jumpPass"] = decrypted;
                            } else {
                                conn["jumpPass"] = "";
                            }
                        } else {
                            conn["jumpPass"] = "";
                        }
                        conn.erase("jumpPass_encrypted");
                    }

                    if (conn.contains("proxyPass_encrypted") && conn["proxyPass_encrypted"].get<bool>()) {
                        std::string encryptedProxyPass = conn["proxyPass"].get<std::string>();
                        if (!keyData.empty()) {
                            std::string decrypted = DecryptFernetPassword(keyData, encryptedProxyPass);
                            if (!decrypted.empty()) {
                                conn["proxyPass"] = decrypted;
                            } else {
                                conn["proxyPass"] = "";
                            }
                        } else {
                            conn["proxyPass"] = "";
                        }
                        conn.erase("proxyPass_encrypted");
                    }
                    result.push_back(conn);
                }
            }
            response["status"] = "success";
            response["result"] = result.dump();
        }
        else if (action == "delete_saved_connection") {
            NamedMutexLock lock(L"Global\\LdySSHConfigMutex");
            std::string keyToDelete = args[0].get<std::string>();
            std::wstring configDir = GetConfigDirectory();
            std::wstring connPath = configDir + L"\\connections.json";
            
            std::string connData = ReadConnectionConfigWithRecovery(connPath);
            bool deleted = false;
            if (!connData.empty()) {
                nlohmann::json conns = nlohmann::json::parse(connData);
                if (conns.contains(keyToDelete)) {
                    conns.erase(keyToDelete);
                    BackupConnectionConfig(connPath);
                    WriteUtf8ToFile(connPath, conns.dump(2));
                    deleted = true;
                }
            }
            
            nlohmann::json retObj;
            retObj["success"] = deleted;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "update_connection_group") {
            NamedMutexLock lock(L"Global\\LdySSHConfigMutex");
            std::string keyToUpdate = args[0].get<std::string>();
            std::string newGroup = args[1].get<std::string>();
            std::wstring configDir = GetConfigDirectory();
            std::wstring connPath = configDir + L"\\connections.json";
            
            std::string connData = ReadConnectionConfigWithRecovery(connPath);
            bool updated = false;
            if (!connData.empty()) {
                nlohmann::json conns = nlohmann::json::parse(connData);
                if (conns.contains(keyToUpdate)) {
                    conns[keyToUpdate]["group"] = newGroup;
                    BackupConnectionConfig(connPath);
                    WriteUtf8ToFile(connPath, conns.dump(2));
                    updated = true;
                }
            }
            
            nlohmann::json retObj;
            retObj["success"] = updated;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_command_library") {
            NamedMutexLock lock(L"Global\\LdySSHConfigMutex");
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
            NamedMutexLock lock(L"Global\\LdySSHConfigMutex");
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
            std::string keyPath = SafeGetJsonString(params, "keyPath", "");
            std::string keyPassphrase = SafeGetJsonString(params, "keyPassphrase", "");
            
            // 提取堡垒机代理参数
            std::string jumpHost = SafeGetJsonString(params, "jumpHost", "");
            int jumpPort = SafeGetJsonInt(params, "jumpPort", 22);
            std::string jumpUser = SafeGetJsonString(params, "jumpUser", "");
            std::string jumpPass = SafeGetJsonString(params, "jumpPass", "");
            std::string jumpKey = SafeGetJsonString(params, "jumpKey", "");
            std::string jumpKeyPassphrase = SafeGetJsonString(params, "jumpKeyPassphrase", "");

            // 提取 SOCKS5 / HTTP 代理参数
            std::string proxyType = SafeGetJsonString(params, "proxyType", "none");
            std::string proxyHost = SafeGetJsonString(params, "proxyHost", "");
            int proxyPort = SafeGetJsonInt(params, "proxyPort", 1080);
            std::string proxyUser = SafeGetJsonString(params, "proxyUser", "");
            std::string proxyPass = SafeGetJsonString(params, "proxyPass", "");

            std::string storeKey = hostname + "@" + username;
            
            if (SafeGetJsonBool(params, "save", false)) {
                NamedMutexLock lock(L"Global\\LdySSHConfigMutex");
                std::wstring configDir = GetConfigDirectory();
                std::wstring connPath = configDir + L"\\connections.json";
                std::string connData = ReadConnectionConfigWithRecovery(connPath);
                
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
                connObj["group"] = SafeGetJsonString(params, "group", "");
                
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
                
                // 保存堡垒机配置
                connObj["jumpHost"] = jumpHost;
                connObj["jumpPort"] = jumpPort;
                connObj["jumpUser"] = jumpUser;
                connObj["jumpKey"] = jumpKey;
                connObj["jumpKeyPassphrase"] = jumpKeyPassphrase;
                if (!jumpPass.empty()) {
                    std::string fernetKey = GetOrCreateFernetKey();
                    std::string encrypted = EncryptFernetPassword(fernetKey, jumpPass);
                    if (!encrypted.empty()) {
                        connObj["jumpPass"] = encrypted;
                        connObj["jumpPass_encrypted"] = true;
                    } else {
                        connObj["jumpPass"] = jumpPass;
                        connObj["jumpPass_encrypted"] = false;
                    }
                } else {
                    connObj["jumpPass"] = "";
                    connObj["jumpPass_encrypted"] = false;
                }

                // 保存代理配置
                connObj["proxyType"] = proxyType;
                connObj["proxyHost"] = proxyHost;
                connObj["proxyPort"] = proxyPort;
                connObj["proxyUser"] = proxyUser;
                if (!proxyPass.empty()) {
                    std::string fernetKey = GetOrCreateFernetKey();
                    std::string encrypted = EncryptFernetPassword(fernetKey, proxyPass);
                    if (!encrypted.empty()) {
                        connObj["proxyPass"] = encrypted;
                        connObj["proxyPass_encrypted"] = true;
                    } else {
                        connObj["proxyPass"] = proxyPass;
                        connObj["proxyPass_encrypted"] = false;
                    }
                } else {
                    connObj["proxyPass"] = "";
                    connObj["proxyPass_encrypted"] = false;
                }

                conns[storeKey] = connObj;
                
                BackupConnectionConfig(connPath);
                WriteUtf8ToFile(connPath, conns.dump(2));
            }

            std::thread([sessId, hostname, port, username, password, keyPath, keyPassphrase, storeKey, reqId, jumpHost, jumpPort, jumpUser, jumpPass, jumpKey, jumpKeyPassphrase, proxyType, proxyHost, proxyPort, proxyUser, proxyPass]() {
                auto session = std::make_shared<SSHSession>(sessId);
                PrismLog("INFO", "SSHSession connect initiated asynchronously for " + storeKey);
                
                JumpHostConfig jc;
                jc.jumpHost = jumpHost;
                jc.jumpPort = jumpPort;
                jc.jumpUser = jumpUser;
                jc.jumpPass = jumpPass;
                jc.jumpKey = jumpKey;
                jc.jumpKeyPassphrase = jumpKeyPassphrase;

                ProxyConfig pc;
                pc.proxyType = proxyType;
                pc.proxyHost = proxyHost;
                pc.proxyPort = proxyPort;
                pc.proxyUser = proxyUser;
                pc.proxyPass = proxyPass;

                bool success = session->Connect(hostname, port, username, password, keyPath, keyPassphrase, 80, 24, jc, pc);
                
                nlohmann::json response;
                response["id"] = reqId;
                response["status"] = "success";
                
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
                
                response["result"] = retObj.dump();
                
                if (hWnd != NULL) {
                    std::wstring* responseW = new std::wstring(Utf8ToUtf16(response.dump()));
                    PostMessageW(hWnd, WM_POST_WEB_MESSAGE, 0, (LPARAM)responseW);
                }
            }).detach();
            
            return;
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
        else if (action == "write_log") {
            std::string level = args[0].get<std::string>();
            std::string msg = args[1].get<std::string>();
            PrismLog(level, msg);
            
            nlohmann::json retObj;
            retObj["success"] = true;
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
            if (!output.empty()) {
                PrismLog("INFO", "get_output data length from " + sessId + ": " + std::to_string(output.length()) + " bytes");
            }
            
            nlohmann::json retObj;
            retObj["output"] = Base64Encode(output); // Encode to base64 for binary safety
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "send_input_base64") {
            std::string sessId = args[0].get<std::string>();
            std::string base64Data = args[1].get<std::string>();
            auto session = globalSessionManager.GetSession(sessId);
            bool success = false;
            if (session) {
                std::string decodedData = Base64Decode(base64Data);
                success = session->SendInput(decodedData);
            }
            
            nlohmann::json retObj;
            retObj["success"] = success;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "show_open_file_dialog") {
            std::wstring path = ShowOpenFileDialog();
            nlohmann::json retObj;
            retObj["filePath"] = Utf16ToUtf8(path);
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "show_save_file_dialog") {
            std::string defaultNameUtf8 = args.empty() ? "" : args[0].get<std::string>();
            std::wstring wDefaultName = Utf8ToUtf16(defaultNameUtf8);
            std::wstring path = ShowSaveFileDialog(wDefaultName);
            nlohmann::json retObj;
            retObj["filePath"] = Utf16ToUtf8(path);
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "read_base64_file") {
            std::string utf8Path = args[0].get<std::string>();
            std::wstring wPath = Utf8ToUtf16(utf8Path);
            std::string rawData = ReadFileToUtf8(wPath);
            std::string b64 = Base64Encode(rawData);
            
            nlohmann::json retObj;
            retObj["content"] = b64;
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "write_base64_file") {
            std::string utf8Path = args[0].get<std::string>();
            std::string b64 = args[1].get<std::string>();
            std::wstring wPath = Utf8ToUtf16(utf8Path);
            std::string rawData = Base64Decode(b64);
            bool success = WriteUtf8ToFile(wPath, rawData);
            
            nlohmann::json retObj;
            retObj["success"] = success;
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
            nlohmann::json retObj;
            if (sshSess) {
                try {
                    std::string infoStr = sshSess->GetSystemInfo();
                    retObj["success"] = true;
                    retObj["info"] = nlohmann::json::parse(infoStr);
                } catch(...) {
                    retObj["success"] = false;
                    retObj["error"] = "Failed to parse system info";
                }
            } else {
                retObj["success"] = false;
                retObj["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_system_stats") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            nlohmann::json retObj;
            if (sshSess) {
                try {
                    std::string statsStr = sshSess->GetSystemStats();
                    retObj["success"] = true;
                    retObj["stats"] = nlohmann::json::parse(statsStr);
                } catch(...) {
                    retObj["success"] = false;
                    retObj["error"] = "Failed to parse system stats";
                }
            } else {
                retObj["success"] = false;
                retObj["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_process_list") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            nlohmann::json retObj;
            if (sshSess) {
                try {
                    std::string procStr = sshSess->GetProcessList();
                    retObj["success"] = true;
                    retObj["processes"] = nlohmann::json::parse(procStr);
                } catch(...) {
                    retObj["success"] = false;
                    retObj["error"] = "Failed to parse process list";
                }
            } else {
                retObj["success"] = false;
                retObj["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_disk_usage") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            nlohmann::json retObj;
            if (sshSess) {
                try {
                    std::string diskStr = sshSess->GetDiskUsage();
                    retObj["success"] = true;
                    retObj["disk_usage"] = nlohmann::json::parse(diskStr);
                } catch(...) {
                    retObj["success"] = false;
                    retObj["error"] = "Failed to parse disk usage";
                }
            } else {
                retObj["success"] = false;
                retObj["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "get_network_info") {
            std::string sessId = args[0].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            nlohmann::json retObj;
            if (sshSess) {
                try {
                    std::string netStr = sshSess->GetNetworkInfo();
                    retObj["success"] = true;
                    retObj["network_info"] = nlohmann::json::parse(netStr);
                } catch(...) {
                    retObj["success"] = false;
                    retObj["error"] = "Failed to parse network info";
                }
            } else {
                retObj["success"] = false;
                retObj["error"] = "Session not found";
            }
            response["status"] = "success";
            response["result"] = retObj.dump();
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
                            
                            // Get last write time helper
                            FILETIME ft = {0};
                            HANDLE hFile = CreateFileW(fullTempPath.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
                            if (hFile != INVALID_HANDLE_VALUE) {
                                GetFileTime(hFile, NULL, NULL, &ft);
                                CloseHandle(hFile);
                            }
                            
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
        else if (action == "list_local_directory") {
            std::string path = args[0].get<std::string>();
            std::wstring wPath = Utf8ToUtf16(path);
            std::string res = ListLocalDirectory(wPath);
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "create_local_directory") {
            std::string path = args[0].get<std::string>();
            std::wstring wPath = Utf8ToUtf16(path);
            bool success = CreateLocalFolder(wPath);
            nlohmann::json retObj;
            retObj["success"] = success;
            if (!success) retObj["error"] = "Failed to create directory";
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "delete_local_file") {
            std::string path = args[0].get<std::string>();
            std::wstring wPath = Utf8ToUtf16(path);
            bool success = DeleteLocalFileOrFolder(wPath);
            nlohmann::json retObj;
            retObj["success"] = success;
            if (!success) retObj["error"] = "Failed to delete file or folder";
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "rename_local_file") {
            std::string oldPath = args[0].get<std::string>();
            std::string newPath = args[1].get<std::string>();
            std::wstring wOldPath = Utf8ToUtf16(oldPath);
            std::wstring wNewPath = Utf8ToUtf16(newPath);
            bool success = RenameLocalFileOrFolder(wOldPath, wNewPath);
            nlohmann::json retObj;
            retObj["success"] = success;
            if (!success) retObj["error"] = "Failed to rename file or folder";
            response["status"] = "success";
            response["result"] = retObj.dump();
        }
        else if (action == "list_directory") {
            std::string sessId = args[0].get<std::string>();
            std::string path = args[1].get<std::string>();
            auto sshSess = std::dynamic_pointer_cast<SSHSession>(globalSessionManager.GetSession(sessId));
            std::string res;
            if (sshSess) {
                res = sshSess->ListFiles(path); // mapping to ListFiles
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
                res = sshSess->CreateFolder(path); // mapping to CreateFolder
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
                res = sshSess->DeleteFileOrFolder(path); // mapping to DeleteFileOrFolder
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
                res = sshSess->DeleteFileOrFolder(path); // mapping to DeleteFileOrFolder
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
                res = sshSess->RenameFileOrFolder(oldPath, newPath); // mapping to RenameFileOrFolder
            } else {
                res = "{\"success\":false,\"error\":\"Session not found\"}";
            }
            response["status"] = "success";
            response["result"] = res;
        }
        else if (action == "get_file_info") {
            nlohmann::json res;
            res["success"] = false;
            res["error"] = "Not implemented in C++";
            response["status"] = "success";
            response["result"] = res.dump();
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
        else if (action == "send_ai_context") {
            try {
                std::string context = args[0].get<std::string>();
                {
                    std::lock_guard<std::mutex> lock(aiContextMtx);
                    lastAiContext = context;
                }
                TryInjectAiContext();

                nlohmann::json res;
                res["success"] = true;
                response["status"] = "success";
                response["result"] = res.dump();
            }
            catch (const std::exception& e) {
                nlohmann::json errObj;
                errObj["success"] = false;
                errObj["error"] = e.what();
                response["status"] = "success";
                response["result"] = errObj.dump();
            }
        }
        else if (action == "resize_chatgpt_subwindow") {
            try {
                std::string boundsStr = args[0].get<std::string>();
                auto bounds = nlohmann::json::parse(boundsStr);
                
                int left = bounds.value("left", 0);
                int top = bounds.value("top", 0);
                int width = bounds.value("width", 0);
                int height = bounds.value("height", 0);
                
                if (chatgptHWnd == NULL) {
                    static bool classRegistered = false;
                    if (!classRegistered) {
                        WNDCLASSEX wcex = {};
                        wcex.cbSize = sizeof(WNDCLASSEX);
                        wcex.style = CS_HREDRAW | CS_VREDRAW;
                        wcex.lpfnWndProc = ChatGPTWndProc;
                        wcex.cbClsExtra = 0;
                        wcex.cbWndExtra = 0;
                        wcex.hInstance = hInst;
                        wcex.hIcon = NULL;
                        wcex.hCursor = LoadCursor(NULL, IDC_ARROW);
                        wcex.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
                        wcex.lpszMenuName = NULL;
                        wcex.lpszClassName = _T("ChatGPTWindowClass");
                        wcex.hIconSm = NULL;
                        
                        if (RegisterClassEx(&wcex)) {
                            classRegistered = true;
                        }
                    }
                    
                    chatgptHWnd = CreateWindow(
                        _T("ChatGPTWindowClass"),
                        NULL,
                        WS_CHILD | WS_CLIPSIBLINGS,
                        left, top,
                        width, height,
                        hWnd,
                        NULL,
                        hInst,
                        NULL
                    );
                    
                    if (chatgptHWnd && webviewEnv != nullptr) {
                        ShowWindow(chatgptHWnd, SW_SHOW);
                        UpdateWindow(chatgptHWnd);
                        
                        webviewEnv->CreateCoreWebView2Controller(chatgptHWnd, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT {
                                if (FAILED(result)) return result;
                                chatgptController = controller;
                                chatgptController->get_CoreWebView2(&chatgptWindow);
                                
                                // Set ChatGPT WebView2 default background to transparent
                                Microsoft::WRL::ComPtr<ICoreWebView2Controller2> controller2;
                                if (SUCCEEDED(chatgptController->QueryInterface(IID_PPV_ARGS(&controller2)))) {
                                    COREWEBVIEW2_COLOR transparentColor = { 0, 0, 0, 0 };
                                    controller2->put_DefaultBackgroundColor(transparentColor);
                                }

                                RECT rect;
                                GetClientRect(chatgptHWnd, &rect);
                                chatgptController->put_Bounds(rect);
                                
                                // Register NavigationCompleted event to trigger context injection
                                chatgptWindow->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
                                    [](ICoreWebView2* sender, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                                        TryInjectAiContext();
                                        return S_OK;
                                    }).Get(), &chatgptNavigationToken);

                                chatgptWindow->Navigate(L"https://chatgpt.com/");

                                // Force bring to top
                                SetWindowPos(chatgptHWnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                                return S_OK;
                            }).Get());
                    }
                } else {
                    SetWindowPos(chatgptHWnd, HWND_TOP, left, top, width, height, SWP_SHOWWINDOW);
                    
                    if (chatgptController != nullptr) {
                        RECT rect;
                        GetClientRect(chatgptHWnd, &rect);
                        chatgptController->put_Bounds(rect);
                    }
                    TryInjectAiContext();
                }
                
                nlohmann::json res;
                res["success"] = true;
                response["status"] = "success";
                response["result"] = res.dump();
            }
            catch (const std::exception& e) {
                nlohmann::json errObj;
                errObj["success"] = false;
                errObj["error"] = e.what();
                response["status"] = "success";
                response["result"] = errObj.dump();
            }
        }
        else if (action == "hide_chatgpt_subwindow") {
            if (chatgptHWnd != NULL) {
                ShowWindow(chatgptHWnd, SW_HIDE);
            }
            nlohmann::json res;
            res["success"] = true;
            response["status"] = "success";
            response["result"] = res.dump();
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

    // Auto-detect and launch Python AI Backend services in background (daemon mode)
    if (GetFileAttributesW(L"prismssh.py") != INVALID_FILE_ATTRIBUTES) {
        ShellExecuteW(NULL, L"open", L"pythonw.exe", L"prismssh.py --backend-only", NULL, SW_HIDE);
    } else if (GetFileAttributesW(L"..\\prismssh.py") != INVALID_FILE_ATTRIBUTES) {
        ShellExecuteW(NULL, L"open", L"pythonw.exe", L"..\\prismssh.py --backend-only", NULL, SW_HIDE);
    } else if (GetFileAttributesW(L"..\\..\\..\\prismssh.py") != INVALID_FILE_ATTRIBUTES) {
        ShellExecuteW(NULL, L"open", L"pythonw.exe", L"..\\..\\..\\prismssh.py --backend-only", NULL, SW_HIDE);
    }

    WNDCLASSEX wcex;
    wcex.cbSize = sizeof(WNDCLASSEX);
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.cbClsExtra = 0;
    wcex.cbWndExtra = 0;
    wcex.hInstance = hInstance;
    wcex.hIcon = LoadIcon(hInstance, MAKEINTRESOURCE(IDI_APP_ICON));
    wcex.hCursor = LoadCursor(NULL, IDC_ARROW);
    wcex.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wcex.lpszMenuName = NULL;
    wcex.lpszClassName = _T("LdySSHCppWindowClass");
    wcex.hIconSm = LoadIcon(wcex.hInstance, MAKEINTRESOURCE(IDI_APP_ICON));

    if (!RegisterClassEx(&wcex)) {
        MessageBox(NULL, _T("Call to RegisterClassEx failed!"), _T("LdySSH C++"), 0);
        return 1;
    }

    hWnd = CreateWindow(
        _T("LdySSHCppWindowClass"),
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
        MessageBox(NULL, _T("Call to CreateWindow failed!"), _T("LdySSH C++"), 0);
        return 1;
    }

    ShowWindow(hWnd, nCmdShow);
    UpdateWindow(hWnd);

    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(nullptr, nullptr, nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [](HRESULT result, ICoreWebView2Environment* env) -> HRESULT {
                if (FAILED(result)) return result;

                webviewEnv = env;

                env->CreateCoreWebView2Controller(hWnd, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT {
                        if (FAILED(result)) return result;

                        webviewController = controller;
                        webviewController->get_CoreWebView2(&webviewWindow);

                        // Set main WebView2 default background to transparent to prevent white flashing/edges
                        Microsoft::WRL::ComPtr<ICoreWebView2Controller2> controller2;
                        if (SUCCEEDED(webviewController->QueryInterface(IID_PPV_ARGS(&controller2)))) {
                            COREWEBVIEW2_COLOR transparentColor = { 0, 0, 0, 0 };
                            controller2->put_DefaultBackgroundColor(transparentColor);
                        }

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
                            L"            if (response && response.action === 'push_output') {\n"
                            L"                if (typeof window.handlePushOutput === 'function') {\n"
                            L"                    window.handlePushOutput(response.sessionId, response.data);\n"
                            L"                }\n"
                            L"                return;\n"
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
                            std::wstring templatePath = uiPath + L"\\template.html";
                            
                            DWORD attrib = GetFileAttributesW(templatePath.c_str());
                            bool uiFolderExists = (attrib != INVALID_FILE_ATTRIBUTES && !(attrib & FILE_ATTRIBUTE_DIRECTORY));
                            
                            if (uiFolderExists) {
                                webviewWindow3->SetVirtualHostNameToFolderMapping(
                                    L"ldyssh.local",
                                    uiPath.c_str(),
                                    COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW
                                );
                                // webviewWindow->OpenDevToolsWindow();
                                webviewWindow->Navigate(L"https://ldyssh.local/template.html");
                                std::thread(TopologyHeartbeatLoop).detach();
                            } else {
                                std::wstring wFallbackHtml = Utf8ToUtf16(EMBEDDED_FALLBACK_HTML);
                                webviewWindow->NavigateToString(wFallbackHtml.c_str());
                            }
                        } else {
                            // Fallback to NavigateToString
                            std::wstring html = ReadFileToString(exeDir + L"\\ui\\template.html");
                            std::wstring css = ReadFileToString(exeDir + L"\\ui\\static\\styles.css");
                            std::wstring js = ReadFileToString(exeDir + L"\\ui\\static\\app.js");
                            std::wstring threeJs = ReadFileToString(exeDir + L"\\ui\\static\\lib\\three.min.js");
                            std::wstring orbitControls = ReadFileToString(exeDir + L"\\ui\\static\\lib\\OrbitControls.js");

                            // Precise Three.js injection
                            size_t threePos = html.find(L"static/lib/three.min.js");
                            if (threePos != std::wstring::npos) {
                                size_t tagStart = html.rfind(L"<script", threePos);
                                size_t tagEnd = html.find(L"</script>", threePos);
                                if (tagStart != std::wstring::npos && tagEnd != std::wstring::npos) {
                                    html.replace(tagStart, tagEnd - tagStart + 9, L"<script>\n" + threeJs + L"\n</script>");
                                }
                            }

                            // Precise OrbitControls injection
                            size_t orbitPos = html.find(L"static/lib/OrbitControls.js");
                            if (orbitPos != std::wstring::npos) {
                                size_t tagStart = html.rfind(L"<script", orbitPos);
                                size_t tagEnd = html.find(L"</script>", orbitPos);
                                if (tagStart != std::wstring::npos && tagEnd != std::wstring::npos) {
                                    html.replace(tagStart, tagEnd - tagStart + 9, L"<script>\n" + orbitControls + L"\n</script>");
                                }
                            }

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

                            // webviewWindow->OpenDevToolsWindow();
                            webviewWindow->NavigateToString(html.c_str());
                            std::thread(TopologyHeartbeatLoop).detach();
                        }
                        return S_OK;
                    }).Get());
                return S_OK;
            }).Get());

    if (FAILED(hr)) {
        MessageBox(NULL, _T("WebView2 Environment creation failed!"), _T("LdySSH C++"), 0);
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
    case WM_NCCALCSIZE:
        if (wParam == TRUE) {
            return 0;
        }
        break;
    case WM_NCHITTEST: {
        POINT pt = { (int)(short)LOWORD(lParam), (int)(short)HIWORD(lParam) };
        ScreenToClient(hWnd, &pt);
        RECT rect;
        GetClientRect(hWnd, &rect);
        const int border = 8; // border detection zone
        bool left = pt.x < border;
        bool right = pt.x > rect.right - border;
        bool top = pt.y < border;
        bool bottom = pt.y > rect.bottom - border;
        if (top && left) return HTTOPLEFT;
        if (top && right) return HTTOPRIGHT;
        if (bottom && left) return HTBOTTOMLEFT;
        if (bottom && right) return HTBOTTOMRIGHT;
        if (left) return HTLEFT;
        if (right) return HTRIGHT;
        if (top) return HTTOP;
        if (bottom) return HTBOTTOM;
        return HTCLIENT;
    }
    case WM_SIZE:
        if (webviewController != nullptr) {
            RECT bounds;
            GetClientRect(hWnd, &bounds);
            // Shrink client area slightly to let parent window receive mouse moves on borders for WM_NCHITTEST
            bounds.left += 4;
            bounds.right -= 4;
            bounds.bottom -= 4;
            webviewController->put_Bounds(bounds);
        }
        if (chatgptHWnd != NULL && IsWindowVisible(chatgptHWnd)) {
            SetWindowPos(chatgptHWnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        break;

    case WM_POST_WEB_MESSAGE: {
        std::wstring* pStr = (std::wstring*)lParam;
        if (pStr) {
            if (webviewWindow != nullptr) {
                webviewWindow->PostWebMessageAsJson(pStr->c_str());
            }
            delete pStr;
        }
        return 0;
    }
    case WM_TOPOLOGY_HEARTBEAT_UPDATE: {
        HeartbeatUpdate* update = (HeartbeatUpdate*)lParam;
        if (update) {
            if (webviewWindow != nullptr) {
                std::string js = "if (typeof window.updateNodeDelay === 'function') { window.updateNodeDelay('" + update->hostname + "', " + std::to_string(update->delay) + ", '" + update->status + "'); }";
                std::wstring jsW = Utf8ToUtf16(js);
                webviewWindow->ExecuteScript(jsW.c_str(), Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
                    [](HRESULT errorCode, LPCWSTR resultObjectAsJson) -> HRESULT {
                        return S_OK;
                    }).Get());
            }
            delete update;
        }
        return 0;
    }
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
