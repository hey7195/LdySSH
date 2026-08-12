import React, { useState, useEffect, useMemo } from "react";
import { Cpu, X, RefreshCw, AlertTriangle, ShieldAlert, ArrowUpDown, Filter, Power } from "lucide-react";

export interface ProcessItem {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  stat: string;
  command: string;
  args: string;
}

interface ProcessManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle?: string;
  onFetchProcesses: () => Promise<ProcessItem[]>;
  onKillProcess: (pid: number, signal: 9 | 15) => Promise<boolean>;
}

export const ProcessManagerModal: React.FC<ProcessManagerModalProps> = ({
  isOpen,
  onClose,
  sessionTitle = "远程服务器",
  onFetchProcesses,
  onKillProcess
}) => {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sortField, setSortField] = useState<"cpu" | "mem" | "pid">("cpu");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [autoRefresh, setAutoRefresh] = useState<number>(0); // 0 = off, 3 = 3s, 5 = 5s
  const [confirmKill, setConfirmKill] = useState<{ pid: number; name: string; signal: 9 | 15 } | null>(null);

  const loadProcesses = async () => {
    setLoading(true);
    try {
      const list = await onFetchProcesses();
      setProcesses(list);
    } catch {
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadProcesses();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || autoRefresh === 0) return;
    const timer = setInterval(() => {
      loadProcesses();
    }, autoRefresh * 1000);
    return () => clearInterval(timer);
  }, [isOpen, autoRefresh]);

  const filteredProcesses = useMemo(() => {
    let result = processes.filter((p) => {
      if (!keyword.trim()) return true;
      const k = keyword.toLowerCase();
      return (
        String(p.pid).includes(k) ||
        p.user.toLowerCase().includes(k) ||
        p.command.toLowerCase().includes(k) ||
        p.args.toLowerCase().includes(k)
      );
    });

    result.sort((a, b) => {
      const mult = sortOrder === "desc" ? -1 : 1;
      if (sortField === "cpu") return (a.cpu - b.cpu) * mult;
      if (sortField === "mem") return (a.mem - b.mem) * mult;
      return (a.pid - b.pid) * mult;
    });

    return result;
  }, [processes, keyword, sortField, sortOrder]);

  if (!isOpen) return null;

  const handleKill = async () => {
    if (!confirmKill) return;
    const ok = await onKillProcess(confirmKill.pid, confirmKill.signal);
    setConfirmKill(null);
    if (ok) {
      setTimeout(() => loadProcesses(), 500);
    }
  };

  const toggleSort = (field: "cpu" | "mem" | "pid") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5 select-none">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
              <Cpu className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-100">远程服务器进程与任务管理器</h3>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-400">
                  {sessionTitle}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">实时监控 CPU/内存 占用并精准终止高负载进程</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadProcesses}
              disabled={loading}
              className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-500" : ""}`} />
              刷新
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Control Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-6 py-2.5 font-mono text-xs select-none">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <Filter className="h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 PID / 用户 / 进程名或参数..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 py-1.5 px-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-zinc-500">自动刷新:</span>
            <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
              {[0, 3, 5].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setAutoRefresh(sec)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                    autoRefresh === sec ? "bg-amber-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {sec === 0 ? "关闭" : `${sec}s`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Process Table Header */}
        <div className="grid grid-cols-[80px_100px_90px_90px_80px_1fr_120px] border-b border-zinc-800 bg-zinc-900/60 px-6 py-2 text-xs font-mono text-zinc-400 font-bold select-none">
          <button onClick={() => toggleSort("pid")} className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">
            PID <ArrowUpDown className="h-3 w-3" />
          </button>
          <span>USER</span>
          <button onClick={() => toggleSort("cpu")} className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">
            CPU % <ArrowUpDown className="h-3 w-3 text-amber-400" />
          </button>
          <button onClick={() => toggleSort("mem")} className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">
            MEM % <ArrowUpDown className="h-3 w-3 text-blue-400" />
          </button>
          <span>STAT</span>
          <span>COMMAND & ARGS</span>
          <span className="text-right">操作</span>
        </div>

        {/* Process Table Body */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 font-mono text-xs divide-y divide-zinc-900">
          {loading && processes.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-zinc-500 py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-500" />
              <span>正在获取远程服务器进程列表...</span>
            </div>
          ) : filteredProcesses.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-zinc-500 py-12">
              未找到匹配的进程
            </div>
          ) : (
            filteredProcesses.map((proc) => {
              const isHighCpu = proc.cpu > 50;
              const isHighMem = proc.mem > 30;

              return (
                <div
                  key={proc.pid}
                  className="grid grid-cols-[80px_100px_90px_90px_80px_1fr_120px] items-center px-6 py-2 hover:bg-zinc-900/50 transition-colors"
                >
                  <span className="font-bold text-zinc-300">{proc.pid}</span>
                  <span className="text-zinc-400 truncate">{proc.user}</span>
                  <span className={`font-bold ${isHighCpu ? "text-rose-400 font-extrabold" : "text-amber-400"}`}>
                    {proc.cpu.toFixed(1)}%
                  </span>
                  <span className={`font-bold ${isHighMem ? "text-rose-400 font-extrabold" : "text-blue-400"}`}>
                    {proc.mem.toFixed(1)}%
                  </span>
                  <span className="text-zinc-500">{proc.stat}</span>
                  <div className="min-w-0 pr-4">
                    <span className="font-bold text-zinc-200">{proc.command} </span>
                    <span className="text-zinc-500 text-[11px] truncate">{proc.args}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setConfirmKill({ pid: proc.pid, name: proc.command, signal: 15 })}
                      title="SIGTERM 15 正常停止"
                      className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                    >
                      Stop
                    </button>
                    <button
                      onClick={() => setConfirmKill({ pid: proc.pid, name: proc.command, signal: 9 })}
                      title="SIGKILL 9 强制终止"
                      className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/30 transition-all cursor-pointer"
                    >
                      Kill
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-6 py-2 text-[11px] text-zinc-500 font-mono select-none">
          <span>总进程数: {processes.length} | 显示: {filteredProcesses.length}</span>
          <span>使用 SIGKILL (9) 可强行结束僵尸进程</span>
        </div>
      </div>

      {/* Kill Confirm Dialog */}
      {confirmKill && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-zinc-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-zinc-100">终止远程进程确认</h4>
                <p className="text-xs text-zinc-400">PID: {confirmKill.pid} ({confirmKill.name})</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed bg-rose-950/20 p-3 rounded-xl border border-rose-900/30">
              {confirmKill.signal === 9
                ? `确定发送 SIGKILL (9) 强制终止该进程？未保存的数据可能会丢失。`
                : `发送 SIGTERM (15) 试行平滑停止进程。`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmKill(null)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleKill}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/25 transition-all cursor-pointer"
              >
                <Power className="h-3.5 w-3.5" />
                确认终止进程
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
