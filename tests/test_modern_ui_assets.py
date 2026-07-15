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


def test_build_sync_updates_release_webview_assets():
    script = read("frontend/scripts/sync-ui.mjs")

    assert 'resolve(root, "prismssh-cpp/x64/Release/ui")' in script


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
    assert "WINHTTP_QUERY_SET_COOKIE" in source
    assert "Cookie: " in source
    assert "Authorization: Bearer " in source
    assert "hermesHttpRequest" in bridge
    assert "cookie?: string" in bridge
    assert "token?: string" in bridge


def test_cpp_saved_connections_decrypts_dpapi_wrapped_fernet_key():
    source = read("prismssh-cpp/main.cpp")
    match = re.search(
        r'if \(action == "get_saved_connections"\).*?else if \(action == "delete_saved_connection"\)',
        source,
        re.S,
    )

    assert match
    block = match.group(0)
    assert "LoadFernetKey()" in block
    assert "ReadFileToUtf8(keyPath)" not in block


def test_cpp_applies_pending_terminal_resize_after_connection():
    source = read("prismssh-cpp/main.cpp")
    connect_args_match = re.search(
        r'std::thread\(\[sessId, hostname.*?session->Connect\((.*?)\);',
        source,
        re.S,
    )
    thread_match = re.search(
        r'std::thread\(\[sessId, hostname.*?\}\)\.detach\(\);',
        source,
        re.S,
    )
    resize_match = re.search(
        r'else if \(action == "resize_terminal"\).*?else if \(action == "disconnect"\)',
        source,
        re.S,
    )

    assert connect_args_match
    assert thread_match
    assert resize_match
    connect_block = thread_match.group(0)
    resize_block = resize_match.group(0)
    assert "WaitForPendingTerminalSize(sessId" not in connect_block
    assert "80, 24, jc, pc" in connect_args_match.group(1)
    assert "TakePendingTerminalSize(sessId, lateTerminalSize)" in connect_block
    assert "session->Resize(lateTerminalSize.cols, lateTerminalSize.rows)" in connect_block
    assert "StorePendingTerminalSize(sessId, cols, rows)" in resize_block


def test_cpp_ignores_collapsed_terminal_resize():
    source = read("prismssh-cpp/main.cpp")
    resize_match = re.search(
        r'else if \(action == "resize_terminal"\).*?else if \(action == "disconnect"\)',
        source,
        re.S,
    )

    assert resize_match
    resize_block = resize_match.group(0)
    assert "cols >= 20 && rows >= 5" in resize_block
    assert "session->Resize(cols, rows)" in resize_block
    assert "StorePendingTerminalSize(sessId, cols, rows)" in resize_block


def test_cpp_requests_terminal_size_after_starting_shell_for_jumpserver():
    source = read("prismssh-cpp/ssh_session.cpp")
    connect_match = re.search(
        r'bool SSHSession::Connect\(.*?\n}\n\nstatic std::string ErrorJson',
        source,
        re.S,
    )

    assert connect_match
    connect_block = connect_match.group(0)
    assert connect_block.index("libssh2_channel_shell") < connect_block.index("libssh2_channel_request_pty_size(sshChannel, cols, rows)")


def test_local_terminal_prefers_bundled_linux_shell_and_skips_wsl_fallback():
    source = read("prismssh-cpp/session.cpp")
    connect_match = re.search(
        r'bool LocalSession::Connect\(.*?\n}\n\nbool LocalSession::SendInput',
        source,
        re.S,
    )

    assert connect_match
    connect_block = connect_match.group(0)
    assert "ResolveLocalShellCommandLine" in source
    assert r"tools\\busybox\\busybox.exe" in source
    assert "Built-in BusyBox" in source
    assert " sh -l" in source
    assert r"Git\\bin\\bash.exe" in source
    assert "--login -i" in source
    assert "wsl.exe" not in source
    assert '"WSL"' not in source
    assert "powershell.exe" in source
    assert "cmd.exe" in source
    assert (
        source.index(r"tools\\busybox\\busybox.exe")
        < source.index(r"Git\\bin\\bash.exe")
        < source.index("powershell.exe")
        < source.index("cmd.exe")
    )
    assert connect_block.index("ResolveLocalShellCommandLine") < connect_block.index("CreateProcessW")
    assert "COMSPEC" not in connect_block


