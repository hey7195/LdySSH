import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { App } from "./App";

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
    onData() {}
    open() {}
    write() {}
    writeln() {}
  }
}));

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
});
