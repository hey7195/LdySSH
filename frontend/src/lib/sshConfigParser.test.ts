import { describe, it, expect } from "vitest";
import { parseOpenSshConfig, exportToOpenSshConfig } from "./sshConfigParser";

describe("sshConfigParser", () => {
  it("parses ~/.ssh/config correctly including ProxyJump and IdentityFile", () => {
    const config = `
# Sample OpenSSH config
Host prod-web
    HostName 10.0.1.5
    User ubuntu
    Port 2222
    IdentityFile ~/.ssh/id_rsa
    ProxyJump bastion.example.com

Host db-node
    HostName 192.168.1.50
    User root
`;

    const result = parseOpenSshConfig(config);
    expect(result).toHaveLength(2);

    expect(result[0].name).toBe("prod-web");
    expect(result[0].hostname).toBe("10.0.1.5");
    expect(result[0].username).toBe("ubuntu");
    expect(result[0].port).toBe(2222);
    expect(result[0].keyPath).toBe("~/.ssh/id_rsa");
    expect(result[0].useJumpHost).toBe(true);
    expect(result[0].jumpHost).toBe("bastion.example.com");

    expect(result[1].name).toBe("db-node");
    expect(result[1].hostname).toBe("192.168.1.50");
    expect(result[1].username).toBe("root");
    expect(result[1].port).toBe(22);
  });

  it("exports saved connections to OpenSSH config format", () => {
    const connections = [
      {
        name: "My Server",
        hostname: "47.98.100.2",
        port: 22,
        username: "root",
        keyPath: "C:/keys/server.pem",
        useJumpHost: true,
        jumpHost: "jump.server.com",
        jumpPort: 2200,
        jumpUser: "admin"
      }
    ];

    const output = exportToOpenSshConfig(connections);
    expect(output).toContain("Host My_Server");
    expect(output).toContain("HostName 47.98.100.2");
    expect(output).toContain("User root");
    expect(output).toContain('IdentityFile "C:/keys/server.pem"');
    expect(output).toContain("ProxyJump admin@jump.server.com:2200");
  });
});
