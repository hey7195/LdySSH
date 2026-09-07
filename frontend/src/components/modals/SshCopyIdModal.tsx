import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { KeyRound, X } from "lucide-react";
import { Button } from "../ui";
import type { SshKeyPair } from "./SshKeyManagerModal";

export function SshCopyIdModal({
  target,
  keys,
  activeSession,
  onClose,
  onSuccess,
  onSendTerminalInput
}: {
  target: { name?: string; hostname?: string; username?: string } | null;
  keys: SshKeyPair[];
  activeSession?: { id: string; connected?: boolean };
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onSendTerminalInput?: (sessionId: string, input: string) => void;
}) {
  const [selectedKeyId, setSelectedKeyId] = useState(keys[0]?.id || "");
  const [customPubKey, setCustomPubKey] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");

  const selectedKey = keys.find((k) => k.id === selectedKeyId);
  const pubKeyToDeploy = selectedKey ? selectedKey.publicKey : customPubKey.trim();

  async function handleDeploy() {
    if (!pubKeyToDeploy) {
      setDeployError("请选择或粘贴要部署的公钥内容。");
      return;
    }

    setDeploying(true);
    setDeployError("");

    const remoteCmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${pubKeyToDeploy.replace(/'/g, "'\\''")}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys\n`;

    try {
      if (activeSession && activeSession.connected) {
        onSendTerminalInput?.(activeSession.id, remoteCmd);
        onSuccess(`✅ 已成功向 [${target?.name || target?.hostname || "服务器"}] 部署公钥！现已支持免密登录。`);
        onClose();
      } else {
        setDeployError("部署公钥需要目标服务器处于 SSH 已连接状态。请先发起连接后再试。");
      }
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : "部署发生错误。");
    } finally {
      setDeploying(false);
    }
  }

  if (!target) return null;

  return (
    <Dialog.Root open={Boolean(target)} onOpenChange={() => onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)] z-50 border border-[var(--app-line)] select-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--app-text)] flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-emerald-600" />
                一键部署公钥至服务器
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[var(--app-muted)]">
                目标服务器: <span className="font-mono font-bold text-indigo-600">{target.username || "root"}@{target.hostname}</span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)]">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-extrabold text-[var(--app-text)] mb-1 block">选择要部署的公钥</label>
              {keys.length > 0 ? (
                <select
                  value={selectedKeyId}
                  onChange={(e) => setSelectedKeyId(e.target.value)}
                  className="h-9 w-full rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] px-3 text-xs font-bold text-[var(--app-text)]"
                >
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.type.toUpperCase()}) - {k.createdAt}
                    </option>
                  ))}
                  <option value="">自定义粘贴公钥...</option>
                </select>
              ) : (
                <textarea
                  placeholder="粘贴公钥字符串 (以 ssh-rsa / ssh-ed25519 开头)..."
                  value={customPubKey}
                  onChange={(e) => setCustomPubKey(e.target.value)}
                  className="h-20 w-full rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-2.5 font-mono text-xs text-[var(--app-text)]"
                />
              )}
            </div>

            {pubKeyToDeploy && (
              <div className="rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-2.5 font-mono text-[11px] text-[var(--app-muted)] break-all max-h-20 overflow-y-auto">
                {pubKeyToDeploy}
              </div>
            )}

            {deployError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/60 dark:border-rose-800 p-2.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                {deployError}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleDeploy} disabled={deploying}>
              {deploying ? "正在部署..." : "一键部署公钥"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
