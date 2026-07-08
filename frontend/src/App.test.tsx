import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

const terminalMock = vi.hoisted(() => ({
  selectionText: "",
  selectionHandler: undefined as undefined | (() => void),
  writes: [] as string[]
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  }
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    dispose() {}
    focus() {}
    loadAddon() {}
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
    }
    writeln(data = "") {
      terminalMock.writes.push(`${data}\n`);
    }
  }
}));

beforeEach(() => {
  terminalMock.selectionText = "";
  terminalMock.selectionHandler = undefined;
  terminalMock.writes = [];

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
      run_codex: vi.fn().mockResolvedValue({ success: true, output: "Codex 已完成分析", exitCode: 0 }),
      create_local_session: vi.fn().mockResolvedValue("local-1"),
      get_output: vi.fn().mockResolvedValue({}),
      resize_terminal: vi.fn().mockResolvedValue({ success: true }),
      send_input_base64: vi.fn().mockResolvedValue({ success: true })
    }
  };

  window.fetch = vi.fn().mockResolvedValue({
    ok: true,
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
  test("opens a right-side chat panel with Codex CLI and Hermes tool choices", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("AI"));

    expect(await screen.findByRole("heading", { name: "AI 助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Codex CLI/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hermes/ })).toBeInTheDocument();
    expect(screen.getByText("当前上下文")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行...")).toBeInTheDocument();
  });

  test("shows quoted terminal selection inside the AI chat panel", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("L-CMD"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));

    await waitFor(() => expect(terminalMock.selectionHandler).toBeTypeOf("function"));

    terminalMock.selectionText = "ERROR failed to connect 10.0.0.8";
    terminalMock.selectionHandler?.();

    fireEvent.click(await screen.findByRole("button", { name: "添加到对话" }));
    fireEvent.click(screen.getByTitle("AI"));

    expect(await screen.findByText("来自 Local CMD 的终端引用")).toBeInTheDocument();
    expect(screen.getByText("ERROR failed to connect 10.0.0.8")).toBeInTheDocument();
  });

  test("runs a Codex CLI prompt through the native bridge", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("AI"));
    fireEvent.change(await screen.findByPlaceholderText("输入任务，选择 Codex 或 Hermes 执行..."), {
      target: { value: "分析这段日志" }
    });
    fireEvent.click(screen.getByTitle("发送"));

    await waitFor(() => {
      expect(window.pywebview?.api?.run_codex).toHaveBeenCalled();
    });
    expect(await screen.findByText("Codex 已完成分析")).toBeInTheDocument();
  });

  test("checks Hermes connection with a configurable base URL", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("AI"));
    fireEvent.click(await screen.findByRole("button", { name: /Hermes/ }));
    fireEvent.change(await screen.findByLabelText("Hermes Base URL"), {
      target: { value: "http://127.0.0.1:3000" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检查连接" }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/health", expect.any(Object));
    });
    expect(await screen.findByText("Hermes 连接正常")).toBeInTheDocument();
  });
});

describe("command library", () => {
  test("searches folder commands and sends a command to the active terminal", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("L-CMD"));
    fireEvent.click(await screen.findByRole("button", { name: /打开 Local CMD/ }));
    await waitFor(() => expect(screen.getAllByText("Local CMD").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTitle("CMD"));

    expect(await screen.findByRole("heading", { name: "快捷命令库" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索命令、描述或文件夹"), {
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

  test("adds command folders and commands then persists them", async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle("CMD"));
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
});
