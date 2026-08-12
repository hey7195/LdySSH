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
  Sparkles,
  Image as ImageIcon,
  Upload
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import {
  THEMES,
  TERMINAL_THEMES,
  PRESET_WALLPAPERS,
  terminalEnglishFonts,
  terminalChineseFonts,
  getTerminalAppearance,
  compressWallpaperImage,
  type ThemeMode,
  type TerminalThemeMode,
  type HighlightRule,
  type TerminalAppearance
} from "../../lib/terminalSettings";

import { clearCommandUsageMap } from "../../lib/terminalIntelliSense";

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
  const [clearNotice, setClearNotice] = useState(false);

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

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressWallpaperImage(file);
      if (compressedDataUrl) {
        setTerminalBackgroundImage(compressedDataUrl);
      }
    } catch (err) {
      console.error("Failed to process wallpaper image", err);
    }
    e.currentTarget.value = "";
  };

  return (
    <div className="h-full overflow-auto bg-[var(--app-bg)] text-[var(--app-text)] px-8 py-6 select-none transition-colors duration-200">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-[var(--app-line)] pb-4">
          <div>
            <h1 className="text-xl font-extrabold text-[var(--app-text)] flex items-center gap-2">
              偏好设置与个性化 (Settings)
            </h1>
            <p className="mt-1 text-xs text-[var(--app-muted)]">
              自定义外观主题、终端色彩字体、壁纸背景、高危命令防护与正则高亮引擎。
            </p>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-4 py-2 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--fill-2)] transition-colors cursor-pointer"
          >
            返回主页
          </button>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-6">
          {/* 左栏：外观与壁纸防护 */}
          <div className="space-y-6">
            {/* 主题选择 */}
            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-500" /> 应用外观主题
              </h3>
              <div className="grid grid-cols-3 gap-2.5">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs transition-all cursor-pointer ${
                      theme === t
                        ? "border-emerald-500 bg-emerald-500/10 font-extrabold text-emerald-500 shadow-sm ring-1 ring-emerald-500/30"
                        : "border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-muted)] hover:border-[var(--app-line)] hover:text-[var(--app-text)]"
                    }`}
                  >
                    <div className="flex items-center gap-1 h-3 w-10 rounded-full border border-black/10 overflow-hidden shadow-2xs">
                      <div className={`h-full flex-1 ${t === "dark" ? "bg-zinc-950" : t === "nordic" ? "bg-slate-800" : "bg-white"}`} />
                      <div className={`h-full w-2.5 ${t === "dark" ? "bg-emerald-500" : t === "nordic" ? "bg-sky-400" : "bg-emerald-600"}`} />
                    </div>
                    <span>{t === "dark" ? "夜间黑" : t === "nordic" ? "北欧灰" : "极简白"}</span>
                  </button>
                ))}
              </div>

              <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2 pt-2 border-t border-[var(--app-line)]">
                <Terminal className="h-4 w-4 text-emerald-500" /> 终端配色方案
              </h3>
              <div className="grid grid-cols-3 gap-2.5">
                {TERMINAL_THEMES.map((t) => (
                  <button
                    key={t}
                    data-testid={`terminal-theme-${t}`}
                    onClick={() => setTerminalTheme(t)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs transition-all cursor-pointer ${
                      terminalTheme === t
                        ? "border-emerald-500 bg-emerald-500/10 font-extrabold text-emerald-500 shadow-sm ring-1 ring-emerald-500/30"
                        : "border-[var(--app-line)] bg-[var(--fill-1)] text-[var(--app-muted)] hover:border-[var(--app-line)] hover:text-[var(--app-text)]"
                    }`}
                  >
                    <div className="flex items-center gap-1 h-3 w-10 rounded-full border border-black/10 overflow-hidden shadow-2xs">
                      <div className={`h-full flex-1 ${t === "dark" ? "bg-black" : t === "nordic" ? "bg-slate-900" : "bg-slate-100"}`} />
                      <div className={`h-full w-2.5 ${t === "dark" ? "bg-emerald-400" : t === "nordic" ? "bg-cyan-400" : "bg-emerald-600"}`} />
                    </div>
                    <span>{t === "dark" ? "曜石黑" : t === "nordic" ? "深海灰" : "浅色白"}</span>
                  </button>
                ))}
              </div>

              {/* 字体与字号 */}
              <div className="pt-2 border-t border-[var(--app-line)] space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--app-text)]">
                  <span>字号大小</span>
                  <span className="font-mono text-emerald-500 font-bold">{resolvedAppearance.fontSize} px</span>
                </div>
                <input
                  aria-label="字号"
                  type="range"
                  min={11}
                  max={26}
                  value={resolvedAppearance.fontSize}
                  onChange={(e) => setTerminalAppearance({ ...terminalAppearance, fontSize: Number(e.target.value) })}
                  className="w-full h-2 rounded-lg bg-[var(--fill-2)] accent-emerald-500 cursor-pointer"
                />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-[var(--app-muted)] mb-1 block">英文排版字体</label>
                    <select
                      aria-label="英文排版字体"
                      role="listbox"
                      value={resolvedAppearance.englishFont}
                      onChange={(e) => setTerminalAppearance({ ...terminalAppearance, englishFont: e.target.value })}
                      className="w-full rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:outline-none focus:border-emerald-500"
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
                    <label className="text-[11px] text-[var(--app-muted)] mb-1 block">中文排版字体</label>
                    <select
                      aria-label="中文排版字体"
                      role="listbox"
                      value={resolvedAppearance.chineseFont}
                      onChange={(e) => setTerminalAppearance({ ...terminalAppearance, chineseFont: e.target.value })}
                      className="w-full rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:outline-none focus:border-emerald-500"
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

              {/* 壁纸上传与实时预览卡片 */}
              <div className="pt-2 border-t border-[var(--app-line)] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-purple-500" /> 终端个性化壁纸
                  </h4>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-500 hover:bg-purple-500/20 transition-colors">
                    <Upload className="h-3.5 w-3.5" /> 上传壁纸
                    <input
                      data-testid="terminal-background-upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleBackgroundUpload}
                    />
                  </label>
                </div>

                {/* 4 款极客预设壁纸快捷选择卡 */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-[var(--app-muted)]">极客预设壁纸 (点击一键设置):</span>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_WALLPAPERS.filter((p) => p.url).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setTerminalBackgroundImage(preset.url)}
                        className={`group relative h-14 w-full overflow-hidden rounded-xl border transition-all cursor-pointer select-none ${
                          terminalBackgroundImage === preset.url
                            ? "border-purple-500 ring-2 ring-purple-500/40"
                            : "border-[var(--app-line)] hover:border-purple-500/60"
                        }`}
                      >
                        <img src={preset.url} alt={preset.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 transition-colors" />
                        <div className="absolute inset-0 flex items-center justify-center p-1 text-center">
                          <span className="text-[11px] font-extrabold text-white drop-shadow-md">{preset.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {terminalBackgroundImage ? (
                  <div className="space-y-3 rounded-xl border border-purple-500/30 bg-[var(--fill-1)] p-3">
                    {/* Live Image Preview Thumbnail Card */}
                    <div className="relative h-28 w-full overflow-hidden rounded-lg border border-[var(--app-line)] shadow-inner group">
                      <img
                        src={terminalBackgroundImage}
                        alt="终端壁纸预览"
                        className="h-full w-full object-cover"
                      />
                      {/* Live Tint Overlay */}
                      <div
                        className="absolute inset-0 transition-opacity"
                        style={{
                          backgroundColor: "#0a0a0c",
                          opacity: terminalBackgroundOverlay / 100
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col justify-between p-2.5">
                        <span className="self-start rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-md border border-emerald-500/30">
                          ✓ 已成功生效终端壁纸
                        </span>
                        <button
                          onClick={() => setTerminalBackgroundImage("")}
                          className="self-end rounded-lg bg-red-600/80 px-2.5 py-1 text-[10px] font-bold text-white shadow-md hover:bg-red-600 transition-colors cursor-pointer"
                        >
                          清除壁纸
                        </button>
                      </div>
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-[var(--app-text)]">
                        <span>遮罩纯色浓度 (调节壁纸显隐)</span>
                        <span className="font-mono text-purple-500 font-bold">{terminalBackgroundOverlay}%</span>
                      </div>
                      <input
                        aria-label="背景遮罩透明度"
                        type="range"
                        min={0}
                        max={90}
                        value={terminalBackgroundOverlay}
                        onChange={(e) => setTerminalBackgroundOverlay(Number(e.target.value))}
                        className="w-full h-2 rounded-lg bg-[var(--fill-2)] accent-purple-500 cursor-pointer"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--app-line)] bg-[var(--fill-1)] p-4 text-center text-xs text-[var(--app-muted)]">
                    未上传壁纸（点击右上角“上传壁纸”设置终端背景）
                  </div>
                )}
              </div>

              {/* 高危防护 */}
              <div className="pt-3 border-t border-[var(--app-line)] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-red-500" /> 高危命令防护
                  </h4>
                  <p className="text-[10px] text-[var(--app-muted)] mt-0.5">拦截 rm -rf /、reboot 等二次确认</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label="高危命令防护开关"
                    checked={dangerousCommandGuardEnabled}
                    onChange={(e) => setDangerousCommandGuardEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[var(--fill-3)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--app-line)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* 重置习惯历史 */}
              <div className="pt-3 border-t border-[var(--app-line)] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-amber-500" /> 命令习惯高频记忆
                  </h4>
                  <p className="text-[10px] text-[var(--app-muted)] mt-0.5">重置历史高频置顶排序与使用次数计数</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearCommandUsageMap();
                    setClearNotice(true);
                    setTimeout(() => setClearNotice(false), 2000);
                  }}
                  className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] hover:bg-[var(--fill-2)] px-3 py-1 text-xs font-bold text-[var(--app-text)] transition-colors cursor-pointer"
                >
                  {clearNotice ? "已重置习惯!" : "重置习惯历史"}
                </button>
              </div>
            </div>
          </div>

          {/* 右栏：语法高亮与安全规则 */}
          <div className="space-y-6">
            {/* 语法高亮 */}
            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" /> 终端关键字正则高亮引擎
              </h3>

              <form onSubmit={handleSaveHl} className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)_48px_80px] gap-2.5">
                <input
                  type="text"
                  placeholder="规则名称"
                  value={hlDraft.name}
                  onChange={(e) => setHlDraft({ ...hlDraft, name: e.target.value })}
                  className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-1.5 text-xs text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="正则表达式"
                  value={hlDraft.pattern}
                  onChange={(e) => setHlDraft({ ...hlDraft, pattern: e.target.value })}
                  className="rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-1.5 text-xs text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="color"
                  aria-label="规则颜色"
                  value={hlDraft.foreground}
                  onChange={(e) => setHlDraft({ ...hlDraft, foreground: e.target.value })}
                  className="h-8 w-full rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] p-1 cursor-pointer"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> {editingHlId ? "保存" : "+ 添加"}
                </button>
              </form>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {highlightRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--app-line)] bg-[var(--fill-1)] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleHighlightRule(rule.id)}
                        className="rounded border-[var(--app-line)] bg-[var(--fill-2)] text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <span className="font-semibold text-[var(--app-text)] truncate">{rule.name}</span>
                      <code className="rounded bg-[var(--fill-2)] px-1.5 py-0.5 text-[10px] text-[var(--app-muted)] font-mono truncate max-w-[200px]">
                        {rule.pattern}
                      </code>
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: rule.foreground }} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditHl(rule)}
                        aria-label={`编辑${rule.name}`}
                        className="text-[var(--app-muted)] hover:text-emerald-500 transition-colors p-1 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!rule.system && (
                        <button
                          onClick={() => deleteHighlightRule(rule.id)}
                          aria-label={`删除${rule.name}`}
                          className="text-[var(--app-muted)] hover:text-red-500 transition-colors p-1 cursor-pointer"
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
            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-emerald-500" /> 安全审计日志 (Audit Log)
                </h4>
                {store.auditLogs.length > 0 && (
                  <button
                    onClick={store.clearAuditLogs}
                    className="text-[11px] text-[var(--app-muted)] hover:text-red-500 transition-colors cursor-pointer"
                  >
                    清空记录
                  </button>
                )}
              </div>

              {store.auditLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--app-muted)]">暂无任何高危触发审计记录</div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {store.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--app-line)] bg-[var(--fill-1)] p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-[var(--app-muted)]" />
                        <span className="text-[var(--app-muted)] text-[11px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-semibold text-red-500">{log.patternName}</span>
                        <code className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-500 font-mono text-[11px]">
                          {log.command}
                        </code>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          log.action === "intercepted_cancelled"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-red-500/10 text-red-500"
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
