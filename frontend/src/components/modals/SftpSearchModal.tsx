import React, { useState } from "react";
import { Search, X, FileText, Folder, RefreshCw, Filter, ArrowRight } from "lucide-react";

export interface SearchResultItem {
  path: string;
  name: string;
  isDirectory: boolean;
  lineNumber?: number;
  snippet?: string;
}

interface SftpSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRemotePath: string;
  onSearch: (keyword: string, mode: "name" | "content", searchPath: string) => Promise<SearchResultItem[]>;
  onSelectResult: (filePath: string, fileName: string, lineNumber?: number) => void;
}

export const SftpSearchModal: React.FC<SftpSearchModalProps> = ({
  isOpen,
  onClose,
  currentRemotePath,
  onSearch,
  onSelectResult
}) => {
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "content">("name");
  const [searchPath, setSearchPath] = useState(currentRemotePath);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  const handleExecuteSearch = async () => {
    if (!keyword.trim() || isSearching) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const items = await onSearch(keyword.trim(), searchMode, searchPath);
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecuteSearch();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5 select-none">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Search className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">SFTP 远程深度搜索与文本 Grep</h3>
              <p className="text-[11px] text-zinc-500 font-mono">按文件名搜索或在远程文件中全局 Grep 文本内容</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/40 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800 shrink-0 select-none">
              <button
                onClick={() => setSearchMode("name")}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  searchMode === "name"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                按文件名匹配 (Find)
              </button>
              <button
                onClick={() => setSearchMode("content")}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  searchMode === "content"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                按文件内容 Grep
              </button>
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchMode === "name" ? "输入文件名或匹配表达式 (如 *.conf / app.log)..." : "输入要检索的文本关键字 (如 DATABASE_URL)..."}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 py-2 pl-9 pr-4 text-xs text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>

            <button
              onClick={handleExecuteSearch}
              disabled={isSearching || !keyword.trim()}
              className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold transition-all cursor-pointer ${
                isSearching || !keyword.trim()
                  ? "bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25"
              }`}
            >
              {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : "检索"}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <Filter className="h-3.5 w-3.5 text-zinc-500" />
            <span>搜索起始路径:</span>
            <input
              type="text"
              value={searchPath}
              onChange={(e) => setSearchPath(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300 font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
          {isSearching ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-500 py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
              <span>正在从远程服务器检索文件...</span>
            </div>
          ) : hasSearched && results.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center text-zinc-500 py-12">
              <span>未找到与 "{keyword}" 匹配的结果</span>
            </div>
          ) : (
            results.map((res, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectResult(res.path, res.name, res.lineNumber);
                  onClose();
                }}
                className="group flex flex-col gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 hover:border-blue-500/50 hover:bg-blue-950/20 transition-all cursor-pointer select-none"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {res.isDirectory ? (
                      <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                    <span className="font-bold text-zinc-200 group-hover:text-blue-400 transition-colors truncate">
                      {res.name}
                    </span>
                    {res.lineNumber && (
                      <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                        第 {res.lineNumber} 行
                      </span>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all shrink-0" />
                </div>
                <div className="text-[11px] text-zinc-500 truncate">{res.path}</div>
                {res.snippet && (
                  <div className="mt-1 rounded bg-zinc-950 p-2 text-[11px] text-zinc-300 border border-zinc-800/60 whitespace-pre truncate">
                    {res.snippet}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Status */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-6 py-2 text-[11px] text-zinc-500 font-mono select-none">
          <span>共找到 {results.length} 条结果</span>
          <span>双击条目可直接在线打开或跳转</span>
        </div>
      </div>
    </div>
  );
};
