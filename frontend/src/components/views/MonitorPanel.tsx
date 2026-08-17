import React, { useState, useEffect } from "react";
import { Cpu, Server, HardDrive, Activity, RefreshCw, Copy } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "../ui";

function cn(...inputs: any[]) {
  return clsx(inputs);
}

export interface NativeResult {
  success?: boolean;
  error?: string;
  [key: string]: any;
}

export interface SessionTab {
  id: string;
  title: string;
  kind?: "ssh" | "local";
  connected?: boolean;
  connectParams?: {
    hostname?: string;
    [key: string]: any;
  };
}

function isMonitorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function monitorRecord(result: NativeResult | undefined, key: string) {
  const value = result?.[key];
  return isMonitorRecord(value) ? value : {};
}

export function monitorList(result: NativeResult | undefined, key: string) {
  const value = result?.[key];
  return Array.isArray(value) ? value.filter(isMonitorRecord) : [];
}

export function monitorText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function monitorPercent(value: unknown) {
  const match = /-?\d+(?:\.\d+)?/.exec(monitorText(value));
  if (!match) return 0;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function monitorPercentLabel(value: unknown) {
  const text = monitorText(value);
  if (text === "-") return "0%";
  return text.includes("%") ? text : `${text}%`;
}

function MonitorProgress({ value, className = "bg-blue-500" }: { value: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--fill-2)] p-0.5">
      <div className={cn("h-full rounded-full transition-all duration-300", className)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function MonitorMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  percent,
  variant = "indigo"
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  percent: number;
  variant?: "indigo" | "emerald" | "amber";
}) {
  const variantStyles = {
    indigo: { iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/60", bar: "bg-indigo-500" },
    emerald: { iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60", bar: "bg-emerald-500" },
    amber: { iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-100 dark:border-amber-900/60", bar: "bg-amber-500" }
  }[variant];

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5.5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-extrabold text-[var(--app-muted)] tracking-wider uppercase">{label}</div>
          <div className="mt-1 font-mono text-2xl font-black text-[var(--app-text)] tracking-tight">{value}</div>
          <div className="mt-1 font-mono text-xs font-bold text-[var(--app-muted)]">{detail}</div>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-xs", variantStyles.iconBg)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4">
        <MonitorProgress value={percent} className={variantStyles.bar} />
      </div>
    </div>
  );
}

function MonitorStatusBlock({ result }: { result?: NativeResult }) {
  if (result && !result.success) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs font-bold text-amber-700 dark:text-amber-300">
        {result.error || "未能获取当前项监控数据"}
      </div>
    );
  }
  return null;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--app-line)] p-12 text-center">
      <Server className="h-10 w-10 text-[var(--app-muted)] mb-3" />
      <h3 className="text-sm font-extrabold text-[var(--app-text)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--app-muted)] max-w-sm">{description}</p>
    </div>
  );
}

