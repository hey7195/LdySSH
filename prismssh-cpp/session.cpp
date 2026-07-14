#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <vector>
#include "session.h"
#include "common_utils.h"
#include "crypto_utils.h"

extern HWND hWnd;
#define WM_POST_WEB_MESSAGE (WM_USER + 101)

// Initialize edit mapping globals
std::unordered_map<std::wstring, EditMapping> editMappings;
std::mutex editMappingMutex;

struct LocalShellCommand {
    std::wstring executable;
    std::wstring commandLine;
    std::string label;
};

static bool FileExists(const std::wstring& path) {
    DWORD attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

static std::wstring QuoteArg(const std::wstring& value) {
    return L"\"" + value + L"\"";
}

static std::wstring GetEnvString(const wchar_t* name) {
    wchar_t value[MAX_PATH] = { 0 };
    size_t len = 0;
    if (_wgetenv_s(&len, value, MAX_PATH, name) == 0 && len > 0 && value[0] != L'\0') {
        return value;
    }
    return L"";
}

static std::wstring GetSystemPath(const std::wstring& relativePath) {
    wchar_t systemDir[MAX_PATH] = { 0 };
    UINT len = GetSystemDirectoryW(systemDir, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) return relativePath;
    return std::wstring(systemDir) + L"\\" + relativePath;
}

static std::wstring GetExecutableDirectory() {
    wchar_t modulePath[MAX_PATH] = { 0 };
    DWORD len = GetModuleFileNameW(NULL, modulePath, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) return L"";

    std::wstring path(modulePath, len);
    size_t slash = path.find_last_of(L"\\/");
    if (slash == std::wstring::npos) return L"";
    return path.substr(0, slash);
}

static void AddBundledShellCandidate(std::vector<LocalShellCommand>& candidates) {
    std::wstring exeDir = GetExecutableDirectory();
    if (exeDir.empty()) return;

    std::wstring busybox = exeDir + L"\\tools\\busybox\\busybox.exe";
    candidates.push_back({ busybox, QuoteArg(busybox) + L" sh -l", "Built-in BusyBox" });
}

static void AddProgramFilesShellCandidates(std::vector<LocalShellCommand>& candidates, const wchar_t* envName) {
    std::wstring root = GetEnvString(envName);
    if (root.empty()) return;

    std::wstring gitBash = root + L"\\Git\\bin\\bash.exe";
    candidates.push_back({ gitBash, QuoteArg(gitBash) + L" --login -i", "Git Bash" });
}

static LocalShellCommand ResolveLocalShellCommandLine() {
    std::vector<LocalShellCommand> candidates;
    AddBundledShellCandidate(candidates);

    AddProgramFilesShellCandidates(candidates, L"ProgramW6432");
    AddProgramFilesShellCandidates(candidates, L"ProgramFiles");
    AddProgramFilesShellCandidates(candidates, L"ProgramFiles(x86)");

    std::wstring powershellPath = GetSystemPath(L"WindowsPowerShell\\v1.0\\powershell.exe");
    candidates.push_back({ powershellPath, QuoteArg(powershellPath) + L" -NoLogo", "PowerShell" });

    std::wstring cmdPath = GetSystemPath(L"cmd.exe");
    candidates.push_back({ cmdPath, QuoteArg(cmdPath) + L" /K \"chcp 65001 >nul\"", "CMD" });

    for (const auto& candidate : candidates) {
        if (FileExists(candidate.executable)) {
            return candidate;
        }
    }

    return { L"cmd.exe", L"cmd.exe /K \"chcp 65001 >nul\"", "CMD" };
}

LocalSession::LocalSession(const std::string& id) : sessionId(id) {}

LocalSession::~LocalSession() {
    Disconnect();
}

bool LocalSession::Connect(int cols, int rows) {
    PrismLog("INFO", "LocalSession::Connect started. cols=" + std::to_string(cols) + ", rows=" + std::to_string(rows));
    SetConsoleCP(CP_UTF8);
    SetConsoleOutputCP(CP_UTF8);

    if (!CreatePipe(&hPipeInRead, &hPipeInWrite, NULL, 0)) {
        PrismLog("ERROR", "LocalSession::Connect: CreatePipe Input failed. Error=" + std::to_string(GetLastError()));
        return false;
    }
    if (!CreatePipe(&hPipeOutRead, &hPipeOutWrite, NULL, 0)) {
        PrismLog("ERROR", "LocalSession::Connect: CreatePipe Output failed. Error=" + std::to_string(GetLastError()));
        CleanupPipes();
        return false;
    }

    COORD size = { (SHORT)cols, (SHORT)rows };
    HRESULT hr = CreatePseudoConsole(size, hPipeInRead, hPipeOutWrite, 0, &hPC);
    if (FAILED(hr)) {
        PrismLog("ERROR", "LocalSession::Connect: CreatePseudoConsole failed. HRESULT=" + std::to_string(hr));
        CleanupPipes();
        return false;
    }
    PrismLog("INFO", "LocalSession::Connect: CreatePseudoConsole success.");

    STARTUPINFOEXW siEx = { 0 };
    siEx.StartupInfo.cb = sizeof(STARTUPINFOEXW);
    
    SIZE_T bytesRequired = 0;
    InitializeProcThreadAttributeList(NULL, 1, 0, &bytesRequired);
    siEx.lpAttributeList = (PPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(), 0, bytesRequired);
    if (!siEx.lpAttributeList) {
        PrismLog("ERROR", "LocalSession::Connect: HeapAlloc lpAttributeList failed.");
        ClosePseudoConsole(hPC); hPC = NULL;
        CleanupPipes();
        return false;
    }

    if (!InitializeProcThreadAttributeList(siEx.lpAttributeList, 1, 0, &bytesRequired)) {
        PrismLog("ERROR", "LocalSession::Connect: InitializeProcThreadAttributeList failed.");
        HeapFree(GetProcessHeap(), 0, siEx.lpAttributeList);
        ClosePseudoConsole(hPC); hPC = NULL;
        CleanupPipes();
        return false;
    }

    if (!UpdateProcThreadAttribute(siEx.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, hPC, sizeof(HPCON), NULL, NULL)) {
        PrismLog("ERROR", "LocalSession::Connect: UpdateProcThreadAttribute failed.");
        DeleteProcThreadAttributeList(siEx.lpAttributeList);
        HeapFree(GetProcessHeap(), 0, siEx.lpAttributeList);
        ClosePseudoConsole(hPC); hPC = NULL;
        CleanupPipes();
        return false;
    }

    PROCESS_INFORMATION pi = { 0 };
    LocalShellCommand shellCommand = ResolveLocalShellCommandLine();
    PrismLog("INFO", "LocalSession::Connect: Using local shell=" + shellCommand.label + ", commandLine=" + Utf16ToUtf8(shellCommand.commandLine));
    std::vector<wchar_t> cmdLineBuf(shellCommand.commandLine.begin(), shellCommand.commandLine.end());
    cmdLineBuf.push_back(L'\0');

    BOOL success = CreateProcessW(
        NULL,
        cmdLineBuf.data(),
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
        PrismLog("ERROR", "LocalSession::Connect: CreateProcessW failed. Error=" + std::to_string(GetLastError()));
        ClosePseudoConsole(hPC); hPC = NULL;
        CleanupPipes();
        return false;
    }
    PrismLog("INFO", "LocalSession::Connect: CreateProcessW success. ProcessID=" + std::to_string(pi.dwProcessId));

    hProcess = pi.hProcess;
    hThread = pi.hThread;
    running = true;

    hReadThread = CreateThread(NULL, 0, StaticReadThread, this, 0, NULL);
    if (!hReadThread) {
        PrismLog("ERROR", "LocalSession::Connect: CreateThread failed. Error=" + std::to_string(GetLastError()));
        Disconnect();
        return false;
    }
    PrismLog("INFO", "LocalSession::Connect: StaticReadThread started successfully.");
    return true;
}

bool LocalSession::SendInput(const std::string& data) {
    if (!running || !hPipeInWrite) return false;
    DWORD written = 0;
    return WriteFile(hPipeInWrite, data.data(), (DWORD)data.size(), &written, NULL);
}

std::string LocalSession::GetOutput() {
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

void LocalSession::Resize(int cols, int rows) {
    if (running && hPC) {
        COORD size = { (SHORT)cols, (SHORT)rows };
        ResizePseudoConsole(hPC, size);
    }
}

void LocalSession::Disconnect() {
    if (!running) return;
    running = false;

    PrismLog("INFO", "LocalSession::Disconnect initiated.");

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
        PrismLog("INFO", "LocalSession::Disconnect: Waiting for hReadThread to exit...");
        WaitForSingleObject(hReadThread, INFINITE);
        CloseHandle(hReadThread);
        hReadThread = NULL;
        PrismLog("INFO", "LocalSession::Disconnect: hReadThread exited cleanly.");
    }
}

bool LocalSession::IsConnected() {
    return running;
}

void LocalSession::CleanupPipes() {
    if (hPipeInRead) { CloseHandle(hPipeInRead); hPipeInRead = NULL; }
    if (hPipeOutRead) { CloseHandle(hPipeOutRead); hPipeOutRead = NULL; }
    if (hPipeOutWrite) { CloseHandle(hPipeOutWrite); hPipeOutWrite = NULL; }
}

DWORD WINAPI LocalSession::StaticReadThread(LPVOID param) {
    LocalSession* self = (LocalSession*)param;
    self->ReadLoop();
    return 0;
}

void LocalSession::ReadLoop() {
    char buffer[8192];
    DWORD readBytes = 0;
    while (running && hPipeOutRead) {
        if (ReadFile(hPipeOutRead, buffer, sizeof(buffer) - 1, &readBytes, NULL)) {
            if (readBytes > 0) {
                std::string accum(buffer, readBytes);
                
                DWORD bytesAvail = 0;
                while (PeekNamedPipe(hPipeOutRead, NULL, 0, NULL, &bytesAvail, NULL) && bytesAvail > 0) {
                    DWORD toRead = (bytesAvail < (DWORD)(sizeof(buffer) - 1)) ? bytesAvail : (DWORD)(sizeof(buffer) - 1);
                    DWORD readNow = 0;
                    if (ReadFile(hPipeOutRead, buffer, toRead, &readNow, NULL) && readNow > 0) {
                        accum.append(buffer, readNow);
                    } else {
                        break;
                    }
                    if (accum.size() >= 65536) break;
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
            }
        } else {
            nlohmann::json pushMsg;
            pushMsg["action"] = "push_output";
            pushMsg["sessionId"] = sessionId;
            pushMsg["data"] = Base64Encode("\r\n[Process exited]\r\n");
            
            if (hWnd != NULL) {
                std::wstring* pStr = new std::wstring(Utf8ToUtf16(pushMsg.dump()));
                if (!PostMessageW(hWnd, WM_POST_WEB_MESSAGE, 0, (LPARAM)pStr)) {
                    delete pStr;
                }
            }
            running = false;
            break;
        }
    }
}
