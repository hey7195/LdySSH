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
    pattern: "\\b(ERROR|FATAL|Exception|failed|失败)\\b",
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
    pattern: "\\b(WARN|WARNING|警告)\\b",
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
    id: "ip",
    name: "IP 地址",
    pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#2563eb",
    priority: 30,
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
    priority: 40,
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
    priority: 50,
    system: true
  },
  {
    id: "path",
    name: "路径",
    pattern: "([A-Za-z]:\\\\[^\\s]+|/[^\\s]+)",
    flags: "g",
    enabled: true,
    scope: "terminal",
    foreground: "#0f766e",
    priority: 60,
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
    priority: 70,
    system: true
  }
];

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
      for (const entry of compiled) {
        entry.regex.lastIndex = 0;
        if (!entry.regex.test(part)) continue;
        entry.regex.lastIndex = 0;
        const prefix = toAnsiPrefix(entry.rule);
        if (!prefix) return part;
        return part.replace(entry.regex, (match) => `${prefix}${match}\x1b[0m`);
      }
      return part;
    })
    .join("");
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
