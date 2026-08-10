import { describe, expect, test } from "vitest";
import {
  DEFAULT_TERMINAL_THEME,
  DEFAULT_HIGHLIGHT_RULES,
  applyHighlightRules,
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
      background: "#090a0f",
      foreground: "#f0f4ff"
    });
  });

  test("returns xterm colors for light and dark themes", () => {
    expect(getTerminalTheme("light")).toMatchObject({
      background: "#ffffff",
      foreground: "#1f2937"
    });
    expect(getTerminalTheme("dark")).toMatchObject({
      background: "#090a0f",
      foreground: "#f0f4ff"
    });
  });

  test("normalizes theme mode to a root data attribute", () => {
    expect(THEMES).toEqual(["dark", "nordic", "light"]);
    expect(getThemeAttribute("light")).toBe("light");
    expect(getThemeAttribute("dark")).toBe("dark");
  });
});