def test_local_terminal_process_tree_is_bound_to_session_job():
    header = read("prismssh-cpp/session.h")
    source = read("prismssh-cpp/session.cpp")
    connect_match = re.search(
        r'bool LocalSession::Connect\(.*?\n}\n\nbool LocalSession::SendInput',
        source,
        re.S,
    )
    disconnect_match = re.search(
        r'void LocalSession::Disconnect\(.*?\n}\n\nbool LocalSession::IsConnected',
        source,
        re.S,
    )

    assert connect_match
    assert disconnect_match
    connect_block = connect_match.group(0)
    disconnect_block = disconnect_match.group(0)
    assert "HANDLE hJob" in header
    assert "CreateJobObjectW" in connect_block
    assert "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE" in connect_block
    assert "AssignProcessToJobObject" in connect_block
    assert "CloseHandle(hJob)" in disconnect_block


def test_local_terminal_read_loop_does_not_block_shutdown():
    source = read("prismssh-cpp/session.cpp")
    read_loop_match = re.search(
        r'void LocalSession::ReadLoop\(.*?\n}\n$',
        source,
        re.S,
    )
    disconnect_match = re.search(
        r'void LocalSession::Disconnect\(.*?\n}\n\nbool LocalSession::IsConnected',
        source,
        re.S,
    )

    assert read_loop_match
    assert disconnect_match
    read_loop = read_loop_match.group(0)
    disconnect_block = disconnect_match.group(0)
    assert read_loop.index("PeekNamedPipe") < read_loop.index("ReadFile")
    assert "WaitForSingleObject(hReadThread, INFINITE)" not in disconnect_block


def test_main_window_close_uses_single_cleanup_path():
    source = read("prismssh-cpp/main.cpp")
    api_close_match = re.search(
        r'else if \(action == "window_close"\).*?else if \(action == "create_session"\)',
        source,
        re.S,
    )
    close_fn_match = re.search(
        r'static void CloseApplication\(HWND targetHWnd\) \{.*?\n}\n\nLRESULT CALLBACK WndProc',
        source,
        re.S,
    )
    wndproc_match = re.search(
        r'LRESULT CALLBACK WndProc\(.*?\n}\n$',
        source,
        re.S,
    )

    assert api_close_match
    assert close_fn_match
    assert wndproc_match
    api_close = api_close_match.group(0)
    close_fn = close_fn_match.group(0)
    wndproc = wndproc_match.group(0)
    assert "PostMessageW(hWnd, WM_CLOSE" in api_close
    assert "DestroyWindow(hWnd)" not in api_close
    assert "globalSessionManager.Cleanup()" in close_fn
    assert "webviewController->Close()" in close_fn
    assert "DestroyWindow(targetHWnd)" in close_fn
    assert "case WM_CLOSE" in wndproc
    assert "CloseApplication(hWnd)" in wndproc
    destroy_block = re.search(r'case WM_DESTROY:.*?break;', wndproc, re.S).group(0)
    assert "PostQuitMessage(0)" in destroy_block
    assert "globalSessionManager.Cleanup()" not in destroy_block


def test_background_child_processes_are_killed_with_app_job():
    source = read("prismssh-cpp/main.cpp")
    hidden_process_match = re.search(
        r'ProcessRunResult RunHiddenProcessCapture\(.*?\n}\n\nstatic void PutEncryptedSecret',
        source,
        re.S,
    )
    python_backend_match = re.search(
        r'void LaunchPythonBackend\(.*?\n}\n\nint CALLBACK WinMain',
        source,
        re.S,
    )
    close_fn_match = re.search(
        r'static void CloseApplication\(HWND targetHWnd\) \{.*?\n}\n\nLRESULT CALLBACK WndProc',
        source,
        re.S,
    )

    assert hidden_process_match
    assert python_backend_match
    assert close_fn_match
    assert "EnsureChildProcessJobLocked" in source
    assert "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE" in source
    assert "AssignProcessToChildJob(pi.hProcess)" in hidden_process_match.group(0)
    assert "AssignProcessToChildJob(pi.hProcess)" in python_backend_match.group(0)
    assert "CloseChildProcessJob()" in close_fn_match.group(0)


