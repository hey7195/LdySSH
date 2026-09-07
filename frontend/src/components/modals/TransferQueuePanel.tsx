import React, { useState } from "react";
import { UploadCloud, DownloadCloud, X, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

export interface TransferTaskItem {
  id: string;
  name: string;
  type: "upload" | "download";
  totalBytes: number;
  transferredBytes: number;
  speed: string; // e.g. "1.2 MB/s"
  progress: number; // 0 - 100
  status: "transferring" | "completed" | "failed";
  error?: string;
}

interface TransferQueuePanelProps {
  tasks: TransferTaskItem[];
  onCancelTask: (id: string) => void;
  onClearCompleted: () => void;
}

export const TransferQueuePanel: React.FC<TransferQueuePanelProps> = ({
  tasks,
  onCancelTask,
  onClearCompleted
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const activeCount = tasks.filter((t) => t.status === "transferring").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-96 rounded-2xl border border-zinc-800 bg-zinc-950/90 text-zinc-100 shadow-2xl backdrop-blur-md overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2.5 select-none">
        <div className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-bold text-zinc-200">文件传输队列</span>
          <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
            {activeCount > 0 ? `${activeCount} 个传输中` : "传输完成"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {completedCount > 0 && (
            <button
              onClick={onClearCompleted}
              title="清空已完成记录"
              className="rounded p-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Task List Body */}
      {!isCollapsed && (
        <div className="max-h-64 overflow-y-auto p-3 space-y-2.5">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2.5 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {task.type === "upload" ? (
                    <UploadCloud className="h-4 w-4 text-blue-400 shrink-0" />
                  ) : (
                    <DownloadCloud className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                  <span className="font-semibold text-zinc-200 truncate">{task.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-zinc-400">
                  <span>{task.speed}</span>
                  {task.status === "transferring" && (
                    <button
                      onClick={() => onCancelTask(task.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      task.status === "completed"
                        ? "bg-emerald-500"
                        : task.status === "failed"
                        ? "bg-red-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>
                    {task.status === "completed" ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> 传输完成
                      </span>
                    ) : task.status === "failed" ? (
                      <span className="text-red-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> {task.error || "传输失败"}
                      </span>
                    ) : (
                      `${task.progress}%`
                    )}
                  </span>
                  <span>
                    {(task.transferredBytes / (1024 * 1024)).toFixed(1)} MB / {(task.totalBytes / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
