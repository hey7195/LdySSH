import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Command,
  Cpu,
  Download,
  Eye,
  ExternalLink,
  File as FileIcon,
  Folder as FolderIcon,
  FolderOpen,
  Grid2X2,
  Globe2,
  HardDrive,
  Home,
  Image as ImageIcon,
  KeyRound,
  Menu,
  MessageSquare,
  Minimize2,
  Paperclip,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Terminal,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { Button, EmptyState, Input, Panel } from "./components/ui";
import { extractCommandParameters, fillCommandParameters, mergeCommandFolders, parseCommandLibraryImport, serializeCommandLibraryExport } from "./lib/commandLibrary";
import {
  buildCommandSuggestions,
  defaultCommandSuggestionApplyKey,
  defaultCommandSuggestionSources,
  isFullScreenCommand,
  recordCommandHistory,
  type CommandSuggestion,
  type CommandSuggestionApplyKey,
  type CommandSuggestionCustomApplyKey,
  type CommandSuggestionSources
} from "./lib/commandSuggestions";
import { cn } from "./lib/utils";
import {
  nativeBridge,
  type CodexJobResult,
  type CommandFolder,
  type CommandItem,
  type ConnectParams,
  type DirectoryEntry,
  type NativeResult,
  type SavedConnection,
  type WebFavorite
} from "./lib/bridge";
import {
  DEFAULT_HIGHLIGHT_RULES,
  DEFAULT_TERMINAL_THEME,
  THEMES,
  TERMINAL_THEMES,
  applyHighlightRules,
  getTerminalTheme,
  getThemeAttribute,
  type HighlightRule,
  type TerminalThemeMode,
  type ThemeMode
} from "./lib/terminalSettings";

type Tool = "ssh" | "cmd" | "monitor" | "local" | "browser" | "settings";
type TerminalSidePanel = "commands" | "files" | "ai";
type AiTool = "codex" | "hermes";
type AiNoiseMode = "minimal" | "standard" | "debug";
type AiContextSource = "terminal_selection" | "session_metadata";

type HermesRunEvent = Record<string, unknown> & { event?: string; session_id?: string };

interface SessionTab {
  id: string;
  title: string;
  kind: "local" | "ssh";
  connected: boolean;
  status?: "connecting" | "connected" | "failed" | "disconnected";
  error?: string;
  connectParams?: ConnectParams;
}

interface TerminalCommandNotice {
  sessionId: string;
  command: string;
}

interface ShortcutParameterRequest {
  folderId: string;
  commandId: string;
  requestId: number;
}

interface CommandSuggestionView {
  suggestions: CommandSuggestion[];
  activeIndex: number;
  onApply: (suggestion: CommandSuggestion) => void;
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

interface AiQuote {
  id: string;
  sourceTitle: string;
  text: string;
}

interface AiContextChip {
  id: string;
  type: AiContextSource;
  label: string;
  sourceTitle: string;
  text: string;
  lineCount?: number;
  capturedAt: number;
}

interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: AiAttachment[];
}

interface AiAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "text" | "file";
  localPath?: string;
  previewUrl?: string;
  textContent?: string;
  error?: string;
}

interface AiSession {
  id: string;
  title: string;
  tool: AiTool;
  model: string;
  noiseMode: AiNoiseMode;
  continueSession: boolean;
  hermesSessionId?: string;
  codexSessionId?: string;
  memory: string;
  messages: AiChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface DeleteConfirmation {
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

interface AiConfig {
  codexCommand: string;
  codexWorkingDirectory: string;
  hermesBaseUrl: string;
  hermesWsUrl: string;
  hermesUsername: string;
  hermesPassword: string;
}

interface AiRun {
  id: string;
  aiSessionId: string;
  tool: AiTool;
  prompt: string;
  model: string;
  noiseMode: AiNoiseMode;
  continueSession: boolean;
  codexSessionId?: string;
  hermesSessionId?: string;
  contexts: AiContextChip[];
  sessionTitle: string;
  codexCommand: string;
  codexWorkingDirectory: string;
  hermesBaseUrl: string;
  hermesWsUrl: string;
  hermesUsername: string;
  hermesPassword: string;
}

interface RetryPasswordPrompt {
  sessionId: string;
  title: string;
  error: string;
  password: string;
}

interface TerminalSearchMatch {
  lineNumber: number;
  column: number;
  line: string;
}

interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
  foreground: string;
  background: string;
}

const tools: Array<{ id: Tool; label: string; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "ssh", label: "会话", title: "SSH 会话", icon: Server },
  { id: "local", label: "本地", title: "本地终端", icon: Terminal },
  { id: "cmd", label: "命令", title: "命令库", icon: Command },
  { id: "monitor", label: "监控", title: "系统监控", icon: Monitor },
  { id: "browser", label: "网页", title: "浏览器", icon: Globe2 },
  { id: "settings", label: "设置", title: "设置", icon: Settings }
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

const defaultCommandFolders: CommandFolder[] = [
  {
    id: "default",
    name: "默认分类",
    commands: [
      { id: "top", name: "进程负载", command: "top", description: "查看实时进程和负载" },
      { id: "disk", name: "磁盘使用", command: "df -h", description: "查看磁盘空间" },
      { id: "memory", name: "内存使用", command: "free -m", description: "查看内存使用" }
    ]
  },
  {
    id: "service",
    name: "服务操作",
    commands: [
      { id: "journal", name: "系统日志", command: "journalctl -xe", description: "查看系统错误日志" },
      { id: "systemctl", name: "服务状态", command: "systemctl status", description: "查看 systemd 服务状态" }
    ]
  }
];

const defaultAiConfig: AiConfig = {
  codexCommand: "codex",
  codexWorkingDirectory: "E:\\adb\\tools\\LdSSH",
  hermesBaseUrl: "http://127.0.0.1:3000",
  hermesWsUrl: "",
  hermesUsername: "admin",
  hermesPassword: ""
};

const aiModelOptions = ["", "gpt-5.5", "gpt-5.4-mini", "deepseek-v3.2", "hi"];

const storageKeys = {
  theme: "ldyssh.ui.theme",
  terminalTheme: "ldyssh.terminal.theme",
  terminalFontFamily: "ldyssh.terminal.fontFamily",
  terminalFontSize: "ldyssh.terminal.fontSize",
  terminalForeground: "ldyssh.terminal.foreground",
  terminalBackground: "ldyssh.terminal.background",
  terminalBackgroundImage: "ldyssh.terminal.backgroundImage",
  terminalBackgroundOverlay: "ldyssh.terminal.backgroundOverlay",
  commandSuggestionsEnabled: "ldyssh.terminal.commandSuggestionsEnabled",
  commandSuggestionHistory: "ldyssh.terminal.commandSuggestions.history",
  commandSuggestionShortcuts: "ldyssh.terminal.commandSuggestions.shortcuts",
  commandSuggestionLinux: "ldyssh.terminal.commandSuggestions.linux",
  commandSuggestionApplyKey: "ldyssh.terminal.commandSuggestions.applyKey",
  commandSuggestionCustomApplyKey: "ldyssh.terminal.commandSuggestions.customApplyKey",
  commandSuggestionPanel: "ldyssh.terminal.commandSuggestions.panel",
  highlightRules: "ldyssh.terminal.highlightRules",
  aiConfig: "ldyssh.ai.config",
  aiSessions: "ldyssh.ai.sessions"
};

const TERMINAL_HISTORY_LIMIT = 2_000_000;

interface CommandSuggestionPanelLayout {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

const defaultCommandSuggestionPanelLayout: CommandSuggestionPanelLayout = {
  left: 80,
  bottom: 24,
  width: 260,
  height: 180
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCommandSuggestionPanelLayout(layout: CommandSuggestionPanelLayout): CommandSuggestionPanelLayout {
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  const width = clampNumber(layout.width, 180, Math.min(520, viewportWidth - 24));
  const height = clampNumber(layout.height, 120, Math.min(420, viewportHeight - 24));
  return {
    left: clampNumber(layout.left, 8, Math.max(8, viewportWidth - width - 8)),
    bottom: clampNumber(layout.bottom, 8, Math.max(8, viewportHeight - height - 8)),
    width,
    height
  };
}

function loadStoredCommandSuggestionPanelLayout() {
  const raw = window.localStorage.getItem(storageKeys.commandSuggestionPanel);
  if (!raw) return defaultCommandSuggestionPanelLayout;
  try {
    const parsed = JSON.parse(raw) as Partial<CommandSuggestionPanelLayout>;
    return normalizeCommandSuggestionPanelLayout({
      left: Number(parsed.left ?? defaultCommandSuggestionPanelLayout.left),
      bottom: Number(parsed.bottom ?? defaultCommandSuggestionPanelLayout.bottom),
      width: Number(parsed.width ?? defaultCommandSuggestionPanelLayout.width),
      height: Number(parsed.height ?? defaultCommandSuggestionPanelLayout.height)
    });
  } catch {
    return defaultCommandSuggestionPanelLayout;
  }
}
const PASSWORD_PLACEHOLDER = "***";
const COMMAND_PARAMETER_SLOTS = [1, 2, 3, 4, 5];
const defaultTerminalAppearance: TerminalAppearance = {
  fontFamily: "Cascadia Mono, Consolas, monospace",
  fontSize: 13,
  foreground: "",
  background: ""
};

function trimTerminalHistory(text: string) {
  return text.length > TERMINAL_HISTORY_LIMIT ? text.slice(-TERMINAL_HISTORY_LIMIT) : text;
}

function findTerminalSearchMatches(transcript: string, query: string): TerminalSearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: TerminalSearchMatch[] = [];
  transcript.split(/\r?\n/).forEach((line, index) => {
    const haystack = line.toLowerCase();
    let offset = 0;
    while (offset < haystack.length) {
      const column = haystack.indexOf(needle, offset);
      if (column === -1) break;
      matches.push({ lineNumber: index + 1, column: column + 1, line });
      offset = column + needle.length;
    }
  });

  return matches;
}

function loadStoredTheme(): ThemeMode {
  const value = window.localStorage.getItem(storageKeys.theme);
  return value === "dark" ? "dark" : "light";
}

function loadStoredTerminalTheme(): TerminalThemeMode {
  const value = window.localStorage.getItem(storageKeys.terminalTheme);
  return value === "light" ? "light" : DEFAULT_TERMINAL_THEME;
}

function loadStoredTerminalBackgroundImage() {
  return window.localStorage.getItem(storageKeys.terminalBackgroundImage) || "";
}

function loadStoredTerminalBackgroundOverlay() {
  const value = Number(window.localStorage.getItem(storageKeys.terminalBackgroundOverlay) || 50);
  return Number.isFinite(value) ? value : 50;
}

function loadStoredCommandSuggestionsEnabled() {
  return window.localStorage.getItem(storageKeys.commandSuggestionsEnabled) !== "false";
}

function loadStoredCommandSuggestionSources(): CommandSuggestionSources {
  const history = window.localStorage.getItem(storageKeys.commandSuggestionHistory);
  const shortcuts = window.localStorage.getItem(storageKeys.commandSuggestionShortcuts);
  const linux = window.localStorage.getItem(storageKeys.commandSuggestionLinux);
  return {
    history: history === null ? defaultCommandSuggestionSources.history : history !== "false",
    shortcuts: shortcuts === null ? defaultCommandSuggestionSources.shortcuts : shortcuts !== "false",
    linux: linux === null ? defaultCommandSuggestionSources.linux : linux !== "false"
  };
}

function loadStoredCommandSuggestionApplyKey(): CommandSuggestionApplyKey {
  const value = window.localStorage.getItem(storageKeys.commandSuggestionApplyKey);
  return value === "ctrlSpace" || value === "altEnter" || value === "custom" ? value : defaultCommandSuggestionApplyKey;
}

function loadStoredCommandSuggestionCustomApplyKey(): CommandSuggestionCustomApplyKey | null {
  const value = window.localStorage.getItem(storageKeys.commandSuggestionCustomApplyKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CommandSuggestionCustomApplyKey;
    return parsed && parsed.key && parsed.code && parsed.label ? parsed : null;
  } catch {
    return null;
  }
}

function createCommandSuggestionCustomApplyKey(event: globalThis.KeyboardEvent): CommandSuggestionCustomApplyKey | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return null;

  const parts = [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Meta" : "",
    event.key === " " ? "Space" : event.key
  ].filter(Boolean);

  return {
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    label: parts.join("+")
  };
}

function loadStoredTerminalAppearance(): TerminalAppearance {
  const fontSize = Number(window.localStorage.getItem(storageKeys.terminalFontSize) || defaultTerminalAppearance.fontSize);
  return {
    fontFamily: window.localStorage.getItem(storageKeys.terminalFontFamily) || defaultTerminalAppearance.fontFamily,
    fontSize: Number.isFinite(fontSize) ? fontSize : defaultTerminalAppearance.fontSize,
    foreground: window.localStorage.getItem(storageKeys.terminalForeground) || "",
    background: window.localStorage.getItem(storageKeys.terminalBackground) || ""
  };
}

function getTerminalAppearance(appearance: TerminalAppearance) {
  return {
    fontFamily: appearance.fontFamily.trim() || defaultTerminalAppearance.fontFamily,
    fontSize: Number.isFinite(appearance.fontSize) ? appearance.fontSize : defaultTerminalAppearance.fontSize,
    foreground: appearance.foreground,
    background: appearance.background
  };
}

function getTerminalColors(theme: TerminalThemeMode, appearance: TerminalAppearance, translucent = false) {
  const themeColors = getTerminalTheme(theme, translucent);
  return {
    ...themeColors,
    foreground: appearance.foreground || themeColors.foreground,
    background: appearance.background || themeColors.background
  };
}

function colorToRgbParts(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return "2, 6, 23";
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ].join(", ");
}

function buildTerminalBackgroundImage(backgroundImage: string, backgroundColor: string, overlayAlpha: number) {
  if (!backgroundImage) return undefined;
  const rgb = colorToRgbParts(backgroundColor);
  return `linear-gradient(rgba(${rgb}, ${overlayAlpha}), rgba(${rgb}, ${overlayAlpha})), url(${JSON.stringify(backgroundImage)})`;
}

function loadStoredHighlightRules(): HighlightRule[] {
  const raw = window.localStorage.getItem(storageKeys.highlightRules);
  if (!raw) return DEFAULT_HIGHLIGHT_RULES;
  try {
    const parsed = JSON.parse(raw) as HighlightRule[];
    const customRules = parsed.filter((rule) => !rule.system);
    const storedSystemById = new Map(parsed.filter((rule) => rule.system).map((rule) => [rule.id, rule]));
    return [
      ...DEFAULT_HIGHLIGHT_RULES.map((rule) => ({ ...rule, enabled: storedSystemById.get(rule.id)?.enabled ?? rule.enabled })),
      ...customRules
    ];
  } catch {
    return DEFAULT_HIGHLIGHT_RULES;
  }
}

function loadStoredAiConfig(): AiConfig {
  const raw = window.localStorage.getItem(storageKeys.aiConfig);
  if (!raw) return defaultAiConfig;
  try {
    return { ...defaultAiConfig, ...(JSON.parse(raw) as Partial<AiConfig>) };
  } catch {
    return defaultAiConfig;
  }
}

