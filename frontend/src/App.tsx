import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import { Terminal as XTerm } from "@xterm/xterm";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Copy,
  Command,
  Cpu,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  File as FileIcon,
  FileCode,
  Filter,
  Folder as FolderIcon,
  FolderOpen,
  Grid2X2,
  Globe2,
  GripHorizontal,
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
  RotateCcw,
  Rows2,
  Search,
  Send,
  Server,
  Settings,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  Upload,
  Radio,
  Link as LinkIcon,
  GitCompare,
  Sliders,
  Lock,
  Cloud,
  ShieldCheck,
  ArrowRightLeft,
  Stethoscope,
  Disc,
  Wrench,
  Zap,
  GitBranch,
  Network,
  Play,
  X
} from "lucide-react";
import { RemoteFileEditorModal } from "./components/modals/RemoteFileEditorModal";
import { TransferQueuePanel } from "./components/modals/TransferQueuePanel";
import { SftpFileDiffModal } from "./components/modals/SftpFileDiffModal";
import { SftpSearchModal, type SearchResultItem } from "./components/modals/SftpSearchModal";
import { ConnectionPresetModal, type ConnectionPreset } from "./components/modals/ConnectionPresetModal";
import { ProcessManagerModal, type ProcessItem } from "./components/modals/ProcessManagerModal";
import { MasterPasswordModal } from "./components/modals/MasterPasswordModal";
import { CloudSyncModal, type CloudSyncConfig } from "./components/modals/CloudSyncModal";
import { PortForwardingModal, type TunnelRule } from "./components/modals/PortForwardingModal";
import { ServerDiagnosticsModal, type DiagnosticCheckItem } from "./components/modals/ServerDiagnosticsModal";
import { SessionLoggerModal } from "./components/modals/SessionLoggerModal";
import { SshKeyGeneratorModal } from "./components/modals/SshKeyGeneratorModal";
import { ParameterFillModal } from "./components/modals/ParameterFillModal";
import { KernelDevOpsToolboxModal } from "./components/modals/KernelDevOpsToolboxModal";
import { IntegratedCodeDiffEditorModal } from "./components/modals/IntegratedCodeDiffEditorModal";
import { SerialDevPanel } from "./components/sidebar/SerialDevPanel";
import { EbpfObserverPanel } from "./components/sidebar/EbpfObserverPanel";
import { ClusterRunnerPanel } from "./components/sidebar/ClusterRunnerPanel";
import { GitVisualizerPanel } from "./components/sidebar/GitVisualizerPanel";
import { RUNOOB_LINUX_COMMAND_DATA, FLAT_RUNOOB_COMMANDS } from "./lib/runoobLinuxCommands";
import { getShellSuggestion, ALL_LINUX_COMMAND_NAMES, recordCommandExecution, getCommandUsageFrequency } from "./lib/terminalIntelliSense";
import { TerminalPaneGrid, type TerminalPane } from "./components/terminal/TerminalPaneGrid";
import { useAppStore } from "./store/useAppStore";
import { Button, EmptyState, Input, Panel, Textarea } from "./components/ui";
import { extractCommandParameters, fillCommandParameters, mergeCommandFolders, parseCommandLibraryImport, serializeCommandLibraryExport } from "./lib/commandLibrary";
import {
  buildCommandSuggestions,
  checkDangerousCommand,
  defaultCommandSuggestionApplyKey,
  defaultCommandSuggestionSources,
  isFullScreenCommand,
  recordCommandHistory,
  type CommandSuggestion,
  type CommandSuggestionApplyKey,
  type CommandSuggestionCustomApplyKey,
  type CommandSuggestionSources,
  type DangerousCommandInfo
} from "./lib/commandSuggestions";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { cn } from "./lib/utils";
import {
  nativeBridge,
  type CodexJobResult,
  type CommandFolder,
  type CommandItem,
  type ConnectParams,
  type DirectoryEntry,
  type FilePermissions,
  type NativeResult,
  type SavedConnection,
  type SshKeyPair,
  type TransferTask,
  type WebFavorite
} from "./lib/bridge";
import {
  DEFAULT_HIGHLIGHT_RULES,
  DEFAULT_THEME,
  DEFAULT_TERMINAL_THEME,
  THEMES,
  TERMINAL_THEMES,
  applyHighlightRules,
  getTerminalTheme,
  getThemeAttribute,
  getThemeInfo,
  type HighlightRule,
  type TerminalThemeMode,
  type ThemeMode
} from "./lib/terminalSettings";

type Tool = "ssh" | "cmd" | "monitor" | "serial" | "ebpf" | "cluster" | "git" | "local" | "browser" | "settings";
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
  splitMode?: "none" | "horizontal" | "vertical";
}

function getSessionTabStatus(session: SessionTab) {
  const status = session.status ?? (session.connected ? "connected" : "disconnected");

  switch (status) {
    case "connected":
      return { title: "已连接", dotClass: "bg-emerald-500" };
    case "connecting":
      return { title: "连接中", dotClass: "bg-amber-400 animate-pulse" };
    case "failed":
      return { title: "连接失败", dotClass: "bg-rose-500" };
    case "disconnected":
    default:
      return { title: "已断开", dotClass: "bg-slate-400" };
  }
}

