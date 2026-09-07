import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import { ALL_LINUX_COMMAND_NAMES } from "../../lib/terminalIntelliSense";
import { FLAT_RUNOOB_COMMANDS } from "../../lib/runoobLinuxCommands";

function cn(...inputs: any[]) {
  return clsx(inputs);
}

import type { SavedConnection } from "../../lib/bridge";

export interface CommandItem {
  id: string;
  name: string;
  command: string;
  description?: string;
}

export interface CommandFolder {
  id: string;
  name: string;
  commands: CommandItem[];
}

export type Tool = "ssh" | "local" | "cmd" | "monitor" | "serial" | "ebpf" | "cluster" | "git" | "browser" | "settings";
export type ThemeMode = "dark" | "light";

export function CommandPaletteModal({
  open,
  onOpenChange,
  connections,
  onConnectHost,
  commandFolders,
  onSendCommand,
  onNavigateTool,
  onSetTheme,
  onCreateLocalSession
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: SavedConnection[];
  onConnectHost: (conn: SavedConnection) => void;
  commandFolders: CommandFolder[];
  onSendCommand: (cmd: string) => void;
  onNavigateTool: (tool: Tool) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onCreateLocalSession: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const keyword = query.trim().toLowerCase();

  const hostItems = connections
    .filter((c) => !keyword || `${c.name || ""} ${c.hostname} ${c.username}`.toLowerCase().includes(keyword))
    .map((c) => ({
      id: `host:${c.hostname}:${c.username}`,
      category: "主机服务器",
      icon: "🖥️",
      title: c.name || c.hostname || "未命名主机",
      detail: `${c.username || "root"}@${c.hostname}:${c.port || 22}`,
      action: () => {
        onConnectHost(c);
        onOpenChange(false);
      }
    }));

  const commandItems = commandFolders
    .flatMap((folder) => folder.commands.map((cmd) => ({ folder, cmd })))
    .filter(({ folder, cmd }) => !keyword || `${folder.name} ${cmd.name} ${cmd.command}`.toLowerCase().includes(keyword))
    .map(({ folder, cmd }) => ({
      id: `cmd:${cmd.id}`,
      category: "快捷指令",
      icon: "⚡",
      title: cmd.name,
      detail: `$ ${cmd.command} [${folder.name}]`,
      action: () => {
        onSendCommand(cmd.command);
        onOpenChange(false);
      }
    }));

  const linuxItems = keyword
    ? ALL_LINUX_COMMAND_NAMES
        .filter((cmd) => cmd.toLowerCase().includes(keyword))
        .slice(0, 10)
        .map((cmd) => {
          const runoobInfo = FLAT_RUNOOB_COMMANDS.find((c) => c.name.toLowerCase() === cmd);
          return {
            id: `linux:${cmd}`,
            category: "Linux 指令",
            icon: "🐧",
            title: cmd,
            detail: runoobInfo ? `${runoobInfo.desc} [${runoobInfo.category}]` : `直接发送 $ ${cmd} 至当前活动终端`,
            action: () => {
              onSendCommand(cmd);
              onOpenChange(false);
            }
          };
        })
    : [];

  const toolItems = [
    { id: "tool:ssh", category: "全局工具", icon: "🌐", title: "打开 SSH 会话工作台", detail: "切换到主机会话面板", action: () => { onNavigateTool("ssh"); onOpenChange(false); } },
    { id: "tool:local", category: "全局工具", icon: "💻", title: "新建 Local Shell 本地终端", detail: "基于 BusyBox 内置本地终端", action: () => { onCreateLocalSession(); onOpenChange(false); } },
    { id: "tool:cmd", category: "全局工具", icon: "📦", title: "打开 快捷命令库", detail: "管理与配置指令分类", action: () => { onNavigateTool("cmd"); onOpenChange(false); } },
    { id: "tool:monitor", category: "全局工具", icon: "📊", title: "打开 系统监控面板", detail: "实时推算硬件负载与进程", action: () => { onNavigateTool("monitor"); onOpenChange(false); } },
    { id: "tool:serial", category: "全局工具", icon: "⚡", title: "打开 串口 TTY 调试面板", detail: "Linux /dev 串口与硬件调试", action: () => { onNavigateTool("serial"); onOpenChange(false); } },
    { id: "tool:ebpf", category: "全局工具", icon: "🧬", title: "打开 eBPF 探针观察者", detail: "内核 VMA 内存映射与系统调用", action: () => { onNavigateTool("ebpf"); onOpenChange(false); } },
    { id: "tool:cluster", category: "全局工具", icon: "🔄", title: "打开 多节点集群跑手", detail: "多服务器并发巡检与一键并行脚本", action: () => { onNavigateTool("cluster"); onOpenChange(false); } },
    { id: "tool:git", category: "全局工具", icon: "🌱", title: "打开 Git 仓库结构可视化", detail: "分支 Commit 树与差异对比", action: () => { onNavigateTool("git"); onOpenChange(false); } },
    { id: "tool:browser", category: "全局工具", icon: "🌍", title: "打开 网页浏览器", detail: "访问路由器/容器后台", action: () => { onNavigateTool("browser"); onOpenChange(false); } },
    { id: "tool:settings", category: "全局工具", icon: "⚙️", title: "打开 应用设置", detail: "调整高亮规则与终端外观", action: () => { onNavigateTool("settings"); onOpenChange(false); } }
  ].filter((item) => !keyword || `${item.title} ${item.detail}`.toLowerCase().includes(keyword));

  const themeItems = [
    { id: "theme:dark", category: "外观主题", icon: "🌙", title: "切换为 夜间深邃黑 主题", detail: "极简暗色极客体验", action: () => { onSetTheme("dark"); onOpenChange(false); } },
    { id: "theme:light", category: "外观主题", icon: "☀️", title: "切换为 日间晶透白 主题", detail: "高对比明亮 UI", action: () => { onSetTheme("light"); onOpenChange(false); } }
  ].filter((item) => !keyword || `${item.title} ${item.detail}`.toLowerCase().includes(keyword));

  const allItems = [...hostItems, ...commandItems, ...linuxItems, ...toolItems, ...themeItems];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev + 1) % allItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev - 1 + allItems.length) % allItems.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--mask-base)] backdrop-blur-xs animate-in fade-in duration-150" />
        <Dialog.Content className="fixed left-1/2 top-1/4 z-50 w-[580px] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)] p-0 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
          <div className="flex items-center gap-3 border-b border-[var(--app-line)] px-4 py-3 bg-[var(--panel-bg)]">
            <Search className="h-4 w-4 text-[var(--app-muted)] shrink-0" />
            <input
              autoFocus
              className="w-full bg-transparent text-sm font-extrabold text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:outline-none"
              placeholder="搜索 350+ Linux 指令、主机服务器、快捷工具与参数 (Ctrl+K)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <span className="rounded-md bg-[var(--fill-2)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--app-muted)] border border-[var(--app-line)] shrink-0">
              ESC 关闭
            </span>
          </div>

          <div className="max-h-[380px] overflow-auto p-2 space-y-1">
            {allItems.length === 0 ? (
              <div className="py-8 text-center text-xs font-semibold text-[var(--app-muted)]">
                没有找到匹配的指令或主机
              </div>
            ) : (
              allItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs transition-all cursor-pointer select-none",
                      isSelected
                        ? "bg-emerald-600 text-white font-extrabold shadow-sm shadow-emerald-500/20"
                        : "text-[var(--app-text)] hover:bg-[var(--fill-1)]"
                    )}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base shrink-0">{item.icon}</span>
                      <div className="min-w-0">
                        <div className="truncate font-extrabold">{item.title}</div>
                        <div className={cn("truncate text-[11px] font-mono mt-0.5", isSelected ? "text-white/80" : "text-[var(--app-muted)]")}>
                          {item.detail}
                        </div>
                      </div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-extrabold shrink-0 border", isSelected ? "bg-white/20 text-white border-white/30" : "bg-[var(--fill-2)] text-[var(--app-muted)] border-[var(--app-line)]")}>
                      {item.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
