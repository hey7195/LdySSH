import { create } from "zustand";
import {
  DEFAULT_HIGHLIGHT_RULES,
  DEFAULT_TERMINAL_THEME,
  DEFAULT_THEME,
  defaultTerminalAppearance,
  type HighlightRule,
  type TerminalAppearance,
  type TerminalThemeMode,
  type ThemeMode
} from "../lib/terminalSettings";
import {
  type AuditLogRecord,
  type CustomDangerousRule
} from "../lib/commandSuggestions";

const STORAGE_KEYS = {
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
  customDangerousRules: "ldyssh.terminal.customDangerousRules",
  auditLogs: "ldyssh.security.auditLogs",
  highlightRules: "ldyssh.terminal.highlightRules"
};

function getStoredJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setStoredJSON<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略 localStorage 写入异常
  }
}

interface AppState {
  theme: ThemeMode;
  terminalTheme: TerminalThemeMode;
  terminalAppearance: TerminalAppearance;
  terminalBackgroundImage: string;
  terminalBackgroundOverlay: number;
  commandSuggestionsEnabled: boolean;
  dangerousCommandGuardEnabled: boolean;
  customDangerousRules: CustomDangerousRule[];
  auditLogs: AuditLogRecord[];
  highlightRules: HighlightRule[];

  setTheme: (theme: ThemeMode) => void;
  setTerminalTheme: (theme: TerminalThemeMode) => void;
  setTerminalAppearance: (appearance: TerminalAppearance) => void;
  setTerminalBackgroundImage: (image: string) => void;
  setTerminalBackgroundOverlay: (overlay: number) => void;
  setCommandSuggestionsEnabled: (enabled: boolean) => void;
  setDangerousCommandGuardEnabled: (enabled: boolean) => void;
  addCustomDangerousRule: (rule: Omit<CustomDangerousRule, "id">) => void;
  updateCustomDangerousRule: (id: string, rule: Partial<CustomDangerousRule>) => void;
  deleteCustomDangerousRule: (id: string) => void;
  addAuditLogRecord: (record: Omit<AuditLogRecord, "id" | "timestamp">) => void;
  clearAuditLogs: () => void;
  toggleHighlightRule: (id: string) => void;
  addHighlightRule: (rule: Pick<HighlightRule, "name" | "pattern" | "foreground">) => void;
  updateHighlightRule: (id: string, rule: Pick<HighlightRule, "name" | "pattern" | "foreground">) => void;
  deleteHighlightRule: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (window.localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode) || DEFAULT_THEME,
  terminalTheme: (window.localStorage.getItem(STORAGE_KEYS.terminalTheme) as TerminalThemeMode) || DEFAULT_TERMINAL_THEME,
  terminalAppearance: {
    englishFont: window.localStorage.getItem(STORAGE_KEYS.terminalEnglishFont) || "JetBrainsMono.ttf",
    chineseFont: window.localStorage.getItem(STORAGE_KEYS.terminalChineseFont) || "微软雅黑",
    fontSize: Number(window.localStorage.getItem(STORAGE_KEYS.terminalFontSize) || 13),
    foreground: window.localStorage.getItem(STORAGE_KEYS.terminalForeground) || "",
    background: window.localStorage.getItem(STORAGE_KEYS.terminalBackground) || ""
  },
  terminalBackgroundImage: window.localStorage.getItem(STORAGE_KEYS.terminalBackgroundImage) || "",
  terminalBackgroundOverlay: Number(window.localStorage.getItem(STORAGE_KEYS.terminalBackgroundOverlay) || 50),
  commandSuggestionsEnabled: window.localStorage.getItem(STORAGE_KEYS.commandSuggestionsEnabled) !== "false",
  dangerousCommandGuardEnabled: window.localStorage.getItem(STORAGE_KEYS.dangerousCommandGuardEnabled) !== "false",
  customDangerousRules: getStoredJSON<CustomDangerousRule[]>(STORAGE_KEYS.customDangerousRules, [
    {
      id: "drop-db",
      name: "删库 SQL 指令拦截",
      pattern: "\\b(DROP\\s+DATABASE|DROP\\s+TABLE|TRUNCATE\\s+TABLE)\\b",
      warningText: "该 SQL 命令包含 DROP / TRUNCATE 删库清表操作，将导致数据库数据永久注销丢失！",
      enabled: true
    }
  ]),
  auditLogs: getStoredJSON<AuditLogRecord[]>(STORAGE_KEYS.auditLogs, []),
  highlightRules: getStoredJSON<HighlightRule[]>(STORAGE_KEYS.highlightRules, DEFAULT_HIGHLIGHT_RULES),

