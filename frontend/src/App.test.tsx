import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

const terminalMock = vi.hoisted(() => ({
  selectionText: "",
  selectionHandler: undefined as undefined | (() => void),
  keyHandler: undefined as undefined | ((event: KeyboardEvent) => boolean),
  writes: [] as string[],
  instances: [] as Array<{ writes: string[] }>
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  }
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    private instance = { writes: [] as string[] };
    cols = 80;
    rows = 24;
    constructor() {
      terminalMock.instances.push(this.instance);
    }
    dispose() {}
    focus() {}
    loadAddon() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      terminalMock.keyHandler = handler;
    }
    onData() {
      return { dispose() {} };
    }
    onSelectionChange(handler: () => void) {
      terminalMock.selectionHandler = handler;
      return { dispose() {} };
    }
    getSelection() {
      return terminalMock.selectionText;
    }
    open() {}
    write(data: string) {
      terminalMock.writes.push(data);
      this.instance.writes.push(data);
    }
    writeln(data = "") {
      terminalMock.writes.push(`${data}\n`);
      this.instance.writes.push(`${data}\n`);
    }
  }
}));

beforeEach(() => {
  terminalMock.selectionText = "";
  terminalMock.selectionHandler = undefined;
  terminalMock.keyHandler = undefined;
  terminalMock.writes = [];
  terminalMock.instances = [];
  window.localStorage.clear();

  window.pywebview = {
    api: {
      get_saved_connections: vi.fn().mockResolvedValue({}),
      get_command_library: vi.fn().mockResolvedValue({
        success: true,
        folders: [
          {
            id: "default",
            name: "默认分类",
            commands: [
              { id: "disk", name: "磁盘使用", command: "df -h", description: "查看磁盘空间" },
              { id: "memory", name: "内存使用", command: "free -m", description: "查看内存" }
            ]
          },
          {
            id: "service",
            name: "服务操作",
            commands: [{ id: "restart", name: "重启 nginx", command: "systemctl restart nginx", description: "重启服务" }]
          }
        ]
      }),
      save_command_library: vi.fn().mockResolvedValue({ success: true }),
      save_saved_connection: vi.fn().mockResolvedValue({ success: true }),
      delete_saved_connection: vi.fn().mockResolvedValue({ success: true }),
      create_session: vi.fn().mockResolvedValue("ssh-1"),
      connect: vi.fn().mockResolvedValue({ success: true }),
      show_open_file_dialog: vi.fn().mockResolvedValue({ filePath: "C:\\Users\\1111\\.ssh\\id_rsa" }),
      run_codex: vi.fn().mockResolvedValue({ success: true, output: "Codex 已完成分析", exitCode: 0 }),
      start_codex_run: vi.fn().mockResolvedValue({ success: true, jobId: "codex-job-1", commandPreview: "codex exec -C E:\\adb\\tools\\LdSSH <prompt>" }),
      get_codex_run: vi.fn().mockResolvedValue({ success: true, running: false, completed: true, output: "Codex 已完成分析", exitCode: 0 }),
      hermes_http_request: vi.fn().mockResolvedValue({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", reply: "Hermes 已连接" })
      }),
      get_web_favorites: vi.fn().mockResolvedValue([]),
      add_web_favorite: vi.fn().mockResolvedValue({
        success: true,
        favorite: { id: "fav-1", title: "Hermes", url: "https://hermes.local" }
      }),
      delete_web_favorite: vi.fn().mockResolvedValue({ success: true }),
      open_in_external_browser: vi.fn().mockResolvedValue({ success: true }),
      create_local_session: vi.fn().mockResolvedValue("local-1"),
      get_output: vi.fn().mockResolvedValue({}),
      resize_terminal: vi.fn().mockResolvedValue({ success: true }),
      send_input_base64: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue({ success: true })
    }
  };

  window.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ status: "ok", reply: "Hermes 已连接" }),
    text: () => Promise.resolve("Hermes 已连接")
  }) as typeof fetch;

  window.ResizeObserver = class implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("AI tools panel", () => {
  test("uses Chinese labels in the activity sidebar", () => {
    render(<App />);

    expect(screen.getByTitle("本地终端")).toHaveTextContent("本地");
    expect(screen.getByTitle("命令库")).toHaveTextContent("命令");
    expect(screen.getByTitle("设置")).toHaveTextContent("设置");
    expect(screen.queryByTitle("AI 助手")).not.toBeInTheDocument();
  });

  test("opens AI inside the terminal right sidebar", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    expect(await screen.findByRole("tab", { name: "命令" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "文件" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));

    expect(await screen.findByRole("heading", { name: "AI 对话栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Codex CLI/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hermes/ })).toBeInTheDocument();
    expect(screen.queryByText("当前上下文")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex CLI 执行器")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行...")).toBeInTheDocument();
  });

  test("shows quoted terminal selection inside the AI chat panel", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));

    await waitFor(() => expect(terminalMock.selectionHandler).toBeTypeOf("function"));

    terminalMock.selectionText = "ERROR failed to connect 10.0.0.8";
    terminalMock.selectionHandler?.();

    fireEvent.click(await screen.findByRole("button", { name: "添加到对话" }));

    expect(await screen.findByText("来自 Local CMD 的终端引用")).toBeInTheDocument();
    expect(screen.getByText("ERROR failed to connect 10.0.0.8")).toBeInTheDocument();
  });

  test("starts Codex in a background job without approval", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.change(await screen.findByTestId("ai-memory-input"), {
      target: { value: "记住：优先检查最新日志" }
    });
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "分析这段日志" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    expect(window.pywebview?.api?.run_codex).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(window.pywebview?.api?.start_codex_run).toHaveBeenCalled();
    });
    const call = (window.pywebview?.api?.start_codex_run as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("记住：优先检查最新日志");
    expect(window.localStorage.getItem("ldyssh.ai.sessions")).toContain("记住：优先检查最新日志");
    await waitFor(() => {
      expect(window.pywebview?.api?.get_codex_run).toHaveBeenCalledWith("codex-job-1");
    });
    expect(await screen.findByText("Codex 已完成分析")).toBeInTheDocument();
    expect(screen.queryByText(/审批/)).not.toBeInTheDocument();
  });

  test("shows a thinking marker while Codex is running", async () => {
    (window.pywebview?.api?.get_codex_run as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "分析当前错误" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    expect(await screen.findByText("thinking")).toBeInTheDocument();
  });

  test("keeps Codex prompt context and runtime warnings out of the chat transcript", async () => {
    (window.pywebview?.api?.get_codex_run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      running: false,
      completed: true,
      output: [
        "codex_core_plugins::manager: failed to refresh curated plugin cache",
        "2026-07-09 WARN codex_mcp_client: failed to initialize MCP client",
        "OpenAI Codex v0.31.0",
        "session id: 019f30d2",
        "tokens used: 1294",
        "succeeded in 8.1s",
        "```json",
        "{\"type\":\"message_delta\",\"delta\":\"噪音\"}",
        "```",
        "---",
        "会话记忆：",
        "记住：优先检查最新日志",
        "用户问题：hi"
      ].join("\n"),
      error: ""
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.change(await screen.findByTestId("ai-memory-input"), {
      target: { value: "记住：优先检查最新日志" }
    });
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "hi" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    expect(await screen.findByText("Codex 执行失败，请检查本地 Codex 环境。")).toBeInTheDocument();
    const transcript = screen.getByTestId("ai-chat-transcript");
    expect(within(transcript).queryByText(/codex_core_plugins/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/OpenAI Codex/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/session id/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/tokens used/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/message_delta/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/优先检查最新日志/)).not.toBeInTheDocument();
  });

  test("checks Hermes connection through the native bridge proxy", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hermes/ }));
    fireEvent.change(await screen.findByLabelText("Hermes Base URL"), {
      target: { value: "http://127.0.0.1:3000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检查连接" }));

    await waitFor(() => {
      expect(window.pywebview?.api?.hermes_http_request).toHaveBeenCalled();
    });
    const call = (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("http://127.0.0.1:3000/health");
    expect(window.fetch).not.toHaveBeenCalled();
    expect(await screen.findByText("Hermes 连接正常")).toBeInTheDocument();
  });

  test("configures a remote Hermes WSS URL", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hermes/ }));
    fireEvent.change(await screen.findByLabelText("Hermes WSS URL"), {
      target: { value: "wss://hermes.internal/ws" }
    });

    expect(screen.getByDisplayValue("wss://hermes.internal/ws")).toBeInTheDocument();
    expect(screen.getByText(/复制以 ws:\/\/ 或 wss:\/\//)).toBeInTheDocument();
  });

  test("keeps the app light while defaulting the terminal to a dark theme", async () => {
    render(<App />);

    expect(screen.getByTestId("app-root")).toHaveAttribute("data-theme", "light");
    fireEvent.click(screen.getByTitle("本地终端"));
    await waitFor(() => {
      expect(screen.getAllByRole("button").some((button) => button.textContent?.includes("Local CMD"))).toBe(true);
    });
    const openLocalButton = screen.getAllByRole("button").find((button) => button.textContent?.includes("Local CMD"));
    fireEvent.click(openLocalButton!);

    expect(await screen.findByTestId("terminal-shell")).toHaveAttribute("data-terminal-theme", "dark");
  });

  test("shows terminal theme controls and background upload in settings", async () => {
    render(<App />);

    const settingsButton = screen.getAllByRole("button").find((button) => button.getAttribute("title") === "设置");
    expect(settingsButton).toBeTruthy();
    fireEvent.click(settingsButton!);

    expect(await screen.findByTestId("terminal-theme-dark")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-theme-light")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-background-upload")).toHaveAttribute("accept", "image/*");
  });

  test("adjusts terminal background mask opacity", async () => {
    window.localStorage.setItem("ldyssh.terminal.backgroundImage", "data:image/png;base64,bg");

    render(<App />);

    fireEvent.click(screen.getByTitle("设置"));
    const opacitySlider = await screen.findByLabelText("背景遮罩透明度");
    fireEvent.change(opacitySlider, { target: { value: "20" } });

    expect(window.localStorage.getItem("ldyssh.terminal.backgroundOverlay")).toBe("20");

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));

    expect(await screen.findByTestId("terminal-shell")).toHaveStyle({
      backgroundImage: 'linear-gradient(rgba(2, 6, 23, 0.2), rgba(2, 6, 23, 0.2)), url("data:image/png;base64,bg")'
    });
  });
});

