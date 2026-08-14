import React, { useState, useMemo } from "react";
import {
  Clipboard,
  X,
  Search,
  Copy,
  Check,
  Send,
  Terminal,
  Clock,
  Sparkles,
  BookOpen,
  FolderCode,
  Tag,
  Trash2
} from "lucide-react";

export interface SnippetItem {
  title: string;
  category: "Linux" | "Docker" | "ADB" | "Git" | "Nginx" | "K8s";
  command: string;
  desc?: string;
}

const DEFAULT_SNIPPETS: SnippetItem[] = [
  { title: "查看系统端口占用", category: "Linux", command: "netstat -tuln | grep -E 'LISTEN|LISTEN'", desc: "查看当前所有监听中的 TCP/UDP 端口" },
  { title: "查看磁盘空间占用", category: "Linux", command: "df -hT | grep -v tmpfs", desc: "以可读格式查看各挂载点磁盘容量" },
  { title: "查找大文件 (Top 10)", category: "Linux", command: "find / -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | awk '{ print $5, $9 }' | sort -hr | head -n 10", desc: "搜索大于 100MB 的大文件" },
  { title: "实时性能监控 (htop/top)", category: "Linux", command: "top -b -n 1 | head -n 20", desc: "单次抓取前 20 项 CPU 进程" },
  { title: "查看 Docker 容器实时资源", category: "Docker", command: "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}'", desc: "以表格形式查看容器 CPU、内存、网络 IO" },
  { title: "清理 Docker 悬空镜像与缓存", category: "Docker", command: "docker system prune -f", desc: "安全清除未使用的容器、网络与悬空镜像" },
  { title: "查看最新容器日志", category: "Docker", command: "docker logs --tail 100 -f <container_name>", desc: "实时跟踪容器最后 100 行日志" },
  { title: "查看 ADB 设备前台应用 Package", category: "ADB", command: "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", desc: "获取当前活动 Activity 与包名" },
  { title: "查看 Android 内存占用 (dumpsys)", category: "ADB", command: "dumpsys meminfo <package_name>", desc: "诊断特定应用的内存与 PSS 分布" },
  { title: "抓取 Android 崩溃与报错日志", category: "ADB", command: "logcat -d *:E > /sdcard/crash.log && ls -lh /sdcard/crash.log", desc: "抓取系统 Error 级别日志并保存" },
  { title: "Git 最近提交日志单行美化", category: "Git", command: "git log --oneline --graph --decorate -n 10", desc: "以分支树和单行展示最近 10 次提交" },
  { title: "Git 清理未跟踪文件与强制刷新", category: "Git", command: "git clean -fd && git reset --hard HEAD", desc: "重置所有未提交的修改并清理新文件" },
  { title: "Nginx 测试配置文件并重载", category: "Nginx", command: "nginx -t && nginx -s reload", desc: "语法测试通过后平滑无缝重载 Nginx" }
];

interface ClipboardSnippetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recentCommands?: string[];
  onInsertCommand?: (cmd: string, executeImmediately?: boolean) => void;
}

