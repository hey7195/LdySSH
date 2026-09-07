import React, { useState } from "react";
import { Disc, X, Download, FileText, CheckCircle2, Play, Square } from "lucide-react";

interface SessionLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle?: string;
  isRecording: boolean;
  onToggleRecording: () => void;
  onExportLog: (format: "txt" | "html") => void;
}

export const SessionLoggerModal: React.FC<SessionLoggerModalProps> = ({
  isOpen,
  onClose,
  sessionTitle = "远程服务器",
  isRecording,
  onToggleRecording,
  onExportLog
}) => {
  const [exportedMsg, setExportedMsg] = useState("");

  if (!isOpen) return null;

  const handleExport = (fmt: "txt" | "html") => {
    onExportLog(fmt);
    setExportedMsg(`已成功导出 ${fmt.toUpperCase()} 日志文件！`);
    setTimeout(() => setExportedMsg(""), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-auto w-full max-w-md flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600/20 text-red-400 border border-red-500/30">
              <Disc className={`h-4 w-4 ${isRecording ? "animate-spin text-rose-500" : ""}`} />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">终端会话录制与日志审计导出</h3>
              <p className="text-[11px] text-zinc-500 font-mono">{sessionTitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs font-mono">
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="space-y-0.5">
              <span className="font-bold text-zinc-200 block">实时操作日志录制</span>
              <span className="text-[11px] text-zinc-400">
                {isRecording ? "🔴 正在录制 ANSI 回显与按键记录" : "未开启录制 (开启后实时写入日志)"}
              </span>
            </div>

            <button
              onClick={onToggleRecording}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold transition-all cursor-pointer ${
                isRecording
                  ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 animate-pulse"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
            >
              {isRecording ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-rose-400" />}
              {isRecording ? "停止录制" : "开启录制"}
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="block font-bold text-zinc-400">导出当前终端全量输出日志</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleExport("txt")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 font-bold text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
              >
                <FileText className="h-4 w-4 text-blue-400" />
                导出 .LOG 纯文本
              </button>

              <button
                onClick={() => handleExport("html")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 font-bold text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
              >
                <Download className="h-4 w-4 text-purple-400" />
                导出 .HTML 彩色日志
              </button>
            </div>
          </div>

          {exportedMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-emerald-400 font-bold border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{exportedMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
