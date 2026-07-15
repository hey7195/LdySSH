import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

const terminalMock = vi.hoisted(() => ({
  selectionText: "",
  selectionHandler: undefined as undefined | (() => void),
  keyHandler: undefined as undefined | ((event: KeyboardEvent) => boolean),
  dataHandler: undefined as undefined | ((data: string) => void),
  options: [] as unknown[],
  writes: [] as string[],
  resizeHandler: undefined as undefined | (() => void),
  focusCalls: 0,
  fitCalls: 0,
  refreshCalls: 0,
  nextFitSize: undefined as undefined | { cols: number; rows: number },
  instances: [] as Array<{ writes: string[]; terminal: { cols: number; rows: number } }>
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {
      terminalMock.fitCalls += 1;
      const latest = terminalMock.instances.at(-1)?.terminal;
      if (latest && terminalMock.nextFitSize) {
        latest.cols = terminalMock.nextFitSize.cols;
        latest.rows = terminalMock.nextFitSize.rows;
      }
    }
  }
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    private instance = { writes: [] as string[], terminal: this as { cols: number; rows: number } };
    cols = 80;
    rows = 24;
    constructor(options: unknown) {
      terminalMock.options.push(options);
      terminalMock.instances.push(this.instance);
    }
    dispose() {}
    focus() {
      terminalMock.focusCalls += 1;
    }
    refresh() {
      terminalMock.refreshCalls += 1;
    }
    resize(cols: number, rows: number) {
      this.cols = cols;
      this.rows = rows;
    }
    loadAddon() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      terminalMock.keyHandler = handler;
    }
    onData(handler: (data: string) => void) {
      terminalMock.dataHandler = handler;
      return { dispose() {} };
    }
    onSelectionChange(handler: () => void) {
      terminalMock.selectionHandler = handler;
      return { dispose() {} };
    }
    getSelection() {
      return terminalMock.selectionText;
    }
    clearSelection() {
      terminalMock.selectionText = "";
    }
    selectAll() {}
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
  terminalMock.dataHandler = undefined;
  terminalMock.options = [];
  terminalMock.writes = [];
  terminalMock.resizeHandler = undefined;
  terminalMock.focusCalls = 0;
  terminalMock.fitCalls = 0;
  terminalMock.refreshCalls = 0;
  terminalMock.nextFitSize = undefined;
  terminalMock.instances = [];
  window.localStorage.clear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });

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
      list_directory: vi.fn().mockResolvedValue({ success: true, files: [] }),
      save_saved_connection: vi.fn().mockResolvedValue({ success: true }),
      delete_saved_connection: vi.fn().mockResolvedValue({ success: true }),
      create_session: vi.fn().mockResolvedValue("ssh-1"),
      connect: vi.fn().mockResolvedValue({ success: true }),
      show_open_file_dialog: vi.fn().mockResolvedValue({ filePath: "C:\\Users\\1111\\.ssh\\id_rsa" }),
      show_save_file_dialog: vi.fn().mockResolvedValue({ filePath: "C:\\Users\\1111\\Downloads\\ldyssh-commands.json" }),
      download_file_to_path: vi.fn().mockResolvedValue({ success: true }),
      read_base64_file: vi.fn().mockResolvedValue({ content: "" }),
      write_base64_file: vi.fn().mockResolvedValue({ success: true }),
      save_ai_attachment: vi.fn((name: unknown) => Promise.resolve({ success: true, filePath: `C:\\Users\\1111\\.ldyssh\\ai_attachments\\${String(name)}` })),
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
      clipboard_copy: vi.fn().mockResolvedValue({ success: true }),
      clipboard_paste: vi.fn().mockResolvedValue({ success: true, text: "echo LDSSH_PASTE_OK\n" }),
      disconnect: vi.fn().mockResolvedValue({ success: true }),
      get_system_info: vi.fn().mockResolvedValue({ success: true, info: {} }),
      get_system_stats: vi.fn().mockResolvedValue({ success: true, stats: {} }),
      get_process_list: vi.fn().mockResolvedValue({ success: true, processes: [] }),
      get_disk_usage: vi.fn().mockResolvedValue({ success: true, disk_usage: [] }),
      get_network_info: vi.fn().mockResolvedValue({ success: true, network_info: [] })
    }
  };

  window.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ status: "ok", reply: "Hermes 已连接" }),
    text: () => Promise.resolve("Hermes 已连接")
  }) as typeof fetch;

  window.ResizeObserver = class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      terminalMock.resizeHandler = () => callback([] as unknown as ResizeObserverEntry[], this);
    }
    observe() {
      terminalMock.resizeHandler?.();
    }
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("AI tools panel", () => {
  test("prevents the WebView default context menu", () => {
    render(<App />);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByTestId("app-root").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

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
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    expect(await screen.findByRole("tab", { name: "命令" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "文件" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));

    expect(await screen.findByRole("heading", { name: "AI 对话栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Codex CLI/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hermes/ })).toBeInTheDocument();
    expect(screen.getByText("当前上下文")).toBeInTheDocument();
    expect(screen.getByLabelText("模型")).toBeInTheDocument();
    expect(screen.getByLabelText("降噪模式")).toBeInTheDocument();
    expect(screen.getByLabelText("继续当前会话")).toBeChecked();
    expect(screen.getByRole("button", { name: "高级配置" })).toBeInTheDocument();
    expect(screen.queryByText("Codex CLI 执行器")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行...")).toBeInTheDocument();
  });

  test("shows terminal selection as a removable AI context chip", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    await waitFor(() => expect(terminalMock.selectionHandler).toBeTypeOf("function"));

    terminalMock.selectionText = "ERROR failed to connect 10.0.0.8";
    terminalMock.selectionHandler?.();

    fireEvent.click(await screen.findByRole("button", { name: "添加到对话" }));

    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    expect(await screen.findByRole("button", { name: "终端选区 1 行" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 终端选区 1 行" }));
    expect(screen.getByText("ERROR failed to connect 10.0.0.8")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除 终端选区 1 行" }));
    expect(screen.queryByRole("button", { name: "终端选区 1 行" })).not.toBeInTheDocument();
  });

  test("sends Codex with model, noise mode and selected context without automatic metadata", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.selectionHandler).toBeTypeOf("function"));

    terminalMock.selectionText = "WARN disk usage 92%\nERROR cleanup failed";
    terminalMock.selectionHandler?.();
    fireEvent.click(await screen.findByRole("button", { name: "添加到对话" }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));

    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "gpt-5.5" } });
    fireEvent.change(screen.getByLabelText("降噪模式"), { target: { value: "minimal" } });
    fireEvent.change(await screen.findByTestId("ai-memory-input"), {
      target: { value: "优先给修复命令" }
    });
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "分析这个错误" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => {
      expect(window.pywebview?.api?.start_codex_run).toHaveBeenCalled();
    });
    const call = (window.pywebview?.api?.start_codex_run as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("\"model\":\"gpt-5.5\"");
    expect(call?.[0]).toContain("\"noiseMode\":\"minimal\"");
    expect(call?.[0]).toContain("<terminal_selection");
    expect(call?.[0]).toContain("WARN disk usage 92%");
    expect(call?.[0]).not.toContain("当前终端:");
    expect(call?.[0]).not.toContain("优先给修复命令");
    expect(await screen.findByText("Codex 已完成分析")).toBeInTheDocument();
  });

  test("uploads a text file and includes it in the Codex prompt", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));

    const file = new File(["ERROR disk full\ncleanup failed"], "error.log", { type: "text/plain" });
    fireEvent.change(await screen.findByTestId("ai-attachment-input"), { target: { files: [file] } });

    expect(await screen.findByText("error.log")).toBeInTheDocument();
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "分析附件" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => expect(window.pywebview?.api?.start_codex_run).toHaveBeenCalled());
    const call = (window.pywebview?.api?.start_codex_run as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("error.log");
    expect(call?.[0]).toContain("C:\\\\Users\\\\1111\\\\.ldyssh\\\\ai_attachments\\\\error.log");
    expect(call?.[0]).toContain("ERROR disk full");
    expect(await screen.findByText("Codex 已完成分析")).toBeInTheDocument();
  });

  test("pastes an image into the AI composer and includes its local path in the prompt", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));

    const image = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
    fireEvent.paste(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      clipboardData: { files: [image] }
    });

    expect(await screen.findByAltText("shot.png")).toBeInTheDocument();
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "看这张图" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => expect(window.pywebview?.api?.start_codex_run).toHaveBeenCalled());
    const call = (window.pywebview?.api?.start_codex_run as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("shot.png");
    expect(call?.[0]).toContain("image/png");
    expect(call?.[0]).toContain("C:\\\\Users\\\\1111\\\\.ldyssh\\\\ai_attachments\\\\shot.png");
  });

  test("starts Codex in a background job without approval", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
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
    expect(call?.[0]).not.toContain("记住：优先检查最新日志");
    expect(window.localStorage.getItem("ldyssh.ai.sessions")).toContain("记住：优先检查最新日志");
    await waitFor(() => {
      expect(window.pywebview?.api?.get_codex_run).toHaveBeenCalledWith("codex-job-1");
    });
    expect(await screen.findByText("Codex 已完成分析")).toBeInTheDocument();
    expect(screen.queryByText(/审批/)).not.toBeInTheDocument();
  });

  test("resumes Codex sessions without resending previous chat messages", async () => {
    (window.pywebview?.api?.get_codex_run as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        success: true,
        running: false,
        completed: true,
        output: "session id: 019f40a7-e44a-7bc3-871e-6acf1120deda\n第一次回复",
        error: ""
      })
      .mockResolvedValueOnce({
        success: true,
        running: false,
        completed: true,
        output: "第二次回复",
        error: ""
      });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));

    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "第一次问题" }
    });
    fireEvent.click(screen.getByTitle("发送"));
    expect(await screen.findByText("第一次回复")).toBeInTheDocument();

    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "第二次问题" }
    });
    fireEvent.click(screen.getByTitle("发送"));
    expect(await screen.findByText("第二次回复")).toBeInTheDocument();

    const calls = (window.pywebview?.api?.start_codex_run as ReturnType<typeof vi.fn>).mock.calls;
    const secondRun = JSON.parse(calls[1]?.[0] || "{}");
    expect(secondRun.continueSession).toBe(true);
    expect(secondRun.codexSessionId).toBe("019f40a7-e44a-7bc3-871e-6acf1120deda");
    expect(secondRun.prompt).toContain("第二次问题");
    expect(secondRun.prompt).not.toContain("第一次问题");
    expect(secondRun.prompt).not.toContain("最近对话");
  });

  test("shows a thinking marker while Codex is running", async () => {
    (window.pywebview?.api?.get_codex_run as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
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
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
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

  test("shows only the final Codex answer when exec transcript noise is returned", async () => {
    (window.pywebview?.api?.get_codex_run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      running: false,
      completed: true,
      output: [
        "workdir: E:\\adb\\tools\\LdSSH",
        "model: gpt-5.5",
        "provider: OpenAI",
        "approval: never",
        "sandbox: read-only",
        "reasoning effort: xhigh",
        "reasoning summaries: none",
        "user",
        "exec",
        "\"powershell.exe\" -Command \"Get-Content -Raw using-superpowers\\SKILL.md\" in E:\\adb\\tools\\LdSSH",
        "name: using-superpowers",
        "description: Use when starting any conversation",
        "# Using Skills",
        "## Skill Types",
        "codex",
        "使用 `superpowers:using-superpowers`，因为这是本轮会话起始要求。",
        "codex",
        "结论：我在。直接发要查的问题、文件路径、日志或命令目标。",
        "依据：当前只收到 `hi`，没有具体任务或日志，我不会编造未看到的内容。",
        "tokens used",
        "19,367",
        "结论：我在。直接发要查的问题、文件路径、日志或命令目标。",
        "依据：当前只收到 `hi`，没有具体任务或日志，我不会编造未看到的内容。"
      ].join("\n"),
      error: ""
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "hi" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    const transcript = screen.getByTestId("ai-chat-transcript");
    await waitFor(() => {
      expect(transcript).toHaveTextContent("结论：我在。直接发要查的问题、文件路径、日志或命令目标。");
    });
    expect(transcript).toHaveTextContent("依据：当前只收到 hi，没有具体任务或日志，我不会编造未看到的内容。");
    expect(transcript.querySelector("code")).toHaveTextContent("hi");
    expect(within(transcript).queryByText(/workdir:/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/model:/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/provider:/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/approval:/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/sandbox:/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/exec/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/using-superpowers/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/Skill Types/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/tokens used/)).not.toBeInTheDocument();
    expect(within(transcript).queryByText(/19,367/)).not.toBeInTheDocument();
  });

  test("renders assistant markdown replies instead of raw markdown fences", async () => {
    (window.pywebview?.api?.get_codex_run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      running: false,
      completed: true,
      output: [
        "## Result",
        "",
        "- Check Wi-Fi interface",
        "",
        "```bash",
        "ip link show wlan0",
        "```"
      ].join("\n"),
      error: ""
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.change(await screen.findByPlaceholderText("\u8f93\u5165\u4efb\u52a1\uff0c\u9009\u62e9 Codex \u6216 Hermes \u6267\u884c..."), {
      target: { value: "render markdown" }
    });
    fireEvent.click(screen.getByTitle("\u53d1\u9001"));

    const transcript = screen.getByTestId("ai-chat-transcript");
    expect(await within(transcript).findByRole("heading", { name: "Result" })).toBeInTheDocument();
    const code = transcript.querySelector("pre code");
    expect(code).toHaveTextContent("ip link show wlan0");
    expect(within(transcript).queryByText(/```bash/)).not.toBeInTheDocument();
  });

  test("checks Hermes connection through the native bridge proxy", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
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

  test("logs into password-protected Hermes before sending chat requests", async () => {
    (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
        cookie: "hermes_session=sid123"
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: { session_id: "session-1" } })
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "Hermes 已回复" })
      });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hermes/ }));
    fireEvent.change(await screen.findByLabelText("Hermes Base URL"), {
      target: { value: "http://127.0.0.1:8648" }
    });
    fireEvent.change(await screen.findByLabelText("Hermes 用户名"), {
      target: { value: "admin" }
    });
    fireEvent.change(await screen.findByLabelText("Hermes 登录密码"), {
      target: { value: "secret" }
    });
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "你好" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    expect(await screen.findByText("Hermes 已回复")).toBeInTheDocument();
    const calls = (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>).mock.calls;
    const loginCall = JSON.parse(calls[0]?.[0] || "{}");
    const sessionCall = JSON.parse(calls[1]?.[0] || "{}");
    const chatCall = JSON.parse(calls[2]?.[0] || "{}");

    expect(loginCall.url).toBe("http://127.0.0.1:8648/api/auth/login");
    expect(JSON.parse(loginCall.body)).toEqual({ username: "admin", password: "secret" });
    expect(sessionCall.url).toBe("http://127.0.0.1:8648/api/session/new");
    expect(sessionCall.cookie).toBe("hermes_session=sid123");
    expect(chatCall.url).toBe("http://127.0.0.1:8648/api/chat/start");
    expect(JSON.parse(chatCall.body)).toEqual({ session_id: "session-1", message: expect.any(String) });
    expect(chatCall.cookie).toBe("hermes_session=sid123");
    expect(screen.queryByLabelText("Hermes API Token")).not.toBeInTheDocument();
  });

  test("keeps Hermes replies in the current provider session and sends only the latest message", async () => {
    (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
        cookie: "hermes_session=sid123"
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: { session_id: "session-1" } })
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "第一次回复" })
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
        cookie: "hermes_session=sid123"
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "第二次回复" })
      });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hermes/ }));
    fireEvent.change(await screen.findByLabelText("Hermes Base URL"), {
      target: { value: "http://127.0.0.1:8648" }
    });
    fireEvent.change(await screen.findByLabelText("Hermes 用户名"), {
      target: { value: "admin" }
    });
    fireEvent.change(await screen.findByLabelText("Hermes 登录密码"), {
      target: { value: "secret" }
    });

    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "第一次问题" }
    });
    fireEvent.click(screen.getByTitle("发送"));
    expect(await screen.findByText("第一次回复")).toBeInTheDocument();

    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "第二次问题" }
    });
    fireEvent.click(screen.getByTitle("发送"));
    expect(await screen.findByText("第二次回复")).toBeInTheDocument();

    const calls = (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => JSON.parse(call[0] || "{}"));
    const sessionCreateCalls = calls.filter((call) => call.url === "http://127.0.0.1:8648/api/session/new");
    const chatCalls = calls.filter((call) => call.url === "http://127.0.0.1:8648/api/chat/start");

    expect(sessionCreateCalls).toHaveLength(1);
    expect(JSON.parse(chatCalls[0].body)).toEqual({ session_id: "session-1", message: "第一次问题" });
    expect(JSON.parse(chatCalls[1].body)).toEqual({ session_id: "session-1", message: "第二次问题" });
    expect(chatCalls[1].body).not.toContain("第一次问题");
    expect(chatCalls[1].body).not.toContain("最近对话");
    expect(chatCalls[1].body).not.toContain("你正在 LdySSH");
  });

  test("uses native Engine.IO polling for Hermes bearer chat runs", async () => {
    (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "jwt123" })
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "text/plain",
        body: '0{"sid":"engine-sid","pingInterval":25000,"pingTimeout":90000}'
      })
      .mockResolvedValueOnce({ success: true, status: 200, contentType: "text/plain", body: "ok" })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "text/plain",
        body: '40/chat-run,{"sid":"namespace-sid"}'
      })
      .mockResolvedValueOnce({ success: true, status: 200, contentType: "text/plain", body: "ok" })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "text/plain",
        body: '42/chat-run,["message.delta",{"event":"message.delta","session_id":"ldyssh_test","delta":"Hermes 已回复"}]'
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        contentType: "text/plain",
        body: '42/chat-run,["run.completed",{"event":"run.completed","session_id":"ldyssh_test"}]'
      })
      .mockResolvedValueOnce({ success: true, status: 200, contentType: "text/plain", body: "ok" });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "AI" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hermes/ }));
    fireEvent.change(await screen.findByLabelText("Hermes Base URL"), {
      target: { value: "http://127.0.0.1:8648" }
    });
    fireEvent.change(await screen.findByLabelText("Hermes 用户名"), {
      target: { value: "admin" }
    });
    fireEvent.change(await screen.findByLabelText("Hermes 登录密码"), {
      target: { value: "secret" }
    });
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "你好" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    expect(await screen.findByText("Hermes 已回复")).toBeInTheDocument();
    const calls = (window.pywebview?.api?.hermes_http_request as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(6);
    const handshakeCall = JSON.parse(calls[1]?.[0] || "{}");
    const namespaceCall = JSON.parse(calls[2]?.[0] || "{}");
    const namespaceAckCall = JSON.parse(calls[3]?.[0] || "{}");
    const runCall = JSON.parse(calls[4]?.[0] || "{}");
    expect(handshakeCall.method).toBe("GET");
    expect(handshakeCall.url).toContain("/socket.io/?EIO=4&transport=polling&profile=default");
    expect(namespaceCall.method).toBe("POST");
    expect(namespaceCall.url).toContain("sid=engine-sid");
    expect(namespaceCall.body).toBe('40/chat-run,{"token":"jwt123"}');
    expect(namespaceAckCall.method).toBe("GET");
    expect(runCall.method).toBe("POST");
    expect(runCall.body).toContain('42/chat-run,["run",');
    expect(runCall.body).toContain('"input":"你好"');
    expect(runCall.body).not.toContain("用户任务");
  });

  test("configures a remote Hermes WSS URL", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
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
      expect(screen.getAllByRole("button").some((button) => button.textContent?.includes("Local Shell"))).toBe(true);
    });
    const openLocalButton = screen.getAllByRole("button").find((button) => button.textContent?.includes("Local Shell"));
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
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    expect(await screen.findByTestId("terminal-shell")).toHaveStyle({
      backgroundImage: 'linear-gradient(rgba(2, 6, 23, 0.2), rgba(2, 6, 23, 0.2)), url("data:image/png;base64,bg")'
    });
  });
});

describe("command library", () => {
  test("shows existing terminal sessions from the session sidebar and activates them", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await screen.findByTestId("terminal-shell");

    fireEvent.click(screen.getByTitle(/SSH/));

    const sessionButton = await screen.findByRole("button", { name: /切换到 Local Shell/ });
    fireEvent.click(sessionButton);

    expect(await screen.findByTestId("terminal-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /切换到 Local Shell/ })).toBeInTheDocument();
  });

  test("keeps terminal output after switching left activity pages", async () => {
    (window.pywebview?.api?.get_output as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: btoa("persisted terminal output")
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.writes.join("")).toContain("persisted terminal output"));

    fireEvent.click(screen.getByTitle("设置"));
    fireEvent.click(screen.getByTitle("本地终端"));

    await waitFor(() => {
      const latestTerminal = terminalMock.instances.at(-1);
      expect(latestTerminal?.writes.join("")).toContain("persisted terminal output");
    });
  });

  test("keeps the local terminal instance while switching left activity pages", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));

    terminalMock.dataHandler?.("l");
    terminalMock.dataHandler?.("s");
    expect(terminalMock.instances).toHaveLength(1);

    fireEvent.click(screen.getByTitle("设置"));
    fireEvent.click(screen.getByTitle("本地终端"));

    await screen.findByTestId("terminal-shell");
    expect(terminalMock.instances).toHaveLength(1);
  });

  test("keeps the current local terminal when returning home and entering terminal again", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));

    terminalMock.dataHandler?.("l");
    terminalMock.dataHandler?.("s");
    const fitCallsBeforeHome = terminalMock.fitCalls;
    const refreshCallsBeforeHome = terminalMock.refreshCalls;
    fireEvent.click(screen.getByTitle("回到桌面"));
    window.dispatchEvent(new Event("focus"));
    expect(terminalMock.fitCalls).toBe(fitCallsBeforeHome);
    expect(terminalMock.refreshCalls).toBe(refreshCallsBeforeHome);

    fireEvent.click(screen.getByTitle("本地终端"));

    await screen.findByTestId("terminal-shell");
    expect(terminalMock.instances).toHaveLength(1);
    expect(window.pywebview?.api?.create_local_session).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(terminalMock.fitCalls).toBeGreaterThan(fitCallsBeforeHome);
      expect(terminalMock.refreshCalls).toBeGreaterThan(refreshCallsBeforeHome);
    });
  });

  test("does not resize a hidden local terminal while staying on the desktop", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.resizeHandler).toBeTypeOf("function"));
    const resizeTerminal = window.pywebview?.api?.resize_terminal as ReturnType<typeof vi.fn>;
    resizeTerminal.mockClear();

    fireEvent.click(screen.getByTitle("回到桌面"));
    terminalMock.resizeHandler?.();

    expect(resizeTerminal).not.toHaveBeenCalled();
  });

  test("redraws the current terminal after returning from the Windows desktop", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));

    const fitCallsBeforeFocus = terminalMock.fitCalls;
    const focusCallsBeforeFocus = terminalMock.focusCalls;
    window.dispatchEvent(new Event("focus"));

    expect(terminalMock.instances).toHaveLength(1);
    expect(terminalMock.fitCalls).toBeGreaterThan(fitCallsBeforeFocus);
    expect(terminalMock.focusCalls).toBeGreaterThan(focusCallsBeforeFocus);
    expect(terminalMock.refreshCalls).toBeGreaterThan(0);
  });

  test("does not sync a collapsed terminal width to the remote pty", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    await waitFor(() => expect(terminalMock.resizeHandler).toBeTypeOf("function"));
    const resizeTerminal = window.pywebview?.api?.resize_terminal as ReturnType<typeof vi.fn>;
    resizeTerminal.mockClear();

    terminalMock.nextFitSize = { cols: 2, rows: 24 };
    window.dispatchEvent(new Event("focus"));
    terminalMock.resizeHandler?.();

    expect(resizeTerminal).not.toHaveBeenCalledWith("local-1", 2, 24);
  });

  test("keeps the local xterm width after returning from desktop with a collapsed fit", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.resizeHandler).toBeTypeOf("function"));
    const terminal = terminalMock.instances.at(-1)?.terminal;
    expect(terminal?.cols).toBe(80);

    const fitCallsBeforeHome = terminalMock.fitCalls;
    terminalMock.nextFitSize = { cols: 2, rows: 24 };
    fireEvent.click(screen.getByTitle("回到桌面"));
    fireEvent.click(screen.getByTitle("本地终端"));

    await waitFor(() => expect(terminalMock.fitCalls).toBeGreaterThan(fitCallsBeforeHome));
    expect(terminal?.cols).toBe(80);
    expect(terminal?.rows).toBe(24);
  });

  test("searches terminal history beyond the visible terminal area", async () => {
    (window.pywebview?.api?.get_output as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: btoa(["first line", "needle in old command output", "another line", "second needle result"].join("\n"))
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
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

  test("keeps keyboard input inside the terminal search box", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /Local Shell/ }));
    fireEvent.click(await screen.findByRole("button", { name: "查找终端输出" }));

    const searchInput = await screen.findByPlaceholderText("查找终端输出");
    terminalMock.focusCalls = 0;
    fireEvent.pointerDown(searchInput);
    fireEvent.change(searchInput, { target: { value: "needle" } });
    fireEvent.keyDown(searchInput, { key: "n" });

    expect(searchInput).toHaveValue("needle");
    expect(terminalMock.focusCalls).toBe(0);
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

    expect(window.pywebview?.api?.delete_saved_connection).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "确认删除" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

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

  test("does not ask for a password when SSH fails before authentication", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-kex", hostname: "10.0.0.13", port: 22, username: "root", keyPath: "E:\\keys\\id_rsa" }
    ]);
    (window.pywebview?.api?.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: "libssh2 handshake failed (code: -5, detail: Unable to exchange encryption keys)"
    });

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-kex/ });
    fireEvent.click(recentHost[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/Unable to exchange encryption keys/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId("retry-password-dialog")).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    const tab = await screen.findByRole("button", { name: "Local Shell" });
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
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

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
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(screen.getAllByText("Local Shell").length).toBeGreaterThan(0));

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

  test("focuses the terminal after sending a right sidebar command", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    await screen.findByTestId("terminal-shell");
    terminalMock.focusCalls = 0;

    const quickCommandList = await screen.findByLabelText("\u5feb\u6377\u547d\u4ee4\u5217\u8868");
    fireEvent.click(within(quickCommandList).getByRole("button", { name: "\u53d1\u9001 \u78c1\u76d8\u4f7f\u7528" }));

    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled());
    expect(terminalMock.focusCalls).toBeGreaterThan(0);
  });

  test("keeps sending vim keystrokes after a right sidebar command starts vim", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        {
          id: "default",
          name: "默认分类",
          commands: [{ id: "vim", name: "编辑文件", command: "vim a.txt", description: "" }]
        }
      ]
    });
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));

    const quickCommandList = await screen.findByLabelText("快捷命令列表");
    fireEvent.click(within(quickCommandList).getByRole("button", { name: "发送 编辑文件" }));
    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled());
    (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mockClear();

    terminalMock.dataHandler?.("i");
    terminalMock.dataHandler?.("\x1b");
    terminalMock.dataHandler?.(":wq\r");

    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalledTimes(3));
    const payloads = (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mock.calls.map((call) => atob(call[1] as string));
    expect(payloads).toEqual(["i", "\x1b", ":wq\r"]);
  });

  test("does not forward terminal-generated OSC and DCS query replies as shell input", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));
    const sendInput = window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>;
    sendInput.mockClear();

    terminalMock.dataHandler?.("\x1b]10;rgb:e5e5/e7e7/ebeb\x07\x1b]11;rgb:0202/0606/1717\x07\x1bP1$r0;276;0c\x1b\\");

    expect(sendInput).not.toHaveBeenCalled();
  });

  test("shows command suggestions and applies the selected suffix", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));
    await waitFor(() => expect(terminalMock.keyHandler).toBeTypeOf("function"));

    const sendInput = window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>;
    sendInput.mockClear();

    await act(async () => {
      terminalMock.dataHandler?.("d");
    });

    const suggestionPanel = await screen.findByTestId("command-suggestion-panel");
    expect(suggestionPanel).toHaveTextContent("df -h");
    expect(suggestionPanel.closest('[data-testid="left-command-suggestion-slot"]')).toBeInTheDocument();
    expect(suggestionPanel.closest("aside")?.querySelector('[aria-label="终端右侧工作栏"]')).not.toBeInTheDocument();
    expect(suggestionPanel).toHaveClass("flex-col");
    expect(suggestionPanel).toHaveStyle({ width: "260px", height: "180px" });
    const options = within(suggestionPanel).getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    const shortcutOption = options.find((option) => option.textContent?.includes("df -h"));
    expect(shortcutOption).toBeTruthy();
    const shortcutDescription = within(shortcutOption as HTMLElement).getByText("磁盘使用");
    expect(shortcutDescription).toHaveClass("text-[10px]");
    options.forEach((option) => {
      expect(option).toHaveClass("w-full");
      expect(option).toHaveClass("min-h-10");
    });
    const moveHandle = within(suggestionPanel).getByRole("button", { name: "移动命令提示" });
    fireEvent.mouseDown(moveHandle, { clientX: 60, clientY: 700 });
    fireEvent.mouseMove(window, { clientX: 80, clientY: 650 });
    fireEvent.mouseUp(window);
    expect(suggestionPanel).toHaveStyle({ left: "100px", bottom: "74px" });
    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestions.panel")).toContain("\"left\":100");

    const resizeHandle = within(suggestionPanel).getByRole("separator", { name: "调整命令提示大小" });
    fireEvent.mouseDown(resizeHandle, { clientX: 260, clientY: 180 });
    fireEvent.mouseMove(window, { clientX: 340, clientY: 240 });
    fireEvent.mouseUp(window);
    expect(suggestionPanel).toHaveStyle({ width: "340px", height: "240px" });
    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestions.panel")).toContain("\"width\":340");
    await waitFor(() => expect(sendInput).toHaveBeenCalledWith("local-1", bytesToBase64(new TextEncoder().encode("d"))));
    sendInput.mockClear();

    let enterHandled = false;
    await act(async () => {
      enterHandled = terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "Enter", cancelable: true })) ?? false;
    });

    expect(enterHandled).toBe(true);
    expect(sendInput).not.toHaveBeenCalled();

    let tabHandled = false;
    await act(async () => {
      tabHandled = terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "Tab", cancelable: true })) ?? false;
    });

    expect(tabHandled).toBe(true);
    expect(sendInput).not.toHaveBeenCalled();

    let handled = true;
    await act(async () => {
      handled = terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "Enter", altKey: true, cancelable: true })) ?? true;
    });

    expect(handled).toBe(false);
    await waitFor(() => expect(sendInput).toHaveBeenCalledTimes(1));
    expect(atob(sendInput.mock.calls.at(-1)?.[1] as string)).toBe("f -h");
    expect(screen.queryByTestId("command-suggestion-panel")).not.toBeInTheDocument();
  });

  test("opens shortcut parameter input when applying a parameterized command suggestion", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        {
          id: "ops",
          name: "Ops",
          commands: [{ id: "nat", name: "NAT check", command: "sudo iptables -t nat -nL | grep [p#1 port]", description: "" }]
        }
      ]
    });
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));
    await waitFor(() => expect(terminalMock.keyHandler).toBeTypeOf("function"));
    const sendInput = window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>;
    sendInput.mockClear();

    await act(async () => {
      terminalMock.dataHandler?.("s");
      terminalMock.dataHandler?.("u");
    });
    expect(await screen.findByTestId("command-suggestion-panel")).toHaveTextContent("sudo iptables");

    await act(async () => {
      terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "Enter", altKey: true, cancelable: true }));
    });

    await screen.findByLabelText("快捷命令参数 NAT check");
    expect(atob(sendInput.mock.calls.at(-1)?.[1] as string)).toBe("\x7f\x7f");
  });

  test("shows fallback notes under shortcut command suggestions without remarks", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        {
          id: "ops",
          name: "Ops",
          commands: [{ id: "open", name: "开放永久访问", command: "echo 1 > /tmp/open", description: "" }]
        }
      ]
    });
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));

    await act(async () => {
      terminalMock.dataHandler?.("e");
      terminalMock.dataHandler?.("c");
      terminalMock.dataHandler?.("h");
      terminalMock.dataHandler?.("o");
    });

    const suggestionPanel = await screen.findByTestId("command-suggestion-panel");
    const shortcutOption = within(suggestionPanel).getAllByRole("option").find((option) => option.textContent?.includes("echo 1 > /tmp/open"));
    expect(shortcutOption).toBeTruthy();
    expect(within(shortcutOption as HTMLElement).getByText("开放永久访问")).toHaveClass("text-[10px]");
  });

  test("does not bypass xterm when focus stays on the terminal shell wrapper", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    const shell = await screen.findByTestId("terminal-shell");
    (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.keyDown(shell, { key: "i" });
    fireEvent.keyDown(shell, { key: "Escape" });
    fireEvent.keyDown(shell, { key: ":" });
    fireEvent.keyDown(shell, { key: "w" });
    fireEvent.keyDown(shell, { key: "q" });
    fireEvent.keyDown(shell, { key: "Enter" });

    expect(window.pywebview?.api?.send_input_base64).not.toHaveBeenCalled();
  });

  test("does not bypass xterm when focus stays on the right command button", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        {
          id: "default",
          name: "默认分类",
          commands: [{ id: "vim", name: "编辑文件", command: "vim a.txt", description: "" }]
        }
      ]
    });
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    const quickCommandList = await screen.findByLabelText("快捷命令列表");
    const vimButton = within(quickCommandList).getByRole("button", { name: "发送 编辑文件" });
    fireEvent.click(vimButton);
    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled());
    (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.keyDown(vimButton, { key: "i" });
    fireEvent.keyDown(vimButton, { key: "Escape" });
    fireEvent.keyDown(vimButton, { key: ":" });
    fireEvent.keyDown(vimButton, { key: "w" });
    fireEvent.keyDown(vimButton, { key: "q" });
    fireEvent.keyDown(vimButton, { key: "Enter" });

    expect(window.pywebview?.api?.send_input_base64).not.toHaveBeenCalled();
  });

  test("focuses the terminal when the terminal surface is clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    const shell = await screen.findByTestId("terminal-shell");
    terminalMock.focusCalls = 0;

    fireEvent.pointerDown(shell);

    expect(terminalMock.focusCalls).toBeGreaterThan(0);
  });

  test("uses JumpServer-style xterm interaction options for TUI apps", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    await screen.findByTestId("terminal-shell");

    expect(terminalMock.options.at(-1)).toMatchObject({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: "block",
      customGlyphs: true,
      rightClickSelectsWord: true,
      scrollOnUserInput: true,
      scrollback: 5000
    });
  });

  test("focuses and refits the terminal when the pointer enters the terminal surface", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    const shell = await screen.findByTestId("terminal-shell");
    terminalMock.focusCalls = 0;
    terminalMock.fitCalls = 0;

    fireEvent.mouseEnter(shell);

    expect(terminalMock.focusCalls).toBeGreaterThan(0);
    expect(terminalMock.fitCalls).toBeGreaterThan(0);
  });

  test("uses responsive compact command library cards without narrow fixed columns", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));

    const commandTitle = await screen.findByText("磁盘使用");
    const commandCard = commandTitle.closest(".rounded-lg");
    const commandGrid = commandCard?.parentElement;
    expect(commandGrid).toHaveClass("grid");
    expect(commandGrid).toHaveClass("grid-cols-[repeat(auto-fit,minmax(220px,1fr))]");
    expect(commandGrid).toHaveClass("2xl:grid-cols-4");
    expect(commandGrid).toHaveClass("gap-2");
    expect(commandCard).toHaveClass("p-3");
    expect(commandCard).toHaveClass("min-w-0");

    const sendButton = within(commandCard as HTMLElement).getByRole("button", { name: "发送 磁盘使用" });
    expect(sendButton).toHaveClass("h-7");
    expect(sendButton).toHaveClass("px-2");
  });

  test("shows quick commands as name chips with details behind the gear and parameter footer", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        {
          id: "default",
          name: "默认分类",
          commands: [
            { id: "nat", name: "查看 NAT", command: "sudo iptables -t nat -nL | grep [p#1 端口]", description: "按端口筛选 NAT" }
          ]
        }
      ]
    });
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    const quickCommandList = await screen.findByLabelText("快捷命令列表");
    const quickCommand = within(quickCommandList).getByRole("button", { name: "发送 查看 NAT" });
    expect(within(quickCommandList).getByText("命令")).toBeInTheDocument();
    expect(screen.queryByText("sudo iptables -t nat -nL | grep [p#1 端口]")).not.toBeInTheDocument();
    expect(screen.queryByText("按端口筛选 NAT")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看命令详情 查看 NAT" }));
    expect(screen.getByText("sudo iptables -t nat -nL | grep [p#1 端口]")).toBeInTheDocument();
    expect(screen.getByText("按端口筛选 NAT")).toBeInTheDocument();

    fireEvent.click(quickCommand);
    const parameterPanel = screen.getByLabelText("快捷命令参数 查看 NAT");
    fireEvent.change(within(parameterPanel).getByLabelText("参数 端口"), { target: { value: "34285" } });
    fireEvent.click(within(parameterPanel).getByRole("button", { name: "发送 查看 NAT" }));

    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled());
    const lastCall = (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(atob(lastCall?.[1] as string)).toBe("sudo iptables -t nat -nL | grep 34285\n");
  });

  test("copies a right sidebar command from the context menu", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    const quickCommandList = await screen.findByLabelText("快捷命令列表");
    const quickCommand = within(quickCommandList).getByRole("button", { name: "发送 磁盘使用" });
    fireEvent.contextMenu(quickCommand, { clientX: 120, clientY: 160 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制命令" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("df -h");
  });

  test("pastes terminal clipboard through the native bridge instead of sending Ctrl+V to xterm", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.keyHandler).toBeTruthy());

    const handled = terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));

    expect(handled).toBe(false);
    await waitFor(() => expect(window.pywebview?.api?.clipboard_paste).toHaveBeenCalled());
    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled());
    const lastCall = (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("local-1");
    expect(atob(lastCall?.[1] as string)).toBe("echo LDSSH_PASTE_OK\n");
  });

  test("normalizes CRLF clipboard text before pasting into terminal editors", async () => {
    (window.pywebview?.api?.clipboard_paste as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      text: "7bcbeb36256c4e5988fe259d472dbef6\r\n3d007a341f134098b122d1617f50ab14\r\n"
    });
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.keyHandler).toBeTruthy());

    terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));

    await waitFor(() => expect(window.pywebview?.api?.send_input_base64).toHaveBeenCalled());
    const lastCall = (window.pywebview?.api?.send_input_base64 as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(atob(lastCall?.[1] as string)).toBe("7bcbeb36256c4e5988fe259d472dbef6\n3d007a341f134098b122d1617f50ab14\n");
  });

  test("copies terminal selection on Ctrl+C and does not send SIGINT", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    await waitFor(() => expect(terminalMock.keyHandler).toBeTruthy());
    terminalMock.selectionText = "selected output";

    const handled = terminalMock.keyHandler?.(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }));

    expect(handled).toBe(false);
    expect(window.pywebview?.api?.clipboard_copy).toHaveBeenCalledWith("selected output");
    expect(window.pywebview?.api?.send_input_base64).not.toHaveBeenCalled();
  });

  test("switches the terminal right sidebar to files", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "文件" }));

    expect(await screen.findByRole("heading", { name: "文件浏览" })).toBeInTheDocument();
    expect(screen.getByText(/当前会话：Local Shell/)).toBeInTheDocument();
  });

  test("loads remote files for a connected SSH session", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-files", hostname: "10.0.0.20", port: 22, username: "root", password: "secret" }
    ]);
    (window.pywebview?.api?.list_directory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      files: [
        { name: "logs", type: "directory", size: "0 B", date: "2026-07-10 14:00:00", permissions: 16877 },
        { name: "app.log", type: "file", size: "8.0 KB", date: "2026-07-10 14:01:00", permissions: 33188 }
      ]
    });

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-files/ });
    fireEvent.click(recentHost[0]);
    await waitFor(() => expect(window.pywebview?.api?.connect).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("tab", { name: "文件" }));

    await waitFor(() => expect(window.pywebview?.api?.list_directory).toHaveBeenCalledWith("ssh-1", "/"));
    expect(await screen.findByText("logs")).toBeInTheDocument();
    expect(screen.getByText("app.log")).toBeInTheDocument();
    expect(screen.queryByText("文件列表接入中。")).not.toBeInTheDocument();
  });

  test("shows file icons and downloads a remote file from the context menu", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-download", hostname: "10.0.0.21", port: 22, username: "root", password: "secret" }
    ]);
    (window.pywebview?.api?.list_directory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      files: [
        { name: "logs", type: "directory", size: "0 B", date: "2026-07-10 14:00:00" },
        { name: "app.log", type: "file", size: "8.0 KB", date: "2026-07-10 14:01:00" }
      ]
    });
    (window.pywebview?.api?.show_save_file_dialog as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      filePath: "C:\\Users\\1111\\Downloads\\app.log"
    });

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-download/ });
    fireEvent.click(recentHost[0]);
    await waitFor(() => expect(window.pywebview?.api?.connect).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("tab", { name: "文件" }));

    expect(await screen.findByLabelText("目录图标")).toBeInTheDocument();
    expect(screen.getByLabelText("文件图标")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: /app\.log/ }), { clientX: 220, clientY: 260 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "下载文件" }));

    await waitFor(() => {
      expect(window.pywebview?.api?.show_save_file_dialog).toHaveBeenCalledWith("app.log");
      expect(window.pywebview?.api?.download_file_to_path).toHaveBeenCalledWith("ssh-1", "/app.log", "C:\\Users\\1111\\Downloads\\app.log");
    });
  });

  test("adds command folders and commands then persists them", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.change(await screen.findByPlaceholderText("新文件夹名称"), {
      target: { value: "ADB" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }));
    fireEvent.click(screen.getByRole("button", { name: /^ADB\s*0$/ }));

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

  test("adds multiline commands without flattening line breaks", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.change(screen.getByPlaceholderText("命令名称"), {
      target: { value: "multi line" }
    });

    const commandInput = await screen.findByPlaceholderText("命令内容");
    expect(commandInput.tagName).toBe("TEXTAREA");
    fireEvent.change(commandInput, {
      target: { value: "echo first\necho second" }
    });
    fireEvent.click(screen.getByRole("button", { name: "添加命令" }));

    await waitFor(() => expect(window.pywebview?.api?.save_command_library).toHaveBeenCalled());
    const call = (window.pywebview?.api?.save_command_library as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("echo first\\necho second");
  });

  test("edits an existing command in a dialog instead of filling the add form", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    const addCommandInput = await screen.findByPlaceholderText("命令内容");
    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "编辑命令" });
    expect(addCommandInput).toHaveValue("");
    expect(within(dialog).getByDisplayValue("磁盘使用")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByDisplayValue("df -h"), {
      target: { value: "df -h /data" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存命令" }));

    await waitFor(() => expect(window.pywebview?.api?.save_command_library).toHaveBeenCalled());
    const call = (window.pywebview?.api?.save_command_library as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("df -h /data");
    expect(screen.queryByRole("dialog", { name: "编辑命令" })).not.toBeInTheDocument();
  });

  test("inserts FinalShell-style parameter placeholders while adding a command", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));

    const commandInput = await screen.findByPlaceholderText("命令内容");
    fireEvent.click(screen.getByRole("button", { name: "参数1" }));
    expect(commandInput).toHaveValue("[p#1 参数名]");

    fireEvent.click(screen.getByRole("button", { name: "参数3" }));
    expect(commandInput).toHaveValue("[p#1 参数名][p#3 参数名]");
  });

  test("deletes a command folder and persists the library", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        { id: "ops", name: "Ops", commands: [{ id: "uptime", name: "Uptime", command: "uptime" }] },
        { id: "adb", name: "ADB", commands: [{ id: "devices", name: "Devices", command: "adb devices" }] }
      ]
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.click(await screen.findByRole("button", { name: /^ADB\s*1$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "删除文件夹 ADB" }));

    expect(window.pywebview?.api?.save_command_library).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "确认删除" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByRole("button", { name: /ADB/ })).not.toBeInTheDocument();
    await waitFor(() => expect(window.pywebview?.api?.save_command_library).toHaveBeenCalled());
    const call = (window.pywebview?.api?.save_command_library as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toContain("Ops");
    expect(call?.[0]).not.toContain("ADB");
  });

  test("confirms before deleting a command", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.click(await screen.findByRole("button", { name: "删除命令 磁盘使用" }));

    expect(screen.getByText("磁盘使用")).toBeInTheDocument();
    expect(window.pywebview?.api?.save_command_library).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "确认删除" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.queryByText("磁盘使用")).not.toBeInTheDocument();
    await waitFor(() => expect(window.pywebview?.api?.save_command_library).toHaveBeenCalled());
    const call = (window.pywebview?.api?.save_command_library as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).not.toContain("磁盘使用");
  });

  test("wraps long command folder names in the terminal command sidebar", async () => {
    const longName = "ADB package and network maintenance commands";
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [{ id: "long", name: longName, commands: [{ id: "devices", name: "Devices", command: "adb devices" }] }]
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    const folderButton = await screen.findByRole("button", { name: new RegExp(longName) });
    expect(folderButton.parentElement).toHaveClass("flex");
    expect(folderButton.parentElement).toHaveClass("flex-wrap");
    expect(folderButton.parentElement).toHaveClass("overflow-x-hidden");
    expect(folderButton).toHaveClass("min-w-0");
    expect(folderButton).toHaveClass("basis-[calc((100%_-_1rem)/3)]");
    expect(folderButton).toHaveClass("h-[48px]");
    expect(folderButton).toHaveClass("flex-col");
    expect(folderButton).toHaveClass("text-[12px]");
    expect(folderButton).toHaveClass("[overflow-wrap:anywhere]");
  });

  test("wraps the default command folder without changing folder slot size", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    const defaultFolder = await screen.findByRole("button", { name: /^默认分类\s*2$/ });
    const serviceFolder = await screen.findByRole("button", { name: /^服务操作\s*1$/ });
    expect(defaultFolder.parentElement).toHaveClass("flex");
    expect(defaultFolder.parentElement).toHaveClass("flex-wrap");
    expect(defaultFolder.parentElement).toHaveClass("overflow-x-hidden");
    expect(defaultFolder).toHaveClass("basis-[calc((100%_-_1rem)/3)]");
    expect(defaultFolder).toHaveClass("h-[48px]");
    expect(defaultFolder).toHaveClass("flex-col");
    expect(defaultFolder).toHaveClass("text-[12px]");

    fireEvent.click(serviceFolder);

    expect(defaultFolder).toHaveClass("basis-[calc((100%_-_1rem)/3)]");
    expect(serviceFolder).toHaveClass("basis-[calc((100%_-_1rem)/3)]");
    expect(serviceFolder).toHaveClass("h-[48px]");
    expect(serviceFolder).toHaveClass("flex-col");
  });

  test("keeps command folder chips in fixed three-wide slots", async () => {
    (window.pywebview?.api?.get_command_library as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      folders: [
        { id: "default", name: "Default category", commands: [{ id: "one", name: "One", command: "echo one" }] },
        { id: "ops", name: "Operations", commands: [{ id: "two", name: "Two", command: "echo two" }] },
        { id: "adb", name: "adb", commands: [{ id: "three", name: "Three", command: "adb devices" }] },
        { id: "long", name: "adb install package maintenance", commands: [{ id: "four", name: "Four", command: "echo four" }] },
        { id: "safe", name: "Security", commands: [{ id: "five", name: "Five", command: "echo five" }] },
        { id: "misc", name: "Misc", commands: [{ id: "six", name: "Six", command: "echo six" }] }
      ]
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    const defaultFolder = await screen.findByRole("button", { name: /Default category/ });
    const grid = defaultFolder.parentElement;
    const sidebar = defaultFolder.closest("aside");
    expect(sidebar).toHaveClass("w-[420px]");
    expect(sidebar).toHaveClass("min-w-0");
    expect(sidebar).toHaveClass("max-w-[420px]");
    expect(sidebar).toHaveClass("overflow-hidden");
    expect(grid).toHaveClass("flex");
    expect(grid).toHaveClass("flex-wrap");
    expect(grid).toHaveClass("w-full");
    expect(grid).toHaveClass("min-w-0");
    expect(grid).toHaveClass("max-w-full");
    expect(grid).toHaveClass("overflow-x-hidden");

    const longFolder = await screen.findByRole("button", { name: /adb install package maintenance/ });
    const safeFolder = await screen.findByRole("button", { name: /^Security\s*1$/ });
    fireEvent.click(longFolder);

    for (const folderButton of [defaultFolder, longFolder, safeFolder]) {
      expect(folderButton).toHaveClass("basis-[calc((100%_-_1rem)/3)]");
      expect(folderButton).toHaveClass("min-w-0");
      expect(folderButton).toHaveClass("h-[48px]");
      expect(folderButton).toHaveClass("text-[12px]");
      expect(folderButton).toHaveClass("[overflow-wrap:anywhere]");
    }
  });

  test("imports FinalShell commands through the command panel", async () => {
    const finalShellJson = JSON.stringify({
      groups: [{ name: "FinalShell", children: [{ name: "查看磁盘", cmd: "df -h /data" }] }]
    });
    (window.pywebview?.api?.show_open_file_dialog as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      filePath: "C:\\Users\\1111\\.finalshell\\commands.json"
    });
    (window.pywebview?.api?.read_base64_file as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: bytesToBase64(new TextEncoder().encode(finalShellJson))
    });

    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.click(await screen.findByRole("button", { name: "导入 FinalShell" }));

    expect(await screen.findByText("查看磁盘")).toBeInTheDocument();
    expect(screen.getByText("df -h /data")).toBeInTheDocument();
    expect(window.pywebview?.api?.save_command_library).toHaveBeenCalled();
  });

  test("exports command library through the native save dialog", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("命令库"));
    fireEvent.click(await screen.findByRole("button", { name: "导出" }));

    await waitFor(() => expect(window.pywebview?.api?.write_base64_file).toHaveBeenCalled());
    const call = (window.pywebview?.api?.write_base64_file as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(call?.[0]).toBe("C:\\Users\\1111\\Downloads\\ldyssh-commands.json");
    expect(new TextDecoder().decode(base64ToBytes(call?.[1] as string))).toContain('"folders"');
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

  test("configures terminal font and RGB colors from settings", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("设置"));
    fireEvent.change(await screen.findByLabelText("终端字体"), {
      target: { value: "JetBrains Mono, monospace" }
    });
    fireEvent.change(screen.getByLabelText("字号"), {
      target: { value: "16" }
    });
    fireEvent.change(screen.getByLabelText("文字颜色"), {
      target: { value: "#00ff88" }
    });
    fireEvent.change(screen.getByLabelText("背景颜色"), {
      target: { value: "#101820" }
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("ldyssh.terminal.fontFamily")).toBe("JetBrains Mono, monospace");
      expect(window.localStorage.getItem("ldyssh.terminal.fontSize")).toBe("16");
      expect(window.localStorage.getItem("ldyssh.terminal.foreground")).toBe("#00ff88");
      expect(window.localStorage.getItem("ldyssh.terminal.background")).toBe("#101820");
    });

    fireEvent.click(screen.getByTitle("本地终端"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local Shell/ }));

    expect(await screen.findByTestId("terminal-shell")).toHaveStyle({
      backgroundColor: "#101820",
      color: "#00ff88"
    });
    await waitFor(() => {
      const options = terminalMock.options.at(-1) as { fontFamily?: string; fontSize?: number; theme?: { background?: string; foreground?: string } };
      expect(options.fontFamily).toBe("JetBrains Mono, monospace");
      expect(options.fontSize).toBe(16);
      expect(options.theme?.foreground).toBe("#00ff88");
      expect(options.theme?.background).toBe("#101820");
    });
  });

  test("turns command suggestions off from terminal settings", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u8bbe\u7f6e"));
    const toggle = await screen.findByLabelText("\u547d\u4ee4\u667a\u80fd\u63d0\u793a");
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestionsEnabled")).toBe("false");

    fireEvent.click(screen.getByTitle("\u672c\u5730\u7ec8\u7aef"));
    fireEvent.click(await screen.findByRole("button", { name: /\u6253\u5f00 Local Shell/ }));
    await waitFor(() => expect(terminalMock.dataHandler).toBeTypeOf("function"));

    await act(async () => {
      terminalMock.dataHandler?.("d");
    });

    expect(screen.queryByTestId("command-suggestion-panel")).not.toBeInTheDocument();
  });

  test("configures command suggestion sources and custom apply key", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("\u8bbe\u7f6e"));
    fireEvent.click(await screen.findByLabelText("\u663e\u793a\u5feb\u6377\u547d\u4ee4"));
    fireEvent.click(screen.getByLabelText("\u663e\u793a Linux \u547d\u4ee4"));
    fireEvent.change(screen.getByLabelText("\u5019\u9009\u5e94\u7528\u6309\u952e"), { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: "\u5f55\u5165\u6309\u952e" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "\u6b63\u5728\u5f55\u5165\u6309\u952e" }), {
      key: "k",
      code: "KeyK",
      ctrlKey: true
    });

    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestions.shortcuts")).toBe("false");
    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestions.linux")).toBe("false");
    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestions.applyKey")).toBe("custom");
    expect(window.localStorage.getItem("ldyssh.terminal.commandSuggestions.customApplyKey")).toContain("Ctrl+k");
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
    const colorPicker = screen.getByLabelText("规则颜色") as HTMLInputElement;
    expect(colorPicker.type).toBe("color");
    fireEvent.change(colorPicker, { target: { value: "#00aa88" } });
    fireEvent.click(screen.getByRole("button", { name: "添加规则" }));

    expect(screen.getByText("自定义错误")).toBeInTheDocument();
    expect(screen.getByText("panic|crash")).toBeInTheDocument();
    expect(window.localStorage.getItem("ldyssh.terminal.highlightRules")).toContain("#00aa88");
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

describe("monitor panel", () => {
  test("renders host monitoring data as charts and tables instead of JSON blocks", async () => {
    (window.pywebview?.api?.get_saved_connections as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "prod-monitor", hostname: "10.0.0.8", port: 22, username: "root", password: "secret" }
    ]);
    (window.pywebview?.api?.get_system_info as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      info: {
        architecture: "x86_64",
        cpu: "Intel(R) Core(TM) i5-7500 CPU @ 3.40GHz",
        hostname: "hy7195",
        os_name: "Ubuntu 22.04.5 LTS",
        os_version: "22.04.5 LTS (Jammy Jellyfish)",
        total_memory: "8083924 kB",
        uptime: "Since 2026-06-01 17:06:35"
      }
    });
    (window.pywebview?.api?.get_system_stats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      stats: {
        cpu_usage: "13.5%",
        disk_total: "98G",
        disk_usage: "23%",
        disk_used: "22G",
        memory_total: "7894 MB",
        memory_usage: "59.0%",
        memory_used: "4654 MB"
      }
    });
    (window.pywebview?.api?.get_process_list as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      processes: [
        { cpu: "26.3%", memory: "24.6%", name: "/usr/lib/x86_64-linux-gnu/webkit", pid: "7844" }
      ]
    });
    (window.pywebview?.api?.get_disk_usage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      disk_usage: [
        { device: "/dev/sda3", free: "73G", mount: "/", total: "98G", usage: "23%", used: "22G" }
      ]
    });
    (window.pywebview?.api?.get_network_info as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      network_info: [
        { cidr: "192.168.220.128/24", ip: "192.168.220.128", name: "ens33" }
      ]
    });

    render(<App />);

    const recentHost = await screen.findAllByRole("button", { name: /prod-monitor/ });
    fireEvent.click(recentHost[0]);
    await screen.findByTestId("terminal-shell");
    fireEvent.click(screen.getByTitle("系统监控"));

    expect(await screen.findByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("13.5%")).toBeInTheDocument();
    expect(screen.getAllByText("内存").length).toBeGreaterThan(0);
    expect(screen.getByText("59.0%")).toBeInTheDocument();
    expect(screen.getAllByText("磁盘").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23%").length).toBeGreaterThan(0);
    expect(screen.getByText("hy7195")).toBeInTheDocument();
    expect(screen.getByText("Ubuntu 22.04.5 LTS")).toBeInTheDocument();
    expect(screen.getByText("PID")).toBeInTheDocument();
    expect(screen.getByText("7844")).toBeInTheDocument();
    expect(screen.getByText("ens33")).toBeInTheDocument();
    expect(screen.getByText("192.168.220.128")).toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
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
