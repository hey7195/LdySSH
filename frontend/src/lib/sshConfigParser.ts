import type { SavedConnection } from "./bridge";

export interface ParsedSshHost {
  host: string;
  hostname?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  group?: string;
}

/**
 * 将标准 ~/.ssh/config 文本内容解析为 SavedConnection 列表
 */
export function parseOpenSshConfig(configText: string): SavedConnection[] {
  const lines = configText.split(/\r?\n/);
  const connections: SavedConnection[] = [];
  let current: Partial<SavedConnection> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(\w+)\s+(.+)$/);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const value = match[2].trim().replace(/^["']|["']$/g, "");

    if (key === "host") {
      if (current && (current.hostname || current.name)) {
        connections.push(finalizeConnection(current));
      }
      current = {
        name: value,
        hostname: value,
        port: 22,
        username: "root",
        group: "OpenSSH导入"
      };
    } else if (current) {
      switch (key) {
        case "hostname":
          current.hostname = value;
          break;
        case "user":
          current.username = value;
          break;
        case "port":
          current.port = parseInt(value, 10) || 22;
          break;
        case "identityfile":
          current.keyPath = value;
          break;
        case "proxyjump":
          current.useJumpHost = true;
          current.jumpHost = value;
          break;
        default:
          break;
      }
    }
  }

  if (current && (current.hostname || current.name)) {
    connections.push(finalizeConnection(current));
  }

  return connections;
}

function finalizeConnection(conn: Partial<SavedConnection>): SavedConnection {
  const host = conn.hostname || conn.name || "unknown";
  const user = conn.username || "root";
  const port = conn.port || 22;
  const key = `${host}@${user}:${port}`;
  return {
    key,
    name: conn.name || `${user}@${host}`,
    hostname: host,
    port,
    username: user,
    keyPath: conn.keyPath || "",
    group: conn.group || "OpenSSH导入",
    folder: conn.group || "OpenSSH导入",
    useJumpHost: conn.useJumpHost,
    jumpHost: conn.jumpHost,
    jumpPort: conn.jumpPort || 22,
    jumpUser: conn.jumpUser || "root"
  };
}

/**
 * 将已保存的主机列表导出为标准 OpenSSH ~/.ssh/config 文本
 */
export function exportToOpenSshConfig(connections: SavedConnection[]): string {
  const header = `# ==========================================\n# LdySSH 导出的 OpenSSH 配置文件 (~/.ssh/config)\n# 生成时间: ${new Date().toLocaleString()}\n# ==========================================\n\n`;

  const blocks = connections.map((c) => {
    const alias = (c.name || c.hostname || "server").replace(/\s+/g, "_");
    let block = `Host ${alias}\n`;
    block += `    HostName ${c.hostname || "127.0.0.1"}\n`;
    if (c.username) block += `    User ${c.username}\n`;
    if (c.port && c.port !== 22) block += `    Port ${c.port}\n`;
    if (c.keyPath) block += `    IdentityFile "${c.keyPath}"\n`;
    if (c.useJumpHost && c.jumpHost) {
      const jumpUserPrefix = c.jumpUser ? `${c.jumpUser}@` : "";
      const jumpPortSuffix = c.jumpPort && c.jumpPort !== 22 ? `:${c.jumpPort}` : "";
      block += `    ProxyJump ${jumpUserPrefix}${c.jumpHost}${jumpPortSuffix}\n`;
    }
    return block;
  });

  return header + blocks.join("\n");
}
