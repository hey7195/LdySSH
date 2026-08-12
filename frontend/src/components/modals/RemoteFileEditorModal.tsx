import React, { useState, useEffect } from "react";
import { X, Save, FileCode, Check, AlertCircle, RefreshCw } from "lucide-react";

interface RemoteFileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  fileName: string;
  initialContent: string;
  isLoading?: boolean;
  onSave: (filePath: string, content: string) => Promise<boolean>;
}

export const RemoteFileEditorModal: React.FC<RemoteFileEditorModalProps> = ({
  isOpen,
  onClose,
  filePath,
  fileName,
  initialContent,
  isLoading = false,
  onSave
}) => {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setContent(initialContent);
    setSaveSuccess(false);
    setErrorMsg("");
  }, [initialContent, filePath]);

  if (!isOpen) return null;

  const isDirty = content !== initialContent;

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    setErrorMsg("");
    try {
      const ok = await onSave(filePath, content);
      if (ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setErrorMsg("保存失败，请检查文件写入权限或 SFTP 连接");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "网络或写文件异常");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  const fileExt = fileName.includes(".") ? fileName.split(".").pop()?.toUpperCase() || "TXT" : "FILE";
  const lineCount = content.split("\n").length;
  const charCount = content.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-3.5 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <FileCode className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-100 truncate">{fileName}</h3>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-400">
                  {fileExt}
                </span>
                {isDirty && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /> 未保存
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 font-mono truncate">{filePath}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <Check className="h-3.5 w-3.5" /> 已成功保存至远程
              </span>
            )}
            {errorMsg && (
              <span className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-400 border border-rose-500/30">
                <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
              </span>
            )}

            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving || isLoading}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                isDirty && !isSaving && !isLoading
                  ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25"
                  : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> 保存中...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> 保存 (Ctrl+S)
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="relative flex-1 bg-zinc-950 font-mono text-xs overflow-hidden flex">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-zinc-400">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
              <span>正在从远程 SFTP 读取文件内容...</span>
            </div>
          ) : (
            <div className="flex h-full w-full">
              {/* Line numbers column */}
              <div className="w-12 select-none border-r border-zinc-800 bg-zinc-900/30 py-3 text-right pr-3 text-zinc-600 font-mono text-xs leading-5">
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea code editor */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                className="h-full w-full resize-none bg-transparent p-3 text-zinc-200 focus:outline-none font-mono text-xs leading-5 whitespace-pre tab-4"
              />
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-6 py-2 text-[11px] text-zinc-500 font-mono select-none">
          <div className="flex items-center gap-4">
            <span>行数: {lineCount}</span>
            <span>字符数: {charCount}</span>
            <span>编码: UTF-8</span>
          </div>
          <div>快捷键: Ctrl + S 保存</div>
        </div>
      </div>
    </div>
  );
};
