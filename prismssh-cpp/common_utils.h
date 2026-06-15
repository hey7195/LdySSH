#pragma once
#ifndef COMMON_UTILS_H
#define COMMON_UTILS_H

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlwapi.h>
#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <mutex>
#include <chrono>
#include <iomanip>
#include <unordered_map>
#include <nlohmann/json.hpp>

// Base UTF-8 & UTF-16 Conversion Helpers
inline std::string Utf16ToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, NULL, 0, NULL, NULL);
    std::string str(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, NULL, NULL);
    if (!str.empty() && str.back() == '\0') str.pop_back();
    return str;
}

inline std::wstring Utf8ToUtf16(const std::string& str) {
    if (str.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, NULL, 0);
    std::wstring wstr(size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], size);
    if (!wstr.empty() && wstr.back() == L'\0') wstr.pop_back();
    return wstr;
}

inline std::string Utf8ToLocalAnsi(const std::string& utf8Str) {
    if (utf8Str.empty()) return "";
    std::wstring wstr = Utf8ToUtf16(utf8Str);
    int size = WideCharToMultiByte(CP_ACP, 0, wstr.c_str(), -1, NULL, 0, NULL, NULL);
    std::string str(size, '\0');
    WideCharToMultiByte(CP_ACP, 0, wstr.c_str(), -1, &str[0], size, NULL, NULL);
    if (!str.empty() && str.back() == '\0') str.pop_back();
    return str;
}

// String Utilities
inline std::string TrimString(const std::string& str) {
    if (str.empty()) return "";
    size_t first = str.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\r\n");
    return str.substr(first, (last - first + 1));
}

inline std::vector<std::string> SplitString(const std::string& str, char delim) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream tokenStream(str);
    while (std::getline(tokenStream, token, delim)) {
        tokens.push_back(token);
    }
    return tokens;
}

inline std::vector<std::string> SplitStringWhitespace(const std::string& str) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream tokenStream(str);
    while (tokenStream >> token) {
        tokens.push_back(token);
    }
    return tokens;
}

// File Helpers
inline std::string ReadFileToUtf8(const std::wstring& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f.is_open()) return "";
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

inline std::wstring ReadFileToString(const std::wstring& path) {
    std::string content = ReadFileToUtf8(path);
    if (content.empty()) return L"";
    return Utf8ToUtf16(content);
}

inline bool WriteUtf8ToFile(const std::wstring& path, const std::string& content) {
    std::ofstream f(path, std::ios::binary);
    if (!f.is_open()) return false;
    f.write(content.data(), content.size());
    return true;
}

inline std::wstring GetExeDirectory() {
    wchar_t buffer[MAX_PATH];
    GetModuleFileName(NULL, buffer, MAX_PATH);
    PathRemoveFileSpec(buffer);
    return std::wstring(buffer);
}

inline std::wstring GetConfigDirectory() {
    wchar_t* userProfile = nullptr;
    size_t len = 0;
    if (_wdupenv_s(&userProfile, &len, L"USERPROFILE") == 0 && userProfile != nullptr) {
        std::wstring path = std::wstring(userProfile) + L"\\.ldyssh";
        free(userProfile);
        return path;
    }
    return L"";
}

// Global logger
inline std::mutex g_logMutex;

inline void PrismLog(const std::string& level, const std::string& msg) {
    try {
        std::lock_guard<std::mutex> lock(g_logMutex);
        std::wstring exeDir = GetExeDirectory();
        std::wstring logPath = exeDir + L"\\prismssh_debug.log";
        
        std::ofstream logFile(logPath, std::ios::app);
        if (logFile.is_open()) {
            auto now = std::chrono::system_clock::now();
            auto time_t_now = std::chrono::system_clock::to_time_t(now);
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
            
            struct tm timeinfo;
            localtime_s(&timeinfo, &time_t_now);
            
            logFile << "[" << std::put_time(&timeinfo, "%Y-%m-%d %H:%M:%S") << "." 
                    << std::setfill('0') << std::setw(3) << ms.count() << "] "
                    << "[" << level << "] " << msg << std::endl;
        }
    }
    catch (...) {}
}

// Progress trackers
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

inline ProgressManager globalProgressManager;

// Safe JSON get helper functions
inline std::string SafeGetJsonString(const nlohmann::json& j, const std::string& key, const std::string& defaultVal = "") {
    if (j.contains(key) && !j[key].is_null()) {
        try {
            if (j[key].is_string()) {
                return j[key].get<std::string>();
            }
        } catch(...) {}
    }
    return defaultVal;
}

inline bool SafeGetJsonBool(const nlohmann::json& j, const std::string& key, bool defaultVal = false) {
    if (j.contains(key) && !j[key].is_null()) {
        try {
            if (j[key].is_boolean()) {
                return j[key].get<bool>();
            }
        } catch(...) {}
    }
    return defaultVal;
}

inline int SafeGetJsonInt(const nlohmann::json& j, const std::string& key, int defaultVal = 0) {
    if (j.contains(key) && !j[key].is_null()) {
        try {
            if (j[key].is_number()) {
                return j[key].get<int>();
            }
        } catch(...) {}
    }
    return defaultVal;
}

class NamedMutexLock {
private:
    HANDLE hMutex;
public:
    NamedMutexLock(const wchar_t* name) {
        hMutex = CreateMutexW(NULL, FALSE, name);
        if (hMutex) {
            WaitForSingleObject(hMutex, INFINITE);
        }
    }
    ~NamedMutexLock() {
        if (hMutex) {
            ReleaseMutex(hMutex);
            CloseHandle(hMutex);
        }
    }
};

