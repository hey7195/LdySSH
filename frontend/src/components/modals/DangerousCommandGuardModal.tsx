import React from "react";
import { AlertTriangle, ShieldAlert, Terminal, ArrowRight, X } from "lucide-react";
import type { DangerousCommandInfo } from "../../lib/commandSuggestions";

interface DangerousCommandGuardModalProps {
  command: string;
  info: DangerousCommandInfo;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DangerousCommandGuardModal: React.FC<DangerousCommandGuardModalProps> = ({
  command,
  info,
  onConfirm,
  onCancel
}) => {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-red-500/30 bg-[var-[--theme-card-bg,#12131a])] p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-red-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-red-400">
                <AlertTriangle className="h-5 w-5" />
                高危破坏性命令警告
              </h3>
              <p className="text-xs text-red-300/80">
                类型：{info.patternName || "系统极高风险指令"}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400">
            <Terminal className="h-4 w-4 text-amber-400" />
            待拦截指令 (Pending Execution)
          </div>
          <div className="overflow-x-auto rounded-lg bg-red-950/20 p-3 text-red-300 font-bold tracking-wide">
            {command}
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs leading-relaxed text-red-200">
          {info.warningText || "该命令可能导致服务器全盘清空、无法再次登录或服务立即中断服务！"}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-all hover:bg-zinc-700"
          >
            取消发送
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/30 transition-all hover:from-red-500 hover:to-rose-500"
          >
            强行发送该命令 <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
