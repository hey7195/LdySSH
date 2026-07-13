#pragma once
#ifndef SSH_SESSION_H
#define SSH_SESSION_H

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <chrono>
#include <nlohmann/json.hpp>
#include <libssh2.h>
#include <libssh2_sftp.h>
#include "session.h"

struct JumpHostConfig {
    std::string jumpHost;
    int jumpPort = 22;
    std::string jumpUser;
    std::string jumpPass;
    std::string jumpKey;
    std::string jumpKeyPassphrase;
};

struct ProxyConfig {
    std::string proxyType; // "none", "socks5", "http"
    std::string proxyHost;
    int proxyPort = 1080;
    std::string proxyUser;
    std::string proxyPass;
};

// SSH Session implementation
class SSHSession : public Session {
public:
    std::string sessionId;
    std::unordered_map<std::string, std::shared_ptr<PortForwardInfo>> portForwards;
    std::mutex forwardMutex;

    SOCKET sock = INVALID_SOCKET;
    LIBSSH2_SESSION* sshSession = NULL;
    LIBSSH2_CHANNEL* sshChannel = NULL;
    LIBSSH2_SFTP* sftpSession = NULL;
    
    // 堡垒机第一跳变量
    SOCKET jumpSock = INVALID_SOCKET;
    LIBSSH2_SESSION* jumpSshSession = NULL;
    SOCKET jumpListenSock = INVALID_SOCKET;
    HANDLE hJumpThread = NULL;
    
    std::string outputBuffer;
    std::mutex bufferMutex;
    std::mutex sshMutex;
    bool running = false;
    HANDLE hReadThread = NULL;
    std::string lastError;
    
    std::unordered_map<std::string, unsigned long long> lastRxBytes;
    std::unordered_map<std::string, unsigned long long> lastTxBytes;
    std::chrono::steady_clock::time_point lastNetTime;
    long long lastCpuIdle = 0;
    long long lastCpuTotal = 0;

    SSHSession(const std::string& id);
    ~SSHSession() override;

    // Session virtual interfaces
    bool SendInput(const std::string& data) override;
    std::string GetOutput() override;
    void Resize(int cols, int rows) override;
    void Disconnect() override;
    bool IsConnected() override;

    // Connect options
    bool Connect(const std::string& hostname, int port, const std::string& username, const std::string& password, const std::string& keyPath = "", const std::string& keyPassphrase = "", int cols = 80, int rows = 24, const JumpHostConfig& jumpConfig = {}, const ProxyConfig& proxyConfig = {});

    // SFTP operations
    bool EnsureSftpSession(std::string& error);
    std::string ListFiles(const std::string& path);
    std::string DownloadFileContent(const std::string& remotePath);
    std::string UploadFileContent(const std::string& base64Data, const std::string& remotePath);
    std::string CreateFolder(const std::string& remotePath);
    std::string DeleteFileOrFolder(const std::string& remotePath);
    std::string RenameFileOrFolder(const std::string& oldPath, const std::string& newPath);
    bool DownloadFile(const std::string& remotePath, const std::wstring& localPath);
    bool UploadFile(const std::wstring& localPath, const std::string& remotePath);

    // Port forwarding
    std::string CreateLocalPortForward(std::shared_ptr<SSHSession> self, int localPort, const std::string& remoteHost, int remotePort);
    std::string CreateRemotePortForward(std::shared_ptr<SSHSession> self, int remotePort, const std::string& localHost, int localPort);
    std::string CreateDynamicPortForward(std::shared_ptr<SSHSession> self, int localPort);
    bool StopPortForward(const std::string& forwardId);
    std::string ListPortForwards();
    void RelayData(SOCKET localSock, LIBSSH2_CHANNEL* channel, std::shared_ptr<SSHSession> session, std::shared_ptr<PortForwardInfo> pfInfo);

    // System Monitoring metrics
    std::string GetSystemInfo();
    std::string GetSystemStats();
    std::string GetProcessList();
    std::string GetDiskUsage();
    std::string GetNetworkInfo();

private:
    std::string osType;
    std::string ListDirectory(const std::string& path);
    std::string CreateDirectory(const std::string& path);
    std::string DeleteFile(const std::string& path);
    std::string DeleteDirectory(const std::string& path);
    std::string RenameFile(const std::string& oldPath, const std::string& newPath);
    std::string ExecuteCommand(const std::string& command);
    std::string DetectOS();

    static DWORD WINAPI StaticReadThread(LPVOID param);
    void ReadLoop();
};

// SessionManager class
class SessionManager {
public:
    std::unordered_map<std::string, std::shared_ptr<Session>> sessions;
    std::mutex managerMutex;
    
    std::string CreateLocalSession();
    void AddSession(const std::string& id, std::shared_ptr<Session> session);
    std::shared_ptr<Session> GetSession(const std::string& id);
    void DisconnectSession(const std::string& id);
    void Cleanup();
};

extern SessionManager globalSessionManager;

void HandleConnectApi(const std::string& reqId, const nlohmann::json& args, nlohmann::json& response);

#endif // SSH_SESSION_H
