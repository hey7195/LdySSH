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
      create_local_session: vi.fn().mockResolvedValue("local-1"),
      get_output: vi.fn().mockResolvedValue({}),
      resize_terminal: vi.fn().mockResolvedValue({ success: true }),
      send_input_base64: vi.fn().mockResolvedValue({ success: true })
    }
  };

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
