import React, { useState, useEffect, useCallback } from "react";
import {
  Cast,
  X,
  FolderOpen,
  Play,
  Settings,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  History,
  Monitor,
  Volume2,
  EyeOff,
  Maximize2,
  RefreshCw,
  Cpu,
  Radio,
  Terminal,
  PackagePlus,
  Camera,
  RotateCw,
  Sparkles,
  Layers,
  Check,
  Copy,
  Download
} from "lucide-react";
import { nativeBridge } from "../../lib/bridge";

export interface AdbDeviceItem {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  device?: string;
  transport_id?: string;
}

interface ScrcpyModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSerial?: string;
  onOpenAdbShell?: (serial: string, scrcpyDir: string) => void;
}

export const ScrcpyModal: React.FC<ScrcpyModalProps> = ({
  isOpen,
  onClose,
  defaultSerial = "",
  onOpenAdbShell
}) => {
  const [scrcpyDir, setScrcpyDir] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_path") || "D:\\tools\\scrcpy-win64-v4.1"
  );
  const [serial, setSerial] = useState(defaultSerial || "");
  const [devices, setDevices] = useState<AdbDeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [alwaysOnTop, setAlwaysOnTop] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_always_on_top") === "true"
  );
  const [turnScreenOff, setTurnScreenOff] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_turn_off_screen") === "true"
  );
  const [noAudio, setNoAudio] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_no_audio") === "true"
  );
  const [maxSize, setMaxSize] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_max_size") || ""
  );
  const [bitRate, setBitRate] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_bit_rate") || ""
  );
  const [customArgs, setCustomArgs] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_custom_args") || ""
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<{ base64: string; path?: string } | null>(null);

  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("ldyssh_scrcpy_history");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const fetchAdbDevices = useCallback(async (dirPath?: string) => {
    setLoadingDevices(true);
    try {
      const pathToCheck = dirPath !== undefined ? dirPath : scrcpyDir;
      const res = await nativeBridge.getAdbDevices(pathToCheck.trim());
      if (res && res.devices) {
        setDevices(res.devices);
        if (!serial.trim() && res.devices.length > 0) {
          const firstOnline = res.devices.find((d) => d.state === "device") || res.devices[0];
          setSerial(firstOnline.serial);
        }
      } else {
        setDevices([]);
      }
    } catch {
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [scrcpyDir, serial]);

  useEffect(() => {
    if (defaultSerial) {
      setSerial(defaultSerial);
    }
  }, [defaultSerial]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setScreenshotPreview(null);
      void fetchAdbDevices();
    }
  }, [isOpen, fetchAdbDevices]);

  useEffect(() => {
    localStorage.setItem("ldyssh_scrcpy_path", scrcpyDir);
    localStorage.setItem("ldyssh_scrcpy_always_on_top", String(alwaysOnTop));
    localStorage.setItem("ldyssh_scrcpy_turn_off_screen", String(turnScreenOff));
    localStorage.setItem("ldyssh_scrcpy_no_audio", String(noAudio));
    localStorage.setItem("ldyssh_scrcpy_max_size", maxSize);
    localStorage.setItem("ldyssh_scrcpy_bit_rate", bitRate);
    localStorage.setItem("ldyssh_scrcpy_custom_args", customArgs);
  }, [scrcpyDir, alwaysOnTop, turnScreenOff, noAudio, maxSize, bitRate, customArgs]);

  if (!isOpen) return null;

  async function handleBrowseFolder() {
    try {
      const res = await nativeBridge.showOpenFolderDialog("选择 Scrcpy 所在文件夹");
      if (res && res.folderPath) {
        setScrcpyDir(res.folderPath);
        void fetchAdbDevices(res.folderPath);
      }
    } catch {
      // Fallback
    }
  }

  function getScrcpyFlags(): string[] {
    const flags: string[] = [];
    if (alwaysOnTop) flags.push("--always-on-top");
    if (turnScreenOff) flags.push("--turn-screen-off");
    if (noAudio) flags.push("--no-audio");
    if (maxSize.trim()) flags.push(`--max-size ${maxSize.trim()}`);
    if (bitRate.trim()) flags.push(`--bit-rate ${bitRate.trim()}`);
    if (customArgs.trim()) flags.push(customArgs.trim());
    return flags;
  }

  async function handleLaunch(e?: React.FormEvent, customTarget?: string) {
    if (e) e.preventDefault();
    if (!scrcpyDir.trim()) {
      setError("请填写或选择 Scrcpy 所在目录路径！");
      return;
    }

    const targetSerial = (customTarget || serial).trim();

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const flags = getScrcpyFlags();

    try {
      const res = await nativeBridge.launchScrcpy(scrcpyDir.trim(), targetSerial, flags.join(" "));
      if (res && res.success) {
        const cmdDisplay = res.command || `scrcpy ${targetSerial ? `-s ${targetSerial}` : ""}`;
        setSuccessMsg(`✓ 成功拉起 Scrcpy 投屏窗口！\n执行指令: ${cmdDisplay}`);

        if (targetSerial) {
          const newHist = [targetSerial, ...history.filter((s) => s !== targetSerial)].slice(0, 8);
          setHistory(newHist);
          localStorage.setItem("ldyssh_scrcpy_history", JSON.stringify(newHist));
        }
      } else {
        throw new Error(res?.error || "启动 Scrcpy 失败，请检查目录路径是否包含 scrcpy.exe");
      }
    } catch (err: any) {
      setError(err.message || "启动失败，请检查 Scrcpy 路径与设备连通性");
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunchAll() {
    const onlineDevices = devices.filter((d) => d.state === "device");
    if (onlineDevices.length === 0) {
      setError("当前没有在线状态的设备可供并发投屏！");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const flags = getScrcpyFlags();
    let launched = 0;

    for (const dev of onlineDevices) {
      try {
        const res = await nativeBridge.launchScrcpy(scrcpyDir.trim(), dev.serial, flags.join(" "));
        if (res && res.success) launched++;
      } catch {
        // Continue
      }
    }

    setLoading(false);
    setSuccessMsg(`✓ 成功并发拉起 ${launched}/${onlineDevices.length} 台设备的独立投屏窗口！`);
  }

  async function handleOpenShell(targetSerial: string) {
    if (!targetSerial.trim()) {
      setError("目标设备序列号为空！");
      return;
    }
    if (onOpenAdbShell) {
      onOpenAdbShell(targetSerial.trim(), scrcpyDir.trim());
      onClose();
    } else {
      setSuccessMsg(`已准备打开 ADB Shell 终端: adb -s ${targetSerial} shell`);
    }
  }

  async function handleInstallApk(targetSerial: string) {
    if (!targetSerial.trim()) {
      setError("目标设备序列号为空！");
      return;
    }
    try {
      const res = await nativeBridge.showOpenFileDialog("选择要安装的 APK 安装包");
      if (res && res.filePath) {
        if (!res.filePath.toLowerCase().endsWith(".apk")) {
          setError("请选择有效的 .apk 安装包文件！");
          return;
        }
        setActionInProgress(`正在向 [${targetSerial}] 安装 APK: ${res.filePath.split(/[\\/]/).pop()}...`);
        setError(null);
        setSuccessMsg(null);

        const installRes = await nativeBridge.installApk(scrcpyDir.trim(), targetSerial, res.filePath);
        if (installRes && installRes.success) {
          setSuccessMsg(`✓ APK 安装成功！\n目标: ${targetSerial}\n文件: ${res.filePath}`);
        } else {
          throw new Error(installRes?.error || "APK 安装失败，请确认设备未锁屏并开启 USB 安装权限");
        }
      }
    } catch (err: any) {
      setError(err.message || "安装 APK 异常");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleScreencap(targetSerial: string) {
    if (!targetSerial.trim()) {
      setError("目标设备序列号为空！");
      return;
    }
    setActionInProgress(`正在捕获 [${targetSerial}] 屏幕画面...`);
    setError(null);
    setSuccessMsg(null);
    setScreenshotPreview(null);

    try {
      const capRes = await nativeBridge.screencapAdb(scrcpyDir.trim(), targetSerial);
      if (capRes && capRes.success && capRes.base64) {
        setScreenshotPreview({ base64: capRes.base64, path: capRes.filePath });
        setSuccessMsg(`✓ 截屏成功！已生成高清快照`);
      } else {
        throw new Error(capRes?.error || "截屏失败，请检查设备是否在线");
      }
    } catch (err: any) {
      setError(err.message || "设备截屏失败");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleReboot(targetSerial: string) {
    if (!targetSerial.trim()) return;
    if (!window.confirm(`确定要重启设备/安卓容器 [${targetSerial}] 吗？`)) return;

    setActionInProgress(`正在重启设备 [${targetSerial}]...`);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await nativeBridge.rebootAdb(scrcpyDir.trim(), targetSerial);
      if (res && res.success) {
        setSuccessMsg(`✓ 已发送重启指令至设备 [${targetSerial}]！`);
        setTimeout(() => void fetchAdbDevices(), 3000);
      } else {
        throw new Error(res?.error || "重启失败");
      }
    } catch (err: any) {
      setError(err.message || "发送重启命令失败");
    } finally {
      setActionInProgress(null);
    }
  }

  const onlineCount = devices.filter((d) => d.state === "device").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-[90vh] max-h-[860px] w-full max-w-2xl flex-col rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)] text-[var(--app-text)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-line)] bg-[var(--sidebar-bg)] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-xs">
              <Cast className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-[var(--app-text)]">ADB 超级运维中心 & Scrcpy 投屏</h3>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.2 font-mono text-[10px] font-bold text-purple-400 border border-purple-500/30">
                  一站式容器管理
                </span>
              </div>
              <p className="text-[11px] text-[var(--app-muted)] font-medium">直达 Shell 终端、一键并发投屏、拖拽安装 APK 与截图诊断</p>
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
          <form onSubmit={handleLaunch} className="space-y-4">
            {/* Scrcpy Directory Setting */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-bold text-[var(--app-text)]">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-purple-400" />
                  <span>Scrcpy & ADB 所在目录</span>
                </span>
                <span className="text-[10px] text-[var(--app-muted)] font-normal">包含 scrcpy.exe 与 adb.exe</span>
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="例如: D:\tools\scrcpy-win64-v4.1"
                  value={scrcpyDir}
                  onChange={(e) => {
                    setScrcpyDir(e.target.value);
                  }}
                  onBlur={() => {
                    void fetchAdbDevices();
                  }}
                  className="w-full h-9 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono font-bold text-[var(--app-text)] focus:border-purple-500 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:bg-[var(--fill-2)] text-xs font-bold text-[var(--app-text)] transition-colors cursor-pointer shrink-0"
                  title="浏览选择文件夹"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-purple-400" />
                  <span>浏览目录</span>
                </button>
              </div>
            </div>

            {/* ADB Devices Auto Scan & Selection Section */}
            <div className="space-y-2.5 rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                  <span>已连接 ADB 设备 ({devices.length} 台)</span>
                </label>

                <div className="flex items-center gap-2">
                  {onlineCount > 1 && (
                    <button
                      type="button"
                      onClick={handleLaunchAll}
                      disabled={loading}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg"
                      title="一键同时拉起所有在线设备的 Scrcpy 投屏窗口"
                    >
                      <Layers className="h-3 w-3" />
                      <span>全选并发投屏 ({onlineCount})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fetchAdbDevices()}
                    disabled={loadingDevices}
                    className="flex items-center gap-1 text-[11px] font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer disabled:opacity-50"
                    title="刷新当前 ADB 已识别设备"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingDevices ? "animate-spin" : ""}`} />
                    <span>{loadingDevices ? "扫描中..." : "刷新设备"}</span>
                  </button>
                </div>
              </div>

              {/* Devices Card Grid */}
              {devices.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {devices.map((dev, idx) => {
                    const isSelected = serial.trim() === dev.serial.trim();
                    const isOnline = dev.state === "device";

                    return (
                      <div
                        key={idx}
                        onClick={() => setSerial(dev.serial)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "border-purple-500 bg-purple-500/15 shadow-sm shadow-purple-500/20 ring-1 ring-purple-500/50"
                            : "border-[var(--app-line)] bg-[var(--app-bg)] hover:border-purple-500/40 hover:bg-[var(--fill-2)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isSelected ? (
                              <Radio className="h-4 w-4 text-purple-400 fill-purple-400/20 shrink-0" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-[var(--app-line)] bg-[var(--fill-1)] shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-mono text-xs font-extrabold text-[var(--app-text)] truncate block">
                                {dev.serial}
                              </span>
                              {(dev.model || dev.product || dev.device) && (
                                <div className="flex items-center gap-1 text-[10px] text-[var(--app-muted)] font-mono truncate">
                                  <Cpu className="h-2.5 w-2.5 text-purple-400 shrink-0" />
                                  <span className="truncate">
                                    {[dev.model, dev.product, dev.device].filter(Boolean).join(" / ")}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-lg font-mono text-[9px] font-bold border shrink-0 ${
                              isOnline
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }`}
                          >
                            {isOnline ? "● 在线" : `● ${dev.state}`}
                          </span>
                        </div>

                        {/* Quick Device Actions Strip */}
                        {isOnline && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-2.5 mt-2 border-t border-[var(--app-line)]/60">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenShell(dev.serial);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-bold text-[10px] transition-colors border border-indigo-500/30 cursor-pointer"
                              title="在当前工作区打开终端标签并直达 root/adb shell"
                            >
                              <Terminal className="h-3 w-3 text-indigo-400" />
                              <span>进入 Shell</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInstallApk(dev.serial);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 font-bold text-[10px] transition-colors border border-teal-500/30 cursor-pointer"
                              title="选择 APK 文件并一键安装到该设备"
                            >
                              <PackagePlus className="h-3 w-3 text-teal-400" />
                              <span>安装 APK</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleScreencap(dev.serial);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-bold text-[10px] transition-colors border border-sky-500/30 cursor-pointer"
                              title="截取设备当前画面"
                            >
                              <Camera className="h-3 w-3 text-sky-400" />
                              <span>一键截屏</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleReboot(dev.serial);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold text-[10px] transition-colors border border-rose-500/30 cursor-pointer"
                              title="重启 Android 系统或容器"
                            >
                              <RotateCw className="h-3 w-3 text-rose-400" />
                              <span>重启设备</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-dashed border-[var(--app-line)] bg-[var(--app-bg)]/50 text-center space-y-1">
                  <p className="text-xs text-[var(--app-muted)] font-medium">
                    {loadingDevices
                      ? "正在扫描 adb devices..."
                      : "未检测到在线设备（可在下方直接输入目标 IP:Port 或在【ADB 转发】中开启直连）"}
                  </p>
                </div>
              )}

              {/* Manual Serial or IP:Port Input */}
              <div className="pt-2 space-y-1">
                <label className="text-[11px] font-medium text-[var(--app-muted)] flex items-center justify-between">
                  <span>目标设备 Serial 或 IP:Port (-s 参数)</span>
                  <span className="text-[10px] text-[var(--app-muted)]">支持手动输入微调</span>
                </label>
                <input
                  type="text"
                  placeholder="例如: 222.246.152.131:63031 或 192.168.75.129:1201"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  className="w-full h-8.5 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono font-bold text-[var(--app-text)] focus:border-purple-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Quick Feature Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] cursor-pointer hover:bg-[var(--fill-2)] transition-colors">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <Monitor className="h-3.5 w-3.5 text-emerald-400" />
                  <span>窗口保持置顶</span>
                </span>
                <input
                  type="checkbox"
                  checked={alwaysOnTop}
                  onChange={(e) => setAlwaysOnTop(e.target.checked)}
                  className="rounded border-[var(--app-line)] text-purple-500 focus:ring-0 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] cursor-pointer hover:bg-[var(--fill-2)] transition-colors">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                  <span>物理设备息屏</span>
                </span>
                <input
                  type="checkbox"
                  checked={turnScreenOff}
                  onChange={(e) => setTurnScreenOff(e.target.checked)}
                  className="rounded border-[var(--app-line)] text-purple-500 focus:ring-0 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] cursor-pointer hover:bg-[var(--fill-2)] transition-colors">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <Volume2 className="h-3.5 w-3.5 text-rose-400" />
                  <span>静音 (--no-audio)</span>
                </span>
                <input
                  type="checkbox"
                  checked={noAudio}
                  onChange={(e) => setNoAudio(e.target.checked)}
                  className="rounded border-[var(--app-line)] text-purple-500 focus:ring-0 cursor-pointer"
                />
              </label>
            </div>

            {/* Advanced Performance Options */}
            <div className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3 space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between text-xs font-bold text-[var(--app-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5 text-purple-400" />
                  <span>分辨率、码率与自定义启动参数</span>
                </div>
                <span className="text-[10px] text-[var(--app-muted)]">{showAdvanced ? "收起 ▲" : "展开 ▼"}</span>
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-2 border-t border-[var(--app-line)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--app-muted)]">最大分辨率 (--max-size)</label>
                      <input
                        type="text"
                        placeholder="例如: 1080 或 720 (默认原画)"
                        value={maxSize}
                        onChange={(e) => setMaxSize(e.target.value)}
                        className="w-full h-8 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2.5 text-xs font-mono text-[var(--app-text)] focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--app-muted)]">传输码率 (--bit-rate)</label>
                      <input
                        type="text"
                        placeholder="例如: 4M 或 8M (默认 8M)"
                        value={bitRate}
                        onChange={(e) => setBitRate(e.target.value)}
                        className="w-full h-8 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2.5 text-xs font-mono text-[var(--app-text)] focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[var(--app-muted)]">附加自定义参数 (Raw CLI Arguments)</label>
                    <input
                      type="text"
                      placeholder="例如: --window-title 'My Container' --render-driver=opengl"
                      value={customArgs}
                      onChange={(e) => setCustomArgs(e.target.value)}
                      className="w-full h-8 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2.5 text-xs font-mono text-[var(--app-text)] focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Launch Button */}
            <button
              type="submit"
              disabled={loading || !!actionInProgress}
              className="flex w-full h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Maximize2 className="h-4 w-4 animate-spin" />
                  <span>正在唤起 Scrcpy 独立窗口...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>一键拉起 Scrcpy 投屏窗口</span>
                </>
              )}
            </button>
          </form>

          {/* Action In Progress Banner */}
          {actionInProgress && (
            <div className="flex items-center gap-2.5 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-300 animate-in fade-in font-medium">
              <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-sky-400" />
              <span>{actionInProgress}</span>
            </div>
          )}

          {/* Screenshot Preview */}
          {screenshotPreview && (
            <div className="rounded-2xl border border-sky-500/40 bg-zinc-950/90 p-3 space-y-2 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-sky-400" />
                  <span>屏幕快照预览</span>
                </span>
                {screenshotPreview.path && (
                  <span className="text-[10px] font-mono text-[var(--app-muted)] truncate max-w-xs">
                    {screenshotPreview.path}
                  </span>
                )}
              </div>
              <div className="flex justify-center bg-black/50 p-2 rounded-xl">
                <img
                  src={`data:image/png;base64,${screenshotPreview.base64}`}
                  alt="ADB Screenshot"
                  className="max-h-56 rounded-lg object-contain border border-[var(--app-line)]"
                />
              </div>
            </div>
          )}

          {/* Success Message */}
          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono whitespace-pre-wrap">{successMsg}</div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--app-line)]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-muted)]">
                <History className="h-3.5 w-3.5" />
                <span>最近投屏设备</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {history.map((histSerial, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSerial(histSerial);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:bg-[var(--fill-2)] cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 pr-2 font-mono text-xs font-bold text-[var(--app-text)] truncate">
                      {histSerial}
                    </div>
                    <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.2 rounded shrink-0">
                      填入
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
