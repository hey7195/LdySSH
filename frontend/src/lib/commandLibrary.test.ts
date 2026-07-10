import { describe, expect, test } from "vitest";
import type { CommandFolder } from "./bridge";
import {
  mergeCommandFolders,
  parseCommandLibraryImport,
  serializeCommandLibraryExport
} from "./commandLibrary";

describe("command library import/export", () => {
  test("round-trips exported LdSSH command folders", () => {
    const folders: CommandFolder[] = [
      {
        id: "ops",
        name: "运维",
        commands: [{ id: "disk", name: "磁盘", command: "df -h", description: "disk usage" }]
      }
    ];

    const parsed = parseCommandLibraryImport(serializeCommandLibraryExport(folders));

    expect(parsed.folders).toHaveLength(1);
    expect(parsed.folders[0].name).toBe("运维");
    expect(parsed.folders[0].commands[0]).toMatchObject({ name: "磁盘", command: "df -h" });
  });

  test("imports FinalShell-style nested command json", () => {
    const finalShellJson = JSON.stringify({
      groups: [
        {
          name: "Linux 运维",
          children: [
            { name: "查看磁盘", cmd: "df -h", desc: "disk usage" },
            { title: "查看内存", command: "free -m" }
          ]
        }
      ]
    });

    const parsed = parseCommandLibraryImport(finalShellJson, "FinalShell");

    expect(parsed.source).toBe("FinalShell");
    expect(parsed.folders[0].name).toBe("Linux 运维");
    expect(parsed.folders[0].commands.map((command) => command.command)).toEqual(["df -h", "free -m"]);
  });

  test("merges imported commands without duplicating existing commands", () => {
    const current: CommandFolder[] = [
      {
        id: "ops",
        name: "运维",
        commands: [{ id: "disk", name: "磁盘", command: "df -h" }]
      }
    ];
    const incoming: CommandFolder[] = [
      {
        id: "imported",
        name: "运维",
        commands: [
          { id: "disk2", name: "磁盘", command: "df -h" },
          { id: "memory", name: "内存", command: "free -m" }
        ]
      }
    ];

    const merged = mergeCommandFolders(current, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].commands.map((command) => command.command)).toEqual(["df -h", "free -m"]);
  });
});
