#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wrl.h>
#include <WebView2.h>
#include <nlohmann/json.hpp>
#include "chatgpt_subwindow.h"
#include "common_utils.h"

// Define global ChatGPT window variables
HWND chatgptHWnd = NULL;
Microsoft::WRL::ComPtr<ICoreWebView2Controller> chatgptController;
Microsoft::WRL::ComPtr<ICoreWebView2> chatgptWindow;
std::string lastAiContext = "";
std::mutex aiContextMtx;
EventRegistrationToken chatgptNavigationToken;

LRESULT CALLBACK ChatGPTWndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_SIZE:
        if (chatgptController != nullptr) {
            RECT bounds;
            GetClientRect(hWnd, &bounds);
            chatgptController->put_Bounds(bounds);
        }
        break;
    case WM_CLOSE:
        DestroyWindow(hWnd);
        break;
    case WM_DESTROY:
        if (chatgptController != nullptr) {
            chatgptController->Close();
            chatgptController = nullptr;
        }
        chatgptWindow = nullptr;
        chatgptHWnd = NULL;
        break;
    default:
        return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}

void TryInjectAiContext() {
    std::lock_guard<std::mutex> lock(aiContextMtx);
    if (lastAiContext.empty() || chatgptWindow == nullptr) return;

    nlohmann::json jText = lastAiContext;
    std::string jsVal = jText.dump();

    std::string jsInject = 
        "(function() {\n"
        "    function tryFill(text) {\n"
        "        var ta = document.getElementById(\"prompt-textarea\") || document.querySelector(\"textarea\") || document.querySelector(\"[contenteditable='true']\");\n"
        "        if (ta) {\n"
        "            if (ta.tagName === \"TEXTAREA\" || ta.tagName === \"INPUT\") {\n"
        "                ta.value = text;\n"
        "                ta.dispatchEvent(new Event(\"input\", { bubbles: true }));\n"
        "            } else {\n"
        "                ta.innerText = text;\n"
        "                ta.dispatchEvent(new Event(\"input\", { bubbles: true }));\n"
        "            }\n"
        "            console.log(\"ChatGPT input filled successfully.\");\n"
        "            return true;\n"
        "        }\n"
        "        return false;\n"
        "    }\n"
        "    var textToFill = \"请帮我分析和解决以下终端报错/命令行上下文：\\n\\n\" + " + jsVal + ";\n"
        "    if (!tryFill(textToFill)) {\n"
        "        var timer = setInterval(function() {\n"
        "            if (tryFill(textToFill)) clearInterval(timer);\n"
        "        }, 500);\n"
        "        setTimeout(function() { clearInterval(timer); }, 15000);\n"
        "    }\n"
        "})();";

    std::wstring wJsInject = Utf8ToUtf16(jsInject);
    chatgptWindow->ExecuteScript(wJsInject.c_str(), nullptr);

    lastAiContext = "";
}
