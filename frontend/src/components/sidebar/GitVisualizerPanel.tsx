import React, { useState } from "react";
import { GitBranch, GitCommit, GitPullRequest, RefreshCw, Play, FileCode, Check, Eye } from "lucide-react";

interface GitVisualizerPanelProps {
  onRunCommand: (command: string) => void;
}

export const GitVisualizerPanel: React.FC<GitVisualizerPanelProps> = ({ onRunCommand }) => {
  const [repoPath, setRepoPath] = useState("./");

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
              Git Graph & Diff
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">查看 Commit 提交树、分支状态、Diff 差异与一键拉取</p>
        </div>
      </div>

      {/* Target Repo Path */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2 shadow-md">
        <label className="text-xs font-extrabold text-zinc-200">远程项目仓库路径:</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="例如 /var/www/my-project 或 ./"
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-emerald-300 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={() => onRunCommand(`cd ${repoPath} && git status`)}
            className="flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>git status</span>
          </button>
        </div>
      </div>

      {/* Quick Git Actions */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold text-zinc-300 flex items-center gap-1.5">
          <GitCommit className="h-3.5 w-3.5 text-emerald-400" /> Git 常用指令快捷引擎
        </span>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onRunCommand(`cd ${repoPath} && git log --graph --oneline --decorate --all -n 20`)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
            <span>查看 Git Commit 树</span>
          </button>

          <button
            onClick={() => onRunCommand(`cd ${repoPath} && git diff`)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <FileCode className="h-3.5 w-3.5 text-emerald-400" />
            <span>查看未提交 Diff</span>
          </button>

          <button
            onClick={() => onRunCommand(`cd ${repoPath} && git pull`)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs font-bold text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 transition-all cursor-pointer"
          >
            <GitPullRequest className="h-3.5 w-3.5 text-emerald-400" />
            <span>一键 Git Pull</span>
          </button>

          <button
            onClick={() => onRunCommand(`cd ${repoPath} && git branch -a`)}
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
