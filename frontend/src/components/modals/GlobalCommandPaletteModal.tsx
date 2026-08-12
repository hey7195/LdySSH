import React, { useState, useEffect } from "react";
import { Search, Server, Command as CmdIcon, Terminal, Settings, ShieldAlert, KeyRound, Cloud, X } from "lucide-react";
import type { SavedConnection, CommandFolder } from "../../lib/bridge";

interface GlobalCommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: SavedConnection[];
  commandFolders: CommandFolder[];
  onConnectHost: (conn: SavedConnection) => void;
  onRunCommand: (cmdStr: string) => void;
  onOpenSettings: () => void;
  onOpenCloudSync: () => void;
  onOpenKeyGen: () => void;
}

export const GlobalCommandPaletteModal: React.FC<GlobalCommandPaletteModalProps> = ({
  isOpen,
  onClose,
  connections,
  commandFolders,
  onConnectHost,
  onRunCommand,
  onOpenSettings,
  onOpenCloudSync,
  onOpenKeyGen
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const keyword = query.trim().toLowerCase();

  // 1. Host Items
  const matchingHosts = connections
    .filter((c) => !keyword || (c.name || "").toLowerCase().includes(keyword) || (c.hostname || "").toLowerCase().includes(keyword))
    .slice(0, 5)
    .map((c) => ({
      id: `host_${c.hostname}_${c.username}`,
      type: "host" as const,
      icon: Server,
      title: c.name || c.hostname,
      subtitle: `SSH -> ${c.username || "root"}@${c.hostname}`,
      action: () => {
        onConnectHost(c);
        onClose();
      }
    }));

  // 2. Command Items
  const allCommands = commandFolders.flatMap((f) => f.commands.map((cmd) => ({ ...cmd, folderName: f.name })));
  const matchingCommands = allCommands
    .filter((cmd) => !keyword || (cmd.name || "").toLowerCase().includes(keyword) || (cmd.command || "").toLowerCase().includes(keyword))
    .slice(0, 5)
    .map((cmd) => ({
      id: `cmd_${cmd.id}`,
      type: "command" as const,
      icon: CmdIcon,
      title: cmd.name || cmd.command,
      subtitle: `$ ${cmd.command} (${cmd.folderName})`,
      action: () => {
        onRunCommand(cmd.command);
        onClose();
      }
    }));

  // 3. System Actions
  const systemActions = [
    {
      id: "act_settings",
      type: "action" as const,
      icon: Settings,
      title: "系统偏好设置",
      subtitle: "定制终端主题、默认字体、SSHKeepAlive 选项",
      action: () => {
        onOpenSettings();
        onClose();
      }
    },
    {
      id: "act_sync",
      type: "action" as const,
      icon: Cloud,
      title: "云端跨设备同步",
      subtitle: "支持 WebDAV / Gist 一键备份配置",
      action: () => {
        onOpenCloudSync();
        onClose();
      }
    },
    {
      id: "act_keygen",
      type: "action" as const,
      icon: KeyRound,
      title: "SSH 密钥对生成工具",
      subtitle: "生成 RSA / Ed25519 密钥对",
      action: () => {
        onOpenKeyGen();
        onClose();
      }
    }
  ].filter((act) => !keyword || act.title.toLowerCase().includes(keyword) || act.subtitle.toLowerCase().includes(keyword));

  const allItems = [...matchingHosts, ...matchingCommands, ...systemActions];

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div
        className="flex w-full max-w-xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden"
        onKeyDown={handleFormKeyDown}
      >
        {/* Search Header */}
        <div className="relative flex items-center border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <Search className="h-4 w-4 text-emerald-400 shrink-0 mr-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索主机、快捷命令、全局操作... (↑↓ 选择, Enter 执行, Esc 退出)"
            className="w-full bg-transparent text-sm font-medium text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <span className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-400 shrink-0 ml-2">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1 font-sans">
          {allItems.length === 0 ? (
            <div className="p-8 text-center text-xs font-medium text-zinc-500">
              未找到匹配的主机或命令
            </div>
          ) : (
            allItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                      : "text-zinc-300 hover:bg-zinc-900 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
                        item.type === "host"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : item.type === "command"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 truncate">
                      <div className="text-xs font-extrabold text-zinc-100 truncate">{item.title}</div>
                      <div className="text-[11px] font-mono text-zinc-500 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                    {item.type === "host" ? "主机" : item.type === "command" ? "指令" : "系统功能"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-4 py-2 text-[10px] text-zinc-500 font-mono">
          <span>快捷键提示: 随时按下 <kbd className="text-zinc-300">Ctrl+K</kbd> 呼出指令罗盘</span>
          <span>LDYSSH PRO v1.0</span>
        </div>
      </div>
    </div>
  );
};
