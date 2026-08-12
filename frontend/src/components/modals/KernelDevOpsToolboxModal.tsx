import React, { useState } from "react";
import { Cpu, Terminal, Shield, Network, HardDrive, Search, Play, Copy, Check, X, Wrench, Layers } from "lucide-react";

interface KernelDevOpsToolboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (command: string) => void;
}

interface ToolCommandItem {
  id: string;
  category: "kernel" | "perf" | "network" | "system" | "storage";
  categoryName: string;
  name: string;
  command: string;
  description: string;
  riskLevel: "safe" | "medium" | "high";
}

const KERNEL_DEVOPS_COMMANDS: ToolCommandItem[] = [
  // 1. 内核与驱动调试 (Kernel & Driver)
  {
    id: "k1",
    category: "kernel",
    categoryName: "内核与驱动调试",
    name: "内核日志实时监控 (dmesg)",
    command: "sudo dmesg -wH --color=always | tail -n 50",
    description: "实时跟踪 Linux 内核 Ring Buffer 日志、打印驱动 printk 警告与 Hardware 故障",
    riskLevel: "safe"
  },
  {
    id: "k2",
    category: "kernel",
    categoryName: "内核与驱动调试",
    name: "加载内核模块 (insmod / modprobe)",
    command: "sudo modprobe [p#1 模块名称]",
    description: "加载指定 Linux 内核驱动模块 (.ko)，支持自动依赖解析",
    riskLevel: "medium"
  },
  {
    id: "k3",
    category: "kernel",
    categoryName: "内核与驱动调试",
    name: "卸载内核模块 (rmmod)",
    command: "sudo rmmod [p#1 模块名称]",
    description: "从内核空间安全卸载指定驱动模块",
    riskLevel: "medium"
  },
  {
    id: "k4",
    category: "kernel",
    categoryName: "内核与驱动调试",
    name: "内核启动参数与版本查看",
    command: "cat /proc/cmdline && echo '---' && uname -a && cat /proc/version",
    description: "查看 Kernel boot options、编译器版本、架构及启动参数",
    riskLevel: "safe"
  },
  {
    id: "k5",
    category: "kernel",
    categoryName: "内核与驱动调试",
    name: "内核 Slab 内存分配器统计 (slabtop)",
    command: "sudo slabtop -s c | head -n 30",
    description: "监控内核空间内存结构分配情况 (Cache Slab/Objects)，排查内核内存泄漏",
    riskLevel: "safe"
  },

  // 2. 性能剖析与 Trace (Perf & Ftrace)
  {
    id: "p1",
    category: "perf",
    categoryName: "性能剖析与 Trace",
    name: "Perf CPU 实时热点采样 (perf top)",
    command: "sudo perf top -g -p [p#1 进程PID]",
    description: "Linux Perf 工具实时采样分析内核态与用户态 CPU 函数调用热点",
    riskLevel: "safe"
  },
  {
    id: "p2",
    category: "perf",
    categoryName: "性能剖析与 Trace",
    name: "系统调用跟踪统计 (strace -c)",
    command: "sudo strace -c -p [p#1 进程PID]",
    description: "对运行中的进程追踪 Syscall 次数、耗时比例与系统调用错误率",
    riskLevel: "safe"
  },
  {
    id: "p3",
    category: "perf",
    categoryName: "性能剖析与 Trace",
    name: "Ftrace 函数跟踪配置",
    command: "sudo sh -c 'echo function > /sys/kernel/debug/tracing/current_tracer && head -n 30 /sys/kernel/debug/tracing/trace'",
    description: "使用 Linux 原生 Ftrace 追踪内核子系统函数执行轨迹",
    riskLevel: "medium"
  },

  // 3. 网络与端口诊断 (Network & Socket)
  {
    id: "n1",
    category: "network",
    categoryName: "网络与端口诊断",
    name: "查看端口占用与监听服务 (ss/lsof)",
    command: "sudo ss -tulnp | grep [p#1 端口号]",
    description: "查询指定 TCP/UDP 端口对应的服务进程名称与 PID",
    riskLevel: "safe"
  },
  {
    id: "n2",
    category: "network",
    categoryName: "网络与端口诊断",
    name: "TCP 路由跟踪与包延迟 (mtr)",
    command: "mtr --report --report-cycles 10 [p#1 目标IP或域名]",
    description: "结合 Ping 和 Traceroute，诊断多跳网络丢包率与 RTT 抖动",
    riskLevel: "safe"
  },
  {
    id: "n3",
    category: "network",
    categoryName: "网络与端口诊断",
    name: "Tcpdump 抓包抓报文头",
    command: "sudo tcpdump -i any port [p#1 端口号] -n -X -c 20",
    description: "监听特定端口的 TCP/UDP 报文数据包并打印 16 进制流",
    riskLevel: "safe"
  },

  // 4. 服务与进程追踪 (System & Syscall)
  {
    id: "s1",
    category: "system",
    categoryName: "服务与进程追踪",
    name: "Systemd 服务状态与日志跟踪",
    command: "sudo systemctl status [p#1 服务名] && sudo journalctl -u [p#1 服务名] -f -n 50",
    description: "查看指定后台服务运行状态及实时追加日志",
    riskLevel: "safe"
  },
  {
    id: "s2",
    category: "system",
    categoryName: "服务与进程追踪",
    name: "GDB 附着运行进程调试",
    command: "sudo gdb -p [p#1 进程PID]",
    description: "使用 GDB 交互附着到正在运行的 C/C++ / 嵌入式程序查看 Backtrace 堆栈",
    riskLevel: "medium"
  },

  // 5. 磁盘与文件系统 (Storage & Block)
  {
    id: "d1",
    category: "storage",
    categoryName: "磁盘与文件系统",
    name: "块设备挂载与 Filesystem 树 (lsblk)",
    command: "lsblk -f && df -hT",
    description: "列出磁盘分区、UUID、挂载点及 ext4/xfs 文件系统剩余空间",
    riskLevel: "safe"
  },
  {
    id: "d2",
    category: "storage",
    categoryName: "磁盘与文件系统",
    name: "磁盘 I/O 读写性能监控 (iostat)",
    command: "iostat -xz 1 10",
    description: "实时监控磁盘读写吞吐量 (MB/s)、IOPS 和 await 响应等待延迟",
    riskLevel: "safe"
  }
];