function createAiSession(tool: AiTool = "codex"): AiSession {
  const now = Date.now();
  return {
    id: `ai_${now}`,
    title: "新会话",
    tool,
    model: "",
    noiseMode: "standard",
    continueSession: true,
    memory: "",
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

function hydrateAiSession(session: Partial<AiSession>, fallbackTool: AiTool = "codex"): AiSession {
  return {
    ...createAiSession(session.tool || fallbackTool),
    ...session,
    tool: session.tool || fallbackTool,
    model: session.model || "",
    noiseMode: session.noiseMode || "standard",
    continueSession: session.continueSession ?? true,
    hermesSessionId: session.hermesSessionId || "",
    codexSessionId: session.codexSessionId || "",
    memory: session.memory || "",
    messages: session.messages || []
  };
}

function loadStoredAiSessions(): AiSession[] {
  const raw = window.localStorage.getItem(storageKeys.aiSessions);
  if (!raw) return [createAiSession()];
  try {
    const parsed = JSON.parse(raw) as Partial<AiSession>[];
    return parsed.length > 0 ? parsed.map((session) => hydrateAiSession(session)) : [createAiSession()];
  } catch {
    return [createAiSession()];
  }
}

function getLineCount(text: string) {
  return Math.max(1, text.split(/\r?\n/).length);
}

function createQuoteContext(quote: AiQuote): AiContextChip {
  const lineCount = getLineCount(quote.text);
  return {
    id: quote.id,
    type: "terminal_selection",
    label: `终端选区 ${lineCount} 行`,
    sourceTitle: quote.sourceTitle,
    text: quote.text,
    lineCount,
    capturedAt: Date.now()
  };
}

function createSessionContext(activeSession?: SessionTab): AiContextChip | null {
  if (!activeSession) return null;
  const lines = [
    `类型: ${activeSession.kind}`,
    `标题: ${activeSession.title}`,
    activeSession.connectParams?.hostname ? `主机: ${activeSession.connectParams.hostname}` : "",
    activeSession.connectParams?.port ? `端口: ${activeSession.connectParams.port}` : "",
    activeSession.connectParams?.username ? `用户: ${activeSession.connectParams.username}` : ""
  ].filter(Boolean);
  return {
    id: `session_${activeSession.id}`,
    type: "session_metadata",
    label: "当前会话",
    sourceTitle: activeSession.title,
    text: lines.join("\n"),
    capturedAt: Date.now()
  };
}

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>("ssh");
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [editingConnectionKey, setEditingConnectionKey] = useState("");
  const [form, setForm] = useState<ConnectionForm>(emptyForm);
  const [connectError, setConnectError] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => loadStoredTheme());
  const [terminalTheme, setTerminalTheme] = useState<TerminalThemeMode>(() => loadStoredTerminalTheme());
  const [terminalAppearance, setTerminalAppearance] = useState<TerminalAppearance>(() => loadStoredTerminalAppearance());
  const [terminalBackgroundImage, setTerminalBackgroundImage] = useState(() => loadStoredTerminalBackgroundImage());
  const [terminalBackgroundOverlay, setTerminalBackgroundOverlay] = useState(() => loadStoredTerminalBackgroundOverlay());
  const [commandSuggestionsEnabled, setCommandSuggestionsEnabled] = useState(() => loadStoredCommandSuggestionsEnabled());
  const [commandSuggestionSources, setCommandSuggestionSources] = useState<CommandSuggestionSources>(() => loadStoredCommandSuggestionSources());
  const [commandSuggestionApplyKey, setCommandSuggestionApplyKey] = useState<CommandSuggestionApplyKey>(() => loadStoredCommandSuggestionApplyKey());
  const [commandSuggestionCustomApplyKey, setCommandSuggestionCustomApplyKey] = useState<CommandSuggestionCustomApplyKey | null>(() => loadStoredCommandSuggestionCustomApplyKey());
  const [highlightRules, setHighlightRules] = useState<HighlightRule[]>(() => loadStoredHighlightRules());
  const [aiQuotes, setAiQuotes] = useState<AiQuote[]>([]);
  const [commandFolders, setCommandFolders] = useState<CommandFolder[]>(defaultCommandFolders);
  const [activeCommandFolderId, setActiveCommandFolderId] = useState(defaultCommandFolders[0].id);
  const [commandTransferStatus, setCommandTransferStatus] = useState("");
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadStoredAiConfig());
  const [terminalSidePanel, setTerminalSidePanel] = useState<TerminalSidePanel>("commands");
  const [terminalHistories, setTerminalHistories] = useState<Record<string, string>>({});
  const [terminalFocusRequest, setTerminalFocusRequest] = useState(0);
  const [terminalCommandNotice, setTerminalCommandNotice] = useState<TerminalCommandNotice | null>(null);
  const [commandSuggestionView, setCommandSuggestionView] = useState<CommandSuggestionView | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<RetryPasswordPrompt | null>(null);
  const [webFavorites, setWebFavorites] = useState<WebFavorite[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);

  useEffect(() => {
    void refreshConnections();
    void refreshCommandLibrary();
    void refreshWebFavorites();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.terminalTheme, terminalTheme);
  }, [terminalTheme]);

  useEffect(() => {
    const appearance = getTerminalAppearance(terminalAppearance);
    window.localStorage.setItem(storageKeys.terminalFontFamily, appearance.fontFamily);
    window.localStorage.setItem(storageKeys.terminalFontSize, String(appearance.fontSize));
    if (appearance.foreground) {
      window.localStorage.setItem(storageKeys.terminalForeground, appearance.foreground);
    } else {
      window.localStorage.removeItem(storageKeys.terminalForeground);
    }
    if (appearance.background) {
      window.localStorage.setItem(storageKeys.terminalBackground, appearance.background);
    } else {
      window.localStorage.removeItem(storageKeys.terminalBackground);
    }
  }, [terminalAppearance]);

  useEffect(() => {
    if (terminalBackgroundImage) {
      window.localStorage.setItem(storageKeys.terminalBackgroundImage, terminalBackgroundImage);
    } else {
      window.localStorage.removeItem(storageKeys.terminalBackgroundImage);
    }
  }, [terminalBackgroundImage]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.terminalBackgroundOverlay, String(terminalBackgroundOverlay));
  }, [terminalBackgroundOverlay]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.commandSuggestionsEnabled, String(commandSuggestionsEnabled));
  }, [commandSuggestionsEnabled]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.commandSuggestionHistory, String(commandSuggestionSources.history));
    window.localStorage.setItem(storageKeys.commandSuggestionShortcuts, String(commandSuggestionSources.shortcuts));
    window.localStorage.setItem(storageKeys.commandSuggestionLinux, String(commandSuggestionSources.linux));
  }, [commandSuggestionSources]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.commandSuggestionApplyKey, commandSuggestionApplyKey);
  }, [commandSuggestionApplyKey]);

  useEffect(() => {
    if (commandSuggestionCustomApplyKey) {
      window.localStorage.setItem(storageKeys.commandSuggestionCustomApplyKey, JSON.stringify(commandSuggestionCustomApplyKey));
    } else {
      window.localStorage.removeItem(storageKeys.commandSuggestionCustomApplyKey);
    }
  }, [commandSuggestionCustomApplyKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.highlightRules, JSON.stringify(highlightRules));
  }, [highlightRules]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.aiConfig, JSON.stringify(aiConfig));
  }, [aiConfig]);

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

  async function refreshCommandLibrary() {
    const result = await nativeBridge.getCommandLibrary();
    const folders = result.success && result.folders.length > 0 ? result.folders : defaultCommandFolders;
    setCommandFolders(folders);
    setActiveCommandFolderId((current) => folders.some((folder) => folder.id === current) ? current : folders[0]?.id || "");
  }

  async function refreshWebFavorites() {
    const result = await nativeBridge.getWebFavorites();
    setWebFavorites(Array.isArray(result) ? result : []);
  }

  async function openLocalSession() {
    const sessionId = await nativeBridge.createLocalSession();
    if (!sessionId) return;
    const tab: SessionTab = {
      id: sessionId,
      title: "Local Shell",
      kind: "local",
      connected: true,
      status: "connected"
    };
    setSessions((current) => [...current, tab]);
    setActiveSessionId(sessionId);
    setActiveTool("local");
  }

  function activateSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setActiveTool("local");
  }

  function appendTerminalHistory(sessionId: string, text: string) {
    if (!text) return;
    setTerminalHistories((current) => ({
      ...current,
      [sessionId]: trimTerminalHistory(`${current[sessionId] || ""}${text}`)
    }));
  }

  function toConnectionForm(connection: SavedConnection): ConnectionForm {
    return {
      name: connection.name || "",
      hostname: connection.hostname || "",
      port: String(connection.port || 22),
      username: connection.username || "",
      password: connection.password || connection.password_unavailable ? PASSWORD_PLACEHOLDER : "",
      keyPath: connection.keyPath || "",
      save: true
    };
  }

  function toConnectParams(connection: SavedConnection): ConnectParams {
    return {
      name: connection.name,
      hostname: connection.hostname || "",
      port: Number(connection.port || 22),
      username: connection.username || "",
      password: connection.password || "",
      keyPath: connection.keyPath || "",
      save: false,
      group: connection.group
    };
  }

  function savedConnectionKey(connection: SavedConnection) {
    return connection.key || `${connection.hostname || ""}@${connection.username || ""}`;
  }

  function openNewConnectionDialog() {
    setEditingConnectionKey("");
    setForm(emptyForm);
    setConnectError("");
    setConnectOpen(true);
  }

  function openEditConnectionDialog(connection: SavedConnection) {
    setEditingConnectionKey(connection.key || `${connection.hostname || ""}@${connection.username || ""}`);
    setForm(toConnectionForm(connection));
    setConnectError("");
    setConnectOpen(true);
  }

  function requestDeleteSavedConnection(connection: SavedConnection) {
    const label = connection.name || connection.hostname || "未命名主机";
    setDeleteConfirmation({
      description: `确定删除主机“${label}”？`,
      onConfirm: () => deleteSavedConnection(connection)
    });
  }

  async function deleteSavedConnection(connection: SavedConnection) {
    const key = savedConnectionKey(connection);
    const result = await nativeBridge.deleteSavedConnection(key);
    if (!result.success) {
      setConnectError(result.error || "删除主机失败。");
      return;
    }
    setSavedConnections((current) => current.filter((item) => savedConnectionKey(item) !== key));
  }

  async function browseKeyFile() {
    const result = await nativeBridge.showOpenFileDialog();
    if (result.filePath) {
      setForm((current) => ({ ...current, keyPath: result.filePath || "" }));
    }
  }

  async function addWebFavorite(title: string, url: string) {
    const result = await nativeBridge.addWebFavorite(title, url);
    if (result.success && result.favorite) {
      setWebFavorites((current) => [...current, result.favorite as WebFavorite]);
      return;
    }
    await refreshWebFavorites();
  }

  async function deleteWebFavorite(favorite: WebFavorite) {
    const result = await nativeBridge.deleteWebFavorite(favorite.id);
    if (result.success) {
      setWebFavorites((current) => current.filter((item) => item.id !== favorite.id));
      return;
    }
    await refreshWebFavorites();
  }

  async function openWebFavorite(favorite: WebFavorite) {
    await nativeBridge.openInExternalBrowser(favorite.url);
  }

  async function saveEditedConnection() {
    setConnectError("");
    const existingConnection = savedConnections.find((connection) => savedConnectionKey(connection) === editingConnectionKey);
    const preservePassword = form.password === PASSWORD_PLACEHOLDER;
    const params: ConnectParams = {
      name: form.name || `${form.username}@${form.hostname}`,
      hostname: form.hostname,
      port: Number(form.port || 22),
      username: form.username,
      password: preservePassword ? existingConnection?.password || "" : form.password,
      keyPath: form.keyPath,
      save: true,
      preservePassword
    };

    if (!params.hostname || !params.username) {
      setConnectError("主机地址和用户名不能为空。");
      return;
    }

    const result = await nativeBridge.saveSavedConnection(editingConnectionKey, params);
    if (!result.success) {
      setConnectError(result.error || "保存失败。");
      return;
    }

    setConnectOpen(false);
    setEditingConnectionKey("");
    setForm(emptyForm);
    void refreshConnections();
  }

  async function connectHost(connection?: SavedConnection) {
    setConnectError("");

    const params: ConnectParams = connection
      ? toConnectParams(connection)
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

    const title = params.name || `${params.username}@${params.hostname}`;
    const sessionId = await nativeBridge.createSession();
    if (!sessionId) {
      setConnectError("创建会话失败。");
      return;
    }

    setSessions((current) => [
      ...current,
      { id: sessionId, title, kind: "ssh", connected: false, status: "connecting", connectParams: params }
    ]);
    setActiveSessionId(sessionId);
    setActiveTool("local");
    setTerminalSidePanel("commands");
    setConnectOpen(false);

    const result = await nativeBridge.connect(sessionId, params);
    if (!result.success) {
      const error = result.error || "连接失败。";
      setConnectError(error);
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, connected: false, status: "failed", error, connectParams: params } : session
        )
      );
      setPasswordPrompt({ sessionId, title, error, password: "" });
      return;
    }

    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, connected: true, status: "connected", error: undefined, connectParams: params } : session
      )
    );
    setPasswordPrompt(null);
    setForm(emptyForm);
    void refreshConnections();
  }

  async function retrySession(sessionId: string, password?: string) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session?.connectParams) return;
    const params = { ...session.connectParams, password: password ?? session.connectParams.password };
    const needsNewNativeSession = session.status !== "failed";
    let targetSessionId = sessionId;
    if (needsNewNativeSession) {
      await nativeBridge.disconnect(sessionId);
      const newSessionId = await nativeBridge.createSession();
      if (!newSessionId) {
        setSessions((current) =>
          current.map((item) =>
            item.id === sessionId ? { ...item, connected: false, status: "failed", error: "创建会话失败。", connectParams: params } : item
          )
        );
        return;
      }
      targetSessionId = newSessionId;
      setTerminalHistories((current) => {
        const history = current[sessionId];
        if (!history) return current;
        const next = { ...current, [targetSessionId]: history };
        delete next[sessionId];
        return next;
      });
    }

    setSessions((current) =>
      current.map((item) =>
        item.id === sessionId
          ? { ...item, id: targetSessionId, connected: false, status: "connecting", error: undefined, connectParams: params }
          : item
      )
    );
    setActiveSessionId(targetSessionId);
    setActiveTool("local");

    const result = await nativeBridge.connect(targetSessionId, params);
    if (!result.success) {
      const error = result.error || "连接失败。";
      setSessions((current) =>
        current.map((item) =>
          item.id === targetSessionId ? { ...item, connected: false, status: "failed", error, connectParams: params } : item
        )
      );
      setPasswordPrompt({ sessionId: targetSessionId, title: params.name || `${params.username}@${params.hostname}`, error, password: "" });
      return;
    }

    setSessions((current) =>
      current.map((item) =>
        item.id === targetSessionId ? { ...item, connected: true, status: "connected", error: undefined, connectParams: params } : item
      )
    );
    setPasswordPrompt(null);
  }

  async function submitRetryPassword() {
    if (!passwordPrompt) return;
    await retrySession(passwordPrompt.sessionId, passwordPrompt.password);
  }

  async function disconnectSession(sessionId: string) {
    await nativeBridge.disconnect(sessionId);
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, connected: false, status: "disconnected", error: undefined } : session
      )
    );
  }

  async function duplicateSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.kind === "local") {
      await openLocalSession();
      return;
    }
    if (!session.connectParams) return;
    await connectHost({
      name: session.connectParams.name,
      hostname: session.connectParams.hostname,
      port: session.connectParams.port,
      username: session.connectParams.username,
      password: session.connectParams.password,
      keyPath: session.connectParams.keyPath,
      group: session.connectParams.group
    });
  }

  function closeTab(sessionId: string) {
    void nativeBridge.disconnect(sessionId);
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    setTerminalHistories((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    if (activeSessionId === sessionId) {
      const next = sessions.find((session) => session.id !== sessionId);
      setActiveSessionId(next?.id || "");
    }
  }

  function closeOtherTabs(sessionId: string) {
    sessions.filter((session) => session.id !== sessionId).forEach((session) => {
      void nativeBridge.disconnect(session.id);
    });
    setSessions((current) => current.filter((session) => session.id === sessionId));
    setTerminalHistories((current) => {
      const keep = current[sessionId];
      return keep ? { [sessionId]: keep } : {};
    });
    setActiveSessionId(sessionId);
  }

  function closeAllTabs() {
    sessions.forEach((session) => {
      void nativeBridge.disconnect(session.id);
    });
    setSessions([]);
    setTerminalHistories({});
    setActiveSessionId("");
  }

  function addAiQuote(text: string, sourceTitle: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const quote: AiQuote = {
      id: crypto.randomUUID?.() || `quote_${Date.now()}`,
      sourceTitle,
      text: trimmed
    };
    setAiQuotes((current) => [quote, ...current].slice(0, 8));
    setActiveTool("local");
    setTerminalSidePanel("ai");
  }

  function toggleHighlightRule(ruleId: string) {
    setHighlightRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule))
    );
  }

  function addHighlightRule(rule: Pick<HighlightRule, "name" | "pattern" | "foreground">) {
    if (!rule.name.trim() || !rule.pattern.trim()) return;
    setHighlightRules((current) => [
      ...current,
      {
        id: `custom_${Date.now()}`,
        name: rule.name.trim(),
        pattern: rule.pattern.trim(),
        flags: "gi",
        enabled: true,
        scope: "terminal",
        foreground: rule.foreground,
        priority: 100 + current.length
      }
    ]);
  }

  function deleteHighlightRule(ruleId: string) {
    setHighlightRules((current) => current.filter((rule) => rule.system || rule.id !== ruleId));
  }

  function updateCommandFolders(nextFolders: CommandFolder[]) {
    setCommandFolders(nextFolders);
    void nativeBridge.saveCommandLibrary(nextFolders);
  }

  function addCommandFolder(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder: CommandFolder = {
      id: `folder_${Date.now()}`,
      name: trimmed,
      commands: []
    };
    updateCommandFolders([...commandFolders, folder]);
    setActiveCommandFolderId(folder.id);
  }

  function requestDeleteCommandFolder(folderId: string) {
    if (commandFolders.length <= 1) return;
    const folder = commandFolders.find((item) => item.id === folderId);
    setDeleteConfirmation({
      description: `确定删除文件夹“${folder?.name || "未命名文件夹"}”？文件夹内命令也会一起删除。`,
      onConfirm: () => deleteCommandFolder(folderId)
    });
  }

  function deleteCommandFolder(folderId: string) {
    const next = commandFolders.filter((folder) => folder.id !== folderId);
    updateCommandFolders(next);
    setActiveCommandFolderId((current) => (current === folderId ? next[0]?.id || "" : current));
  }

  function saveCommand(folderId: string, command: Omit<CommandItem, "id">, commandId?: string) {
    if (!command.name.trim() || !command.command.trim()) return;
    const next = commandFolders.map((folder) => {
      if (folder.id !== folderId) return folder;
      const item: CommandItem = {
        id: commandId || `cmd_${Date.now()}`,
        name: command.name.trim(),
        command: command.command.trim(),
        description: command.description?.trim()
      };
      const exists = folder.commands.some((current) => current.id === item.id);
      return {
        ...folder,
        commands: exists
          ? folder.commands.map((current) => (current.id === item.id ? item : current))
          : [...folder.commands, item]
      };
    });
    updateCommandFolders(next);
  }

  function requestDeleteCommand(folderId: string, commandId: string) {
    const folder = commandFolders.find((item) => item.id === folderId);
    const command = folder?.commands.find((item) => item.id === commandId);
    setDeleteConfirmation({
      description: `确定删除命令“${command?.name || "未命名命令"}”？`,
      onConfirm: () => deleteCommand(folderId, commandId)
    });
  }

  function deleteCommand(folderId: string, commandId: string) {
    updateCommandFolders(
      commandFolders.map((folder) =>
        folder.id === folderId
          ? { ...folder, commands: folder.commands.filter((command) => command.id !== commandId) }
          : folder
      )
    );
  }

  async function importCommandLibrary(source: string) {
    setCommandTransferStatus("");
    const selected = await nativeBridge.showOpenFileDialog(source === "FinalShell" ? "选择 FinalShell 命令文件" : "选择命令库文件");
    if (!selected.filePath) return;

    const file = await nativeBridge.readBase64File(selected.filePath);
    if (!file.content) {
      setCommandTransferStatus("读取命令文件失败。");
      return;
    }

    const text = new TextDecoder("utf-8").decode(base64ToBytes(file.content));
    const imported = parseCommandLibraryImport(text, source);
    if (imported.imported === 0) {
      setCommandTransferStatus("未找到可导入的命令。");
      return;
    }

    const next = mergeCommandFolders(commandFolders, imported.folders);
    updateCommandFolders(next);
    const firstImportedFolder = imported.folders[0]?.name;
    const activeImportedFolder = next.find((folder) => folder.name === firstImportedFolder);
    setActiveCommandFolderId(activeImportedFolder?.id || next[0]?.id || "");
    setCommandTransferStatus(`已从 ${source} 导入 ${imported.imported} 条命令。`);
  }

  async function exportCommandLibrary() {
    setCommandTransferStatus("");
    const selected = await nativeBridge.showSaveFileDialog("ldyssh-commands.json");
    if (!selected.filePath) return;

    const content = serializeCommandLibraryExport(commandFolders);
    const result = await nativeBridge.writeBase64File(
      selected.filePath,
      bytesToBase64(new TextEncoder().encode(content))
    );
    setCommandTransferStatus(result.success ? "命令库已导出。" : result.error || "导出命令库失败。");
  }

  function sendCommandToActiveSession(command: string) {
    if (!activeSession) return;
    const data = command.endsWith("\n") ? command : `${command}\n`;
    void nativeBridge.sendInputBase64(activeSession.id, bytesToBase64(new TextEncoder().encode(data)));
    setTerminalCommandNotice({ sessionId: activeSession.id, command });
    setTerminalFocusRequest((current) => current + 1);
    setActiveTool("local");
    setTerminalSidePanel("commands");
  }

  async function confirmDelete() {
    const pending = deleteConfirmation;
    if (!pending) return;
    setDeleteConfirmation(null);
    await pending.onConfirm();
  }

  return (
    <div
      data-testid="app-root"
      data-theme={getThemeAttribute(theme)}
      className="app-root h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="grid h-full grid-cols-[54px_244px_minmax(0,1fr)] grid-rows-[36px_minmax(0,1fr)] border border-[var(--app-line)] bg-[var(--app-bg)]">
        <TitleBar />
        <ActivityRail activeTool={activeTool} onChange={setActiveTool} />
        <HostSidebar
          savedConnections={filteredConnections}
          sessions={sessions}
          activeSessionId={activeSessionId}
          commandSuggestionView={activeTool === "local" ? commandSuggestionView : null}
          query={query}
          onQueryChange={setQuery}
          onOpenDialog={openNewConnectionDialog}
          onRefresh={refreshConnections}
          onConnect={connectHost}
          onEditConnection={openEditConnectionDialog}
          onDeleteConnection={requestDeleteSavedConnection}
          onCreateLocal={openLocalSession}
          onActivateSession={activateSession}
        />
        <main className="min-w-0 overflow-hidden">
          {activeTool === "ssh" && (
            <Workbench
              savedConnections={filteredConnections}
              query={query}
              onQueryChange={setQuery}
              onOpenDialog={openNewConnectionDialog}
              onRefresh={refreshConnections}
              onConnect={connectHost}
              onEditConnection={openEditConnectionDialog}
              onDeleteConnection={requestDeleteSavedConnection}
            />
          )}
          {activeTool === "cmd" && (
            <CommandPanel
              folders={commandFolders}
              activeFolderId={activeCommandFolderId}
              activeSession={activeSession}
              onActiveFolderChange={setActiveCommandFolderId}
              onAddFolder={addCommandFolder}
              onDeleteFolder={requestDeleteCommandFolder}
              onSaveCommand={saveCommand}
              onDeleteCommand={requestDeleteCommand}
              onSendCommand={sendCommandToActiveSession}
              onImportCommands={importCommandLibrary}
              onExportCommands={exportCommandLibrary}
              transferStatus={commandTransferStatus}
            />
          )}
          {activeTool === "monitor" && <MonitorPanel activeSession={activeSession} />}
          {activeTool === "browser" && (
            <BrowserPanel
              favorites={webFavorites}
              onRefresh={refreshWebFavorites}
              onAdd={addWebFavorite}
              onDelete={deleteWebFavorite}
              onOpen={openWebFavorite}
            />
          )}
          <div className={cn("h-full", activeTool === "local" ? "block" : "hidden")} aria-hidden={activeTool !== "local"}>
            <TerminalWorkspace
              visible={activeTool === "local"}
              sessions={sessions}
              activeSessionId={activeSessionId}
              terminalTheme={terminalTheme}
              terminalAppearance={terminalAppearance}
              terminalBackgroundImage={terminalBackgroundImage}
              terminalBackgroundOverlay={terminalBackgroundOverlay}
              commandSuggestionsEnabled={commandSuggestionsEnabled}
              commandSuggestionSources={commandSuggestionSources}
              commandSuggestionApplyKey={commandSuggestionApplyKey}
              commandSuggestionCustomApplyKey={commandSuggestionCustomApplyKey}
              highlightRules={highlightRules}
              commandFolders={commandFolders}
              activeCommandFolderId={activeCommandFolderId}
              sidePanel={terminalSidePanel}
              terminalFocusRequest={terminalFocusRequest}
              terminalCommandNotice={terminalCommandNotice}
              aiQuotes={aiQuotes}
              aiConfig={aiConfig}
              terminalHistory={activeSession ? terminalHistories[activeSession.id] || "" : ""}
              onActivate={setActiveSessionId}
              onClose={closeTab}
              onDuplicate={duplicateSession}
              onReconnect={retrySession}
              onDisconnect={disconnectSession}
              onCloseOther={closeOtherTabs}
              onCloseAll={closeAllTabs}
              onReturnHome={() => setActiveTool("ssh")}
              onCreateLocal={openLocalSession}
              onAddAiQuote={addAiQuote}
              onTerminalOutput={appendTerminalHistory}
              onCommandSuggestionViewChange={setCommandSuggestionView}
              onActiveCommandFolderChange={setActiveCommandFolderId}
              onSendCommand={sendCommandToActiveSession}
              onSidePanelChange={setTerminalSidePanel}
              onAiConfigChange={setAiConfig}
            />
          </div>
          {activeTool === "settings" && (
            <SettingsPanel
              theme={theme}
              terminalTheme={terminalTheme}
              terminalAppearance={terminalAppearance}
              terminalBackgroundImage={terminalBackgroundImage}
              terminalBackgroundOverlay={terminalBackgroundOverlay}
              commandSuggestionsEnabled={commandSuggestionsEnabled}
              commandSuggestionSources={commandSuggestionSources}
              commandSuggestionApplyKey={commandSuggestionApplyKey}
              commandSuggestionCustomApplyKey={commandSuggestionCustomApplyKey}
              highlightRules={highlightRules}
              onThemeChange={setTheme}
              onTerminalThemeChange={setTerminalTheme}
              onTerminalAppearanceChange={setTerminalAppearance}
              onTerminalBackgroundImageChange={setTerminalBackgroundImage}
              onTerminalBackgroundOverlayChange={setTerminalBackgroundOverlay}
              onCommandSuggestionsEnabledChange={setCommandSuggestionsEnabled}
              onCommandSuggestionSourcesChange={setCommandSuggestionSources}
              onCommandSuggestionApplyKeyChange={setCommandSuggestionApplyKey}
              onCommandSuggestionCustomApplyKeyChange={setCommandSuggestionCustomApplyKey}
              onToggleHighlightRule={toggleHighlightRule}
              onAddHighlightRule={addHighlightRule}
              onDeleteHighlightRule={deleteHighlightRule}
            />
          )}
        </main>
      </div>

      <ConnectDialog
        open={connectOpen}
        form={form}
        error={connectError}
        mode={editingConnectionKey ? "edit" : "create"}
        onOpenChange={setConnectOpen}
        onFormChange={setForm}
        onConnect={() => connectHost()}
        onSave={saveEditedConnection}
        onBrowseKey={browseKeyFile}
      />
      <RetryPasswordDialog
        prompt={passwordPrompt}
        onPasswordChange={(password) => setPasswordPrompt((current) => current ? { ...current, password } : current)}
        onRetry={submitRetryPassword}
        onClose={() => setPasswordPrompt(null)}
      />
      <DeleteConfirmationDialog
        confirmation={deleteConfirmation}
        onCancel={() => setDeleteConfirmation(null)}
        onConfirm={confirmDelete}
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
              title={tool.title}
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
  sessions,
  activeSessionId,
  commandSuggestionView,
  query,
  onQueryChange,
  onOpenDialog,
  onRefresh,
  onConnect,
  onEditConnection,
  onDeleteConnection,
  onCreateLocal,
  onActivateSession
}: {
  savedConnections: SavedConnection[];
  sessions: SessionTab[];
  activeSessionId: string;
  commandSuggestionView: CommandSuggestionView | null;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenDialog: () => void;
  onRefresh: () => void;
  onConnect: (connection: SavedConnection) => void;
  onEditConnection: (connection: SavedConnection) => void;
  onDeleteConnection: (connection: SavedConnection) => void;
  onCreateLocal: () => void;
  onActivateSession: (sessionId: string) => void;
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
                <div
                  key={`${connection.hostname}-${connection.username}-${index}`}
                  className="grid grid-cols-[minmax(0,1fr)_30px_30px] items-center gap-1 rounded-md px-3 py-2 hover:bg-white"
                >
                  <button className="min-w-0 text-left" onClick={() => onConnect(connection)}>
                    <div className="truncate text-sm font-medium text-slate-900">
                      {connection.name || connection.hostname}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {connection.username || "user"}@{connection.hostname || "host"}:{connection.port || 22}
                    </div>
                  </button>
                  <button
                    aria-label={`编辑 ${connection.name || connection.hostname}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => onEditConnection(connection)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label={`删除 ${connection.name || connection.hostname}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => onDeleteConnection(connection)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="活动会话" count={sessions.length} open>
          {sessions.length > 0 && (
            <div className="mb-2 space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  aria-label={`切换到 ${session.title}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                    session.id === activeSessionId ? "bg-white text-slate-950" : "text-slate-700 hover:bg-white"
                  )}
                  onClick={() => onActivateSession(session.id)}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      session.connected ? "bg-emerald-500" : session.status === "failed" ? "bg-rose-500" : "bg-amber-400"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                </button>
              ))}
            </div>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-white"
            onClick={onCreateLocal}
          >
            <Terminal className="h-4 w-4 text-slate-500" />
            打开 Local Shell
          </button>
        </SidebarSection>
        <div className="mt-auto px-6 pb-6" data-testid="left-command-suggestion-slot">
          {commandSuggestionView && <CommandSuggestionPanel view={commandSuggestionView} />}
        </div>
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
  onConnect,
  onEditConnection,
  onDeleteConnection
}: {
  savedConnections: SavedConnection[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpenDialog: () => void;
  onRefresh: () => void;
  onConnect: (connection: SavedConnection) => void;
  onEditConnection: (connection: SavedConnection) => void;
  onDeleteConnection: (connection: SavedConnection) => void;
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
                <div
                  key={`${connection.hostname}-${connection.username}-${index}`}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
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
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        aria-label={`编辑 ${connection.name || connection.hostname}`}
                        title={`编辑 ${connection.name || connection.hostname}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        onClick={() => onEditConnection(connection)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={`删除 ${connection.name || connection.hostname}`}
                        title={`删除 ${connection.name || connection.hostname}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-100 bg-white text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => onDeleteConnection(connection)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={`连接 ${connection.name || connection.hostname}`}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        onClick={() => onConnect(connection)}
                      >
                        连接
                      </button>
                    </div>
                  </div>
                </div>
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
  visible,
  sessions,
  activeSessionId,
  terminalTheme,
  terminalAppearance,
  terminalBackgroundImage,
  terminalBackgroundOverlay,
  commandSuggestionsEnabled,
  commandSuggestionSources,
  commandSuggestionApplyKey,
  commandSuggestionCustomApplyKey,
  highlightRules,
  commandFolders,
  activeCommandFolderId,
  sidePanel,
  terminalFocusRequest,
  terminalCommandNotice,
  aiQuotes,
  aiConfig,
  terminalHistory,
  onActivate,
  onClose,
  onDuplicate,
  onReconnect,
  onDisconnect,
  onCloseOther,
  onCloseAll,
  onReturnHome,
  onCreateLocal,
  onAddAiQuote,
  onTerminalOutput,
  onCommandSuggestionViewChange,
  onActiveCommandFolderChange,
  onSendCommand,
  onSidePanelChange,
  onAiConfigChange
}: {
  visible: boolean;
  sessions: SessionTab[];
  activeSessionId: string;
  terminalTheme: TerminalThemeMode;
  terminalAppearance: TerminalAppearance;
  terminalBackgroundImage: string;
  terminalBackgroundOverlay: number;
  commandSuggestionsEnabled: boolean;
  commandSuggestionSources: CommandSuggestionSources;
  commandSuggestionApplyKey: CommandSuggestionApplyKey;
  commandSuggestionCustomApplyKey: CommandSuggestionCustomApplyKey | null;
  highlightRules: HighlightRule[];
  commandFolders: CommandFolder[];
  activeCommandFolderId: string;
  sidePanel: TerminalSidePanel;
  terminalFocusRequest: number;
  terminalCommandNotice: TerminalCommandNotice | null;
  aiQuotes: AiQuote[];
  aiConfig: AiConfig;
  terminalHistory: string;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onDuplicate: (sessionId: string) => void;
  onReconnect: (sessionId: string) => void;
  onDisconnect: (sessionId: string) => void;
  onCloseOther: (sessionId: string) => void;
  onCloseAll: () => void;
  onReturnHome: () => void;
  onCreateLocal: () => void;
  onAddAiQuote: (text: string, sourceTitle: string) => void;
  onTerminalOutput: (sessionId: string, text: string) => void;
  onCommandSuggestionViewChange: (view: CommandSuggestionView | null) => void;
  onActiveCommandFolderChange: (folderId: string) => void;
  onSendCommand: (command: string) => void;
  onSidePanelChange: (panel: TerminalSidePanel) => void;
  onAiConfigChange: (config: AiConfig) => void;
}) {
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const [tabMenu, setTabMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [shortcutParameterRequest, setShortcutParameterRequest] = useState<ShortcutParameterRequest | null>(null);
  const menuSession = tabMenu ? sessions.find((session) => session.id === tabMenu.sessionId) : undefined;

  function openTabMenu(event: ReactMouseEvent, sessionId: string) {
    event.preventDefault();
    onActivate(sessionId);
    setTabMenu({ sessionId, x: event.clientX, y: event.clientY });
  }

  function runTabAction(action: (sessionId: string) => void) {
    if (!tabMenu) return;
    action(tabMenu.sessionId);
    setTabMenu(null);
  }

  function requestShortcutParameters(shortcut: NonNullable<CommandSuggestion["shortcut"]>) {
    onSidePanelChange("commands");
    setShortcutParameterRequest((current) => ({
      ...shortcut,
      requestId: (current?.requestId || 0) + 1
    }));
  }

  return (
    <div className="grid h-full grid-rows-[34px_minmax(0,1fr)_34px] bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 pl-3 pr-4">
        <div className="flex h-full min-w-0 flex-1 items-center gap-1">
          <button
            className="flex h-7 w-8 items-center justify-center rounded-md bg-slate-900 text-white"
            onClick={onReturnHome}
            title="回到桌面"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            className="mr-2 flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={onCreateLocal}
            title="新建本地终端"
          >
            <Plus className="h-4 w-4" />
          </button>
          {sessions.map((session) => (
            <div
              key={session.id}
              onContextMenu={(event) => openTabMenu(event, session.id)}
              className={cn(
                "flex h-7 max-w-48 items-center gap-2 rounded-md border px-3 text-xs font-medium",
                session.id === activeSessionId
                  ? "border-slate-300 bg-white text-slate-950"
                  : "border-transparent text-slate-500 hover:bg-white"
              )}
            >
              <button className="min-w-0 truncate" onClick={() => onActivate(session.id)} onContextMenu={(event) => openTabMenu(event, session.id)}>
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
        {menuSession && tabMenu && (
          <div
            role="menu"
            className="fixed z-50 w-36 rounded-md border border-slate-200 bg-white py-1 text-xs font-medium text-slate-700 shadow-lg"
            style={{ left: tabMenu.x, top: tabMenu.y }}
            onMouseLeave={() => setTabMenu(null)}
          >
            <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => runTabAction(onDuplicate)}>
              <Plus className="h-3.5 w-3.5" />
              复制标签
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={menuSession.kind !== "ssh" || !menuSession.connectParams}
              onClick={() => runTabAction(onReconnect)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重连
            </button>
            <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => runTabAction(onDisconnect)}>
              <X className="h-3.5 w-3.5" />
              断开
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => runTabAction(onClose)}>
              <X className="h-3.5 w-3.5" />
              关闭
            </button>
            <button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => runTabAction(onCloseOther)}>
              <Menu className="h-3.5 w-3.5" />
              关闭其他
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
              onClick={() => {
                onCloseAll();
                setTabMenu(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
              关闭全部
            </button>
          </div>
        )}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_420px]">
        <TerminalSurface
          visible={visible}
          activeSession={activeSession}
          terminalTheme={terminalTheme}
          terminalAppearance={terminalAppearance}
          terminalBackgroundImage={terminalBackgroundImage}
          terminalBackgroundOverlay={terminalBackgroundOverlay}
          commandSuggestionsEnabled={commandSuggestionsEnabled}
          commandSuggestionSources={commandSuggestionSources}
          commandSuggestionApplyKey={commandSuggestionApplyKey}
          commandSuggestionCustomApplyKey={commandSuggestionCustomApplyKey}
          commandFolders={commandFolders}
          highlightRules={highlightRules}
          initialTranscript={terminalHistory}
          focusRequest={terminalFocusRequest}
          commandNotice={terminalCommandNotice}
          onCommandSuggestionViewChange={onCommandSuggestionViewChange}
          onShortcutParameterRequest={requestShortcutParameters}
          onAddAiQuote={(text) => onAddAiQuote(text, activeSession?.title || "终端")}
          onOutput={onTerminalOutput}
        />
        {visible && (
          <TerminalRightSidebar
            activePanel={sidePanel}
            activeSession={activeSession}
            commandFolders={commandFolders}
            activeCommandFolderId={activeCommandFolderId}
            shortcutParameterRequest={shortcutParameterRequest}
            aiQuotes={aiQuotes}
            aiConfig={aiConfig}
            onPanelChange={onSidePanelChange}
            onActiveCommandFolderChange={onActiveCommandFolderChange}
            onSendCommand={onSendCommand}
            onAiConfigChange={onAiConfigChange}
          />
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 text-xs text-slate-500">
        <span className={cn("h-2 w-2 rounded-full", activeSession?.connected ? "bg-emerald-500" : "bg-slate-300")} />
        <span>
          {activeSession?.status === "connecting"
            ? "连接中"
            : activeSession?.status === "failed"
              ? "连接失败"
              : activeSession
                ? "已连接"
                : "未连接"}
        </span>
        <span>{activeSession?.title || "无活动会话"}</span>
        {activeSession?.error && <span className="truncate text-rose-600">{activeSession.error}</span>}
      </div>
    </div>
  );
}

function CommandSuggestionPanel({ view }: { view: CommandSuggestionView }) {
  const [layout, setLayout] = useState<CommandSuggestionPanelLayout>(() => loadStoredCommandSuggestionPanelLayout());

  function updateLayout(next: CommandSuggestionPanelLayout) {
    const normalized = normalizeCommandSuggestionPanelLayout(next);
    setLayout(normalized);
    window.localStorage.setItem(storageKeys.commandSuggestionPanel, JSON.stringify(normalized));
  }

  function startMove(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layout;

    function move(moveEvent: MouseEvent) {
      updateLayout({
        ...startLayout,
        left: startLayout.left + moveEvent.clientX - startX,
        bottom: startLayout.bottom - (moveEvent.clientY - startY)
      });
    }

    function stopMove() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stopMove);
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stopMove);
  }

  function startResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layout;

    function resize(moveEvent: MouseEvent) {
      updateLayout({
        ...startLayout,
        width: startLayout.width + moveEvent.clientX - startX,
        height: startLayout.height + moveEvent.clientY - startY
      });
    }

    function stopResize() {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResize);
    }

    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResize);
  }

  return (
    <div
      data-testid="command-suggestion-panel"
      role="listbox"
      className="fixed z-30 flex min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
      style={{ left: layout.left, bottom: layout.bottom, width: layout.width, height: layout.height }}
    >
      <button
        type="button"
        aria-label="移动命令提示"
        className="h-4 shrink-0 cursor-move border-b border-slate-100 bg-slate-50 hover:bg-blue-50"
        onMouseDown={startMove}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-1 pr-3">
        {view.suggestions.slice(0, 6).map((suggestion, index) => (
          <button
            key={suggestion.id}
            type="button"
            role="option"
            aria-selected={index === view.activeIndex}
            title={suggestion.command}
            className={cn(
              "min-h-10 w-full min-w-0 shrink-0 rounded px-2 py-1 text-left",
              index === view.activeIndex ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              view.onApply(suggestion);
            }}
          >
            <span className="block truncate text-[11px] font-semibold">{suggestion.command}</span>
            <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-400">
              {suggestion.description || suggestion.label || suggestion.source}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        role="separator"
        aria-label="调整命令提示大小"
        aria-orientation="vertical"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-br-md border-l border-t border-slate-200 bg-slate-50 hover:bg-blue-50"
        onMouseDown={startResize}
      />
    </div>
  );
}

function TerminalSurface({
  visible,
  activeSession,
  terminalTheme,
  terminalAppearance,
  terminalBackgroundImage,
  terminalBackgroundOverlay,
  commandSuggestionsEnabled,
  commandSuggestionSources,
  commandSuggestionApplyKey,
  commandSuggestionCustomApplyKey,
  commandFolders,
  highlightRules,
  initialTranscript,
  focusRequest,
  commandNotice,
  onCommandSuggestionViewChange,
  onShortcutParameterRequest,
  onAddAiQuote,
  onOutput
}: {
  visible: boolean;
  activeSession?: SessionTab;
  terminalTheme: TerminalThemeMode;
  terminalAppearance: TerminalAppearance;
  terminalBackgroundImage: string;
  terminalBackgroundOverlay: number;
  commandSuggestionsEnabled: boolean;
  commandSuggestionSources: CommandSuggestionSources;
  commandSuggestionApplyKey: CommandSuggestionApplyKey;
  commandSuggestionCustomApplyKey: CommandSuggestionCustomApplyKey | null;
  commandFolders: CommandFolder[];
  highlightRules: HighlightRule[];
  initialTranscript: string;
  focusRequest: number;
  commandNotice: TerminalCommandNotice | null;
  onCommandSuggestionViewChange: (view: CommandSuggestionView | null) => void;
  onShortcutParameterRequest: (shortcut: NonNullable<CommandSuggestion["shortcut"]>) => void;
  onAddAiQuote: (text: string) => void;
  onOutput: (sessionId: string, text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const activeIdRef = useRef("");
  const visibleRef = useRef(visible);
  const lastValidTerminalSizeRef = useRef({ cols: 80, rows: 24 });
  const [selectedText, setSelectedText] = useState("");
  const [terminalMenu, setTerminalMenu] = useState<{ x: number; y: number; selection: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchMatches = useMemo(
    () => findTerminalSearchMatches(initialTranscript, searchQuery),
    [initialTranscript, searchQuery]
  );
  const visibleMatchIndex = searchMatches.length === 0 ? 0 : Math.min(activeMatchIndex, searchMatches.length - 1);
  const activeMatch = searchMatches[visibleMatchIndex];
  const [commandSuggestions, setCommandSuggestions] = useState<CommandSuggestion[]>([]);
  const [activeCommandSuggestionIndex, setActiveCommandSuggestionIndexState] = useState(0);
  const commandFoldersRef = useRef(commandFolders);
  const commandSuggestionsEnabledRef = useRef(commandSuggestionsEnabled);
  const commandSuggestionSourcesRef = useRef(commandSuggestionSources);
  const commandSuggestionApplyKeyRef = useRef(commandSuggestionApplyKey);
  const commandSuggestionCustomApplyKeyRef = useRef(commandSuggestionCustomApplyKey);
  const commandSuggestionsRef = useRef<CommandSuggestion[]>([]);
  const activeCommandSuggestionIndexRef = useRef(0);
  const commandInputRef = useRef("");
  const commandHistoryRef = useRef<string[]>([]);
  const rawCommandModeRef = useRef(false);

  commandFoldersRef.current = commandFolders;
  commandSuggestionsEnabledRef.current = commandSuggestionsEnabled;
  commandSuggestionSourcesRef.current = commandSuggestionSources;
  commandSuggestionApplyKeyRef.current = commandSuggestionApplyKey;
  commandSuggestionCustomApplyKeyRef.current = commandSuggestionCustomApplyKey;
  visibleRef.current = visible;

  function focusTerminal() {
    if (!visibleRef.current) return;
    terminalRef.current?.focus();
  }

  function refitAndFocusTerminal() {
    if (!visibleRef.current) return;
    fitRef.current?.fit();
    const terminal = terminalRef.current;
    if (terminal) {
      if (terminal.cols < 20 || terminal.rows < 5) {
        const previous = lastValidTerminalSizeRef.current;
        terminal.resize(previous.cols, previous.rows);
      } else {
        lastValidTerminalSizeRef.current = { cols: terminal.cols, rows: terminal.rows };
      }
    }
    terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
    focusTerminal();
  }

  function setActiveCommandSuggestionIndex(index: number) {
    activeCommandSuggestionIndexRef.current = index;
    setActiveCommandSuggestionIndexState(index);
  }

  function setCommandSuggestionList(next: CommandSuggestion[]) {
    commandSuggestionsRef.current = next;
    setCommandSuggestions(next);
    setActiveCommandSuggestionIndex(0);
  }

  function refreshCommandSuggestionList(draft = commandInputRef.current) {
    if (!commandSuggestionsEnabledRef.current || rawCommandModeRef.current) {
      setCommandSuggestionList([]);
      return;
    }
    setCommandSuggestionList(buildCommandSuggestions(draft, commandHistoryRef.current, commandFoldersRef.current, commandSuggestionSourcesRef.current));
  }

  function resetCommandInput() {
    commandInputRef.current = "";
    setCommandSuggestionList([]);
  }

  function updateCommandInputFromData(data: string) {
    if (data.includes("\x03")) {
      rawCommandModeRef.current = false;
      resetCommandInput();
      return;
    }

    if (rawCommandModeRef.current) return;
    if (data.startsWith("\x1b")) {
      setCommandSuggestionList([]);
      return;
    }

    let draft = commandInputRef.current;
    let submittedCommand = "";

    for (const char of data) {
      if (char === "\r" || char === "\n") {
        submittedCommand = draft.trim();
        draft = "";
        continue;
      }
      if (char === "\x7f" || char === "\b") {
        draft = draft.slice(0, -1);
        continue;
      }
      if (char === "\x15") {
        draft = "";
        continue;
      }
      if (char < " ") continue;
      draft += char;
    }

    commandInputRef.current = draft;
    if (submittedCommand) {
      commandHistoryRef.current = recordCommandHistory(commandHistoryRef.current, submittedCommand);
      rawCommandModeRef.current = isFullScreenCommand(submittedCommand);
    }
    refreshCommandSuggestionList(draft);
  }

  function maybeLeaveRawCommandMode(output: string) {
    if (!rawCommandModeRef.current) return;
    const clean = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    if (/(^|\r?\n)[^\r\n]{0,120}[$#>]\s?$/.test(clean)) {
      rawCommandModeRef.current = false;
    }
  }

  function moveCommandSuggestion(direction: 1 | -1) {
    const count = commandSuggestionsRef.current.length;
    if (count === 0) return;
    setActiveCommandSuggestionIndex((activeCommandSuggestionIndexRef.current + direction + count) % count);
  }

  function applyCommandSuggestion(suggestion: CommandSuggestion) {
    const sessionId = activeIdRef.current;
    const draft = commandInputRef.current;
    const shortcutParameters = suggestion.shortcut ? extractCommandParameters(suggestion.command) : [];
    if (suggestion.shortcut && shortcutParameters.length > 0) {
      const eraseDraft = "\x7f".repeat(Array.from(draft).length);
      commandInputRef.current = "";
      setCommandSuggestionList([]);
      if (sessionId && eraseDraft) {
        void nativeBridge.sendInputBase64(sessionId, bytesToBase64(new TextEncoder().encode(eraseDraft)));
      }
      onShortcutParameterRequest(suggestion.shortcut);
      return;
    }

    const suffix = suggestion.command.toLowerCase().startsWith(draft.toLowerCase())
      ? suggestion.command.slice(draft.length)
      : suggestion.command;

    commandInputRef.current = suggestion.command;
    setCommandSuggestionList([]);
    if (!sessionId || !suffix) return;
    void nativeBridge.sendInputBase64(sessionId, bytesToBase64(new TextEncoder().encode(suffix)));
  }

  function isCommandSuggestionApplyKey(event: globalThis.KeyboardEvent) {
    const applyKey = commandSuggestionApplyKeyRef.current;
    if (applyKey === "tab") return event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (applyKey === "ctrlSpace") return event.ctrlKey && !event.altKey && !event.metaKey && (event.code === "Space" || event.key === " ");
    if (applyKey === "altEnter") return event.altKey && !event.ctrlKey && !event.metaKey && event.key === "Enter";

    const custom = commandSuggestionCustomApplyKeyRef.current;
    return Boolean(
      custom &&
        event.key === custom.key &&
        event.code === custom.code &&
        event.ctrlKey === custom.ctrlKey &&
        event.altKey === custom.altKey &&
        event.shiftKey === custom.shiftKey &&
        event.metaKey === custom.metaKey
    );
  }

  function handleCommandSuggestionKey(event: globalThis.KeyboardEvent) {
    if (event.type !== "keydown" || commandSuggestionsRef.current.length === 0) return true;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveCommandSuggestion(event.key === "ArrowDown" ? 1 : -1);
      return false;
    }

    if (isCommandSuggestionApplyKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      applyCommandSuggestion(commandSuggestionsRef.current[activeCommandSuggestionIndexRef.current] || commandSuggestionsRef.current[0]);
      return false;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setCommandSuggestionList([]);
      return false;
    }

    return true;
  }

  useEffect(() => {
    activeIdRef.current = activeSession?.id || "";
  }, [activeSession?.id]);

  useEffect(() => {
    if (visible && activeSession) {
      refitAndFocusTerminal();
      window.requestAnimationFrame(refitAndFocusTerminal);
    }
  }, [visible, activeSession?.id]);

  useEffect(() => {
    if (!activeSession) return;

    function restoreTerminalRender() {
      refitAndFocusTerminal();
      window.requestAnimationFrame(refitAndFocusTerminal);
    }

    function handleVisibilityChange() {
      if (!document.hidden) restoreTerminalRender();
    }

    window.addEventListener("focus", restoreTerminalRender);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", restoreTerminalRender);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeSession?.id]);

  useEffect(() => {
    rawCommandModeRef.current = false;
    resetCommandInput();
  }, [activeSession?.id]);

  useEffect(() => {
    if (!commandSuggestionsEnabled) {
      setCommandSuggestionList([]);
    }
    refreshCommandSuggestionList();
  }, [commandSuggestionsEnabled, commandSuggestionSources]);

  useEffect(() => {
    if (commandSuggestions.length === 0) {
      onCommandSuggestionViewChange(null);
      return;
    }
    onCommandSuggestionViewChange({
      suggestions: commandSuggestions,
      activeIndex: activeCommandSuggestionIndex,
      onApply: applyCommandSuggestion
    });
  }, [activeCommandSuggestionIndex, commandSuggestions, onCommandSuggestionViewChange]);

  useEffect(() => () => onCommandSuggestionViewChange(null), [onCommandSuggestionViewChange]);

  useEffect(() => {
    if (!commandNotice || commandNotice.sessionId !== activeSession?.id) return;
    resetCommandInput();
    rawCommandModeRef.current = isFullScreenCommand(commandNotice.command);
  }, [activeSession?.id, commandNotice]);

  const onOutputRef = useRef(onOutput);

  useEffect(() => {
    onOutputRef.current = onOutput;
  }, [onOutput]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [activeSession?.id, searchQuery]);

  useEffect(() => {
    if (activeMatchIndex >= searchMatches.length) {
      setActiveMatchIndex(Math.max(0, searchMatches.length - 1));
    }
  }, [activeMatchIndex, searchMatches.length]);

  async function pasteTerminalClipboard(sessionId: string) {
    const result = await nativeBridge.clipboardPaste();
    if (result.success && result.text) {
      await nativeBridge.sendInputBase64(sessionId, bytesToBase64(new TextEncoder().encode(normalizePasteText(result.text))));
    }
  }

  function openTerminalMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const selection = terminalRef.current?.getSelection() || selectedText;
    setTerminalMenu({ x: event.clientX, y: event.clientY, selection });
  }

  async function copyTerminalSelection(selection: string) {
    if (!selection) return;
    await nativeBridge.clipboardCopy(selection);
    terminalRef.current?.clearSelection();
    setSelectedText("");
    setTerminalMenu(null);
  }

  function selectAllTerminal() {
    terminalRef.current?.selectAll();
    setTerminalMenu(null);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeSession) return;

    setSelectedText("");
    terminalRef.current?.dispose();
    const appearance = getTerminalAppearance(terminalAppearance);
    const terminalThemeOptions = getTerminalColors(terminalTheme, appearance, Boolean(terminalBackgroundImage));
    const terminal = new XTerm({
      allowProposedApi: true,
      customGlyphs: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize,
      lineHeight: 1.25,
      rightClickSelectsWord: true,
      scrollOnUserInput: true,
      scrollback: 5000,
      theme: terminalBackgroundImage
        ? { ...terminalThemeOptions, background: "rgba(0, 0, 0, 0)" }
        : terminalThemeOptions
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();
    terminal.focus();
    terminal.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      const isCtrlOrMeta = event.ctrlKey || event.metaKey;
      if (event.type === "keydown" && isCtrlOrMeta && !event.shiftKey && key === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return false;
      }
      if (event.type === "keydown" && isCtrlOrMeta && !event.shiftKey && key === "c") {
        const selection = terminal.getSelection();
        if (selection) {
          event.preventDefault();
          void nativeBridge.clipboardCopy(selection);
          terminal.clearSelection();
          setSelectedText("");
          return false;
        }
        return true;
      }
      if (
        event.type === "keydown" &&
        ((isCtrlOrMeta && key === "v") || (event.shiftKey && key === "insert"))
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          void pasteTerminalClipboard(activeSession.id);
        }
        return false;
      }
      if (!handleCommandSuggestionKey(event)) {
        return false;
      }
      return true;
    });
    terminal.writeln(`\x1b[36m${activeSession.title}\x1b[0m`);
    terminal.writeln("");
    if (initialTranscript) {
      terminal.write(applyHighlightRules(initialTranscript, highlightRules));
    }
    decoderRef.current = new TextDecoder("utf-8");
    terminal.onData((data) => {
      updateCommandInputFromData(data);
      const input = stripTerminalGeneratedReplies(data);
      if (input) {
        void nativeBridge.sendInputBase64(activeSession.id, bytesToBase64(new TextEncoder().encode(input)));
      }
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      setSelectedText(terminal.getSelection().trim());
    });

    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    const resize = () => {
      if (!visibleRef.current) return;
      fitAddon.fit();
      if (terminal.cols < 20 || terminal.rows < 5) {
        const previous = lastValidTerminalSizeRef.current;
        terminal.resize(previous.cols, previous.rows);
        return;
      }
      lastValidTerminalSizeRef.current = { cols: terminal.cols, rows: terminal.rows };
      void nativeBridge.resizeTerminal(activeSession.id, terminal.cols, terminal.rows);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const interval = window.setInterval(async () => {
      const result = await nativeBridge.getOutput(activeSession.id);
      if (result.output) {
        const output = decodeTerminalOutput(result.output, decoderRef);
        maybeLeaveRawCommandMode(output);
        terminal.write(applyHighlightRules(output, highlightRules));
        onOutput(activeSession.id, output);
      }
    }, 160);

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      selectionDisposable.dispose();
      terminal.dispose();
    };
  }, [activeSession?.id, highlightRules, terminalTheme, terminalAppearance, terminalBackgroundImage]);

  useEffect(() => {
    if (focusRequest > 0) focusTerminal();
  }, [focusRequest]);

  useEffect(() => {
    window.handlePushOutput = (sessionId, data) => {
      if (sessionId === activeIdRef.current) {
        const output = decodeTerminalOutput(data, decoderRef);
        maybeLeaveRawCommandMode(output);
        terminalRef.current?.write(applyHighlightRules(output, highlightRules));
        onOutputRef.current(sessionId, output);
      }
    };
    return () => {
      window.handlePushOutput = undefined;
    };
  }, [highlightRules]);

  function moveSearchMatch(direction: 1 | -1) {
    setActiveMatchIndex((current) => {
      if (searchMatches.length === 0) return 0;
      return (current + direction + searchMatches.length) % searchMatches.length;
    });
  }

  function handleTerminalKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }

    if (event.key === "Escape" && searchOpen) {
      event.preventDefault();
      setSearchOpen(false);
      setSearchQuery("");
      return;
    }

    focusTerminal();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSearchMatch(event.shiftKey ? -1 : 1);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      setSearchQuery("");
    }
  }

  if (!activeSession) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <EmptyState
          title="暂无活动会话"
          description="打开 Local Shell 或连接 SSH 主机后，终端会显示在这里。"
        />
      </div>
    );
  }

  const terminalColors = getTerminalColors(terminalTheme, getTerminalAppearance(terminalAppearance));
  const backgroundOverlayAlpha = terminalBackgroundOverlay / 100;
  const terminalStyle = {
    "--terminal-bg": terminalColors.background,
    "--terminal-text": terminalColors.foreground,
    backgroundColor: terminalColors.background,
    color: terminalColors.foreground,
    backgroundImage: buildTerminalBackgroundImage(terminalBackgroundImage, terminalColors.background, backgroundOverlayAlpha)
  } as CSSProperties;

  return (
    <div
      className="terminal-shell relative h-full min-h-0 overflow-hidden"
      data-testid="terminal-shell"
      data-terminal-theme={terminalTheme}
      style={terminalStyle}
      tabIndex={0}
      onPointerDown={focusTerminal}
      onMouseEnter={refitAndFocusTerminal}
      onKeyDown={handleTerminalKeyDown}
      onContextMenu={openTerminalMenu}
    >
      <div ref={containerRef} className="h-full min-h-0 overflow-hidden" />
      <button
        aria-label="查找终端输出"
        title="查找终端输出"
        className="absolute right-5 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] text-[var(--app-muted)] shadow-lg hover:bg-[var(--subtle-bg)] hover:text-[var(--app-text)]"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setSearchOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
      </button>
      {searchOpen && (
        <div
          className="absolute right-5 top-14 z-20 w-[min(380px,calc(100%-40px))] rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] p-3 text-xs text-[var(--app-text)] shadow-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-2">
            <Input
              autoFocus
              className="h-8 text-xs"
              value={searchQuery}
              placeholder="查找终端输出"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <span className="min-w-12 text-center font-semibold text-[var(--app-muted)]">
              {searchQuery.trim() && searchMatches.length > 0 ? `${visibleMatchIndex + 1} / ${searchMatches.length}` : "0 / 0"}
            </span>
            <Button
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={searchMatches.length === 0}
              onClick={() => moveSearchMatch(-1)}
            >
              上一条
            </Button>
            <Button
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={searchMatches.length === 0}
              onClick={() => moveSearchMatch(1)}
            >
              下一条
            </Button>
            <button
              aria-label="关闭查找"
              title="关闭查找"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--subtle-bg)] hover:text-[var(--app-text)]"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {searchQuery.trim() && (
            <div className="mt-3 rounded-md border border-[var(--app-line)] bg-[var(--subtle-bg)] px-3 py-2">
              {activeMatch ? (
                <>
                  <div className="mb-1 font-semibold text-[var(--app-muted)]">
                    第 {activeMatch.lineNumber} 行，第 {activeMatch.column} 列
                  </div>
                  <div className="max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono leading-5">
                    {activeMatch.line}
                  </div>
                </>
              ) : (
                <div className="text-[var(--app-muted)]">没有匹配内容</div>
              )}
            </div>
          )}
        </div>
      )}
      {selectedText && (
        <button
          className="absolute right-16 top-4 z-10 inline-flex h-8 items-center gap-2 rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] px-3 text-xs font-semibold text-[var(--app-text)] shadow-lg hover:bg-[var(--subtle-bg)]"
          onClick={() => {
            onAddAiQuote(selectedText);
            setSelectedText("");
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          添加到对话
        </button>
      )}
      {terminalMenu && activeSession && (
        <div
          role="menu"
          className="fixed z-50 min-w-36 rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] p-1 text-xs text-[var(--app-text)] shadow-xl"
          style={{ left: terminalMenu.x, top: terminalMenu.y }}
        >
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!terminalMenu.selection}
            onClick={() => void copyTerminalSelection(terminalMenu.selection)}
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--subtle-bg)]"
            onClick={() => {
              setTerminalMenu(null);
              void pasteTerminalClipboard(activeSession.id);
            }}
          >
            <Paperclip className="h-3.5 w-3.5" />
            粘贴
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--subtle-bg)]"
            onClick={selectAllTerminal}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            全选
          </button>
        </div>
      )}
    </div>
  );
}