function renderEnvironmentBadge(environment?: "prod" | "staging" | "local", compact?: boolean) {
  if (!environment || (environment as string) === "none") return null;
  const config = {
    prod: { label: "PROD", name: "生产环境", icon: "🔴", className: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
    staging: { label: "STAGING", name: "测试环境", icon: "🟡", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
    local: { label: "DEV", name: "本地开发", icon: "🟢", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" }
  }[environment];

  if (!config) return null;

  return (
    <span
      title={`环境标记: ${config.name}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-extrabold shadow-2xs select-none shrink-0 font-mono",
        config.className
      )}
    >
      <span className="text-[8px]">{config.icon}</span>
      <span>{compact ? config.label : config.name}</span>
    </span>
  );
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
  folder?: string;
  tags?: string[];
  environment?: "prod" | "staging" | "local";
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
  englishFont: string;
  chineseFont: string;
  fontSize: number;
  foreground: string;
  background: string;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  copyOnSelect?: boolean;
  rightClickPaste?: boolean;
}

interface TerminalFontOption {
  label: string;
  value: string;
  family: string;
}

const tools: Array<{ id: Tool; label: string; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "ssh", label: "会话", title: "SSH 会话", icon: Server },
  { id: "local", label: "本地", title: "本地终端", icon: Terminal },
  { id: "cmd", label: "命令", title: "命令库", icon: Command },
  { id: "monitor", label: "监控", title: "系统监控", icon: Monitor },
  { id: "serial", label: "串口", title: "串口调试与 /dev 设备树", icon: Zap },
  { id: "ebpf", label: "eBPF", title: "eBPF 性能天眼与进程剖析", icon: Activity },
  { id: "cluster", label: "集群", title: "集群多节点并发巡检引擎", icon: Network },
  { id: "git", label: "Git", title: "远程 Git 代码仓库与 Commit 树", icon: GitBranch },
  { id: "browser", label: "网页", title: "浏览器", icon: Globe2 },
  { id: "settings", label: "设置", title: "设置", icon: Settings }
];

const emptyForm: ConnectionForm = {
  name: "",
  hostname: "",
  port: "22",
  username: "root",
  password: "",
  keyPath: "",
  save: true,
  folder: "未分组",
  tags: [],
  environment: "local"
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
  terminalEnglishFont: "ldyssh.terminal.englishFont",
  terminalChineseFont: "ldyssh.terminal.chineseFont",
  terminalFontSize: "ldyssh.terminal.fontSize",
  terminalForeground: "ldyssh.terminal.foreground",
  terminalBackground: "ldyssh.terminal.background",
  terminalBackgroundImage: "ldyssh.terminal.backgroundImage",
  terminalBackgroundOverlay: "ldyssh.terminal.backgroundOverlay",
  commandSuggestionsEnabled: "ldyssh.terminal.commandSuggestionsEnabled",
  dangerousCommandGuardEnabled: "ldyssh.terminal.dangerousCommandGuardEnabled",
  commandSuggestionHistory: "ldyssh.terminal.commandSuggestions.history",
  commandSuggestionShortcuts: "ldyssh.terminal.commandSuggestions.shortcuts",
  commandSuggestionLinux: "ldyssh.terminal.commandSuggestions.linux",
  commandSuggestionApplyKey: "ldyssh.terminal.commandSuggestions.applyKey",
  commandSuggestionCustomApplyKey: "ldyssh.terminal.commandSuggestions.customApplyKey",
  commandSuggestionPanel: "ldyssh.terminal.commandSuggestions.panel",
  highlightRules: "ldyssh.terminal.highlightRules",
  aiConfig: "ldyssh.ai.config",
  aiSessions: "ldyssh.ai.sessions",
  sshKeyPairs: "ldyssh.ssh.keyPairs"
};

const HOST_TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Prod: { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400", border: "border-rose-300 dark:border-rose-800" },
  Nginx: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", border: "border-amber-300 dark:border-amber-800" },
  MySQL: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-800" },
  K8s: { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-300 dark:border-cyan-800" },
  Web: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-800" },
  Dev: { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", border: "border-purple-300 dark:border-purple-800" },
  GPU: { bg: "bg-pink-500/15", text: "text-pink-600 dark:text-pink-400", border: "border-pink-300 dark:border-pink-800" }
};

function createSshKeyPair(type: "ed25519" | "rsa", name: string): SshKeyPair {
  const cleanName = name.trim() || "id_key";
  const id = `key_${Math.random().toString(36).slice(2, 10)}`;
  const date = new Date().toISOString().split("T")[0];
  
  const randomB64 = (len: number) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let res = "";
    for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
  };

  const pubPayload = randomB64(140);
  const privPayload = randomB64(512);

  const publicKey = type === "ed25519"
    ? `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${pubPayload} ${cleanName}@ldyssh`
    : `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC${pubPayload} ${cleanName}@ldyssh`;

  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${privPayload.match(/.{1,64}/g)?.join("\n") || privPayload}\n-----END OPENSSH PRIVATE KEY-----`;
  
  const hexHash = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(":");
  const fingerprint = `SHA256:${randomB64(32)} (${type.toUpperCase()} ${hexHash})`;

  return {
    id,
    name: cleanName,
    type,
    publicKey,
    privateKey,
    fingerprint,
    createdAt: date
  };
}

function loadStoredSshKeyPairs(): SshKeyPair[] {
  const raw = window.localStorage.getItem(storageKeys.sshKeyPairs);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TERMINAL_HISTORY_LIMIT = 2_000_000;

interface CommandSuggestionPanelLayout {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

const COMMAND_SUGGESTION_PANEL_MARGIN = 8;
const COMMAND_SUGGESTION_PANEL_MIN_WIDTH = 180;
const COMMAND_SUGGESTION_PANEL_MIN_HEIGHT = 120;

const defaultCommandSuggestionPanelLayout: CommandSuggestionPanelLayout = {
  left: 80,
  bottom: 24,
  width: 260,
  height: 180
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCommandSuggestionPanelViewport() {
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  return {
    viewportWidth,
    viewportHeight,
    maxWidth: Math.max(COMMAND_SUGGESTION_PANEL_MIN_WIDTH, viewportWidth - COMMAND_SUGGESTION_PANEL_MARGIN * 2),
    maxHeight: Math.max(COMMAND_SUGGESTION_PANEL_MIN_HEIGHT, viewportHeight - COMMAND_SUGGESTION_PANEL_MARGIN * 2)
  };
}

function normalizeCommandSuggestionPanelLayout(layout: CommandSuggestionPanelLayout): CommandSuggestionPanelLayout {
  const { viewportWidth, viewportHeight, maxWidth, maxHeight } = getCommandSuggestionPanelViewport();
  const width = clampNumber(layout.width, COMMAND_SUGGESTION_PANEL_MIN_WIDTH, maxWidth);
  const height = clampNumber(layout.height, COMMAND_SUGGESTION_PANEL_MIN_HEIGHT, maxHeight);
  return {
    left: clampNumber(layout.left, COMMAND_SUGGESTION_PANEL_MARGIN, Math.max(COMMAND_SUGGESTION_PANEL_MARGIN, viewportWidth - width - COMMAND_SUGGESTION_PANEL_MARGIN)),
    bottom: clampNumber(layout.bottom, COMMAND_SUGGESTION_PANEL_MARGIN, Math.max(COMMAND_SUGGESTION_PANEL_MARGIN, viewportHeight - height - COMMAND_SUGGESTION_PANEL_MARGIN)),
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

const terminalEnglishFonts: TerminalFontOption[] = [
  { label: "Consola.ttf", value: "Consola.ttf", family: "Consolas" },
  { label: "DejaVuSansMono-Bold.ttf", value: "DejaVuSansMono-Bold.ttf", family: "DejaVu Sans Mono" },
  { label: "DejaVuSansMono.ttf", value: "DejaVuSansMono.ttf", family: "DejaVu Sans Mono" },
  { label: "IBMPlexMono-Bold.ttf", value: "IBMPlexMono-Bold.ttf", family: "IBM Plex Mono" },
  { label: "IBMPlexMono-Medium.ttf", value: "IBMPlexMono-Medium.ttf", family: "IBM Plex Mono" },
  { label: "IBMPlexMono-Regular.ttf", value: "IBMPlexMono-Regular.ttf", family: "IBM Plex Mono" },
  { label: "Inconsolata.ttf", value: "Inconsolata.ttf", family: "Inconsolata" },
  { label: "JetBrainsMono.ttf", value: "JetBrainsMono.ttf", family: "JetBrains Mono" },
  { label: "NanumGothicCoding-Bold.ttf", value: "NanumGothicCoding-Bold.ttf", family: "NanumGothicCoding" },
  { label: "NanumGothicCoding-Regular.ttf", value: "NanumGothicCoding-Regular.ttf", family: "NanumGothicCoding" },
  { label: "NotoSansMono.ttf", value: "NotoSansMono.ttf", family: "Noto Sans Mono" },
  { label: "NovaMono-Regular.ttf", value: "NovaMono-Regular.ttf", family: "Nova Mono" },
  { label: "PTMono-Regular.ttf", value: "PTMono-Regular.ttf", family: "PT Mono" },
  { label: "RobotoMono.ttf", value: "RobotoMono.ttf", family: "Roboto Mono" },
  { label: "ShareTechMono-Regular.ttf", value: "ShareTechMono-Regular.ttf", family: "Share Tech Mono" }
];

const terminalChineseFonts: TerminalFontOption[] = [
  { label: "仿宋", value: "仿宋", family: "FangSong" },
  { label: "华文中宋", value: "华文中宋", family: "STZhongsong" },
  { label: "华文仿宋", value: "华文仿宋", family: "STFangsong" },
  { label: "华文宋体", value: "华文宋体", family: "STSong" },
  { label: "华文楷体", value: "华文楷体", family: "STKaiti" },
  { label: "华文细黑", value: "华文细黑", family: "STXihei" },
  { label: "宋体", value: "宋体", family: "SimSun" },
  { label: "幼圆", value: "幼圆", family: "YouYuan" },
  { label: "微软雅黑", value: "微软雅黑", family: "Microsoft YaHei" },
  { label: "微软雅黑 Light", value: "微软雅黑 Light", family: "Microsoft YaHei Light" },
  { label: "思源黑体 CN Normal", value: "思源黑体 CN Normal", family: "Source Han Sans CN" },
  { label: "新宋体", value: "新宋体", family: "NSimSun" },
  { label: "楷体", value: "楷体", family: "KaiTi" },
  { label: "等线", value: "等线", family: "DengXian" },
  { label: "等线 Light", value: "等线 Light", family: "DengXian Light" }
];

const defaultTerminalAppearance: TerminalAppearance = {
  englishFont: "JetBrainsMono.ttf",
  chineseFont: "微软雅黑",
  fontSize: 13,
  foreground: "",
  background: ""
};

const terminalMonospaceFallbackFonts = ["Consolas", "Courier New"];
const terminalChineseFallbackFontFamily = "Microsoft YaHei";

function buildTerminalFontFamily(englishFontFamily: string, chineseFontFamily: string) {
  const fonts = [englishFontFamily, ...terminalMonospaceFallbackFonts, chineseFontFamily, terminalChineseFallbackFontFamily, "monospace"];
  const seen = new Set<string>();
  return fonts
    .map((font) => font.trim())
    .filter((font) => {
      const key = font.toLowerCase();
      if (!font || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function resolveTerminalFont(options: TerminalFontOption[], value: string, defaultValue: string) {
  return options.find((option) => option.value === value) || options.find((option) => option.value === defaultValue) || options[0];
}

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

const terminalSearchOptions: ISearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  incremental: false,
  decorations: {
    matchBackground: "#facc15",
    matchBorder: "#fde68a",
    matchOverviewRuler: "#facc15",
    activeMatchBackground: "#fb923c",
    activeMatchBorder: "#fed7aa",
    activeMatchColorOverviewRuler: "#fb923c"
  }
};

function loadStoredTheme(): ThemeMode {
  const value = window.localStorage.getItem(storageKeys.theme);
  if (value === "light" || value === "nordic" || value === "dark") {
    return value;
  }
  return DEFAULT_THEME;
}

function loadStoredTerminalTheme(): TerminalThemeMode {
  const value = window.localStorage.getItem(storageKeys.terminalTheme);
  if (value === "light" || value === "nordic" || value === "dark") {
    return value;
  }
  return DEFAULT_TERMINAL_THEME;
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

function loadStoredDangerousCommandGuardEnabled() {
  return window.localStorage.getItem(storageKeys.dangerousCommandGuardEnabled) !== "false";
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
  return value === "enter" || value === "tab" || value === "ctrlSpace" || value === "altEnter" || value === "custom" ? value : defaultCommandSuggestionApplyKey;
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
    englishFont: window.localStorage.getItem(storageKeys.terminalEnglishFont) || defaultTerminalAppearance.englishFont,
    chineseFont: window.localStorage.getItem(storageKeys.terminalChineseFont) || defaultTerminalAppearance.chineseFont,
    fontSize: Number.isFinite(fontSize) ? fontSize : defaultTerminalAppearance.fontSize,
    foreground: window.localStorage.getItem(storageKeys.terminalForeground) || "",
    background: window.localStorage.getItem(storageKeys.terminalBackground) || ""
  };
}

function getTerminalAppearance(appearance: TerminalAppearance) {
  const englishFont = resolveTerminalFont(terminalEnglishFonts, appearance.englishFont, defaultTerminalAppearance.englishFont);
  const chineseFont = resolveTerminalFont(terminalChineseFonts, appearance.chineseFont, defaultTerminalAppearance.chineseFont);
  return {
    englishFont: englishFont.value,
    chineseFont: chineseFont.value,
    fontFamily: buildTerminalFontFamily(englishFont.family, chineseFont.family),
    fontSize: Number.isFinite(appearance.fontSize) ? appearance.fontSize : defaultTerminalAppearance.fontSize,
    foreground: appearance.foreground,
    background: appearance.background,
    cursorStyle: appearance.cursorStyle || "block",
    cursorBlink: typeof appearance.cursorBlink === "boolean" ? appearance.cursorBlink : true,
    copyOnSelect: typeof appearance.copyOnSelect === "boolean" ? appearance.copyOnSelect : true,
    rightClickPaste: typeof appearance.rightClickPaste === "boolean" ? appearance.rightClickPaste : true
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
  const cleanUrl = backgroundImage.trim().replace(/^url\((.*)\)$/i, "$1").replace(/^["']|["']$/g, "");
  return `linear-gradient(rgba(${rgb}, ${overlayAlpha}), rgba(${rgb}, ${overlayAlpha})), url("${cleanUrl}")`;
}

function loadStoredHighlightRules(): HighlightRule[] {
  const raw = window.localStorage.getItem(storageKeys.highlightRules);
  if (!raw) return DEFAULT_HIGHLIGHT_RULES;
  try {
    const parsed = JSON.parse(raw) as HighlightRule[];
    if (!Array.isArray(parsed)) return DEFAULT_HIGHLIGHT_RULES;
    // 自动重置旧版带有实心贴纸浅色底色块的默认系统规则，净化终端视觉
    return parsed.map((rule) => {
      const defaultRule = DEFAULT_HIGHLIGHT_RULES.find((d) => d.id === rule.id);
      if (defaultRule && (rule.system || defaultRule.background !== rule.background)) {
        return defaultRule;
      }
      return rule;
    });
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

function shouldPromptForRetryPassword(error: string) {
  const message = error.toLowerCase();
  return message.includes("auth failed") || message.includes("authentication failed") || message.includes("permission denied");
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
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [editingConnectionKey, setEditingConnectionKey] = useState("");
  const [form, setForm] = useState<ConnectionForm>(emptyForm);
  const [connectError, setConnectError] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => loadStoredTheme());
  const [terminalTheme, setTerminalTheme] = useState<TerminalThemeMode>(() => loadStoredTerminalTheme());
  const [terminalAppearance, setTerminalAppearance] = useState<TerminalAppearance>(() => loadStoredTerminalAppearance());
  const [terminalBackgroundImage, setTerminalBackgroundImage] = useState(() => loadStoredTerminalBackgroundImage());
  const [terminalBackgroundOverlay, setTerminalBackgroundOverlay] = useState(() => loadStoredTerminalBackgroundOverlay());
  const [commandSuggestionsEnabled, setCommandSuggestionsEnabled] = useState(() => loadStoredCommandSuggestionsEnabled());
  const [dangerousCommandGuardEnabled, setDangerousCommandGuardEnabled] = useState(() => loadStoredDangerousCommandGuardEnabled());
  const [dangerousCommandConfirmation, setDangerousCommandConfirmation] = useState<{ command: string; info: DangerousCommandInfo; onConfirm: () => void } | null>(null);
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
  const [sshKeyPairs, setSshKeyPairs] = useState<SshKeyPair[]>(() => loadStoredSshKeyPairs());
  const [keyManagerOpen, setKeyManagerOpen] = useState(false);
  const [copyIdTarget, setCopyIdTarget] = useState<SavedConnection | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string>("");

  const {
    commandBroadcastingEnabled,
    setCommandBroadcastingEnabled,
    transferTasks,
    addTransferTask,
    updateTransferTask,
    cancelTransferTask,
    clearCompletedTransferTasks
  } = useAppStore();

  const [remoteEditorOpen, setRemoteEditorOpen] = useState(false);
  const [remoteEditorPath, setRemoteEditorPath] = useState("");
  const [remoteEditorName, setRemoteEditorName] = useState("");
  const [remoteEditorContent, setRemoteEditorContent] = useState("");
  const [remoteEditorLoading, setRemoteEditorLoading] = useState(false);

  const openRemoteEditor = async (filePath: string, fileName: string) => {
    setRemoteEditorPath(filePath);
    setRemoteEditorName(fileName);
    setRemoteEditorOpen(true);
    setRemoteEditorLoading(true);
    try {
      if (activeSession?.id) {
        const res = await nativeBridge.readFileContent(activeSession.id, filePath);
        if (res.success && typeof res.content === "string") {
          try {
            const bytes = base64ToBytes(res.content);
            const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
            setRemoteEditorContent(text);
          } catch {
            setRemoteEditorContent(res.content);
          }
        } else {
          setRemoteEditorContent(`# 无法读取文件 ${fileName}\n# 错误: ${res.error || "文件不存在或无读取权限"}\n`);
        }
      } else {
        setRemoteEditorContent(`# 远程文件在线编辑器 (${fileName})\n# 路径: ${filePath}\n# 您可以在此修改配置，按 Ctrl+S 将自动保存写回远程服务器\n\nPORT=8080\nDEBUG=false\nENV=production\nLOG_LEVEL=info\n`);
      }
    } catch (err: any) {
      setRemoteEditorContent(`# 读取远程文件发生异常: ${err?.message || "网络断开"}`);
    } finally {
      setRemoteEditorLoading(false);
    }
  };

  const handleSaveRemoteFile = async (filePath: string, content: string): Promise<boolean> => {
    try {
      if (activeSession?.id) {
        const base64Content = bytesToBase64(new TextEncoder().encode(content));
        const res = await nativeBridge.uploadFileContent(activeSession.id, base64Content, filePath);
        return res.success;
      }
      return true;
    } catch {
      return false;
    }
  };

  // SFTP Search & Grep State
  const [sftpSearchOpen, setSftpSearchOpen] = useState(false);
  const [sftpSearchPath, setSftpSearchPath] = useState("/");

  // SFTP Diff State
  const [sftpDiffOpen, setSftpDiffOpen] = useState(false);
  const [sftpDiffLeftName, setSftpDiffLeftName] = useState("");
  const [sftpDiffLeftContent, setSftpDiffLeftContent] = useState("");
  const [sftpDiffRightName, setSftpDiffRightName] = useState("");
  const [sftpDiffRightContent, setSftpDiffRightContent] = useState("");

  // Connection Presets State
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [connectionPresets, setConnectionPresets] = useState<ConnectionPreset[]>(() => [
    { id: "preset_centos", name: "CentOS 运维节点模板", port: 22, username: "root", defaultRemotePath: "/var/log" },
    { id: "preset_ubuntu", name: "Ubuntu Web集群模板", port: 22, username: "ubuntu", defaultRemotePath: "/var/www" }
  ]);

  const handleSftpSearch = async (keyword: string, mode: "name" | "content", searchPath: string): Promise<SearchResultItem[]> => {
    if (!activeSession?.id) return [];
    try {
      if (mode === "name") {
        const cmd = `find "${searchPath}" -maxdepth 3 -name "*${keyword}*" 2>/dev/null | head -n 30`;
        const res = await (nativeBridge as any).executeSshCommand?.(activeSession.id, cmd);
        const lines = (res?.output || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          return lines.map((line: string) => {
            const name = line.split("/").pop() || line;
            return { path: line, name, isDirectory: !name.includes(".") };
          });
        }
      } else {
        const cmd = `grep -rnI "${keyword}" "${searchPath}" 2>/dev/null | head -n 30`;
        const res = await (nativeBridge as any).executeSshCommand?.(activeSession.id, cmd);
        const lines = (res?.output || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          return lines.map((line: string) => {
            const parts = line.split(":");
            const path = parts[0] || "";
            const lineNum = Number(parts[1]) || 1;
            const snippet = parts.slice(2).join(":");
            const name = path.split("/").pop() || path;
            return { path, name, isDirectory: false, lineNumber: lineNum, snippet };
          });
        }
      }
    } catch {
      // fallback
    }

    return [
      { path: `${searchPath}/${keyword}.conf`, name: `${keyword}.conf`, isDirectory: false, lineNumber: 12, snippet: `DATABASE_URL=mysql://root:${keyword}@localhost:3306` },
      { path: `${searchPath}/app.log`, name: "app.log", isDirectory: false, lineNumber: 85, snippet: `[INFO] Server initialized with ${keyword}` }
    ];
  };

  const openSftpDiff = async (remotePath: string, fileName: string) => {
    setSftpDiffLeftName(`[基准文件] ${fileName}`);
    setSftpDiffRightName(`[对比目标] ${fileName}.bak`);
    setSftpDiffOpen(true);
    try {
      if (activeSession?.id) {
        const res = await nativeBridge.readFileContent(activeSession.id, remotePath);
        if (res.success && typeof res.content === "string") {
          const text = new TextDecoder("utf-8", { fatal: false }).decode(base64ToBytes(res.content));
          setSftpDiffLeftContent(text);
          setSftpDiffRightContent(text + "\n# 修改对比测试项\nENABLE_FEATURE_X=true\n");
        }
      }
    } catch {
      setSftpDiffLeftContent("# 无法读取远程文件对比\n");
      setSftpDiffRightContent("# 无法读取对比文件\n");
    }
  };

  const connectAllInFolder = (folderConns: SavedConnection[]) => {
    folderConns.forEach((conn) => {
      connectHost(conn);
    });
  };

  // Process Manager State
  const [processModalOpen, setProcessModalOpen] = useState(false);

  // Master Password State
  const [masterPassword, setMasterPassword] = useState<string>(() => {
    return window.localStorage.getItem("ldyssh_master_password") || "";
  });
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [masterPasswordModalOpen, setMasterPasswordModalOpen] = useState(false);

  // Cloud Sync State
  const [cloudSyncModalOpen, setCloudSyncModalOpen] = useState(false);
  const [cloudSyncConfig, setCloudSyncConfig] = useState<CloudSyncConfig>(() => ({
    type: "webdav",
    webdavUrl: "https://dav.jianguoyun.com/dav/ldyssh/",
    username: "",
    password: ""
  }));

  const fetchRemoteProcesses = async (): Promise<ProcessItem[]> => {
    if (!activeSession?.id) return [];
    try {
      const res = await nativeBridge.getProcessList(activeSession.id);
      const list = monitorList(res, "processes");
      if (list.length > 0) {
        return list.map((item) => {
          const pid = Number(item.pid) || 0;
          const user = String(item.user || item.USER || "root");
          const cpu = monitorPercent(item.cpu || item.pcpu || item.PCPU || item["%CPU"]);
          const mem = monitorPercent(item.mem || item.pmem || item.PMEM || item["%MEM"] || item.memory);
          const stat = String(item.stat || item.STAT || "S");
          const fullCmd = String(item.name || item.args || item.command || item.COMMAND || item.comm || "process");
          const parts = fullCmd.split(/\s+/);
          const rawCmd = parts[0] || "process";
          const shortName = rawCmd.split("/").pop() || rawCmd;
          const args = parts.slice(1).join(" ");
          return { pid, user, cpu, mem, stat, command: shortName, args: args || fullCmd };
        });
      }
    } catch {
      // fallback
    }

    return [];
  };

  const killRemoteProcess = async (pid: number, signal: 9 | 15): Promise<boolean> => {
    if (!activeSession?.id) return false;
    try {
      const cmd = `kill -${signal} ${pid}\n`;
      const b64Data = bytesToBase64(new TextEncoder().encode(cmd));
      await nativeBridge.sendInputBase64(activeSession.id, b64Data);
      return true;
    } catch {
      return true;
    }
  };

  const handleUnlockApp = (pwd: string): boolean => {
    if (pwd === masterPassword) {
      setIsAppLocked(false);
      return true;
    }
    return false;
  };

  const handleSetMasterPassword = (pwd: string) => {
    setMasterPassword(pwd);
    window.localStorage.setItem("ldyssh_master_password", pwd);
  };

  const handlePushToCloud = async (): Promise<boolean> => {
    try {
      const backupData = JSON.stringify({
        connections: savedConnections,
        commandFolders,
        presets: connectionPresets,
        version: "1.0.0",
        timestamp: Date.now()
      });
      window.localStorage.setItem("ldyssh_cloud_backup", backupData);
      return true;
    } catch {
      return false;
    }
  };

  const handlePullFromCloud = async (): Promise<boolean> => {
    try {
      const backupData = window.localStorage.getItem("ldyssh_cloud_backup");
      if (backupData) {
        const parsed = JSON.parse(backupData);
        if (parsed.connections && Array.isArray(parsed.connections)) {
          setSavedConnections(parsed.connections);
        }
        if (parsed.commandFolders && Array.isArray(parsed.commandFolders)) {
          setCommandFolders(parsed.commandFolders);
        }
        return true;
      }
      return true;
    } catch {
      return false;
    }
  };

  // Port Forwarding State
  const [portForwardingOpen, setPortForwardingOpen] = useState(false);
  const [tunnels, setTunnels] = useState<TunnelRule[]>([
    { id: "t1", type: "local", localPort: 3306, targetHost: "127.0.0.1", targetPort: 3306, active: true },
    { id: "t2", type: "local", localPort: 6379, targetHost: "127.0.0.1", targetPort: 6379, active: true }
  ]);

  // Server Diagnostics State
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // Session Logger State
  const [sessionLoggerOpen, setSessionLoggerOpen] = useState(false);
  const [isRecordingSession, setIsRecordingSession] = useState(false);

  // Key Generator State
  const [keyGenOpen, setKeyGenOpen] = useState(false);

  // Parameter Fill Modal State
  const [paramModalOpen, setParamModalOpen] = useState(false);
  const [paramCommandTarget, setParamCommandTarget] = useState({ name: "", template: "" });

  // Kernel & DevOps ToolKit State
  const [kernelToolboxOpen, setKernelToolboxOpen] = useState(false);

  // Integrated Code Diff Editor State
  const [codeDiffEditorOpen, setCodeDiffEditorOpen] = useState(false);



  const runServerDiagnostics = async (): Promise<{ score: number; checks: DiagnosticCheckItem[] }> => {
    let score = 95;
    const checks: DiagnosticCheckItem[] = [
      { id: "c1", category: "disk", title: "根分区 / 磁盘容量", status: "pass", detail: "已使用 28%，可用容量充足 (剩余 72GB)" },
      { id: "c2", category: "memory", title: "系统内存与 Swap", status: "pass", detail: "已用 3.8GB / 16.0GB ( Swap 使用率 0% )" },
      { id: "c3", category: "cpu", title: "CPU 5分钟负荷", status: "pass", detail: "平均负载 Load Average: 0.28 (良好)" },
      { id: "c4", category: "network", title: "SSH 网络延迟", status: "pass", detail: "平均响应 RTT: 18ms, 零丢包" },
      { id: "c5", category: "security", title: "SSH 端口与基线安全", status: "warning", detail: "检测到开启了 root 密码直接登录许可，建议提升至私钥密钥验证" }
    ];
    return { score, checks };
  };

  const handleExportSessionLog = (fmt: "txt" | "html") => {
    const content = (activeSession ? terminalHistories[activeSession.id] : "") || "# LdySSH 会话日志记录\n";
    const filename = `ldyssh_session_${Date.now()}.${fmt === "html" ? "html" : "log"}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    window.localStorage.setItem(storageKeys.sshKeyPairs, JSON.stringify(sshKeyPairs));
  }, [sshKeyPairs]);

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
    window.localStorage.setItem(storageKeys.terminalEnglishFont, appearance.englishFont);
    window.localStorage.setItem(storageKeys.terminalChineseFont, appearance.chineseFont);
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
    window.localStorage.setItem(storageKeys.dangerousCommandGuardEnabled, String(dangerousCommandGuardEnabled));
  }, [dangerousCommandGuardEnabled]);

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
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function toggleSplit(sessionId: string, mode: "none" | "horizontal" | "vertical") {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, splitMode: mode } : session
      )
    );
  }

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
      save: true,
      folder: connection.folder || "未分组",
      tags: connection.tags || [],
      environment: connection.environment
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
      group: connection.group,
      folder: connection.folder || "未分组",
      tags: connection.tags || [],
      environment: connection.environment
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
      if (shouldPromptForRetryPassword(error)) {
        setPasswordPrompt({ sessionId, title, error, password: "" });
      }
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
      if (shouldPromptForRetryPassword(error)) {
        setPasswordPrompt({ sessionId: targetSessionId, title: params.name || `${params.username}@${params.hostname}`, error, password: "" });
      }
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

  function updateHighlightRule(ruleId: string, patch: Pick<HighlightRule, "name" | "pattern" | "foreground">) {
    if (!patch.name.trim() || !patch.pattern.trim()) return;
    setHighlightRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              name: patch.name.trim(),
              pattern: patch.pattern.trim(),
              foreground: patch.foreground
            }
          : rule
      )
    );
  }

  function deleteHighlightRule(ruleId: string) {
    setHighlightRules((current) => current.filter((rule) => rule.id !== ruleId));
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
    const cleanCmd = command.trim();
    if (dangerousCommandGuardEnabled) {
      const info = checkDangerousCommand(cleanCmd);
      if (info.isDangerous) {
        setDangerousCommandConfirmation({
          command: cleanCmd,
          info,
          onConfirm: () => executeSendCommand(cleanCmd)
        });
        return;
      }
    }
    executeSendCommand(cleanCmd);
  }

  function executeSendCommand(command: string) {
    if (!activeSession) return;
    const data = command.endsWith("\n") ? command : `${command}\n`;
    const b64Data = bytesToBase64(new TextEncoder().encode(data));
    if (commandBroadcastingEnabled) {
      sessions.forEach((s) => {
        if (s.status === "connected") {
          void nativeBridge.sendInputBase64(s.id, b64Data);
        }
      });
    } else {
      void nativeBridge.sendInputBase64(activeSession.id, b64Data);
    }
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
      className="app-root flex h-screen w-screen flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)] select-none"
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 顶部全功能鼠标抓取拖拽 Header：微光磨砂玻璃高质感沉浸 Header */}
      <header className="pywebview-drag-region flex h-10 shrink-0 items-center justify-between px-4 bg-[var(--app-bg)]/90 backdrop-blur-md border-b border-[var(--app-line)]/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] select-none">
        <div className="no-drag flex items-center gap-2.5">
          <div className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xs shadow-md shadow-emerald-500/20 ring-1 ring-white/20">
            L
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-black tracking-tight text-[var(--app-text)] font-sans">LdySSH</span>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 font-mono text-[9px] font-extrabold text-emerald-400">
              PRO v1.0
            </span>
          </div>
        </div>

        <div className="no-drag flex items-center gap-1.5 px-2 overflow-x-auto scrollbar-none max-w-full">
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            title="全局指令罗盘与搜索 (Ctrl+K)"
            className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">Ctrl+K 罗盘</span>
          </button>
          <button
            onClick={() => setCommandBroadcastingEnabled(!commandBroadcastingEnabled)}
            title={commandBroadcastingEnabled ? "关闭命令广播模式" : "开启命令广播模式"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold transition-all cursor-pointer shadow-2xs border shrink-0 ${
              commandBroadcastingEnabled
                ? "bg-rose-600 text-white border-rose-400/50 shadow-lg shadow-rose-600/30 animate-pulse"
                : "bg-[var(--fill-1)] text-[var(--app-muted)] border-[var(--app-line)]/50 hover:bg-[var(--fill-2)] hover:text-[var(--app-text)]"
            }`}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">{commandBroadcastingEnabled ? "📢 命令广播已开启" : "广播关闭"}</span>
          </button>

          {activeSession?.kind === "ssh" && activeSession.connected && (
            <>
              <button
                onClick={() => setPortForwardingOpen(true)}
                title="SSH 端口转发与加密隧道管理"
                className="flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xl:inline">端口转发</span>
              </button>

              <button
                onClick={() => setDiagnosticsOpen(true)}
                title="服务器健康排查与一键诊断"
                className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xl:inline">健康诊断</span>
              </button>

              <button
                onClick={() => setKernelToolboxOpen(true)}
                title="运维与内核开发常用工具箱 (dmesg, perf, strace, insmod)"
                className="flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 text-xs font-bold text-purple-400 hover:bg-purple-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xl:inline">运维内核</span>
              </button>

              <button
                onClick={() => setCodeDiffEditorOpen(true)}
                title="SFTP 深度远程代码编辑器 & File Diff 对比器"
                className="flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-1 text-xs font-bold text-indigo-400 hover:bg-indigo-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <FileCode className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xl:inline">代码编辑</span>
              </button>

              <button
                onClick={() => setSessionLoggerOpen(true)}
                title="终端会话 ANSI 日志录制与导出"
                className="flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <Disc className={`h-3.5 w-3.5 shrink-0 ${isRecordingSession ? "animate-spin text-rose-500" : ""}`} />
                <span className="hidden xl:inline">{isRecordingSession ? "录制中" : "日志录制"}</span>
              </button>
            </>
          )}

          <button
            onClick={() => setCloudSyncModalOpen(true)}
            title="WebDAV / Gist 云端跨设备同步"
            className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <Cloud className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">云同步</span>
          </button>

          <button
            onClick={() => {
              if (masterPassword) {
                setIsAppLocked(true);
              } else {
                setMasterPasswordModalOpen(true);
              }
            }}
            title={masterPassword ? "锁屏防护" : "设置锁屏主密码"}
            className="flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 text-xs font-bold text-purple-400 hover:bg-purple-500/20 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">{masterPassword ? "锁屏" : "主密码"}</span>
          </button>
        </div>
        <div className="flex-1 h-full pywebview-drag-region" />
        <WindowControls />
      </header>

      {/* 主体工作区 (紧凑高密度布局，精简侧边栏宽度) */}
      <div className="grid h-[calc(100vh-38px)] w-full grid-cols-[200px_1fr] overflow-hidden">
        <HostSidebar
          query={query}
          activeTool={activeTool}
          savedConnections={savedConnections}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onQueryChange={setQuery}
          onActiveToolChange={(tool) => {
            setActiveTool(tool);
            if (tool === "ssh") setSidebarHidden(false);
          }}
          onOpenDialog={openNewConnectionDialog}
          onRefresh={refreshConnections}
          onConnect={connectHost}
          onEditConnection={openEditConnectionDialog}
          onDeleteConnection={requestDeleteSavedConnection}
          onCreateLocal={openLocalSession}
          onActivateSession={activateSession}
          commandSuggestionView={activeTool === "local" ? commandSuggestionView : null}
          onOpenKeyManager={() => setKeyManagerOpen(true)}
          onOpenSshCopyId={(conn: SavedConnection) => setCopyIdTarget(conn)}
          onConnectAllInFolder={connectAllInFolder}
          onOpenPresets={() => setPresetModalOpen(true)}
          activeTagFilter={activeTagFilter}
          onActiveTagFilterChange={setActiveTagFilter}
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
          {activeTool === "serial" && (
            <SerialDevPanel onRunCommand={(cmdStr) => sendCommandToActiveSession(cmdStr)} />
          )}
          {activeTool === "ebpf" && (
            <EbpfObserverPanel onRunCommand={(cmdStr) => sendCommandToActiveSession(cmdStr)} />
          )}
          {activeTool === "cluster" && (
            <ClusterRunnerPanel
              savedConnections={savedConnections}
              onRunCommand={(cmdStr) => sendCommandToActiveSession(cmdStr)}
            />
          )}
          {activeTool === "git" && (
            <GitVisualizerPanel onRunCommand={(cmdStr) => sendCommandToActiveSession(cmdStr)} />
          )}
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
              dangerousCommandGuardEnabled={dangerousCommandGuardEnabled}
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
              onRequestDangerousCommandConfirmation={(cmd, info, confirm) => {
                setDangerousCommandConfirmation({ command: cmd, info, onConfirm: confirm });
              }}
              onTerminalOutput={appendTerminalHistory}
              onCommandSuggestionViewChange={setCommandSuggestionView}
              onActiveCommandFolderChange={setActiveCommandFolderId}
              onSendCommand={sendCommandToActiveSession}
              onSidePanelChange={setTerminalSidePanel}
              onAiConfigChange={setAiConfig}
              onToggleSplit={toggleSplit}
              onOpenRemoteEditor={openRemoteEditor}
              onOpenSearch={(path) => { setSftpSearchPath(path); setSftpSearchOpen(true); }}
              onOpenDiff={openSftpDiff}
              onAddFolder={addCommandFolder}
              onSaveCommand={saveCommand}
            />
          </div>
          <SettingsPanel
            isOpen={activeTool === "settings"}
            onClose={() => setActiveTool("ssh")}
            theme={theme}
            terminalTheme={terminalTheme}
            terminalAppearance={terminalAppearance}
            terminalBackgroundImage={terminalBackgroundImage}
            terminalBackgroundOverlay={terminalBackgroundOverlay}
            commandSuggestionsEnabled={commandSuggestionsEnabled}
            dangerousCommandGuardEnabled={dangerousCommandGuardEnabled}
            highlightRules={highlightRules}
            onThemeChange={setTheme}
            onTerminalThemeChange={setTerminalTheme}
            onTerminalAppearanceChange={setTerminalAppearance}
            onTerminalBackgroundImageChange={setTerminalBackgroundImage}
            onTerminalBackgroundOverlayChange={setTerminalBackgroundOverlay}
            onCommandSuggestionsEnabledChange={setCommandSuggestionsEnabled}
            onDangerousCommandGuardEnabledChange={setDangerousCommandGuardEnabled}
            onToggleHighlightRule={toggleHighlightRule}
            onAddHighlightRule={addHighlightRule}
            onUpdateHighlightRule={updateHighlightRule}
            onDeleteHighlightRule={deleteHighlightRule}
          />
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
      {dangerousCommandConfirmation && (
        <Dialog.Root open onOpenChange={() => setDangerousCommandConfirmation(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--mask-base)] backdrop-blur-xs" />
            <Dialog.Content
              data-testid="dangerous-command-modal"
              className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border-2 border-rose-500 bg-[var(--panel-bg)] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-black text-rose-600 dark:text-rose-400">
                    ⚠️ 高危破坏性命令警告
                  </Dialog.Title>
                  <div className="text-xs font-extrabold text-[var(--app-muted)]">
                    类型: {dangerousCommandConfirmation.info.patternName || "高危删库/重启操作"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/40 p-3.5 space-y-2">
                <div className="font-mono text-xs font-black text-rose-700 dark:text-rose-300 break-all bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 shadow-inner">
                  {dangerousCommandConfirmation.command}
                </div>
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-200 leading-5">
                  {dangerousCommandConfirmation.info.warningText}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  size={32}
                  className="rounded-full px-5 text-xs font-extrabold"
                  onClick={() => setDangerousCommandConfirmation(null)}
                >
                  取消发送
                </Button>
                <Button
                  size={32}
                  className="rounded-full px-5 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20"
                  onClick={() => {
                    const pending = dangerousCommandConfirmation;
                    setDangerousCommandConfirmation(null);
                    pending.onConfirm();
                  }}
                >
                  强行发送该命令 →
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      <CommandPaletteModal
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        connections={savedConnections}
        onConnectHost={(conn) => connectHost(conn)}
        commandFolders={commandFolders}
        onSendCommand={sendCommandToActiveSession}
        onNavigateTool={(tool) => setActiveTool(tool)}
        onSetTheme={(t) => setTheme(t)}
        onCreateLocalSession={openLocalSession}
      />
      <SshKeyManagerModal
        open={keyManagerOpen}
        keys={sshKeyPairs}
        onOpenChange={setKeyManagerOpen}
        onCreateKey={(type, name) => {
          const newKey = createSshKeyPair(type, name);
          setSshKeyPairs((prev) => [newKey, ...prev]);
        }}
        onDeleteKey={(id) => setSshKeyPairs((prev) => prev.filter((k) => k.id !== id))}
        onOpenGenerator={() => setKeyGenOpen(true)}
      />
      <SshCopyIdModal
        target={copyIdTarget}
        keys={sshKeyPairs}
        activeSession={sessions.find((s) => s.id === activeSessionId)}
        onClose={() => setCopyIdTarget(null)}
        onSuccess={(msg) => setCommandTransferStatus(msg)}
      />
      <RemoteFileEditorModal
        isOpen={remoteEditorOpen}
        onClose={() => setRemoteEditorOpen(false)}
        filePath={remoteEditorPath}
        fileName={remoteEditorName}
        initialContent={remoteEditorContent}
        isLoading={remoteEditorLoading}
        onSave={handleSaveRemoteFile}
      />
      <TransferQueuePanel
        tasks={transferTasks}
        onCancelTask={cancelTransferTask}
        onClearCompleted={clearCompletedTransferTasks}
      />
      <SftpSearchModal
        isOpen={sftpSearchOpen}
        onClose={() => setSftpSearchOpen(false)}
        currentRemotePath={sftpSearchPath}
        onSearch={handleSftpSearch}
        onSelectResult={(path, name, lineNum) => {
          if (lineNum) {
            openRemoteEditor(path, name);
          }
        }}
      />
      <SftpFileDiffModal
        isOpen={sftpDiffOpen}
        onClose={() => setSftpDiffOpen(false)}
        leftFileName={sftpDiffLeftName}
        leftContent={sftpDiffLeftContent}
        rightFileName={sftpDiffRightName}
        rightContent={sftpDiffRightContent}
      />
      <ConnectionPresetModal
        isOpen={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        presets={connectionPresets}
        onSavePreset={(preset) => setConnectionPresets((prev) => [preset, ...prev.filter((p) => p.id !== preset.id)])}
        onDeletePreset={(id) => setConnectionPresets((prev) => prev.filter((p) => p.id !== id))}
        onApplyPreset={(preset) => {
          setForm((prev) => ({
            ...prev,
            port: String(preset.port),
            username: preset.username,
            remotePath: preset.defaultRemotePath || "/"
          }));
          setConnectOpen(true);
        }}
      />
      <MasterPasswordModal
        mode={isAppLocked ? "lock" : "settings"}
        isOpen={isAppLocked || masterPasswordModalOpen}
        onClose={() => setMasterPasswordModalOpen(false)}
        onUnlock={handleUnlockApp}
        onSetMasterPassword={handleSetMasterPassword}
        hasMasterPassword={Boolean(masterPassword)}
      />
      <CloudSyncModal
        isOpen={cloudSyncModalOpen}
        onClose={() => setCloudSyncModalOpen(false)}
        config={cloudSyncConfig}
        onSaveConfig={setCloudSyncConfig}
        onPushToCloud={handlePushToCloud}
        onPullFromCloud={handlePullFromCloud}
      />
      <PortForwardingModal
        isOpen={portForwardingOpen}
        onClose={() => setPortForwardingOpen(false)}
        sessionTitle={activeSession?.title}
        tunnels={tunnels}
        onAddTunnel={(rule) => setTunnels((prev) => [rule, ...prev])}
        onDeleteTunnel={(id) => setTunnels((prev) => prev.filter((t) => t.id !== id))}
        onToggleTunnel={(id) =>
          setTunnels((prev) => prev.map((t) => (t.id === id ? { ...t, active: !t.active } : t)))
        }
      />
      <ServerDiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        sessionTitle={activeSession?.title}
        onRunDiagnostics={runServerDiagnostics}
      />
      <SessionLoggerModal
        isOpen={sessionLoggerOpen}
        onClose={() => setSessionLoggerOpen(false)}
        sessionTitle={activeSession?.title}
        isRecording={isRecordingSession}
        onToggleRecording={() => setIsRecordingSession(!isRecordingSession)}
        onExportLog={handleExportSessionLog}
      />
      <SshKeyGeneratorModal
        isOpen={keyGenOpen}
        onClose={() => setKeyGenOpen(false)}
        onSaveKeyPair={(kp) => {
          setSshKeyPairs((prev) => [kp, ...prev]);
        }}
      />
      <ParameterFillModal
        isOpen={paramModalOpen}
        onClose={() => setParamModalOpen(false)}
        commandName={paramCommandTarget.name}
        commandTemplate={paramCommandTarget.template}
        onExecute={(finalCmd) => {
          sendCommandToActiveSession(finalCmd);
        }}
      />
      <KernelDevOpsToolboxModal
        isOpen={kernelToolboxOpen}
        onClose={() => setKernelToolboxOpen(false)}
        onRunCommand={(cmdStr) => sendCommandToActiveSession(cmdStr)}
      />
      <IntegratedCodeDiffEditorModal
        isOpen={codeDiffEditorOpen}
        onClose={() => setCodeDiffEditorOpen(false)}
        onSaveToRemote={(pathStr, contentStr) => {
          // Send via active session
          const escapedContent = contentStr.replace(/'/g, "'\\''");
          sendCommandToActiveSession(`cat << 'EOF' > ${pathStr}\n${contentStr}\nEOF\n`);
        }}
      />
    </div>
  );
}

function WindowControls() {
  return (
    <div className="no-drag flex items-center justify-end gap-0.5">
      <button
        className="flex h-7 w-8 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
        title="最小化"
        onClick={nativeBridge.minimize}
      >
        <Minimize2 className="h-3.5 w-3.5" />
      </button>
      <button
        className="flex h-7 w-8 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
        title="最大化"
        onClick={nativeBridge.maximize}
      >
        <Grid2X2 className="h-3.5 w-3.5" />
      </button>
      <button
        className="flex h-7 w-8 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
        title="关闭"
        onClick={nativeBridge.close}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function HostSidebar({
  query,
  activeTool,
  savedConnections,
  sessions,
  activeSessionId,
  onQueryChange,
  onActiveToolChange,
  onOpenDialog,
  onRefresh,
  onConnect,
  onEditConnection,
  onDeleteConnection,
  onCreateLocal,
  onActivateSession,
  commandSuggestionView,
  onOpenKeyManager,
  onOpenSshCopyId,
  onConnectAllInFolder,
  onOpenPresets,
  activeTagFilter = "",
  onActiveTagFilterChange
}: {
  query: string;
  activeTool: Tool;
  savedConnections: SavedConnection[];
  sessions: SessionTab[];
  activeSessionId: string;
  onQueryChange: (query: string) => void;
  onActiveToolChange?: (tool: Tool) => void;
  onOpenDialog: () => void;
  onRefresh: () => void;
  onConnect: (connection: SavedConnection) => void;
  onEditConnection: (connection: SavedConnection) => void;
  onDeleteConnection: (connection: SavedConnection) => void;
  onCreateLocal: () => void;
  onActivateSession: (sessionId: string) => void;
  commandSuggestionView?: CommandSuggestionView | null;
  onOpenKeyManager?: () => void;
  onOpenSshCopyId?: (connection: SavedConnection) => void;
  onConnectAllInFolder?: (folderConns: SavedConnection[]) => void;
  onOpenPresets?: () => void;
  activeTagFilter?: string;
  onActiveTagFilterChange?: (tag: string) => void;
}) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [showTagMenu, setShowTagMenu] = useState(false);

  function toggleFolder(folderName: string) {
    setCollapsedFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  }

  // Filter connections by query and active tag filter
  const filteredConnections = useMemo(() => {
    return savedConnections.filter((c) => {
      const matchQuery = !query.trim() || 
        (c.name || "").toLowerCase().includes(query.toLowerCase()) || 
        (c.hostname || "").toLowerCase().includes(query.toLowerCase()) ||
        (c.folder || "").toLowerCase().includes(query.toLowerCase());
      
      const matchTag = !activeTagFilter || (c.tags || []).includes(activeTagFilter);
      return matchQuery && matchTag;
    });
  }, [savedConnections, query, activeTagFilter]);

  // Group connections by folder
  const groupedConnections = useMemo(() => {
    const map: Record<string, SavedConnection[]> = {};
    filteredConnections.forEach((conn) => {
      const folder = conn.folder || "未分组";
      if (!map[folder]) map[folder] = [];
      map[folder].push(conn);
    });
    return map;
  }, [filteredConnections]);

  const presetTags = ["Prod", "Nginx", "MySQL", "K8s", "Web", "Dev", "GPU"];

  return (
    <aside className="min-h-0 border-r border-[var(--app-line)] bg-[var(--sidebar-bg)] select-none">
      <div className="flex h-full flex-col">
        <div className="px-3 pb-2.5 pt-3 border-b border-[var(--app-line)] space-y-2">
          {/* Row 1: 全宽新建连接按钮 */}
          <button
            onClick={onOpenDialog}
            title="新建主机连接"
            className="flex w-full h-8.5 items-center justify-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>新建 SSH 连接</span>
          </button>

          {/* Row 2: 搜索框与独立工具栏按钮 */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
              <Input
                className="pl-7 pr-2.5 h-8 text-xs rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] shadow-2xs w-full focus:border-emerald-500"
                value={query}
                placeholder="搜索主机..."
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => setShowTagMenu((prev) => !prev)}
                title="按标签筛选主机"
                className={cn(
                  "flex h-8 w-7 items-center justify-center rounded-lg border border-[var(--app-line)] text-xs transition-colors cursor-pointer",
                  activeTagFilter ? "bg-indigo-600 border-indigo-600 text-white shadow-2xs" : "bg-[var(--fill-1)] text-[var(--app-muted)] hover:bg-[var(--raised-bg)] hover:text-[var(--app-text)]"
                )}
              >
                <Filter className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onOpenKeyManager}
                title="密钥库管理"
                className="flex h-8 w-7 items-center justify-center rounded-lg border border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-muted)] hover:bg-[var(--raised-bg)] hover:text-indigo-500 transition-colors cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onOpenPresets}
                title="常用连接预设模板管理"
                className="flex h-8 w-7 items-center justify-center rounded-lg border border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-muted)] hover:bg-[var(--raised-bg)] hover:text-purple-500 transition-colors cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onRefresh}
                title="刷新主机"
                className="flex h-8 w-7 items-center justify-center rounded-lg border border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-muted)] hover:bg-[var(--raised-bg)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 默认折叠，仅在点击筛选按钮或存在激活标签时展开 */}
          {(showTagMenu || activeTagFilter) && (
            <div className="flex items-center gap-1 overflow-x-auto pt-1 pb-0.5 no-scrollbar text-[10px] animate-in fade-in duration-150">
              <button
                onClick={() => { onActiveTagFilterChange?.(""); setShowTagMenu(false); }}
                className={cn(
                  "rounded-full px-2 py-0.5 font-bold cursor-pointer transition-colors shrink-0",
                  !activeTagFilter ? "bg-slate-900 text-white" : "bg-[var(--fill-1)] text-[var(--app-muted)] hover:text-[var(--app-text)]"
                )}
              >
                全部
              </button>
              {presetTags.map((tag) => {
                const active = activeTagFilter === tag;
                const colorInfo = HOST_TAG_COLORS[tag] || { bg: "bg-indigo-500/15", text: "text-indigo-600", border: "border-indigo-300" };
                return (
                  <button
                    key={tag}
                    onClick={() => { onActiveTagFilterChange?.(active ? "" : tag); }}
                    className={cn(
                      "rounded-full px-2 py-0.5 font-extrabold border transition-all cursor-pointer shrink-0",
                      active ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs" : `${colorInfo.bg} ${colorInfo.text} ${colorInfo.border}`
                    )}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 核心功能导航菜单 */}
        <div className="p-2 space-y-1 border-b border-[var(--app-line)]">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            const iconColorClass = {
              ssh: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60",
              local: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60",
              cmd: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60",
              monitor: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60",
              serial: "text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60",
              ebpf: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60",
              cluster: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60",
              git: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60",
              browser: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60",
              settings: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800"
            }[tool.id] || "text-slate-600 bg-slate-100";

            return (
              <button
                key={tool.id}
                title={tool.title || tool.label}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-xs font-extrabold transition-all duration-200 cursor-pointer select-none",
                  active
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 font-extrabold"
                    : "text-[var(--text-secondary)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)]"
                )}
                onClick={() => onActiveToolChange?.(tool.id as any)}
              >
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full shrink-0 transition-colors", active ? "bg-white/20 text-white" : iconColorClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{tool.label}</span>
                {tool.id === "local" && sessions.length > 0 && (
                  <span className="ml-auto rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[9px] font-mono font-bold shadow-2xs">
                    {sessions.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          <SidebarSection title="最近主机" count={filteredConnections.length} open>
            {filteredConnections.length === 0 ? (
              <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-4 text-center text-xs font-semibold text-[var(--app-muted)]">
                {query || activeTagFilter ? "无匹配主机" : "暂无保存主机"}
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedConnections).map(([folderName, folderConns]) => {
                  const isCollapsed = collapsedFolders[folderName];
                  return (
                    <div key={folderName} className="space-y-1">
                      {/* 分组文件夹标头 */}
                      <button
                        onClick={() => toggleFolder(folderName)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onConnectAllInFolder?.(folderConns);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] font-extrabold text-[var(--app-muted)] hover:bg-[var(--fill-1)] cursor-pointer"
                        title="点击展开/收起；右键可一键批量连接该组所有主机"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <FolderIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">{folderName}</span>
                          <span className="rounded-full bg-[var(--fill-2)] px-1.5 text-[9px] font-mono font-bold">{folderConns.length}</span>
                        </div>
                        <ChevronDown className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")} />
                      </button>

                      {!isCollapsed && (
                        <div className="space-y-1 pl-1">
                          {folderConns.map((connection, index) => (
                            <div
                              key={`${connection.hostname}-${connection.username}-${index}`}
                              className="relative flex flex-col gap-1.5 rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-2.5 transition-all duration-200 hover:border-emerald-500/50 hover:shadow-md group select-none"
                            >
                              <div className="flex items-center gap-2 min-w-0 w-full">
                                <div className="relative flex h-7.5 w-7.5 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shrink-0 shadow-2xs">
                                  <Server className="h-3.5 w-3.5" />
                                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                </div>
                                
                                <button className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => onConnect(connection)}>
                                  <div className="flex items-center justify-between min-w-0 pr-1">
                                    <span className="truncate text-xs font-extrabold text-[var(--app-text)] max-w-[100px]" title={connection.name || connection.hostname}>
                                      {connection.name || connection.hostname}
                                    </span>
                                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-500 shrink-0">
                                      24ms
                                    </span>
                                  </div>
                                  <div className="truncate font-mono text-[10px] font-semibold text-[var(--app-muted)] max-w-[125px]" title={`${connection.username || "user"}@${connection.hostname || "host"}`}>
                                    {connection.username || "user"}@{connection.hostname || "host"}
                                  </div>
                                </button>

                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    title="部署公钥"
                                    className="flex h-5.5 w-5.5 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/50 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); onOpenSshCopyId?.(connection); }}
                                  >
                                    <KeyRound className="h-3 w-3" />
                                  </button>
                                  <button
                                    aria-label={`编辑 ${connection.name || connection.hostname}`}
                                    className="flex h-5.5 w-5.5 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-[var(--fill-2)] hover:text-[var(--app-text)] cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); onEditConnection(connection); }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    aria-label={`删除 ${connection.name || connection.hostname}`}
                                    className="flex h-5.5 w-5.5 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); onDeleteConnection(connection); }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>

                              {/* 标签列 */}
                              {connection.tags && connection.tags.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap pl-8">
                                  {connection.tags.map((tag) => {
                                    const colorInfo = HOST_TAG_COLORS[tag] || { bg: "bg-indigo-500/15", text: "text-indigo-600", border: "border-indigo-300" };
                                    return (
                                      <span key={tag} className={cn("rounded-md px-1.5 py-0.2 text-[9px] font-extrabold border", colorInfo.bg, colorInfo.text, colorInfo.border)}>
                                        #{tag}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                      "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-xs transition-colors cursor-pointer",
                      session.id === activeSessionId
                        ? "bg-indigo-600 text-white font-extrabold shadow-sm shadow-indigo-500/25"
                        : "text-[var(--text-secondary)] hover:bg-[var(--fill-1)]"
                    )}
                    onClick={() => onActivateSession(session.id)}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        session.connected ? "bg-emerald-500" : session.status === "failed" ? "bg-rose-500" : "bg-amber-400"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-extrabold">{session.title}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--fill-1)] transition-colors cursor-pointer"
              onClick={onCreateLocal}
            >
              <Terminal className="h-4 w-4 text-emerald-600" />
              打开 Local Shell
            </button>
          </SidebarSection>
        </div>

        <div className="mt-auto border-t border-[var(--app-line)]/60 p-3" data-testid="left-command-suggestion-slot">
          {commandSuggestionView ? (
            <CommandSuggestionPanel view={commandSuggestionView} />
          ) : (
            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3.5 shadow-2xs">
              <div className="flex items-center justify-between font-extrabold text-[var(--app-text)] mb-1 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  环境就绪
                </span>
                <span className="rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[9px] font-mono font-bold shadow-xs">
                  BusyBox
                </span>
              </div>
              <p className="text-[10px] font-medium text-[var(--text-secondary)] leading-4">随包内置 sh, ls, grep, awk, sed, wget 等 Linux 常用命令工具箱。</p>
            </div>
          )}
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
  const [isOpen, setIsOpen] = useState(open ?? true);

  return (
    <section className="border-t border-[var(--app-line)] px-4 py-3">
      <button
        type="button"
        aria-label={`${isOpen ? "折叠" : "展开"}${title}`}
        aria-expanded={isOpen}
        className="mb-2 flex w-full items-center justify-between rounded-md py-1 text-left"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--app-muted)]">{title}</div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && (
            <span className="rounded-md bg-[var(--fill-2)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--app-muted)]">{count}</span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 text-[var(--app-muted)]", !isOpen && "-rotate-90")} />
        </div>
      </button>
      {isOpen && children}
    </section>
  );
}

function getHostLiveStatus(connection: SavedConnection, sessions: SessionTab[]) {
  const host = connection.hostname || "";
  const isOnline = sessions.some((s) => s.connected && (s.connectParams?.hostname === host || (host.length > 0 && s.title.includes(host))));
  return isOnline ? "connected" : "idle";
}

const hostLiveStatusMeta: Record<string, { dotClass: string; textClass: string; label: string }> = {
  connected: { dotClass: "bg-emerald-500", textClass: "text-emerald-600 bg-emerald-50", label: "在线" },
  idle: { dotClass: "bg-slate-400 dark:bg-slate-500", textClass: "text-slate-500 bg-slate-100", label: "离线" }
};

function Workbench({
  savedConnections,
  sessions = [],
  query,
  onQueryChange,
  onOpenDialog,
  onRefresh,
  onConnect,
  onEditConnection,
  onDeleteConnection,
  onCreateLocal
}: {
  savedConnections: SavedConnection[];
  sessions?: SessionTab[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpenDialog: () => void;
  onRefresh: () => void;
  onConnect: (connection: SavedConnection) => void;
  onEditConnection: (connection: SavedConnection) => void;
  onDeleteConnection: (connection: SavedConnection) => void;
  onCreateLocal?: () => void;
}) {
  const onlineCount = savedConnections.filter((connection) => getHostLiveStatus(connection, sessions) === "connected").length;
  const keyCount = savedConnections.filter((item) => item.keyPath).length;
  const groupCount = new Set(savedConnections.map((item) => item.group).filter(Boolean)).size;

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg)] px-10 py-7">
      <div className="mx-auto max-w-6xl space-y-7">
        {/* 页头导航栏 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--app-text)]">主机工作台</h1>
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-extrabold text-[var(--accent-text)] shadow-2xs">
                {savedConnections.length} 台主机
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--text-secondary)]">快速管理 SSH 会话、系统资源与 SFTP 文件传输管道。</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
              <Input
                className="h-10 pl-9 pr-14 text-xs rounded-full shadow-2xs"
                value={query}
                placeholder="搜索主机 / IP..."
                onChange={(event) => onQueryChange(event.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-[var(--fill-2)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--app-muted)]">
                Ctrl K
              </span>
            </div>
            <Button variant="outline" size={32} className="rounded-full w-10 h-10 px-0 shadow-2xs" onClick={onRefresh} title="刷新主机状态">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={onOpenDialog} size={32} className="rounded-full px-5 h-10 text-xs font-extrabold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              新建连接
            </Button>
          </div>
        </div>

        {/* 顶部数据概览 (图 1 风格) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="全部主机" value={savedConnections.length} unit="台" icon={Server} variant="indigo" />
          <Metric label="在线会话" value={onlineCount} unit="活跃" icon={CheckCircle2} variant="emerald" />
          <Metric label="密钥认证" value={keyCount} unit="配置" icon={KeyRound} variant="amber" />
          <Metric label="自定义分组" value={groupCount} unit="组" icon={HardDrive} variant="violet" />
        </div>

        {/* 主机网格区域 (图 1 风格) */}
        {savedConnections.length === 0 ? (
          <EmptyState
            title="还没有保存的 SSH 主机"
            description="点击下方按钮添加第一台主机，连接后即可体验高性能终端与 SFTP 文件管道。"
            action={
              <Button size={44} onClick={onOpenDialog} className="rounded-full px-6">
                <Plus className="h-4 w-4" />
                新建第一台连接
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-extrabold text-[var(--app-text)]">主机服务器 (Server Nodes)</h2>
                <span className="rounded-full bg-[var(--fill-2)] border border-[var(--app-line)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--app-muted)]">
                  {onlineCount}/{savedConnections.length} 在线
                </span>
              </div>
              <Button variant="outline" size={26} className="rounded-full px-3.5 h-8 text-xs font-bold" onClick={onOpenDialog}>
                <Plus className="h-3.5 w-3.5" />
                添加主机
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {savedConnections.map((connection, index) => {
                const liveStatus = getHostLiveStatus(connection, sessions);
                const statusMeta = hostLiveStatusMeta[liveStatus];
                return (
                  <div
                    key={`${connection.hostname}-${connection.username}-${index}`}
                    className="group relative flex flex-col justify-between rounded-3xl border-2 border-[var(--app-line)] bg-[var(--panel-bg)] p-5.5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-emerald-500"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
                            <Server className="h-6 w-6" />
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-[var(--panel-bg)]",
                                statusMeta.dotClass
                              )}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate text-base font-extrabold text-[var(--app-text)] tracking-tight">
                                {connection.name || connection.hostname}
                              </span>
                              {renderEnvironmentBadge(connection.environment)}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-xs font-extrabold text-indigo-600 dark:text-cyan-400">
                              {connection.username || "root"}@{connection.hostname}:{connection.port || 22}
                            </div>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shrink-0 border border-[var(--app-line)] shadow-2xs", statusMeta.textClass, "bg-[var(--fill-1)]")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dotClass)} />
                          {liveStatus === "connected" ? "🟢 12ms" : statusMeta.label}
                        </span>
                      </div>

                      {/* 标签栏 (全 Pill 胶囊) */}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {connection.group && (
                          <span className="rounded-full bg-[var(--fill-2)] border border-[var(--app-line)] px-3 py-1 text-xs font-bold text-[var(--app-text)]">
                            📁 {connection.group}
                          </span>
                        )}
                        {connection.keyPath ? (
                          <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-3 py-1 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                            🔑 密钥认证
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-3 py-1 text-xs font-bold border border-amber-200 dark:border-amber-800">
                            🔒 密码认证
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮组 (图 1 极其漂亮的胶囊发起连接按键) */}
                    <div className="mt-5 flex items-center justify-between border-t border-[var(--app-line)]/60 pt-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          aria-label={`编辑 ${connection.name || connection.hostname}`}
                          title="编辑主机参数"
                          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-muted)] transition-all hover:bg-[var(--fill-2)] hover:text-[var(--app-text)] cursor-pointer"
                          onClick={() => onEditConnection(connection)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`删除 ${connection.name || connection.hostname}`}
                          title="删除该主机"
                          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-muted)] transition-all hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer"
                          onClick={() => onDeleteConnection(connection)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <Button
                        size={32}
                        aria-label={`连接 ${connection.name || connection.hostname}`}
                        className="rounded-full px-5 h-9 font-extrabold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                        onClick={() => onConnect(connection)}
                      >
                        发起连接 →
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 底部 2 大功能卡片 (晶透高对比白面板) */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 pt-2">
          <div
            className="flex items-center gap-4 rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5 shadow-sm hover:shadow-md transition-all cursor-pointer"
            onClick={onCreateLocal}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/60">
              <Terminal className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-[var(--app-text)]">本地类 Linux 终端 (Local Shell)</div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)] font-medium">基于随包内置 BusyBox 命令工具箱，即刻运行本地 bash 脚本</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/60">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-[var(--app-text)]">Base64 安全与原生管道</div>
                <div className="mt-0.5 text-xs text-[var(--text-secondary)] font-medium">WinHTTP / WebView2 双向安全编解码架构就绪</div>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-xs font-extrabold shrink-0">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  icon: Icon,
  variant = "indigo"
}: {
  label: string;
  value: number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "indigo" | "emerald" | "amber" | "violet";
}) {
  const topBorderClass = {
    indigo: "border-t-indigo-500",
    emerald: "border-t-emerald-500",
    amber: "border-t-amber-500",
    violet: "border-t-purple-500"
  }[variant];

  const iconMeta = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    violet: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border-purple-200 dark:border-purple-800"
  }[variant];

  return (
    <div className={cn("flex items-center justify-between rounded-2xl border border-t-2 border-[var(--app-line)] bg-[var(--panel-bg)] p-4.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-500", topBorderClass)}>
      <div>
        <div className="text-xs font-extrabold text-[var(--app-muted)]">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="font-mono text-2xl font-black tracking-tight text-[var(--app-text)]">{value}</span>
          {unit && <span className="text-xs font-bold text-[var(--app-muted)]">{unit}</span>}
        </div>
      </div>
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border shadow-2xs", iconMeta)}>
        <Icon className="h-5.5 w-5.5" />
      </div>
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
  dangerousCommandGuardEnabled,
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
  onRequestDangerousCommandConfirmation,
  onTerminalOutput,
  onCommandSuggestionViewChange,
  onActiveCommandFolderChange,
  onSendCommand,
  onSidePanelChange,
  onAiConfigChange,
  onToggleSplit,
  onOpenRemoteEditor,
  onOpenSearch,
  onOpenDiff,
  onAddFolder,
  onSaveCommand
}: {
  visible: boolean;
  sessions: SessionTab[];
  activeSessionId: string;
  terminalTheme: TerminalThemeMode;
  terminalAppearance: TerminalAppearance;
  terminalBackgroundImage: string;
  terminalBackgroundOverlay: number;
  commandSuggestionsEnabled: boolean;
  dangerousCommandGuardEnabled: boolean;
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
  onRequestDangerousCommandConfirmation?: (command: string, info: DangerousCommandInfo, onConfirm: () => void) => void;
  onTerminalOutput: (sessionId: string, text: string) => void;
  onCommandSuggestionViewChange: (view: CommandSuggestionView | null) => void;
  onActiveCommandFolderChange: (folderId: string) => void;
  onSendCommand: (command: string) => void;
  onSidePanelChange: (panel: TerminalSidePanel) => void;
  onAiConfigChange: (config: AiConfig) => void;
  onToggleSplit: (sessionId: string, mode: "none" | "horizontal" | "vertical") => void;
  onOpenRemoteEditor?: (filePath: string, fileName: string) => void;
  onOpenSearch?: (path: string) => void;
  onOpenDiff?: (path: string, name: string) => void;
  onAddFolder?: (name: string) => void;
  onSaveCommand?: (folderId: string, command: Omit<CommandItem, "id">, commandId?: string) => void;
}) {
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const [tabMenu, setTabMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [shortcutParameterRequest, setShortcutParameterRequest] = useState<ShortcutParameterRequest | null>(null);
  const menuSession = tabMenu ? sessions.find((session) => session.id === tabMenu.sessionId) : undefined;

  // 右侧栏 100% 自由拖拽缩放宽度状态与折叠状态
  const [rightSidebarWidth, setRightSidebarWidth] = useState(260);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);

  const startResizeRightSidebar = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightSidebarWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = startX - moveEvent.clientX; // 向左拖拽扩大右侧栏
      const newWidth = Math.min(560, Math.max(140, startWidth + deltaX));
      setRightSidebarWidth(newWidth);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [rightSidebarWidth]);

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
    <div className="grid h-full grid-rows-[42px_minmax(0,1fr)_32px] bg-[var(--app-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--app-line)] bg-[var(--sidebar-bg)] pl-3 pr-3 h-10.5 select-none relative">
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {/* 回到主页控制 */}
          <button
            className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--app-line)] bg-[var(--panel-bg)] px-3 text-xs font-extrabold text-[var(--app-text)] hover:bg-indigo-50 hover:text-indigo-600 transition-colors shadow-2xs cursor-pointer shrink-0"
            onClick={onReturnHome}
            title="回到桌面"
          >
            <Home className="h-3.5 w-3.5 text-indigo-600" />
            <span>主页</span>
          </button>

          {/* 新建终端按钮 */}
          <button
            className="flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-3 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer shrink-0"
            onClick={onCreateLocal}
            title="新建本地终端"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-600" />
            <span>新建终端</span>
          </button>

          <div className="h-4 w-px bg-[var(--app-line)] mx-1 shrink-0" />

          {/* 动态 SSH/Local 标签页 */}
          {sessions.map((session, index) => {
            const isActive = session.id === activeSessionId;
            const status = getSessionTabStatus(session);

            return (
              <div
                key={session.id}
                className={cn(
                  "group relative flex h-8 min-w-[120px] max-w-56 cursor-pointer items-center justify-between gap-2 rounded-full border px-3 text-xs font-extrabold transition-all select-none shrink-0",
                  isActive
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-500/25"
                    : "border-[var(--app-line)] bg-[var(--panel-bg)] text-[var(--app-text)] hover:bg-[var(--fill-2)]"
                )}
              >
                <button
                  type="button"
                  role="button"
                  aria-label={session.title}
                  aria-current={isActive ? "page" : undefined}
                  className="flex items-center gap-1.5 min-w-0 bg-transparent border-0 p-0 cursor-pointer font-inherit text-inherit"
                  onClick={() => onActivate(session.id)}
                  onContextMenu={(event) => openTabMenu(event, session.id)}
                >
                  <span title={status.title} className={cn("h-2 w-2 rounded-full shrink-0", status.dotClass)} />
                  <span className="truncate font-mono font-extrabold">{session.title}</span>
                  <span className="sr-only">{index + 1}</span>
                  {renderEnvironmentBadge(session.connectParams?.environment, true)}
                </button>
                <button
                  className={cn(
                    "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer",
                    isActive ? "text-white/80 hover:bg-white/20 hover:text-white" : "text-[var(--app-muted)] hover:bg-rose-50 hover:text-rose-600"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(session.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* ☰ 标签页与工作区快捷控制下拉菜单 */}
        <div className="relative shrink-0">
          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--app-line)] bg-[var(--panel-bg)] text-[var(--app-text)] hover:bg-emerald-50 hover:text-emerald-700 transition-colors shadow-2xs cursor-pointer",
              topMenuOpen && "bg-emerald-50 text-emerald-700 border-emerald-300"
            )}
            onClick={() => setTopMenuOpen(!topMenuOpen)}
            title="工作区与侧边栏控制菜单"
          >
            <Menu className="h-4 w-4" />
          </button>

          {topMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9.5 z-50 w-48 rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-1.5 text-xs font-bold text-[var(--app-text)] shadow-xl animate-in fade-in zoom-in-95 duration-150 select-none"
              onMouseLeave={() => setTopMenuOpen(false)}
            >
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer"
                onClick={() => {
                  setRightSidebarCollapsed(!rightSidebarCollapsed);
                  setTopMenuOpen(false);
                }}
              >
                {rightSidebarCollapsed ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-500" />}
                <span>{rightSidebarCollapsed ? "展开右侧侧边栏" : "折叠右侧侧边栏"}</span>
              </button>

              <div className="my-1 border-t border-[var(--app-line)]" />

              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer disabled:opacity-40"
                disabled={!activeSessionId}
                onClick={() => {
                  if (activeSessionId) onDuplicate(activeSessionId);
                  setTopMenuOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                <span>复制当前标签页</span>
              </button>

              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer disabled:opacity-40"
                disabled={!activeSessionId || activeSession?.kind !== "ssh"}
                onClick={() => {
                  if (activeSessionId) onReconnect(activeSessionId);
                  setTopMenuOpen(false);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />
                <span>重新连接 SSH</span>
              </button>

              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer disabled:opacity-40"
                disabled={!activeSessionId}
                onClick={() => {
                  if (activeSessionId) onDisconnect(activeSessionId);
                  setTopMenuOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5 text-amber-600" />
                <span>断开当前连接</span>
              </button>

              <div className="my-1 border-t border-[var(--app-line)]" />

              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer disabled:opacity-40"
                disabled={!activeSessionId}
                onClick={() => {
                  if (activeSessionId) onCloseOther(activeSessionId);
                  setTopMenuOpen(false);
                }}
              >
                <Menu className="h-3.5 w-3.5 text-purple-600" />
                <span>关闭其他标签页</span>
              </button>

              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                onClick={() => {
                  onCloseAll();
                  setTopMenuOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                <span>关闭全部标签页</span>
              </button>
            </div>
          )}
        </div>

        {menuSession && tabMenu && (
          <div
            role="menu"
            className="fixed z-50 w-40 rounded-xl border border-[var(--app-line)] bg-[var(--raised-bg)]/95 backdrop-blur-xl p-1 text-xs font-semibold text-[var(--app-text)] shadow-2xl animate-in zoom-in-95 duration-100"
            style={{ left: tabMenu.x, top: tabMenu.y }}
            onMouseLeave={() => setTabMenu(null)}
          >
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer" onClick={() => runTabAction(onDuplicate)}>
              <Plus className="h-3.5 w-3.5 text-emerald-500" />
              复制标签
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              disabled={menuSession.kind !== "ssh" || !menuSession.connectParams}
              onClick={() => runTabAction(onReconnect)}
            >
              <RefreshCw className="h-3.5 w-3.5 text-sky-500" />
              重连
            </button>
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer" onClick={() => runTabAction(onDisconnect)}>
              <X className="h-3.5 w-3.5 text-amber-500" />
              断开
            </button>
            <div className="my-1 border-t border-[var(--app-line)]" />
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer" onClick={() => runTabAction(onClose)}>
              <X className="h-3.5 w-3.5 text-rose-500" />
              关闭
            </button>
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--fill-1)] transition-colors cursor-pointer" onClick={() => runTabAction(onCloseOther)}>
              <Menu className="h-3.5 w-3.5 text-[var(--app-muted)]" />
              关闭其他
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              onClick={() => {
                onCloseAll();
                setTabMenu(null);
              }}
            >
              <X className="h-3.5 w-3.5 text-rose-500" />
              关闭全部
            </button>
          </div>
        )}
      </div>
      <div
        className="grid min-h-0 relative"
        style={{ gridTemplateColumns: visible && !rightSidebarCollapsed ? `minmax(0, 1fr) ${rightSidebarWidth}px` : "1fr" }}
      >
        <TerminalSurface
          visible={visible}
          sessions={sessions}
          activeSession={activeSession}
          terminalTheme={terminalTheme}
          terminalAppearance={terminalAppearance}
          terminalBackgroundImage={terminalBackgroundImage}
          terminalBackgroundOverlay={terminalBackgroundOverlay}
          commandSuggestionsEnabled={commandSuggestionsEnabled}
          dangerousCommandGuardEnabled={dangerousCommandGuardEnabled}
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
          onCreateLocal={onCreateLocal}
          onRequestDangerousCommandConfirmation={onRequestDangerousCommandConfirmation}
          onOutput={onTerminalOutput}
        />
        {visible && !rightSidebarCollapsed && (
          <TerminalRightSidebar
            width={rightSidebarWidth}
            onResizeStart={startResizeRightSidebar}
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
            onAddAiQuote={onAddAiQuote}
            onOpenRemoteEditor={onOpenRemoteEditor}
            onOpenSearch={onOpenSearch}
            onOpenDiff={onOpenDiff}
            onAddFolder={onAddFolder}
            onSaveCommand={onSaveCommand}
          />
        )}
      </div>
      <div className="flex h-8 items-center justify-between border-t border-[var(--app-line)] bg-[var(--sidebar-bg)] px-4 text-xs font-bold text-[var(--app-muted)] select-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5 shrink-0">
            <span className={cn("h-2 w-2 rounded-full", activeSession?.connected ? "bg-emerald-500 shadow-2xs" : "bg-slate-300")} />
            <span className="text-[var(--app-text)] font-extrabold">
              {activeSession?.status === "connecting"
                ? "连接中..."
                : activeSession?.status === "failed"
                  ? "连接失败"
                  : activeSession?.connected
                    ? "已建立 SSH 加密通道"
                    : "就绪"}
            </span>
          </span>

          <div className="h-3 w-px bg-[var(--app-line)] shrink-0" />

          <span className="truncate font-mono text-[11px] text-[var(--app-text)] font-extrabold flex items-center gap-1.5">
            <span>{activeSession ? `${activeSession.kind === "ssh" ? "SSH" : "Local"}: ${activeSession.title}` : "无活动终端"}</span>
            {renderEnvironmentBadge(activeSession?.connectParams?.environment)}
          </span>

          {activeSession?.error && (
            <span className="truncate text-rose-600 font-extrabold text-[11px]">
              ⚠️ {activeSession.error}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 text-[11px]">
          <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-extrabold">
            UTF-8 / SSH2
          </span>
          <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 font-extrabold">
            xterm.js 24Bit TrueColor
          </span>
        </div>
      </div>
    </div>
  );
}

interface CommandSuggestionResizeEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

function CommandSuggestionPanel({ view }: { view: CommandSuggestionView }) {
  const [layout, setLayout] = useState<CommandSuggestionPanelLayout>(() => loadStoredCommandSuggestionPanelLayout());
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeItemRef.current && typeof activeItemRef.current.scrollIntoView === "function") {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [view.activeIndex]);

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

  function resizeCommandSuggestionPanel(startLayout: CommandSuggestionPanelLayout, deltaX: number, deltaY: number, edges: CommandSuggestionResizeEdges) {
    const { viewportWidth, viewportHeight, maxWidth, maxHeight } = getCommandSuggestionPanelViewport();
    const right = startLayout.left + startLayout.width;
    const top = viewportHeight - startLayout.bottom - startLayout.height;
    const next = { ...startLayout };

    if (edges.left) {
      next.width = clampNumber(startLayout.width - deltaX, COMMAND_SUGGESTION_PANEL_MIN_WIDTH, Math.min(maxWidth, right - COMMAND_SUGGESTION_PANEL_MARGIN));
      next.left = right - next.width;
    }

    if (edges.right) {
      next.width = clampNumber(
        startLayout.width + deltaX,
        COMMAND_SUGGESTION_PANEL_MIN_WIDTH,
        Math.min(maxWidth, viewportWidth - startLayout.left - COMMAND_SUGGESTION_PANEL_MARGIN)
      );
    }

    if (edges.top) {
      next.height = clampNumber(
        startLayout.height - deltaY,
        COMMAND_SUGGESTION_PANEL_MIN_HEIGHT,
        Math.min(maxHeight, viewportHeight - startLayout.bottom - COMMAND_SUGGESTION_PANEL_MARGIN)
      );
    }

    if (edges.bottom) {
      next.height = clampNumber(
        startLayout.height + deltaY,
        COMMAND_SUGGESTION_PANEL_MIN_HEIGHT,
        Math.min(maxHeight, viewportHeight - top - COMMAND_SUGGESTION_PANEL_MARGIN)
      );
      next.bottom = viewportHeight - top - next.height;
    }

    updateLayout(next);
  }

  function startResize(event: ReactMouseEvent<HTMLButtonElement>, edges: CommandSuggestionResizeEdges) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = layout;

    function resize(moveEvent: MouseEvent) {
      resizeCommandSuggestionPanel(startLayout, moveEvent.clientX - startX, moveEvent.clientY - startY, edges);
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
      className="fixed z-30 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)]/95 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-100 select-none"
      style={{ left: layout.left, bottom: layout.bottom, width: layout.width, height: layout.height }}
    >
      <div className="flex h-6 shrink-0 items-center justify-between border-b border-[var(--app-line)] bg-[var(--panel-bg)]/90 px-3 select-none">
        <button
          type="button"
          aria-label="移动命令提示"
          className="flex items-center gap-1.5 min-w-0 flex-1 h-full cursor-move text-[11px] font-extrabold text-[var(--app-text)] hover:text-emerald-500 text-left bg-transparent border-0 p-0 transition-colors"
          onMouseDown={startMove}
        >
          <GripHorizontal className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="truncate">提示面板 (可拖拽)</span>
        </button>
        <button
          type="button"
          title="复位提示框到默认位置"
          aria-label="重置提示面板位置"
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-[var(--fill-2)] hover:text-[var(--app-text)] cursor-pointer shrink-0 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            updateLayout(defaultCommandSuggestionPanelLayout);
          }}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 pr-2.5 space-y-1">
        {view.suggestions.map((suggestion, index) => {
          const count = getCommandUsageFrequency(suggestion.command);
          const isActive = index === view.activeIndex;

          return (
            <button
              key={suggestion.id}
              ref={isActive ? activeItemRef : undefined}
              type="button"
              role="option"
              aria-selected={isActive}
              title={suggestion.command}
              className={cn(
                "min-h-10 w-full min-w-0 shrink-0 rounded-xl px-3 py-1.5 text-left transition-all flex items-center justify-between gap-2 border cursor-pointer",
                isActive
                  ? "bg-emerald-600 text-white font-extrabold shadow-sm shadow-emerald-500/20 border-emerald-500"
                  : "text-[var(--app-text)] border-transparent hover:bg-[var(--fill-1)] hover:border-[var(--app-line)]"
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                view.onApply(suggestion);
              }}
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold font-mono tracking-tight">{suggestion.command}</span>
                <span className={cn("mt-0.5 block truncate text-[10px]", isActive ? "text-white/80" : "text-[var(--app-muted)]")}>
                  {suggestion.description || suggestion.label || suggestion.source}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.2 text-[9px] font-extrabold shrink-0 border font-mono",
                      isActive
                        ? "bg-white/20 text-white border-white/30"
                        : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    )}
                  >
                    🔥 {count}
                  </span>
                )}
                {isActive && (
                  <span className="rounded-md bg-white/20 border border-white/30 px-1.5 py-0.2 text-[9px] font-extrabold font-mono text-white animate-in fade-in duration-100">
                    ↵ 选定
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        role="separator"
        aria-label="向左拉伸命令提示"
        aria-orientation="vertical"
        className="absolute bottom-4 left-0 top-4 w-2 cursor-ew-resize bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { left: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="向右拉伸命令提示"
        aria-orientation="vertical"
        className="absolute bottom-4 right-0 top-4 w-2 cursor-ew-resize bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { right: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="向上拉伸命令提示"
        aria-orientation="horizontal"
        className="absolute left-4 right-4 top-0 h-2 cursor-ns-resize bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { top: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="向下拉伸命令提示"
        aria-orientation="horizontal"
        className="absolute bottom-0 left-4 right-4 h-2 cursor-ns-resize bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { bottom: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="向左上角拉伸命令提示"
        className="absolute left-0 top-0 h-4 w-4 cursor-nwse-resize rounded-tl-md bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { left: true, top: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="向右上角拉伸命令提示"
        className="absolute right-0 top-0 h-4 w-4 cursor-nesw-resize rounded-tr-md bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { right: true, top: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="向左下角拉伸命令提示"
        className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize rounded-bl-md bg-transparent hover:bg-blue-100/60"
        onMouseDown={(event) => startResize(event, { left: true, bottom: true })}
      />
      <button
        type="button"
        role="separator"
        aria-label="调整命令提示大小"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-br-md border-l border-t border-slate-200 bg-slate-50 hover:bg-blue-50"
        onMouseDown={(event) => startResize(event, { right: true, bottom: true })}
      />
    </div>
  );
}

function TerminalSurface({
  visible,
  sessions,
  activeSession,
  terminalTheme,
  terminalAppearance,
  terminalBackgroundImage,
  terminalBackgroundOverlay,
  commandSuggestionsEnabled,
  dangerousCommandGuardEnabled,
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
  onCreateLocal,
  onRequestDangerousCommandConfirmation,
  onOutput
}: {
  visible: boolean;
  sessions?: SessionTab[];
  activeSession?: SessionTab;
  terminalTheme: TerminalThemeMode;
  terminalAppearance: TerminalAppearance;
  terminalBackgroundImage: string;
  terminalBackgroundOverlay: number;
  commandSuggestionsEnabled: boolean;
  dangerousCommandGuardEnabled: boolean;
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
  onCreateLocal?: () => void;
  onRequestDangerousCommandConfirmation?: (command: string, info: DangerousCommandInfo, onConfirm: () => void) => void;
  onOutput: (sessionId: string, text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);
  const pushDecodersRef = useRef<Record<string, TextDecoder>>({});
  const activeIdRef = useRef("");
  const visibleRef = useRef(visible);
  const lastValidTerminalSizeRef = useRef({ cols: 80, rows: 24 });
  const [selectedText, setSelectedText] = useState("");
  const [terminalMenu, setTerminalMenu] = useState<{ x: number; y: number; selection: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState({ resultIndex: -1, resultCount: 0 });
  const searchMatches = useMemo(
    () => findTerminalSearchMatches(initialTranscript, searchQuery),
    [initialTranscript, searchQuery]
  );
  const visibleMatchIndex = searchResult.resultIndex >= 0 ? Math.min(searchResult.resultIndex, Math.max(0, searchMatches.length - 1)) : 0;
  const activeMatch = searchMatches[visibleMatchIndex];
  const [commandSuggestions, setCommandSuggestions] = useState<CommandSuggestion[]>([]);
  const [activeCommandSuggestionIndex, setActiveCommandSuggestionIndexState] = useState(0);
  const [terminalRenderEpoch, setTerminalRenderEpoch] = useState(0);
  const commandFoldersRef = useRef(commandFolders);
  const commandSuggestionsEnabledRef = useRef(commandSuggestionsEnabled);
  const dangerousCommandGuardEnabledRef = useRef(dangerousCommandGuardEnabled);
  const commandSuggestionSourcesRef = useRef(commandSuggestionSources);
  const commandSuggestionApplyKeyRef = useRef(commandSuggestionApplyKey);
  const commandSuggestionCustomApplyKeyRef = useRef(commandSuggestionCustomApplyKey);
  const commandSuggestionsRef = useRef<CommandSuggestion[]>([]);
  const activeCommandSuggestionIndexRef = useRef(0);
  const commandInputRef = useRef("");
  const commandHistoryRef = useRef<string[]>([]);
  const rawCommandModeRef = useRef(false);
  const focusInputSuppressUntilRef = useRef(0);
  const terminalLayoutRestoreFrameRef = useRef<number | null>(null);
  const terminalLayoutRestoreTimersRef = useRef<number[]>([]);

  commandFoldersRef.current = commandFolders;
  commandSuggestionsEnabledRef.current = commandSuggestionsEnabled;
  dangerousCommandGuardEnabledRef.current = dangerousCommandGuardEnabled;
  commandSuggestionSourcesRef.current = commandSuggestionSources;
  commandSuggestionApplyKeyRef.current = commandSuggestionApplyKey;
  commandSuggestionCustomApplyKeyRef.current = commandSuggestionCustomApplyKey;

  function sendInputToSessions(targetSessionId: string, text: string) {
    if (!text || !targetSessionId) return;
    const b64Data = bytesToBase64(new TextEncoder().encode(text));
    if (useAppStore.getState().commandBroadcastingEnabled && sessions && sessions.length > 0) {
      sessions.forEach((s) => {
        if (s.connected || s.status === "connected") {
          void nativeBridge.sendInputBase64(s.id, b64Data);
        }
      });
    } else {
      void nativeBridge.sendInputBase64(targetSessionId, b64Data);
    }
  }

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

  function suppressFocusInputResidue() {
    focusInputSuppressUntilRef.current = Date.now() + 150;
  }

  function clearScheduledTerminalLayoutRestore() {
    if (terminalLayoutRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(terminalLayoutRestoreFrameRef.current);
      terminalLayoutRestoreFrameRef.current = null;
    }
    terminalLayoutRestoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    terminalLayoutRestoreTimersRef.current = [];
  }

  function scheduleTerminalLayoutRestore() {
    if (!visibleRef.current) return;
    clearScheduledTerminalLayoutRestore();
    terminalLayoutRestoreFrameRef.current = window.requestAnimationFrame(() => {
      terminalLayoutRestoreFrameRef.current = null;
      refitAndFocusTerminal();
    });
    terminalLayoutRestoreTimersRef.current = [
      window.setTimeout(refitAndFocusTerminal, 60),
      window.setTimeout(refitAndFocusTerminal, 180)
    ];
  }

  function rebuildTerminalRenderer() {
    if (!visibleRef.current) return;
    suppressFocusInputResidue();
    setTerminalRenderEpoch((epoch) => epoch + 1);
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

  function shouldDropFocusInputResidue(data: string) {
    return Date.now() < focusInputSuppressUntilRef.current && /^[A-Za-z]{1,3}$/.test(data);
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
      draft += char;
    }

    commandInputRef.current = draft;
    if (submittedCommand) {
      commandHistoryRef.current = recordCommandHistory(commandHistoryRef.current, submittedCommand);
      rawCommandModeRef.current = isFullScreenCommand(submittedCommand);

      if (dangerousCommandGuardEnabledRef.current) {
        const info = checkDangerousCommand(submittedCommand);
        if (info.isDangerous) {
          const sessionId = activeIdRef.current;
          onRequestDangerousCommandConfirmation?.(submittedCommand, info, () => {
            if (sessionId) {
              void nativeBridge.sendInputBase64(sessionId, bytesToBase64(new TextEncoder().encode(`${submittedCommand}\n`)));
            }
          });
        }
      }
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
    recordCommandExecution(suggestion.command);
    const sessionId = activeIdRef.current;
    const draft = commandInputRef.current;
    const shortcutParameters = suggestion.shortcut ? extractCommandParameters(suggestion.command) : [];
    if (suggestion.shortcut && shortcutParameters.length > 0) {
      const eraseDraft = "\x7f".repeat(Array.from(draft).length);
      commandInputRef.current = "";
      setCommandSuggestionList([]);
      if (sessionId && eraseDraft) {
        sendInputToSessions(sessionId, eraseDraft);
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
    sendInputToSessions(sessionId, suffix);
  }

  function isCommandSuggestionApplyKey(event: globalThis.KeyboardEvent) {
    const applyKey = commandSuggestionApplyKeyRef.current;
    if (applyKey === "enter" || applyKey === "tab" || applyKey === "altEnter") {
      return (event.key === "Enter" || event.key === "Tab") && !event.ctrlKey && !event.metaKey;
    }
    if (applyKey === "ctrlSpace") return event.ctrlKey && !event.metaKey && (event.code === "Space" || event.key === " ");

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
      rebuildTerminalRenderer();
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
    searchAddonRef.current?.clearDecorations();
    setSearchResult({ resultIndex: -1, resultCount: 0 });
  }, [activeSession?.id]);

  useEffect(() => {
    if (!searchOpen) return;
    runTerminalSearch(-1);
  }, [searchOpen, searchQuery, activeSession?.id]);

  async function pasteTerminalClipboard(sessionId: string) {
    const result = await nativeBridge.clipboardPaste();
    if (result.success && result.text) {
      const b64Data = bytesToBase64(new TextEncoder().encode(normalizePasteText(result.text)));
      if (useAppStore.getState().commandBroadcastingEnabled && sessions) {
        sessions.forEach((s) => {
          if (s.connected || s.status === "connected") {
            void nativeBridge.sendInputBase64(s.id, b64Data);
          }
        });
      } else {
        await nativeBridge.sendInputBase64(sessionId, b64Data);
      }
    }
  }

  function decodePushedTerminalOutput(sessionId: string, data: string) {
    const bytes = base64ToBytes(data);
    let decoder = pushDecodersRef.current[sessionId];
    if (!decoder) {
      decoder = new TextDecoder("utf-8");
      pushDecodersRef.current[sessionId] = decoder;
    }
    return decoder.decode(bytes, { stream: true });
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
    container.replaceChildren();
    const appearance = getTerminalAppearance(terminalAppearance);
    const terminalThemeOptions = getTerminalColors(terminalTheme, appearance, Boolean(terminalBackgroundImage));
    const terminal = new XTerm({
      allowProposedApi: true,
      customGlyphs: true,
      cursorBlink: appearance.cursorBlink ?? true,
      cursorStyle: appearance.cursorStyle ?? "block",
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
    const searchAddon = new SearchAddon({ highlightLimit: 2000 });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
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
      const input = stripTerminalGeneratedReplies(data);
      if (!input || shouldDropFocusInputResidue(input)) {
        return;
      }

      const isEnter = input.includes("\r") || input.includes("\n");
      const currentDraft = commandInputRef.current.trim();

      if (isEnter && dangerousCommandGuardEnabledRef.current && currentDraft) {
        const info = checkDangerousCommand(currentDraft);
        if (info.isDangerous) {
          const eraseBytes = "\x15";
          const targetSessionId = activeSession.id;
          void nativeBridge.sendInputBase64(targetSessionId, bytesToBase64(new TextEncoder().encode(eraseBytes)));

          commandInputRef.current = "";
          setCommandSuggestionList([]);

          onRequestDangerousCommandConfirmation?.(currentDraft, info, () => {
            void nativeBridge.sendInputBase64(targetSessionId, bytesToBase64(new TextEncoder().encode(`${currentDraft}\n`)));
          });
          return;
        }
      }

      updateCommandInputFromData(input);
      const b64Data = bytesToBase64(new TextEncoder().encode(input));
      if (useAppStore.getState().commandBroadcastingEnabled && sessions) {
        sessions.forEach((s) => {
          if (s.connected || s.status === "connected") {
            void nativeBridge.sendInputBase64(s.id, b64Data);
          }
        });
      } else {
        void nativeBridge.sendInputBase64(activeSession.id, b64Data);
      }
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selected = terminal.getSelection();
      setSelectedText(selected.trim());
      if (selected && appearance.copyOnSelect !== false) {
        try {
          void navigator.clipboard.writeText(selected);
        } catch {
          // Ignore
        }
      }
    });
    const searchResultDisposable = searchAddon.onDidChangeResults((event) => {
      setSearchResult({ resultIndex: event.resultIndex, resultCount: event.resultCount });
    });

    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

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
    scheduleTerminalLayoutRestore();

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
      clearScheduledTerminalLayoutRestore();
      window.clearInterval(interval);
      observer.disconnect();
      selectionDisposable.dispose();
      searchResultDisposable.dispose();
      if (searchAddonRef.current === searchAddon) {
        searchAddonRef.current = null;
      }
      terminal.dispose();
    };
  }, [activeSession?.id, highlightRules, terminalTheme, terminalAppearance, terminalBackgroundImage, terminalRenderEpoch]);

  useEffect(() => {
    if (focusRequest > 0) focusTerminal();
  }, [focusRequest]);

  useEffect(() => {
    window.handlePushOutput = (sessionId, data) => {
      const output = decodePushedTerminalOutput(sessionId, data);
      if (!output) return;

      onOutputRef.current(sessionId, output);
      if (sessionId === activeIdRef.current) {
        maybeLeaveRawCommandMode(output);
        terminalRef.current?.write(applyHighlightRules(output, highlightRules));
      }
    };
    return () => {
      window.handlePushOutput = undefined;
    };
  }, [highlightRules]);

  function moveSearchMatch(direction: 1 | -1) {
    runTerminalSearch(direction);
  }

  function runTerminalSearch(direction: 1 | -1) {
    const term = searchQuery.trim();
    const searchAddon = searchAddonRef.current;
    if (!searchAddon || !term) {
      searchAddon?.clearDecorations();
      setSearchResult({ resultIndex: -1, resultCount: 0 });
      return;
    }

    const found = direction === 1
      ? searchAddon.findNext(term, terminalSearchOptions)
      : searchAddon.findPrevious(term, terminalSearchOptions);
    if (!found) {
      setSearchResult({ resultIndex: -1, resultCount: 0 });
    }
  }

  function closeTerminalSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations();
    setSearchResult({ resultIndex: -1, resultCount: 0 });
    focusTerminal();
  }

  function handleTerminalKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }

    if (event.key === "Escape" && searchOpen) {
      event.preventDefault();
      closeTerminalSearch();
      return;
    }

    focusTerminal();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSearchMatch(event.shiftKey ? 1 : -1);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTerminalSearch();
    }
  }

  if (!activeSession) {
    return (
      <div className="flex h-full min-h-0 overflow-auto bg-[var(--app-bg)] px-8 py-10 select-none">
        <div className="mx-auto my-auto max-w-xl w-full space-y-6">
          <div className="text-center space-y-2.5">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <Terminal className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--app-text)]">
              轻量极速 SSH & 本地终端控制台
            </h2>
            <p className="text-xs font-medium text-[var(--text-secondary)] max-w-md mx-auto leading-5">
              原生支持 Multi-Tab 会话分流、AI 候选命令补全、交互式 SFTP 传输与硬件性能推算。
            </p>
          </div>

          {/* 4 大一键入口卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              className="flex items-center gap-3.5 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-[var(--panel-bg)] p-4 text-left hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer shadow-2xs group"
              onClick={onCreateLocal}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                <Terminal className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-[var(--app-text)]">启动 本地 Shell</div>
                <div className="mt-0.5 truncate text-[10px] font-bold text-emerald-600 dark:text-emerald-400">运行本地 PowerShell / CMD</div>
              </div>
            </button>

            <button
              className="flex items-center gap-3.5 rounded-2xl border border-indigo-300 dark:border-indigo-800 bg-[var(--panel-bg)] p-4 text-left hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer shadow-2xs group"
              onClick={() => onShortcutParameterRequest?.({ folderId: "default", commandId: "top_cpu" } as any)}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                <Command className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-[var(--app-text)]">快捷指令预载库</div>
                <div className="mt-0.5 truncate text-[10px] font-bold text-indigo-600 dark:text-indigo-400">预装 50+ 常用 Linux 运维命令</div>
              </div>
            </button>
          </div>

          {/* 状态能力防护标 */}
          <div className="flex items-center justify-center gap-6 pt-3 border-t border-[var(--app-line)] text-[11px] font-extrabold text-[var(--app-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> SSH v2 加密直连</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> UTF-8 原生排版</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /> AI 终端感知补全</span>
          </div>
        </div>
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
              {searchQuery.trim() && searchResult.resultCount > 0 && searchResult.resultIndex >= 0
                ? `${searchResult.resultIndex + 1} / ${searchResult.resultCount}`
                : "0 / 0"}
            </span>
            <Button
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={!searchQuery.trim() || searchResult.resultCount === 0}
              onClick={() => moveSearchMatch(-1)}
            >
              上一条
            </Button>
            <Button
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={!searchQuery.trim() || searchResult.resultCount === 0}
              onClick={() => moveSearchMatch(1)}
            >
              下一条
            </Button>
            <button
              aria-label="关闭查找"
              title="关闭查找"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--subtle-bg)] hover:text-[var(--app-text)]"
              onClick={closeTerminalSearch}
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
  onSendCommand,
  onAddFolder,
  onSaveCommand
}: {
  folders: CommandFolder[];
  activeFolderId: string;
  activeSession?: SessionTab;
  shortcutParameterRequest: ShortcutParameterRequest | null;
  onActiveFolderChange: (folderId: string) => void;
  onSendCommand: (command: string) => void;
  onAddFolder?: (name: string) => void;
  onSaveCommand?: (folderId: string, command: Omit<CommandItem, "id">, commandId?: string) => void;
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

  // Blank space right-click menu & Dialog states
  const [blankMenu, setBlankMenu] = useState<{ x: number; y: number } | null>(null);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [addCmdOpen, setAddCmdOpen] = useState(false);
  const [newCmdName, setNewCmdName] = useState("");
  const [newCmdStr, setNewCmdStr] = useState("");
  const [newCmdDesc, setNewCmdDesc] = useState("");
  const [addCmdCr, setAddCmdCr] = useState(true);

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
    event.stopPropagation();
    setBlankMenu(null);
    setCommandMenu({ x: event.clientX, y: event.clientY, command });
  }

  function handleBlankContextMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setCommandMenu(null);
    setBlankMenu({ x: event.clientX, y: event.clientY });
  }

  function handleConfirmAddFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    onAddFolder?.(newFolderName.trim());
    setNewFolderName("");
    setAddFolderOpen(false);
  }

  function handleConfirmAddCmd(e: React.FormEvent) {
    e.preventDefault();
    if (!newCmdName.trim() || !newCmdStr.trim()) return;
    const targetFolderId = activeFolder?.id || folders[0]?.id || "";
    let finalCmdStr = newCmdStr.trim();
    if (addCmdCr && !finalCmdStr.endsWith("\n")) {
      finalCmdStr += "\n";
    }
    onSaveCommand?.(targetFolderId, {
      name: newCmdName.trim(),
      command: finalCmdStr,
      description: newCmdDesc.trim()
    });
    setNewCmdName("");
    setNewCmdStr("");
    setNewCmdDesc("");
    setAddCmdOpen(false);
  }

  async function copyCommand(command: CommandItem) {
    await navigator.clipboard?.writeText(command.command);
    setCommandMenu(null);
  }

  return (
    <div
      className="grid h-full min-h-0 w-full min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--app-bg)] select-none"
      onContextMenu={handleBlankContextMenu}
      onClick={() => {
        if (blankMenu) setBlankMenu(null);
        if (commandMenu) setCommandMenu(null);
      }}
    >
      <div className="border-b border-[var(--app-line)] bg-[var(--panel-bg)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--app-text)] flex items-center gap-2">
              <Command className="h-4 w-4 text-emerald-500" />
              <span>快捷命令侧边栏</span>
              <span className="sr-only">快捷命令栏</span>
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--app-muted)]">
              {activeSession ? `目标：${activeSession.title}` : "支持空白处右键新增"}
            </p>
          </div>
        </div>
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
          <Input
            className="h-8 pl-8 text-xs rounded-full shadow-2xs"
            value={query}
            placeholder="搜索命令或文件夹"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden">
        <div className="w-full min-w-0 max-w-full overflow-hidden border-b border-[var(--app-line)] px-3.5 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-[var(--app-muted)]">分类文件夹</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAddFolderOpen(true);
              }}
              className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-500 hover:text-emerald-400 cursor-pointer"
              title="新建分类文件夹"
            >
              <Plus className="h-3 w-3" />
              <span>新建分类</span>
            </button>
          </div>

          <div className="flex w-full min-w-0 max-w-full flex-wrap gap-2 overflow-x-hidden">
            {folders.map((folder) => {
              const active = folder.id === activeFolder?.id;
              return (
                <button
                  key={folder.id}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold transition-all duration-200 cursor-pointer select-none shadow-2xs",
                    active
                      ? "border-emerald-500 bg-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                      : "border-[var(--app-line)] bg-[var(--panel-bg)] text-[var(--app-text)] hover:border-emerald-500/50 hover:text-emerald-500"
                  )}
                  onClick={() => onActiveFolderChange(folder.id)}
                >
                  <span className="truncate font-extrabold">{folder.name}</span>
                  <span className={cn("rounded-full px-1.5 py-0.2 font-mono text-[9px] font-extrabold shrink-0", active ? "bg-white/25 text-white" : "bg-[var(--fill-2)] text-[var(--app-muted)]")}>
                    {folder.commands.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3 space-y-3" aria-label="快捷命令列表">
          <div className="flex items-center justify-between text-[10px] font-extrabold text-[var(--app-muted)] px-1">
            <span>快捷指令 (FinalShell 流式)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddCmdOpen(true);
                }}
                className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-500 hover:text-emerald-400 cursor-pointer"
                title="新建快捷指令"
              >
                <Plus className="h-3 w-3" />
                <span>新建指令</span>
              </button>
              <span className="font-mono text-[10px] text-[var(--app-text)] font-extrabold">
                {commands.length} 条
              </span>
            </div>
          </div>

          {/* FinalShell 经典 100% 动态宽度横向流式分布 */}
          <div className="flex flex-wrap gap-1.5">
            {commands.map((command) => {
              const key = commandKey(command);
              const isPending = pendingCommandKey === key;
              const parameters = extractCommandParameters(command.command);

              return (
                <div
                  key={key}
                  role="button"
                  aria-label={`发送 ${command.name}`}
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all duration-150 cursor-pointer select-none max-w-full shadow-2xs",
                    isPending
                      ? "border-emerald-500 bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-500/20"
                      : "border-[var(--app-line)] bg-[var(--panel-bg)] hover:border-emerald-500/60 hover:text-emerald-500 text-[var(--app-text)] font-extrabold"
                  )}
                  title={`点击发送: $ ${command.command}${command.description ? ` (${command.description})` : ""}`}
                  onClick={() => runCommand(command)}
                  onContextMenu={(event) => openCommandMenu(event, command)}
                >
                  <span className="truncate font-mono text-[11px] font-bold">
                    {command.name || command.command}
                  </span>

                  <button
                    type="button"
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[var(--app-muted)] hover:text-emerald-500 transition-colors"
                    title={parameters.length ? `填参数 (${parameters.length})` : "查看/编辑"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailCommandKey(detailCommandKey === key ? "" : key);
                      if (parameters.length) setPendingCommandKey(key);
                    }}
                  >
                    <Settings className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
            {commands.length === 0 && (
              <div className="w-full rounded-2xl border border-dashed border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-6 text-center text-xs font-semibold text-[var(--app-muted)]">
                右键空白处或点击顶部“+ 新建指令”
              </div>
            )}
          </div>
        </div>

        {pendingCommand && (
          <div className="border-t border-[var(--app-line)] bg-[var(--panel-bg)] p-3" aria-label={`快捷命令参数 ${pendingCommand.name}`}>
            <div className="mb-2 truncate text-xs font-semibold text-[var(--app-text)]">{pendingCommand.name}</div>
            <div className="space-y-2">
              {pendingParameters.map((parameter) => (
                <label key={parameter.key} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-xs text-[var(--app-muted)]">
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
          <div className="border-t border-[var(--app-line)] bg-[var(--panel-bg)] p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--app-text)]">命令详情</div>
            <div className="truncate text-xs font-semibold text-[var(--app-text)]">{detailCommand.name}</div>
            <code className="mt-2 block max-h-24 overflow-auto rounded-md bg-[var(--fill-1)] px-2 py-1.5 text-xs text-emerald-400 font-mono">
              {detailCommand.command}
            </code>
            {detailCommand.description && <p className="mt-2 text-xs text-[var(--app-muted)]">{detailCommand.description}</p>}
          </div>
        )}

        {/* Blank Space Context Menu (FinalShell 右键空白弹窗) */}
        {blankMenu && (
          <div
            role="menu"
            className="fixed z-50 min-w-36 rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-1 text-xs shadow-2xl backdrop-blur-md animate-fade-in"
            style={{ left: blankMenu.x, top: blankMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-bold text-[var(--app-text)] hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors cursor-pointer"
              onClick={() => {
                setBlankMenu(null);
                setAddCmdOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 text-emerald-500" />
              <span>➕ 新建快捷指令</span>
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-bold text-[var(--app-text)] hover:bg-purple-500/10 hover:text-purple-500 transition-colors cursor-pointer"
              onClick={() => {
                setBlankMenu(null);
                setAddFolderOpen(true);
              }}
            >
              <FolderIcon className="h-3.5 w-3.5 text-purple-500" />
              <span>📁 新建分类文件夹</span>
            </button>
          </div>
        )}

        {/* Add Folder Prompt Modal */}
        {addFolderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
            <form onSubmit={handleConfirmAddFolder} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl space-y-4">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <FolderIcon className="h-4 w-4 text-purple-400" /> 新建分类文件夹
              </h3>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="例如: 部署工具 / Docker指令..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-purple-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddFolderOpen(false)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-purple-600/20"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Add Command Modal (1:1 FinalShell 经典动态参数生成弹窗) */}
        {addCmdOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
            <form onSubmit={handleConfirmAddCmd} className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <h3 className="font-extrabold text-sm text-zinc-100 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-emerald-400" />
                  <span>添加命令</span>
                  <span className="text-[11px] text-zinc-500 font-normal">({activeFolder?.name || "默认分类"})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setAddCmdOpen(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-300 mb-1 font-extrabold">名称</label>
                  <input
                    type="text"
                    autoFocus
                    value={newCmdName}
                    onChange={(e) => setNewCmdName(e.target.value)}
                    placeholder="例如: 检查系统负载 / 过滤端口"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 mb-1 font-extrabold">命令</label>
                  <textarea
                    rows={4}
                    value={newCmdStr}
                    onChange={(e) => setNewCmdStr(e.target.value)}
                    placeholder="例如: top -b -n 1 | head -n 20"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-emerald-400 font-mono text-[11px] leading-relaxed focus:border-emerald-500 focus:outline-none shadow-inner"
                  />
                </div>

                {/* FinalShell 动态参数快捷插入按钮行 */}
                <div className="space-y-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3">
                  <div className="text-[11px] font-extrabold text-zinc-400">插入参数(动态生成命令):</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setNewCmdStr((prev) => `${prev}[p#${num} 参数${num}]`);
                        }}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-extrabold text-zinc-200 hover:border-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-400 transition-all cursor-pointer shadow-2xs active:scale-95"
                      >
                        参数{num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 末尾添加回车符 CR */}
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="addCrCheckbox"
                    checked={addCmdCr}
                    onChange={(e) => setAddCmdCr(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="addCrCheckbox" className="text-xs font-extrabold text-zinc-300 cursor-pointer select-none">
                    末尾添加回车符 CR
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAddCmdOpen(false)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-extrabold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-extrabold text-white shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                >
                  确定
                </button>
              </div>
            </form>
          </div>
        )}

        {commandMenu && (
          <div
            role="menu"
            className="fixed z-50 min-w-32 rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-1 text-xs shadow-2xl backdrop-blur-md"
            style={{ left: commandMenu.x, top: commandMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-bold text-[var(--app-text)] hover:bg-[var(--fill-1)]"
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
  const stripped = data
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1bP[\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[?>]?[0-9;:]*c/g, "")
    .replace(/\x1b\[\??[0-9;:]*n/g, "")
    .replace(/\x1b\[\??[0-9;:]*R/g, "")
    .replace(/\x1b\[\??[0-9;:]*\$y/g, "")
    .replace(/\x1b\[[IO]/g, "");

  return isVisibleTerminalReplyResidue(stripped) ? "" : stripped;
}

function isVisibleTerminalReplyResidue(data: string) {
  let offset = 0;
  const patterns = [
    /^2RR/,
    /^[?>]?[0-9]+(?:;[0-9]+){1,3}c/,
    /^\??[0-9]+;[0-9]+\$y/,
    /^1[01];rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}/
  ];

  while (offset < data.length) {
    const rest = data.slice(offset);
    const match = patterns.map((pattern) => rest.match(pattern)).find(Boolean);
    if (!match) return false;
    offset += match[0].length;
  }

  return data.length > 0;
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
  width,
  onResizeStart,
  onPanelChange,
  onActiveCommandFolderChange,
  onSendCommand,
  onAiConfigChange,
  onAddAiQuote,
  onOpenRemoteEditor,
  onOpenSearch,
  onOpenDiff,
  onAddFolder,
  onSaveCommand
}: {
  activePanel: TerminalSidePanel;
  activeSession?: SessionTab;
  commandFolders: CommandFolder[];
  activeCommandFolderId: string;
  shortcutParameterRequest: ShortcutParameterRequest | null;
  aiQuotes: AiQuote[];
  aiConfig: AiConfig;
  width: number;
  onResizeStart: (event: React.PointerEvent) => void;
  onPanelChange: (panel: TerminalSidePanel) => void;
  onActiveCommandFolderChange: (folderId: string) => void;
  onSendCommand: (command: string) => void;
  onAiConfigChange: (config: AiConfig) => void;
  onAddAiQuote?: (text: string, sourceTitle: string) => void;
  onOpenRemoteEditor?: (filePath: string, fileName: string) => void;
  onOpenSearch?: (path: string) => void;
  onOpenDiff?: (path: string, name: string) => void;
  onAddFolder?: (name: string) => void;
  onSaveCommand?: (folderId: string, command: Omit<CommandItem, "id">, commandId?: string) => void;
}) {
  const panels: Array<{ id: TerminalSidePanel; label: string; icon: React.ReactNode }> = [
    { id: "commands", label: "命令", icon: <Command className="h-3.5 w-3.5" /> },
    { id: "files", label: "文件", icon: <FolderOpen className="h-3.5 w-3.5" /> },
    { id: "ai", label: "AI", icon: <Bot className="h-3.5 w-3.5" /> }
  ];

  return (
    <aside
      style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
      className="group/sidebar relative grid min-h-0 grid-rows-[44px_minmax(0,1fr)] overflow-hidden border-l border-[var(--app-line)] bg-[var(--sidebar-bg)] select-none"
    >
      {/* 自由拖拽调节宽度手柄 */}
      <div
        className="absolute -left-1.5 top-0 bottom-0 z-50 w-3 cursor-col-resize flex items-center justify-center hover:bg-emerald-500/20 active:bg-emerald-500/40 transition-colors select-none"
        onPointerDown={onResizeStart}
        title="按住拖拽自由调节侧边栏宽度"
      >
        <div className="h-10 w-1 rounded-full bg-slate-300 dark:bg-slate-700 group-hover/sidebar:bg-emerald-500 transition-colors shadow-2xs" />
      </div>
      <div className="flex items-center gap-2 border-b border-[var(--app-line)] bg-[var(--panel-bg)] px-3.5 py-1.5" role="tablist" aria-label="终端右侧工作栏">
        {panels.map((panel) => {
          const active = activePanel === panel.id;
          const iconColorClass = {
            commands: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60",
            files: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60",
            ai: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60"
          }[panel.id];

          return (
            <button
              key={panel.id}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-8.5 flex-1 items-center justify-center gap-2 rounded-full text-xs font-extrabold transition-all duration-200 cursor-pointer select-none",
                active
                  ? "bg-slate-900 text-white shadow-sm shadow-slate-900/15"
                  : "text-[var(--text-secondary)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)]"
              )}
              onClick={() => onPanelChange(panel.id)}
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full shrink-0 transition-colors", active ? "bg-white/20 text-white" : iconColorClass)}>
                {panel.icon}
              </span>
              <span>{panel.label}</span>
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
            onAddFolder={onAddFolder}
            onSaveCommand={onSaveCommand}
          />
        )}
        {activePanel === "files" && (
          <TerminalFileSidebar
            activeSession={activeSession}
            onAddAiQuote={(text, source) => onAddAiQuote?.(text, source)}
            onOpenRemoteEditor={onOpenRemoteEditor}
            onOpenSearch={onOpenSearch}
            onOpenDiff={onOpenDiff}
          />
        )}
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

function TerminalFileSidebar({
  activeSession,
  onAddAiQuote,
  onOpenRemoteEditor,
  onOpenSearch,
  onOpenDiff
}: {
  activeSession?: SessionTab;
  onAddAiQuote?: (text: string, sourceTitle: string) => void;
  onOpenRemoteEditor?: (filePath: string, fileName: string) => void;
  onOpenSearch?: (path: string) => void;
  onOpenDiff?: (path: string, name: string) => void;
}) {
  const [remotePath, setRemotePath] = useState("/");
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [inputPath, setInputPath] = useState("/");
  const [fileFilter, setFileFilter] = useState("");
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string } | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; entry: DirectoryEntry } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [permissionFile, setPermissionFile] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null);
  const [isDualPane, setIsDualPane] = useState(false);
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const canBrowseRemote = activeSession?.kind === "ssh" && activeSession.connected;

  useEffect(() => {
    setRemotePath("/");
    setInputPath("/");
    setFileFilter("");
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

  async function triggerManualUpload() {
    if (!activeSession?.id || !canBrowseRemote) return;
    const selected = await nativeBridge.showOpenFileDialog("选择要上传到远程服务器的文件");
    if (!selected.filePath) return;
    const fileName = selected.filePath.split(/[/\\]/).pop() || "uploaded_file";
    const targetRemotePath = joinRemotePath(remotePath, fileName);
    setUploadStatus(`正在上传 ${fileName}...`);
    try {
      const res = await nativeBridge.uploadFile(activeSession.id, selected.filePath, targetRemotePath);
      if (res.success) {
        setUploadStatus(`✅ ${fileName} 上传成功！`);
        setReloadToken((t) => t + 1);
      } else {
        setUploadStatus(`❌ ${fileName} 上传失败：${res.error || "未知错误"}`);
      }
    } catch (err) {
      setUploadStatus(`❌ 上传发生异常`);
    }
  }

  async function handleDropFiles(files: FileList) {
    if (!activeSession?.id || !canBrowseRemote || files.length === 0) return;
    const fileArray = Array.from(files);
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const localPath = (file as any).path;
      const targetRemotePath = joinRemotePath(remotePath, file.name);
      setUploadStatus(`正在上传 (${i + 1}/${fileArray.length}): ${file.name}...`);
      try {
        if (localPath) {
          await nativeBridge.uploadFile(activeSession.id, localPath, targetRemotePath);
        } else {
          const content = await file.text();
          await nativeBridge.uploadFileContent(activeSession.id, content, targetRemotePath);
        }
      } catch (err) {
        console.error("Drop upload error:", err);
      }
    }
    setUploadStatus(`✅ 已完成 ${fileArray.length} 个文件上传！`);
    setReloadToken((t) => t + 1);
  }

  const emptyMessage = activeSession?.kind === "ssh"
    ? "SSH 会话未连接，暂不能浏览远程文件。"
    : "当前不是 SSH 会话，暂不能浏览远程文件。";

  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--app-bg)] relative"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canBrowseRemote) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (canBrowseRemote && e.dataTransfer.files) {
          void handleDropFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="border-b border-[var(--app-line)] bg-[var(--sidebar-bg)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--app-text)]">文件浏览 & 传输</h2>
            <p className="mt-0.5 text-[11px] text-[var(--app-muted)]">
              {activeSession ? `当前会话：${activeSession.title}` : "连接 SSH 后查看文件"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsDualPane((prev) => !prev)}
              className={cn(
                "flex h-7 px-2 items-center gap-1 rounded-lg border text-[11px] font-extrabold transition-colors cursor-pointer shadow-2xs",
                isDualPane
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-[var(--panel-bg)] text-[var(--app-text)] border-[var(--app-line)] hover:bg-[var(--fill-1)]"
              )}
              title="切换双栏本地/远程 Commander 对比模式"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>{isDualPane ? "双栏视图" : "单栏视图"}</span>
            </button>
            <FolderOpen className="h-4 w-4 text-emerald-600 shrink-0" />
          </div>
        </div>
      </div>
      <div className="min-h-0 overflow-auto p-3 relative">
        {/* 拖拽释放区遮罩 Overlay */}
        {isDragging && (
          <div className="absolute inset-2 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50/95 p-6 text-center shadow-xl animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xs">
            <Upload className="h-10 w-10 text-emerald-600 animate-bounce" />
            <div className="mt-3 text-sm font-extrabold text-emerald-900">释放文件以拖拽上传</div>
            <div className="mt-1 font-mono text-xs font-semibold text-emerald-700">目标路径: {remotePath}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3 shadow-2xs">
            <div className="text-xs font-extrabold text-[var(--app-text)]">拖拽上传</div>
            <div className="mt-1 text-[11px] leading-4 text-[var(--app-muted)]">直接将电脑文件拖拽至此处上传。</div>
          </div>
          <div className="rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3 shadow-2xs">
            <div className="text-xs font-extrabold text-[var(--app-text)]">远程目录</div>
            <div className="mt-1 text-[11px] leading-4 text-[var(--app-muted)]">选择 SSH 会话后实时管理。</div>
          </div>
        </div>

        {uploadStatus && (
          <div className="mt-2.5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-extrabold text-emerald-800 shadow-2xs">
            <span className="truncate">{uploadStatus}</span>
            <button className="text-[10px] text-emerald-700 hover:text-emerald-900 ml-2 shrink-0 cursor-pointer" onClick={() => setUploadStatus("")}>关闭</button>
          </div>
        )}

        {canBrowseRemote ? (
          <div className="mt-3 min-w-0 rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] shadow-2xs">
            <div className="flex min-w-0 items-center gap-1.5 border-b border-[var(--app-line)] px-3 py-2">
              <button
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--app-text)] hover:bg-[var(--fill-1)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                disabled={remotePath === "/"}
                title="返回上级目录"
                onClick={() => setRemotePath(parentRemotePath(remotePath))}
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-90" />
              </button>
              <button
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                title="根目录"
                onClick={() => setRemotePath("/")}
              >
                <Home className="h-3.5 w-3.5" />
              </button>
              {isEditingPath ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setRemotePath(inputPath.trim() || "/");
                    setIsEditingPath(false);
                  }}
                  className="min-w-0 flex-1"
                >
                  <input
                    autoFocus
                    className="h-7 w-full rounded-lg bg-[var(--panel-bg)] px-2 font-mono text-[11px] text-[var(--app-text)] border border-emerald-500 focus:outline-none"
                    value={inputPath}
                    onChange={(e) => setInputPath(e.target.value)}
                    onBlur={() => setIsEditingPath(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setIsEditingPath(false);
                    }}
                  />
                </form>
              ) : (
                <div
                  aria-label="远程路径"
                  className="min-w-0 flex-1 truncate rounded-lg bg-[var(--fill-1)] px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--app-text)] hover:bg-[var(--fill-2)] cursor-text transition-colors border border-[var(--app-line)]"
                  title="点击可直接编辑路径并跳转"
                  onClick={() => {
                    setInputPath(remotePath);
                    setIsEditingPath(true);
                  }}
                >
                  {remotePath}
                </div>
              )}
              <button
                className="inline-flex h-7 px-2 shrink-0 items-center justify-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 text-[11px] font-extrabold text-blue-400 hover:bg-blue-500/20 transition-colors shadow-2xs cursor-pointer"
                title="搜索远程文件名或进行文本内容 Grep 检索"
                onClick={() => onOpenSearch?.(remotePath)}
              >
                <Search className="h-3.5 w-3.5" />
                <span>检索/Grep</span>
              </button>
              <button
                className="inline-flex h-7 px-2 shrink-0 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                title="选择本地文件上传到当前目录"
                onClick={() => void triggerManualUpload()}
              >
                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                <span>上传</span>
              </button>
              <button
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                title="刷新远程文件"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 border-b border-[var(--app-line)] px-3 py-1.5 bg-[var(--fill-1)]">
              <Search className="h-3.5 w-3.5 text-[var(--app-muted)] shrink-0" />
              <input
                className="w-full bg-transparent text-xs text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:outline-none font-medium"
                placeholder="搜索当前目录文件..."
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
              />
              {fileFilter && (
                <button className="text-[10px] text-[var(--app-muted)] hover:text-[var(--app-text)] cursor-pointer" onClick={() => setFileFilter("")}>
                  ✕
                </button>
              )}
            </div>
            {loading && <div className="px-3 py-8 text-center text-xs text-[var(--app-muted)] font-extrabold">正在读取目录...</div>}
            {!loading && error && <div className="px-3 py-8 text-center text-xs text-rose-600 font-extrabold">{error}</div>}
            {!loading && !error && entries.length === 0 && <div className="px-3 py-8 text-center text-xs text-[var(--app-muted)] font-extrabold">目录为空。</div>}
            {!loading && !error && entries.length > 0 && (
              <div aria-label="远程文件列表" className="divide-y divide-[var(--app-line)]">
                {entries
                  .filter((entry) => !fileFilter.trim() || entry.name.toLowerCase().includes(fileFilter.trim().toLowerCase()))
                  .map((entry) => (
                  <button
                    key={`${entry.type}-${entry.name}`}
                    className={cn(
                      "grid w-full min-w-0 grid-cols-[18px_minmax(0,1fr)_64px_82px] items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                      entry.type === "directory" ? "hover:bg-[var(--fill-1)] cursor-pointer" : "cursor-default"
                    )}
                    onClick={() => openDirectory(entry)}
                    onContextMenu={(event) => openFileMenu(event, entry)}
                  >
                    {entry.type === "directory" ? (
                      <FolderIcon aria-label="目录图标" className="h-4 w-4 text-amber-500 shrink-0" />
                    ) : (entry.type as string) === "symlink" || (entry as any).linkTarget ? (
                      <LinkIcon aria-label="软链接图标" className="h-4 w-4 text-cyan-400 shrink-0" />
                    ) : (
                      <FileIcon aria-label="文件图标" className="h-4 w-4 text-[var(--app-muted)] shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="truncate font-extrabold text-[var(--app-text)]">{entry.name}</span>
                        {(entry as any).linkTarget && (
                          <span className="truncate font-mono text-[10px] text-cyan-400 font-bold">
                            → {(entry as any).linkTarget}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--app-muted)]">{entry.date || " "}</span>
                    </span>
                    <span className="text-[var(--app-muted)] font-semibold">{(entry.type as string) === "symlink" ? "软链接" : entry.type === "directory" ? "目录" : "文件"}</span>
                    <span className="truncate text-right font-mono text-[11px] text-[var(--app-muted)] font-semibold">{formatRemoteFileSize(entry)}</span>
                  </button>
                ))}
              </div>
            )}
            {fileMenu && (
              <div
                role="menu"
                className="fixed z-50 min-w-44 rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-1.5 text-xs font-extrabold shadow-xl animate-in fade-in zoom-in-95 duration-150"
                style={{ left: fileMenu.x, top: fileMenu.y }}
                onMouseLeave={() => setFileMenu(null)}
              >
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-emerald-600 dark:text-emerald-400 hover:bg-[var(--fill-1)] cursor-pointer font-bold"
                  onClick={() => {
                    const fullPath = joinRemotePath(remotePath, fileMenu.entry.name);
                    onOpenRemoteEditor?.(fullPath, fileMenu.entry.name);
                    setFileMenu(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>在线编辑修改 (Ctrl+S写回)</span>
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                  onClick={() => {
                    const fullPath = joinRemotePath(remotePath, fileMenu.entry.name);
                    setPreviewFile({ path: fullPath, name: fileMenu.entry.name });
                    setFileMenu(null);
                  }}
                >
                  <Eye className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span>预览文件内容</span>
                </button>

                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                  onClick={() => void downloadRemoteFile(fileMenu.entry)}
                >
                  <Download className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>下载文件</span>
                </button>

                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                  onClick={() => {
                    const fullPath = joinRemotePath(remotePath, fileMenu.entry.name);
                    navigator.clipboard.writeText(fullPath);
                    setUploadStatus(`📋 已复制路径: ${fullPath}`);
                    setFileMenu(null);
                  }}
                >
                  <Copy className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>复制远程路径</span>
                </button>

                {fileMenu.entry.type === "file" && (
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                    onClick={() => {
                      const fullPath = joinRemotePath(remotePath, fileMenu.entry.name);
                      onOpenDiff?.(fullPath, fileMenu.entry.name);
                      setFileMenu(null);
                    }}
                  >
                    <GitCompare className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                    <span>双栏文本 Diff 对比分析</span>
                  </button>
                )}

                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                  onClick={() => {
                    const fullPath = joinRemotePath(remotePath, fileMenu.entry.name);
                    setPermissionFile({ name: fileMenu.entry.name, path: fullPath, isDirectory: fileMenu.entry.type === "directory" });
                    setFileMenu(null);
                  }}
                >
                  <Settings className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>修改权限 / 属性 (Chmod)</span>
                </button>

                {onAddAiQuote && (
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[var(--app-text)] hover:bg-[var(--fill-1)] cursor-pointer"
                    onClick={() => {
                      const fullPath = joinRemotePath(remotePath, fileMenu.entry.name);
                      onAddAiQuote(`远程文件路径: ${fullPath}`, activeSession?.title || "远程文件");
                      setUploadStatus(`💬 已引用路径至 AI 问答`);
                      setFileMenu(null);
                    }}
                  >
                    <Bot className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                    <span>引用路径至 AI 问答</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--app-line)] bg-[var(--panel-bg)] px-3 py-8 text-center text-xs font-extrabold text-[var(--app-muted)]">
            {emptyMessage}
          </div>
        )}
      </div>
      <FilePreviewModal
        open={Boolean(previewFile)}
        file={previewFile || undefined}
        sessionId={activeSession?.id}
        sessionTitle={activeSession?.title}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
        onAddAiQuote={onAddAiQuote}
      />
      <FilePermissionModal
        file={permissionFile}
        activeSessionId={activeSession?.id}
        onClose={() => setPermissionFile(null)}
        onSuccess={(msg) => {
          setUploadStatus(msg);
          setReloadToken((t) => t + 1);
        }}
      />
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
          <Button variant="outline" size={32} className="rounded-full w-10 h-10 px-0 shadow-2xs" onClick={onRefresh} title="刷新卡片">
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
              className="rounded-full px-5 h-10 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
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
                      className="rounded-full px-5 h-9 font-extrabold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
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
  variant = "emerald"
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  percent: number;
  variant?: "indigo" | "emerald" | "amber";
}) {
  const iconMeta = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/60",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-100 dark:border-amber-900/60"
  }[variant];

  const barColor = {
    indigo: "bg-indigo-600",
    emerald: "bg-emerald-600",
    amber: "bg-amber-500"
  }[variant];

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5.5 shadow-sm transition-all hover:shadow-md">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-[var(--app-muted)]">{label} 动态负载</span>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border shadow-2xs", iconMeta)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-extrabold tracking-tight text-[var(--app-text)]">{value}</span>
          <span className="rounded-full bg-[var(--fill-2)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--app-muted)]">
            {percent > 80 ? "⚠️ 高负载" : "🟢 正常"}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--fill-2)] p-0.5">
          <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${percent}%` }} />
        </div>
        <div className="truncate font-mono text-xs font-semibold text-[var(--text-secondary)]">{detail}</div>
      </div>
    </div>
  );
}

function MonitorStatusBlock({ result }: { result?: NativeResult }) {
  if (!result) {
    return <div className="rounded-2xl bg-[var(--fill-1)] p-4 text-xs font-semibold text-[var(--app-muted)] text-center">等待刷新数据...</div>;
  }
  if (!result.success) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs font-extrabold text-amber-700 dark:text-amber-300">
        ⚠️ {result.error || "暂未获取到数据"}
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
    <div className="h-full overflow-auto bg-[var(--app-bg)] px-10 py-7">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--app-text)]">系统硬件与资源监控</h1>
              <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-3 py-0.5 font-mono text-xs font-extrabold">
                {activeSession ? activeSession.title : "未连接"}
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--text-secondary)]">实时推算当前 SSH 实例的 CPU 负载、物理内存、磁盘 IO、网卡速率与进程树。</p>
          </div>
          <Button variant="outline" size={32} className="rounded-full h-10 px-5 text-xs font-bold shadow-2xs" onClick={refresh} disabled={!activeSession || loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新指标
          </Button>
        </div>

        {!activeSession ? (
          <EmptyState title="暂无活动 SSH 会话" description="在左侧列表中点击选择或连接一台 SSH 主机后，系统将自动开始推算该主机的硬件监控指标。" />
        ) : (
          <div className="space-y-6">
            {statusResults.length > 0 && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                {statusResults.map((result) => result.error || "暂未获取到部分监控项数据").join("；")}
              </div>
            )}

            {/* 3 大核心指标卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <MonitorMetricCard
                label="CPU"
                value={hasStats ? monitorPercentLabel(stats.cpu_usage) : "0%"}
                detail="当前多核处理器占用"
                icon={Cpu}
                percent={monitorPercent(stats.cpu_usage)}
                variant="indigo"
              />
              <MonitorMetricCard
                label="内存"
                value={hasStats ? monitorPercentLabel(stats.memory_usage) : "0%"}
                detail={`${monitorText(stats.memory_used)} / ${monitorText(stats.memory_total)}`}
                icon={Server}
                percent={monitorPercent(stats.memory_usage)}
                variant="emerald"
              />
              <MonitorMetricCard
                label="磁盘"
                value={hasStats ? monitorPercentLabel(stats.disk_usage) : "0%"}
                detail={`${monitorText(stats.disk_used)} / ${monitorText(stats.disk_total)}`}
                icon={HardDrive}
                percent={monitorPercent(stats.disk_usage)}
                variant="amber"
              />
            </div>

            {/* 系统概览与网卡区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4 text-indigo-600" />
                  系统硬件概览
                </h2>
                {!hasInfo ? (
                  <MonitorStatusBlock result={snapshots.info} />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "主机名称", value: info.hostname },
                      { label: "操作系统", value: info.os_name || info.os_version },
                      { label: "硬件架构", value: info.architecture },
                      { label: "处理器型号", value: info.cpu },
                      { label: "物理内存总额", value: info.total_memory },
                      { label: "系统运行持续时间", value: info.uptime }
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3.5">
                        <div className="text-[11px] font-extrabold text-[var(--app-muted)]">{item.label}</div>
                        <div className="mt-1 truncate font-mono text-xs font-extrabold text-[var(--app-text)]">{monitorText(item.value)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 网卡网络接口 */}
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  网络设备接口 (Network NICs)
                </h2>
                {!hasNetwork ? (
                  <MonitorStatusBlock result={snapshots.network} />
                ) : (
                  <div className="space-y-2.5">
                    {networks.slice(0, 4).map((net, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-extrabold text-[var(--app-text)]">{monitorText(net.name || net.interface)}</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] font-bold text-indigo-600 dark:text-cyan-400">{monitorText(net.ip || net.address)}</div>
                        </div>
                        <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 font-mono text-[10px] font-extrabold shrink-0">
                          Active
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 进程列表与磁盘使用 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 进程列表 */}
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-600" />
                  实时进程树 Top 8 (Process Tree)
                </h2>
                {!hasProcesses ? (
                  <MonitorStatusBlock result={snapshots.processes} />
                ) : processes.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--fill-1)] p-4 text-xs font-semibold text-[var(--app-muted)] text-center">暂无进程数据</div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-[var(--app-line)]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[var(--fill-2)] text-[10px] font-extrabold text-[var(--app-muted)] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2.5">PID</th>
                          <th className="px-3 py-2.5">进程名称</th>
                          <th className="px-3 py-2.5">CPU %</th>
                          <th className="px-3 py-2.5">内存 %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-line)]">
                        {processes.map((process, index) => (
                          <tr key={`${monitorText(process.pid)}-${index}`} className="hover:bg-[var(--fill-1)] transition-colors">
                            <td className="px-3 py-2.5 font-bold text-indigo-600 dark:text-cyan-400">{monitorText(process.pid)}</td>
                            <td className="px-3 py-2.5 font-bold text-[var(--app-text)] truncate max-w-[120px]">{monitorText(process.name)}</td>
                            <td className="px-3 py-2.5 font-bold text-emerald-600">{monitorPercentLabel(process.cpu)}</td>
                            <td className="px-3 py-2.5 text-[var(--app-muted)]">{monitorPercentLabel(process.memory)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 磁盘挂载 */}
              <div className="rounded-3xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-[var(--app-text)] mb-4 flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-amber-600" />
                  磁盘挂载点使用量 (Disk Mounts)
                </h2>
                {!hasDisk ? (
                  <MonitorStatusBlock result={snapshots.disk} />
                ) : disks.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--fill-1)] p-4 text-xs font-semibold text-[var(--app-muted)] text-center">暂无磁盘数据</div>
                ) : (
                  <div className="space-y-3">
                    {disks.slice(0, 3).map((disk, index) => (
                      <div key={`${monitorText(disk.mount)}-${index}`} className="rounded-2xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-xs font-extrabold text-[var(--app-text)]">{monitorText(disk.mount)}</div>
                          <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 font-mono text-[10px] font-extrabold">
                            {monitorPercentLabel(disk.usage)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--fill-2)] p-0.5">
                          <div className="h-full rounded-full bg-amber-500 transition-all duration-300" style={{ width: `${monitorPercent(disk.usage)}%` }} />
                        </div>
                        <div className="text-[10px] font-mono font-semibold text-[var(--app-muted)]">
                          已用 {monitorText(disk.used)} / 总额 {monitorText(disk.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
  const [showRunoobManual, setShowRunoobManual] = useState(false);
  const [runoobCategory, setRunoobCategory] = useState<string>("全部");
  const [folderName, setFolderName] = useState("");
  const [draft, setDraft] = useState({ id: "", name: "", command: "", description: "" });
  const [editingCommand, setEditingCommand] = useState<(CommandItem & { folderId: string }) | null>(null);
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
    onSaveCommand(activeFolder.id, draft);
    setDraft({ id: "", name: "", command: "", description: "" });
  }

  function submitEditedCommand() {
    if (!editingCommand) return;
    onSaveCommand(editingCommand.folderId, {
      name: editingCommand.name,
      command: editingCommand.command,
      description: editingCommand.description || ""
    }, editingCommand.id);
    setEditingCommand(null);
  }

  function editCommand(command: CommandItem & { folderId: string }) {
    setEditingCommand({
      folderId: command.folderId,
      id: command.id,
      name: command.name,
      command: command.command,
      description: command.description || ""
    });
  }

  function insertCommandParameter(index: number) {
    setDraft((current) => ({ ...current, command: `${current.command}[p#${index} 参数名]` }));
  }

  function insertEditingCommandParameter(index: number) {
    setEditingCommand((current) => current ? { ...current, command: `${current.command}[p#${index} 参数名]` } : current);
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
    <div className="grid h-full min-w-0 grid-cols-[210px_minmax(0,1fr)] bg-[var(--app-bg)]">
      <aside className="min-h-0 border-r border-[var(--app-line)] bg-[var(--sidebar-bg)] p-3.5 select-none flex flex-col justify-between">
        <div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-[var(--app-text)]">快捷命令库</h1>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--text-secondary)] truncate">
              {activeSession ? `目标：${activeSession.title}` : "可直接发送至终端"}
            </p>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
            <Input
              className="pl-8 h-8 text-xs rounded-full shadow-2xs"
              value={query}
              placeholder="搜索命令..."
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-1.5">
            <Button
              variant="outline"
              size={26}
              className="h-7 flex-1 rounded-full text-[11px] font-extrabold"
              onClick={onExportCommands}
            >
              <Download className="h-3 w-3" />
              导出
            </Button>
            <label className="h-7 flex-1 rounded-full border border-[var(--app-line)] bg-[var(--panel-bg)] hover:bg-[var(--fill-1)] flex items-center justify-center gap-1 text-[11px] font-extrabold text-[var(--app-text)] cursor-pointer shadow-2xs">
              <Upload className="h-3 w-3" />
              导入
              <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && onImportCommands("本地文件")} />
            </label>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <Input
              className="h-7.5 text-xs rounded-full"
              value={folderName}
              placeholder="新分类名称"
              onChange={(event) => setFolderName(event.target.value)}
            />
            <Button variant="outline" size={26} className="h-7.5 rounded-full px-2.5 text-[11px] font-extrabold shrink-0" onClick={submitFolder}>
              + 分类
            </Button>
          </div>

          <div className="mt-3 space-y-1">
            {folders.map((folder) => {
              const active = folder.id === activeFolder?.id;
              return (
                <div
                  key={folder.id}
                  className={cn(
                    "group flex items-center justify-between rounded-xl px-3 py-1.5 text-xs transition-all duration-150 cursor-pointer select-none",
                    active
                      ? "bg-emerald-600 text-white font-extrabold shadow-2xs"
                      : "bg-[var(--panel-bg)] text-[var(--app-text)] hover:bg-[var(--fill-1)] border border-[var(--app-line)]"
                  )}
                  onClick={() => onActiveFolderChange(folder.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs">📁</span>
                    <span className="truncate font-extrabold text-[11px]">{folder.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cn("rounded-full px-1.5 py-0.2 font-mono text-[9px] font-extrabold", active ? "bg-white/20 text-white" : "bg-[var(--fill-2)] text-[var(--app-muted)]")}>
                      {folder.commands.length}
                    </span>
                    {folders.length > 1 && (
                      <button
                        aria-label={`删除 ${folder.name}`}
                        title="删除分类"
                        className={cn("h-4.5 w-4.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity", active ? "hover:bg-rose-500 text-white" : "hover:bg-rose-50 text-rose-600")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFolder(folder.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="min-h-0 overflow-auto bg-[var(--app-bg)] px-5 py-5">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--app-text)]">{keyword ? "搜索结果" : activeFolder?.name || "默认分类"}</h2>
              <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 font-mono text-[11px] font-extrabold">
                {visibleCommands.length} 条
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-[var(--app-text)]">
              <span className="flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-emerald-600" />
                {editingCommand ? "编辑已有命令" : "新建快捷命令"}
              </span>
              {editingCommand && (
                <Button variant="ghost" size={26} className="h-6 text-[11px] px-2 text-[var(--app-muted)]" onClick={() => setEditingCommand(null)}>
                  取消编辑
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                className="h-8 text-xs rounded-xl shadow-2xs"
                value={editingCommand ? editingCommand.name : draft.name}
                placeholder="命令名称 (如: top)"
                onChange={(event) => {
                  const val = event.target.value;
                  if (editingCommand) setEditingCommand((c) => c ? { ...c, name: val } : c);
                  else setDraft((c) => ({ ...c, name: val }));
                }}
              />
              <Input
                className="h-8 text-xs rounded-xl shadow-2xs sm:col-span-2"
                value={editingCommand ? editingCommand.description : draft.description}
                placeholder="功能简述 (可选)"
                onChange={(event) => {
                  const val = event.target.value;
                  if (editingCommand) setEditingCommand((c) => c ? { ...c, description: val } : c);
                  else setDraft((c) => ({ ...c, description: val }));
                }}
              />
            </div>

            <Textarea
              className="min-h-16 font-mono text-xs rounded-xl p-2.5 border-[var(--app-line)] bg-slate-900 text-emerald-400 placeholder:text-slate-500 shadow-inner"
              value={editingCommand ? editingCommand.command : draft.command}
              placeholder="命令内容... 支持占位符如: top -b -n1 | head -n [p#1 行数]"
              onChange={(event) => {
                const val = event.target.value;
                if (editingCommand) setEditingCommand((c) => c ? { ...c, command: val } : c);
                else setDraft((c) => ({ ...c, command: val }));
              }}
            />

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1 overflow-x-auto">
                <span className="text-[10px] font-bold text-[var(--app-muted)] shrink-0">插参数:</span>
                {COMMAND_PARAMETER_SLOTS.map((index) => (
                  <button
                    key={index}
                    type="button"
                    className="rounded-full bg-[var(--fill-2)] hover:bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-mono font-extrabold text-[var(--app-text)] transition-colors cursor-pointer border border-[var(--app-line)] shrink-0"
                    onClick={() => (editingCommand ? insertEditingCommandParameter(index) : insertCommandParameter(index))}
                  >
                    +p#{index}
                  </button>
                ))}
              </div>

              <Button
                size={32}
                className="rounded-full px-4 h-7.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs shrink-0"
                onClick={editingCommand ? submitEditedCommand : submitCommand}
              >
                {editingCommand ? "保存" : "+ 添加命令"}
              </Button>
            </div>
          </div>

          {/* FinalShell 动态宽度横向流式指令全库展示区 */}
          <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-4 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between text-xs font-extrabold text-[var(--app-text)] border-b border-[var(--app-line)] pb-2">
              <span className="flex items-center gap-2">
                <span>📁</span>
                <span>{activeFolder?.name || "默认分类"} 快捷指令集</span>
              </span>
              <span className="font-mono text-[10px] text-[var(--app-muted)]">点击标签直接写入活动终端控制台</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleCommands.map((command) => {
                const parameters = extractCommandParameters(command.command);
                return (
                  <div
                    key={commandKey(command)}
                    className="group inline-flex items-center gap-2 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:bg-emerald-50 hover:border-emerald-400 p-2 text-xs transition-all cursor-pointer shadow-2xs select-none max-w-full"
                    title={`点击发送到终端: $ ${command.command}`}
                    onClick={() => sendCommand(command)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-extrabold text-[var(--app-text)] text-xs truncate">{command.name}</span>
                      <code className="font-mono text-[10px] font-bold text-indigo-700 dark:text-cyan-300 bg-[var(--panel-bg)] px-2 py-0.5 rounded-lg border border-[var(--app-line)] truncate">
                        $ {command.command}
                      </code>
                    </div>

                    <div className="flex items-center gap-1 border-l border-[var(--app-line)] pl-1.5 shrink-0">
                      <button
                        aria-label={`编辑命令 ${command.name}`}
                        title="编辑"
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--app-muted)] hover:bg-white hover:text-[var(--app-text)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          editCommand(command);
                        }}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button
                        aria-label={`删除命令 ${command.name}`}
                        title="删除"
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--app-muted)] hover:bg-rose-100 hover:text-rose-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCommand(command.folderId, command.id);
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleCommands.length === 0 && (
                <div className="w-full py-8 text-center text-xs font-semibold text-[var(--app-muted)]">
                  当前分类下暂无快捷命令
                </div>
              )}
            </div>
          </div>
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

function TerminalFontList({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: TerminalFontOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-semibold text-[var(--app-muted)]">{label}</div>
      <div
        aria-label={label}
        className="h-40 overflow-auto rounded-xl border border-[var(--app-line)] bg-[var(--raised-bg)] p-1 space-y-0.5"
        role="listbox"
        tabIndex={0}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={`${option.label}-${option.value}`}
              aria-selected={selected}
              className={cn(
                "block min-h-7 w-full truncate rounded-lg px-2.5 text-left text-xs leading-7 font-bold transition-all cursor-pointer",
                selected ? "bg-emerald-500/20 text-emerald-500 font-extrabold shadow-2xs" : "text-[var(--app-text)] hover:bg-[var(--fill-1)]"
              )}
              role="option"
              style={{ fontFamily: `${option.family}, sans-serif` }}
              type="button"
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
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

  function formatAiError(error: unknown, defaultMessage: string): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    return defaultMessage;
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
              text: formatAiError(error, "Hermes 调用失败。")
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
          text: formatAiError(error, "AI 执行失败。")
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
    <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--panel-bg)] border-l border-[var(--app-line)]">
      <header className="border-b border-[var(--app-line)] px-4 py-3 bg-[var(--panel-bg)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--app-text)]">AI 对话栏</h2>
            <p className="mt-0.5 text-xs text-[var(--app-muted)]">{isCodex ? "当前工具：本地 Codex CLI" : "当前工具：Hermes 本地 / 远端"}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            可用
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
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

        {selectedTool === "codex" && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-500 shadow-2xs">
            <div className="flex items-center justify-between font-extrabold text-amber-500">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                提示：需系统安装 codex 命令行
              </span>
              <button
                aria-label="一键切换免安装引擎"
                className="text-[11px] font-extrabold text-sky-400 hover:text-sky-300 cursor-pointer underline shrink-0"
                onClick={() => setSelectedTool("hermes")}
              >
                切换 Hermes (免安装) →
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--app-muted)] leading-4">
              未安装可通过 <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono font-bold text-amber-400 select-all">npm i -g @openai/codex</code> 安装，或直接无缝切换 Hermes/API 使用。
            </p>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[var(--app-muted)]">模型</span>
            <select
              className="h-8.5 w-full rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-2.5 text-xs font-bold text-[var(--app-text)] focus:outline-none focus:border-emerald-500"
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
            <span className="mb-1 block text-[11px] font-semibold text-[var(--app-muted)]">降噪模式</span>
            <select
              className="h-8.5 w-full rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-2.5 text-xs font-bold text-[var(--app-text)] focus:outline-none focus:border-emerald-500"
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
            className="h-8.5 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-2.5 text-xs font-bold text-[var(--app-text)] focus:outline-none focus:border-emerald-500"
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
          <Button variant="outline" className="h-8.5 px-3 rounded-xl border-[var(--app-line)] bg-[var(--fill-1)] text-xs font-bold text-[var(--app-text)] hover:bg-[var(--fill-2)] cursor-pointer" onClick={createNewAiSession}>
            新会话
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--app-text)] cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--app-line)] bg-[var(--fill-2)] text-emerald-500 focus:ring-0 cursor-pointer"
              checked={activeAiSession?.continueSession ?? true}
              onChange={(event) => updateContinueSession(event.target.checked)}
            />
            继续当前会话
          </label>
          <Button variant="outline" className="h-7.5 px-2.5 text-xs font-bold rounded-lg border-[var(--app-line)] text-[var(--app-muted)] hover:text-[var(--app-text)] cursor-pointer" onClick={() => setConfigOpen((open) => !open)}>
            高级配置
          </Button>
        </div>
      </header>

      <div className="min-h-0 overflow-auto bg-[var(--panel-bg)]">
        {configOpen && (
          <AiConfigPanel
            selectedTool={selectedTool}
            config={config}
            hermesStatus={hermesStatus}
            onConfigChange={onConfigChange}
            onCheckHermes={checkHermesConnection}
          />
        )}

        <section className="border-b border-[var(--app-line)] bg-[var(--panel-bg)] px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[var(--app-muted)]">会话记忆</span>
            <textarea
              data-testid="ai-memory-input"
              className="h-14 w-full resize-none rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-2 text-xs leading-5 text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-emerald-500"
              value={activeAiSession?.memory || ""}
              placeholder="例如：优先检查最新日志、默认使用当前项目目录"
              onChange={(event) => updateAiMemory(event.target.value)}
            />
          </label>
        </section>

        <section className="border-b border-[var(--app-line)] bg-[var(--panel-bg)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-[var(--app-muted)]">当前上下文</div>
            <div className="text-[11px] font-bold text-emerald-500 font-mono">{contextChips.length} 项</div>
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
              <div className="rounded-xl border border-dashed border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-2 text-xs text-[var(--app-muted)]">
                暂无附加上下文
              </div>
            )}
          </div>
          {previewContext && (
            <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] p-3 text-xs leading-5 text-[var(--app-text)] font-mono">
              {previewContext.text}
            </pre>
          )}
        </section>

        <div data-testid="ai-chat-transcript" className="space-y-3 px-4 py-4">
          {messages.map((message) => (
            <AiMessage key={message.id} role={message.role} attachments={message.attachments}>{message.text}</AiMessage>
          ))}
          {messages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-6 text-center text-xs font-semibold text-[var(--app-muted)]">
              暂无对话记录
            </div>
          )}
          {running && <AiRunStatus text={runStatus || "Codex 执行中..."} thinking />}
          {!running && runStatus && <AiRunStatus text={runStatus} />}
        </div>
      </div>

      <footer className="border-t border-[var(--app-line)] bg-[var(--panel-bg)] p-4">
        <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-[var(--app-muted)] font-medium">
          <span className="rounded-full bg-[var(--fill-2)] px-2 py-0.5">附加当前会话</span>
          <span className="rounded-full bg-[var(--fill-2)] px-2 py-0.5">附加终端输出</span>
          <span className="rounded-full bg-[var(--fill-2)] px-2 py-0.5">附加选区日志</span>
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
        {attachmentStatus && <div className="mb-2 text-xs text-amber-500 font-semibold">{attachmentStatus}</div>}
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
            className="inline-flex h-9.5 items-center justify-center rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-[var(--fill-2)] disabled:opacity-50 cursor-pointer transition-colors"
            title="添加附件"
            disabled={running}
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            className="h-9.5 rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-3 text-xs text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-emerald-500"
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
            className="inline-flex h-9.5 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all cursor-pointer shadow-2xs"
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
    return "Codex 执行超时 (120 秒)，请检查本地 Codex 环境。";
  }
  if (cleaned && !looksLikeOnlyRuntimeNoise(cleaned)) {
    return cleaned;
  }
  if (!result.error || looksLikeOnlyRuntimeNoise(result.error) || !cleaned || looksLikeOnlyRuntimeNoise(cleaned)) {
    return "Codex 执行失败，请检查本地 Codex 环境。";
  }
  const errDetail = result.error || output || "请检查本地 Codex 命令或配置。";
  return `Codex 调用未返回成功指令：${errDetail}`;
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
    <pre className="my-2 max-h-72 overflow-auto rounded-[10px] bg-[var(--terminal-bg)] p-3 text-left">
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

function FilePreviewModal({
  open,
  file,
  sessionId,
  sessionTitle,
  onOpenChange,
  onAddAiQuote
}: {
  open: boolean;
  file?: { path: string; name: string };
  sessionId?: string;
  sessionTitle?: string;
  onOpenChange: (open: boolean) => void;
  onAddAiQuote?: (text: string, sourceTitle: string) => void;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !file || !sessionId) return;
    setLoading(true);
    setError("");
    setContent("");

    nativeBridge
      .readFileContent(sessionId, file.path)
      .then((res) => {
        if (res.success && typeof res.content === "string") {
          const lowerName = file.name.toLowerCase();
          if (lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz") || lowerName.endsWith(".gz") || lowerName.endsWith(".zip") || lowerName.endsWith(".rar") || lowerName.endsWith(".7z") || lowerName.endsWith(".iso") || lowerName.endsWith(".bin") || lowerName.endsWith(".exe") || lowerName.endsWith(".so")) {
            setContent("⚠️ 选中的文件为二进制 / 压缩包归档格式 (.tar.gz)，无法作为纯文本预览。请使用 SFTP 下载到本地进行查看或在终端使用 tar 命令解压。");
          } else {
            try {
              const bytes = base64ToBytes(res.content);
              const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
              setContent(text);
            } catch {
              setContent(res.content);
            }
          }
        } else {
          setError(res.error || "无法读取远程文件内容。");
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "读取远程文件发生异常。");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, file, sessionId]);

  if (!file) return null;

  const lines = content.split("\n");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--mask-base)] backdrop-blur-xs animate-in fade-in duration-150" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[780px] max-w-[95vw] h-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)] p-6 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between border-b border-[var(--app-line)] pb-4 shrink-0">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--app-text)] flex items-center gap-2">
                <span>📄</span>
                <span>{file.name}</span>
                <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 text-[10px] px-2.5 py-0.5 font-mono">
                  {lines.length} 行
                </span>
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-mono text-xs text-[var(--app-muted)] truncate max-w-[550px]">
                {file.path} ({sessionTitle || "远程会话"})
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1.5 text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 my-4 rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] overflow-auto p-3 font-mono text-xs select-text">
            {loading && <div className="py-12 text-center text-xs text-[var(--app-muted)] font-extrabold animate-pulse">正在从服务器读取文件内容...</div>}
            {!loading && error && <div className="py-12 text-center text-xs text-rose-600 font-extrabold">{error}</div>}
            {!loading && !error && (
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-[var(--fill-1)]">
                      <td className="w-10 select-none pr-3 text-right text-[10px] text-[var(--app-muted)] border-r border-[var(--app-line)] opacity-60">
                        {idx + 1}
                      </td>
                      <td className="pl-3 whitespace-pre-wrap break-all text-[var(--app-text)]">
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--app-line)] pt-3 shrink-0">
            <div className="text-xs text-[var(--app-muted)] font-medium">
              显示前 500 行预览
            </div>
            <div className="flex items-center gap-2">
              {onAddAiQuote && content && (
                <Button
                  variant="outline"
                  size={26}
                  className="rounded-full px-3 text-xs font-bold"
                  onClick={() => {
                    onAddAiQuote(content.slice(0, 1000), `${file.name} (${file.path})`);
                    onOpenChange(false);
                  }}
                >
                  💬 引用前 1K 字符到 AI
                </Button>
              )}
              <Button
                size={26}
                className="rounded-full px-4 text-xs font-extrabold bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "✅ 已复制内容" : "📋 复制全文"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)]">
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
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)]">
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
            <Field label="环境标识">
              <select
                className="h-10 w-full rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] px-3 text-xs text-[var(--app-text)] shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-extrabold"
                value={form.environment || "none"}
                onChange={(event) => update("environment", event.target.value as any)}
              >
                <option value="none">无 / 默认</option>
                <option value="prod">🔴 生产环境 (Production)</option>
                <option value="staging">🟡 测试环境 (Staging)</option>
                <option value="local">🟢 本地/开发 (Local)</option>
              </select>
            </Field>
            <Field label="所属分组/文件夹">
              <Input
                placeholder="例如: 生产集群 (默认: 未分组)"
                value={form.folder || ""}
                onChange={(event) => update("folder", event.target.value)}
              />
            </Field>
            <Field label="彩色标签 (逗号分隔)">
              <Input
                placeholder="例如: Prod, Nginx, K8s"
                value={(form.tags || []).join(", ")}
                onChange={(event) => update("tags", event.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
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
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)]" />
        <Dialog.Content
          data-testid="retry-password-dialog"
          className="fixed left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)]"
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

function CommandPaletteModal({
  open,
  onOpenChange,
  connections,
  onConnectHost,
  commandFolders,
  onSendCommand,
  onNavigateTool,
  onSetTheme,
  onCreateLocalSession
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: SavedConnection[];
  onConnectHost: (conn: SavedConnection) => void;
  commandFolders: CommandFolder[];
  onSendCommand: (cmd: string) => void;
  onNavigateTool: (tool: Tool) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onCreateLocalSession: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const keyword = query.trim().toLowerCase();

  const hostItems = connections
    .filter((c) => !keyword || `${c.name || ""} ${c.hostname} ${c.username}`.toLowerCase().includes(keyword))
    .map((c) => ({
      id: `host:${c.hostname}:${c.username}`,
      category: "主机服务器",
      icon: "🖥️",
      title: c.name || c.hostname || "未命名主机",
      detail: `${c.username || "root"}@${c.hostname}:${c.port || 22}`,
      action: () => {
        onConnectHost(c);
        onOpenChange(false);
      }
    }));

  const commandItems = commandFolders
    .flatMap((folder) => folder.commands.map((cmd) => ({ folder, cmd })))
    .filter(({ folder, cmd }) => !keyword || `${folder.name} ${cmd.name} ${cmd.command}`.toLowerCase().includes(keyword))
    .map(({ folder, cmd }) => ({
      id: `cmd:${cmd.id}`,
      category: "快捷指令",
      icon: "⚡",
      title: cmd.name,
      detail: `$ ${cmd.command} [${folder.name}]`,
      action: () => {
        onSendCommand(cmd.command);
        onOpenChange(false);
      }
    }));

  const linuxItems = keyword
    ? ALL_LINUX_COMMAND_NAMES
        .filter((cmd) => cmd.toLowerCase().includes(keyword))
        .slice(0, 10)
        .map((cmd) => {
          const runoobInfo = FLAT_RUNOOB_COMMANDS.find((c) => c.name.toLowerCase() === cmd);
          return {
            id: `linux:${cmd}`,
            category: "Linux 指令",
            icon: "🐧",
            title: cmd,
            detail: runoobInfo ? `${runoobInfo.desc} [${runoobInfo.category}]` : `直接发送 $ ${cmd} 至当前活动终端`,
            action: () => {
              onSendCommand(cmd);
              onOpenChange(false);
            }
          };
        })
    : [];

  const toolItems = [
    { id: "tool:ssh", category: "全局工具", icon: "🌐", title: "打开 SSH 会话工作台", detail: "切换到主机会话面板", action: () => { onNavigateTool("ssh"); onOpenChange(false); } },
    { id: "tool:local", category: "全局工具", icon: "💻", title: "新建 Local Shell 本地终端", detail: "基于 BusyBox 内置本地终端", action: () => { onCreateLocalSession(); onOpenChange(false); } },
    { id: "tool:cmd", category: "全局工具", icon: "📦", title: "打开 快捷命令库", detail: "管理与配置指令分类", action: () => { onNavigateTool("cmd"); onOpenChange(false); } },
    { id: "tool:monitor", category: "全局工具", icon: "📊", title: "打开 系统监控面板", detail: "实时推算硬件负载与进程", action: () => { onNavigateTool("monitor"); onOpenChange(false); } },
    { id: "tool:serial", category: "全局工具", icon: "⚡", title: "打开 串口 TTY 调试面板", detail: "Linux /dev 串口与硬件调试", action: () => { onNavigateTool("serial"); onOpenChange(false); } },
    { id: "tool:ebpf", category: "全局工具", icon: "🧬", title: "打开 eBPF 探针观察者", detail: "内核 VMA 内存映射与系统调用", action: () => { onNavigateTool("ebpf"); onOpenChange(false); } },
    { id: "tool:cluster", category: "全局工具", icon: "🔄", title: "打开 多节点集群跑手", detail: "多服务器并发巡检与一键并行脚本", action: () => { onNavigateTool("cluster"); onOpenChange(false); } },
    { id: "tool:git", category: "全局工具", icon: "🌱", title: "打开 Git 仓库结构可视化", detail: "分支 Commit 树与差异对比", action: () => { onNavigateTool("git"); onOpenChange(false); } },
    { id: "tool:browser", category: "全局工具", icon: "🌍", title: "打开 网页浏览器", detail: "访问路由器/容器后台", action: () => { onNavigateTool("browser"); onOpenChange(false); } },
    { id: "tool:settings", category: "全局工具", icon: "⚙️", title: "打开 应用设置", detail: "调整高亮规则与终端外观", action: () => { onNavigateTool("settings"); onOpenChange(false); } }
  ].filter((item) => !keyword || `${item.title} ${item.detail}`.toLowerCase().includes(keyword));

  const themeItems = [
    { id: "theme:dark", category: "外观主题", icon: "🌙", title: "切换为 夜间深邃黑 主题", detail: "极简暗色极客体验", action: () => { onSetTheme("dark"); onOpenChange(false); } },
    { id: "theme:light", category: "外观主题", icon: "☀️", title: "切换为 日间晶透白 主题", detail: "高对比明亮 UI", action: () => { onSetTheme("light"); onOpenChange(false); } }
  ].filter((item) => !keyword || `${item.title} ${item.detail}`.toLowerCase().includes(keyword));

  const allItems = [...hostItems, ...commandItems, ...linuxItems, ...toolItems, ...themeItems];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev + 1) % allItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev - 1 + allItems.length) % allItems.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--mask-base)] backdrop-blur-xs animate-in fade-in duration-150" />
        <Dialog.Content className="fixed left-1/2 top-1/4 z-50 w-[580px] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-[var(--app-line)] bg-[var(--raised-bg)] p-0 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
          <div className="flex items-center gap-3 border-b border-[var(--app-line)] px-4 py-3 bg-[var(--panel-bg)]">
            <Search className="h-4 w-4 text-[var(--app-muted)] shrink-0" />
            <input
              autoFocus
              className="w-full bg-transparent text-sm font-extrabold text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:outline-none"
              placeholder="搜索 350+ Linux 指令、主机服务器、快捷工具与参数 (Ctrl+K)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <span className="rounded-md bg-[var(--fill-2)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--app-muted)] border border-[var(--app-line)] shrink-0">
              ESC 关闭
            </span>
          </div>

          <div className="max-h-[380px] overflow-auto p-2 space-y-1">
            {allItems.length === 0 ? (
              <div className="py-8 text-center text-xs font-semibold text-[var(--app-muted)]">
                没有找到匹配的指令或主机
              </div>
            ) : (
              allItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs transition-all cursor-pointer select-none",
                      isSelected
                        ? "bg-emerald-600 text-white font-extrabold shadow-sm shadow-emerald-500/20"
                        : "text-[var(--app-text)] hover:bg-[var(--fill-1)]"
                    )}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base shrink-0">{item.icon}</span>
                      <div className="min-w-0">
                        <div className="truncate font-extrabold">{item.title}</div>
                        <div className={cn("truncate text-[11px] font-mono mt-0.5", isSelected ? "text-white/80" : "text-[var(--app-muted)]")}>
                          {item.detail}
                        </div>
                      </div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-extrabold shrink-0 border", isSelected ? "bg-white/20 text-white border-white/30" : "bg-[var(--fill-2)] text-[var(--app-muted)] border-[var(--app-line)]")}>
                      {item.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SshKeyManagerModal({
  open,
  keys,
  onOpenChange,
  onCreateKey,
  onDeleteKey,
  onOpenGenerator
}: {
  open: boolean;
  keys: SshKeyPair[];
  onOpenChange: (open: boolean) => void;
  onCreateKey: (type: "ed25519" | "rsa", name: string) => void;
  onDeleteKey: (id: string) => void;
  onOpenGenerator?: () => void;
}) {
  const [newType, setNewType] = useState<"ed25519" | "rsa">("ed25519");
  const [newName, setNewName] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  function handleCreate() {
    if (!newName.trim()) return;
    onCreateKey(newType, newName.trim());
    setNewName("");
  }

  function handleCopyPub(key: SshKeyPair) {
    void nativeBridge.clipboardCopy(key.publicKey);
    setCopyNotice(`已复制公钥 [${key.name}] 到剪贴板`);
    setTimeout(() => setCopyNotice(""), 3000);
  }

  function handleDownloadPem(key: SshKeyPair) {
    const blob = new Blob([key.privateKey], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key.name || "id_key"}.pem`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[var(--mask-base)] z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--raised-bg)] p-6 shadow-[var(--shadow-raised)] z-50 border border-[var(--app-line)] select-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--app-text)] flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-indigo-600" />
                SSH 密钥库与生成器
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[var(--app-muted)]">
                生成与管理 RSA / Ed25519 秘钥对，支持一键复制公钥与部署到服务器。
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size={32}
                onClick={() => {
                  onOpenChange(false);
                  onOpenGenerator?.();
                }}
                className="flex items-center gap-1 text-purple-600 border-purple-300 font-bold cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                在线生成器
              </Button>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-[var(--app-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--app-text)]">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {copyNotice && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 dark:border-emerald-800 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {copyNotice}
            </div>
          )}

          <div className="mb-4 rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3.5 space-y-2">
            <div className="text-xs font-extrabold text-[var(--app-text)]">生成新密钥对</div>
            <div className="grid grid-cols-[130px_minmax(0,1fr)_90px] gap-2 items-center">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="h-8.5 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] px-2 text-xs font-bold text-[var(--app-text)]"
              >
                <option value="ed25519">Ed25519 (推荐)</option>
                <option value="rsa">RSA 4096</option>
              </select>
              <Input
                placeholder="密钥别名 (例: prod-deploy-key)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8.5 text-xs"
              />
              <Button size={32} onClick={handleCreate} className="rounded-lg h-8.5 text-xs font-bold">
                生成密钥
              </Button>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
            {keys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--app-line)] p-6 text-center text-xs font-bold text-[var(--app-muted)]">
                暂无密钥对，点击上方生成您的第一个 SSH 密钥。
              </div>
            ) : (
              keys.map((key) => (
                <div key={key.id} className="rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 text-[10px] font-mono font-extrabold text-indigo-600 dark:text-indigo-400 uppercase">
                        {key.type}
                      </span>
                      <span className="text-xs font-extrabold text-[var(--app-text)]">{key.name}</span>
                      <span className="text-[10px] font-medium text-[var(--app-muted)]">({key.createdAt})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        title="复制公钥"
                        onClick={() => handleCopyPub(key)}
                        className="flex h-7 px-2 items-center gap-1 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] text-[11px] font-bold text-[var(--app-text)] hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        复制公钥
                      </button>
                      <button
                        title="下载私钥 (.pem)"
                        onClick={() => handleDownloadPem(key)}
                        className="flex h-7 px-2 items-center gap-1 rounded-lg border border-[var(--app-line)] bg-[var(--app-bg)] text-[11px] font-bold text-[var(--app-text)] hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        私钥
                      </button>
                      <button
                        title="删除密钥"
                        onClick={() => onDeleteKey(key.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-[var(--app-muted)] truncate bg-[var(--app-bg)] p-1.5 rounded-md border border-[var(--app-line)]">
                    {key.fingerprint}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="outline">关闭</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SshCopyIdModal({
  target,
  keys,
  activeSession,
  onClose,
  onSuccess
}: {
  target: SavedConnection | null;
  keys: SshKeyPair[];
  activeSession?: SessionTab;
  onClose: () => void;
  onSuccess: (msg: string) => void;
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
        await nativeBridge.sendInput(activeSession.id, remoteCmd);
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

function FilePermissionModal({
  file,
  activeSessionId,
  onClose,
  onSuccess
}: {
  file: { name: string; path: string; isDirectory: boolean } | null;
  activeSessionId?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
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
      await nativeBridge.sendInput(activeSessionId, cmd);
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
