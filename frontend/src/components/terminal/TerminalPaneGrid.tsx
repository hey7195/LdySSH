import React from "react";
import { Columns, Rows, X, Maximize2, Terminal as TerminalIcon } from "lucide-react";

export interface TerminalPane {
  id: string;
  title: string;
  sessionId: string;
}

interface TerminalPaneGridProps {
  panes: TerminalPane[];
  activePaneId: string;
  onSelectPane: (paneId: string) => void;
  onSplitHorizontal: (paneId: string) => void;
  onSplitVertical: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  renderTerminal: (pane: TerminalPane, isActive: boolean) => React.ReactNode;
}

export const TerminalPaneGrid: React.FC<TerminalPaneGridProps> = ({
  panes,
  activePaneId,
  onSelectPane,
  onSplitHorizontal,
  onSplitVertical,
  onClosePane,
  renderTerminal
}) => {
  if (panes.length === 0) return null;

  // Single pane layout
  if (panes.length === 1) {
    const pane = panes[0];
    return (
      <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
        {/* Pane Toolbar Header */}
        <div className="absolute right-3 top-2.5 z-20 flex items-center gap-1 rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-1 opacity-0 hover:opacity-100 transition-opacity backdrop-blur-xs select-none">
          <button
            onClick={() => onSplitHorizontal(pane.id)}
            title="左右垂直分屏 (Split Right)"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Columns className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onSplitVertical(pane.id)}
            title="上下水平分屏 (Split Down)"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Rows className="h-3.5 w-3.5" />
          </button>
        </div>

        {renderTerminal(pane, true)}
      </div>
    );
  }

  // Multi-pane layout grid (2, 3, or 4 panes)
  return (
    <div className={`grid h-full w-full gap-1 p-1 bg-zinc-950 ${panes.length <= 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"}`}>
      {panes.map((pane) => {
        const isActive = pane.id === activePaneId;

        return (
          <div
            key={pane.id}
            onClick={() => onSelectPane(pane.id)}
            className={`relative flex flex-col h-full min-h-0 min-w-0 overflow-hidden rounded-xl border transition-all ${
              isActive
                ? "border-blue-500/80 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30"
                : "border-zinc-800/80 hover:border-zinc-700 opacity-90"
            }`}
          >
            {/* Header Mini Status Bar */}
            <div className={`flex items-center justify-between border-b px-3 py-1 text-[11px] font-mono select-none ${
              isActive ? "border-blue-500/30 bg-blue-950/40 text-blue-300" : "border-zinc-800/60 bg-zinc-900/60 text-zinc-400"
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <TerminalIcon className="h-3 w-3 shrink-0 text-blue-400" />
                <span className="font-bold truncate">{pane.title}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSplitHorizontal(pane.id);
                  }}
                  title="左右分屏"
                  className="rounded p-0.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <Columns className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSplitVertical(pane.id);
                  }}
                  title="上下分屏"
                  className="rounded p-0.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <Rows className="h-3 w-3" />
                </button>
                {panes.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClosePane(pane.id);
                    }}
                    title="关闭此分屏"
                    className="rounded p-0.5 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Pane Terminal Container */}
            <div className="flex-1 min-h-0 min-w-0 relative">
              {renderTerminal(pane, isActive)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
