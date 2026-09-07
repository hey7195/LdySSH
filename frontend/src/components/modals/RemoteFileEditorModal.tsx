import React, { useState, useEffect } from "react";
import { X, Save, FileCode, Check, AlertCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface RemoteFileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  fileName: string;
  initialContent: string;
  isLoading?: boolean;
  isBinary?: boolean;
  onSave: (filePath: string, content: string) => Promise<boolean>;
}

const BINARY_EXTENSIONS = new Set([
  "gz", "tgz", "tar", "zip", "rar", "7z", "bz2", "xz", "iso",
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "ico",
  "pdf", "exe", "dll", "so", "dylib", "bin", "dat", "apk", "jar"
]);

export function isBinaryFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return true;
  const ext = name.includes(".") ? lower.split(".").pop() || "" : "";
  return BINARY_EXTENSIONS.has(ext);
}

export const RemoteFileEditorModal: React.FC<RemoteFileEditorModalProps> = ({
  isOpen,
  onClose,
  filePath,
  fileName,
  initialContent,
  isLoading = false,
  isBinary = false,
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

  const detectedBinary = isBinary || isBinaryFileName(fileName);
  const isDirty = content !== initialContent;

  const handleSave = async () => {
    if (!isDirty || isSaving || detectedBinary) return;
    setIsSaving(true);
    setErrorMsg("");
    try {
      const ok = await onSave(filePath, content);
      if (ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setErrorMsg("保存失败，请检查写入权限或 SFTP 连接");
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
  const lines = content.split("\n");
  const lineCount = lines.length;
  const charCount = content.length;
  const maxLineNumbers = Math.min(lineCount, 1500);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5 select-none">
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
                {detectedBinary && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-400 border border-amber-500/30">
                    二进制文件
                  </span>
                )}
                {isDirty && !detectedBinary && (
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
                <Check className="h-3.5 w-3.5" /> 已保存至远程
              </span>
            )}
            {errorMsg && (
              <span className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-400 border border-rose-500/30">
                <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
              </span>
            )}

            {!detectedBinary && (
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
            )}

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
              <span>正在从远程 SFTP 读取文本内容...</span>
            </div>
          ) : detectedBinary ? (
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center space-y-3 bg-zinc-900/30">
              <AlertTriangle className="h-12 w-12 text-amber-500 animate-bounce" />
              <h4 className="text-base font-bold text-zinc-200">二进制 / 归档压缩包文件无法在线编辑</h4>
              <p className="text-xs text-zinc-400 max-w-md leading-relaxed">
                选中的文件 <span className="font-mono text-amber-400 font-bold">{fileName}</span> 为压缩归档或二进制格式，包含不可读控制字符。
              </p>
              <p className="text-[11px] text-zinc-500">建议在右侧 SFTP 菜单中使用“下载到本地”或直接在终端使用 <code className="text-blue-400">tar / unzip</code> 命令解压。</p>
            </div>
          ) : (
            <div className="flex h-full w-full">
              {/* Line numbers column */}
              <div className="w-14 select-none border-r border-zinc-800 bg-zinc-900/30 py-3 text-right pr-3 text-zinc-600 font-mono text-xs leading-5 overflow-hidden">
                {Array.from({ length: maxLineNumbers }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
                {lineCount > maxLineNumbers && (
                  <div className="text-[10px] text-zinc-500 py-1">...</div>
                )}
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
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-6 py-2 text-[11px] text-zinc-500 font-mono select-none">
          <div className="flex items-center gap-4">
            <span>总行数: {lineCount}</span>
            <span>字符数: {charCount}</span>
            <span>编码: UTF-8</span>
          </div>
          <div>{detectedBinary ? "二进制模式 (只读)" : "快捷键: Ctrl + S 保存"}</div>
        </div>
      </div>
    </div>
  );
};