describe("command library", () => {
  test("shows existing terminal sessions from the session sidebar and activates them", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    await screen.findByTestId("terminal-shell");

    fireEvent.click(screen.getByTitle(/SSH/));

    const sessionButton = await screen.findByRole("button", { name: /切换到 Local CMD/ });
    fireEvent.click(sessionButton);

    expect(await screen.findByTestId("terminal-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /切换到 Local CMD/ })).toBeInTheDocument();
  });

  test("keeps terminal output after switching left activity pages", async () => {
    (window.pywebview?.api?.get_output as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: btoa("persisted terminal output")
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    await waitFor(() => expect(terminalMock.writes.join("")).toContain("persisted terminal output"));

    fireEvent.click(screen.getByTitle("设置"));
    fireEvent.click(screen.getByTitle("本地终端"));

    await waitFor(() => {
      const latestTerminal = terminalMock.instances.at(-1);
      expect(latestTerminal?.writes.join("")).toContain("persisted terminal output");
    });
  });

  test("searches terminal history beyond the visible terminal area", async () => {
    (window.pywebview?.api?.get_output as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: btoa(["first line", "needle in old command output", "another line", "second needle result"].join("\n"))
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    await waitFor(() => expect(terminalMock.writes.join("")).toContain("second needle result"));

    expect(await screen.findByRole("button", { name: "查找终端输出" })).toBeInTheDocument();
    await waitFor(() => expect(terminalMock.keyHandler).toBeTypeOf("function"));
    act(() => {
      terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }));
    });
    fireEvent.change(screen.getByPlaceholderText("查找终端输出"), {
      target: { value: "needle" }
    });

    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText(/needle in old command output/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText(/second needle result/)).toBeInTheDocument();
  });

  test("connects from the recent-host sidebar and opens a terminal session immediately", async () => {
    let finishConnect!: (value: { success: boolean }) => void;
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-1", hostname: "10.0.0.8", port: 22, username: "root", password: "secret" }
    ]);
    (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => {
        finishConnect = resolve;
      })
    );

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-1/ });
    fireEvent.click(recentHost[0]);

    expect(await screen.findByTestId("terminal-shell")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.pywebview?.api?.create_session).toHaveBeenCalled();
      expect(window.pywebview?.api?.connect).toHaveBeenCalled();
    });

    finishConnect({ success: true });
  });

  test("connects from the host list card", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-2", hostname: "10.0.0.9", port: 2222, username: "ubuntu", password: "secret" }
    ]);

    render(<App />);

    const main = document.querySelector("main");
    expect(main).toBeTruthy();
    const hostCard = await within(main as HTMLElement).findByRole("button", { name: "连接 prod-2" });
    fireEvent.click(hostCard);

    await waitFor(() => {
      expect(window.pywebview?.api?.connect).toHaveBeenCalled();
    });
    const connectArgs = (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(connectArgs?.[0]).toBe("ssh-1");
    expect(connectArgs?.[1]).toContain("\"hostname\":\"10.0.0.9\"");
    expect(await screen.findByTestId("terminal-shell")).toBeInTheDocument();
  });

  test("deletes a saved host from the host list", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key: "prod-delete", name: "prod-delete", hostname: "10.0.0.12", port: 22, username: "root", password: "secret" }
    ]);

    render(<App />);

    const deleteButtons = await screen.findAllByRole("button", { name: "删除 prod-delete" });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => expect(window.pywebview?.api?.delete_saved_connection).toHaveBeenCalledWith("prod-delete"));
  });

  test("asks for a password and retries the same failed SSH session", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-auth", hostname: "10.0.0.10", port: 22, username: "root" }
    ]);
    (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: false, error: "Authentication failed" })
      .mockResolvedValueOnce({ success: true });

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-auth/ });
    fireEvent.click(recentHost[0]);

    expect(await screen.findByTestId("retry-password-dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("retry-password-input"), {
      target: { value: "typed-secret" }
    });
    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));

    await waitFor(() => expect(window.pywebview?.api?.connect).toHaveBeenCalledTimes(2));
    const retryCall = (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(retryCall?.[0]).toBe("ssh-1");
    expect(retryCall?.[1]).toContain("\"password\":\"typed-secret\"");
    expect(window.pywebview?.api?.create_session).toHaveBeenCalledTimes(1);
  });

  test("disconnects and reconnects an SSH session from the tab context menu", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-menu", hostname: "10.0.0.11", port: 22, username: "root", password: "secret" }
    ]);
    (window.pywebview?.api?.create_session as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("ssh-1")
      .mockResolvedValueOnce("ssh-2");

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-menu/ });
    fireEvent.click(recentHost[0]);
    await waitFor(() => expect(window.pywebview?.api?.connect).toHaveBeenCalledTimes(1));

    const tab = await screen.findByRole("button", { name: "prod-menu" });
    fireEvent.contextMenu(tab);
    fireEvent.click(await screen.findByRole("menuitem", { name: "断开" }));

    await waitFor(() => expect(window.pywebview?.api?.disconnect).toHaveBeenCalledWith("ssh-1"));

    fireEvent.contextMenu(tab);
    fireEvent.click(await screen.findByRole("menuitem", { name: "重连" }));

    await waitFor(() => expect(window.pywebview?.api?.connect).toHaveBeenCalledTimes(2));
    const reconnectCall = (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(reconnectCall?.[0]).toBe("ssh-2");
    expect(reconnectCall?.[1]).toContain("\"hostname\":\"10.0.0.11\"");
  });

  test("duplicates a local terminal session from the tab context menu", async () => {
    (window.pywebview?.api?.create_local_session as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("local-1")
      .mockResolvedValueOnce("local-2");

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));

    const tab = await screen.findByRole("button", { name: "Local CMD" });
    fireEvent.contextMenu(tab);
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制标签" }));

    await waitFor(() => expect(window.pywebview?.api?.create_local_session).toHaveBeenCalledTimes(2));
  });

  test("edits an existing saved SSH connection without starting a session", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        key: "10.0.0.8@root",
        name: "prod-1",
        hostname: "10.0.0.8",
        port: 22,
        username: "root",
        password: "secret"
      }
    ]);

    render(<App />);

    const editButtons = await screen.findAllByRole("button", { name: "编辑 prod-1" });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByRole("heading", { name: "编辑 SSH 连接" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "prod-main" }
    });
    fireEvent.change(screen.getByLabelText("端口"), {
      target: { value: "2222" }
    });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "deploy" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(window.pywebview?.api?.save_saved_connection).toHaveBeenCalled());
    const saveArgs = (window.pywebview?.api?.save_saved_connection as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(saveArgs?.[0]).toBe("10.0.0.8@root");
    expect(saveArgs?.[1]).toContain("\"name\":\"prod-main\"");
    expect(saveArgs?.[1]).toContain("\"port\":2222");
    expect(saveArgs?.[1]).toContain("\"username\":\"deploy\"");
    expect(window.pywebview?.api?.create_session).not.toHaveBeenCalled();
    expect(window.pywebview?.api?.connect).not.toHaveBeenCalled();
  });

  test("masks an existing saved password and preserves it when unchanged", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        key: "10.0.0.8@root",
        name: "prod-secret",
        hostname: "10.0.0.8",
        port: 22,
        username: "root",
        password: "secret"
      }
    ]);

    render(<App />);

    const editButtons = await screen.findAllByRole("button", { name: "编辑 prod-secret" });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByDisplayValue("***")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "prod-secret-renamed" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(window.pywebview?.api?.save_saved_connection).toHaveBeenCalled());
    const saveArgs = (window.pywebview?.api?.save_saved_connection as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(saveArgs?.[1]).toContain("\"password\":\"secret\"");
    expect(saveArgs?.[1]).not.toContain("\"password\":\"***\"");
  });

  test("selects an SSH private key path with the native file picker", async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "新建连接" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "浏览密钥文件" }));

    await waitFor(() => expect(window.pywebview?.api?.show_open_file_dialog).toHaveBeenCalled());
    expect(screen.getByDisplayValue("C:\\Users\\1111\\.ssh\\id_rsa")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "key-host" } });
    fireEvent.change(screen.getByLabelText("主机地址"), { target: { value: "10.0.0.20" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "root" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    await waitFor(() => expect(window.pywebview?.api?.connect).toHaveBeenCalled());
    const connectArgs = (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(connectArgs?.[1]).toContain("\"keyPath\":\"C:\\\\Users\\\\1111\\\\.ssh\\\\id_rsa\"");
  });

  test("shows the quick command sidebar inside the terminal workspace", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));

    expect(await screen.findByText("快捷命令栏")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "命令" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByPlaceholderText("搜索命令或文件夹"), {
      target: { value: "磁盘" }
    });
    fireEvent.click(screen.getByText("磁盘使用"));

    await waitFor(() => {
      expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled();
    });
  });

  test("searches folder commands and sends a command to the active terminal", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    await waitFor(() => expect(screen.getAllByText("Local CMD").length).toBeGreaterThan(0));

    expect(await screen.findByText("快捷命令栏")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索命令或文件夹"), {
      target: { value: "磁盘" }
    });

    expect(screen.getByText("磁盘使用")).toBeInTheDocument();
    expect(screen.queryByText("内存使用")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "发送 磁盘使用" }));

    await waitFor(() => {
      expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled();
    });
    const lastCall = (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(lastCall?.[1]).toBeTruthy();
    expect(atob(lastCall?.[1] as string)).toBe("df -h\n");
  });

  test("switches the terminal right sidebar to files", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "文件" }));

    expect(await screen.findByRole("heading", { name: "文件浏览" })).toBeInTheDocument();
    expect(screen.getByText(/当前会话：Local CMD/)).toBeInTheDocument();
  });

  test("adds command folders and commands then persists them", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.change(await screen.findByPlaceholderText("新文件夹名称"), {
      target: { value: "ADB" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }));
    fireEvent.click(screen.getByRole("button", { name: /ADB/ }));

    fireEvent.change(screen.getByPlaceholderText("命令名称"), {
      target: { value: "列出设备" }
    });
    fireEvent.change(screen.getByPlaceholderText("命令内容"), {
      target: { value: "adb devices" }
    });
    fireEvent.click(screen.getByRole("button", { name: "添加命令" }));

    expect(await screen.findByText("列出设备")).toBeInTheDocument();
    expect(screen.getByText("adb devices")).toBeInTheDocument();
    expect(window.pywebview?.api?.save_command_library).toHaveBeenCalled();
  });
});

