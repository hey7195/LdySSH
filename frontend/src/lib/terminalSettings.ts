import animeCyberCity from "../assets/wallpapers/anime_cyber_city.jpg";
import animeSunsetSkyline from "../assets/wallpapers/anime_sunset_skyline.jpg";
import animeStarryNight from "../assets/wallpapers/anime_starry_night.jpg";
import animeCozyRoom from "../assets/wallpapers/anime_cozy_room.jpg";
import animeShrineSakura from "../assets/wallpapers/anime_shrine_sakura.jpg";

export type ThemeMode = "light" | "dark" | "nordic";
export type TerminalThemeMode = "light" | "dark" | "nordic";

export interface TerminalAppearance {
  englishFont: string;
  chineseFont: string;
  fontSize: number;
  foreground: string;
  background: string;
  bgType?: "color" | "image";
  bgImageUrl?: string;
  bgOpacity?: number;
  bgBlur?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  copyOnSelect?: boolean;
  rightClickPaste?: boolean;
}

export interface PresetWallpaper {
  id: string;
  name: string;
  url: string;
}

export const PRESET_WALLPAPERS: PresetWallpaper[] = [
  { id: "none", name: "无壁纸 (纯色底纹)", url: "" },
  { id: "anime_cyber", name: "🌌 霓虹雨夜 (新海诚风)", url: animeCyberCity },
  { id: "anime_sunset", name: "🌸 晚霞樱花 (日落都市)", url: animeSunsetSkyline },
  { id: "anime_starry", name: "🌙 璀璨月夜 (紫海星空)", url: animeStarryNight },
  { id: "anime_cozy", name: "💻 极客书房 (雨夜猫咪)", url: animeCozyRoom },
  { id: "anime_shrine", name: "⛩️ 鸟居日出 (日式云海)", url: animeShrineSakura },
  { id: "cyberpunk", name: "🌆 赛博黑客 (Cyberpunk)", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80" },
  { id: "aurora", name: "🌌 深邃极光 (Aurora)", url: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1200&q=80" },
  { id: "obsidian", name: "🖤 黑曜晶石 (Obsidian)", url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80" }
];

export interface TerminalFontOption {
  id: string;
  name: string;
  value: string;
  family: string;
}

export const terminalEnglishFonts: TerminalFontOption[] = [
  { id: "Consola.ttf", name: "Consola.ttf", value: "Consola.ttf", family: "Consolas" },
  { id: "DejaVuSansMono-Bold.ttf", name: "DejaVuSansMono-Bold.ttf", value: "DejaVuSansMono-Bold.ttf", family: "DejaVu Sans Mono" },
  { id: "DejaVuSansMono.ttf", name: "DejaVuSansMono.ttf", value: "DejaVuSansMono.ttf", family: "DejaVu Sans Mono" },
  { id: "IBMPlexMono-Bold.ttf", name: "IBMPlexMono-Bold.ttf", value: "IBMPlexMono-Bold.ttf", family: "IBM Plex Mono" },
  { id: "IBMPlexMono-Medium.ttf", name: "IBMPlexMono-Medium.ttf", value: "IBMPlexMono-Medium.ttf", family: "IBM Plex Mono" },
  { id: "IBMPlexMono-Regular.ttf", name: "IBMPlexMono-Regular.ttf", value: "IBMPlexMono-Regular.ttf", family: "IBM Plex Mono" },
  { id: "Inconsolata.ttf", name: "Inconsolata.ttf", value: "Inconsolata.ttf", family: "Inconsolata" },
  { id: "JetBrainsMono.ttf", name: "JetBrainsMono.ttf", value: "JetBrainsMono.ttf", family: "JetBrains Mono" },
  { id: "NanumGothicCoding-Bold.ttf", name: "NanumGothicCoding-Bold.ttf", value: "NanumGothicCoding-Bold.ttf", family: "NanumGothicCoding" },
  { id: "NanumGothicCoding-Regular.ttf", name: "NanumGothicCoding-Regular.ttf", value: "NanumGothicCoding-Regular.ttf", family: "NanumGothicCoding" },
  { id: "NotoSansMono.ttf", name: "NotoSansMono.ttf", value: "NotoSansMono.ttf", family: "Noto Sans Mono" },
  { id: "NovaMono-Regular.ttf", name: "NovaMono-Regular.ttf", value: "NovaMono-Regular.ttf", family: "Nova Mono" },
  { id: "PTMono-Regular.ttf", name: "PTMono-Regular.ttf", value: "PTMono-Regular.ttf", family: "PT Mono" },
  { id: "RobotoMono.ttf", name: "RobotoMono.ttf", value: "RobotoMono.ttf", family: "Roboto Mono" },
  { id: "ShareTechMono-Regular.ttf", name: "ShareTechMono-Regular.ttf", value: "ShareTechMono-Regular.ttf", family: "Share Tech Mono" },
  { id: "SourceCodePro-Bold.ttf", name: "SourceCodePro-Bold.ttf", value: "SourceCodePro-Bold.ttf", family: "Source Code Pro" },
  { id: "SourceCodePro-Medium.ttf", name: "SourceCodePro-Medium.ttf", value: "SourceCodePro-Medium.ttf", family: "Source Code Pro" },
  { id: "SourceCodePro-Regular.ttf", name: "SourceCodePro-Regular.ttf", value: "SourceCodePro-Regular.ttf", family: "Source Code Pro" }
];

export const terminalChineseFonts: TerminalFontOption[] = [
  { id: "微软雅黑", name: "微软雅黑", value: "微软雅黑", family: "Microsoft YaHei" },
  { id: "宋体", name: "宋体", value: "宋体", family: "SimSun" },
  { id: "黑体", name: "黑体", value: "黑体", family: "SimHei" },
  { id: "楷体", name: "楷体", value: "楷体", family: "KaiTi" },
  { id: "仿宋", name: "仿宋", value: "仿宋", family: "FangSong" },
  { id: "新宋体", name: "新宋体", value: "新宋体", family: "NSimSun" },
  { id: "等线", name: "等线", value: "等线", family: "DengXian" },
  { id: "等线 Bold", name: "等线 Bold", value: "等线 Bold", family: "DengXian Bold" },
  { id: "等线 Light", name: "等线 Light", value: "等线 Light", family: "DengXian Light" }
];

export function resolveTerminalFont(options: TerminalFontOption[], value: string, defaultValue: string) {
  return options.find((option) => option.value === value) || options.find((option) => option.value === defaultValue) || options[0];
}

export function buildTerminalFontFamily(englishFontFamily: string, chineseFontFamily: string) {
  const fonts = [englishFontFamily, "Consolas", "Courier New", chineseFontFamily, "Microsoft YaHei", "monospace"];
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

export const defaultTerminalAppearance: TerminalAppearance = {
  englishFont: "JetBrainsMono.ttf",
  chineseFont: "微软雅黑",
  fontSize: 13,
  foreground: "",
  background: "",
  bgType: "color",
  bgImageUrl: "",
  bgOpacity: 0.95,
  bgBlur: 8,
  cursorStyle: "block",
  cursorBlink: true,
  copyOnSelect: true,
  rightClickPaste: true
};

export function getTerminalAppearance(appearance?: TerminalAppearance) {
  const englishFont = resolveTerminalFont(terminalEnglishFonts, appearance?.englishFont || "", defaultTerminalAppearance.englishFont);
  const chineseFont = resolveTerminalFont(terminalChineseFonts, appearance?.chineseFont || "", defaultTerminalAppearance.chineseFont);
  return {
    englishFont: englishFont.value,
    chineseFont: chineseFont.value,
    fontFamily: buildTerminalFontFamily(englishFont.family, chineseFont.family),
    fontSize: Number.isFinite(appearance?.fontSize) ? (appearance?.fontSize as number) : defaultTerminalAppearance.fontSize,
    foreground: appearance?.foreground,
    background: appearance?.background,
    bgType: appearance?.bgType || "color",
    bgImageUrl: appearance?.bgImageUrl || "",
    bgOpacity: typeof appearance?.bgOpacity === "number" ? appearance.bgOpacity : 0.95,
    bgBlur: typeof appearance?.bgBlur === "number" ? appearance.bgBlur : 8,
    cursorStyle: appearance?.cursorStyle || "block",
    cursorBlink: typeof appearance?.cursorBlink === "boolean" ? appearance.cursorBlink : true,
    copyOnSelect: typeof appearance?.copyOnSelect === "boolean" ? appearance.copyOnSelect : true,
    rightClickPaste: typeof appearance?.rightClickPaste === "boolean" ? appearance.rightClickPaste : true
  };
}

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

// 规则数组引用不变时复用编译结果,避免每条终端输出都重新 filter/sort/编译正则
let compiledHighlightRulesCache: { rules: HighlightRule[]; compiled: CompiledHighlightRule[] } | null = null;

function getCompiledHighlightRules(rules: HighlightRule[]) {
  if (compiledHighlightRulesCache?.rules === rules) {
    return compiledHighlightRulesCache.compiled;
  }
  const compiled = rules
    .filter((rule) => rule.enabled && (rule.scope === "terminal" || rule.scope === "all"))
    .sort((left, right) => left.priority - right.priority)
    .map((rule) => ({ rule, regex: createRegex(rule) }))
    .filter((entry): entry is CompiledHighlightRule => Boolean(entry.regex));
  compiledHighlightRulesCache = { rules, compiled };
  return compiled;
}

export function applyHighlightRules(text: string, rules: HighlightRule[]) {
  if (!text || rules.length === 0) return text;

  const compiled = getCompiledHighlightRules(rules);

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

export function colorToRgbParts(color: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec((color || "").trim());
  if (!match) return "10, 10, 12";
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ].join(", ");
}

export function buildTerminalBackgroundImage(backgroundImage: string, backgroundColor: string, overlayAlpha: number) {
  if (!backgroundImage) return undefined;
  const rgb = colorToRgbParts(backgroundColor);
  const cleanUrl = backgroundImage.trim().replace(/^url\((.*)\)$/i, "$1").replace(/^["']|["']$/g, "");
  return `linear-gradient(rgba(${rgb}, ${overlayAlpha}), rgba(${rgb}, ${overlayAlpha})), url("${cleanUrl}")`;
}

export function compressWallpaperImage(file: File, maxWidth = 1920, maxHeight = 1080, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) return resolve("");
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
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