export const KernelDevOpsToolboxModal: React.FC<KernelDevOpsToolboxModalProps> = ({
  isOpen,
  onClose,
  onRunCommand
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState("");

  if (!isOpen) return null;

  const filteredCommands = KERNEL_DEVOPS_COMMANDS.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const keyword = query.trim().toLowerCase();
    const matchesQuery =
      !keyword ||
      item.name.toLowerCase().includes(keyword) ||
      item.command.toLowerCase().includes(keyword) ||
      item.description.toLowerCase().includes(keyword);
    return matchesCategory && matchesQuery;
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl max-h-[85vh] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-md">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
                <span>运维与内核开发常用工具箱</span>
                <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 font-mono text-[10px] text-purple-400 font-bold">
                  SysAdmin & Kernel ToolKit
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                集成内核 dmesg 监控、insmod/rmmod 驱动调试、perf/strace 性能追踪及网络诊断工具
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/30 px-6 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "all", label: "全部工具", icon: Layers },
              { id: "kernel", label: "🐧 内核驱动", icon: Cpu },
              { id: "perf", label: "⚡ 性能 Trace", icon: Wrench },
              { id: "network", label: "🌐 网络套接字", icon: Network },
              { id: "system", label: "📦 进程服务", icon: Terminal },
              { id: "storage", label: "💾 磁盘存储", icon: HardDrive }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
                  activeCategory === cat.id
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索内核指令、strace、perf..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Command Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-xs font-medium text-zinc-500">
              未找到匹配的内核/运维命令
            </div>
          ) : (
            filteredCommands.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4 transition-all hover:border-purple-500/50 hover:bg-zinc-900/90"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-zinc-100">{item.name}</span>
                      <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.2 text-[10px] font-bold text-zinc-400">
                        {item.categoryName}
                      </span>
                      {item.riskLevel === "medium" && (
                        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.2 text-[10px] font-bold text-amber-400">
                          ⚠️ 需要 Sudo / 涉及内核改动
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleCopy(item.id, item.command)}
                      title="复制命令"
                      className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === item.id ? "已复制" : "复制"}</span>
                    </button>

                    <button
                      onClick={() => {
                        onRunCommand(item.command);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>发至终端</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-2.5 font-mono text-[11px] text-emerald-400 leading-relaxed overflow-x-auto shadow-inner">
                  {item.command}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-6 py-3 text-[11px] text-zinc-500 font-mono">
          <span>提示: 带 <code className="text-purple-400">[p#1 变量]</code> 的指令点击后将自动唤起变量填报弹窗</span>
          <span>LdySSH KernelDevOps ToolKit v1.0</span>
        </div>
      </div>
    </div>
  );
};
