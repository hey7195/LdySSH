import { describe, expect, test } from "vitest";
import type { CommandFolder } from "./bridge";
import {
  extractCommandParameters,
  fillCommandParameters,
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

  test("imports real FinalShell config.json quick_commands object & array format", () => {
    const realFinalShellConfig = JSON.stringify({
      close_window_after_connect: true,
      quick_commands: {
        id: "0",
        name: "默认分类",
        commands: [
          {
            id: "cmd1",
            name: "adbex",
            command: "sed -i 's/docker/podman/g' /usr/local/bin/adbex",
            append_cr: true
          },
          {
            id: "cmd2",
            name: "funpass",
            command: "curl http://10.3.42.3:8080/files/cph-app/funpass -o /bin/funpass",
            append_cr: true
          }
        ]
      }
    });

    const parsed = parseCommandLibraryImport(realFinalShellConfig, "FinalShell");
    expect(parsed.imported).toBe(2);
    expect(parsed.folders[0].name).toBe("默认分类");
    expect(parsed.folders[0].commands[0].name).toBe("adbex");
    expect(parsed.folders[0].commands[0].command).toBe("sed -i 's/docker/podman/g' /usr/local/bin/adbex");
  });

  test("extracts and fills FinalShell placeholders like [p#1], [#1], ${VAR}, <VAR>", () => {
    const cmdWithParams = "ssh -p [p#1 端口号] root@[#2 服务器IP] ${EXTRA_FLAG} <TIMEOUT>";
    const params = extractCommandParameters(cmdWithParams);
    expect(params.map(p => p.key)).toEqual(["p#1", "p#2", "var_EXTRA_FLAG", "angle_TIMEOUT"]);

    const filled = fillCommandParameters(cmdWithParams, {
      "p#1": "2222",
      "#2": "192.168.1.100",
      "var_EXTRA_FLAG": "-v",
      "angle_TIMEOUT": "30"
    });
    expect(filled).toBe("ssh -p 2222 root@192.168.1.100 -v 30");
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

  test("extracts and fills FinalShell-style command parameters", () => {
    const command = "sudo iptables -t nat -nL | grep [p#1 参数名] && echo [p#1 参数名]";

    expect(extractCommandParameters(command)).toEqual([{ key: "p#1", name: "参数名", token: "[p#1 参数名]" }]);
    expect(fillCommandParameters(command, { "p#1": "34285" })).toBe("sudo iptables -t nat -nL | grep 34285 && echo 34285");
  });

  test("extracts and fills shell ${VAR} and <VAR> placeholders", () => {
    const command = "ping ${IP} -p ${PORT} -f <FILE>";

    const extracted = extractCommandParameters(command);
    expect(extracted).toEqual([
      { key: "var_IP", name: "IP", token: "${IP}" },
      { key: "var_PORT", name: "PORT", token: "${PORT}" },
      { key: "angle_FILE", name: "FILE", token: "<FILE>" }
    ]);

    const filled = fillCommandParameters(command, {
      var_IP: "1.1.1.1",
      var_PORT: "8080",
      angle_FILE: "test.txt"
    });
    expect(filled).toBe("ping 1.1.1.1 -p 8080 -f test.txt");
  });

  test("imports WindTerm user.snippets JSON structure", () => {
    const windTermSnippetsJson = JSON.stringify([
      {
        "snippet.name": "查看容器",
        "snippet.body": "docker ps -a",
        "snippet.group": "Docker常用",
        "snippet.description": "列出所有容器"
      },
      {
        "snippet.name": "系统资源",
        "snippet.body": "htop",
        "snippet.group": "系统监控"
      }
    ]);

    const parsed = parseCommandLibraryImport(windTermSnippetsJson, "WindTerm");
    expect(parsed.imported).toBe(2);
    expect(parsed.folders).toHaveLength(2);
    expect(parsed.folders.map(f => f.name)).toContain("Docker常用");
    expect(parsed.folders.map(f => f.name)).toContain("系统监控");
    const dockerFolder = parsed.folders.find(f => f.name === "Docker常用");
    expect(dockerFolder?.commands[0].command).toBe("docker ps -a");
    expect(dockerFolder?.commands[0].name).toBe("查看容器");
  });
});
