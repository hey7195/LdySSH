import React, { useState, useEffect } from "react";
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
  Maximize2
} from "lucide-react";
import { nativeBridge } from "../../lib/bridge";

interface ScrcpyModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSerial?: string;
}

export const ScrcpyModal: React.FC<ScrcpyModalProps> = ({
  isOpen,
  onClose,
  defaultSerial = ""
}) => {
  const [scrcpyDir, setScrcpyDir] = useState(
    () => localStorage.getItem("ldyssh_scrcpy_path") || "D:\\tools\\scrcpy-win64-v4.1"
  );
  const [serial, setSerial] = useState(defaultSerial || "");
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
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("ldyssh_scrcpy_history");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (defaultSerial) {
      setSerial(defaultSerial);
    }
  }, [defaultSerial]);

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
      }
    } catch {
      // Fallback
    }
  }

  async function handleLaunch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!scrcpyDir.trim()) {
      setError("请填写或选择 Scrcpy 所在目录路径！");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const flags: string[] = [];
    if (alwaysOnTop) flags.push("--always-on-top");
    if (turnScreenOff) flags.push("--turn-screen-off");
    if (noAudio) flags.push("--no-audio");
    if (maxSize.trim()) flags.push(`--max-size ${maxSize.trim()}`);
    if (bitRate.trim()) flags.push(`--bit-rate ${bitRate.trim()}`);
    if (customArgs.trim()) flags.push(customArgs.trim());

    try {
      const targetSerial = serial.trim();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-[88vh] max-h-[760px] w-full max-w-2xl flex-col rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)] text-[var(--app-text)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-line)] bg-[var(--sidebar-bg)] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-xs">
              <Cast className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-[var(--app-text)]">Scrcpy 极速安卓投屏与控制</h3>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.2 font-mono text-[10px] font-bold text-purple-400 border border-purple-500/30">
                  超低延迟控制
                </span>
              </div>
              <p className="text-[11px] text-[var(--app-muted)] font-medium">配置 Scrcpy 工具链目录，一键极速调起独立高清操作窗口</p>
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
                  <span>Scrcpy 所在目录 (包含 scrcpy.exe)</span>
                </span>
                <span className="text-[10px] text-[var(--app-muted)] font-normal">支持直接输入或浏览选取</span>
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="例如: D:\tools\scrcpy-win64-v4.1"
                  value={scrcpyDir}
                  onChange={(e) => setScrcpyDir(e.target.value)}
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

            {/* Device Serial / IP:Port */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                <span>目标设备 Serial 或 IP:Port (-s 参数)</span>
                <span className="text-[10px] text-[var(--app-muted)] font-normal">（留空则默认投屏唯一已连接的设备）</span>
              </label>
              <input
                type="text"
                placeholder="例如: 222.246.152.131:63031 或 192.168.75.129:1201 或留空"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="w-full h-9 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] px-3 text-xs font-mono font-bold text-[var(--app-text)] focus:border-purple-500 focus:outline-none transition-colors"
              />
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
              disabled={loading}
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