  setTheme: (theme) => {
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
  },
  setTerminalTheme: (terminalTheme) => {
    window.localStorage.setItem(STORAGE_KEYS.terminalTheme, terminalTheme);
    set({ terminalTheme });
  },
  setTerminalAppearance: (appearance) => {
    window.localStorage.setItem(STORAGE_KEYS.terminalEnglishFont, appearance.englishFont);
    window.localStorage.setItem(STORAGE_KEYS.terminalChineseFont, appearance.chineseFont);
    window.localStorage.setItem(STORAGE_KEYS.terminalFontSize, String(appearance.fontSize));
    set({ terminalAppearance: appearance });
  },
  setTerminalBackgroundImage: (image) => {
    if (image) {
      window.localStorage.setItem(STORAGE_KEYS.terminalBackgroundImage, image);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.terminalBackgroundImage);
    }
    set({ terminalBackgroundImage: image });
  },
  setTerminalBackgroundOverlay: (overlay) => {
    window.localStorage.setItem(STORAGE_KEYS.terminalBackgroundOverlay, String(overlay));
    set({ terminalBackgroundOverlay: overlay });
  },
  setCommandSuggestionsEnabled: (enabled) => {
    window.localStorage.setItem(STORAGE_KEYS.commandSuggestionsEnabled, String(enabled));
    set({ commandSuggestionsEnabled: enabled });
  },
  setDangerousCommandGuardEnabled: (enabled) => {
    window.localStorage.setItem(STORAGE_KEYS.dangerousCommandGuardEnabled, String(enabled));
    set({ dangerousCommandGuardEnabled: enabled });
  },
  addCustomDangerousRule: (rule) => {
    const newRule: CustomDangerousRule = { ...rule, id: `custom-rule-${Date.now()}` };
    const next = [newRule, ...get().customDangerousRules];
    setStoredJSON(STORAGE_KEYS.customDangerousRules, next);
    set({ customDangerousRules: next });
  },
  updateCustomDangerousRule: (id, partial) => {
    const next = get().customDangerousRules.map((r) => (r.id === id ? { ...r, ...partial } : r));
    setStoredJSON(STORAGE_KEYS.customDangerousRules, next);
    set({ customDangerousRules: next });
  },
  deleteCustomDangerousRule: (id) => {
    const next = get().customDangerousRules.filter((r) => r.id !== id);
    setStoredJSON(STORAGE_KEYS.customDangerousRules, next);
    set({ customDangerousRules: next });
  },
  addAuditLogRecord: (record) => {
    const newLog: AuditLogRecord = { ...record, id: `audit-${Date.now()}`, timestamp: Date.now() };
    const next = [newLog, ...get().auditLogs].slice(0, 200); // 保留最新 200 条
    setStoredJSON(STORAGE_KEYS.auditLogs, next);
    set({ auditLogs: next });
  },
  clearAuditLogs: () => {
    setStoredJSON(STORAGE_KEYS.auditLogs, []);
    set({ auditLogs: [] });
  },
  toggleHighlightRule: (id) => {
    const next = get().highlightRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setStoredJSON(STORAGE_KEYS.highlightRules, next);
    set({ highlightRules: next });
  },
  addHighlightRule: (rule) => {
    const newRule: HighlightRule = {
      id: `rule-${Date.now()}`,
      name: rule.name,
      pattern: rule.pattern,
      flags: "gi",
      enabled: true,
      scope: "terminal",
      foreground: rule.foreground,
      priority: 100
    };
    const next = [newRule, ...get().highlightRules];
    setStoredJSON(STORAGE_KEYS.highlightRules, next);
    set({ highlightRules: next });
  },
  updateHighlightRule: (id, rule) => {
    const next = get().highlightRules.map((r) => (r.id === id ? { ...r, name: rule.name, pattern: rule.pattern, foreground: rule.foreground } : r));
    setStoredJSON(STORAGE_KEYS.highlightRules, next);
    set({ highlightRules: next });
  },
  deleteHighlightRule: (id) => {
    const next = get().highlightRules.filter((r) => !r.system && r.id !== id);
    setStoredJSON(STORAGE_KEYS.highlightRules, next);
    set({ highlightRules: next });
  }
}));
