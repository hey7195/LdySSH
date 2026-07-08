import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Command,
  Cpu,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Home,
  KeyRound,
  Menu,
  MessageSquare,
  Minimize2,
  Monitor,
  Plus,
  Play,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
  X
} from "lucide-react";
import { Button, EmptyState, Input, Panel } from "./components/ui";
import { cn } from "./lib/utils";
import { nativeBridge, type ConnectParams, type NativeResult, type SavedConnection } from "./lib/bridge";

type Tool = "ssh" | "cmd" | "sftp" | "pf" | "monitor" | "local" | "ai";
type AiTool = "codex" | "hermes";

interface SessionTab {
  id: string;
  title: string;
  kind: "local" | "ssh";
  connected: boolean;
}

interface ConnectionForm {
  name: string;
  hostname: string;
  port: string;
  username: string;
  password: string;
  keyPath: string;
  save: boolean;
}

const tools: Array<{ id: Tool; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "ssh", label: "SSH", icon: Server },
  { id: "cmd", label: "CMD", icon: Command },
  { id: "sftp", label: "SFTP", icon: FolderOpen },
  { id: "pf", label: "PF", icon: Shield },
  { id: "monitor", label: "MON", icon: Monitor },
  { id: "local", label: "L-CMD", icon: Terminal },
  { id: "ai", label: "AI", icon: Bot }
];

const emptyForm: ConnectionForm = {
  name: "",
  hostname: "",
  port: "22",
  username: "",
  password: "",
  keyPath: "",
  save: true
};

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>("ssh");
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [form, setForm] = useState<ConnectionForm>(emptyForm);
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    void refreshConnections();
  }, []);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions]
  );

  const filteredConnections = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return savedConnections;
    return savedConnections.filter((connection) => {
      const label = [
        connection.name,
        connection.hostname,
        connection.username,
        connection.group
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return label.includes(keyword);
    });
  }, [query, savedConnections]);

  async function refreshConnections() {
    const result = await nativeBridge.getSavedConnections();
    const list = Array.isArray(result) ? result : Object.values(result);
    setSavedConnections(list);
  }

  async function openLocalSession() {
    const sessionId = await nativeBridge.createLocalSession();
    if (!sessionId) return;
    const tab: SessionTab = {
      id: sessionId,
      title: "Local CMD",
      kind: "local",
      connected: true
    };
    setSessions((current) => [...current, tab]);
    setActiveSessionId(sessionId);
    setActiveTool("local");
  }

  async function connectHost(connection?: SavedConnection) {
    setConnectError("");

    const params: ConnectParams = connection
      ? {
          name: connection.name,
          hostname: connection.hostname || "",
          port: Number(connection.port || 22),
          username: connection.username || "",
          password: (connection as SavedConnection & { password?: string }).password || "",
          keyPath: connection.keyPath || "",
          save: false
        }
      : {
          name: form.name || `${form.username}@${form.hostname}`,
          hostname: form.hostname,
          port: Number(form.port || 22),
          username: form.username,
          password: form.password,
          keyPath: form.keyPath,
          save: form.save
        };

    if (!params.hostname || !params.username) {
      setConnectError("主机地址和用户名不能为空。");
      return;
    }

    const sessionId = await nativeBridge.createSession();
    const result = await nativeBridge.connect(sessionId, params);
    if (!result.success) {
      setConnectError(result.error || "连接失败。");
      return;
    }

    const title = params.name || `${params.username}@${params.hostname}`;
    setSessions((current) => [...current, { id: sessionId, title, kind: "ssh", connected: true }]);
    setActiveSessionId(sessionId);
    setActiveTool("local");
    setConnectOpen(false);
    setForm(emptyForm);
    void refreshConnections();
  }

  function closeTab(sessionId: string) {
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    if (activeSessionId === sessionId) {
      const next = sessions.find((session) => session.id !== sessionId);
      setActiveSessionId(next?.id || "");
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-slate-950">
      <div className="grid h-full grid-cols-[54px_244px_minmax(0,1fr)] grid-rows-[36px_minmax(0,1fr)] border border-slate-200 bg-[#f6f8fb]">
        <TitleBar />
        <ActivityRail activeTool={activeTool} onChange={setActiveTool} />
        <HostSidebar
          savedConnections={filteredConnections}
          activeTool={activeTool}
          query={query}
          onQueryChange={setQuery}
          onOpenDialog={() => setConnectOpen(true)}
          onRefresh={refreshConnections}
          onConnect={connectHost}
          onCreateLocal={openLocalSession}
        />
        <main className="min-w-0 overflow-hidden">
          {activeTool === "ssh" && (
            <Workbench
              savedConnections={filteredConnections}
              query={query}
              onQueryChange={setQuery}
              onOpenDialog={() => setConnectOpen(true)}
              onRefresh={refreshConnections}
              onConnect={connectHost}
            />
          )}
          {activeTool === "cmd" && <CommandPanel />}
          {activeTool === "sftp" && <SftpPanel activeSession={activeSession} />}
          {activeTool === "pf" && <PortForwardPanel activeSession={activeSession} />}
          {activeTool === "monitor" && <MonitorPanel activeSession={activeSession} />}
          {activeTool === "local" && (
            <TerminalWorkspace
              sessions={sessions}
              activeSessionId={activeSessionId}
              onActivate={setActiveSessionId}
              onClose={closeTab}
              onCreateLocal={openLocalSession}
            />
          )}
          {activeTool === "ai" && <AiWorkspacePanel activeSession={activeSession} />}
        </main>
      </div>

      <ConnectDialog
        open={connectOpen}
        form={form}
        error={connectError}
        onOpenChange={setConnectOpen}
        onFormChange={setForm}
        onConnect={() => connectHost()}
      />
    </div>
  );
}

