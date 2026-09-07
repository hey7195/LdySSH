import React, { useState } from "react";
import { Sliders, X, Plus, Trash2, Check, Sparkles } from "lucide-react";

export interface ConnectionPreset {
  id: string;
  name: string;
  port: number;
  username: string;
  keyId?: string;
  defaultRemotePath?: string;
}

interface ConnectionPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: ConnectionPreset[];
  onSavePreset: (preset: ConnectionPreset) => void;
  onDeletePreset: (id: string) => void;
  onApplyPreset: (preset: ConnectionPreset) => void;
}

export const ConnectionPresetModal: React.FC<ConnectionPresetModalProps> = ({
  isOpen,
  onClose,
  presets,
  onSavePreset,
  onDeletePreset,
  onApplyPreset
}) => {
  const [editingPreset, setEditingPreset] = useState<Partial<ConnectionPreset>>({
    name: "",
    port: 22,
    username: "root",
    defaultRemotePath: "/"
  });

  if (!isOpen) return null;

  const handleSave = () => {
    if (!editingPreset.name?.trim()) return;
    const newPreset: ConnectionPreset = {
      id: editingPreset.id || `preset_${Date.now()}`,
      name: editingPreset.name.trim(),
      port: Number(editingPreset.port) || 22,
      username: editingPreset.username?.trim() || "root",
      keyId: editingPreset.keyId,
      defaultRemotePath: editingPreset.defaultRemotePath?.trim() || "/"
    };
    onSavePreset(newPreset);
    setEditingPreset({ name: "", port: 22, username: "root", defaultRemotePath: "/" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[75vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5 select-none">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Sliders className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">SSH 主机连接预设模板管理</h3>
              <p className="text-[11px] text-zinc-500 font-mono">配置常用服务器参数预设，新建主机连接时一键快捷应用</p>
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
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto flex-1">
          {/* Preset Form */}
          <div className="space-y-4 border-r border-zinc-800/80 pr-6">
            <h4 className="font-bold text-xs text-zinc-300 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              {editingPreset.id ? "修改预设模板" : "新建预设模板"}
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-semibold">预设模板名称</label>
                <input
                  type="text"
                  value={editingPreset.name || ""}
                  onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })}
                  placeholder="如: CentOS 运维集群 / Ubuntu 开发节点..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">默认 SSH 端口</label>
                  <input
                    type="number"
                    value={editingPreset.port || 22}
                    onChange={(e) => setEditingPreset({ ...editingPreset, port: Number(e.target.value) })}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">默认用户名</label>
                  <input
                    type="text"
                    value={editingPreset.username || ""}
                    onChange={(e) => setEditingPreset({ ...editingPreset, username: e.target.value })}
                    placeholder="root"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-semibold">默认 SFTP 初始路径</label>
                <input
                  type="text"
                  value={editingPreset.defaultRemotePath || ""}
                  onChange={(e) => setEditingPreset({ ...editingPreset, defaultRemotePath: e.target.value })}
                  placeholder="/var/www 或 /root"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-purple-500 focus:outline-none font-mono"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={!editingPreset.name?.trim()}
                className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                  editingPreset.name?.trim()
                    ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25"
                    : "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
                }`}
              >
                <Plus className="h-4 w-4" />
                保存模板预设
              </button>
            </div>
          </div>

          {/* Presets List */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs text-zinc-300">已保存的预设模板列表 ({presets.length})</h4>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {presets.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500 font-mono">暂无预设模板，可新建保存常用的 SSH 配置</div>
              ) : (
                presets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-200 truncate">{p.name}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {p.username}@{p.port} (路径: {p.defaultRemotePath || "/"})
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          onApplyPreset(p);
                          onClose();
                        }}
                        className="rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white px-2.5 py-1 text-xs font-bold border border-purple-500/30 transition-all cursor-pointer"
                      >
                        应用
                      </button>
                      <button
                        onClick={() => onDeletePreset(p.id)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
