import React, { useState, useEffect } from "react";
import {
  Smartphone,
  X,
  Play,
  Copy,
  Check,
  Clock,
  User,
  Globe,
  Settings2,
  RefreshCw,
  Zap,
  BookmarkPlus,
  History,
  AlertCircle,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { nativeBridge } from "../../lib/bridge";

export interface AdbForwardResult {
  rawText: string;
  deviceId: string;
  user: string;
  startDate?: string;
  expirationDate?: string;
  command: string;
  timestamp: number;
}

interface AdbForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle?: string;
  onExecuteCommand?: (cmd: string) => void;
  onSaveCommand?: (name: string, command: string) => void;
}

function normalizeDate(dStr: string): string {
  if (!dStr) return "";
  const cleaned = dStr.trim().replace(/\//g, "-").replace(/\./g, "-");
  return cleaned;
}

function getFutureDate(days = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const AdbForwardModal: React.FC<AdbForwardModalProps> = ({
  isOpen,
  onClose,
  sessionTitle = "活动终端",
  onExecuteCommand,
  onSaveCommand
}) => {
  const [user, setUser] = useState(() => localStorage.getItem("ldyssh_adb_user") || "");
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem("ldyssh_adb_deviceid") || "");
  const [expirationDate, setExpirationDate] = useState(() => getFutureDate(7));
  const [allowIp, setAllowIp] = useState(() => localStorage.getItem("ldyssh_adb_allow_ip") || "");
  const [apiEndpoint, setApiEndpoint] = useState(
    () => localStorage.getItem("ldyssh_adb_endpoint") || "http://weixin_robot.ldyunos.com:8085/start_adb"
  );
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem("ldyssh_adb_token") || "b7c2d9a1e4f86c3d0a9b5e7f2c1d8a46"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingIp, setLoadingIp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdbForwardResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [executed, setExecuted] = useState(false);

  const [history, setHistory] = useState<AdbForwardResult[]>(() => {
    try {
      const stored = localStorage.getItem("ldyssh_adb_history");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem("ldyssh_adb_user", user);
    if (deviceId) localStorage.setItem("ldyssh_adb_deviceid", deviceId);
    if (allowIp) localStorage.setItem("ldyssh_adb_allow_ip", allowIp);
    if (apiEndpoint) localStorage.setItem("ldyssh_adb_endpoint", apiEndpoint);
    if (authToken) localStorage.setItem("ldyssh_adb_token", authToken);
  }, [user, deviceId, allowIp, apiEndpoint, authToken]);

  // 打开弹窗时，如果 IP 为空则自动获取本机公网 IP
  useEffect(() => {
    if (isOpen && !allowIp) {
      void fetchPublicIp();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function fetchPublicIp() {
    setLoadingIp(true);
    try {
      // 优先通过原生后端请求获取外网 IP
      const nativeRes = await nativeBridge.hermesHttpRequest({
        method: "GET",
        url: "https://api.ipify.org?format=json"
      });
      if (nativeRes.success && nativeRes.body) {
        try {
          const data = JSON.parse(nativeRes.body);
          if (data.ip) {
            setAllowIp(data.ip);
            return;
          }
        } catch {
          if (nativeRes.body.trim()) {
            setAllowIp(nativeRes.body.trim());
            return;
          }
        }
      }

      // 浏览器 fetch 备选
      const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.ip) {
        setAllowIp(data.ip);
      }
    } catch {
      try {
        const res2 = await fetch("https://ifconfig.me/ip", { signal: AbortSignal.timeout(5000) });
        const ip = (await res2.text()).trim();
        if (ip) setAllowIp(ip);
      } catch {
        // Ignore failure
      }
    } finally {
      setLoadingIp(false);
    }
  }

  function parseResponseText(raw: string, devId: string, usr: string, expDate: string): AdbForwardResult {
    let command = "";
    let startDate = "";
    let parsedExpDate = expDate;

    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes("adb connect")) {
        command = line.slice(line.indexOf("adb connect")).trim();
      } else if (line.startsWith("命令生成:") && lines[i + 1]?.includes("adb connect")) {
        command = lines[i + 1].trim();
      } else if (line.includes("映射日期为:")) {
        startDate = line.split("映射日期为:")[1]?.trim() || "";
      } else if (line.includes("过期日期为:")) {
        parsedExpDate = line.split("过期日期为:")[1]?.trim() || expDate;
      }
    }

    if (!command) {
      const match = raw.match(/adb\s+connect\s+[\w\.\:\-]+/i);
      if (match) command = match[0];
    }

    return {
      rawText: raw,
      deviceId: devId,
      user: usr,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      expirationDate: parsedExpDate,
      command: command || `adb connect ${devId}`,
      timestamp: Date.now()
    };
  }

  async function handleStartAdb(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!deviceId.trim()) {
      setError("请填写设备 ID (deviceid)");
      return;
    }
    if (!user.trim()) {
      setError("请填写使用者 (user)");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setSaved(false);
    setExecuted(false);

    const formattedExpDate = normalizeDate(expirationDate) || getFutureDate(7);

    try {
      const url = new URL(apiEndpoint.trim());
      url.searchParams.set("user", user.trim());
      url.searchParams.set("deviceid", deviceId.trim());
      url.searchParams.set("Expiration_Date", formattedExpDate);
      if (allowIp.trim()) {
        url.searchParams.set("allow_ip", allowIp.trim());
      }

      let text = "";

      // 1. 优先通过 C++ 原生请求发送 (完全避开浏览器 CORS 限制与 Mixed Content 限制)
      const nativeRes = await nativeBridge.hermesHttpRequest({
        method: "GET",
        url: url.toString(),
        token: authToken.trim()
      });

      if (nativeRes && nativeRes.success && nativeRes.body) {
        text = nativeRes.body;
      } else if (nativeRes && nativeRes.status && nativeRes.status >= 200 && nativeRes.status < 400 && nativeRes.body) {
        text = nativeRes.body;
      } else if (nativeRes && nativeRes.error && !nativeRes.error.includes("unavailable")) {
        // 如果后端有详细返回信息
        if (nativeRes.body) {
          text = nativeRes.body;
        } else {
          throw new Error(nativeRes.error);
        }
      } else {
        // 2. 备选方案：前端直接 fetch 发送
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken.trim()}`
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`服务器响应异常: ${response.status} ${response.statusText}`);
        }

        text = await response.text();
      }

      const parsed = parseResponseText(text, deviceId.trim(), user.trim(), formattedExpDate);
      setResult(parsed);

      // 保存到本地历史记录
      const newHistory = [parsed, ...history.filter((h) => h.deviceId !== parsed.deviceId)].slice(0, 8);
      setHistory(newHistory);
      localStorage.setItem("ldyssh_adb_history", JSON.stringify(newHistory));
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError("请求超时 (30秒)，请检查远程端口转发服务器网络连通性。");
      } else {
        setError(err.message || "请求开启 ADB 转发失败，请检查网络或配置");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleCopyCommand = () => {
    if (!result?.command) return;
    void navigator.clipboard.writeText(result.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecuteInTerminal = () => {
    if (!result?.command) return;
    onExecuteCommand?.(result.command);
    setExecuted(true);
    setTimeout(() => setExecuted(false), 2000);
  };

  const handleSaveToLibrary = () => {
    if (!result?.command) return;
    onSaveCommand?.(`ADB-${result.deviceId}`, result.command);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-[88vh] max-h-[780px] w-full max-w-2xl flex-col rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)] text-[var(--app-text)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-line)] bg-[var(--sidebar-bg)] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-[var(--app-text)]">一键开启远程 ADB 端口转发</h3>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.2 font-mono text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                  Android 远程映射
                </span>
              </div>
              <p className="text-[11px] text-[var(--app-muted)] font-medium">自动请求云端映射接口生成 adb connect 指令并直达终端</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] p-2 text-[var(--app-muted)] hover:bg-[var(--fill-2)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
            title="关闭窗口"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
          <form onSubmit={handleStartAdb} className="space-y-4">
            {/* Grid for User and DeviceId */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <User className="h-3.5 w-3.5 text-emerald-400" />
                  <span>使用者 (user)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-full h-9 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono font-bold text-[var(--app-text)] focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                  <span>设备 ID (deviceid)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="海外设备加hw，例如: 6120778 或 hw6120778"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono font-bold text-[var(--app-text)] focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Expiration Date with Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  <span>失效日期 (Expiration_Date: YYYY-MM-DD)</span>
                  <span className="text-[10px] text-[var(--app-muted)] font-normal">（默认自动计算今日起 +7 天）</span>
                </label>
                <div className="flex items-center gap-1">
                  {[3, 7, 14, 30].map((days) => {
                    const presetDate = getFutureDate(days);
                    const isSelected = normalizeDate(expirationDate) === presetDate;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setExpirationDate(presetDate)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-2xs"
                            : "bg-[var(--fill-1)] border-[var(--app-line)] text-[var(--app-muted)] hover:text-[var(--app-text)]"
                        }`}
                      >
                        +{days}天
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    required
                    placeholder="格式: 2026-08-21"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono font-bold text-[var(--app-text)] focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </div>
                <div className="relative shrink-0">
                  <input
                    type="date"
                    value={normalizeDate(expirationDate)}
                    onChange={(e) => {
                      if (e.target.value) setExpirationDate(e.target.value);
                    }}
                    className="h-9 px-2 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] text-xs text-[var(--app-text)] cursor-pointer focus:border-emerald-500 focus:outline-none font-mono"
                    title="选择日历日期"
                  />
                </div>
              </div>
            </div>

            {/* Allow IP */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <Globe className="h-3.5 w-3.5 text-indigo-400" />
                  <span>允许连接 IP (allow_ip)</span>
                  <span className="text-[10px] text-[var(--app-muted)] font-normal">（可选，留空或填指定客户端外网 IP）</span>
                </label>
                <button
                  type="button"
                  onClick={fetchPublicIp}
                  disabled={loadingIp}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${loadingIp ? "animate-spin" : ""}`} />
                  <span>{loadingIp ? "获取中..." : "获取本机公网 IP"}</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="例如: 220.168.47.62 (留空则不限制)"
                value={allowIp}
                onChange={(e) => setAllowIp(e.target.value)}
                className="w-full h-9 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono text-[var(--app-text)] focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Advanced Settings Accordion */}
            <div className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3 space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between text-xs font-bold text-[var(--app-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5 text-purple-400" />
                  <span>高级接口与鉴权配置</span>
                </div>
                <span className="text-[10px] text-[var(--app-muted)]">{showAdvanced ? "收起 ▲" : "展开 ▼"}</span>
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-2 border-t border-[var(--app-line)]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[var(--app-muted)]">API 接口地址 (URL)</label>
                    <input
                      type="text"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      className="w-full h-8 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2.5 text-xs font-mono text-[var(--app-text)] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[var(--app-muted)]">Bearer Token 鉴权令牌</label>
                    <input
                      type="text"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      className="w-full h-8 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2.5 text-xs font-mono text-[var(--app-text)] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>正在请求开启 ADB 转发 (30秒超时)...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>一键开启 ADB 远程转发</span>
                </>
              )}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Result Card */}
          {result && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-extrabold text-emerald-300">ADB 转发开启成功</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--app-muted)]">
                  有效至: {result.expirationDate}
                </span>
              </div>

              {/* Command display box */}
              <div className="rounded-xl border border-emerald-500/30 bg-zinc-950/90 p-3 font-mono text-xs text-emerald-300 flex items-center justify-between gap-3 shadow-inner">
                <div className="truncate font-extrabold select-text">{result.command}</div>
                <button
                  onClick={handleCopyCommand}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[11px] font-bold transition-all cursor-pointer shrink-0 border border-emerald-500/30"
                  title="复制连接指令"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? "已复制" : "复制"}</span>
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExecuteInTerminal}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>{executed ? "已发送至终端！" : `在当前终端执行 (${sessionTitle})`}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveToLibrary}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:bg-[var(--fill-2)] text-[var(--app-text)] font-bold text-xs transition-colors cursor-pointer"
                  title="保存到快捷命令库"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-purple-400" />
                  <span>{saved ? "已保存" : "收藏命令"}</span>
                </button>
              </div>

              {/* Raw Details */}
              <div className="text-[10px] font-mono text-[var(--app-muted)] bg-[var(--fill-1)] p-2 rounded-lg whitespace-pre-wrap">
                {result.rawText}
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--app-line)]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-muted)]">
                <History className="h-3.5 w-3.5" />
                <span>最近转发记录</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setDeviceId(item.deviceId);
                      setUser(item.user);
                      setResult(item);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:bg-[var(--fill-2)] cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-mono font-bold text-[var(--app-text)] truncate">
                        {item.deviceId} ({item.user})
                      </div>
                      <div className="text-[10px] font-mono text-[var(--app-muted)] truncate">
                        {item.command}
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">
                      重用
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
