export type ThemeMode = "light" | "dark" | "nordic";
export type TerminalThemeMode = "light" | "dark" | "nordic";

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

export const THEMES: ThemeMode[] = ["dark", "nordic", "light"];
export const TERMINAL_THEMES: TerminalThemeMode[] = ["dark", "nordic", "light"];
export const DEFAULT_THEME: ThemeMode = "dark";
export const DEFAULT_TERMINAL_THEME: TerminalThemeMode = "dark";

export const DEFAULT_HIGHLIGHT_RULES: HighlightRule[] = [
  {
    id: "error",
    name: "错误与崩溃",
    pattern: "\\b(ERROR|ERR|FATAL|Exception|Traceback|failed|failure|panic|crash|ANR|Segmentation fault|No such file or directory|not found|失败)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#ef4444",
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
    foreground: "#f59e0b",
    fontWeight: "bold",
    priority: 20,
    system: true
  },
  {
    id: "logcat-error",
    name: "Logcat E 错误",
    pattern: "\\s+E\\s+|\\bE/[A-Za-z0-9_.-]+",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#ef4444",
    fontWeight: "bold",
    priority: 22,
    system: true
  },
  {
    id: "logcat-warn",
    name: "Logcat W 警告",
    pattern: "\\s+W\\s+|\\bW/[A-Za-z0-9_.-]+",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#fb923c",
    fontWeight: "bold",
    priority: 23,
    system: true
  },
  {
    id: "logcat-info",
    name: "Logcat I 信息",
    pattern: "\\s+I\\s+|\\bI/[A-Za-z0-9_.-]+",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#10b981",
    fontWeight: "bold",
    priority: 24,
    system: true
  },
  {
    id: "logcat-debug",
    name: "Logcat D 调试",
    pattern: "\\s+D\\s+|\\bD/[A-Za-z0-9_.-]+",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#38bdf8",
    fontWeight: "bold",
    priority: 25,
    system: true
  },
  {
    id: "permission",
    name: "权限拒绝",
    pattern: "\\b(Permission denied|Access denied|Operation not permitted|Read-only file system|unauthorized|no permissions)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#f87171",
    fontWeight: "bold",
    priority: 26,
    system: true
  },
  {
    id: "service-state",
    name: "Linux 服务状态",
    pattern: "\\bactive \\(running\\)|\\binactive \\(dead\\)|\\b(?:enabled|disabled|running|exited|dead)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#10b981",
    fontWeight: "bold",
    priority: 30,
    system: true
  },
  {
    id: "android-package",
    name: "Android 包名",
    pattern: "\\b(?:com|org|net|io|android|cn|de|uk|gov)\\.[a-zA-Z0-9_]+(?:\\.[a-zA-Z0-9_]+)+\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#38bdf8",
    priority: 35,
    system: true
  },
  {
    id: "cpp-source",
    name: "源码文件与行号",
    pattern: "\\b[a-zA-Z0-9_.-]+\\.(?:cpp|cc|c|h|hpp|py|js|ts|go|rs):?\\(?\\d*\\)?\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#2dd4bf",
    priority: 38,
    system: true
  },
  {
    id: "ip",
    name: "IP 地址",
    pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#60a5fa",
    priority: 40,
    system: true
  },
  {
    id: "json-key",
    name: "JSON 属性键",
    pattern: "\"[a-zA-Z0-9_]+\"\\s*:",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#c084fc",
    priority: 45,
    system: true
  },
  {
    id: "url",
    name: "URL 链接",
    pattern: "https?://[^\\s]+",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#c084fc",
    priority: 50,
    system: true
  },
  {
    id: "http-5xx",
    name: "HTTP 5xx 响应",
    pattern: "\\bHTTP/[0-9.]+\\s+5\\d{2}\\b|\\b5\\d{2}\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#f43f5e",
    fontWeight: "bold",
    priority: 60,
    system: true
  },
  {
    id: "path",
    name: "文件路径",
    pattern: "([A-Za-z]:\\\\[^\\s]+|/(?:[^\\s:]+/?)+)",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#2dd4bf",
    priority: 70,
    system: true
  },
  {
    id: "log-timestamp",
    name: "日志时间戳",
    pattern: "\\b\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\.\\d{3}\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#94a3b8",
    priority: 75,
    system: true
  },
  {
    id: "duration",
    name: "耗时与超时",
    pattern: "\\b\\d+(?:\\.\\d+)?\\s*(?:ms|s|timeout)\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#fb923c",
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
    foreground: "#38bdf8",
    fontWeight: "bold",
    priority: 90,
    system: true
  },
  {
    id: "port",
    name: "网络端口",
    pattern: "\\b(?:port\\s+|listen\\s+|listening\\s+on\\s+)\\d{2,5}\\b|:\\d{2,5}\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#a855f7",
    priority: 100,
    system: true
  },
  {
    id: "process-id",
    name: "进程与线程 ID",
    pattern: "\\b(?:pid|ppid|tid|uid|gid)[:= ]+\\d+\\b",
    flags: "gi",
    enabled: true,
    scope: "terminal",
    foreground: "#eab308",
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

export function getThemeInfo(mode: ThemeMode) {
  switch (mode) {
    case "dark":
      return { name: "夜间深邃黑", icon: "🌙", tag: "曜石纯黑" };
    case "nordic":
      return { name: "极光石墨灰", icon: "❄️", tag: "冷调深灰" };
    case "light":
      return { name: "日间晶透白", icon: "☀️", tag: "晶透纯白" };
  }
}

export function getTerminalTheme(theme: TerminalThemeMode, translucent = false) {
  if (theme === "nordic") {
    return {
      background: translucent ? "rgba(11, 19, 41, 0.88)" : "#0b1329",
      foreground: "#e0f2fe",
      cursor: "#38bdf8",
      selectionBackground: "#1e3a8a"
    };
  }
  if (theme === "dark") {
    return {
      background: translucent ? "rgba(10, 10, 12, 0.88)" : "#0a0a0c",
      foreground: "#f0f4ff",
      cursor: "#818cf8",
      selectionBackground: "#312e81"
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
