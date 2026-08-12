import React, { useState } from "react";
import {
  X,
  Palette,
  Shield,
  Highlighter,
  Plus,
  Trash2,
  Check,
  ShieldAlert,
  FileText,
  Clock,
  Terminal,
  Pencil,
  Sun,
  Sparkles
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import {
  THEMES,
  TERMINAL_THEMES,
  terminalEnglishFonts,
  terminalChineseFonts,
  getTerminalAppearance,
  type ThemeMode,
  type TerminalThemeMode,
  type HighlightRule,
  type TerminalAppearance
} from "../../lib/terminalSettings";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: ThemeMode;
  terminalTheme?: TerminalThemeMode;
  terminalAppearance?: TerminalAppearance;
  terminalBackgroundImage?: string;
  terminalBackgroundOverlay?: number;
  commandSuggestionsEnabled?: boolean;
  dangerousCommandGuardEnabled?: boolean;
  highlightRules?: HighlightRule[];
  onThemeChange?: (theme: ThemeMode) => void;
  onTerminalThemeChange?: (theme: TerminalThemeMode) => void;
  onTerminalAppearanceChange?: (appearance: TerminalAppearance) => void;
  onTerminalBackgroundImageChange?: (value: string) => void;
  onTerminalBackgroundOverlayChange?: (value: number) => void;
  onCommandSuggestionsEnabledChange?: (value: boolean) => void;
  onDangerousCommandGuardEnabledChange?: (value: boolean) => void;
  onToggleHighlightRule?: (ruleId: string) => void;
  onAddHighlightRule?: (rule: Pick<HighlightRule, "name" | "pattern" | "foreground">) => void;
  onUpdateHighlightRule?: (ruleId: string, rule: Pick<HighlightRule, "name" | "pattern" | "foreground">) => void;
  onDeleteHighlightRule?: (ruleId: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = (props) => {
  const store = useAppStore();

  const theme = props.theme ?? store.theme;
  const terminalTheme = props.terminalTheme ?? store.terminalTheme;
  const terminalAppearance = props.terminalAppearance ?? store.terminalAppearance;
  const terminalBackgroundImage = props.terminalBackgroundImage ?? store.terminalBackgroundImage;
  const terminalBackgroundOverlay = props.terminalBackgroundOverlay ?? store.terminalBackgroundOverlay;
  const dangerousCommandGuardEnabled = props.dangerousCommandGuardEnabled ?? store.dangerousCommandGuardEnabled;
  const highlightRules = props.highlightRules ?? store.highlightRules;

  const setTheme = (t: ThemeMode) => (props.onThemeChange ? props.onThemeChange(t) : store.setTheme(t));
  const setTerminalTheme = (t: TerminalThemeMode) => (props.onTerminalThemeChange ? props.onTerminalThemeChange(t) : store.setTerminalTheme(t));
  const setTerminalAppearance = (app: TerminalAppearance) => {
    if (app.englishFont) window.localStorage.setItem("ldyssh.terminal.englishFont", app.englishFont);
    if (app.chineseFont) window.localStorage.setItem("ldyssh.terminal.chineseFont", app.chineseFont);
    if (app.fontSize) window.localStorage.setItem("ldyssh.terminal.fontSize", String(app.fontSize));
    props.onTerminalAppearanceChange ? props.onTerminalAppearanceChange(app) : store.setTerminalAppearance(app);
  };
  const setTerminalBackgroundImage = (img: string) => (props.onTerminalBackgroundImageChange ? props.onTerminalBackgroundImageChange(img) : store.setTerminalBackgroundImage(img));
  const setTerminalBackgroundOverlay = (o: number) => (props.onTerminalBackgroundOverlayChange ? props.onTerminalBackgroundOverlayChange(o) : store.setTerminalBackgroundOverlay(o));
  const setDangerousCommandGuardEnabled = (b: boolean) => (props.onDangerousCommandGuardEnabledChange ? props.onDangerousCommandGuardEnabledChange(b) : store.setDangerousCommandGuardEnabled(b));
  const toggleHighlightRule = (id: string) => (props.onToggleHighlightRule ? props.onToggleHighlightRule(id) : store.toggleHighlightRule(id));
  const addHighlightRule = (r: Pick<HighlightRule, "name" | "pattern" | "foreground">) => (props.onAddHighlightRule ? props.onAddHighlightRule(r) : store.addHighlightRule(r));
  const updateHighlightRule = (id: string, r: Pick<HighlightRule, "name" | "pattern" | "foreground">) => (props.onUpdateHighlightRule ? props.onUpdateHighlightRule(id, r) : store.updateHighlightRule(id, r));
  const deleteHighlightRule = (id: string) => (props.onDeleteHighlightRule ? props.onDeleteHighlightRule(id) : store.deleteHighlightRule(id));

  // 高亮规则编辑草稿
  const [hlDraft, setHlDraft] = useState({ name: "", pattern: "", foreground: "#00aa88" });
  const [editingHlId, setEditingHlId] = useState("");

  // 自定义高危规则草稿
  const [ruleName, setRuleName] = useState("");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleWarning, setRuleWarning] = useState("");

  if (!props.isOpen) return null;

  const resolvedAppearance = getTerminalAppearance(terminalAppearance);

  const handleSaveHl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hlDraft.name.trim() || !hlDraft.pattern.trim()) return;
    if (editingHlId) {
      updateHighlightRule(editingHlId, {
        name: hlDraft.name.trim(),
        pattern: hlDraft.pattern.trim(),
        foreground: hlDraft.foreground
      });
      setEditingHlId("");
    } else {
      addHighlightRule({
        name: hlDraft.name.trim(),
        pattern: hlDraft.pattern.trim(),
        foreground: hlDraft.foreground
      });
    }
    setHlDraft({ name: "", pattern: "", foreground: "#00aa88" });
  };

  const handleEditHl = (rule: HighlightRule) => {
    setEditingHlId(rule.id);
    setHlDraft({ name: rule.name, pattern: rule.pattern, foreground: rule.foreground });
  };

  const handleAddCustomDangerous = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !rulePattern.trim()) return;
    store.addCustomDangerousRule({
      name: ruleName.trim(),
      pattern: rulePattern.trim(),
      warningText: ruleWarning.trim() || "匹配自定义高危安全防护规则",
      enabled: true
    });
    setRuleName("");
    setRulePattern("");
    setRuleWarning("");
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTerminalBackgroundImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.currentTarget.value = "";
  };

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg,#12131a)] px-8 py-6 select-none">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Title bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-zinc-100 flex items-center gap-2">
              偏好设置与个性化 (Settings)
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              自定义外观主题、终端色彩字体、高危命令防护与正则高亮引擎。
            </p>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            返回主页
          </button>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-6">
          {/* 左栏：外观与高危防护 */}
          <div className="space-y-6">
            {/* 主题选择 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-400" /> 应用外观主题
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`rounded-xl border p-3 text-center text-xs transition-all ${
                      theme === t
                        ? "border-blue-500 bg-blue-500/10 font-bold text-blue-400"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {t === "dark" ? "夜间黑" : t === "nordic" ? "北欧灰" : "极简白"}
                  </button>
                ))}
              </div>

              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 pt-2 border-t border-zinc-800">
                <Terminal className="h-4 w-4 text-emerald-400" /> 终端配色方案
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {TERMINAL_THEMES.map((t) => (
                  <button
                    key={t}
                    data-testid={`terminal-theme-${t}`}
                    onClick={() => setTerminalTheme(t)}
                    className={`rounded-xl border p-3 text-center text-xs transition-all ${
                      terminalTheme === t
                        ? "border-emerald-500 bg-emerald-500/10 font-bold text-emerald-400"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {t === "dark" ? "曜石黑" : t === "nordic" ? "深海灰" : "浅色白"}
                  </button>
                ))}
              </div>

              {/* 字体与字号 */}
              <div className="pt-2 border-t border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span>字号大小</span>
                  <span className="font-mono text-blue-400">{resolvedAppearance.fontSize} px</span>
                </div>
                <input
                  aria-label="字号"
                  type="range"
                  min={11}
                  max={26}
                  value={resolvedAppearance.fontSize}
                  onChange={(e) => setTerminalAppearance({ ...terminalAppearance, fontSize: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg bg-zinc-800 accent-blue-500 cursor-pointer"
                />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-zinc-400 mb-1 block">英文排版字体</label>
                    <select
                      aria-label="英文排版字体"
                      role="listbox"
                      value={resolvedAppearance.englishFont}
                      onChange={(e) => setTerminalAppearance({ ...terminalAppearance, englishFont: e.target.value })}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
                    >
                      {terminalEnglishFonts.map((f) => (
                        <option
                          key={f.id}
                          value={f.value}
                          role="option"
                          aria-selected={f.value === resolvedAppearance.englishFont ? "true" : "false"}
                          onClick={() => setTerminalAppearance({ ...terminalAppearance, englishFont: f.value })}
                        >
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 mb-1 block">中文排版字体</label>
                    <select
                      aria-label="中文排版字体"
                      role="listbox"
                      value={resolvedAppearance.chineseFont}
                      onChange={(e) => setTerminalAppearance({ ...terminalAppearance, chineseFont: e.target.value })}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
                    >
                      {terminalChineseFonts.map((f) => (
                        <option
                          key={f.id}
                          value={f.value}
                          role="option"
                          aria-selected={f.value === resolvedAppearance.chineseFont ? "true" : "false"}
                          onClick={() => setTerminalAppearance({ ...terminalAppearance, chineseFont: f.value })}
                        >
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 背景图上传 */}
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors">
                    上传壁纸
                    <input
                      data-testid="terminal-background-upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleBackgroundUpload}
                    />
                  </label>
                  {terminalBackgroundImage && (
                    <button
                      onClick={() => setTerminalBackgroundImage("")}
                      className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      清除壁纸
                    </button>
                  )}
                </div>

                {terminalBackgroundImage && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>遮罩透明度</span>
                      <span>{terminalBackgroundOverlay}%</span>
                    </div>
                    <input
                      aria-label="背景遮罩透明度"
                      type="range"
                      min={0}
                      max={90}
                      value={terminalBackgroundOverlay}
                      onChange={(e) => setTerminalBackgroundOverlay(Number(e.target.value))}
                      className="w-full h-2 rounded-lg bg-zinc-800 accent-blue-500 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* 高危防护 */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-red-400" /> 高危命令防护
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">拦截 rm -rf /、reboot 等二次确认</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label="高危命令防护开关"
                    checked={dangerousCommandGuardEnabled}
                    onChange={(e) => setDangerousCommandGuardEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* 右栏：语法高亮与安全规则 */}
          <div className="space-y-6">
            {/* 语法高亮 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" /> 终端关键字正则高亮引擎
              </h3>

              <form onSubmit={handleSaveHl} className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)_48px_80px] gap-2.5">
                <input
                  type="text"
                  placeholder="规则名称"
                  value={hlDraft.name}
                  onChange={(e) => setHlDraft({ ...hlDraft, name: e.target.value })}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="正则表达式"
                  value={hlDraft.pattern}
                  onChange={(e) => setHlDraft({ ...hlDraft, pattern: e.target.value })}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="color"
                  aria-label="规则颜色"
                  value={hlDraft.foreground}
                  onChange={(e) => setHlDraft({ ...hlDraft, foreground: e.target.value })}
                  className="h-8 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-1 cursor-pointer"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> {editingHlId ? "保存" : "+ 添加"}
                </button>
              </form>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {highlightRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleHighlightRule(rule.id)}
                        className="rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="font-semibold text-zinc-200 truncate">{rule.name}</span>
                      <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono truncate max-w-[200px]">
                        {rule.pattern}
                      </code>
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: rule.foreground }} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditHl(rule)}
                        aria-label={`编辑${rule.name}`}
                        className="text-zinc-400 hover:text-blue-400 transition-colors p-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!rule.system && (
                        <button
                          onClick={() => deleteHighlightRule(rule.id)}
                          aria-label={`删除${rule.name}`}
                          className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 安全审计日志 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-blue-400" /> 安全审计日志 (Audit Log)
                </h4>
                {store.auditLogs.length > 0 && (
                  <button
                    onClick={store.clearAuditLogs}
                    className="text-[11px] text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    清空记录
                  </button>
                )}
              </div>

              {store.auditLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">暂无任何高危触发审计记录</div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {store.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-zinc-400 text-[11px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-semibold text-red-400">{log.patternName}</span>
                        <code className="rounded bg-red-950/40 px-1.5 py-0.5 text-red-300 font-mono text-[11px]">
                          {log.command}
                        </code>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          log.action === "intercepted_cancelled"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {log.action === "intercepted_cancelled" ? "已拦截撤回" : "强行发送"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
