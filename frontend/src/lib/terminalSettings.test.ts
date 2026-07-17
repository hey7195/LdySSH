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
      "错误",
      "警告",
      "权限拒绝",
      "Linux 服务状态",
      "ADB 设备",
      "IP 地址",
      "URL",
      "HTTP 5xx",
      "路径",
      "耗时",
      "包管理命令",
      "端口",
      "Android 包名",
      "进程 ID"
    ]);
  });

  test("highlights Ubuntu CentOS and ADB terminal output", () => {
    const highlighted = applyHighlightRules(
      [
        "apt-get install nginx",
        "systemctl status nginx active (running)",
        "cat /data/local/tmp/a.txt: Permission denied",
        "127.0.0.1:5555 device",
        "package:com.android.settings pid=1234 uid=1000",
        "listen on port 10302"
      ].join("\n"),
      DEFAULT_HIGHLIGHT_RULES
    );

    expect(highlighted).toMatch(/\x1b\[[\d;]+mapt-get\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mactive \(running\)\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+mPermission denied\x1b\[0m/);
    expect(highlighted).toMatch(/\x1b\[[\d;]+m127\.0\.0\.1:5555 device\x1b\[0m/);
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
      name: "璺緞",
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
      background: "#020617",
      foreground: "#e5e7eb"
    });
  });

  test("returns xterm colors for light and dark themes", () => {
    expect(getTerminalTheme("light")).toMatchObject({
      background: "#ffffff",
      foreground: "#1f2937"
    });
    expect(getTerminalTheme("dark")).toMatchObject({
      background: "#020617",
      foreground: "#e5e7eb"
    });
  });

  test("normalizes theme mode to a root data attribute", () => {
    expect(THEMES).toEqual(["light", "dark"]);
    expect(getThemeAttribute("light")).toBe("light");
    expect(getThemeAttribute("dark")).toBe("dark");
  });
});