export const ClipboardSnippetDrawer: React.FC<ClipboardSnippetDrawerProps> = ({
  isOpen,
  onClose,
  recentCommands = [],
  onInsertCommand
}) => {
  const [activeTab, setActiveTab] = useState<"snippets" | "history">("snippets");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const categories = useMemo(() => {
    return ["All", "Linux", "Docker", "ADB", "Git", "Nginx"];
  }, []);

  const filteredSnippets = useMemo(() => {
    return DEFAULT_SNIPPETS.filter((item) => {
      const matchCat = selectedCategory === "All" || item.category === selectedCategory;
      const matchSearch =
        !search.trim() ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.command.toLowerCase().includes(search.toLowerCase()) ||
        (item.desc && item.desc.toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [selectedCategory, search]);

  const filteredHistory = useMemo(() => {
    if (!search.trim()) return recentCommands;
    return recentCommands.filter((cmd) => cmd.toLowerCase().includes(search.toLowerCase()));
  }, [recentCommands, search]);

  if (!isOpen) return null;

  function copyToClip(text: string, id: string) {
    try {
      void navigator.clipboard.writeText(text);
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fade-in select-none">
      <div className="flex h-full w-full max-w-md flex-col border-l border-[var(--app-line)] bg-[var(--raised-bg)] text-[var(--app-text)] shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-line)] bg-[var(--sidebar-bg)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Clipboard className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-xs text-[var(--app-text)]">终端代码片段 & 历史抽屉</h3>
                <span className="rounded-full bg-purple-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-purple-400">
                  Ctrl+Shift+V
                </span>
              </div>
              <p className="text-[10px] text-[var(--app-muted)]">常用高频运维命令与最近执行历史</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--app-line)] bg-[var(--fill-1)] p-1.5 text-[var(--app-muted)] hover:bg-[var(--fill-2)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="p-3.5 space-y-2.5 border-b border-[var(--app-line)] bg-[var(--fill-1)]/40">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--app-bg)] border border-[var(--app-line)]">
            <button
              onClick={() => setActiveTab("snippets")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "snippets"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-[var(--app-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>经典运维片段 ({DEFAULT_SNIPPETS.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-[var(--app-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>终端历史 ({recentCommands.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--app-muted)]" />
            <input
              type="text"
              placeholder={activeTab === "snippets" ? "搜索命令、标题或用途..." : "搜索最近执行过的命令..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8.5 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] pl-9 pr-3 text-xs font-medium text-[var(--app-text)] focus:border-purple-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Category Chips (Only for snippets) */}
          {activeTab === "snippets" && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-0.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer shrink-0 ${
                    selectedCategory === cat
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs"
                      : "bg-[var(--app-bg)] text-[var(--app-muted)] border-[var(--app-line)] hover:text-[var(--app-text)]"
                  }`}
                >
                  {cat === "All" ? "全部分类" : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scrollbar-thin">
          {activeTab === "snippets" ? (
            filteredSnippets.length > 0 ? (
              filteredSnippets.map((item, idx) => {
                const key = `snip-${idx}`;
                const isCopied = copiedIndex === key;

                return (
                  <div
                    key={idx}
                    className="group relative rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:border-purple-500/50 hover:bg-[var(--fill-2)] p-3 space-y-2 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-[var(--app-text)] flex items-center gap-1.5">
                        <FolderCode className="h-3.5 w-3.5 text-purple-400" />
                        <span>{item.title}</span>
                      </span>
                      <span className="text-[9px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.2 rounded">
                        {item.category}
                      </span>
                    </div>

                    {item.desc && (
                      <p className="text-[11px] text-[var(--app-muted)] line-clamp-2">{item.desc}</p>
                    )}

                    <div className="rounded-lg bg-zinc-950/80 p-2 font-mono text-[11px] text-emerald-400 break-all select-text border border-zinc-800/80">
                      {item.command}
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => copyToClip(item.command, key)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--fill-2)] hover:bg-[var(--fill-3)] text-[var(--app-text)] font-bold text-[10px] transition-colors border border-[var(--app-line)] cursor-pointer"
                        title="复制命令至剪贴板"
                      >
                        {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{isCopied ? "已复制" : "复制"}</span>
                      </button>

                      {onInsertCommand && (
                        <button
                          onClick={() => {
                            onInsertCommand(item.command, false);
                            onClose();
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] transition-colors shadow-xs cursor-pointer"
                          title="填入当前终端"
                        >
                          <Send className="h-3 w-3" />
                          <span>填入终端</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-xs text-[var(--app-muted)]">
                没有找到匹配的代码片段
              </div>
            )
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((cmd, idx) => {
              const key = `hist-${idx}`;
              const isCopied = copiedIndex === key;

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:border-purple-500/40 p-2.5 space-y-1.5 transition-all"
                >
                  <div className="flex items-center justify-between text-[10px] text-[var(--app-muted)]">
                    <span className="flex items-center gap-1 font-mono">
                      <Terminal className="h-3 w-3 text-sky-400" />
                      <span>#{filteredHistory.length - idx}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyToClip(cmd, key)}
                        className="px-1.5 py-0.5 rounded bg-[var(--fill-2)] hover:text-white text-[10px] font-bold cursor-pointer"
                        title="复制"
                      >
                        {isCopied ? "✓ 已复制" : "复制"}
                      </button>
                      {onInsertCommand && (
                        <button
                          onClick={() => {
                            onInsertCommand(cmd, true);
                            onClose();
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                          title="在当前终端直接执行"
                        >
                          回车执行
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-950/80 p-2 font-mono text-[11px] text-zinc-200 break-all select-text border border-zinc-800/80">
                    {cmd}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-[var(--app-muted)]">
              暂无终端历史记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