describe("settings panel", () => {
  test("switches theme and displays default terminal highlight rules", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("设置"));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("外观主题")).toBeInTheDocument();
    expect(screen.getByText("终端正则高亮")).toBeInTheDocument();
    expect(screen.getByText("错误")).toBeInTheDocument();
    expect(screen.getByText("警告")).toBeInTheDocument();
    expect(screen.getByText("IP 地址")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "深色" }));

    expect(screen.getByTestId("app-root")).toHaveAttribute("data-theme", "dark");
  });

  test("adds a custom terminal highlight rule from settings", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("设置"));

    fireEvent.change(await screen.findByPlaceholderText("规则名称"), {
      target: { value: "自定义错误" }
    });
    fireEvent.change(screen.getByPlaceholderText("正则表达式"), {
      target: { value: "panic|crash" }
    });
    fireEvent.click(screen.getByRole("button", { name: "添加规则" }));

    expect(screen.getByText("自定义错误")).toBeInTheDocument();
    expect(screen.getByText("panic|crash")).toBeInTheDocument();
  });

  test("deletes a custom terminal highlight rule", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("设置"));
    fireEvent.change(await screen.findByPlaceholderText("规则名称"), {
      target: { value: "崩溃" }
    });
    fireEvent.change(screen.getByPlaceholderText("正则表达式"), {
      target: { value: "crash" }
    });
    fireEvent.click(screen.getByRole("button", { name: "添加规则" }));

    expect(screen.getByText("崩溃")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "删除" }).at(-1)!);

    expect(screen.queryByText("崩溃")).not.toBeInTheDocument();
  });
});

describe("browser cards", () => {
  test("adds a browser card and opens it in an external browser", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("浏览器"));
    fireEvent.change(await screen.findByPlaceholderText("标签名称"), {
      target: { value: "Hermes" }
    });
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "hermes.local" }
    });
    fireEvent.click(screen.getByRole("button", { name: "添加网页" }));

    await waitFor(() => expect(window.pywebview?.api?.add_web_favorite).toHaveBeenCalledWith("Hermes", "hermes.local"));
    const card = await screen.findByRole("button", { name: /打开 Hermes/ });
    fireEvent.click(card);

    await waitFor(() => expect(window.pywebview?.api?.open_in_external_browser).toHaveBeenCalledWith("https://hermes.local"));
  });

  test("deletes a browser card", async () => {
    (window.pywebview?.api?.get_web_favorites as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "fav-delete", title: "Docs", url: "https://docs.example.com" }
    ]);

    render(<App />);

    fireEvent.click(screen.getByTitle("浏览器"));
    fireEvent.click(await screen.findByRole("button", { name: "删除 Docs" }));

    await waitFor(() => expect(window.pywebview?.api?.delete_web_favorite).toHaveBeenCalledWith("fav-delete"));
  });
});
