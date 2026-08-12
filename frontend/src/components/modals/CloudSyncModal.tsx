import React, { useState } from "react";
import { Cloud, X, UploadCloud, DownloadCloud, Check, AlertCircle, RefreshCw, Key, Globe } from "lucide-react";

export interface CloudSyncConfig {
  type: "webdav" | "gist";
  webdavUrl?: string;
  username?: string;
  password?: string;
  gistToken?: string;
  gistId?: string;
}

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CloudSyncConfig;
  onSaveConfig: (cfg: CloudSyncConfig) => void;
  onPushToCloud: () => Promise<boolean>;
  onPullFromCloud: () => Promise<boolean>;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onPushToCloud,
  onPullFromCloud
}) => {
  const [form, setForm] = useState<CloudSyncConfig>(config);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "">("");

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(form);
    setStatusType("success");
    setStatusMsg("云同步代理参数已保存。");
    setTimeout(() => setStatusMsg(""), 3000);
  };

  const handlePush = async () => {
    setIsPushing(true);
    setStatusMsg("");
    try {
      const ok = await onPushToCloud();
      if (ok) {
        setStatusType("success");
        setStatusMsg("本地连接与命令预设已成功同步上传至云端！");
      } else {
        setStatusType("error");
        setStatusMsg("同步上传失败，请检查网络或 WebDAV/Gist 凭据配置");
      }
    } catch {
      setStatusType("error");
      setStatusMsg("同步异常，请检查配置");
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    setIsPulling(true);
    setStatusMsg("");
    try {
      const ok = await onPullFromCloud();
      if (ok) {
        setStatusType("success");
        setStatusMsg("已成功从云端恢复拉取并增量合并配置！");
      } else {
        setStatusType("error");
        setStatusMsg("拉取失败，请检查云端备份文件是否存在");
      }
    } catch {
      setStatusType("error");
      setStatusMsg("拉取异常");
    } finally {
      setIsPulling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Cloud className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">WebDAV / GitHub Gist 跨设备云端同步</h3>
              <p className="text-[11px] text-zinc-500 font-mono">在多台电脑间安全备份与同步主机连接、预设模板与命令库</p>
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
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Sync Type Selector */}
          <div className="flex items-center gap-2 select-none">
            <span className="text-zinc-400 font-semibold">同步存储通道:</span>
            <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
              <button
                onClick={() => setForm({ ...form, type: "webdav" })}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  form.type === "webdav" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                WebDAV (坚果云/自建)
              </button>
              <button
                onClick={() => setForm({ ...form, type: "gist" })}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  form.type === "gist" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                GitHub Gist
              </button>
            </div>
          </div>

          {form.type === "webdav" ? (
            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1 font-semibold">WebDAV 服务器地址 (URL)</label>
                <input
                  type="text"
                  value={form.webdavUrl || ""}
                  onChange={(e) => setForm({ ...form, webdavUrl: e.target.value })}
                  placeholder="https://dav.jianguoyun.com/dav/ldyssh/"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">WebDAV 账号</label>
                  <input
                    type="text"
                    value={form.username || ""}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">WebDAV 密码/应用密钥</label>
                  <input
                    type="password"
                    value={form.password || ""}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="应用专用授权码"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1 font-semibold">GitHub Personal Access Token</label>
                <input
                  type="password"
                  value={form.gistToken || ""}
                  onChange={(e) => setForm({ ...form, gistToken: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1 font-semibold">Gist ID (可选，留空自动新建)</label>
                <input
                  type="text"
                  value={form.gistId || ""}
                  onChange={(e) => setForm({ ...form, gistId: e.target.value })}
                  placeholder="如: 7d3c864a0441439284b5742b9e543d7d"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <button
              onClick={handleSave}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              保存参数
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePull}
                disabled={isPulling || isPushing}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {isPulling ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5 text-blue-400" />}
                从云端拉取合并
              </button>

              <button
                onClick={handlePush}
                disabled={isPulling || isPushing}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
              >
                {isPushing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                一键上传同步至云端
              </button>
            </div>
          </div>

          {statusMsg && (
            <div
              className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold border ${
                statusType === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
              }`}
            >
              {statusType === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{statusMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
