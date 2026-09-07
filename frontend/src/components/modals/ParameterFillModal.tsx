import React, { useState, useEffect } from "react";
import { Terminal, X, Play, SlidersHorizontal, Sparkles } from "lucide-react";

interface ParameterFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  commandName: string;
  commandTemplate: string;
  onExecute: (finalCommand: string) => void;
}

export const ParameterFillModal: React.FC<ParameterFillModalProps> = ({
  isOpen,
  onClose,
  commandName,
  commandTemplate,
  onExecute
}) => {
  const [params, setParams] = useState<Record<string, string>>({});
  const [paramKeys, setParamKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!commandTemplate) return;
    // Find all ${VAR} or {VAR} or <VAR> placeholders
    const matches = commandTemplate.match(/(\$\{[\w_]+\}|\{[\w_]+\}|<[\w_]+>)/g) || [];
    const uniqueKeys = Array.from(new Set(matches.map((m) => m.replace(/[\$\{\}<>]/g, ""))));
    setParamKeys(uniqueKeys);

    const initialMap: Record<string, string> = {};
    uniqueKeys.forEach((key) => {
      initialMap[key] = "";
    });
    setParams(initialMap);
  }, [commandTemplate]);

  if (!isOpen) return null;

  const getFinalCommand = () => {
    let res = commandTemplate;
    Object.entries(params).forEach(([k, v]) => {
      const val = v.trim() || `<${k}>`;
      res = res.replace(new RegExp(`\\$\\{${k}\\}|\\{${k}\\}|<${k}>`, "g"), val);
    });
    return res;
  };

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    onExecute(getFinalCommand());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-auto w-full max-w-md flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">命令模板参数填报</h3>
              <p className="text-[11px] text-zinc-500 font-mono">{commandName || "快捷指令参数赋值"}</p>
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
        <form onSubmit={handleRun} className="p-6 space-y-4 text-xs font-mono">
          <div className="space-y-3">
            {paramKeys.length === 0 ? (
              <p className="text-zinc-400">当前命令无需额外参数赋值</p>
            ) : (
              paramKeys.map((key) => (
                <div key={key}>
                  <label className="block text-zinc-400 mb-1 font-semibold flex items-center justify-between">
                    <span>参数变量: <span className="text-emerald-400">${`{${key}}`}</span></span>
                  </label>
                  <input
                    type="text"
                    value={params[key] || ""}
                    onChange={(e) => setParams({ ...params, [key]: e.target.value })}
                    placeholder={`请输入 ${key} 的具体取值...`}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <label className="block text-zinc-500 mb-1 text-[11px]">预览即将发送给终端的最终指令:</label>
            <div className="rounded-xl bg-zinc-900 p-3 text-emerald-400 font-mono text-[11px] break-all border border-zinc-800">
              {getFinalCommand()}
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 font-bold text-white shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
          >
            <Play className="h-4 w-4 fill-white" />
            发送至当前激活终端
          </button>
        </form>
      </div>
    </div>
  );
};
