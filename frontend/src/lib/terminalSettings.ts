export type ThemeMode = "light" | "dark";
export type TerminalThemeMode = "light" | "dark";

export interface HighlightRule {
  id: string;
  name: string;
  pattern: string;
  flags: string;
  enabled: boolean;
  scope: "terminal" | "ai" | "all";
  foreground: string;
  background?: string;
  fontWeight?: "normal" | "bold";
  priority: number;
  system?: boolean;
}

export const THEMES: ThemeMode[] = ["light", "dark"];
export const TERMINAL_THEMES: TerminalThemeMode[] = ["dark", "light"];
export const DEFAULT_TERMINAL_THEME: TerminalThemeMode = "dark";

export const DEFAULT_HIGHLIGHT_RULES: HighlightRule[] = [
  {
    id: "error",
    name: "错误",
    pattern: "\\b(ERROR|ERR|FATAL|Exception|Traceback|failed|failure|panic|crash|ANR|Segmentation fault|No such file or directory|not found|失败)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#dc2626",
    background: "#fee2e2",
    fontWeight: "bold",
    priority: 10,
    system: true
  },
  {
    id: "warn",
    name: "警告",
    pattern: "\\b(WARN|WARNING|deprecated|skipped|警告)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#d97706",
    background: "#fef3c7",
    fontWeight: "bold",
    priority: 20,
    system: true
  },
  {
    id: "permission",
    name: "权限拒绝",
    pattern: "\\b(Permission denied|Access denied|Operation not permitted|Read-only file system|unauthorized|no permissions)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#b91c1c",
    background: "#fee2e2",
    fontWeight: "bold",
    priority: 25,
    system: true
  },
  {
    id: "service-state",
    name: "Linux 服务状态",
    pattern: "\\bactive \\(running\\)|\\binactive \\(dead\\)|\\b(?:enabled|disabled|running|exited|dead)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#16a34a",
    background: "#dcfce7",
    fontWeight: "bold",
    priority: 30,
    system: true
  },
  {
    id: "adb-device",
    name: "ADB 设备",
    pattern: "\\b(?:[A-Za-z0-9._-]+|(?:\\d{1,3}\\.){3}\\d{1,3}:\\d{2,5})\\s+(?:device|offline|unauthorized|no permissions)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#0891b2",
    background: "#cffafe",
    fontWeight: "bold",
    priority: 35,
    system: true
  },
  {
    id: "ip",
    name: "IP 地址",
    pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#2563eb",
    priority: 40,
    system: true
  },
  {
    id: "url",
    name: "URL",
    pattern: "https?://[^\\s]+",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#7c3aed",
    priority: 50,
    system: true
  },
  {
    id: "http-5xx",
    name: "HTTP 5xx",
    pattern: "\\bHTTP/[0-9.]+\\s+5\\d{2}\\b|\\b5\\d{2}\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#be123c",
    background: "#ffe4e6",
    fontWeight: "bold",
    priority: 60,
    system: true
  },
  {
    id: "path",
    name: "路径",
    pattern: "([A-Za-z]:\\\\[^\\s]+|/(?:[^\\s:]+/?)+)",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#0f766e",
    priority: 70,
    system: true
  },
  {
    id: "duration",
    name: "耗时",
    pattern: "\\b\\d+(?:\\.\\d+)?\\s*(?:ms|s|timeout)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#ea580c",
    priority: 80,
    system: true
  },
  {
    id: "package-command",
    name: "包管理命令",
    pattern: "\\b(?:apt-get|apt-cache|firewall-cmd|journalctl|systemctl|setenforce|getenforce|semanage|iptables|netstat|service|dpkg|dnf|rpm|yum|apt|lsof|ss)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#0d9488",
    background: "#ccfbf1",
    fontWeight: "bold",
    priority: 90,
    system: true
  },
  {
    id: "port",
    name: "端口",
    pattern: "\\b(?:port\\s+|listen\\s+|listening\\s+on\\s+)\\d{2,5}\\b|:\\d{2,5}\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#9333ea",
    priority: 100,
    system: true
  },
  {
    id: "android-package",
    name: "Android 包名",
    pattern: "\\b(?:[A-Za-z_][\\w]*\\.){2,}[A-Za-z_][\\w]*\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#2563eb",
    background: "#dbeafe",
    priority: 110,
    system: true
  },
  {
    id: "process-id",
    name: "进程 ID",
    pattern: "\\b(?:pid|ppid|tid|uid|gid)[:= ]+\\d+\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#ca8a04",
    priority: 120,
    system: true
  }
];

