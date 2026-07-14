import { describe, expect, test } from "vitest";
import type { CommandFolder } from "./bridge";
import { buildCommandSuggestions, defaultCommandSuggestionApplyKey, isFullScreenCommand, recordCommandHistory } from "./commandSuggestions";

describe("command suggestions", () => {
  const folders: CommandFolder[] = [
    {
      id: "ops",
      name: "ops",
      commands: [
        { id: "disk", name: "disk usage", command: "df -h", description: "show disk remark" },
        { id: "nginx", name: "restart nginx", command: "systemctl restart nginx" }
      ]
    }
  ];

  test("defaults suggestion apply key to Alt+Enter", () => {
    expect(defaultCommandSuggestionApplyKey).toBe("altEnter");
  });

  test("prioritizes session history before local shortcuts and built-in Linux commands", () => {
    const history = recordCommandHistory([], "docker ps -a");
    const suggestions = buildCommandSuggestions("d", history, folders);

    expect(suggestions.map((item) => item.command).slice(0, 3)).toEqual(["docker ps -a", "df -h", "docker ps"]);
    expect(suggestions[0].source).toBe("history");
    expect(suggestions[1].source).toBe("shortcut");
    expect(suggestions[2].source).toBe("linux");
    expect(suggestions[1].description).toBe("disk usage");
  });

  test("filters suggestions by selected sources", () => {
    const history = recordCommandHistory([], "docker ps -a");
    const suggestions = buildCommandSuggestions("d", history, folders, {
      history: false,
      shortcuts: false,
      linux: true
    });

    expect(suggestions.every((item) => item.source === "linux")).toBe(true);
    expect(suggestions.map((item) => item.command).slice(0, 3)).toEqual(["docker ps", "df -h", "du -sh *"]);
  });

  test("includes distilled linuxcool command names in built-in Linux suggestions", () => {
    const suggestions = buildCommandSuggestions("lsb", [], [], {
      history: false,
      shortcuts: false,
      linux: true
    });

    expect(suggestions.map((item) => item.command)).toContain("lsb-release");
    expect(suggestions.find((item) => item.command === "lsb-release")?.description).toBe("显示 Linux 发行版信息");
  });

  test("fills descriptions for history and shortcut names", () => {
    const suggestions = buildCommandSuggestions(
      "echo",
      ["echo hello"],
      [
        {
          id: "ops",
          name: "ops",
          commands: [{ id: "open", name: "开放永久访问", command: "echo 1 > /tmp/open", description: "" }]
        }
      ],
      {
        history: true,
        shortcuts: true,
        linux: false
      }
    );

    expect(suggestions.map((item) => item.description)).toEqual(["输出字符串或提取后的变量值", "开放永久访问"]);
  });

  test("records submitted commands once and moves repeated commands to the front", () => {
    const history = recordCommandHistory(["free -m", "df -h"], "df -h");

    expect(history).toEqual(["df -h", "free -m"]);
    expect(recordCommandHistory(history, "   ")).toEqual(history);
  });

  test("recognizes full-screen terminal commands", () => {
    expect(isFullScreenCommand("vim /tmp/a.txt")).toBe(true);
    expect(isFullScreenCommand("sudo vi /etc/hosts")).toBe(true);
    expect(isFullScreenCommand("ls -la")).toBe(false);
  });
});
