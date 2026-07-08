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
        "src/ui/template.html",
    ]

    for template_path in template_paths:
        html = read(template_path)
        assert '<div id="root"></div>' in html
        assert "assets/" in html
        assert "static/styles.css" not in html
        assert "static/modern-framework.css" not in html
