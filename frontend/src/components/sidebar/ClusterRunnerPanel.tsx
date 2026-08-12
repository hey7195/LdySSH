import React, { useState } from "react";
import { Network, Play, CheckCircle2, AlertTriangle, Layers, Server, RefreshCw, Terminal } from "lucide-react";

interface ClusterRunnerPanelProps {
  savedConnections: Array<{ id?: string; key?: string; name?: string; hostname?: string; host?: string }>;
  onRunCommand: (command: string) => void;
}

const PRESET_INSPECTION_SCRIPTS = [
  { id: "i1", name: "🔍 节点健康一键快速巡检", cmd: "echo '=== CPU & Memory ===' && uptime && free -h && echo '=== Disk Space ===' && df -h /" },
  { id: "i2", name: "🌐 网络端口与防火墙规则巡检", cmd: "sudo ss -tuln && sudo ufw status || sudo iptables -L -n -v | head -n 20" },
  { id: "i3", name: "🐳 Docker 容器与镜像状态巡检", cmd: "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' && docker images | head -n 10" },
  { id: "i4", name: "📜 内核日志与 Systemd 崩溃警告巡检", cmd: "sudo dmesg -l err,crit,alert,emerg | tail -n 20 && sudo journalctl -p err -n 20 --no-pager" }
];

export const ClusterRunnerPanel: React.FC<ClusterRunnerPanelProps> = ({ savedConnections, onRunCommand }) => {
  const [selectedHosts, setSelectedHosts] = useState<string[]>(
    savedConnections.map((c) => c.id || c.key || c.name || "host")
  );
  const [customCmd, setCustomCmd] = useState("uptime && free -h");

  const toggleHost = (id: string) => {
    setSelectedHosts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRunClusterCommand = (commandToRun: string) => {
    onRunCommand(commandToRun);
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 p-4 space-y-4 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
          <Network className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
            <span>集群并发脚本巡检引擎</span>
            <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.2 text-[10px] text-purple-400 font-mono">
              Parallel Cluster Engine
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">多节点服务器批量命令广播与一键自动化巡检脚本</p>
        </div>
      </div>

      {/* Select Nodes */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-purple-400" /> 选择巡检目标主机 ({selectedHosts.length}/{savedConnections.length})
          </span>
          <button
            onClick={() =>
              setSelectedHosts(
                selectedHosts.length === savedConnections.length
                  ? []
                  : savedConnections.map((c) => c.id || c.key || c.name || "host")
              )
            }
            className="text-[11px] font-bold text-purple-400 hover:text-purple-300 transition-colors"
          >
            {selectedHosts.length === savedConnections.length ? "全不选" : "全选"}
          </button>
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {savedConnections.length === 0 ? (
            <div className="text-xs text-zinc-500 py-2 text-center">暂无保存的 SSH 主机</div>
          ) : (
            savedConnections.map((host) => {
              const hostId: string = host.id || host.key || host.name || "host";
              const hostIp: string = host.hostname || host.host || "127.0.0.1";
              return (
                <label
                  key={hostId}
                  onClick={() => toggleHost(hostId)}
                  className={`flex items-center justify-between rounded-xl border p-2 text-xs font-bold transition-all cursor-pointer ${
                    selectedHosts.includes(hostId)
                      ? "border-purple-500/60 bg-purple-500/10 text-purple-200"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedHosts.includes(hostId)}
                      onChange={() => {}}
                      className="rounded border-zinc-700 text-purple-600 focus:ring-0"
                    />
                    <span>{host.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">{hostIp}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Preset Inspection Scripts */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold text-zinc-300 flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 text-purple-400" /> 预置一键巡检脚本库
        </span>
        <div className="space-y-2">
          {PRESET_INSPECTION_SCRIPTS.map((script) => (
            <div
              key={script.id}
              className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 hover:border-purple-500/40 transition-all"
            >
              <span className="text-xs font-bold text-zinc-200">{script.name}</span>
              <button
                onClick={() => handleRunClusterCommand(script.cmd)}
                className="flex items-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Play className="h-3 w-3" />
                <span>广播执行</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Command Broadcast */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2 shadow-md">
        <span className="text-xs font-extrabold text-zinc-200">自定义广播命令:</span>
        <textarea
          value={customCmd}
          onChange={(e) => setCustomCmd(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-xs text-purple-300 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none resize-none"
        />
        <button
          onClick={() => handleRunClusterCommand(customCmd)}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 py-2 text-xs font-extrabold text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95"
        >
          <Play className="h-3.5 w-3.5" />
          <span>并发分发至已选节点</span>
        </button>
      </div>
    </div>
  );
};
