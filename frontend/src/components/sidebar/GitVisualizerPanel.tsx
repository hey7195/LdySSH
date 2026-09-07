import React, { useState } from "react";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  GitMerge,
  RefreshCw,
  FileCode,
  Check,
  Eye,
  Download,
  AlertCircle,
  Trash2,
  Plus,
  Minus,
  RotateCcw,
  Copy,
  Search,
  Tag,
  Archive,
  Terminal,
  Zap,
  Sparkles,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  UploadCloud,
  DownloadCloud,
  Layers,
  Wrench,
  Undo2,
  FolderGit2,
  FolderOpen
} from "lucide-react";
import { cn } from "../../lib/utils";

interface GitVisualizerPanelProps {
  onRunCommand: (command: string) => void;
  activeSessionTitle?: string;
  currentCwd?: string;
  onNavigateTerminal?: () => void;
}

type WorkstationTab = "history" | "branches" | "stash" | "toolkit";

interface ConventionalCommitType {
  type: string;
  emoji: string;
  label: string;
  desc: string;
}

const CONVENTIONAL_COMMIT_TYPES: ConventionalCommitType[] = [
  { type: "feat", emoji: "✨", label: "新功能 (feat)", desc: "增加新特性或功能" },
  { type: "fix", emoji: "🐛", label: "修复 (fix)", desc: "修复软件或逻辑缺陷" },
  { type: "docs", emoji: "📝", label: "文档 (docs)", desc: "仅修改了文档/注释" },
  { type: "style", emoji: "💄", label: "格式 (style)", desc: "代码格式调整（空格、分号等）" },
  { type: "refactor", emoji: "♻️", label: "重构 (refactor)", desc: "既不修复 bug 也不添加特性的代码变动" },
  { type: "perf", emoji: "⚡", label: "性能 (perf)", desc: "提升运行效率或响应速度的代码优化" },
  { type: "test", emoji: "🧪", label: "测试 (test)", desc: "增加或修改单元/集成测试" },
  { type: "build", emoji: "📦", label: "构建 (build)", desc: "影响构建系统或外部依赖项的更改" },
  { type: "ci", emoji: "🤖", label: "CI/CD (ci)", desc: "持续集成配置文件和脚本修改" },
  { type: "chore", emoji: "🔧", label: "杂项 (chore)", desc: "其他不修改 src 或测试文件的变动" },
  { type: "revert", emoji: "⏪", label: "回滚 (revert)", desc: "撤销先前的某个提交" }
];

