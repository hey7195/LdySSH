import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { GitVisualizerPanel } from "./GitVisualizerPanel";

describe("GitVisualizerPanel (Git DevOps Workstation)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders workstation top bar, conventional commits and tabs", () => {
    const onRunCommand = vi.fn();
    const onNavigateTerminal = vi.fn();

    render(
      <GitVisualizerPanel
        onRunCommand={onRunCommand}
        activeSessionTitle="prod-server"
        currentCwd="/var/www/my-app"
        onNavigateTerminal={onNavigateTerminal}
      />
    );

    // Header & session title
    expect(screen.getByText("Git DevOps 极客工作台")).toBeInTheDocument();
    expect(screen.getByText("prod-server")).toBeInTheDocument();

    // Input defaulted to currentCwd
    const input = screen.getByPlaceholderText(/输入服务器代码路径/);
    expect(input).toHaveValue("/var/www/my-app");

    // Conventional Commits Builder
    expect(screen.getByText(/规范化 Commit 提交工坊/)).toBeInTheDocument();

    // Staging Actions
    expect(screen.getByText("暂存全部")).toBeInTheDocument();
    expect(screen.getByText("撤出全部")).toBeInTheDocument();
    expect(screen.getByText("放弃全部")).toBeInTheDocument();
  });

  it("triggers conventional commit and push command", () => {
    const onRunCommand = vi.fn();

    render(
      <GitVisualizerPanel
        onRunCommand={onRunCommand}
        currentCwd="/var/www/my-app"
      />
    );

    const msgInput = screen.getByPlaceholderText(/简明扼要描述本次提交的改动/);
    fireEvent.change(msgInput, { target: { value: "增加用户认证中心" } });

    const scopeInput = screen.getByPlaceholderText(/模块/);
    fireEvent.change(scopeInput, { target: { value: "auth" } });

    const commitBtn = screen.getByRole("button", { name: /提交 \(Commit\)/ });
    fireEvent.click(commitBtn);

    expect(onRunCommand).toHaveBeenCalledWith(
      'cd "/var/www/my-app" && git commit -m "feat(auth): 增加用户认证中心"'
    );
  });

  it("launches LazyGit in active terminal", () => {
    const onRunCommand = vi.fn();
    const onNavigateTerminal = vi.fn();

    render(
      <GitVisualizerPanel
        onRunCommand={onRunCommand}
        currentCwd="/root/repo"
        onNavigateTerminal={onNavigateTerminal}
      />
    );

    const lazyGitBtn = screen.getByRole("button", { name: /唤醒 LazyGit/ });
    fireEvent.click(lazyGitBtn);

    expect(onRunCommand).toHaveBeenCalledWith(expect.stringContaining("lazygit"));
    expect(onNavigateTerminal).toHaveBeenCalled();
  });

  it("switches tabs to branches, stash and toolkit", () => {
    const onRunCommand = vi.fn();

    render(
      <GitVisualizerPanel
        onRunCommand={onRunCommand}
        currentCwd="/root/repo"
      />
    );

    // Switch to branches tab
    fireEvent.click(screen.getByRole("button", { name: /分支与标签/ }));
    expect(screen.getByText(/从当前分支创建并切换到新分支/)).toBeInTheDocument();

    // Switch to stash tab
    fireEvent.click(screen.getByRole("button", { name: /Stash 储藏箱/ }));
    expect(screen.getByText(/暂存当前未提交的临时现场/)).toBeInTheDocument();

    // Switch to toolkit tab
    fireEvent.click(screen.getByRole("button", { name: /运维急救箱/ }));
    expect(screen.getByText(/30\+ 项高频 Git 运维急救与排错工具箱/)).toBeInTheDocument();
  });
});
