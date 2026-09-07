import React, { useState, useMemo } from "react";
import { X, GitCompare, FileText, ArrowRightLeft } from "lucide-react";

interface SftpFileDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  leftFileName: string;
  leftContent: string;
  rightFileName: string;
  rightContent: string;
}

interface DiffLine {
  type: "same" | "add" | "delete";
  leftLineNumber?: number;
  rightLineNumber?: number;
  leftText?: string;
  rightText?: string;
}

export const SftpFileDiffModal: React.FC<SftpFileDiffModalProps> = ({
  isOpen,
  onClose,
  leftFileName,
  leftContent,
  rightFileName,
  rightContent
}) => {
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);

  const diffLines = useMemo(() => {
    const leftLines = leftContent.split("\n");
    const rightLines = rightContent.split("\n");
    const maxLen = Math.max(leftLines.length, rightLines.length);
    const result: DiffLine[] = [];

    let leftIdx = 0;
    let rightIdx = 0;

    for (let i = 0; i < maxLen; i++) {
      const lText = leftLines[leftIdx];
      const rText = rightLines[rightIdx];

      if (lText === rText) {
        result.push({
          type: "same",
          leftLineNumber: leftIdx + 1,
          rightLineNumber: rightIdx + 1,
          leftText: lText,
          rightText: rText
        });
        leftIdx++;
        rightIdx++;
      } else if (lText !== undefined && rText !== undefined) {
        result.push({
          type: "delete",
          leftLineNumber: leftIdx + 1,
          leftText: lText
        });
        result.push({
          type: "add",
          rightLineNumber: rightIdx + 1,
          rightText: rText
        });
        leftIdx++;
        rightIdx++;
      } else if (lText !== undefined) {
        result.push({
          type: "delete",
          leftLineNumber: leftIdx + 1,
          leftText: lText
        });
        leftIdx++;
      } else if (rText !== undefined) {
        result.push({
          type: "add",
          rightLineNumber: rightIdx + 1,
          rightText: rText
        });
        rightIdx++;
      }
    }

    return result;
  }, [leftContent, rightContent]);

  if (!isOpen) return null;

  const addedCount = diffLines.filter((l) => l.type === "add").length;
  const deletedCount = diffLines.filter((l) => l.type === "delete").length;

  const filteredLines = showOnlyDifferences ? diffLines.filter((l) => l.type !== "same") : diffLines;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5 select-none">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <GitCompare className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-100">SFTP 双栏文本对比分析</h3>
                <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  +{addedCount} 新增
                </span>
                <span className="flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30">
                  -{deletedCount} 删除
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">逐行对比分析修改差异与配置变更</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowOnlyDifferences(!showOnlyDifferences)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                showOnlyDifferences
                  ? "border-purple-500 bg-purple-600/20 text-purple-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {showOnlyDifferences ? "显示全部行" : "仅看差异行"}
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* File Titles Header */}
        <div className="grid grid-cols-2 border-b border-zinc-800 bg-zinc-900/40 text-xs font-mono select-none">
          <div className="flex items-center gap-2 border-r border-zinc-800 px-4 py-2 text-zinc-300">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span className="font-bold truncate">{leftFileName || "基准文件 (Left)"}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 text-zinc-300">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span className="font-bold truncate">{rightFileName || "对比目标文件 (Right)"}</span>
          </div>
        </div>

        {/* Diff View Area */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 font-mono text-xs leading-5">
          {filteredLines.map((line, idx) => {
            if (line.type === "same") {
              return (
                <div key={idx} className="grid grid-cols-2 border-b border-zinc-900/50 hover:bg-zinc-900/30">
                  <div className="flex border-r border-zinc-900 px-3 py-0.5 text-zinc-400">
                    <span className="w-10 select-none text-right pr-3 text-zinc-600 shrink-0">
                      {line.leftLineNumber}
                    </span>
                    <span className="whitespace-pre overflow-x-auto">{line.leftText}</span>
                  </div>
                  <div className="flex px-3 py-0.5 text-zinc-400">
                    <span className="w-10 select-none text-right pr-3 text-zinc-600 shrink-0">
                      {line.rightLineNumber}
                    </span>
                    <span className="whitespace-pre overflow-x-auto">{line.rightText}</span>
                  </div>
                </div>
              );
            }

            if (line.type === "delete") {
              return (
                <div key={idx} className="grid grid-cols-2 bg-rose-950/20 border-b border-rose-900/20">
                  <div className="flex border-r border-zinc-900 px-3 py-0.5 text-rose-300 bg-rose-950/40">
                    <span className="w-10 select-none text-right pr-3 text-rose-500 font-bold shrink-0">
                      -{line.leftLineNumber}
                    </span>
                    <span className="whitespace-pre overflow-x-auto">{line.leftText}</span>
                  </div>
                  <div className="px-3 py-0.5 text-zinc-700 select-none">---</div>
                </div>
              );
            }

            return (
              <div key={idx} className="grid grid-cols-2 bg-emerald-950/20 border-b border-emerald-900/20">
                <div className="border-r border-zinc-900 px-3 py-0.5 text-zinc-700 select-none">---</div>
                <div className="flex px-3 py-0.5 text-emerald-300 bg-emerald-950/40">
                  <span className="w-10 select-none text-right pr-3 text-emerald-500 font-bold shrink-0">
                    +{line.rightLineNumber}
                  </span>
                  <span className="whitespace-pre overflow-x-auto">{line.rightText}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-6 py-2 text-[11px] text-zinc-500 font-mono select-none">
          <span>总差异项目: {addedCount + deletedCount}</span>
          <span>对比算法: 行比对 (Line Diff)</span>
        </div>
      </div>
    </div>
  );
};