type CompiledHighlightRule = { rule: HighlightRule; regex: RegExp };
type HighlightMatch = { start: number; end: number; prefix: string };

const terminalControlSequencePattern = "\\x1b\\[[0-9;?]*[ -/]*[@-~]|\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)";
const terminalControlSequenceSplitter = new RegExp(`(${terminalControlSequencePattern})`, "g");
const terminalControlSequenceExact = new RegExp(`^(?:${terminalControlSequencePattern})$`);

export function applyHighlightRules(text: string, rules: HighlightRule[]) {
  if (!text || rules.length === 0) return text;

  const compiled = rules
    .filter((rule) => rule.enabled && (rule.scope === "terminal" || rule.scope === "all"))
    .sort((left, right) => left.priority - right.priority)
    .map((rule) => ({ rule, regex: createRegex(rule) }))
    .filter((entry): entry is { rule: HighlightRule; regex: RegExp } => Boolean(entry.regex));

  if (compiled.length === 0) return text;

  return text
    .split(/(\r?\n)/)
    .map((part) => {
      if (part === "\n" || part === "\r\n") return part;
      return part
        .split(terminalControlSequenceSplitter)
        .map((segment) => {
          if (!segment || terminalControlSequenceExact.test(segment)) return segment;
          return highlightPlainTerminalSegment(segment, compiled);
        })
        .join("");
    })
    .join("");
}

function highlightPlainTerminalSegment(part: string, compiled: CompiledHighlightRule[]) {
  const matches: HighlightMatch[] = [];
  const occupied = new Array<boolean>(part.length).fill(false);

  for (const entry of compiled) {
    entry.regex.lastIndex = 0;
    const prefix = toAnsiPrefix(entry.rule);
    if (!prefix) continue;

    let match: RegExpExecArray | null;
    while ((match = entry.regex.exec(part))) {
      if (!match[0]) {
        entry.regex.lastIndex += 1;
        continue;
      }

      const start = match.index;
      const end = start + match[0].length;
      if (!isRangeFree(occupied, start, end)) continue;

      for (let index = start; index < end; index += 1) {
        occupied[index] = true;
      }
      matches.push({ start, end, prefix });
    }
  }

  if (matches.length === 0) return part;

  matches.sort((left, right) => left.start - right.start);
  let output = "";
  let cursor = 0;
  matches.forEach((match) => {
    output += part.slice(cursor, match.start);
    output += `${match.prefix}${part.slice(match.start, match.end)}\x1b[0m`;
    cursor = match.end;
  });
  return `${output}${part.slice(cursor)}`;
}

function isRangeFree(occupied: boolean[], start: number, end: number) {
  for (let index = start; index < end; index += 1) {
    if (occupied[index]) return false;
  }
  return true;
}

export function getThemeAttribute(theme: ThemeMode) {
  return theme;
}

export function getTerminalTheme(theme: TerminalThemeMode, translucent = false) {
  if (theme === "dark") {
    return {
      background: translucent ? "rgba(2, 6, 23, 0.82)" : "#020617",
      foreground: "#e5e7eb",
      cursor: "#93c5fd",
      selectionBackground: "#334155"
    };
  }

  return {
    background: translucent ? "rgba(255, 255, 255, 0.86)" : "#ffffff",
    foreground: "#1f2937",
    cursor: "#2563eb",
    selectionBackground: "#dbeafe"
  };
}

function createRegex(rule: HighlightRule) {
  try {
    const flags = rule.flags.includes("g") ? rule.flags : `${rule.flags}g`;
    return new RegExp(rule.pattern, flags);
  } catch {
    return null;
  }
}

function toAnsiPrefix(rule: HighlightRule) {
  const codes: string[] = [];
  if (rule.fontWeight === "bold") codes.push("1");

  const foreground = parseHexColor(rule.foreground);
  if (foreground) codes.push(`38;2;${foreground.join(";")}`);

  const background = parseHexColor(rule.background || "");
  if (background) codes.push(`48;2;${background.join(";")}`);

  return codes.length ? `\x1b[${codes.join(";")}m` : "";
}

function parseHexColor(value: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ] as const;
}