export const GitVisualizerPanel: React.FC<GitVisualizerPanelProps> = ({
  onRunCommand,
  activeSessionTitle,
  currentCwd,
  onNavigateTerminal
}) => {
  const [repoInput, setRepoInput] = useState(currentCwd || "./");
  const [activeTab, setActiveTab] = useState<WorkstationTab>("history");

  // Conventional Commit State
  const [commitType, setCommitType] = useState<string>("feat");
  const [commitScope, setCommitScope] = useState<string>("");
  const [commitMessage, setCommitMessage] = useState<string>("");

  // Branch & Stash input states
  const [newBranchName, setNewBranchName] = useState<string>("");
  const [stashMessage, setStashMessage] = useState<string>("");

  // Check if input is a Git Web/HTTPS/SSH URL
  const isGitUrl =
    repoInput.startsWith("http://") ||
    repoInput.startsWith("https://") ||
    repoInput.startsWith("git@");

  // Parse GitHub URL branch and clone address
  const parseGitUrl = (rawUrl: string) => {
    let cleanUrl = rawUrl.trim();
    let branch = "";

    if (cleanUrl.includes("/tree/")) {
      const parts = cleanUrl.split("/tree/");
      cleanUrl = parts[0];
      branch = parts[1]?.split("/")[0] || "";
    }

    if (!cleanUrl.endsWith(".git") && !cleanUrl.startsWith("git@")) {
      cleanUrl = cleanUrl + ".git";
    }

    const repoName =
      cleanUrl
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") || "repo";

    return { cloneUrl: cleanUrl, branch, repoName };
  };

  const { cloneUrl, branch, repoName } = parseGitUrl(repoInput);

  const getTargetDir = () => (isGitUrl ? `./${repoName}` : repoInput.trim() || "./");

  const runInRepo = (command: string) => {
    const dir = getTargetDir();
    if (isGitUrl) {
      const fullCmd = `if [ -d "${repoName}" ]; then cd "${repoName}" && ${command}; else git clone ${cloneUrl} ${
        branch ? `-b ${branch}` : ""
      } && cd "${repoName}" && ${command}; fi`;
      onRunCommand(fullCmd);
      setRepoInput(`./${repoName}`);
    } else {
      onRunCommand(`cd "${dir}" && ${command}`);
    }
  };

  // Launch LazyGit Engine (checks installation on remote and launches or auto-installs)
  const handleLaunchLazyGit = () => {
    const dir = getTargetDir();
    const lazygitScript = `cd "${dir}" && if command -v lazygit &> /dev/null; then lazygit; else echo -e "\\033[1;33m[LdySSH] 正在为您极速配置 LazyGit 终端神器...\\033[0m" && mkdir -p ~/.local/bin && ARCH=$(uname -m) && if [ "$ARCH" = "x86_64" ]; then ARCH_NAME="x86_64"; elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then ARCH_NAME="arm64"; else ARCH_NAME="x86_64"; fi && (curl -sSL "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_\${ARCH_NAME}.tar.gz" | tar -xz -C ~/.local/bin lazygit 2>/dev/null || curl -sSL "https://ghproxy.com/https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_\${ARCH_NAME}.tar.gz" | tar -xz -C ~/.local/bin lazygit 2>/dev/null) && export PATH="$HOME/.local/bin:$PATH" && ~/.local/bin/lazygit || echo -e "\\033[1;31m[!] 请使用系统包管理器安装: apt install lazygit 或 dnf install lazygit\\033[0m"; fi`;
    onRunCommand(lazygitScript);
    onNavigateTerminal?.();
  };

  // Build Conventional Commit String
  const buildFullCommitMessage = () => {
    const scopePart = commitScope.trim() ? `(${commitScope.trim()})` : "";
    const msgPart = commitMessage.trim();
    if (!msgPart) return "";
    return `${commitType}${scopePart}: ${msgPart}`;
  };

  const handleCommit = (andPush: boolean = false) => {
    const fullMsg = buildFullCommitMessage();
    if (!fullMsg) return;
    const escapedMsg = fullMsg.replace(/"/g, '\\"');
    const cmd = andPush
      ? `git commit -m "${escapedMsg}" && git push`
      : `git commit -m "${escapedMsg}"`;
    runInRepo(cmd);
    setCommitMessage("");
    setCommitScope("");
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-950/90 text-slate-100 select-none">
      {/* 顶部现代化 Command Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800/80 bg-slate-900/85 px-4 py-2.5 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-xs">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black text-slate-100 tracking-wide">Git DevOps 极客工作台</h2>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 font-mono text-[10px] font-extrabold text-emerald-400">
                Workstation Pro
              </span>
              {activeSessionTitle && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-slate-800/90 border border-slate-700/70 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
                  <Terminal className="h-2.5 w-2.5 text-emerald-400" />
                  {activeSessionTitle}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              源码暂存工坊 • 交互式分支与提交拓扑 • Stash 储藏箱 • LazyGit 终端直通
            </p>
          </div>
        </div>

        {/* 顶部高频快捷动作胶囊组 */}
        <div className="flex items-center gap-1.5">
          {/* LazyGit 1-Click Launch Engine */}
          <button
            onClick={handleLaunchLazyGit}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-3 py-1.5 text-xs font-black text-white shadow-md shadow-emerald-950/40 transition-all hover:scale-102 active:scale-98 cursor-pointer"
            title="一键在活动终端唤醒业界最强 LazyGit 交互式 TUI 工具 (若未安装自动配置单文件版本)"
          >
            <Zap className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
            <span>⚡ 唤醒 LazyGit</span>
          </button>

          <button
            onClick={() => runInRepo("git pull")}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-750 px-2.5 py-1.5 text-xs font-bold text-sky-300 transition-all hover:border-sky-500/50 cursor-pointer"
            title="拉取远程分支最新更新 (git pull)"
          >
            <DownloadCloud className="h-3.5 w-3.5" />
            <span>Pull</span>
          </button>

          <button
            onClick={() => runInRepo("git push")}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-750 px-2.5 py-1.5 text-xs font-bold text-emerald-300 transition-all hover:border-emerald-500/50 cursor-pointer"
            title="推送本地提交至远程仓库 (git push)"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Push</span>
          </button>

          <button
            onClick={() => runInRepo("git fetch --all --prune")}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-750 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition-all hover:border-purple-500/50 cursor-pointer"
            title="同步远端分支索引并清理废弃分支 (git fetch --all --prune)"
          >
            <RefreshCw className="h-3.5 w-3.5 text-purple-400" />
            <span>Fetch</span>
          </button>
        </div>
      </header>

      {/* 路径与仓库智能识别条 */}
      <div className="border-b border-slate-800/70 bg-slate-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <span className="text-[11px] font-black text-slate-400 whitespace-nowrap flex items-center gap-1">
            <FolderGit2 className="h-3.5 w-3.5 text-orange-400" />
            <span>工作目录 / Git URL:</span>
          </span>
          <div className="relative flex-1">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="输入服务器代码路径 (如 ./ 或 /var/www) 或 GitHub 地址 (https://github.com/...)"
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 font-mono text-xs text-emerald-300 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none shadow-2xs"
            />
          </div>
          <button
            onClick={() => runInRepo("git status")}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-extrabold text-slate-100 transition-colors cursor-pointer shrink-0"
            title="执行 git status 检查状态"
          >
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            <span>{isGitUrl ? "克隆并查看" : "检查状态"}</span>
          </button>
        </div>

        {isGitUrl && (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-mono text-emerald-300">
            <AlertCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span>检测到远程仓库: <strong className="text-white">{repoName}</strong></span>
          </div>
        )}
      </div>

      {/* 主工作区分割布局：左侧暂存工坊 + 右侧多功能工作台 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
        {/* ================= 左侧栏 (5 Cols): 源码暂存与规范化 Commit 提交工坊 ================= */}
        <div className="lg:col-span-5 flex flex-col min-h-0 bg-slate-950/50 p-3.5 space-y-3.5 overflow-y-auto">
          {/* 暂存区标题与批量控制 */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-black text-slate-100">源码变更与暂存 (Staging)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => runInRepo("git add -A")}
                className="flex items-center gap-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-400 transition-colors cursor-pointer"
                title="暂存所有变更文件 (git add -A)"
              >
                <Plus className="h-2.5 w-2.5" />
                <span>暂存全部</span>
              </button>
              <button
                onClick={() => runInRepo("git reset")}
                className="flex items-center gap-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 text-[10px] font-black text-slate-300 transition-colors cursor-pointer"
                title="取消所有已暂存文件 (git reset)"
              >
                <Minus className="h-2.5 w-2.5" />
                <span>撤出全部</span>
              </button>
              <button
                onClick={() => runInRepo("git checkout -- .")}
                className="flex items-center gap-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-black text-rose-400 transition-colors cursor-pointer"
                title="丢弃所有工作区未暂存修改 (git checkout -- .)"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>放弃全部</span>
              </button>
            </div>
          </div>

          {/* 快捷变更操作面板 */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold">
              <span>变更文件快速操作</span>
              <span className="font-mono text-emerald-400">git add / reset / diff</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => runInRepo("git diff --staged")}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-750 p-2 text-xs font-bold text-emerald-300 transition-colors cursor-pointer"
                title="查看已暂存的代码 Diff (git diff --staged)"
              >
                <FileCode className="h-3.5 w-3.5 text-emerald-400" />
                <span>查看已暂存 Diff</span>
              </button>
              <button
                onClick={() => runInRepo("git diff")}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-750 p-2 text-xs font-bold text-sky-300 transition-colors cursor-pointer"
                title="查看未暂存的工作区 Diff (git diff)"
              >
                <Eye className="h-3.5 w-3.5 text-sky-400" />
                <span>查看未暂存 Diff</span>
              </button>
            </div>
          </div>

          {/* 规范化 Commit 提交工坊 (Conventional Commits) */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3.5 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
                <span>规范化 Commit 提交工坊</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">Conventional Commits</span>
            </div>

            {/* Type & Scope Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-7">
                <select
                  value={commitType}
                  onChange={(e) => setCommitType(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-200 focus:border-emerald-500 focus:outline-none cursor-pointer"
                >
                  {CONVENTIONAL_COMMIT_TYPES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.emoji} {t.label} - {t.desc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-5">
                <input
                  type="text"
                  value={commitScope}
                  onChange={(e) => setCommitScope(e.target.value)}
                  placeholder="模块 (如 ui, api)"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Commit Message Input */}
            <div>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="简明扼要描述本次提交的改动 (例如: 修复右侧栏遮挡与高对比度按钮优化)..."
                rows={2}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950 p-2.5 font-sans text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none resize-none"
              />
            </div>

            {/* Commit Preview Line */}
            {commitMessage.trim() && (
              <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-2 font-mono text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="truncate">{buildFullCommitMessage()}</span>
              </div>
            )}

            {/* Commit Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleCommit(false)}
                disabled={!commitMessage.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed py-2 text-xs font-black text-white shadow-md shadow-emerald-950/40 transition-all cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>提交 (Commit)</span>
              </button>
              <button
                onClick={() => handleCommit(true)}
                disabled={!commitMessage.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed py-2 text-xs font-black text-white shadow-md transition-all cursor-pointer"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>提交并推送 (Commit & Push)</span>
              </button>
              <button
                onClick={() => runInRepo("git commit --amend --no-edit")}
                className="flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-2 text-xs font-bold text-amber-300 transition-colors cursor-pointer"
                title="追加修改到上一次提交 (git commit --amend --no-edit)"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>追加 (Amend)</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= 右侧栏 (7 Cols): 多功能选项卡工作台 ================= */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-slate-950/30 p-3.5 space-y-3 overflow-hidden">
          {/* 工作台功能选项卡切换栏 */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab("history")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer",
                  activeTab === "history"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                <GitCommit className="h-3.5 w-3.5" />
                <span>🌳 提交历史与树</span>
              </button>

              <button
                onClick={() => setActiveTab("branches")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer",
                  activeTab === "branches"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span>🌿 分支与标签</span>
              </button>

              <button
                onClick={() => setActiveTab("stash")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer",
                  activeTab === "stash"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>📦 Stash 储藏箱</span>
              </button>

              <button
                onClick={() => setActiveTab("toolkit")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer",
                  activeTab === "toolkit"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                )}
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>⚡ 运维急救箱</span>
              </button>
            </div>
          </div>

          {/* 选项卡内容展示区 */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
            {/* ------------ TAB 1: 🌳 Commit 树与历史图谱 ------------ */}
            {activeTab === "history" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-900/60 border border-slate-800 p-3">
                  <div>
                    <h3 className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                      <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
                      <span>交互式 Commit 时间线与分支图谱</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      点击下方快速指令可在活动终端渲染高色彩 ASCII 分支演进树
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => runInRepo("git log --graph --oneline --decorate --all -n 25")}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 px-2.5 py-1.5 text-xs font-bold text-emerald-300 transition-colors cursor-pointer"
                    >
                      <Terminal className="h-3 w-3" />
                      <span>查看全局 Commit 树</span>
                    </button>
                  </div>
                </div>

                {/* 提交树展示模版卡片组 */}
                <div className="space-y-2">
                  <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-slate-200 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>常用日志视图快捷引擎</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">git log presets</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => runInRepo("git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit -n 15")}
                        className="flex items-center justify-start gap-2 rounded-xl border border-slate-700/80 bg-slate-950/80 p-2.5 text-left hover:border-emerald-500/50 hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <GitBranch className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-xs font-black text-slate-200">高彩彩色分支演进图</div>
                          <div className="font-mono text-[10px] text-slate-400">git log --graph 彩色增强版</div>
                        </div>
                      </button>

                      <button
                        onClick={() => runInRepo("git log --stat -n 5")}
                        className="flex items-center justify-start gap-2 rounded-xl border border-slate-700/80 bg-slate-950/80 p-2.5 text-left hover:border-sky-500/50 hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <FileCode className="h-4 w-4 text-sky-400 shrink-0" />
                        <div>
                          <div className="text-xs font-black text-slate-200">提交代码增删行数统计</div>
                          <div className="font-mono text-[10px] text-slate-400">git log --stat (最近5次)</div>
                        </div>
                      </button>

                      <button
                        onClick={() => runInRepo("git shortlog -sn --no-merges")}
                        className="flex items-center justify-start gap-2 rounded-xl border border-slate-700/80 bg-slate-950/80 p-2.5 text-left hover:border-purple-500/50 hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                        <div>
                          <div className="text-xs font-black text-slate-200">开发者提交贡献榜</div>
                          <div className="font-mono text-[10px] text-slate-400">git shortlog -sn 统计</div>
                        </div>
                      </button>

                      <button
                        onClick={() => runInRepo("git log --grep='fix' --oneline -n 10")}
                        className="flex items-center justify-start gap-2 rounded-xl border border-slate-700/80 bg-slate-950/80 p-2.5 text-left hover:border-amber-500/50 hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <Search className="h-4 w-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="text-xs font-black text-slate-200">过滤历史 Bug 修复提交</div>
                          <div className="font-mono text-[10px] text-slate-400">git log --grep="fix"</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------ TAB 2: 🌿 分支、标签与合并管理 ------------ */}
            {activeTab === "branches" && (
              <div className="space-y-3">
                {/* 新建分支框 */}
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3 space-y-2">
                  <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-purple-400" />
                    <span>从当前分支创建并切换到新分支</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="新分支名称 (如 feature/user-auth, fix/bug-12)"
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-purple-300 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!newBranchName.trim()) return;
                        runInRepo(`git checkout -b ${newBranchName.trim()}`);
                        setNewBranchName("");
                      }}
                      disabled={!newBranchName.trim()}
                      className="flex items-center gap-1 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 px-3 py-1.5 text-xs font-black text-white transition-all cursor-pointer shrink-0"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>创建并检出</span>
                    </button>
                  </div>
                </div>

                {/* 分支与标签操作卡片 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => runInRepo("git branch -a -vv")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-purple-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-purple-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">列出所有本地与远端分支</div>
                        <div className="font-mono text-[10px] text-slate-400">git branch -a -vv (追踪状态)</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>

                  <button
                    onClick={() => runInRepo("git tag -l -n9")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-amber-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-amber-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">查看所有发布版本 Tag</div>
                        <div className="font-mono text-[10px] text-slate-400">git tag -l -n9</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>

                  <button
                    onClick={() => runInRepo("git remote -v")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-sky-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <UploadCloud className="h-4 w-4 text-sky-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">查看配置的 Remote 远程源</div>
                        <div className="font-mono text-[10px] text-slate-400">git remote -v</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>

                  <button
                    onClick={() => runInRepo("git status -sb")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-emerald-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">精简分支超前/落后状态</div>
                        <div className="font-mono text-[10px] text-slate-400">git status -sb (ahead/behind)</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                </div>
              </div>
            )}

            {/* ------------ TAB 3: 📦 Stash 临时工作区储藏箱 ------------ */}
            {activeTab === "stash" && (
              <div className="space-y-3">
                {/* 暂存现场框 */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
                  <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                    <Archive className="h-3.5 w-3.5 text-amber-400" />
                    <span>暂存当前未提交的临时现场 (Stash Save)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={stashMessage}
                      onChange={(e) => setStashMessage(e.target.value)}
                      placeholder="暂存备注 (如 WIP: 正在开发登录模块)..."
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-sans text-xs text-amber-300 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const msg = stashMessage.trim()
                          ? `git stash push -u -m "${stashMessage.trim().replace(/"/g, '\\"')}"`
                          : "git stash push -u";
                        runInRepo(msg);
                        setStashMessage("");
                      }}
                      className="flex items-center gap-1 rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-black text-white transition-all cursor-pointer shrink-0"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>保存现场 (Stash)</span>
                    </button>
                  </div>
                </div>

                {/* Stash 控制卡片 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => runInRepo("git stash pop")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-amber-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-amber-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">恢复最近现场并弹出 (Pop)</div>
                        <div className="font-mono text-[10px] text-slate-400">git stash pop</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git stash list")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-purple-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-purple-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">列出所有暂存记录 (List)</div>
                        <div className="font-mono text-[10px] text-slate-400">git stash list</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git stash apply")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-emerald-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-slate-200">应用现场 (保留在 Stash)</div>
                        <div className="font-mono text-[10px] text-slate-400">git stash apply</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git stash clear")}
                    className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 hover:bg-rose-950/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-rose-400" />
                      <div className="text-left">
                        <div className="font-extrabold text-rose-300">清空所有 Stash 储藏</div>
                        <div className="font-mono text-[10px] text-rose-400">git stash clear</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ------------ TAB 4: ⚡ DevOps 运维急救与实用指令库 ------------ */}
            {activeTab === "toolkit" && (
              <div className="space-y-3">
                <div className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-sky-400" />
                  <span>30+ 项高频 Git 运维急救与排错工具箱</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* 撤销与急救 */}
                  <button
                    onClick={() => runInRepo("git reset --soft HEAD~1")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-left hover:border-sky-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-sky-300">撤销上一次提交 (保留代码修改)</div>
                      <div className="font-mono text-[10px] text-slate-400">git reset --soft HEAD~1</div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git reflog -n 20")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-left hover:border-purple-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-purple-300">查看操作急救日志 (找回丢失提交)</div>
                      <div className="font-mono text-[10px] text-slate-400">git reflog -n 20</div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git clean -fd")}
                    className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-left hover:bg-amber-950/30 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-amber-300">强力清理未跟踪的新文件与文件夹</div>
                      <div className="font-mono text-[10px] text-slate-400">git clean -fd</div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git reset --hard HEAD")}
                    className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-left hover:bg-rose-950/30 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-rose-300">彻底放弃本地所有修改 (硬重置)</div>
                      <div className="font-mono text-[10px] text-rose-400">git reset --hard HEAD</div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git fetch --all && git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-left hover:border-emerald-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-emerald-300">强制用远端覆盖本地当前分支</div>
                      <div className="font-mono text-[10px] text-slate-400">git reset --hard origin/&lt;branch&gt;</div>
                    </div>
                  </button>

                  <button
                    onClick={() => runInRepo("git config --list --show-origin")}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-left hover:border-indigo-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-indigo-300">检查全部 Git 全局与仓库配置</div>
                      <div className="font-mono text-[10px] text-slate-400">git config --list --show-origin</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