function TitleBar() {
  return (
    <header className="pywebview-drag-region col-span-3 grid grid-cols-[298px_minmax(0,1fr)_120px] border-b border-slate-200 bg-white">
      <div className="flex items-center px-5 text-sm font-semibold text-slate-950">LdySSH</div>
      <div className="flex items-center justify-center text-xs font-medium text-slate-400">SSH Workbench</div>
      <div className="no-drag flex items-center justify-end">
        <button
          className="flex h-9 w-10 items-center justify-center text-slate-500 hover:bg-slate-100"
          title="最小化"
          onClick={nativeBridge.minimize}
        >
          <Minimize2 className="h-4 w-4" />
        </button>
        <button
          className="flex h-9 w-10 items-center justify-center text-slate-500 hover:bg-slate-100"
          title="最大化"
          onClick={nativeBridge.maximize}
        >
          <Grid2X2 className="h-4 w-4" />
        </button>
        <button
          className="flex h-9 w-10 items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          title="关闭"
          onClick={nativeBridge.close}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function ActivityRail({ activeTool, onChange }: { activeTool: Tool; onChange: (tool: Tool) => void }) {
  return (
    <aside className="flex min-h-0 flex-col items-center border-r border-slate-200 bg-white py-3">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
        L
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              className={cn(
                "flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-semibold transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              )}
              title={tool.label}
              onClick={() => onChange(tool.id)}
            >
              <Icon className="h-4 w-4" />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="text-[10px] font-semibold text-slate-400">HL</div>
    </aside>
  );
}

function HostSidebar({
  savedConnections,
  activeTool,
  query,
  onQueryChange,
  onOpenDialog,
  onRefresh,
  onConnect,
  onCreateLocal
}: {
  savedConnections: SavedConnection[];
  activeTool: Tool;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenDialog: () => void;
  onRefresh: () => void;
  onConnect: (connection: SavedConnection) => void;
  onCreateLocal: () => void;
}) {
  return (
    <aside className="min-h-0 border-r border-slate-200 bg-[#eef2f7]">
      <div className="flex h-full flex-col">
        <div className="px-4 pb-4 pt-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-950">LdySSH</div>
              <div className="mt-1 text-xs text-slate-500">轻量 SSH 桌面工作台</div>
            </div>
            <Button variant="outline" className="h-8 w-8 px-0" onClick={onRefresh} title="刷新">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <Button className="w-full justify-start" onClick={onOpenDialog}>
            <Plus className="h-4 w-4" />
            新建连接
          </Button>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              value={query}
              placeholder="搜索主机"
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
        </div>

        <SidebarSection title="最近主机" count={savedConnections.length} open>
          {savedConnections.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white/60 px-3 py-5 text-center text-xs text-slate-500">
              暂无最近主机
            </div>
          ) : (
            <div className="space-y-1">
              {savedConnections.slice(0, 8).map((connection, index) => (
                <button
                  key={`${connection.hostname}-${connection.username}-${index}`}
                  className="w-full rounded-md px-3 py-2 text-left hover:bg-white"
                  onClick={() => onConnect(connection)}
                >
                  <div className="truncate text-sm font-medium text-slate-900">
                    {connection.name || connection.hostname}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {connection.username || "user"}@{connection.hostname || "host"}:{connection.port || 22}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="活动会话" open={activeTool === "local" || activeTool === "monitor"}>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-white"
            onClick={onCreateLocal}
          >
            <Terminal className="h-4 w-4 text-slate-500" />
            打开 Local CMD
          </button>
        </SidebarSection>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  count,
  open,
  children
}: {
  title: string;
  count?: number;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-200 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-950">{title}</div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && (
            <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500">{count}</span>
          )}
          <ChevronDown className={cn("h-4 w-4 text-slate-400", !open && "-rotate-90")} />
        </div>
      </div>
      {open && children}
    </section>
  );
}

function Workbench({
  savedConnections,
  query,
  onQueryChange,
  onOpenDialog,
  onRefresh,
  onConnect
}: {
  savedConnections: SavedConnection[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpenDialog: () => void;
  onRefresh: () => void;
  onConnect: (connection: SavedConnection) => void;
}) {
  return (
    <div className="h-full overflow-auto px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              SSH Workbench
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-normal text-slate-950">主机工作台</h1>
            <p className="mt-2 text-sm text-slate-600">管理 SSH 主机、快速连接并进入终端会话。</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                value={query}
                placeholder="搜索主机..."
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </div>
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button onClick={onOpenDialog}>
              <Plus className="h-4 w-4" />
              新建连接
            </Button>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-4">
          <Metric label="全部主机" value={savedConnections.length} icon={Server} />
          <Metric label="密钥连接" value={savedConnections.filter((item) => item.keyPath).length} icon={KeyRound} />
          <Metric label="分组数" value={new Set(savedConnections.map((item) => item.group).filter(Boolean)).size} icon={HardDrive} />
        </div>

        <Panel
          className="mt-6"
          title="主机列表"
          action={<Button variant="outline" onClick={onOpenDialog}>添加主机</Button>}
        >
          {savedConnections.length === 0 ? (
            <EmptyState
              title="暂无已保存主机"
              description="从左侧新建连接，或直接添加第一台 SSH 主机。"
              action={<Button onClick={onOpenDialog}>新建连接</Button>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {savedConnections.map((connection, index) => (
                <button
                  key={`${connection.hostname}-${connection.username}-${index}`}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                  onClick={() => onConnect(connection)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">
                        {connection.name || connection.hostname}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {connection.username || "user"}@{connection.hostname}:{connection.port || 22}
                      </div>
                    </div>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                      连接
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function TerminalWorkspace({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onCreateLocal
}: {
  sessions: SessionTab[];
  activeSessionId: string;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCreateLocal: () => void;
}) {
  const activeSession = sessions.find((session) => session.id === activeSessionId);

  return (
    <div className="grid h-full grid-rows-[34px_minmax(0,1fr)_34px] bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 pl-3 pr-4">
        <div className="flex h-full min-w-0 items-center gap-1">
          <button
            className="mr-2 flex h-7 w-8 items-center justify-center rounded-md bg-slate-900 text-white"
            onClick={onCreateLocal}
            title="新建本地终端"
          >
            <Home className="h-4 w-4" />
          </button>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "flex h-7 max-w-48 items-center gap-2 rounded-md border px-3 text-xs font-medium",
                session.id === activeSessionId
                  ? "border-slate-300 bg-white text-slate-950"
                  : "border-transparent text-slate-500 hover:bg-white"
              )}
            >
              <button className="min-w-0 truncate" onClick={() => onActivate(session.id)}>
                {session.title}
              </button>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => onClose(session.id)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="h-7 px-2">
          <Menu className="h-4 w-4" />
        </Button>
      </div>
      <TerminalSurface activeSession={activeSession} />
      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 text-xs text-slate-500">
        <span className={cn("h-2 w-2 rounded-full", activeSession?.connected ? "bg-emerald-500" : "bg-slate-300")} />
        <span>{activeSession ? "已连接" : "未连接"}</span>
        <span>{activeSession?.title || "无活动会话"}</span>
      </div>
    </div>
  );
}

function TerminalSurface({ activeSession }: { activeSession?: SessionTab }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const activeIdRef = useRef("");

  useEffect(() => {
    activeIdRef.current = activeSession?.id || "";
  }, [activeSession?.id]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeSession) return;

    terminalRef.current?.dispose();
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: "#111827",
        foreground: "#e5e7eb",
        cursor: "#93c5fd",
        selectionBackground: "#334155"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();
    terminal.focus();
    terminal.writeln(`\x1b[36m${activeSession.title}\x1b[0m`);
    terminal.writeln("");
    decoderRef.current = new TextDecoder("utf-8");
    terminal.onData((data) => {
      void nativeBridge.sendInputBase64(activeSession.id, bytesToBase64(new TextEncoder().encode(data)));
    });

    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    const resize = () => {
      fitAddon.fit();
      void nativeBridge.resizeTerminal(activeSession.id, terminal.cols, terminal.rows);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const interval = window.setInterval(async () => {
      const result = await nativeBridge.getOutput(activeSession.id);
      if (result.output) {
        terminal.write(decodeTerminalOutput(result.output, decoderRef));
      }
    }, 160);

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      terminal.dispose();
    };
  }, [activeSession?.id]);

  useEffect(() => {
    window.handlePushOutput = (sessionId, data) => {
      if (sessionId === activeIdRef.current) {
        terminalRef.current?.write(decodeTerminalOutput(data, decoderRef));
      }
    };
    return () => {
      window.handlePushOutput = undefined;
    };
  }, []);

  if (!activeSession) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <EmptyState
          title="暂无活动会话"
          description="打开 Local CMD 或连接 SSH 主机后，终端会显示在这里。"
        />
      </div>
    );
  }

  return <div ref={containerRef} className="terminal-shell h-full min-h-0 overflow-hidden" />;
}

function decodeTerminalOutput(base64: string, decoderRef: React.MutableRefObject<TextDecoder | null>) {
  const bytes = base64ToBytes(base64);
  if (!decoderRef.current) {
    decoderRef.current = new TextDecoder("utf-8");
  }
  return decoderRef.current.decode(bytes, { stream: true });
}

function base64ToBytes(base64: string) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function MonitorPanel({ activeSession }: { activeSession?: SessionTab }) {
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, NativeResult>>({});

  async function refresh() {
    if (!activeSession) return;
    setLoading(true);
    const [info, stats, processes, disk, network] = await Promise.all([
      nativeBridge.getSystemInfo(activeSession.id),
      nativeBridge.getSystemStats(activeSession.id),
      nativeBridge.getProcessList(activeSession.id),
      nativeBridge.getDiskUsage(activeSession.id),
      nativeBridge.getNetworkInfo(activeSession.id)
    ]);
    setSnapshots({ info, stats, processes, disk, network });
    setLoading(false);
  }

  useEffect(() => {
    setSnapshots({});
    void refresh();
  }, [activeSession?.id]);

  const sections = [
    ["系统信息", snapshots.info],
    ["资源占用", snapshots.stats],
    ["进程列表", snapshots.processes],
    ["磁盘使用", snapshots.disk],
    ["网络接口", snapshots.network]
  ] as const;

  return (
    <div className="h-full overflow-auto px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">系统监控</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeSession ? `当前会话：${activeSession.title}` : "选择一个 SSH 会话后显示主机状态。"}
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={!activeSession || loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {sections.map(([title, result]) => (
            <Panel key={title} title={title}>
              {!activeSession ? (
                <div className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">暂无活动 SSH 会话</div>
              ) : !result ? (
                <div className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">等待刷新数据</div>
              ) : result.success ? (
                <pre className="max-h-60 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                  {JSON.stringify(result, null, 2)}
                </pre>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">
                  {result.error || "暂未获取到数据"}
                </div>
              )}
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommandPanel() {
  const commands = ["top", "df -h", "free -m", "journalctl -xe", "systemctl status"];
  return (
    <SimplePage
      title="命令库"
      description="整理常用命令，后续可直接发送到活动终端。"
      action={<Button variant="outline">导入命令</Button>}
    >
      <div className="grid grid-cols-2 gap-3">
        {commands.map((command) => (
          <div key={command} className="rounded-lg border border-slate-200 bg-white p-4">
            <code className="text-sm font-semibold text-slate-900">{command}</code>
            <p className="mt-2 text-sm text-slate-500">常用运维命令</p>
          </div>
        ))}
      </div>
    </SimplePage>
  );
}

function SftpPanel({ activeSession }: { activeSession?: SessionTab }) {
  return (
    <SimplePage title="SFTP 文件" description={activeSession ? `当前会话：${activeSession.title}` : "连接 SSH 后使用远程文件管理。"}>
      <EmptyState title="暂无文件会话" description="选择活动 SSH 会话后，这里显示本地与远程目录。" />
    </SimplePage>
  );
}

function PortForwardPanel({ activeSession }: { activeSession?: SessionTab }) {
  return (
    <SimplePage title="端口转发" description={activeSession ? `当前会话：${activeSession.title}` : "创建本地、远程或动态转发规则。"}>
      <div className="grid grid-cols-3 gap-4">
        {["本地转发", "远程转发", "动态代理"].map((item) => (
          <Panel key={item} title={item}>
            <p className="text-sm text-slate-500">暂无活动规则</p>
          </Panel>
        ))}
      </div>
    </SimplePage>
  );
}

function AiWorkspacePanel({ activeSession }: { activeSession?: SessionTab }) {
  const [selectedTool, setSelectedTool] = useState<AiTool>("codex");
  const [prompt, setPrompt] = useState("");
  const isCodex = selectedTool === "codex";

  return (
    <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_410px] bg-white">
      <section className="min-w-0 overflow-auto border-r border-slate-200 bg-slate-50 px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                AI Workbench
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">AI 助手</h1>
              <p className="mt-1 text-sm text-slate-500">像 VSCode 右侧对话框一样工作：选择工具，带着当前上下文发起对话或本地执行。</p>
            </div>
            <Button variant="outline">
              <Settings className="h-4 w-4" />
              AI 设置
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Panel title="当前上下文" className="col-span-2">
              <div className="grid grid-cols-2 gap-3">
                <ContextItem label="活动会话" value={activeSession?.title || "未选择活动会话"} />
                <ContextItem label="执行目录" value="当前项目 / 当前终端" />
                <ContextItem label="Codex 命令" value="codex exec" />
                <ContextItem label="Hermes 流式协议" value="HTTP + SSE" />
              </div>
            </Panel>

            <Panel title="连接状态">
              <div className="space-y-3">
                <StatusLine label="Codex CLI" value="本地可用" tone="success" />
                <StatusLine label="Hermes 本地" value="localhost:61355 / 61356" tone="success" />
                <StatusLine label="Hermes 远端" value="等待配置" tone="muted" />
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Panel title="Codex CLI 执行器">
              <p className="text-sm leading-6 text-slate-600">用于本机工程分析、代码修改、测试执行。真正执行前会展示命令预览和审批按钮。</p>
              <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                codex exec -C E:\adb\tools\LdSSH "分析当前问题并给出修改"
              </pre>
            </Panel>

            <Panel title="Hermes 对话网关">
              <p className="text-sm leading-6 text-slate-600">支持本地和远端 Hermes WebUI。远端优先配置 Base URL，程序自动检测 /health、/api/chat/start 和 SSE 流。</p>
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <div>POST /api/chat/start</div>
                <div>GET /api/chat/stream?stream_id=...</div>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-white">
        <header className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">AI 对话栏</h2>
              <p className="mt-1 text-xs text-slate-500">{isCodex ? "当前工具：本地 Codex CLI" : "当前工具：Hermes 本地 / 远端"}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              可用
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <AiToolButton
              active={selectedTool === "codex"}
              icon={<Cpu className="h-4 w-4" />}
              title="Codex CLI"
              description="本地执行器"
              onClick={() => setSelectedTool("codex")}
            />
            <AiToolButton
              active={selectedTool === "hermes"}
              icon={<MessageSquare className="h-4 w-4" />}
              title="Hermes"
              description="对话网关"
              onClick={() => setSelectedTool("hermes")}
            />
          </div>
        </header>

        <AiConfigPanel selectedTool={selectedTool} />

        <div className="min-h-0 overflow-auto bg-slate-50 px-4 py-4">
          <div className="space-y-3">
            <AiMessage role="user">帮我分析当前终端错误，并给出下一步处理建议。</AiMessage>
            <AiMessage role="assistant">
              {isCodex
                ? "我会使用本地 Codex CLI 分析项目和终端上下文。执行前先展示命令，你确认后再运行。"
                : "我会把问题发送到 Hermes。远端 Hermes 需要先配置 Base URL，并通过健康检查。"}
            </AiMessage>
            <AiActionCard selectedTool={selectedTool} activeSession={activeSession} />
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-1">附加当前会话</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">附加终端输出</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">需要审批</span>
          </div>
          <div className="grid grid-cols-[1fr_44px] gap-2">
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              value={prompt}
              placeholder="输入任务，选择 Codex 或 Hermes 执行..."
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700" title="发送">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function AiToolButton({
  active,
  icon,
  title,
  description,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-md border p-3 text-left transition-colors",
        active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )}
      onClick={onClick}
    >
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function AiConfigPanel({ selectedTool }: { selectedTool: AiTool }) {
  if (selectedTool === "codex") {
    return (
      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 text-xs font-semibold text-slate-500">Codex 配置</div>
        <div className="grid grid-cols-2 gap-2">
          <ReadonlyField label="执行命令" value="codex exec" />
          <ReadonlyField label="审批策略" value="执行前确认" />
          <ReadonlyField className="col-span-2" label="工作目录" value="当前项目目录，也可跟随当前终端" />
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 text-xs font-semibold text-slate-500">Hermes 配置</div>
      <div className="grid grid-cols-2 gap-2">
        <ReadonlyField label="接入模式" value="本地 / 远端" />
        <ReadonlyField label="流式协议" value="SSE 自动检测" />
        <ReadonlyField className="col-span-2" label="远端 Base URL" value="https://hermes.intranet.example.com/" />
      </div>
    </section>
  );
}

function AiMessage({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const user = role === "user";
  return (
    <div className={cn("flex", user ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] rounded-lg px-3 py-2 text-sm leading-6",
          user ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function AiActionCard({ selectedTool, activeSession }: { selectedTool: AiTool; activeSession?: SessionTab }) {
  const command =
    selectedTool === "codex"
      ? 'codex exec -C E:\\adb\\tools\\LdSSH "分析当前终端错误"'
      : "POST /api/chat/start -> SSE /api/chat/stream";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Wrench className="h-4 w-4" />
          {selectedTool === "codex" ? "本地执行审批" : "Hermes 调用审批"}
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-amber-800">
          {activeSession?.title || "无活动会话"}
        </span>
      </div>
      <pre className="mt-3 overflow-auto rounded-md border border-amber-200 bg-white p-2 text-xs leading-5 text-slate-800">{command}</pre>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" className="h-8 px-3">取消</Button>
        <Button className="h-8 px-3">
          <Play className="h-3.5 w-3.5" />
          授权执行
        </Button>
      </div>
    </div>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: "success" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className={cn("text-xs font-semibold", tone === "success" ? "text-emerald-700" : "text-slate-500")}>{value}</span>
    </div>
  );
}

function ReadonlyField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-md border border-slate-200 bg-slate-50 px-3 py-2", className)}>
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xs text-slate-800">{value}</div>
    </div>
  );
}

function SimplePage({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-auto px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

function ConnectDialog({
  open,
  form,
  error,
  onOpenChange,
  onFormChange,
  onConnect
}: {
  open: boolean;
  form: ConnectionForm;
  error: string;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: ConnectionForm) => void;
  onConnect: () => void;
}) {
  function update<K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) {
    onFormChange({ ...form, [key]: value });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-950">新建 SSH 连接</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                填写主机地址、端口和认证信息。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="连接名称">
              <Input value={form.name} onChange={(event) => update("name", event.target.value)} />
            </Field>
            <Field label="端口">
              <Input value={form.port} onChange={(event) => update("port", event.target.value)} />
            </Field>
            <Field label="主机地址">
              <Input value={form.hostname} onChange={(event) => update("hostname", event.target.value)} />
            </Field>
            <Field label="用户名">
              <Input value={form.username} onChange={(event) => update("username", event.target.value)} />
            </Field>
            <Field label="密码">
              <Input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} />
            </Field>
            <Field label="密钥路径">
              <Input value={form.keyPath} onChange={(event) => update("keyPath", event.target.value)} />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.save}
              onChange={(event) => update("save", event.target.checked)}
            />
            保存到主机列表
          </label>

          {error && <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button onClick={onConnect}>连接</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
