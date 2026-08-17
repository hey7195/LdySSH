import React, { useState } from "react";
import { Globe2, Server, HardDrive, CheckCircle2, RefreshCw, Plus, X } from "lucide-react";
import { Button, Input } from "../ui";

export interface WebFavorite {
  id: string;
  title: string;
  url: string;
  category?: string;
  icon?: string;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--app-line)] p-12 text-center">
      <Globe2 className="h-10 w-10 text-[var(--app-muted)] mb-3" />
      <h3 className="text-sm font-extrabold text-[var(--app-text)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--app-muted)] max-w-sm">{description}</p>
    </div>
  );
}

export function BrowserPanel({
  favorites,
  onRefresh,
  onAdd,
  onDelete,
  onOpen
}: {
  favorites: WebFavorite[];
  onRefresh: () => void;
  onAdd: (title: string, url: string) => void;
  onDelete: (favorite: WebFavorite) => void;
  onOpen: (favorite: WebFavorite) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  function submit() {
    const nextTitle = title.trim();
    const nextUrl = url.trim();
    if (!nextTitle || !nextUrl) return;
    onAdd(nextTitle, nextUrl);
    setTitle("");
    setUrl("");
  }

  const recommendedPortals = [
    { title: "路由器后台管理", url: "http://192.168.1.1", icon: Globe2, category: "网关管理" },
    { title: "Portainer 容器工作台", url: "http://localhost:9000", icon: Server, category: "Docker 运维" },
    { title: "Nginx Proxy Manager", url: "http://localhost:81", icon: HardDrive, category: "反向代理" },
    { title: "Jellyfin 媒体服务器", url: "http://localhost:8096", icon: CheckCircle2, category: "影音娱服务" }
  ];

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg)] px-10 py-7">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--app-text)]">网页服务工作台</h1>
              <span className="rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-3 py-0.5 font-mono text-xs font-extrabold">
                {favorites.length} 个书签
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--text-secondary)]">保存常用 Web 运维管理入口，点击卡片后即刻在默认浏览器中响应。</p>
          </div>
          <Button variant="outline" size={32} className="rounded-full w-10 h-10 px-0 shadow-2xs cursor-pointer" onClick={onRefresh} title="刷新卡片">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* 添加网页书签卡片 */}
        <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
          <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-3.5 flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" />
            添加自定义 Web 书签
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)_120px] gap-3">
            <Input
              className="h-10 text-xs rounded-full shadow-2xs"
              placeholder="书签标签 (如: Proxmox VE)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
            <Input
              className="h-10 text-xs rounded-full shadow-2xs"
              placeholder="https://192.168.1.100:8006"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
            <Button
              size={32}
              className="rounded-full px-5 h-10 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 cursor-pointer"
              onClick={submit}
            >
              + 添加网页
            </Button>
          </div>
        </div>

        {/* 已存网页书签卡片网格 */}
        <div className="space-y-4">
          <h2 className="text-base font-extrabold text-[var(--app-text)]">保存的网页卡片 (Web Shortcuts)</h2>
          {favorites.length === 0 ? (
            <EmptyState title="暂无网页卡片" description="在上方输入书签名称与 URL 地址，即可快速创建 Web 运维快捷入口。" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {favorites.map((favorite) => (
                <div
                  key={favorite.id}
                  className="group flex flex-col justify-between rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5.5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-blue-500/30"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-100 dark:border-blue-900/60 shadow-xs">
                          <Globe2 className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-extrabold text-[var(--app-text)] tracking-tight">
                            {favorite.title}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                            {favorite.url}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-[var(--app-line)]/60 pt-3.5">
                    <button
                      aria-label={`删除 ${favorite.title}`}
                      title="删除书签"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-muted)] transition-all hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer"
                      onClick={() => onDelete(favorite)}
                    >
                      <X className="h-4 w-4" />
                    </button>

                    <Button
                      size={32}
                      aria-label={`打开 ${favorite.title}`}
                      className="rounded-full px-5 h-9 font-extrabold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 cursor-pointer"
                      onClick={() => onOpen(favorite)}
                    >
                      外部浏览器打开 ↗
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 预设常用运维 Portal 服务推荐 */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[var(--app-text)]">常用运维 Portal 推荐模板</h2>
            <span className="text-xs font-semibold text-[var(--app-muted)]">点击一键添加到书签</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommendedPortals.map((portal, idx) => {
              const Icon = portal.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => onAdd(portal.title, portal.url)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-100 dark:border-purple-900/60">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold text-[var(--app-text)]">{portal.title}</div>
                      <div className="truncate font-mono text-[10px] text-[var(--app-muted)]">{portal.url}</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-[var(--fill-2)] text-[var(--app-muted)] group-hover:bg-emerald-600 group-hover:text-white px-2 py-1 text-[10px] font-extrabold transition-colors">
                    + 添加
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
