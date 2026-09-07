import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { KeyRound, Sparkles, X, Copy, Download, Trash2 } from "lucide-react";
import { Button, Input } from "../ui";

export interface SshKeyPair {
  id: string;
  name: string;
  type: "ed25519" | "rsa";
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  createdAt: string;
}

export function SshKeyManagerModal({
  open,
  keys,
  onOpenChange,
  onCreateKey,
  onDeleteKey,
  onOpenGenerator,
  onCopyText
}: {
  open: boolean;
  keys: SshKeyPair[];
  onOpenChange: (open: boolean) => void;
  onCreateKey: (type: "ed25519" | "rsa", name: string) => void;
  onDeleteKey: (id: string) => void;
  onOpenGenerator?: () => void;
  onCopyText?: (text: string) => void | Promise<any>;
}) {
  const [newType, setNewType] = useState<"ed25519" | "rsa">("ed25519");
  const [newName, setNewName] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  function handleCreate() {
    if (!newName.trim()) return;
    onCreateKey(newType, newName.trim());
    setNewName("");
  }

  function handleCopyPub(key: SshKeyPair) {
    if (onCopyText) {
      void onCopyText(key.publicKey);
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(key.publicKey);
    }
    setCopyNotice(`已复制公钥 [${key.name}] 到剪贴板`);
    setTimeout(() => setCopyNotice(""), 3000);
  }

  function handleDownloadPem(key: SshKeyPair) {
    const blob = new Blob([key.privateKey], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key.name || "id_key"}.pem`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)] z-50 border border-[var(--app-line)] select-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--app-text)] flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-indigo-600" />
                SSH 密钥库与生成器
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[var(--app-muted)]">
                生成与管理 RSA / Ed25519 秘钥对，支持一键复制公钥与部署到服务器。
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size={32}
                onClick={() => {
                  onOpenChange(false);
                  onOpenGenerator?.();
                }}
                className="flex items-center gap-1 text-purple-600 border-purple-300 font-bold cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                在线生成器
              </Button>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)]">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {copyNotice && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 dark:border-emerald-800 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {copyNotice}
            </div>
          )}

          <div className="mb-4 rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3.5 space-y-2">
            <div className="text-xs font-extrabold text-[var(--app-text)]">生成新密钥对</div>
            <div className="grid grid-cols-[130px_minmax(0,1fr)_90px] gap-2 items-center">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="h-8.5 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2 text-xs font-bold text-[var(--app-text)]"
              >
                <option value="ed25519">Ed25519 (推荐)</option>
                <option value="rsa">RSA 4096</option>
              </select>
              <Input
                placeholder="密钥别名 (例: prod-deploy-key)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8.5 text-xs"
              />
              <Button size={32} onClick={handleCreate} className="rounded-lg h-8.5 text-xs font-bold">
                生成密钥
              </Button>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
            {keys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--app-line)] p-6 text-center text-xs font-bold text-[var(--app-muted)]">
                暂无密钥对，点击上方生成您的第一个 SSH 密钥。
              </div>
            ) : (
              keys.map((key) => (
                <div key={key.id} className="rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 text-[10px] font-mono font-extrabold text-indigo-600 dark:text-indigo-400 uppercase">
                        {key.type}
                      </span>
                      <span className="text-xs font-extrabold text-[var(--app-text)]">{key.name}</span>
                      <span className="text-[10px] font-medium text-[var(--app-muted)]">({key.createdAt})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        title="复制公钥"
                        onClick={() => handleCopyPub(key)}
                        className="flex h-7 px-2 items-center gap-1 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] text-[11px] font-bold text-[var(--app-text)] hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        复制公钥
                      </button>
                      <button
                        title="下载私钥 (.pem)"
                        onClick={() => handleDownloadPem(key)}
                        className="flex h-7 px-2 items-center gap-1 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] text-[11px] font-bold text-[var(--app-text)] hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        私钥
                      </button>
                      <button
                        title="删除密钥"
                        onClick={() => onDeleteKey(key.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-[var(--app-muted)] truncate bg-[var(--app-bg)] p-1.5 rounded-md border border-[var(--app-line)]">
                    {key.fingerprint}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="outline">关闭</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