#include <filesystem>
#include <chrono>
#include <sstream>
#include <iomanip>

namespace fs = std::filesystem;

inline std::string ListLocalDirectory(const std::wstring& path) {
    nlohmann::json res;
    res["success"] = false;
    try {
        fs::path p(path);
        if (!fs::exists(p) || !fs::is_directory(p)) {
            res["error"] = "Path does not exist or is not a directory";
            return res.dump();
        }
        
        nlohmann::json fileList = nlohmann::json::array();
        for (const auto& entry : fs::directory_iterator(p)) {
            nlohmann::json fileObj;
            std::wstring wname = entry.path().filename().wstring();
            fileObj["name"] = Utf16ToUtf8(wname);
            
            bool is_dir = false;
            try {
                is_dir = entry.is_directory();
            } catch(...) {}
            fileObj["is_dir"] = is_dir;
            
            if (!is_dir) {
                try {
                    fileObj["size"] = entry.file_size();
                } catch(...) {
                    fileObj["size"] = 0;
                }
            } else {
                fileObj["size"] = 0;
            }
            
            try {
                auto ftime = fs::last_write_time(entry);
                auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                    ftime - fs::file_time_type::clock::now() + std::chrono::system_clock::now()
                );
                std::time_t cftime = std::chrono::system_clock::to_time_t(sctp);
                struct tm timeinfo;
                localtime_s(&timeinfo, &cftime);
                std::stringstream ss;
                ss << std::put_time(&timeinfo, "%Y-%m-%d %H:%M:%S");
                fileObj["date"] = ss.str();
            } catch(...) {
                fileObj["date"] = "-";
            }
            
            fileList.push_back(fileObj);
        }
        res["success"] = true;
        res["files"] = fileList;
    } catch (const std::exception& e) {
        res["error"] = e.what();
    }
    return res.dump();
}

inline bool CreateLocalFolder(const std::wstring& path) {
    try {
        return fs::create_directories(path);
    } catch(...) {
        return false;
    }
}

inline bool DeleteLocalFileOrFolder(const std::wstring& path) {
    try {
        return fs::remove_all(path) > 0;
    } catch(...) {
        return false;
    }
}

inline bool RenameLocalFileOrFolder(const std::wstring& oldPath, const std::wstring& newPath) {
    try {
        fs::rename(oldPath, newPath);
        return true;
    } catch(...) {
        return false;
    }
}

inline void BackupConnectionConfig(const std::wstring& connPath) {
    try {
        fs::path p(connPath);
        if (!fs::exists(p) || fs::file_size(p) == 0) {
            return;
        }

        // Roll backups: .bak.4 -> .bak.5, ..., .bak.1 -> .bak.2
        for (int i = 4; i >= 1; --i) {
            fs::path src = p.parent_path() / (p.filename().wstring() + L".bak." + std::to_wstring(i));
            fs::path dst = p.parent_path() / (p.filename().wstring() + L".bak." + std::to_wstring(i + 1));
            if (fs::exists(src)) {
                if (fs::exists(dst)) {
                    fs::remove(dst);
                }
                fs::rename(src, dst);
            }
        }

        fs::path bak1 = p.parent_path() / (p.filename().wstring() + L".bak.1");
        if (fs::exists(bak1)) {
            fs::remove(bak1);
        }
        fs::copy_file(p, bak1);
        PrismLog("INFO", "Rolling backup created for connections configuration in C++");
    }
    catch (const std::exception& e) {
        PrismLog("ERROR", std::string("Error creating config backup in C++: ") + e.what());
    }
    catch (...) {
        PrismLog("ERROR", "Unknown error creating config backup in C++");
    }
}

inline std::string ReadConnectionConfigWithRecovery(const std::wstring& connPath) {
    fs::path p(connPath);
    if (fs::exists(p) && fs::file_size(p) > 0) {
        std::string content = ReadFileToUtf8(connPath);
        if (!content.empty()) {
            try {
                auto j = nlohmann::json::parse(content);
                return content; // Valid JSON
            }
            catch (const std::exception& e) {
                PrismLog("ERROR", std::string("Primary config JSON parse failed: ") + e.what() + ", attempting recovery...");
            }
            catch (...) {
                PrismLog("ERROR", "Primary config JSON parse failed (unknown error), attempting recovery...");
            }
        }
    }

    // Try recovering from bak.1 to bak.5
    for (int i = 1; i <= 5; ++i) {
        fs::path bakPath = p.parent_path() / (p.filename().wstring() + L".bak." + std::to_wstring(i));
        if (fs::exists(bakPath) && fs::file_size(bakPath) > 0) {
            std::wstring bakPathW = bakPath.wstring();
            std::string content = ReadFileToUtf8(bakPathW);
            if (!content.empty()) {
                try {
                    auto j = nlohmann::json::parse(content);
                    // Valid backup, write back to primary connections.json
                    WriteUtf8ToFile(connPath, content);
                    PrismLog("INFO", "Disaster recovery: successfully restored config from backup version " + std::to_string(i) + " in C++");
                    return content;
                }
                catch (...) {
                    PrismLog("ERROR", "Failed to parse backup version " + std::to_string(i) + " in C++");
                }
            }
        }
    }

    return "";
}

#endif // COMMON_UTILS_H
