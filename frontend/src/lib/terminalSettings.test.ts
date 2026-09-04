import { describe, expect, test } from "vitest";
import {
  DEFAULT_TERMINAL_THEME,
  DEFAULT_HIGHLIGHT_RULES,
  applyHighlightRules,
  decodeLessHexUtf8,
  normalizeTerminalInverseVideo,
  getTerminalTheme,
  getThemeAttribute,
  THEMES,
  type HighlightRule
} from "./terminalSettings";

const errorRule: HighlightRule = {
  id: "error",
  name: "错误",
  pattern: "ERROR|failed",
  flags: "gi",
  enabled: true,
  scope: "terminal",
  foreground: "#dc2626",
  background: "#fee2e2",
  fontWeight: "bold",
  priority: 10
};

describe("terminal highlight settings", () => {
  test("ships with practical default highlight rules", () => {
    expect(DEFAULT_HIGHLIGHT_RULES.map((rule) => rule.name)).toEqual([
      "错误与崩溃",
      "警告",
      "Logcat E 错误",
      "Logcat W 警告",
      "Logcat I 信息",
      "Logcat D 调试",
      "权限拒绝",
      "Linux 服务状态",
      "Android 包名",
      "源码文件与行号",
      "IP 地址",
      "JSON 属性键",
      "URL 链接",
      "HTTP 5xx 响应",
      "文件路径",
      "日志时间戳",
      "耗时与超时",
      "包管理命令",
      "网络端口",
      "进程与线程 ID"
    ]);
  });

  test("highlights Ubuntu CentOS and ADB terminal output", () => {
    const highlighted = applyHighlightRules(
      [
        "apt-get install nginx",
        "systemctl status nginx active (running)",
        "cat /data/local/tmp/a.txt: Permission denied",
        "package:com.android.settings pid=1234 uid=1000",
        "listen on port 10302"
      ].join("\n"),
      DEFAULT_HIGHLIGHT_RULES
    );

    expect(highlighted).toMatch(/\x1b\[[\d;]+mapt-get\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mactive \(running\)\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mPermission denied\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mcom\.android\.settings\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mpid=1234\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mport 10302\x1b\[0m/);
  });

  test("wraps matching terminal text with ANSI color sequences", () => {
    const highlighted = applyHighlightRules("INFO ok\nERROR failed", [errorRule]);

    expect(highlighted).toBe("INFO ok\n\x1b[1;38;2;220;38;38;48;2;254;226;226mERROR\x1b[0m \x1b[1;38;2;220;38;38;48;2;254;226;226mfailed\x1b[0m");
  });

  test("ignores disabled and invalid regex rules", () => {
    const disabled = { ...errorRule, enabled: false };
    const invalid = { ...errorRule, id: "bad", pattern: "[" };

    expect(applyHighlightRules("ERROR failed", [disabled, invalid])).toBe("ERROR failed");
  });

  test("does not inject highlight escapes into terminal control sequences", () => {
    const pathRule: HighlightRule = {
      id: "path",
      name: "路径",
      pattern: "(/[^\\s]+)",
      flags: "g",
      enabled: true,
      scope: "terminal",
      foreground: "#0f766e",
      priority: 10
    };
    const oscTitle = "\x1b]0;vim /tmp/app.log\x07";

    expect(applyHighlightRules(oscTitle, [pathRule])).toBe(oscTitle);
    expect(applyHighlightRules(`${oscTitle} /tmp/app.log`, [pathRule])).toBe(
      `${oscTitle} \x1b[38;2;15;118;110m/tmp/app.log\x1b[0m`
    );
  });
});

describe("terminal theme settings", () => {
  test("defaults to a dark terminal inside the light application shell", () => {
    expect(DEFAULT_TERMINAL_THEME).toBe("dark");
    expect(getTerminalTheme(DEFAULT_TERMINAL_THEME)).toMatchObject({
      background: "#0a0a0c",
      foreground: "#f0f4ff"
    });
  });

  test("returns xterm colors for light and dark themes", () => {
    expect(getTerminalTheme("light")).toMatchObject({
      background: "#ffffff",
      foreground: "#1f2937"
    });
    expect(getTerminalTheme("dark")).toMatchObject({
      background: "#0a0a0c",
      foreground: "#f0f4ff"
    });
  });

  test("normalizes theme mode to a root data attribute", () => {
    expect(THEMES).toEqual(["dark", "nordic", "light", "graphite", "aurora"]);
    expect(getThemeAttribute("light")).toBe("light");
    expect(getThemeAttribute("dark")).toBe("dark");
    expect(getThemeAttribute("graphite")).toBe("graphite");
    expect(getThemeAttribute("aurora")).toBe("aurora");
  });
});

describe("decodeLessHexUtf8", () => {
  test("automatically decodes less / git escaped UTF-8 chinese hex bytes", () => {
    // <E6><96><87><E6><A1><A3> is "文档"
    const raw = "<E6><96><87><E6><A1><A3><EF><BC><9A><E8><A1><A5><E5><85><85>V3.1.0<E8><87><B3>V3.2.2";
    expect(decodeLessHexUtf8(raw)).toBe("文档：补充V3.1.0至V3.2.2");
  });

  test("strips less ANSI standout inverse escape sequences between hex bytes", () => {
    // \x1b[7m<E6>\x1b[27m\x1b[7m<96>\x1b[27m\x1b[7m<87>\x1b[27m is "文"
    const rawWithAnsi = "\x1b[7m<E6>\x1b[27m\x1b[7m<96>\x1b[27m\x1b[7m<87>\x1b[27m";
    expect(decodeLessHexUtf8(rawWithAnsi)).toBe("文");
  });

  test("keeps regular text and html tags untouched", () => {
    expect(decodeLessHexUtf8("hello <tag> world")).toBe("hello <tag> world");
    expect(decodeLessHexUtf8("normal text 123")).toBe("normal text 123");
  });
});

describe("normalizeTerminalInverseVideo", () => {
  test("replaces ANSI inverse standalone with high-contrast slate header bar", () => {
    const topHeader = "\x1b[7m PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\x1b[0m";
    const normalized = normalizeTerminalInverseVideo(topHeader);
    expect(normalized).toContain("\x1b[48;2;30;41;59;38;2;241;245;249m");
    expect(normalized).not.toContain("\x1b[7m");
  });

  test("handles combined bold and inverse escapes", () => {
    const boldInverse = "\x1b[1;7mHeader\x1b[27m";
    const normalized = normalizeTerminalInverseVideo(boldInverse);
    expect(normalized).toContain("\x1b[1;48;2;30;41;59;38;2;255;255;255m");
    expect(normalized).toContain("\x1b[49;39m");
  });
});
