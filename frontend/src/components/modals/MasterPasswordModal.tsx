import React, { useState } from "react";
import { Lock, Unlock, KeyRound, ShieldCheck, X, Eye, EyeOff } from "lucide-react";

interface MasterPasswordModalProps {
  mode: "lock" | "settings";
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (password: string) => boolean;
  onSetMasterPassword: (password: string) => void;
  hasMasterPassword: boolean;
}

export const MasterPasswordModal: React.FC<MasterPasswordModalProps> = ({
  mode,
  isOpen,
  onClose,
  onUnlock,
  onSetMasterPassword,
  hasMasterPassword
}) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const ok = onUnlock(password);
    if (ok) {
      setPassword("");
      setErrorMsg("");
      onClose();
    } else {
      setErrorMsg("主密码不正确，请重新输入");
    }
  };

  const handleSetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) {
      setErrorMsg("主密码长度至少 4 位");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("两次输入的密码不一致");
      return;
    }
    onSetMasterPassword(password);
    setPassword("");
    setConfirmPassword("");
    setErrorMsg("");
    onClose();
  };

  if (mode === "lock") {
    return (
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-xl animate-fade-in select-none">
        <div className="flex h-auto w-full max-w-md flex-col rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl items-center text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-purple-600/20 text-purple-400 border border-purple-500/30 shadow-inner">
            <Lock className="h-8 w-8 animate-pulse" />
          </div>

          <div>
            <h3 className="font-extrabold text-xl text-zinc-100">LdySSH 应用锁屏防护</h3>
            <p className="text-xs text-zinc-400 mt-1">敏感连接凭据与终端工作区已保护，请输入主密码解锁</p>
          </div>

          <form onSubmit={handleUnlockSubmit} className="w-full space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg("");
                }}
                autoFocus
                placeholder="请输入主密码..."
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/90 py-3 pl-4 pr-10 text-sm text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none font-mono text-center"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {errorMsg && (
              <p className="text-xs font-bold text-rose-400 bg-rose-500/10 py-1.5 px-3 rounded-xl border border-rose-500/20">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={!password}
              className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition-all cursor-pointer ${
                password
                  ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30"
                  : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
              }`}
            >
              <Unlock className="h-4 w-4" />
              解锁应用
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-auto w-full max-w-md flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">设置应用锁屏主密码</h3>
              <p className="text-[11px] text-zinc-500 font-mono">开启主密码后解锁敏感主机凭据与防未授权访问</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSetPasswordSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 mb-1 font-semibold">主密码 (Master Password)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="设置主密码 (至少 4 位)..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1 font-semibold">确认主密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入主密码..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none font-mono"
            />
          </div>

          {errorMsg && <p className="text-xs font-bold text-rose-400">{errorMsg}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            {hasMasterPassword && (
              <button
                type="button"
                onClick={() => {
                  onSetMasterPassword("");
                  onClose();
                }}
                className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-900/40 transition-colors cursor-pointer"
              >
                清除主密码
              </button>
            )}
            <button
              type="submit"
              disabled={!password || !confirmPassword}
              className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold transition-all cursor-pointer ${
                password && confirmPassword
                  ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25"
                  : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              保存主密码
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
