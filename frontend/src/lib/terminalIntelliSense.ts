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
  }
];

export function getShellSuggestion(input: string): string | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trimStart();
  const parts = trimmed.split(/\s+/);
  const mainCmd = parts[0]?.toLowerCase();

  if (!mainCmd) return null;

  const item = LINUX_SHELL_DICTIONARY.find((d) => d.prefix === mainCmd);
  if (!item) return null;

  const subInput = parts.slice(1).join(" ");
  if (!subInput) {
    return `${trimmed} ${item.completions[0]}`;
  }

  const match = item.completions.find((c) => c.toLowerCase().startsWith(subInput.toLowerCase()) && c.length > subInput.length);
  if (match) {
    const fullMatchedSub = match;
    const remaining = fullMatchedSub.slice(subInput.length);
    return `${input}${remaining}`;
  }

  return null;
}
