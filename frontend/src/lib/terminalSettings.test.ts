import { describe, expect, test } from "vitest";
import {
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
      "IP 地址",
      "URL",
      "HTTP 5xx",
      "路径",
      "耗时"
    ]);
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
});

describe("terminal theme settings", () => {
  test("returns xterm colors for light and dark themes", () => {
    expect(getTerminalTheme("light")).toMatchObject({
      background: "#ffffff",
      foreground: "#1f2937"
    });
    expect(getTerminalTheme("dark")).toMatchObject({
      background: "#111827",
      foreground: "#e5e7eb"
    });
  });

  test("normalizes theme mode to a root data attribute", () => {
    expect(THEMES).toEqual(["light", "dark"]);
    expect(getThemeAttribute("light")).toBe("light");
    expect(getThemeAttribute("dark")).toBe("dark");
  });
});
