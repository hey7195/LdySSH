#pragma once
#ifndef CHATGPT_SUBWINDOW_H
#define CHATGPT_SUBWINDOW_H

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wrl.h>
#include <WebView2.h>
#include <string>
#include <mutex>

// ChatGPT window variables (extern declarations)
extern HWND chatgptHWnd;
extern Microsoft::WRL::ComPtr<ICoreWebView2Controller> chatgptController;
extern Microsoft::WRL::ComPtr<ICoreWebView2> chatgptWindow;
extern std::string lastAiContext;
extern std::mutex aiContextMtx;
extern EventRegistrationToken chatgptNavigationToken;

LRESULT CALLBACK ChatGPTWndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam);
void TryInjectAiContext();

#endif // CHATGPT_SUBWINDOW_H
