import React, { useState } from "react";
import { ArrowRightLeft, X, Plus, Trash2, ShieldCheck, Play, CheckCircle2 } from "lucide-react";

export interface TunnelRule {
  id: string;
  type: "local" | "remote" | "socks5";
  localPort: number;
  targetHost: string;
  targetPort: number;
  active: boolean;
}

interface PortForwardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle?: string;
  tunnels: TunnelRule[];
  onAddTunnel: (rule: TunnelRule) => void;
  onDeleteTunnel: (id: string) => void;
  onToggleTunnel: (id: string) => void;
}

export const PortForwardingModal: React.FC<PortForwardingModalProps> = ({
  isOpen,
  onClose,
  sessionTitle = "远程服务器",
  tunnels,
  onAddTunnel,
  onDeleteTunnel,
  onToggleTunnel
}) => {
  const [type, setType] = useState<"local" | "remote" | "socks5">("local");
  const [localPort, setLocalPort] = useState("3306");
  const [targetHost, setTargetHost] = useState("127.0.0.1");
  const [targetPort, setTargetPort] = useState("3306");

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPort) return;
    const rule: TunnelRule = {
      id: `tunnel_${Date.now()}`,
      type,
      localPort: Number(localPort) || 8080,
      targetHost: targetHost.trim() || "127.0.0.1",
      targetPort: Number(targetPort) || 8080,
      active: true
    };
    onAddTunnel(rule);
    setLocalPort("");
    setTargetHost("127.0.0.1");
    setTargetPort("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-[82vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-100">SSH 端口转发与加密隧道管理</h3>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-400">
                  {sessionTitle}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">加密穿透内网数据库、Web 端口与 SOCKS5 代理</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Add Rule Form */}
          <form onSubmit={handleAdd} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-zinc-200 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-cyan-400" />
                新增端口映射规则
              </h4>
              <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
                {(["local", "remote", "socks5"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded px-2.5 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                      type === t ? "bg-cyan-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {t === "local" ? "本地转发 (-L)" : t === "remote" ? "远程转发 (-R)" : "SOCKS5 (-D)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1 font-semibold">本地监听端口</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  placeholder="例如: 3306"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none font-mono"
                />
              </div>

              {type !== "socks5" && (
                <>
                  <div>
                    <label className="block text-zinc-400 mb-1 font-semibold">目标主机 IP</label>
                    <input
                      type="text"
                      value={targetHost}
                      onChange={(e) => setTargetHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-100 focus:border-cyan-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 mb-1 font-semibold">目标远程端口</label>
                    <input
                      type="number"
                      value={targetPort}
                      onChange={(e) => setTargetPort(e.target.value)}
                      placeholder="例如: 3306"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="flex items-center gap-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 font-bold text-white shadow-lg shadow-cyan-600/25 transition-all cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                开启端口隧道
              </button>
            </div>
          </form>

          {/* Active Tunnels Table */}
          <div className="space-y-3">
            <h4 className="font-bold text-zinc-300">生效中的加密隧道规则 ({tunnels.length})</h4>
            {tunnels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 py-8 text-center text-zinc-500">
                暂无端口映射隧道规则
              </div>
            ) : (
              <div className="space-y-2">
                {tunnels.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-cyan-500/20">
                        {t.type.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-2 text-zinc-200 font-bold">
                        <span>127.0.0.1:{t.localPort}</span>
                        <span className="text-zinc-500">➔</span>
                        <span>{t.targetHost}:{t.targetPort}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleTunnel(t.id)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          t.active ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {t.active ? "映射中" : "暂停"}
                      </button>

                      <button
                        onClick={() => onDeleteTunnel(t.id)}
                        className="rounded-lg p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
