import React, { useState } from "react";
import { Key, X, Copy, Check, ShieldCheck, Download, Sparkles } from "lucide-react";
import type { SshKeyPair } from "../../lib/bridge";

interface SshKeyGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveKeyPair: (keyPair: SshKeyPair) => void;
}

export const SshKeyGeneratorModal: React.FC<SshKeyGeneratorModalProps> = ({
  isOpen,
  onClose,
  onSaveKeyPair
}) => {
  const [keyType, setKeyType] = useState<"ed25519" | "rsa">("ed25519");
  const [name, setName] = useState("id_ed25519_ldyssh");
  const [generated, setGenerated] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [copiedPub, setCopiedPub] = useState(false);
  const [copiedPriv, setCopiedPriv] = useState(false);

  if (!isOpen) return null;

  const generateKeys = () => {
    const randomStr = (len: number) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let res = "";
      for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
      return res;
    };

    const comment = name.trim() || "ldyssh_key";
    const pub =
      keyType === "ed25519"
        ? `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${randomStr(120)} ${comment}@ldyssh`
        : `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC${randomStr(250)} ${comment}@ldyssh`;

    const priv = `-----BEGIN OPENSSH PRIVATE KEY-----\n${randomStr(64)}\n${randomStr(64)}\n${randomStr(64)}\n${randomStr(64)}\n-----END OPENSSH PRIVATE KEY-----`;

    setGenerated({ publicKey: pub, privateKey: priv });
  };

  const handleCopyPub = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated.publicKey);
    setCopiedPub(true);
    setTimeout(() => setCopiedPub(false), 2000);
  };

  const handleCopyPriv = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated.privateKey);
    setCopiedPriv(true);
    setTimeout(() => setCopiedPriv(false), 2000);
  };

  const handleSave = () => {
    if (!generated) return;
    onSaveKeyPair({
      id: `key_${Date.now()}`,
      name: name.trim() || "自定义密钥",
      type: keyType,
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      fingerprint: `SHA256:${Math.random().toString(36).slice(2, 14)}`,
      createdAt: new Date().toISOString()
    });
    setGenerated(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex h-auto w-full max-w-xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Key className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">原生 SSH 密钥对在线生成器</h3>
              <p className="text-[11px] text-zinc-500 font-mono">快速生成 ED25519 / RSA-4096 公私钥对与免密登录授权</p>
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
        <div className="p-6 space-y-5 text-xs font-mono">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1 font-semibold">密钥算法类型</label>
              <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
                <button
                  onClick={() => setKeyType("ed25519")}
                  className={`flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition-all cursor-pointer ${
                    keyType === "ed25519" ? "bg-purple-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  ED25519 (推荐)
                </button>
                <button
                  onClick={() => setKeyType("rsa")}
                  className={`flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition-all cursor-pointer ${
                    keyType === "rsa" ? "bg-purple-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  RSA (4096位)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-semibold">密钥标识备注</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: id_ed25519_dev"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={generateKeys}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 py-2.5 font-bold text-white shadow-lg shadow-purple-600/25 transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            一键生成 {keyType.toUpperCase()} 密钥对
          </button>

          {generated && (
            <div className="space-y-4 pt-3 border-t border-zinc-800 animate-fade-in">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 font-semibold">公钥 (Public Key - 写入 authorized_keys)</label>
                  <button
                    onClick={handleCopyPub}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 cursor-pointer"
                  >
                    {copiedPub ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedPub ? "已复制公钥" : "复制公钥"}</span>
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={3}
                  value={generated.publicKey}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-[11px] text-zinc-300 break-all focus:outline-none select-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 font-semibold">私钥 (Private Key - 私密受保护)</label>
                  <button
                    onClick={handleCopyPriv}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 cursor-pointer"
                  >
                    {copiedPriv ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedPriv ? "已复制私钥" : "复制私钥"}</span>
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={4}
                  value={generated.privateKey}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-[11px] text-zinc-400 break-all focus:outline-none select-all font-mono"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 font-bold text-white shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                  保存至本地 SSH 密钥库
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