export function MonitorPanel({
  activeSession,
  nativeBridge
}: {
  activeSession?: SessionTab;
  nativeBridge: {
    getSystemInfo: (id: string) => Promise<NativeResult>;
    getSystemStats: (id: string) => Promise<NativeResult>;
    getProcessList: (id: string) => Promise<NativeResult>;
    getDiskUsage: (id: string) => Promise<NativeResult>;
    getNetworkInfo: (id: string) => Promise<NativeResult>;
    clipboardCopy: (text: string) => Promise<any>;
  };
}) {
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, NativeResult>>({});
  const [copiedIp, setCopiedIp] = useState(false);
  const hostIp = activeSession?.connectParams?.hostname || (activeSession?.kind === "ssh" ? activeSession.title : "");

  async function refresh() {
    if (!activeSession) return;
    setLoading(true);
    const [info, stats, processes, disk, network] = await Promise.all([
      nativeBridge.getSystemInfo(activeSession.id),
      nativeBridge.getSystemStats(activeSession.id),
      nativeBridge.getProcessList(activeSession.id),
      nativeBridge.getDiskUsage(activeSession.id),
      nativeBridge.getNetworkInfo(activeSession.id)
    ]);
    setSnapshots({ info, stats, processes, disk, network });
    setLoading(false);
  }

  useEffect(() => {
    setSnapshots({});
    void refresh();
  }, [activeSession?.id]);

  const info = monitorRecord(snapshots.info, "info");
  const stats = monitorRecord(snapshots.stats, "stats");
  const processes = monitorList(snapshots.processes, "processes").slice(0, 8);
  const disks = monitorList(snapshots.disk, "disk_usage");
  const networks = monitorList(snapshots.network, "network_info");
  const hasStats = Boolean(snapshots.stats?.success);
  const hasInfo = Boolean(snapshots.info?.success);
  const hasProcesses = Boolean(snapshots.processes?.success);
  const hasDisk = Boolean(snapshots.disk?.success);
  const hasNetwork = Boolean(snapshots.network?.success);
  const statusResults = [snapshots.info, snapshots.stats, snapshots.processes, snapshots.disk, snapshots.network].filter(
    (result): result is NativeResult => Boolean(result && !result.success)
  );

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg)] px-10 py-7">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--app-text)]">系统硬件与资源监控</h1>
              <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-3 py-0.5 font-mono text-xs font-extrabold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{activeSession ? activeSession.title : "未连接"}</span>
              </span>
              {hostIp && (
                <button
                  type="button"
                  onClick={() => {
                    void nativeBridge.clipboardCopy(hostIp);
                    setCopiedIp(true);
                    setTimeout(() => setCopiedIp(false), 2000);
                  }}
                  className="rounded-full bg-[var(--fill-1)] hover:bg-emerald-500/15 text-[var(--app-text)] hover:text-emerald-400 border border-[var(--app-line)] hover:border-emerald-500/30 px-3 py-0.5 font-mono text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title={`点击复制 IP: ${hostIp}`}
                >
                  <span className="text-[var(--app-muted)] font-bold">IP:</span>
                  <span>{hostIp}</span>
                  <Copy className="h-3 w-3 text-sky-400" />
                  {copiedIp && <span className="text-[10px] text-emerald-400 font-extrabold">已复制 ✔</span>}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--text-secondary)]">实时推算当前 SSH 实例的 CPU 负载、物理内存、磁盘 IO、网卡速率与进程树。</p>
          </div>
          <Button variant="outline" size={32} className="rounded-full h-10 px-5 text-xs font-bold shadow-2xs cursor-pointer" onClick={refresh} disabled={!activeSession || loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新指标
          </Button>
        </div>

        {!activeSession ? (
          <EmptyState title="暂无活动 SSH 会话" description="在左侧列表中点击选择或连接一台 SSH 主机后，系统将自动开始推算该主机的硬件监控指标。" />
        ) : (
          <div className="space-y-6">
            {statusResults.length > 0 && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                {statusResults.map((result) => result.error || "暂未获取到部分监控项数据").join("；")}
              </div>
            )}

            {/* 3 大核心指标卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <MonitorMetricCard
                label="CPU"
                value={hasStats ? monitorPercentLabel(stats.cpu_usage) : "0%"}
                detail="当前多核处理器占用"
                icon={Cpu}
                percent={monitorPercent(stats.cpu_usage)}
                variant="indigo"
              />
              <MonitorMetricCard
                label="内存"
                value={hasStats ? monitorPercentLabel(stats.memory_usage) : "0%"}
                detail={`${monitorText(stats.memory_used)} / ${monitorText(stats.memory_total)}`}
                icon={Server}
                percent={monitorPercent(stats.memory_usage)}
                variant="emerald"
              />
              <MonitorMetricCard
                label="磁盘"
                value={hasStats ? monitorPercentLabel(stats.disk_usage) : "0%"}
                detail={`${monitorText(stats.disk_used)} / ${monitorText(stats.disk_total)}`}
                icon={HardDrive}
                percent={monitorPercent(stats.disk_usage)}
                variant="amber"
              />
            </div>

            {/* 系统概览与网卡区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4 text-indigo-600" />
                  系统硬件概览
                </h2>
                {!hasInfo ? (
                  <MonitorStatusBlock result={snapshots.info} />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "主机名称", value: info.hostname },
                      { label: "操作系统", value: info.os_name || info.os_version },
                      { label: "硬件架构", value: info.architecture },
                      { label: "处理器型号", value: info.cpu },
                      { label: "物理内存总额", value: info.total_memory },
                      { label: "系统运行持续时间", value: info.uptime }
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3.5">
                        <div className="text-[11px] font-extrabold text-[var(--app-muted)]">{item.label}</div>
                        <div className="mt-1 truncate font-mono text-xs font-extrabold text-[var(--app-text)]">{monitorText(item.value)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 网卡网络接口 */}
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  网络设备接口 (Network NICs)
                </h2>
                {!hasNetwork ? (
                  <MonitorStatusBlock result={snapshots.network} />
                ) : (
                  <div className="space-y-2.5">
                    {networks.slice(0, 4).map((net, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-extrabold text-[var(--app-text)]">{monitorText(net.name || net.interface)}</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] font-bold text-indigo-600 dark:text-cyan-400">{monitorText(net.ip || net.address)}</div>
                        </div>
                        <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 font-mono text-[10px] font-extrabold shrink-0">
                          Active
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 进程列表与磁盘使用 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 进程列表 */}
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-600" />
                  实时进程树 Top 8 (Process Tree)
                </h2>
                {!hasProcesses ? (
                  <MonitorStatusBlock result={snapshots.processes} />
                ) : processes.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--fill-1)] p-4 text-xs font-semibold text-[var(--app-muted)] text-center">暂无进程数据</div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[var(--app-line)]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[var(--fill-2)] text-[10px] font-extrabold text-[var(--app-muted)] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2.5">PID</th>
                          <th className="px-3 py-2.5">进程名称</th>
                          <th className="px-3 py-2.5">CPU %</th>
                          <th className="px-3 py-2.5">内存 %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-line)]">
                        {processes.map((process, index) => (
                          <tr key={`${monitorText(process.pid)}-${index}`} className="hover:bg-[var(--fill-1)] transition-colors">
                            <td className="px-3 py-2.5 font-bold text-indigo-600 dark:text-cyan-400">{monitorText(process.pid)}</td>
                            <td className="px-3 py-2.5 font-bold text-[var(--app-text)] truncate max-w-[120px]">{monitorText(process.name)}</td>
                            <td className="px-3 py-2.5 font-bold text-emerald-600">{monitorPercentLabel(process.cpu)}</td>
                            <td className="px-3 py-2.5 text-[var(--app-muted)]">{monitorPercentLabel(process.memory)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 磁盘挂载 */}
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-amber-600" />
                  磁盘挂载点使用量 (Disk Mounts)
                </h2>
                {!hasDisk ? (
                  <MonitorStatusBlock result={snapshots.disk} />
                ) : disks.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--fill-1)] p-4 text-xs font-semibold text-[var(--app-muted)] text-center">暂无磁盘数据</div>
                ) : (
                  <div className="space-y-3">
                    {disks.slice(0, 3).map((disk, index) => (
                      <div key={`${monitorText(disk.mount)}-${index}`} className="rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-xs font-extrabold text-[var(--app-text)]">{monitorText(disk.mount)}</div>
                          <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 font-mono text-[10px] font-extrabold">
                            {monitorPercentLabel(disk.usage)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--fill-2)] p-0.5">
                          <div className="h-full rounded-full bg-amber-500 transition-all duration-300" style={{ width: `${monitorPercent(disk.usage)}%` }} />
                        </div>
                        <div className="text-[10px] font-mono font-semibold text-[var(--app-muted)]">
                          已用 {monitorText(disk.used)} / 总额 {monitorText(disk.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