function TerminalCommandSidebar({
  folders,
  activeFolderId,
  activeSession,
  shortcutParameterRequest,
  onActiveFolderChange,
  onSendCommand
}: {
  folders: CommandFolder[];
  activeFolderId: string;
  activeSession?: SessionTab;
  shortcutParameterRequest: ShortcutParameterRequest | null;
  onActiveFolderChange: (folderId: string) => void;
  onSendCommand: (command: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [detailCommandKey, setDetailCommandKey] = useState("");
  const [pendingCommandKey, setPendingCommandKey] = useState("");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [commandMenu, setCommandMenu] = useState<{
    x: number;
    y: number;
    command: CommandItem & { folderId: string; folderName: string };
  } | null>(null);
  const keyword = query.trim().toLowerCase();
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) || folders[0];
  const commands = (keyword
    ? folders.flatMap((folder) => folder.commands.map((command) => ({ ...command, folderId: folder.id, folderName: folder.name })))
    : (activeFolder?.commands || []).map((command) => ({ ...command, folderId: activeFolder.id, folderName: activeFolder.name }))
  ).filter((command) => {
    if (!keyword) return true;
    return [command.folderName, command.name, command.command, command.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
  const commandKey = (command: CommandItem & { folderId: string }) => `${command.folderId}:${command.id}`;
  const detailCommand = commands.find((command) => commandKey(command) === detailCommandKey);
  const pendingCommand = commands.find((command) => commandKey(command) === pendingCommandKey);
  const pendingParameters = pendingCommand ? extractCommandParameters(pendingCommand.command) : [];

  useEffect(() => {
    if (!shortcutParameterRequest) return;
    const folder = folders.find((item) => item.id === shortcutParameterRequest.folderId);
    const command = folder?.commands.find((item) => item.id === shortcutParameterRequest.commandId);
    if (!folder || !command) return;

    onActiveFolderChange(folder.id);
    setQuery("");
    setDetailCommandKey("");
    setPendingCommandKey(`${folder.id}:${command.id}`);
    setParameterValues({});
  }, [shortcutParameterRequest, folders, onActiveFolderChange]);

  function runCommand(command: CommandItem & { folderId: string }) {
    const parameters = extractCommandParameters(command.command);
    if (parameters.length) {
      setPendingCommandKey(commandKey(command));
      setDetailCommandKey("");
      setParameterValues({});
      return;
    }
    onSendCommand(command.command);
  }

  function sendPendingCommand() {
    if (!pendingCommand) return;
    onSendCommand(fillCommandParameters(pendingCommand.command, parameterValues));
    setPendingCommandKey("");
    setParameterValues({});
  }

  function openCommandMenu(event: ReactMouseEvent, command: CommandItem & { folderId: string; folderName: string }) {
    event.preventDefault();
    setCommandMenu({ x: event.clientX, y: event.clientY, command });
  }

  async function copyCommand(command: CommandItem) {
    await navigator.clipboard?.writeText(command.command);
    setCommandMenu(null);
  }

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">快捷命令栏</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {activeSession ? `发送到 ${activeSession.title}` : "打开终端后可发送命令"}
            </p>
          </div>
          <Command className="h-4 w-4 text-slate-400" />
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-9 pl-8 text-xs"
            value={query}
            placeholder="搜索命令或文件夹"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden">
        <div className="w-full min-w-0 max-w-full overflow-hidden border-b border-slate-200 px-3 py-3">
          <div className="mb-2 text-[11px] font-semibold text-slate-500">文件夹</div>
          <div className="flex w-full min-w-0 max-w-full flex-wrap gap-2 overflow-x-hidden">
            {folders.map((folder) => (
              <button
                key={folder.id}
                className={cn(
                  "flex h-[48px] basis-[calc((100%_-_1rem)/3)] min-w-0 shrink-0 flex-col items-start justify-between overflow-hidden rounded-md border px-2 py-1.5 text-left text-[12px] font-medium leading-[14px] [overflow-wrap:anywhere]",
                  folder.id === activeFolder?.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                )}
                onClick={() => onActiveFolderChange(folder.id)}
              >
                <span className="min-w-0 max-h-[28px] max-w-full overflow-hidden">{folder.name}</span>
                <span className="shrink-0 text-[10px] leading-none opacity-60">{folder.commands.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3" aria-label="快捷命令列表">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>命令</span>
            <span>{commands.length}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {commands.map((command) => {
              const key = commandKey(command);
              return (
                <div
                  key={key}
                  className={cn(
                    "grid min-w-0 grid-cols-[minmax(0,1fr)_28px] overflow-hidden rounded-md border bg-white text-xs",
                    pendingCommandKey === key ? "border-slate-900" : "border-slate-200"
                  )}
                  onContextMenu={(event) => openCommandMenu(event, command)}
                >
                  <button
                    aria-label={`发送 ${command.name}`}
                    className="min-w-0 truncate px-2 py-2 text-left font-semibold text-slate-800 hover:bg-slate-50 disabled:text-slate-300"
                    disabled={!activeSession}
                    onClick={() => runCommand(command)}
                  >
                    {command.name}
                  </button>
                  <button
                    aria-label={`查看命令详情 ${command.name}`}
                    title="查看命令详情"
                    className="flex items-center justify-center border-l border-slate-100 text-slate-400 hover:bg-slate-50 hover:text-slate-800"
                    onClick={() => {
                      setDetailCommandKey(detailCommandKey === key ? "" : key);
                      setPendingCommandKey("");
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {commands.length === 0 && (
              <div className="col-span-full rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
                未找到匹配命令
              </div>
            )}
          </div>
        </div>
        {pendingCommand && (
          <div className="border-t border-slate-200 bg-white p-3" aria-label={`快捷命令参数 ${pendingCommand.name}`}>
            <div className="mb-2 truncate text-xs font-semibold text-slate-900">{pendingCommand.name}</div>
            <div className="space-y-2">
              {pendingParameters.map((parameter) => (
                <label key={parameter.key} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-xs text-slate-600">
                  <span className="truncate">{parameter.name}</span>
                  <Input
                    className="h-8 text-xs"
                    aria-label={`参数 ${parameter.name}`}
                    value={parameterValues[parameter.key] || ""}
                    onChange={(event) => setParameterValues((current) => ({ ...current, [parameter.key]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") sendPendingCommand();
                    }}
                  />
                </label>
              ))}
            </div>
            <Button className="mt-2 h-8 w-full text-xs" disabled={!activeSession} onClick={sendPendingCommand}>
              <Send className="h-3.5 w-3.5" />
              发送 {pendingCommand.name}
            </Button>
          </div>
        )}
        {detailCommand && (
          <div className="border-t border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-slate-900">命令详情</div>
            <div className="truncate text-xs font-semibold text-slate-700">{detailCommand.name}</div>
            <code className="mt-2 block max-h-24 overflow-auto rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
              {detailCommand.command}
            </code>
            {detailCommand.description && <p className="mt-2 text-xs text-slate-500">{detailCommand.description}</p>}
          </div>
        )}
        {commandMenu && (
          <div
            role="menu"
            className="fixed z-50 min-w-32 rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg"
            style={{ left: commandMenu.x, top: commandMenu.y }}
          >
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50"
              onClick={() => void copyCommand(commandMenu.command)}
            >
              <Copy className="h-3.5 w-3.5" />
              复制命令
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function decodeTerminalOutput(base64: string, decoderRef: React.MutableRefObject<TextDecoder | null>) {
  const bytes = base64ToBytes(base64);
  if (!decoderRef.current) {
    decoderRef.current = new TextDecoder("utf-8");
  }
  return decoderRef.current.decode(bytes, { stream: true });
}

function normalizePasteText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripTerminalGeneratedReplies(data: string) {
  return data
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1bP[\s\S]*?\x1b\\/g, "");
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

const textAttachmentExtensions = new Set([
  ".txt",
  ".log",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".csv",
  ".sh",
  ".ps1",
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".css",
  ".html"
]);

function safeAttachmentName(name: string) {
  const fallback = "attachment";
  const cleaned = (name || fallback).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\.\.+/g, ".").trim();
  return cleaned || fallback;
}

function attachmentNameForFile(file: File) {
  if (file.name.trim()) {
    return safeAttachmentName(file.name);
  }
  if (file.type === "image/png") return "pasted-image.png";
  if (file.type === "image/jpeg") return "pasted-image.jpg";
  if (file.type === "image/gif") return "pasted-image.gif";
  if (file.type === "image/webp") return "pasted-image.webp";
  return "attachment";
}

function isTextAttachment(file: File) {
  if (file.type.startsWith("text/")) return true;
  const lowerName = file.name.toLowerCase();
  return Array.from(textAttachmentExtensions).some((extension) => lowerName.endsWith(extension));
}

function getAttachmentKind(file: File): AiAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (isTextAttachment(file)) return "text";
  return "file";
}

async function fileToBase64(file: File) {
  return bytesToBase64(new Uint8Array(await readFileArrayBuffer(file)));
}

async function readTextAttachment(file: File) {
  const text = await readFileText(file);
  return text.length > 20000 ? `${text.slice(0, 20000)}\n...[truncated]` : text;
}

function readFileArrayBuffer(file: File) {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("读取附件失败"));
    reader.readAsArrayBuffer(file);
  });
}

function readFileText(file: File) {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取附件失败"));
    reader.readAsText(file);
  });
}

function createImagePreviewUrl(file: File, base64: string) {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      return URL.createObjectURL(file);
    } catch {
      // Fall through to a data URL when the test/browser environment blocks object URLs.
    }
  }
  return `data:${file.type || "application/octet-stream"};base64,${base64}`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function TerminalRightSidebar({
  activePanel,
  activeSession,
  commandFolders,
  activeCommandFolderId,
  shortcutParameterRequest,
  aiQuotes,
  aiConfig,
  onPanelChange,
  onActiveCommandFolderChange,
  onSendCommand,
  onAiConfigChange
}: {
  activePanel: TerminalSidePanel;
  activeSession?: SessionTab;
  commandFolders: CommandFolder[];
  activeCommandFolderId: string;
  shortcutParameterRequest: ShortcutParameterRequest | null;
  aiQuotes: AiQuote[];
  aiConfig: AiConfig;
  onPanelChange: (panel: TerminalSidePanel) => void;
  onActiveCommandFolderChange: (folderId: string) => void;
  onSendCommand: (command: string) => void;
  onAiConfigChange: (config: AiConfig) => void;
}) {
  const panels: Array<{ id: TerminalSidePanel; label: string; icon: React.ReactNode }> = [
    { id: "commands", label: "命令", icon: <Command className="h-3.5 w-3.5" /> },
    { id: "files", label: "文件", icon: <FolderOpen className="h-3.5 w-3.5" /> },
    { id: "ai", label: "AI", icon: <Bot className="h-3.5 w-3.5" /> }
  ];

  return (
    <aside className="grid min-h-0 w-[420px] min-w-0 max-w-[420px] grid-rows-[44px_minmax(0,1fr)] overflow-hidden border-l border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2" role="tablist" aria-label="终端右侧工作栏">
        {panels.map((panel) => {
          const active = activePanel === panel.id;
          return (
            <button
              key={panel.id}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors",
                active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
              onClick={() => onPanelChange(panel.id)}
            >
              {panel.icon}
              {panel.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 overflow-hidden">
        {activePanel === "commands" && (
          <TerminalCommandSidebar
            folders={commandFolders}
            activeFolderId={activeCommandFolderId}
            activeSession={activeSession}
            shortcutParameterRequest={shortcutParameterRequest}
            onActiveFolderChange={onActiveCommandFolderChange}
            onSendCommand={onSendCommand}
          />
        )}
        {activePanel === "files" && <TerminalFileSidebar activeSession={activeSession} />}
        {activePanel === "ai" && (
          <AiWorkspacePanel
            activeSession={activeSession}
            quotes={aiQuotes}
            config={aiConfig}
            onConfigChange={onAiConfigChange}
          />
        )}
      </div>
    </aside>
  );
}

function TerminalFileSidebar({ activeSession }: { activeSession?: SessionTab }) {
  const [remotePath, setRemotePath] = useState("/");
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; entry: DirectoryEntry } | null>(null);
  const canBrowseRemote = activeSession?.kind === "ssh" && activeSession.connected;

  useEffect(() => {
    setRemotePath("/");
  }, [activeSession?.id]);

  useEffect(() => {
    if (!canBrowseRemote || !activeSession?.id) {
      setEntries([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    nativeBridge
      .listDirectory(activeSession.id, remotePath)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setEntries([]);
          setError(result.error || "读取远程目录失败。");
          return;
        }
        setEntries(sortDirectoryEntries(result.files));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEntries([]);
          setError(err instanceof Error ? err.message : "读取远程目录失败。");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSession?.id, canBrowseRemote, remotePath, reloadToken]);

  function openDirectory(entry: DirectoryEntry) {
    if (entry.type !== "directory") return;
    setRemotePath(joinRemotePath(remotePath, entry.name));
  }

  function openFileMenu(event: ReactMouseEvent, entry: DirectoryEntry) {
    if (entry.type === "directory") return;
    event.preventDefault();
    setFileMenu({ x: event.clientX, y: event.clientY, entry });
  }

  async function downloadRemoteFile(entry: DirectoryEntry) {
    if (!activeSession?.id) return;
    setFileMenu(null);
    const targetPath = joinRemotePath(remotePath, entry.name);
    const selected = await nativeBridge.showSaveFileDialog(entry.name);
    if (!selected.filePath) return;
    const result = await nativeBridge.downloadFile(activeSession.id, targetPath, selected.filePath);
    if (!result.success) {
      setError(result.error || "下载文件失败。");
    }
  }

  const emptyMessage = activeSession?.kind === "ssh"
    ? "SSH 会话未连接，暂不能浏览远程文件。"
    : "当前不是 SSH 会话，暂不能浏览远程文件。";

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">文件浏览</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {activeSession ? `当前会话：${activeSession.title}` : "连接 SSH 后查看文件"}
            </p>
          </div>
          <FolderOpen className="h-4 w-4 text-slate-400" />
        </div>
      </div>
      <div className="min-h-0 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-900">本地文件</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">用于上传、下载和拖拽传输。</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-900">远程文件</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">选择 SSH 会话后显示目录。</div>
          </div>
        </div>
        {canBrowseRemote ? (
          <div className="mt-3 min-w-0 rounded-md border border-slate-200 bg-white">
            <div className="flex min-w-0 items-center gap-2 border-b border-slate-200 px-3 py-2">
              <button
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={remotePath === "/"}
                title="返回上级目录"
                onClick={() => setRemotePath(parentRemotePath(remotePath))}
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-90" />
              </button>
              <button
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                title="根目录"
                onClick={() => setRemotePath("/")}
              >
                <Home className="h-3.5 w-3.5" />
              </button>
              <div aria-label="远程路径" className="min-w-0 flex-1 truncate rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600">
                {remotePath}
              </div>
              <button
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                title="刷新远程文件"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {loading && <div className="px-3 py-8 text-center text-xs text-slate-500">正在读取目录...</div>}
            {!loading && error && <div className="px-3 py-8 text-center text-xs text-rose-600">{error}</div>}
            {!loading && !error && entries.length === 0 && <div className="px-3 py-8 text-center text-xs text-slate-500">目录为空。</div>}
            {!loading && !error && entries.length > 0 && (
              <div aria-label="远程文件列表" className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <button
                    key={`${entry.type}-${entry.name}`}
                    className={cn(
                      "grid w-full min-w-0 grid-cols-[18px_minmax(0,1fr)_64px_82px] items-center gap-2 px-3 py-2 text-left text-xs",
                      entry.type === "directory" ? "hover:bg-slate-50" : "cursor-default"
                    )}
                    onClick={() => openDirectory(entry)}
                    onContextMenu={(event) => openFileMenu(event, entry)}
                  >
                    {entry.type === "directory" ? (
                      <FolderIcon aria-label="目录图标" className="h-4 w-4 text-amber-500" />
                    ) : (
                      <FileIcon aria-label="文件图标" className="h-4 w-4 text-slate-400" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{entry.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">{entry.date || " "}</span>
                    </span>
                    <span className="text-slate-500">{entry.type === "directory" ? "目录" : "文件"}</span>
                    <span className="truncate text-right text-slate-500">{formatRemoteFileSize(entry)}</span>
                  </button>
                ))}
              </div>
            )}
            {fileMenu && (
              <div
                role="menu"
                className="fixed z-50 min-w-32 rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg"
                style={{ left: fileMenu.x, top: fileMenu.y }}
              >
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  onClick={() => void downloadRemoteFile(fileMenu.entry)}
                >
                  <Download className="h-3.5 w-3.5" />
                  下载文件
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs text-slate-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function sortDirectoryEntries(files: DirectoryEntry[]) {
  return [...files].sort((left, right) => {
    const leftDir = left.type === "directory" ? 0 : 1;
    const rightDir = right.type === "directory" ? 0 : 1;
    if (leftDir !== rightDir) return leftDir - rightDir;
    return left.name.localeCompare(right.name);
  });
}

function joinRemotePath(currentPath: string, name: string) {
  if (currentPath === "/") return `/${name}`;
  return `${currentPath.replace(/\/+$/, "")}/${name}`;
}

function parentRemotePath(currentPath: string) {
  const normalized = currentPath.replace(/\/+$/, "");
  if (!normalized || normalized === "/") return "/";
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex <= 0 ? "/" : normalized.slice(0, slashIndex);
}

function formatRemoteFileSize(entry: DirectoryEntry) {
  if (entry.type === "directory") return "-";
  if (typeof entry.size === "string") return entry.size;
  if (typeof entry.size === "number") return formatBytes(entry.size);
  if (typeof entry.raw_size === "number") return formatBytes(entry.raw_size);
  return "";
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function BrowserPanel({
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

  return (
    <div className="h-full overflow-auto px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">浏览器状态栏</h1>
            <p className="mt-1 text-sm text-slate-500">保存常用网页入口，点击卡片后用外部浏览器打开。</p>
          </div>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </div>

        <Panel title="网页卡片">
          <div className="grid grid-cols-[220px_minmax(0,1fr)_104px] gap-3">
            <Input
              placeholder="标签名称"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
            <Input
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
            <Button onClick={submit}>添加网页</Button>
          </div>

          {favorites.length === 0 ? (
            <EmptyState title="暂无网页卡片" description="添加一个标签和 URL 后，这里会显示可点击的网页入口。" />
          ) : (
            <div className="mt-5 grid grid-cols-3 gap-3">
              {favorites.map((favorite) => (
                <div
                  key={favorite.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <button
                    aria-label={`打开 ${favorite.title}`}
                    className="block w-full text-left"
                    onClick={() => onOpen(favorite)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                        <Globe2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-950">{favorite.title}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{favorite.url}</span>
                      </span>
                    </div>
                  </button>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      aria-label={`删除 ${favorite.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-100 bg-white text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => onDelete(favorite)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`外部链接 ${favorite.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      onClick={() => onOpen(favorite)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function isMonitorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function monitorRecord(result: NativeResult | undefined, key: string) {
  const value = result?.[key];
  return isMonitorRecord(value) ? value : {};
}

function monitorList(result: NativeResult | undefined, key: string) {
  const value = result?.[key];
  return Array.isArray(value) ? value.filter(isMonitorRecord) : [];
}

function monitorText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function monitorPercent(value: unknown) {
  const match = /-?\d+(?:\.\d+)?/.exec(monitorText(value));
  if (!match) return 0;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function monitorPercentLabel(value: unknown) {
  const text = monitorText(value);
  if (text === "-") return "0%";
  return text.includes("%") ? text : `${text}%`;
}

function MonitorProgress({ value, className = "bg-blue-500" }: { value: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full", className)} style={{ width: `${value}%` }} />
    </div>
  );
}

function MonitorMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  percent,
  barClassName
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  percent: number;
  barClassName: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-3">
        <MonitorProgress value={percent} className={barClassName} />
      </div>
      <div className="mt-2 truncate text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function MonitorStatusBlock({ result }: { result?: NativeResult }) {
  if (!result) {
    return <div className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">等待刷新数据</div>;
  }
  if (!result.success) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">
        {result.error || "暂未获取到数据"}
      </div>
    );
  }
  return null;
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

  const info = monitorRecord(snapshots.info, "info");
  const stats = monitorRecord(snapshots.stats, "stats");
  const processes = monitorList(snapshots.processes, "processes").slice(0, 8);
  const disks = monitorList(snapshots.disk, "disk_usage");
  const networks = monitorList(snapshots.network, "network_info");
  const hasStats = Boolean(snapshots.stats?.success);
  const hasInfo = Boolean(snapshots.info?.success);
  const hasProcesses = Boolean(snapshots.processes?.success);
  const hasDisk = Boolean(snapshots.disk?.success);
  const hasNetwork = Boolean(snapshots.network?.success);
  const statusResults = [snapshots.info, snapshots.stats, snapshots.processes, snapshots.disk, snapshots.network].filter(
    (result): result is NativeResult => Boolean(result && !result.success)
  );

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg)] px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--app-text)]">系统监控</h1>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              {activeSession ? `当前会话：${activeSession.title}` : "选择一个 SSH 会话后显示主机状态。"}
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={!activeSession || loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
        </div>

        {!activeSession ? (
          <EmptyState title="暂无活动 SSH 会话" description="连接 SSH 主机后，这里会显示 CPU、内存、磁盘、进程和网络接口。" />
        ) : (
          <div className="space-y-4">
            {statusResults.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {statusResults.map((result) => result.error || "暂未获取到数据").join("；")}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <MonitorMetricCard
                label="CPU"
                value={hasStats ? monitorPercentLabel(stats.cpu_usage) : "0%"}
                detail="当前处理器占用"
                icon={Cpu}
                percent={monitorPercent(stats.cpu_usage)}
                barClassName="bg-blue-500"
              />
              <MonitorMetricCard
                label="内存"
                value={hasStats ? monitorPercentLabel(stats.memory_usage) : "0%"}
                detail={`${monitorText(stats.memory_used)} / ${monitorText(stats.memory_total)}`}
                icon={Server}
                percent={monitorPercent(stats.memory_usage)}
                barClassName="bg-emerald-500"
              />
              <MonitorMetricCard
                label="磁盘"
                value={hasStats ? monitorPercentLabel(stats.disk_usage) : "0%"}
                detail={`${monitorText(stats.disk_used)} / ${monitorText(stats.disk_total)}`}
                icon={HardDrive}
                percent={monitorPercent(stats.disk_usage)}
                barClassName="bg-amber-500"
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
              <Panel title="系统概览">
                {!hasInfo ? (
                  <MonitorStatusBlock result={snapshots.info} />
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: "主机名", value: info.hostname },
                      { label: "系统", value: info.os_name || info.os_version },
                      { label: "架构", value: info.architecture },
                      { label: "CPU", value: info.cpu },
                      { label: "内存", value: info.total_memory },
                      { label: "运行时间", value: info.uptime }
                    ].map((item) => (
                      <div key={item.label} className="rounded-md bg-slate-50 px-3 py-2">
                        <div className="text-xs font-semibold text-slate-500">{item.label}</div>
                        <div className="mt-1 truncate font-medium text-slate-900">{monitorText(item.value)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="网络接口">
                {!hasNetwork ? (
                  <MonitorStatusBlock result={snapshots.network} />
                ) : networks.length === 0 ? (
                  <div className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">暂无网络接口数据</div>
                ) : (
                  <div className="space-y-2">
                    {networks.map((network, index) => (
                      <div key={`${monitorText(network.name)}-${index}`} className="rounded-md border border-slate-200 px-3 py-2">
                        <div className="font-semibold text-slate-900">{monitorText(network.name)}</div>
                        <div className="mt-1 text-sm text-slate-600">{monitorText(network.ip)}</div>
                        <div className="mt-1 text-xs text-slate-400">{monitorText(network.cidr)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="进程列表">
              {!hasProcesses ? (
                <MonitorStatusBlock result={snapshots.processes} />
              ) : processes.length === 0 ? (
                <div className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">暂无进程数据</div>
              ) : (
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="w-24 px-3 py-2">PID</th>
                        <th className="px-3 py-2">名称</th>
                        <th className="w-32 px-3 py-2">CPU</th>
                        <th className="w-32 px-3 py-2">内存</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {processes.map((process, index) => (
                        <tr key={`${monitorText(process.pid)}-${index}`} className="text-slate-700">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{monitorText(process.pid)}</td>
                          <td className="truncate px-3 py-2 font-medium text-slate-900">{monitorText(process.name)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-xs">{monitorPercentLabel(process.cpu)}</span>
                              <div className="min-w-0 flex-1">
                                <MonitorProgress value={monitorPercent(process.cpu)} className="bg-blue-500" />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">{monitorPercentLabel(process.memory)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="磁盘使用">
              {!hasDisk ? (
                <MonitorStatusBlock result={snapshots.disk} />
              ) : disks.length === 0 ? (
                <div className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">暂无磁盘数据</div>
              ) : (
                <div className="space-y-3">
                  {disks.map((disk, index) => (
                    <div key={`${monitorText(disk.mount)}-${index}`} className="rounded-md border border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{monitorText(disk.mount)}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{monitorText(disk.device)}</div>
                        </div>
                        <div className="text-right text-sm font-semibold text-slate-900">{monitorPercentLabel(disk.usage)}</div>
                      </div>
                      <div className="mt-3">
                        <MonitorProgress value={monitorPercent(disk.usage)} className="bg-amber-500" />
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {monitorText(disk.used)} / {monitorText(disk.total)}，可用 {monitorText(disk.free)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function CommandPanel({
  folders,
  activeFolderId,
  activeSession,
  onActiveFolderChange,
  onAddFolder,
  onDeleteFolder,
  onSaveCommand,
  onDeleteCommand,
  onSendCommand,
  onImportCommands,
  onExportCommands,
  transferStatus
}: {
  folders: CommandFolder[];
  activeFolderId: string;
  activeSession?: SessionTab;
  onActiveFolderChange: (folderId: string) => void;
  onAddFolder: (name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onSaveCommand: (folderId: string, command: Omit<CommandItem, "id">, commandId?: string) => void;
  onDeleteCommand: (folderId: string, commandId: string) => void;
  onSendCommand: (command: string) => void;
  onImportCommands: (source: string) => void;
  onExportCommands: () => void;
  transferStatus: string;
}) {
  const [query, setQuery] = useState("");
  const [folderName, setFolderName] = useState("");
  const [draft, setDraft] = useState({ id: "", name: "", command: "", description: "" });
  const [pendingCommandKey, setPendingCommandKey] = useState("");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) || folders[0];
  const keyword = query.trim().toLowerCase();
  const visibleFolders = folders
    .map((folder) => ({
      ...folder,
      commands: folder.commands.filter((command) => {
        if (!keyword) return true;
        return [folder.name, command.name, command.command, command.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
    }))
    .filter((folder) => !keyword || folder.commands.length > 0 || folder.name.toLowerCase().includes(keyword));
  const visibleCommands = keyword
    ? visibleFolders.flatMap((folder) => folder.commands.map((command) => ({ ...command, folderId: folder.id, folderName: folder.name })))
    : (activeFolder?.commands || []).map((command) => ({ ...command, folderId: activeFolder.id, folderName: activeFolder.name }));
  const commandKey = (command: CommandItem & { folderId: string }) => `${command.folderId}:${command.id}`;
  const pendingCommand = visibleCommands.find((command) => commandKey(command) === pendingCommandKey);
  const pendingParameters = pendingCommand ? extractCommandParameters(pendingCommand.command) : [];

  function submitFolder() {
    onAddFolder(folderName);
    setFolderName("");
  }

  function submitCommand() {
    if (!activeFolder) return;
    onSaveCommand(activeFolder.id, draft, draft.id || undefined);
    setDraft({ id: "", name: "", command: "", description: "" });
  }

  function editCommand(command: CommandItem) {
    setDraft({
      id: command.id,
      name: command.name,
      command: command.command,
      description: command.description || ""
    });
  }

  function insertCommandParameter(index: number) {
    setDraft((current) => ({ ...current, command: `${current.command}[p#${index} 参数名]` }));
  }

  function sendCommand(command: CommandItem & { folderId: string }) {
    const parameters = extractCommandParameters(command.command);
    if (parameters.length) {
      setPendingCommandKey(commandKey(command));
      setParameterValues({});
      return;
    }
    onSendCommand(command.command);
  }

  function sendPendingCommand() {
    if (!pendingCommand) return;
    onSendCommand(fillCommandParameters(pendingCommand.command, parameterValues));
    setPendingCommandKey("");
    setParameterValues({});
  }

  return (
    <div className="grid h-full min-w-0 grid-cols-[280px_minmax(0,1fr)] bg-white">
      <aside className="min-h-0 border-r border-slate-200 bg-slate-50 p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">快捷命令库</h1>
          <p className="mt-1 text-xs text-slate-500">
            {activeSession ? `发送到：${activeSession.title}` : "打开终端后可一键发送命令"}
          </p>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            value={query}
            placeholder="搜索命令、描述或文件夹"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button className="col-span-2 h-9 px-3 text-xs" variant="outline" onClick={() => onImportCommands("FinalShell")}>
            <Upload className="h-3.5 w-3.5" />
            导入 FinalShell
          </Button>
          <Button className="h-9 px-3 text-xs" variant="outline" onClick={() => onImportCommands("本地文件")}>
            <Upload className="h-3.5 w-3.5" />
            导入
          </Button>
          <Button className="h-9 px-3 text-xs" variant="outline" onClick={onExportCommands}>
            <Download className="h-3.5 w-3.5" />
            导出
          </Button>
        </div>
        {transferStatus && <p className="mt-2 text-xs text-slate-500">{transferStatus}</p>}

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <Input
            value={folderName}
            placeholder="新文件夹名称"
            onChange={(event) => setFolderName(event.target.value)}
          />
          <Button variant="outline" onClick={submitFolder}>新建文件夹</Button>
        </div>

        <div className="mt-4 space-y-1">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_32px] overflow-hidden rounded-md text-sm font-medium",
                folder.id === activeFolder?.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-white"
              )}
            >
              <button
                className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-left"
                onClick={() => onActiveFolderChange(folder.id)}
              >
                <span className="min-w-0 whitespace-normal break-words">{folder.name}</span>
                <span className={cn("shrink-0 text-xs", folder.id === activeFolder?.id ? "text-slate-300" : "text-slate-400")}>
                  {folder.commands.length}
                </span>
              </button>
              <button
                aria-label={`删除文件夹 ${folder.name}`}
                title="删除文件夹"
                className={cn(
                  "flex h-full min-h-9 items-center justify-center border-l",
                  folder.id === activeFolder?.id
                    ? "border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "border-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600",
                  folders.length <= 1 && "cursor-not-allowed opacity-40"
                )}
                disabled={folders.length <= 1}
                onClick={() => onDeleteFolder(folder.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="min-h-0 overflow-auto px-6 py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">{keyword ? "搜索结果" : activeFolder?.name || "命令"}</h2>
            <p className="mt-1 text-sm text-slate-500">命令按文件夹管理，点击发送会写入当前活动终端。</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
            {visibleCommands.length} 条命令
          </span>
        </div>

        <Panel title={draft.id ? "编辑命令" : "添加命令"}>
          <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-2">
            <Input
              value={draft.name}
              placeholder="命令名称"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              value={draft.command}
              placeholder="命令内容"
              onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
            />
            <p className="col-span-2 text-xs text-slate-400">参数占位示例：sudo iptables -t nat -nL | grep [p#1 端口]</p>
            <div className="col-span-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>插入参数(动态生成命令)</span>
              {COMMAND_PARAMETER_SLOTS.map((index) => (
                <Button key={index} variant="outline" className="h-7 px-3 text-xs" onClick={() => insertCommandParameter(index)}>
                  参数{index}
                </Button>
              ))}
            </div>
            <Input
              className="col-span-2"
              value={draft.description}
              placeholder="命令描述"
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {draft.id && (
              <Button variant="outline" onClick={() => setDraft({ id: "", name: "", command: "", description: "" })}>
                取消编辑
              </Button>
            )}
            <Button onClick={submitCommand}>{draft.id ? "保存命令" : "添加命令"}</Button>
          </div>
        </Panel>

        {pendingCommand && (
          <Panel title={`${pendingCommand.name} 参数`}>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
              {pendingParameters.map((parameter) => (
                <label key={parameter.key} className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{parameter.name}</span>
                  <Input
                    className="h-9 text-xs"
                    aria-label={`参数 ${parameter.name}`}
                    value={parameterValues[parameter.key] || ""}
                    onChange={(event) => setParameterValues((current) => ({ ...current, [parameter.key]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") sendPendingCommand();
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Button disabled={!activeSession} onClick={sendPendingCommand}>
                <Send className="h-3.5 w-3.5" />
                发送 {pendingCommand.name}
              </Button>
            </div>
          </Panel>
        )}

        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 2xl:grid-cols-4">
          {visibleCommands.map((command) => (
            <div key={`${command.folderId}-${command.id}`} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{command.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{command.folderName}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" className="h-7 px-1.5 text-xs" onClick={() => editCommand(command)}>
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-7 px-1.5 text-xs"
                    aria-label={`删除命令 ${command.name}`}
                    onClick={() => onDeleteCommand(command.folderId, command.id)}
                  >
                    删除
                  </Button>
                </div>
              </div>
              <code className="mt-2 block truncate rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-800">
                {command.command}
              </code>
              {command.description && <p className="mt-2 truncate text-xs text-slate-500">{command.description}</p>}
              <div className="mt-2 flex justify-end">
                <Button
                  className="h-7 px-2 text-xs"
                  disabled={!activeSession}
                  aria-label={`发送 ${command.name}`}
                  onClick={() => sendCommand(command)}
                >
                  <Send className="h-3.5 w-3.5" />
                  发送
                </Button>
              </div>
            </div>
          ))}
          {visibleCommands.length === 0 && (
            <EmptyState title="没有匹配命令" description="换个关键词搜索，或在当前文件夹里新增一条命令。" />
          )}
        </div>
      </section>
    </div>
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

function SettingsPanel({
  theme,
  terminalTheme,
  terminalAppearance,
  terminalBackgroundImage,
  terminalBackgroundOverlay,
  commandSuggestionsEnabled,
  commandSuggestionSources,
  commandSuggestionApplyKey,
  commandSuggestionCustomApplyKey,
  highlightRules,
  onThemeChange,
  onTerminalThemeChange,
  onTerminalAppearanceChange,
  onTerminalBackgroundImageChange,
  onTerminalBackgroundOverlayChange,
  onCommandSuggestionsEnabledChange,
  onCommandSuggestionSourcesChange,
  onCommandSuggestionApplyKeyChange,
  onCommandSuggestionCustomApplyKeyChange,
  onToggleHighlightRule,
  onAddHighlightRule,
  onDeleteHighlightRule
}: {
  theme: ThemeMode;
  terminalTheme: TerminalThemeMode;
  terminalAppearance: TerminalAppearance;
  terminalBackgroundImage: string;
  terminalBackgroundOverlay: number;
  commandSuggestionsEnabled: boolean;
  commandSuggestionSources: CommandSuggestionSources;
  commandSuggestionApplyKey: CommandSuggestionApplyKey;
  commandSuggestionCustomApplyKey: CommandSuggestionCustomApplyKey | null;
  highlightRules: HighlightRule[];
  onThemeChange: (theme: ThemeMode) => void;
  onTerminalThemeChange: (theme: TerminalThemeMode) => void;
  onTerminalAppearanceChange: (appearance: TerminalAppearance) => void;
  onTerminalBackgroundImageChange: (value: string) => void;
  onTerminalBackgroundOverlayChange: (value: number) => void;
  onCommandSuggestionsEnabledChange: (value: boolean) => void;
  onCommandSuggestionSourcesChange: (value: CommandSuggestionSources) => void;
  onCommandSuggestionApplyKeyChange: (value: CommandSuggestionApplyKey) => void;
  onCommandSuggestionCustomApplyKeyChange: (value: CommandSuggestionCustomApplyKey | null) => void;
  onToggleHighlightRule: (ruleId: string) => void;
  onAddHighlightRule: (rule: Pick<HighlightRule, "name" | "pattern" | "foreground">) => void;
  onDeleteHighlightRule: (ruleId: string) => void;
}) {
  const [draft, setDraft] = useState({ name: "", pattern: "", foreground: "#2563eb" });
  const [recordingApplyKey, setRecordingApplyKey] = useState(false);
  const resolvedTerminalAppearance = getTerminalAppearance(terminalAppearance);
  const terminalPreviewColors = getTerminalColors(terminalTheme, resolvedTerminalAppearance);
  const terminalPreviewOverlayAlpha = terminalBackgroundOverlay / 100;
  const terminalPreviewStyle = {
    backgroundColor: terminalPreviewColors.background,
    color: terminalPreviewColors.foreground,
    fontFamily: resolvedTerminalAppearance.fontFamily,
    fontSize: `${resolvedTerminalAppearance.fontSize}px`,
    backgroundImage: buildTerminalBackgroundImage(terminalBackgroundImage, terminalPreviewColors.background, terminalPreviewOverlayAlpha)
  } as CSSProperties;

  function addRule() {
    onAddHighlightRule(draft);
    setDraft({ name: "", pattern: "", foreground: "#2563eb" });
  }

  function uploadTerminalBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onTerminalBackgroundImageChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = "";
  }

  function updateTerminalAppearance(patch: Partial<TerminalAppearance>) {
    onTerminalAppearanceChange({ ...terminalAppearance, ...patch });
  }

  function recordCustomApplyKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!recordingApplyKey) return;
    event.preventDefault();
    event.stopPropagation();
    const customKey = createCommandSuggestionCustomApplyKey(event.nativeEvent);
    if (!customKey) return;
    onCommandSuggestionApplyKeyChange("custom");
    onCommandSuggestionCustomApplyKeyChange(customKey);
    setRecordingApplyKey(false);
  }

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg)] px-8 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--app-text)]">设置</h1>
          <p className="mt-1 text-sm text-[var(--app-muted)]">管理界面主题、终端高亮和 AI 引用行为。</p>
        </div>

        <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
          <Panel title="外观主题">
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((mode) => (
                <button
                  key={mode}
                  className={cn(
                    "h-10 rounded-md border text-sm font-semibold transition-colors",
                    theme === mode
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  onClick={() => onThemeChange(mode)}
                >
                  {mode === "light" ? "浅色" : "深色"}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-[var(--app-line)] pt-4">
              <div className="mb-2 text-xs font-semibold text-[var(--app-muted)]">终端颜色</div>
              <div className="grid grid-cols-2 gap-2">
                {TERMINAL_THEMES.map((mode) => (
                  <button
                    key={mode}
                    data-testid={`terminal-theme-${mode}`}
                    className={cn(
                      "h-10 rounded-md border text-sm font-semibold transition-colors",
                      terminalTheme === mode
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                    onClick={() => onTerminalThemeChange(mode)}
                  >
                    {mode === "dark" ? "黑色终端" : "浅色终端"}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-semibold text-[var(--app-muted)]">
                  <span>终端字体</span>
                  <Input
                    className="mt-2"
                    aria-label="终端字体"
                    value={terminalAppearance.fontFamily}
                    placeholder={defaultTerminalAppearance.fontFamily}
                    onChange={(event) => updateTerminalAppearance({ fontFamily: event.target.value })}
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--app-muted)]">
                  <span>字号</span>
                  <Input
                    className="mt-2"
                    aria-label="字号"
                    type="number"
                    min={10}
                    max={28}
                    value={terminalAppearance.fontSize}
                    onChange={(event) => updateTerminalAppearance({ fontSize: Number(event.target.value || defaultTerminalAppearance.fontSize) })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-[var(--app-muted)]">
                    <span>文字颜色</span>
                    <input
                      aria-label="文字颜色"
                      className="mt-2 h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-1"
                      type="color"
                      value={terminalAppearance.foreground || terminalPreviewColors.foreground}
                      onChange={(event) => updateTerminalAppearance({ foreground: event.target.value })}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-[var(--app-muted)]">
                    <span>背景颜色</span>
                    <input
                      aria-label="背景颜色"
                      className="mt-2 h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-1"
                      type="color"
                      value={terminalAppearance.background || terminalPreviewColors.background}
                      onChange={(event) => updateTerminalAppearance({ background: event.target.value })}
                    />
                  </label>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <label className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  上传背景图
                  <input
                    data-testid="terminal-background-upload"
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    onChange={uploadTerminalBackground}
                  />
                </label>
                <Button
                  variant="outline"
                  className="h-10 px-3"
                  disabled={!terminalBackgroundImage}
                  onClick={() => onTerminalBackgroundImageChange("")}
                >
                  清除
                </Button>
              </div>
              <label className="mt-3 block text-xs font-semibold text-[var(--app-muted)]">
                <span className="flex items-center justify-between gap-3">
                  <span>背景遮罩透明度</span>
                  <span>{terminalBackgroundOverlay}%</span>
                </span>
                <input
                  aria-label="背景遮罩透明度"
                  className="mt-2 w-full accent-blue-600"
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  value={terminalBackgroundOverlay}
                  onChange={(event) => onTerminalBackgroundOverlayChange(Number(event.target.value))}
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] px-3 py-2 text-sm font-semibold text-[var(--app-text)]">
                <span>命令智能提示</span>
                <input
                  aria-label="命令智能提示"
                  className="h-4 w-4 accent-blue-600"
                  type="checkbox"
                  checked={commandSuggestionsEnabled}
                  onChange={(event) => onCommandSuggestionsEnabledChange(event.target.checked)}
                />
              </label>
              <div className="mt-2 space-y-2 rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] p-3 text-xs text-[var(--app-text)]">
                <label className="flex cursor-pointer items-center justify-between gap-3 font-semibold">
                  <span>显示历史命令</span>
                  <input
                    aria-label="显示历史命令"
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    checked={commandSuggestionSources.history}
                    disabled={!commandSuggestionsEnabled}
                    onChange={(event) => onCommandSuggestionSourcesChange({ ...commandSuggestionSources, history: event.target.checked })}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 font-semibold">
                  <span>显示快捷命令</span>
                  <input
                    aria-label="显示快捷命令"
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    checked={commandSuggestionSources.shortcuts}
                    disabled={!commandSuggestionsEnabled}
                    onChange={(event) => onCommandSuggestionSourcesChange({ ...commandSuggestionSources, shortcuts: event.target.checked })}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 font-semibold">
                  <span>显示 Linux 命令</span>
                  <input
                    aria-label="显示 Linux 命令"
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    checked={commandSuggestionSources.linux}
                    disabled={!commandSuggestionsEnabled}
                    onChange={(event) => onCommandSuggestionSourcesChange({ ...commandSuggestionSources, linux: event.target.checked })}
                  />
                </label>
                <label className="block font-semibold">
                  <span>候选应用按键</span>
                  <select
                    aria-label="候选应用按键"
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                    value={commandSuggestionApplyKey}
                    disabled={!commandSuggestionsEnabled}
                    onChange={(event) => onCommandSuggestionApplyKeyChange(event.target.value as CommandSuggestionApplyKey)}
                  >
                    <option value="altEnter">Alt+Enter</option>
                    <option value="ctrlSpace">Ctrl+Space</option>
                    <option value="tab">Tab</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                {commandSuggestionApplyKey === "custom" && (
                  <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-2">
                    <div className="truncate rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
                      {commandSuggestionCustomApplyKey?.label || "未配置"}
                    </div>
                    <Button
                      className="h-9 px-2 text-xs"
                      variant={recordingApplyKey ? "default" : "outline"}
                      disabled={!commandSuggestionsEnabled}
                      onClick={() => setRecordingApplyKey(true)}
                      onKeyDown={recordCustomApplyKey}
                    >
                      {recordingApplyKey ? "正在录入按键" : "录入按键"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-md border border-[var(--app-line)] bg-[var(--subtle-bg)] p-3">
              <div className="text-xs font-semibold text-[var(--app-muted)]">终端预览</div>
              <pre className="mt-2 rounded-md bg-cover bg-center p-3 text-xs leading-5" style={terminalPreviewStyle}>
                ERROR ssh failed at 10.0.0.8{"\n"}WARN retry in 300ms
              </pre>
            </div>
          </Panel>

          <Panel title="终端正则高亮">
            <div className="mb-4 grid grid-cols-[180px_minmax(0,1fr)_72px_92px] gap-2">
              <Input
                value={draft.name}
                placeholder="规则名称"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
              <Input
                value={draft.pattern}
                placeholder="正则表达式"
                onChange={(event) => setDraft((current) => ({ ...current, pattern: event.target.value }))}
              />
              <input
                aria-label="规则颜色"
                className="h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-1"
                type="color"
                value={draft.foreground}
                onChange={(event) => setDraft((current) => ({ ...current, foreground: event.target.value }))}
              />
              <Button onClick={addRule}>添加规则</Button>
            </div>

            <div className="space-y-2">
              {highlightRules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid grid-cols-[170px_minmax(0,1fr)_86px_72px] items-center gap-3 rounded-md border border-[var(--app-line)] bg-[var(--panel-bg)] p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: rule.foreground }} />
                      <span className="truncate text-sm font-semibold text-[var(--app-text)]">{rule.name}</span>
                      {rule.system && (
                        <span className="rounded bg-[var(--subtle-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-muted)]">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[var(--app-muted)]">{rule.enabled ? "已启用" : "已停用"}</div>
                  </div>
                  <code className="truncate rounded bg-[var(--subtle-bg)] px-2 py-1 text-xs text-[var(--app-muted)]">
                    {rule.pattern}
                  </code>
                  <Button variant="outline" className="h-8" onClick={() => onToggleHighlightRule(rule.id)}>
                    {rule.enabled ? "停用" : "启用"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8"
                    disabled={rule.system}
                    onClick={() => onDeleteHighlightRule(rule.id)}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function AiWorkspacePanel({
  activeSession,
  quotes,
  config,
  onConfigChange
}: {
  activeSession?: SessionTab;
  quotes: AiQuote[];
  config: AiConfig;
  onConfigChange: (config: AiConfig) => void;
}) {
  const [aiSessions, setAiSessions] = useState<AiSession[]>(() => loadStoredAiSessions());
  const [activeAiSessionId, setActiveAiSessionId] = useState(() => aiSessions[0]?.id || "");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [hermesStatus, setHermesStatus] = useState("等待检查");
  const [configOpen, setConfigOpen] = useState(false);
  const [dismissedContextIds, setDismissedContextIds] = useState<string[]>([]);
  const [previewContextId, setPreviewContextId] = useState("");
  const activeAiSession = aiSessions.find((session) => session.id === activeAiSessionId) || aiSessions[0];
  const selectedTool = activeAiSession?.tool || "codex";
  const messages = activeAiSession?.messages || [];
  const isCodex = selectedTool === "codex";
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const sessionContext = useMemo(() => createSessionContext(activeSession), [activeSession]);
  const contextChips = useMemo(() => {
    const contexts = [sessionContext, ...quotes.map((quote) => createQuoteContext(quote))].filter(Boolean) as AiContextChip[];
    return contexts.filter((context) => !dismissedContextIds.includes(context.id));
  }, [dismissedContextIds, quotes, sessionContext]);
  const previewContext = contextChips.find((context) => context.id === previewContextId);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.aiSessions, JSON.stringify(aiSessions));
  }, [aiSessions]);

  function updateAiSessionById(sessionId: string, update: (session: AiSession) => AiSession) {
    setAiSessions((current) =>
      current.map((session) => (session.id === sessionId ? update(session) : session))
    );
  }

  function updateActiveAiSession(update: (session: AiSession) => AiSession) {
    updateAiSessionById(activeAiSession.id, update);
  }

  function setSelectedTool(tool: AiTool) {
    if (tool === "hermes") {
      setConfigOpen(true);
    }
    updateActiveAiSession((session) => ({ ...session, tool, updatedAt: Date.now() }));
  }

  function setMessages(update: (messages: AiChatMessage[]) => AiChatMessage[]) {
    updateActiveAiSession((session) => {
      const messages = update(session.messages);
      const firstUserText = messages.find((message) => message.role === "user")?.text.trim();
      return {
        ...session,
        title: session.title === "新会话" && firstUserText ? firstUserText.slice(0, 18) : session.title,
        messages,
        updatedAt: Date.now()
      };
    });
  }

  function createNewAiSession() {
    const session = createAiSession(selectedTool);
    setAiSessions((current) => [session, ...current]);
    setActiveAiSessionId(session.id);
  }

  function updateAiMemory(memory: string) {
    updateActiveAiSession((session) => ({ ...session, memory, updatedAt: Date.now() }));
  }

  function updateAiModel(model: string) {
    updateActiveAiSession((session) => ({ ...session, model, updatedAt: Date.now() }));
  }

  function updateNoiseMode(noiseMode: AiNoiseMode) {
    updateActiveAiSession((session) => ({ ...session, noiseMode, updatedAt: Date.now() }));
  }

  function updateContinueSession(continueSession: boolean) {
    updateActiveAiSession((session) => ({ ...session, continueSession, updatedAt: Date.now() }));
  }

  function dismissContext(contextId: string) {
    setDismissedContextIds((current) => [...current, contextId]);
    if (previewContextId === contextId) {
      setPreviewContextId("");
    }
  }

  async function addAttachmentFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList as ArrayLike<File>).filter(Boolean);
    if (files.length === 0) return;

    setAttachmentStatus("正在保存附件...");
    const nextAttachments: AiAttachment[] = [];

    for (const file of files) {
      const name = attachmentNameForFile(file);
      const kind = getAttachmentKind(file);
      try {
        const content = await fileToBase64(file);
        const saved = await nativeBridge.saveAiAttachment(name, content);
        const textContent = kind === "text" ? await readTextAttachment(file) : undefined;
        const previewUrl = kind === "image" ? createImagePreviewUrl(file, content) : undefined;

        nextAttachments.push({
          id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name,
          type: file.type || "application/octet-stream",
          size: file.size,
          kind,
          localPath: saved.filePath || "",
          previewUrl,
          textContent,
          error: saved.success ? undefined : saved.error || "保存附件失败"
        });
      } catch (error) {
        nextAttachments.push({
          id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name,
          type: file.type || "application/octet-stream",
          size: file.size,
          kind,
          error: error instanceof Error ? error.message : "保存附件失败"
        });
      }
    }

    setAttachments((current) => [...current, ...nextAttachments]);
    const failed = nextAttachments.filter((attachment) => attachment.error).length;
    setAttachmentStatus(failed ? `${failed} 个附件保存失败` : "");
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      void addAttachmentFiles(event.target.files);
    }
    event.target.value = "";
  }

  function handlePromptPaste(event: ReactClipboardEvent<HTMLInputElement>) {
    const files = Array.from((event.clipboardData.files || []) as ArrayLike<File>).filter(Boolean);
    const itemFiles = files.length
      ? []
      : Array.from(event.clipboardData.items || [])
          .map((item) => (item.kind === "file" ? item.getAsFile() : null))
          .filter((file): file is File => Boolean(file));
    const pastedFiles = files.length ? files : itemFiles;
    if (pastedFiles.length === 0) return;

    event.preventDefault();
    void addAttachmentFiles(pastedFiles);
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  async function sendPrompt() {
    const text = prompt.trim();
    const currentAttachments = attachments;
    const aiSession = activeAiSession;
    if ((!text && currentAttachments.length === 0) || running || !aiSession) return;

    const userText = text || "查看附件";
    setPrompt("");
    setAttachments([]);
    setAttachmentStatus("");
    setRunStatus("");
    setMessages((current) => [
      ...current,
      { id: `user_${Date.now()}`, role: "user", text: userText, attachments: currentAttachments }
    ]);

    const model = aiSession.model || "";
    const noiseMode = aiSession.noiseMode || "standard";
    const fullPrompt = buildAiPrompt(userText, contextChips, currentAttachments);
    void executeAiRun({
      id: `run_${Date.now()}`,
      aiSessionId: aiSession.id,
      tool: aiSession.tool || selectedTool,
      prompt: fullPrompt,
      model,
      noiseMode,
      continueSession: aiSession.continueSession,
      codexSessionId: aiSession.codexSessionId,
      hermesSessionId: aiSession.hermesSessionId,
      contexts: contextChips,
      sessionTitle: activeSession?.title || "",
      codexCommand: config.codexCommand,
      codexWorkingDirectory: config.codexWorkingDirectory,
      hermesBaseUrl: config.hermesBaseUrl,
      hermesWsUrl: config.hermesWsUrl,
      hermesUsername: config.hermesUsername,
      hermesPassword: config.hermesPassword
    });
  }

  async function executeAiRun(run: AiRun) {
    if (running) return;
    setRunning(true);
    setRunStatus(run.tool === "codex" ? "Codex 执行中..." : "Hermes 调用中...");

    try {
      if (run.tool === "codex") {
        const start = await nativeBridge.startCodexRun({
          command: run.codexCommand,
          workingDirectory: run.codexWorkingDirectory,
          prompt: run.prompt,
          model: run.model,
          noiseMode: run.noiseMode,
          continueSession: run.continueSession && Boolean(run.codexSessionId),
          codexSessionId: run.codexSessionId
        });
        const result = start.success && start.jobId
          ? await pollCodexRun(start.jobId)
          : { success: false, error: start.error || "Codex 启动失败。" };
        const codexSessionId = extractCodexSessionId(result.output || "");
        if (codexSessionId) {
          updateAiSessionById(run.aiSessionId, (session) => ({ ...session, codexSessionId, updatedAt: Date.now() }));
        }
        const reply = extractCodexReply(result, run.prompt);
        setRunStatus(result.success ? "Codex 执行完成。" : "Codex 执行结束，返回失败。");
        setMessages((current) => [
          ...current,
          {
            id: `assistant_${Date.now()}`,
            role: "assistant",
            text: reply
          }
        ]);
      } else {
        try {
          const data = run.hermesWsUrl.trim()
            ? await sendHermesWebSocket(run.hermesWsUrl, run.prompt, run.sessionTitle)
            : await sendHermesHttp(run.hermesBaseUrl, run.prompt, run.sessionTitle, run.hermesUsername, run.hermesPassword, run.hermesSessionId);
          const hermesSessionId = extractHermesSessionId(data);
          if (hermesSessionId) {
            updateAiSessionById(run.aiSessionId, (session) => ({ ...session, hermesSessionId, updatedAt: Date.now() }));
          }
          setMessages((current) => [
            ...current,
            {
              id: `assistant_${Date.now()}`,
              role: "assistant",
              text: extractHermesReply(data)
            }
          ]);
          setRunStatus("Hermes 调用完成。");
        } catch (error) {
          setRunStatus("Hermes 调用失败。");
          setMessages((current) => [
            ...current,
            {
              id: `assistant_${Date.now()}`,
              role: "assistant",
              text: error instanceof Error ? error.message : "Hermes 调用失败。"
            }
          ]);
        }
      }
    } catch (error) {
      setRunStatus("AI 执行失败。");
      setMessages((current) => [
        ...current,
        {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "AI 执行失败。"
        }
      ]);
    } finally {
      setRunning(false);
    }
  }

  async function pollCodexRun(jobId: string) {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const result = await nativeBridge.getCodexRun(jobId);
      if (!result.success || result.completed || !result.running) {
        return result;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    return { success: false, error: "Codex 执行超时。", timedOut: true };
  }

  async function checkHermesConnection() {
    setHermesStatus("检查中...");
    try {
      const response = await nativeBridge.hermesHttpRequest({
        method: "GET",
        url: `${normalizeBaseUrl(config.hermesBaseUrl)}/health`
      });
      setHermesStatus(response.success ? "Hermes 连接正常" : `Hermes 连接失败：HTTP ${response.status || 0} ${response.error || response.body || ""}`);
    } catch (error) {
      setHermesStatus(error instanceof Error ? error.message : "Hermes 连接失败");
    }
  }

  return (
    <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
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

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">模型</span>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              aria-label="模型"
              value={activeAiSession?.model || ""}
              onChange={(event) => updateAiModel(event.target.value)}
            >
              {aiModelOptions.map((model) => (
                <option key={model || "auto"} value={model}>
                  {model || "自动"}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">降噪模式</span>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              aria-label="降噪模式"
              value={activeAiSession?.noiseMode || "standard"}
              onChange={(event) => updateNoiseMode(event.target.value as AiNoiseMode)}
            >
              <option value="minimal">极简</option>
              <option value="standard">标准</option>
              <option value="debug">调试</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            aria-label="AI 会话记录"
            value={activeAiSession?.id || ""}
            onChange={(event) => setActiveAiSessionId(event.target.value)}
          >
            {aiSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
          <Button variant="outline" className="h-9 px-3" onClick={createNewAiSession}>
            新会话
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
              checked={activeAiSession?.continueSession ?? true}
              onChange={(event) => updateContinueSession(event.target.checked)}
            />
            继续当前会话
          </label>
          <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setConfigOpen((open) => !open)}>
            高级配置
          </Button>
        </div>
      </header>

      <div className="min-h-0 overflow-auto bg-slate-50">
        {configOpen && (
          <AiConfigPanel
            selectedTool={selectedTool}
            config={config}
            hermesStatus={hermesStatus}
            onConfigChange={onConfigChange}
            onCheckHermes={checkHermesConnection}
          />
        )}

        <section className="border-b border-slate-200 bg-white px-4 py-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">会话记忆</span>
            <textarea
              data-testid="ai-memory-input"
              className="h-16 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              value={activeAiSession?.memory || ""}
              placeholder="例如：优先检查最新日志、默认使用当前项目目录"
              onChange={(event) => updateAiMemory(event.target.value)}
            />
          </label>
        </section>

        <section className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-slate-500">当前上下文</div>
            <div className="text-[11px] text-slate-400">{contextChips.length} 项</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {contextChips.map((context) => (
              <AiContextChipView
                key={context.id}
                context={context}
                active={previewContextId === context.id}
                onPreview={() => setPreviewContextId(previewContextId === context.id ? "" : context.id)}
                onDismiss={() => dismissContext(context.id)}
              />
            ))}
            {contextChips.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                暂无附加上下文
              </div>
            )}
          </div>
          {previewContext && (
            <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              {previewContext.text}
            </pre>
          )}
        </section>

        <div data-testid="ai-chat-transcript" className="space-y-3 px-4 py-4">
          {messages.map((message) => (
            <AiMessage key={message.id} role={message.role} attachments={message.attachments}>{message.text}</AiMessage>
          ))}
          {messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">
              暂无对话
            </div>
          )}
          {running && <AiRunStatus text={runStatus || "Codex 执行中..."} thinking />}
          {!running && runStatus && <AiRunStatus text={runStatus} />}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-1">附加当前会话</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">附加终端输出</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">附加选区日志</span>
        </div>
        {attachments.length > 0 && (
          <div className="mb-3 grid gap-2">
            {attachments.map((attachment) => (
              <AiAttachmentCard
                key={attachment.id}
                attachment={attachment}
                onRemove={() => removeAttachment(attachment.id)}
              />
            ))}
          </div>
        )}
        {attachmentStatus && <div className="mb-2 text-xs text-amber-600">{attachmentStatus}</div>}
        <input
          ref={attachmentInputRef}
          data-testid="ai-attachment-input"
          type="file"
          multiple
          className="hidden"
          accept="image/*,.txt,.log,.md,.json,.yaml,.yml,.xml,.csv,.sh,.ps1,.py,.js,.ts,.tsx,.css,.html"
          onChange={handleAttachmentInputChange}
        />
        <div className="grid grid-cols-[40px_1fr_44px] gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="添加附件"
            disabled={running}
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            value={prompt}
            placeholder="输入任务，选择 Codex 或 Hermes 执行..."
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={handlePromptPaste}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void sendPrompt();
              }
            }}
          />
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            title="发送"
            disabled={running}
            onClick={() => void sendPrompt()}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function AiContextChipView({
  context,
  active,
  onPreview,
  onDismiss
}: {
  context: AiContextChip;
  active: boolean;
  onPreview: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={cn(
      "inline-flex items-center overflow-hidden rounded-md border bg-white text-xs shadow-sm",
      active ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
    )}>
      <button
        className="inline-flex h-8 items-center gap-1.5 px-2.5 font-semibold text-slate-700 hover:bg-slate-50"
        onClick={onPreview}
      >
        <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
        {context.label}
      </button>
      <button
        aria-label={`查看 ${context.label}`}
        title={`查看 ${context.label}`}
        className="flex h-8 w-8 items-center justify-center border-l border-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        onClick={onPreview}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label={`复制 ${context.label}`}
        title={`复制 ${context.label}`}
        className="flex h-8 w-8 items-center justify-center border-l border-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        onClick={() => void navigator.clipboard?.writeText(context.text)}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label={`删除 ${context.label}`}
        title={`删除 ${context.label}`}
        className="flex h-8 w-8 items-center justify-center border-l border-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
        onClick={onDismiss}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AiQuoteCard({ quote }: { quote: AiQuote }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-700">
        <MessageSquare className="h-3.5 w-3.5" />
        来自 {quote.sourceTitle} 的终端引用
      </div>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-blue-100 bg-white p-2 text-xs leading-5 text-slate-800">
        {quote.text}
      </pre>
    </div>
  );
}

function buildAiPrompt(
  prompt: string,
  contexts: AiContextChip[],
  attachments: AiAttachment[] = []
) {
  const formattedContexts = contexts
    .filter((context) => context.type === "terminal_selection")
    .map((context) => {
      return `<terminal_selection title="${context.sourceTitle}" lines="${context.lineCount || getLineCount(context.text)}">\n${context.text}\n</terminal_selection>`;
    })
    .join("\n\n");
  const formattedAttachments = buildAttachmentPrompt(attachments);
  return [
    prompt,
    formattedContexts ? `Selected terminal context:\n${formattedContexts}` : "",
    formattedAttachments ? `Attachments:\n${formattedAttachments}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildAttachmentPrompt(attachments: AiAttachment[]) {
  return attachments
    .map((attachment) => {
      const lines = [
        `<attachment name="${attachment.name}" kind="${attachment.kind}" type="${attachment.type}" size="${attachment.size}">`,
        attachment.localPath ? `local_path: ${attachment.localPath}` : "",
        attachment.error ? `error: ${attachment.error}` : "",
        attachment.textContent ? `content:\n${attachment.textContent}` : "",
        "</attachment>"
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function extractCodexSessionId(output: string) {
  return output.match(/session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] || "";
}

function extractCodexReply(result: CodexJobResult, prompt: string) {
  const output = result.output || "";
  const cleaned = extractCodexFinalMessage(output, prompt) || sanitizeCodexOutput(output, prompt);
  if (result.success) {
    return cleaned || "Codex 执行完成，无输出。";
  }
  if (result.timedOut) {
    return "Codex 执行超时，请检查本地 Codex 环境。";
  }
  return cleaned && !looksLikeOnlyRuntimeNoise(cleaned)
    ? cleaned
    : "Codex 执行失败，请检查本地 Codex 环境。";
}

function extractCodexFinalMessage(output: string, prompt: string) {
  const tail = extractCodexTailAfterTokenStats(output, prompt);
  if (tail) return tail;

  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of output.replace(/\r\n?/g, "\n").split("\n")) {
    const text = line.trim();
    if (isCodexAssistantMarker(text)) {
      const block = current ? sanitizeCodexOutput(current.join("\n"), prompt) : "";
      if (block) blocks.push(block);
      current = [];
      continue;
    }
    if (!current) continue;
    if (isCodexTranscriptBoundary(text)) {
      const block = sanitizeCodexOutput(current.join("\n"), prompt);
      if (block) blocks.push(block);
      current = null;
      continue;
    }
    current.push(line);
  }

  const lastBlock = current ? sanitizeCodexOutput(current.join("\n"), prompt) : "";
  if (lastBlock) blocks.push(lastBlock);
  return blocks.at(-1) || "";
}

function extractCodexTailAfterTokenStats(output: string, prompt: string) {
  const lines = output.replace(/\r\n?/g, "\n").split("\n");
  const lastTokenStatsIndex = lines.map((line) => line.trim().toLowerCase()).lastIndexOf("tokens used");
  if (lastTokenStatsIndex === -1) return "";

  const tail = lines
    .slice(lastTokenStatsIndex + 1)
    .filter((line, index) => !(index === 0 && isCodexTokenCount(line.trim())))
    .join("\n");
  const cleaned = sanitizeCodexOutput(tail, prompt);
  return cleaned && !looksLikeOnlyRuntimeNoise(cleaned) ? cleaned : "";
}

function isCodexAssistantMarker(text: string) {
  return text.toLowerCase() === "codex";
}

function isCodexTranscriptBoundary(text: string) {
  if (!text) return false;
  if (/^(user|exec|tokens used)$/i.test(text)) return true;
  return isCodexRuntimeMetadata(text);
}

function isCodexRuntimeMetadata(text: string) {
  return /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(text);
}

function isCodexTokenCount(text: string) {
  return /^\d{1,3}(?:,\d{3})+$/.test(text);
}

function removeCodexRuntimeJsonFences(output: string) {
  const lines = output.split(/\r?\n/);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^```json\s*$/i.test(line.trim())) {
      kept.push(line);
      continue;
    }

    const closeIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.trim() === "```");
    if (closeIndex === -1) {
      kept.push(line);
      continue;
    }

    const body = lines.slice(index + 1, closeIndex).join("\n").trim();
    if (/^\{[\s\S]*"(type|delta)"\s*:[\s\S]*\}$/.test(body) && /"(message_delta|delta)"/.test(body)) {
      index = closeIndex;
      continue;
    }

    kept.push(line);
  }
  return kept.join("\n");
}

function sanitizeCodexOutput(output: string, prompt: string) {
  const promptLines = new Set(
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 3)
  );

  const withoutPrompt = removeCodexRuntimeJsonFences(output);
  return withoutPrompt
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const text = line.trim();
      if (!text) return false;
      if (promptLines.has(text)) return false;
      if (isCodexRuntimeMetadata(text)) return false;
      if (/^(user|exec|codex|tokens used)$/i.test(text)) return false;
      if (isCodexTokenCount(text)) return false;
      if (/^".+"\s+in\s+[A-Za-z]:\\/i.test(text)) return false;
      if (/^(会话记忆|最近对话|当前终端会话|用户问题)：?/.test(text)) return false;
      if (/^记住[：:]/.test(text)) return false;
      if (/^引用自 .+：?$/.test(text)) return false;
      if (/请直接回复我的内容/.test(text)) return false;
      if (/我会按当前仓库处理/.test(text)) return false;
      if (/^OpenAI Codex\b/i.test(text)) return false;
      if (/^session id:/i.test(text)) return false;
      if (/^tokens used:/i.test(text)) return false;
      if (/^succeeded in /i.test(text)) return false;
      if (/^---+$/.test(text)) return false;
      if (/^\{.*"(type|delta)"\s*:.*\}$/.test(text) && /"(message_delta|delta)"/.test(text)) return false;
      if (/codex_core_plugins/i.test(text)) return false;
      if (/curated plugin cache/i.test(text)) return false;
      if (/codex_mcp_client/i.test(text)) return false;
      if (/\bWARN\b.*MCP/i.test(text)) return false;
      if (/MCP startup failed/i.test(text)) return false;
      if (/handshaking with MCP server/i.test(text)) return false;
      if (/connection closed/i.test(text)) return false;
      if (/os error 5/i.test(text)) return false;
      if (/拒绝访问/.test(text)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function looksLikeOnlyRuntimeNoise(text: string) {
  return /^(failed to|error:|warning:|warn\b|mcp\b|codex_)/i.test(text.trim());
}

async function sendHermesHttp(baseUrl: string, prompt: string, sessionTitle: string, username: string, password: string, existingSessionId = "") {
  const base = normalizeBaseUrl(baseUrl);
  let cookie = "";
  if (password.trim()) {
    const login = await nativeBridge.hermesHttpRequest({
      method: "POST",
      url: `${base}/api/auth/login`,
      body: JSON.stringify({ username: username.trim() || "admin", password })
    });
    if (!login.success) {
      throw new Error(`Hermes 登录失败：HTTP ${login.status || 0}: ${login.error || login.body || "密码错误或认证失败"}`);
    }
    const loginData = parseHermesJson(login);
    const token = extractHermesToken(loginData);
    if (token) {
      return sendHermesStudioSocket(base, prompt, token, existingSessionId);
    }
    cookie = login.cookie || "";
  }

  let sessionId = existingSessionId.trim();
  if (!sessionId) {
    const session = await nativeBridge.hermesHttpRequest({
      method: "POST",
      url: `${base}/api/session/new`,
      cookie,
      body: JSON.stringify({ title: sessionTitle || "LdySSH" })
    });
    if (!session.success) {
      if (session.status === 401 && !password.trim()) {
        throw new Error("Hermes 需要登录密码，请在 Hermes 配置里填写登录密码。");
      }
      throw new Error(`Hermes HTTP ${session.status || 0}: ${session.error || session.body || "创建会话失败"}`);
    }
    const sessionData = parseHermesJson(session);
    sessionId = extractHermesSessionId(sessionData);
    if (!sessionId) {
      throw new Error("Hermes 未返回 session_id。");
    }
  }

  const response = await nativeBridge.hermesHttpRequest({
    method: "POST",
    url: `${base}/api/chat/start`,
    cookie,
    body: JSON.stringify({ session_id: sessionId, message: prompt })
  });
  if (!response.success) {
    throw new Error(`Hermes HTTP ${response.status || 0}: ${response.error || response.body || "请求失败"}`);
  }
  return attachHermesSessionId(parseHermesJson(response), sessionId);
}

function parseHermesJson(response: { contentType?: string; body?: string }) {
  const contentType = response.contentType || "";
  const body = response.body || "";
  return contentType.includes("application/json") ? JSON.parse(body || "{}") : body;
}

function attachHermesSessionId(data: unknown, sessionId: string) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...(data as Record<string, unknown>), sessionId };
  }
  return { reply: typeof data === "string" ? data : String(data ?? ""), sessionId };
}

function extractHermesSessionId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  if (typeof record.session_id === "string") return record.session_id;
  if (typeof record.sessionId === "string") return record.sessionId;
  const session = record.session;
  if (session && typeof session === "object" && typeof (session as Record<string, unknown>).session_id === "string") {
    return (session as Record<string, string>).session_id;
  }
  return "";
}

function extractHermesToken(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return typeof record.token === "string" ? record.token.trim() : "";
}

function makeHermesRunId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${id}`;
}

function buildHermesEngineUrl(baseUrl: string, sid?: string) {
  const params = new URLSearchParams();
  params.set("EIO", "4");
  params.set("transport", "polling");
  params.set("profile", "default");
  params.set("t", makeHermesRunId("t"));
  if (sid) params.set("sid", sid);
  return `${baseUrl}/socket.io/?${params.toString()}`;
}

function splitHermesEnginePackets(body: string) {
  return body.split("\x1e").map((packet) => packet.trim()).filter(Boolean);
}

function parseHermesEngineSid(body: string) {
  for (const packet of splitHermesEnginePackets(body)) {
    if (!packet.startsWith("0")) continue;
    const data = JSON.parse(packet.slice(1) || "{}") as Record<string, unknown>;
    return typeof data.sid === "string" ? data.sid : "";
  }
  return "";
}

function parseHermesSocketEvent(packet: string): [string, HermesRunEvent] | null {
  const prefix = "42/chat-run,";
  if (!packet.startsWith(prefix)) return null;
  const jsonStart = packet.indexOf("[", prefix.length);
  if (jsonStart < 0) return null;
  const data = JSON.parse(packet.slice(jsonStart)) as unknown;
  if (!Array.isArray(data) || typeof data[0] !== "string") return null;
  const payload = data[1];
  return [data[0], payload && typeof payload === "object" ? payload as HermesRunEvent : { text: String(payload ?? "") }];
}

async function requestHermesEngine(method: "GET" | "POST", url: string, body?: string) {
  const response = await nativeBridge.hermesHttpRequest({ method, url, body });
  if (!response.success) {
    throw new Error(`Hermes Socket.IO HTTP ${response.status || 0}: ${response.error || response.body || "请求失败"}`);
  }
  return response.body || "";
}

async function sendHermesStudioSocket(baseUrl: string, prompt: string, token: string, existingSessionId = "") {
  const sessionId = existingSessionId.trim() || makeHermesRunId("ldyssh");
  const queueId = makeHermesRunId("queue");
  const chunks: string[] = [];
  let sid = "";

  try {
    sid = parseHermesEngineSid(await requestHermesEngine("GET", buildHermesEngineUrl(baseUrl)));
    if (!sid) {
      throw new Error("Hermes Socket.IO 未返回连接 ID。");
    }

    await requestHermesEngine("POST", buildHermesEngineUrl(baseUrl, sid), `40/chat-run,${JSON.stringify({ token })}`);
    await requestHermesEngine("GET", buildHermesEngineUrl(baseUrl, sid));
    await requestHermesEngine("POST", buildHermesEngineUrl(baseUrl, sid), `42/chat-run,["run",${JSON.stringify({
      input: prompt,
      session_id: sessionId,
      profile: "default",
      source: "cli",
      queue_id: queueId
    })}]`);

    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const pollBody = await requestHermesEngine("GET", buildHermesEngineUrl(baseUrl, sid));
      for (const packet of splitHermesEnginePackets(pollBody)) {
        if (packet === "2") {
          await requestHermesEngine("POST", buildHermesEngineUrl(baseUrl, sid), "3");
          continue;
        }
        const event = parseHermesSocketEvent(packet);
        if (!event) continue;
        const [eventName, payload] = event;
        if (eventName === "message.delta") {
          const delta = payload.delta ?? payload.text;
          if (typeof delta === "string") chunks.push(delta);
          continue;
        }
        if (eventName === "run.completed") {
          const parsed = payload.parsed_content ?? payload.output;
          const reply = typeof parsed === "string" && parsed.trim() ? parsed : chunks.join("");
          return { reply: reply || "Hermes 已返回结果。", sessionId };
        }
        if (eventName === "run.failed") {
          const message = payload.error || payload.message || "请求失败";
          throw new Error(`Hermes Socket.IO 运行失败：${String(message)}`);
        }
      }
    }
    throw new Error("Hermes Socket.IO 响应超时");
  } finally {
    if (sid) {
      await requestHermesEngine("POST", buildHermesEngineUrl(baseUrl, sid), "41/chat-run,").catch(() => undefined);
    }
  }
}

function sendHermesWebSocket(wsUrl: string, prompt: string, sessionTitle: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(wsUrl.trim());
    const chunks: string[] = [];
    const timer = window.setTimeout(() => {
      socket.close();
      reject(new Error("Hermes WSS 响应超时"));
    }, 120000);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "chat", message: prompt, session: sessionTitle }));
    };
    socket.onmessage = (event) => {
      chunks.push(typeof event.data === "string" ? event.data : String(event.data));
    };
    socket.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Hermes WSS 连接失败"));
    };
    socket.onclose = () => {
      window.clearTimeout(timer);
      resolve(chunks.join("\n") || "Hermes WSS 已关闭连接，未返回文本。");
    };
  });
}

function extractHermesReply(data: unknown) {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["reply", "output", "content", "message", "text"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "Hermes 已返回结果。";
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

function AiConfigPanel({
  selectedTool,
  config,
  hermesStatus,
  onConfigChange,
  onCheckHermes
}: {
  selectedTool: AiTool;
  config: AiConfig;
  hermesStatus: string;
  onConfigChange: (config: AiConfig) => void;
  onCheckHermes: () => void;
}) {
  if (selectedTool === "codex") {
    return (
      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 text-xs font-semibold text-slate-500">Codex 配置</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Codex 命令">
            <Input
              value={config.codexCommand}
              onChange={(event) => onConfigChange({ ...config, codexCommand: event.target.value })}
            />
          </Field>
          <ReadonlyField label="执行方式" value="exec 隐藏窗口执行" />
          <Field label="工作目录">
            <Input
              value={config.codexWorkingDirectory}
              onChange={(event) => onConfigChange({ ...config, codexWorkingDirectory: event.target.value })}
            />
          </Field>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 text-xs font-semibold text-slate-500">Hermes 配置</div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Hermes Base URL</span>
          <Input
            aria-label="Hermes Base URL"
            value={config.hermesBaseUrl}
            onChange={(event) => onConfigChange({ ...config, hermesBaseUrl: event.target.value })}
          />
        </label>
        <div className="flex items-end">
          <Button variant="outline" onClick={onCheckHermes}>检查连接</Button>
        </div>
        <label className="col-span-2 block">
          <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Hermes 用户名</span>
          <Input
            aria-label="Hermes 用户名"
            value={config.hermesUsername}
            placeholder="默认 admin"
            onChange={(event) => onConfigChange({ ...config, hermesUsername: event.target.value })}
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Hermes 登录密码</span>
          <Input
            aria-label="Hermes 登录密码"
            type="password"
            value={config.hermesPassword}
            placeholder="和 Hermes WebUI 登录页使用同一个密码"
            onChange={(event) => onConfigChange({ ...config, hermesPassword: event.target.value })}
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Hermes WSS 地址（可选）</span>
          <Input
            aria-label="Hermes WSS URL"
            value={config.hermesWsUrl}
            placeholder="wss://你的-hermes-web-ui/ws 或 ws://内网地址/ws"
            onChange={(event) => onConfigChange({ ...config, hermesWsUrl: event.target.value })}
          />
        </label>
        <div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {hermesStatus}
        </div>
        <div className="col-span-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
          远端 WSS 获取方式：打开内网 Hermes WebUI，按 F12 进入 Network，筛选 WS，刷新或发送一条消息，复制以 ws:// 或 wss:// 开头的 Request URL。
        </div>
      </div>
    </section>
  );
}

const aiMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-1 text-lg font-semibold leading-6 text-slate-950">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-1 text-base font-semibold leading-6 text-slate-950">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-1 text-sm font-semibold leading-6 text-slate-900">{children}</h3>,
  p: ({ children }) => <p className="my-1 leading-6">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-4 border-slate-200 pl-3 text-slate-600">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a className="font-medium text-blue-600 underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className;
    if (inline) {
      return (
        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={cn("block font-mono text-[12px] leading-5 text-slate-100", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-left">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-auto rounded-md border border-slate-200">
      <table className="min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 font-semibold text-slate-700">{children}</th>,
  td: ({ children }) => <td className="border-b border-slate-100 px-2 py-1.5 align-top text-slate-700">{children}</td>,
  hr: () => <hr className="my-3 border-slate-200" />
};

function AiMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={aiMarkdownComponents}>
      {text}
    </ReactMarkdown>
  );
}

function AiMessage({
  role,
  attachments = [],
  children
}: {
  role: "user" | "assistant";
  attachments?: AiAttachment[];
  children: string;
}) {
  const user = role === "user";
  return (
    <div className={cn("flex", user ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] break-words rounded-lg px-3 py-2 text-sm leading-6",
          user ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"
        )}
      >
        {user ? <div className="whitespace-pre-wrap">{children}</div> : <AiMarkdown text={children} />}
        {attachments.length > 0 && (
          <div className="mt-2 grid gap-2">
            {attachments.map((attachment) => (
              <AiAttachmentCard key={attachment.id} attachment={attachment} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AiAttachmentCard({
  attachment,
  compact = false,
  onRemove
}: {
  attachment: AiAttachment;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const icon = attachment.kind === "image"
    ? <ImageIcon className="h-4 w-4" />
    : <Paperclip className="h-4 w-4" />;
  return (
    <div className={cn(
      "flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-slate-700",
      compact ? "text-xs" : "text-sm"
    )}>
      {attachment.kind === "image" && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="h-12 w-12 shrink-0 rounded border border-slate-200 object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-500">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{attachment.name}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">
          {attachment.type || "application/octet-stream"} · {formatFileSize(attachment.size)}
        </div>
        {attachment.localPath && (
          <div className="mt-0.5 truncate text-[11px] text-slate-400">{attachment.localPath}</div>
        )}
        {attachment.error && (
          <div className="mt-0.5 truncate text-[11px] text-rose-600">{attachment.error}</div>
        )}
      </div>
      {onRemove && (
        <button
          aria-label={`删除附件 ${attachment.name}`}
          title="删除附件"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function AiRunStatus({ text, thinking = false }: { text: string; thinking?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium",
      thinking ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"
    )}>
      {thinking && (
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
          thinking
        </span>
      )}
      <span>{text}</span>
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

function DeleteConfirmationDialog({
  confirmation,
  onCancel,
  onConfirm
}: {
  confirmation: DeleteConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog.Root open={Boolean(confirmation)} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-slate-950">确认删除</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-slate-600">
            {confirmation?.description}
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>取消</Button>
            <Button onClick={onConfirm}>{confirmation?.confirmLabel || "确认删除"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConnectDialog({
  open,
  form,
  error,
  mode,
  onOpenChange,
  onFormChange,
  onConnect,
  onSave,
  onBrowseKey
}: {
  open: boolean;
  form: ConnectionForm;
  error: string;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: ConnectionForm) => void;
  onConnect: () => void;
  onSave: () => void;
  onBrowseKey: () => void;
}) {
  function update<K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) {
    onFormChange({ ...form, [key]: value });
  }

  const isEdit = mode === "edit";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-950">
                {isEdit ? "编辑 SSH 连接" : "新建 SSH 连接"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                {isEdit ? "修改已保存主机的地址、端口和认证信息。" : "填写主机地址、端口和认证信息。"}
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
              <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                <Input value={form.keyPath} onChange={(event) => update("keyPath", event.target.value)} />
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  onClick={onBrowseKey}
                >
                  浏览密钥文件
                </button>
              </div>
            </Field>
          </div>

          {!isEdit && (
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.save}
                onChange={(event) => update("save", event.target.checked)}
              />
              保存到主机列表
            </label>
          )}

          {error && <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button onClick={isEdit ? onSave : onConnect}>{isEdit ? "保存" : "连接"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RetryPasswordDialog({
  prompt,
  onPasswordChange,
  onRetry,
  onClose
}: {
  prompt: RetryPasswordPrompt | null;
  onPasswordChange: (password: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(prompt)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/20" />
        <Dialog.Content
          data-testid="retry-password-dialog"
          className="fixed left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-950">输入密码</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                {prompt?.title || "SSH 会话"} 连接失败，请输入密码后重连。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {prompt?.error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {prompt.error}
            </div>
          )}

          <Field label="密码">
            <Input
              data-testid="retry-password-input"
              type="password"
              value={prompt?.password || ""}
              onChange={(event) => onPasswordChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRetry();
              }}
            />
          </Field>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button onClick={onRetry}>重新连接</Button>
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
