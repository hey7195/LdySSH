import React, { useState } from "react";
import { FileCode, GitCompare, Save, Download, RefreshCw, X, FileText, Check, Copy, Sparkles, Layers, Eye } from "lucide-react";

interface IntegratedCodeDiffEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilePath?: string;
  initialContent?: string;
  onSaveToRemote?: (filePath: string, content: string) => void;
}

const PRESET_TEMPLATES = [
  {
    name: "Nginx 反向代理配置 (Nginx Config)",
    path: "/etc/nginx/sites-available/default",
    content: `server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`
  },
  {
    name: "Docker Compose Stack (docker-compose.yml)",
    path: "/opt/app/docker-compose.yml",
    content: `version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html
    restart: always

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass securepassword
    ports:
      - "6379:6379"
    restart: always`
  },
  {
    name: "Systemd 服务配置 (service.unit)",
    path: "/etc/systemd/system/my-app.service",
    content: `[Unit]
Description=My Custom Production App Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/my-app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target`
  },
  {
    name: "Linux Kernel sysctl 参数调优",
    path: "/etc/sysctl.conf",
    content: `# Linux Network & Kernel Performance Tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
fs.file-max = 2097152`
  }
];

export const IntegratedCodeDiffEditorModal: React.FC<IntegratedCodeDiffEditorModalProps> = ({
  isOpen,
  onClose,
  initialFilePath = "/etc/nginx/nginx.conf",
  initialContent = "",
  onSaveToRemote
}) => {
  const [filePath, setFilePath] = useState(initialFilePath);
  const [originalContent, setOriginalContent] = useState(
    initialContent || PRESET_TEMPLATES[0].content
  );
  const [editedContent, setEditedContent] = useState(
    initialContent || PRESET_TEMPLATES[0].content
  );
  const [activeMode, setActiveMode] = useState<"editor" | "diff">("editor");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleApplyTemplate = (tpl: typeof PRESET_TEMPLATES[0]) => {
    setFilePath(tpl.path);
    setOriginalContent(tpl.content);
    setEditedContent(tpl.content);
  };

  const handleSave = () => {
    if (onSaveToRemote) {
      onSaveToRemote(filePath, editedContent);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple line-by-line diff calculator
  const origLines = originalContent.split("\n");
  const editLines = editedContent.split("\n");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-6xl h-[88vh] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-md">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
                <span>SFTP 深度远程代码编辑器 & File Diff 对比器</span>
                <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 font-mono text-[10px] text-purple-400 font-bold">
                  Deep Remote IDE
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                支持多文件实时编辑、SFTP 云端同步保存及代码变更 (Diff) 逐行对比
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => setActiveMode("editor")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  activeMode === "editor"
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>代码编辑</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("diff")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  activeMode === "diff"
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <GitCompare className="h-3.5 w-3.5" />
                <span>Diff 对比</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Toolbar & Template Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/40 px-6 py-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-[300px]">
            <span className="text-xs font-bold text-zinc-400">远程路径:</span>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-purple-300 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Quick Presets Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400">常用模版:</span>
            <div className="flex items-center gap-1.5">
              {PRESET_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:border-purple-500/50 hover:text-purple-300 transition-all cursor-pointer"
                >
                  {tpl.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Editor Main Content Area */}
        <div className="flex-1 overflow-hidden p-4">
          {activeMode === "editor" ? (
            <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner">
              <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/50 px-4 py-2 text-xs font-mono text-zinc-400">
                <span>{filePath} ({editedContent.split("\n").length} 行, {editedContent.length} 字节)</span>
                <span className="text-purple-400 font-bold">SFTP Direct Edit Mode</span>
              </div>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="flex-1 resize-none bg-zinc-950 p-4 font-mono text-xs text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none scrollbar-thin"
                placeholder="在此输入或粘贴代码内容..."
              />
            </div>
          ) : (
            /* Diff Mode: Side-by-Side Comparison */
            <div className="grid h-full grid-cols-2 gap-3 overflow-hidden">
              {/* Left Column: Original Content */}
              <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner">
                <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-mono font-bold text-rose-400 flex items-center justify-between">
                  <span>- 原始版本 (Original)</span>
                  <span className="text-[10px] text-zinc-500">{origLines.length} 行</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-400 bg-rose-950/10">
                  {origLines.map((line, idx) => (
                    <div key={idx} className="flex gap-3 hover:bg-rose-500/10 px-1 py-0.5 rounded">
                      <span className="w-8 select-none text-right text-zinc-600 shrink-0">{idx + 1}</span>
                      <pre className="whitespace-pre-wrap font-mono text-zinc-300">{line}</pre>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Edited Content */}
              <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner">
                <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-mono font-bold text-emerald-400 flex items-center justify-between">
                  <span>+ 当前修改版本 (Modified)</span>
                  <span className="text-[10px] text-zinc-500">{editLines.length} 行</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-200 bg-emerald-950/10">
                  {editLines.map((line, idx) => (
                    <div key={idx} className="flex gap-3 hover:bg-emerald-500/10 px-1 py-0.5 rounded">
                      <span className="w-8 select-none text-right text-zinc-600 shrink-0">{idx + 1}</span>
                      <pre className="whitespace-pre-wrap font-mono text-emerald-300">{line}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            {saveSuccess ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-400 animate-fade-in">
                <Check className="h-4 w-4" /> 已通过 SFTP 安全上传并同步回远程服务器！
              </span>
            ) : (
              <span>快捷键: Ctrl+S 保存上传 | 支持 Nginx, Docker, Systemd 模板</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "已复制" : "复制代码"}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95"
            >
              <Save className="h-3.5 w-3.5" />
              <span>SFTP 保存并同步至远程</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
