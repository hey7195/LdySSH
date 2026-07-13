#pragma once
#include <string>

const std::string EMBEDDED_FALLBACK_HTML = R"raw(<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>PrismSSH Pro (Minimal Fallback Mode)</title>
    <style>
        body { background:#0f172a; color:#38bdf8; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; text-align:center; padding:50px; }
        .card { max-width:600px; margin:50px auto; background:#1e293b; padding:40px; border-radius:12px; border:1px solid #f43f5e; box-shadow:0 0 25px rgba(244,63,94,0.15); }
        h1 { color:#f43f5e; font-size:24px; margin-bottom:15px; font-weight: 700; }
        p { color:#94a3b8; font-size:14px; line-height:1.6; margin: 10px 0; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #fb7185; }
        .btn { display:inline-block; margin-top:25px; padding:12px 24px; background:#0284c7; color:#fff; border-radius:6px; text-decoration:none; font-weight:bold; transition:0.2s; border:none; cursor:pointer; }
        .btn:hover { background:#0369a1; box-shadow:0 0 12px #38bdf8; }
        .warning-icon { font-size:56px; margin-bottom:15px; }
    </style>
    <script>
        function triggerRetry() {
            try {
                window.chrome.webview.postMessage(JSON.stringify({ id: "fallback_retry", action: "fallback_retry", args: [] }));
            } catch (e) {
                console.error(e);
            }
        }
    </script>
</head>
<body>
    <div class="card">
        <div class="warning-icon">⚠️</div>
        <h1>UI 资源文件夹缺失</h1>
        <p>PrismSSH Pro 未在程序同级目录下找到 <code>ui/</code> 资源包。</p>
        <p>为防止界面出现损坏白屏，系统已自动切入内存固化的<b>安全自检引导页</b>。</p>
        <p><b>修复方法：</b> 请将 <code>prismssh-cpp.exe</code> 与 <code>ui/</code> 资源目录放在同一路径下，然后点击下方重新检测按钮。</p>
        <button onclick="triggerRetry()" class="btn">重新检测资源 (Reload)</button>
    </div>
</body>
</html>)raw";
