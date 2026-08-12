import { FLAT_RUNOOB_COMMANDS } from "./runoobLinuxCommands";

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
    completions: ["status", "pull origin", "push origin", "commit -m ''", "checkout -b", "log --oneline -n 10", "diff", "stash", "stash pop", "clone"]
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
    prefix: "chattr",
    completions: ["+i", "-i", "+a", "-R +i"]
  },
  {
    prefix: "chgrp",
    completions: ["-R www-data", "-R root"]
  },
  {
    prefix: "tar",
    completions: ["-zxvf", "-czvf", "-xvf", "-tvf", "-jxvf", "-Jcvf"]
  },
  {
    prefix: "grep",
    completions: ["-rnI", "-i", "-E", "-v", "--color=auto", "-C 5"]
  },
  {
    prefix: "find",
    completions: [". -name ''", "/ -size +100M", ". -type f -mtime -7", ". -type d"]
  },
  {
    prefix: "curl",
    completions: ["-I", "-v", "-X POST", "-H 'Content-Type: application/json'", "-k", "-s"]
  },
  {
    prefix: "wget",
    completions: ["-c", "-q", "-O", "--no-check-certificate"]
  },
  {
    prefix: "netstat",
    completions: ["-tulnp", "-anp | grep", "-s"]
  },
  {
    prefix: "ss",
    completions: ["-tuln", "-tulpn", "-s", "-m"]
  },
  {
    prefix: "ufw",
    completions: ["status verbose", "allow 80/tcp", "allow 22/tcp", "deny 21", "reload", "enable", "disable"]
  },
  {
    prefix: "iptables",
    completions: ["-L -n -v", "-F", "-A INPUT -p tcp --dport 80 -j ACCEPT", "-t nat -L"]
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
  },
  {
    prefix: "sed",
    completions: ["'s/old/new/g'", "-i 's/old/new/g'", "-n '1,10p'"]
  },
  {
    prefix: "awk",
    completions: ["'{print $1}'", " -F: '{print $1,$3}'", "'/pattern/ {print $0}'"]
  },
  {
    prefix: "sort",
    completions: ["-n", "-r", "-k 2", "-u", "-h"]
  },
  {
    prefix: "uniq",
    completions: ["-c", "-d", "-u"]
  },
  {
    prefix: "wc",
    completions: ["-l", "-w", "-c", "-m"]
  },
  {
    prefix: "tr",
    completions: ["'[:lower:]' '[:upper:]'", "-d '\\r'", "-s ' '"]
  },
  {
    prefix: "cut",
    completions: ["-d':' -f1", "-c 1-10", "-f 2-4"]
  },
  {
    prefix: "head",
    completions: ["-n 20", "-n 50", "-c 100"]
  },
  {
    prefix: "tail",
    completions: ["-f", "-n 100", "-f -n 50", "-F"]
  },
  {
    prefix: "less",
    completions: ["-N", "-S", "+G", "+/pattern"]
  },
  {
    prefix: "df",
    completions: ["-h", "-T", "-i"]
  },
  {
    prefix: "du",
    completions: ["-sh *", "-h --max-depth=1", "-ah"]
  },
  {
    prefix: "mount",
    completions: ["-a", "-t ext4", "-o loop", "-t nfs"]
  },
  {
    prefix: "umount",
    completions: ["-l", "-f"]
  },
  {
    prefix: "fdisk",
    completions: ["-l", "/dev/sda", "/dev/nvme0n1"]
  },
  {
    prefix: "lsblk",
    completions: ["-f", "-m", "-p"]
  },
  {
    prefix: "top",
    completions: ["-b -n 1", "-u root", "-p"]
  },
  {
    prefix: "ps",
    completions: ["aux", "-ef", "aux | grep", "-eo pid,user,%cpu,%mem,cmd --sort=-%cpu"]
  },
  {
    prefix: "kill",
    completions: ["-9", "-15", "-HUP"]
  },
  {
    prefix: "pkill",
    completions: ["-9", "-f"]
  },
  {
    prefix: "free",
    completions: ["-h", "-m", "-s 1"]
  },
  {
    prefix: "uptime",
    completions: ["-p", "-s"]
  },
  {
    prefix: "uname",
    completions: ["-a", "-r", "-m"]
  },
  {
    prefix: "hostname",
    completions: ["-I", "-f"]
  },
  {
    prefix: "su",
    completions: ["-", "root", "-s /bin/bash"]
  },
  {
    prefix: "sudo",
    completions: ["-i", "-u www-data", "systemctl restart"]
  },
  {
    prefix: "crontab",
    completions: ["-l", "-e", "-r", "-u root"]
  },
  {
    prefix: "sysctl",
    completions: ["-p", "-a", "net.ipv4.ip_forward=1"]
  },
  {
    prefix: "history",
    completions: ["| grep", "-c", "100"]
  },
  {
    prefix: "echo",
    completions: ["$PATH", "$USER", "$HOME", "$?"]
  },
  {
    prefix: "date",
    completions: ["'+%Y-%m-%d %H:%M:%S'", "-u", "-d '1 day ago'"]
  },
  {
    prefix: "watch",
    completions: ["-n 1 'df -h'", "-n 2 'free -m'"]
  },
  {
    prefix: "which",
    completions: ["python3", "docker", "git", "nginx"]
  },
  {
    prefix: "whereis",
    completions: ["nginx", "python", "php"]
  },
  {
    prefix: "locate",
    completions: ["*.conf", "*.log"]
  },
  {
    prefix: "xargs",
    completions: ["-i", "-n 1", "-P 4", "rm -f"]
  },
  {
    prefix: "nohup",
    completions: ["./app > app.log 2>&1 &"]
  },
  {
    prefix: "screen",
    completions: ["-S session_name", "-r", "-ls"]
  },
  {
    prefix: "tmux",
    completions: ["new -s dev", "attach -t dev", "ls", "kill-session -t dev"]
  }
];

// Extract ALL Linux command names from Runoob + dictionary
export const ALL_LINUX_COMMAND_NAMES: string[] = Array.from(
  new Set([
    ...LINUX_SHELL_DICTIONARY.map((d) => d.prefix),
    ...FLAT_RUNOOB_COMMANDS.map((c) => c.name.split("/")[0].trim().toLowerCase())
  ])
);

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

  // 3. Command Name Completion (if no space typed yet)
  if (!rawInput.includes(" ")) {
    const matchedCmd = ALL_LINUX_COMMAND_NAMES.find(
      (cmd) => cmd.startsWith(lowerInput) && cmd.length > lowerInput.length
    );
    if (matchedCmd) {
      const remaining = matchedCmd.slice(lowerInput.length);
      return `${input}${remaining}`;
    }
  }

  // 4. Sub-Command & Option Completion (if main command is typed)
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