def test_bundled_busybox_shell_asset_exists_for_release_packaging():
    assert (ROOT / "tools" / "busybox" / "busybox.exe").is_file()
    assert (ROOT / "tools" / "busybox" / "README.txt").is_file()


def test_cpp_connect_does_not_block_terminal_on_sftp_init():
    source = read("prismssh-cpp/ssh_session.cpp")
    connect_match = re.search(
        r'bool SSHSession::Connect\(.*?\n}\n\nstatic std::string ErrorJson',
        source,
        re.S,
    )

    assert connect_match
    connect_block = connect_match.group(0)
    assert "libssh2_sftp_init" not in connect_block
    assert connect_block.index("libssh2_session_set_blocking(sshSession, 0)") < connect_block.index("running = true")
    assert "EnsureSftpSession(" in read("prismssh-cpp/ssh_session.h")


def test_cpp_handshake_error_reports_auth_was_not_reached_and_supported_algorithms():
    source = read("prismssh-cpp/ssh_session.cpp")
    connect_match = re.search(
        r'bool SSHSession::Connect\(.*?\n}\n\nstatic std::string ErrorJson',
        source,
        re.S,
    )

    assert connect_match
    connect_block = connect_match.group(0)
    assert "private key was not used" in connect_block
    assert "BuildLibssh2AlgorithmSummary(sshSession)" in connect_block
    assert "libssh2_session_supported_algs(session, methodType" in source
    assert "JoinSupportedLibssh2Algorithms(session, LIBSSH2_METHOD_KEX)" in source
    assert "JoinSupportedLibssh2Algorithms(session, LIBSSH2_METHOD_HOSTKEY)" in source
    assert "JoinSupportedLibssh2Algorithms(session, LIBSSH2_METHOD_CRYPT_CS)" in source


def test_cpp_project_links_modern_vcpkg_libssh2_instead_of_legacy_nuget_package():
    project = read("prismssh-cpp/prismssh-cpp.vcxproj")

    assert "rmt_libssh2" not in project
    assert "rmt_openssl" not in project
    assert "rmt_zlib" not in project
    assert "VcpkgRoot" in project
    assert "x64-windows-static-md" in project
    assert "libssh2.lib" in project

    manifest = read("prismssh-cpp/vcpkg.json")
    assert '"name": "libssh2"' in manifest
    assert '"version>=": "1.11.1"' in manifest


def test_cpp_jump_tunnel_uses_direct_tcpip_ex_for_modern_libssh2_headers():
    source = read("prismssh-cpp/ssh_session.cpp")
    assert "libssh2_channel_direct_tcpip_ex(" in source
    assert "LIBSSH2_CHANNEL* jumpChannel = libssh2_channel_direct_tcpip(" not in source


def test_cpp_send_input_does_not_sleep_while_holding_ssh_mutex():
    source = read("prismssh-cpp/ssh_session.cpp")
    match = re.search(
        r'bool SSHSession::SendInput\(.*?\n}\n\nstd::string SSHSession::GetOutput',
        source,
        re.S,
    )

    assert match
    block = match.group(0)
    assert block.index("while (totalWritten < size && running)") < block.index("std::lock_guard<std::mutex> lock(sshMutex)")
    eagain_match = re.search(r'if \(written == LIBSSH2_ERROR_EAGAIN\).*?continue;', block, re.S)
    assert eagain_match
    assert "Sleep(5)" in eagain_match.group(0)
    assert "std::lock_guard" not in eagain_match.group(0)


def test_cpp_terminal_input_is_queued_off_webview_ui_thread():
    source = read("prismssh-cpp/main.cpp")
    send_match = re.search(
        r'else if \(action == "send_input"\).*?else if \(action == "write_log"\)',
        source,
        re.S,
    )
    send_b64_match = re.search(
        r'else if \(action == "send_input_base64"\).*?else if \(action == "show_open_file_dialog"\)',
        source,
        re.S,
    )

    assert send_match
    assert send_b64_match
    assert "EnqueueSessionInput(sessId, data)" in send_match.group(0)
    assert "EnqueueSessionInput(sessId, decodedData)" in send_b64_match.group(0)
    assert "session->SendInput" not in send_match.group(0)
    assert "session->SendInput" not in send_b64_match.group(0)
    assert "ProcessSessionInputQueue" in source
    assert "std::deque<std::string>" in source


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
