#pragma once
#ifndef SESSION_H
#define SESSION_H

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>
#include <mutex>
#include <unordered_map>
#include <memory>
#include <winsock2.h>

// Edit mapping declarations
struct EditMapping {
    std::string sessionId;
    std::string remotePath;
    FILETIME lastWriteTime;
};

extern std::unordered_map<std::wstring, EditMapping> editMappings;
extern std::mutex editMappingMutex;

bool SyncEditedFile(const std::wstring& tempPath);

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

// Local Shell Pseudo Console Session Class
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

    LocalSession(const std::string& id);
    ~LocalSession() override;

    bool Connect(int cols = 80, int rows = 24);
    bool SendInput(const std::string& data) override;
    std::string GetOutput() override;
    void Resize(int cols, int rows) override;
    void Disconnect() override;
    bool IsConnected() override;

private:
    void CleanupPipes();
    static DWORD WINAPI StaticReadThread(LPVOID param);
    void ReadLoop();
};

// Port forwarding info structure
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

#endif // SESSION_H
