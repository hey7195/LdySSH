import React, { useState } from "react";
import { GitBranch, GitCommit, GitPullRequest, RefreshCw, Play, FileCode, Check, Eye, Download, AlertCircle } from "lucide-react";

interface GitVisualizerPanelProps {
  onRunCommand: (command: string) => void;
}

export const GitVisualizerPanel: React.FC<GitVisualizerPanelProps> = ({ onRunCommand }) => {
  const [repoInput, setRepoInput] = useState("./");

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

    // Extract directory name
    const repoName = cleanUrl
      .split("/")
      .pop()
      ?.replace(/\.git$/, "") || "repo";

    return { cloneUrl: cleanUrl, branch, repoName };
  };

  const { cloneUrl, branch, repoName } = parseGitUrl(repoInput);

  const handleExecuteStatus = () => {
    if (isGitUrl) {
      // If user typed a Git URL and clicked status, suggest cloning first
      const cloneCmd = branch
        ? `git clone ${cloneUrl} -b ${branch} && cd ${repoName} && git status`
        : `git clone ${cloneUrl} && cd ${repoName} && git status`;
      onRunCommand(cloneCmd);
      setRepoInput(`./${repoName}`);
    } else {
      onRunCommand(`cd ${repoInput} && git status`);
    }
  };

  const handleExecuteAction = (action: "log" | "diff" | "pull" | "branch") => {
    const targetDir = isGitUrl ? `./${repoName}` : repoInput;

    let subCmd = "";
    switch (action) {
      case "log":
        subCmd = "git log --graph --oneline --decorate --all -n 20";
        break;
      case "diff":
        subCmd = "git diff";
        break;
      case "pull":
        subCmd = "git pull";
        break;
      case "branch":
        subCmd = "git branch -a";
        break;
    }

    if (isGitUrl) {
      // Clone first if not present, then execute action
      const fullCmd = `if [ -d "${repoName}" ]; then cd ${repoName} && ${subCmd}; else git clone ${cloneUrl} ${
        branch ? `-b ${branch}` : ""
      } && cd ${repoName} && ${subCmd}; fi`;
      onRunCommand(fullCmd);
      setRepoInput(`./${repoName}`);
    } else {
      onRunCommand(`cd ${targetDir} && ${subCmd}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 p-4 space-y-4 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <GitBranch className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
            <span>远程 Git 代码仓库可视化</span>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.2 text-[10px] text-emerald-400 font-mono">
              Git Graph & Clone
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">支持 Linux 本地目录及 GitHub/Gitee URL 智能识别与一键 Clone</p>
        </div>
      </div>

      {/* Target Repo Input (Supports both Local Path and GitHub URL) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold text-zinc-200">
            {isGitUrl ? "🌐 识别到 Git 网络仓库地址:" : "📁 远程 Linux 仓库路径 / Web URL:"}
          </label>
          {isGitUrl && (
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.1 text-[10px] font-bold text-emerald-400 animate-pulse">
              智能模式: Git URL 识别成功
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="输入目录 (如 ./ 或 /var/www) 或 GitHub 地址 (https://github.com/...)"
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-emerald-300 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={handleExecuteStatus}
            className="flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{isGitUrl ? "克隆并查看" : "git status"}</span>
          </button>
        </div>

        {/* Smart Hint & Direct Clone Button for Git URLs */}
        {isGitUrl && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 text-xs text-emerald-300">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>检测到 GitHub / Git 远程仓库链接:</span>
            </div>
            <div className="font-mono text-[11px] text-zinc-300 pl-6 space-y-0.5">
              <div>• 克隆地址: <code className="text-emerald-400">{cloneUrl}</code></div>
              {branch && <div>• 指定分支: <code className="text-amber-400">{branch}</code></div>}
              <div>• 目标目录: <code className="text-cyan-400">./{repoName}</code></div>
            </div>

            <button
              onClick={() => {
                const cmd = branch
                  ? `git clone ${cloneUrl} -b ${branch} && cd ${repoName} && git status`
                  : `git clone ${cloneUrl} && cd ${repoName} && git status`;
                onRunCommand(cmd);
                setRepoInput(`./${repoName}`);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-1.5 text-xs font-extrabold text-white shadow-md transition-all cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>一键克隆 Git 仓库到当前服务器 (git clone)</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Git Actions */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold text-zinc-300 flex items-center gap-1.5">
          <GitCommit className="h-3.5 w-3.5 text-emerald-400" /> Git 常用指令快捷引擎
        </span>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleExecuteAction("log")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
            <span>查看 Git Commit 树</span>
          </button>

          <button
            onClick={() => handleExecuteAction("diff")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <FileCode className="h-3.5 w-3.5 text-emerald-400" />
            <span>查看未提交 Diff</span>
          </button>

          <button
            onClick={() => handleExecuteAction("pull")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <GitPullRequest className="h-3.5 w-3.5 text-emerald-400" />
            <span>一键 Git Pull</span>
          </button>

          <button
            onClick={() => handleExecuteAction("branch")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5 text-emerald-400" />
            <span>列出所有分支</span>
          </button>
        </div>
      </div>
    </div>
  );
};
