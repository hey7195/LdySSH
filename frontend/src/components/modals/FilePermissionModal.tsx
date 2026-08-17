import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Settings, X } from "lucide-react";
import { Button, Input } from "../ui";

export function FilePermissionModal({
  file,
  activeSessionId,
  onClose,
  onSuccess,
  onSendTerminalInput
}: {
  file: { name: string; path: string; isDirectory: boolean } | null;
  activeSessionId?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onSendTerminalInput?: (sessionId: string, input: string) => void;
}) {
  const [perms, setPerms] = useState({
    owner: { read: true, write: true, execute: false },
    group: { read: true, write: false, execute: false },
    others: { read: true, write: false, execute: false }
  });
  const [ownerName, setOwnerName] = useState("root");
  const [groupName, setGroupName] = useState("root");
  const [octalCode, setOctalCode] = useState("644");

  useEffect(() => {
    if (file) {
      if (file.isDirectory) {
        setPerms({
          owner: { read: true, write: true, execute: true },
          group: { read: true, write: false, execute: true },
          others: { read: true, write: false, execute: true }
        });
        setOctalCode("755");
      } else {
        setPerms({
          owner: { read: true, write: true, execute: false },
          group: { read: true, write: false, execute: false },
          others: { read: true, write: false, execute: false }
        });
        setOctalCode("644");
      }
    }
  }, [file]);

  function calcOctal(p: typeof perms) {
    const o = (p.owner.read ? 4 : 0) + (p.owner.write ? 2 : 0) + (p.owner.execute ? 1 : 0);
    const g = (p.group.read ? 4 : 0) + (p.group.write ? 2 : 0) + (p.group.execute ? 1 : 0);
    const ot = (p.others.read ? 4 : 0) + (p.others.write ? 2 : 0) + (p.others.execute ? 1 : 0);
    return `${o}${g}${ot}`;
  }

  function updatePerm(section: "owner" | "group" | "others", key: "read" | "write" | "execute", val: boolean) {
    const next = { ...perms, [section]: { ...perms[section], [key]: val } };
    setPerms(next);
    setOctalCode(calcOctal(next));
  }

  async function handleApply() {
    if (!file || !activeSessionId) return;
    const cmd = `chmod ${octalCode} "${file.path}" && chown ${ownerName}:${groupName} "${file.path}"\n`;
    try {
      onSendTerminalInput?.(activeSessionId, cmd);
      onSuccess(`✅ 已将权限 ${octalCode} (${ownerName}:${groupName}) 应用至 ${file.name}`);
      onClose();
    } catch {
      onClose();
    }
  }

  if (!file) return null;

  return (
    <Dialog.Root open={Boolean(file)} onOpenChange={() => onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)] z-50 border border-[var(--app-line)] select-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--app-text)] flex items-center gap-2">
                <Settings className="h-5 w-5 text-indigo-600" />
                修改文件权限与所有者 (Chmod)
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[var(--app-muted)] truncate max-w-[380px]">
                目标: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{file.name}</span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)]">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3.5">
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-extrabold text-[var(--app-text)] pb-2 border-b border-[var(--app-line)]">
                <div>身份</div>
                <div>读 (r=4)</div>
                <div>写 (w=2)</div>
                <div>执行 (x=1)</div>
              </div>

              {[
                { key: "owner" as const, label: "所有者 (User)" },
                { key: "group" as const, label: "用户组 (Group)" },
                { key: "others" as const, label: "其他 (Others)" }
              ].map(({ key, label }) => (
                <div key={key} className="grid grid-cols-4 gap-2 items-center text-center py-2 border-b border-[var(--app-line)] last:border-0 text-xs font-bold">
                  <div className="text-left text-[var(--app-muted)]">{label}</div>
                  <div>
                    <input type="checkbox" checked={perms[key].read} onChange={(e) => updatePerm(key, "read", e.target.checked)} className="accent-indigo-600 cursor-pointer" />
                  </div>
                  <div>
                    <input type="checkbox" checked={perms[key].write} onChange={(e) => updatePerm(key, "write", e.target.checked)} className="accent-indigo-600 cursor-pointer" />
                  </div>
                  <div>
                    <input type="checkbox" checked={perms[key].execute} onChange={(e) => updatePerm(key, "execute", e.target.checked)} className="accent-indigo-600 cursor-pointer" />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-extrabold text-[var(--app-muted)] mb-1 block">八进制数</label>
                <Input value={octalCode} readOnly className="h-8.5 font-mono text-center font-extrabold text-indigo-600" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-[var(--app-muted)] mb-1 block">所有者 (chown)</label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="h-8.5 font-mono text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-[var(--app-muted)] mb-1 block">所属组 (group)</label>
                <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="h-8.5 font-mono text-xs" />
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleApply}>应用权限</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
