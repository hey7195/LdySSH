import React, { useState } from "react";
import { Activity, Cpu, Layers, Play, RefreshCw, Eye, Search, FileCode } from "lucide-react";

interface EbpfObserverPanelProps {
  onRunCommand: (command: string) => void;
}

const EBPF_PROBES = [
  { id: "b1", name: "biolatency - 磁盘 I/O 延迟直方图", command: "sudo biolatency-bpfcc 1 10 || sudo /usr/share/bcc/tools/biolatency 1 5", desc: "实时绘制块设备读写 IO 耗时分布直方图" },
  { id: "b2", name: "execsnoop - 新新建进程 Syscall 监控", command: "sudo execsnoop-bpfcc || sudo /usr/share/bcc/tools/execsnoop", desc: "实时抓取系统中所有 execve() 进程创建事件与命令行参数" },
  { id: "b3", name: "tcpconnect - TCP 建立连接追踪", command: "sudo tcpconnect-bpfcc || sudo /usr/share/bcc/tools/tcpconnect", desc: "追踪所有主动调起 connect() 的 TCP 尝试及源/目的地址" },
  { id: "b4", name: "capable - 权限检查与内核 Capability 越界", command: "sudo capable-bpfcc || sudo /usr/share/bcc/tools/capable", desc: "抓取安全相关的安全能力 (Capability) 审计日志" }
];

export const EbpfObserverPanel: React.FC<EbpfObserverPanelProps> = ({ onRunCommand }) => {
  const [pidInput, setPidInput] = useState("1");

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 p-4 space-y-4 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
            <span>eBPF 性能天眼 & 进程剖析</span>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.2 text-[10px] text-cyan-400 font-mono">
              eBPF & /proc/maps
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">eBPF 探针追踪、IO 延迟直方图及进程虚拟内存区域 (VMA) 映射</p>
        </div>
      </div>

      {/* Process VMA Memory Layout Inspector */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 shadow-md">
        <span className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-cyan-400" /> 进程 VMA 内存映射布局 (/proc/PID/maps)
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pidInput}
            onChange={(e) => setPidInput(e.target.value)}
            placeholder="输入进程 PID (例如 1234)"
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-cyan-300 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={() => onRunCommand(`cat /proc/${pidInput}/maps | head -n 30`)}
            className="flex items-center gap-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>查看 VMA 映射</span>
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onRunCommand(`cat /proc/${pidInput}/status | grep -E "Vm|Threads"`)}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 py-1 text-[11px] font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            内存与线程统计
          </button>
          <button
            onClick={() => onRunCommand(`sudo pmap -x ${pidInput} | head -n 25`)}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 py-1 text-[11px] font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            pmap 详细段粒度
          </button>
        </div>
      </div>

      {/* eBPF Tracing Probes */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold text-zinc-300 flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-cyan-400" /> eBPF 性能追踪探针 (bcc-tools)
        </span>
        <div className="space-y-2">
          {EBPF_PROBES.map((probe) => (
            <div
              key={probe.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 hover:border-cyan-500/40 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-100">{probe.name}</span>
                <button
                  onClick={() => onRunCommand(probe.command)}
                  className="flex items-center gap-1 rounded-lg bg-cyan-600/20 border border-cyan-500/30 px-2.5 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/30 transition-colors cursor-pointer"
                >
                  <Play className="h-3 w-3" />
                  <span>启动探针</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">{probe.desc}</p>
              <div className="rounded-lg bg-zinc-950 p-2 font-mono text-[10px] text-cyan-400/90 overflow-x-auto">
                {probe.command}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
