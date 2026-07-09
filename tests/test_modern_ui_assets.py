import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_modern_ui_theme_is_present_in_both_webview_assets():
    package_json = read("frontend/package.json")
    assert '"react"' in package_json
    assert '"typescript"' in package_json
    assert '"vite"' in package_json
    assert '"@vitejs/plugin-react"' in package_json
    assert '"tailwindcss"' in package_json
    assert '"lucide-react"' in package_json
    assert '"@radix-ui/react-dialog"' in package_json


def test_react_source_defines_new_desktop_shell():
    app = read("frontend/src/App.tsx")
    styles = read("frontend/src/styles.css")
    bridge = read("frontend/src/lib/bridge.ts")

    assert "function App()" in app
    assert "ActivityRail" in app
    assert "MonitorPanel" in app
    assert "Workbench" in app
    assert "window.chrome.webview.postMessage" in bridge
    assert "@import \"tailwindcss\"" in styles
    assert "bg-[#f6f8fb]" in app or "bg-[var(--app-bg)]" in app


def test_templates_reference_cache_busted_stylesheet():
    template_paths = [
        "prismssh-cpp/ui/template.html",
        "prismssh-cpp/x64/Release/ui/template.html",
        "src/ui/template.html",
    ]

    for template_path in template_paths:
        html = read(template_path)
        assert '<div id="root"></div>' in html
        assert "assets/" in html
        assert "static/styles.css" not in html
        assert "static/modern-framework.css" not in html


def test_release_template_references_existing_react_assets():
    html = read("prismssh-cpp/x64/Release/ui/template.html")
    asset_paths = re.findall(r'(?:src|href)="\./([^"]+)"', html)

    assert asset_paths
    for asset_path in asset_paths:
        assert (ROOT / "prismssh-cpp/x64/Release/ui" / asset_path).is_file()


def test_borderless_window_maximize_uses_monitor_work_area():
    source = read("prismssh-cpp/main.cpp")

    assert "WM_GETMINMAXINFO" in source
    assert "MONITORINFO" in source
    assert "rcWork" in source
    assert "ptMaxSize" in source


def test_native_bridge_proxies_hermes_http_requests():
    source = read("prismssh-cpp/main.cpp")
    bridge = read("frontend/src/lib/bridge.ts")

    assert "hermes_http_request" in source
    assert "WinHttpOpen" in source
    assert "Authorization: Bearer" in source
    assert "hermesHttpRequest" in bridge


def test_codex_runs_as_background_job_from_the_ui():
    source = read("prismssh-cpp/main.cpp")
    bridge = read("frontend/src/lib/bridge.ts")
    app = read("frontend/src/App.tsx")

    assert "start_codex_run" in source
    assert "get_codex_run" in source
    assert "codexJobs" in source
    assert "std::thread([jobId" in source
    assert "startCodexRun" in bridge
    assert "getCodexRun" in bridge
    assert "executeAiRun" in app
    assert "pendingRun" not in app
