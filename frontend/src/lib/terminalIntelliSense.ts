export interface ShellDictionaryItem {
  prefix: string;
  completions: string[];
}

export const LINUX_SHELL_DICTIONARY: ShellDictionaryItem[] = [
  {
    prefix: "systemctl",
    completions: ["status", "start", "stop", "restart", "enable", "disable", "reload", "daemon-reload", "is-active", "failed"]
  },
  {
    prefix: "journalctl",
    completions: ["-u", "-f", "-n 100", "--since '1 hour ago'", "-p err", "-b"]
  },
  {
    prefix: "docker",
    completions: ["ps -a", "logs -f --tail 100", "exec -it", "restart", "stop", "compose up -d", "compose down", "images", "system prune -f"]
  },
  {
    prefix: "git",
    completions: ["status", "pull origin", "push origin", "commit -m ''", "checkout -b", "log --oneline -n 10", "diff", "stash", "stash pop"]
  },
  {
    prefix: "nginx",
    completions: ["-t", "-s reload", "-s stop", "-V"]
  },
  {
    prefix: "chmod",
    completions: ["+x", "755", "644", "700", "600", "-R 755"]
  },
  {
    prefix: "chown",
    completions: ["-R www-data:www-data", "-R root:root", "-R ubuntu:ubuntu"]
  },
  {
    prefix: "tar",
    completions: ["-zxvf", "-czvf", "-xvf", "-tvf"]
  },
  {
    prefix: "grep",
    completions: ["-rnI", "-i", "-E", "-v", "--color=auto"]
  },
  {
    prefix: "find",
    completions: [". -name ''", "/ -size +100M", ". -type f -mtime -7"]
  },
  {
    prefix: "curl",
    completions: ["-I", "-v", "-X POST", "-H 'Content-Type: application/json'", "-k", "-s"]
  },
  {
    prefix: "netstat",
    completions: ["-tulnp", "-anp | grep", "-s"]
  },
  {
    prefix: "ss",
    completions: ["-tuln", "-tulpn", "-s"]
  },
  {
    prefix: "ufw",
    completions: ["status verbose", "allow", "deny", "reload", "enable"]
  },
  {
    prefix: "iptables",
    completions: ["-L -n -v", "-F", "-A INPUT -p tcp --dport"]
  },
  {
    prefix: "kubectl",
    completions: ["get pods -A", "logs -f --tail=100", "describe pod", "exec -it", "apply -f", "get svc -A", "top nodes", "top pods"]
  },
  {
    prefix: "dmesg",
    completions: ["-wH --color=always", "-l err,crit,alert,emerg", "-T | tail -n 50", "-c"]
  },
  {
    prefix: "perf",
    completions: ["top -g", "record -F 99 -g -p", "report", "stat -p"]
  },
  {
    prefix: "strace",
    completions: ["-c -p", "-e trace=openat,read,write,connect -p", "-ff -o strace.log -p"]
  },
  {
    prefix: "tcpdump",
    completions: ["-i any port 80 -n -X", "-i eth0 tcp port 443", "-w capture.pcap"]
  },
  {
    prefix: "lsof",
    completions: ["-i :8080", "-i -P -n", "-p", "+D /var/log"]
  },
  {
    prefix: "modprobe",
    completions: ["-v", "-r", "--show-depends"]
  },
  {
    prefix: "rsync",
    completions: ["-avz --progress", "-avz -e ssh ./", "--delete -avz"]
  }
];

import { FLAT_RUNOOB_COMMANDS } from "./runoobLinuxCommands";

export function getShellSuggestion(
  input: string,
  historyCommands: string[] = [],
  userCommands: string[] = []
): string | null {
  if (!input || !input.trim()) return null;
  const rawInput = input.trimStart();
  const lowerInput = rawInput.toLowerCase();

  // 1. Search in history commands
  const historyMatch = historyCommands.find(
    (cmd) => cmd && cmd.trim().toLowerCase().startsWith(lowerInput) && cmd.trim().length > rawInput.length
  );
  if (historyMatch) {
    const remaining = historyMatch.trim().slice(rawInput.length);
    return `${input}${remaining}`;
  }

  // 2. Search in user quick commands
  const userMatch = userCommands.find(
    (cmd) => cmd && cmd.trim().toLowerCase().startsWith(lowerInput) && cmd.trim().length > rawInput.length
  );
  if (userMatch) {
    const remaining = userMatch.trim().slice(rawInput.length);
    return `${input}${remaining}`;
  }

  // 3. Search in Runoob Linux Manual dataset
  const runoobMatch = FLAT_RUNOOB_COMMANDS.find(
    (cmd) => cmd.name.toLowerCase().startsWith(lowerInput) && cmd.name.length > lowerInput.length
  );
  if (runoobMatch && !rawInput.includes(" ")) {
    const remaining = runoobMatch.name.slice(lowerInput.length);
    return `${input}${remaining}`;
  }

  // 4. Search in system dictionary
  const parts = rawInput.split(/\s+/);
  const mainCmd = parts[0]?.toLowerCase();
  if (!mainCmd) return null;

  const item = LINUX_SHELL_DICTIONARY.find((d) => d.prefix === mainCmd);
  if (!item) return null;

  const subInput = parts.slice(1).join(" ");
  if (!subInput) {
    return `${rawInput} ${item.completions[0]}`;
  }

  const match = item.completions.find((c) => c.toLowerCase().startsWith(subInput.toLowerCase()) && c.length > subInput.length);
  if (match) {
    const remaining = match.slice(subInput.length);
    return `${input}${remaining}`;
  }

  return null;
}
