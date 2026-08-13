import { FLAT_RUNOOB_COMMANDS } from "./runoobLinuxCommands";

export interface ShellDictionaryItem {
  prefix: string;
  completions: string[];
}

export const STORAGE_KEY_COMMAND_FREQUENCY = "ldyssh.terminal.commandFrequency";

/**
 * 💡 获取用户本地记录的命令使用频率表
 */
export function getCommandUsageMap(): Record<string, number> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_COMMAND_FREQUENCY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 💡 清空用户命令使用频率历史
 */
export function clearCommandUsageMap(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY_COMMAND_FREQUENCY);
  } catch {
    // Ignore
  }
}

/**
 * 💡 获取单个命令的使用次数
 */
export function getCommandUsageFrequency(cmd: string): number {
  const map = getCommandUsageMap();
  const mainCmd = cmd.trim().split(/\s+/)[0]?.toLowerCase() || "";
  return (map[cmd.trim().toLowerCase()] || 0) + (map[mainCmd] || 0);
}

/**
 * 💡 记录一次命令执行行为，累加频率并持久化
 */
export function recordCommandExecution(cmdString: string): void {
  if (!cmdString || !cmdString.trim() || typeof window === "undefined" || !window.localStorage) return;
  const clean = cmdString.trim();
  const mainCmd = clean.split(/\s+/)[0]?.toLowerCase();
  
  const map = getCommandUsageMap();
  map[clean] = (map[clean] || 0) + 1;
  if (mainCmd && mainCmd !== clean) {
    map[mainCmd] = (map[mainCmd] || 0) + 1;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY_COMMAND_FREQUENCY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export const LINUX_SHELL_DICTIONARY: ShellDictionaryItem[] = [
  // --- 系统服务与进程管理 ---
  {
    prefix: "systemctl",
    completions: ["status", "start", "stop", "restart", "enable", "disable", "reload", "daemon-reload", "is-active", "failed"]
  },
  {
    prefix: "journalctl",
    completions: ["-u", "-f", "-n 100", "--since '1 hour ago'", "-p err", "-b", "--disk-usage", "--vacuum-time=7d"]
  },
  {
    prefix: "service",
    completions: ["status", "start", "stop", "restart", "--status-all"]
  },
  {
    prefix: "ps",
    completions: ["aux", "-ef", "aux | grep", "-eo pid,user,%cpu,%mem,cmd --sort=-%cpu", "-eo pid,user,args"]
  },
  {
    prefix: "top",
    completions: ["-b -n 1", "-u root", "-p", "-d 1"]
  },
  {
    prefix: "htop",
    completions: ["-u root", "-d 10", "-C"]
  },
  {
    prefix: "btop",
    completions: ["--utf-force"]
  },
  {
    prefix: "kill",
    completions: ["-9", "-15", "-HUP", "-2"]
  },
  {
    prefix: "pkill",
    completions: ["-9", "-f", "-u root"]
  },
  {
    prefix: "killall",
    completions: ["-9", "-v", "-I"]
  },

  // --- 容器 & DevOps 云原生 & 安卓容器 ---
  {
    prefix: "docker",
    completions: [
      "ps -a",
      "logs -f --tail 100",
      "exec -it",
      "restart",
      "stop",
      "compose up -d",
      "compose down",
      "images",
      "system prune -f",
      "inspect",
      "exec -it redroid sh",
      "exec -it redroid getprop ro.build.version.release",
      "exec -it redroid logcat -v time",
      "run -d --name redroid -p 5555:5555 --privileged redroid/redroid:11.0.0-latest"
    ]
  },
  {
    prefix: "adb",
    completions: [
      "connect 127.0.0.1:5555",
      "devices -l",
      "shell getprop ro.build.version.release",
      "shell dumpsys battery",
      "shell pm list packages -3",
      "shell top -m 5",
      "shell logcat -v time",
      "shell screencap -p /sdcard/screen.png",
      "pull /sdcard/screen.png .",
      "push app.apk /sdcard/",
      "install -r -g app.apk",
      "reboot",
      "disconnect",
      "kill-server",
      "start-server"
    ]
  },
  {
    prefix: "waydroid",
    completions: [
      "status",
      "session start",
      "session stop",
      "container start",
      "container stop",
      "app launch",
      "prop get ro.build.version.release",
      "logcat"
    ]
  },
  {
    prefix: "scrcpy",
    completions: [
      "--serial 127.0.0.1:5555",
      "-s 127.0.0.1:5555 --max-size 1024",
      "--no-audio",
      "-m 1024 -b 2M"
    ]
  },
  {
    prefix: "fastboot",
    completions: ["devices", "reboot", "flash boot", "getvar all"]
  },
  {
    prefix: "docker-compose",
    completions: ["up -d", "down", "logs -f", "ps", "restart", "build", "config"]
  },
  {
    prefix: "podman",
    completions: ["ps -a", "run -d", "images", "exec -it", "logs -f"]
  },
  {
    prefix: "kubectl",
    completions: ["get pods -A", "logs -f --tail=100", "describe pod", "exec -it", "apply -f", "get svc -A", "top nodes", "top pods", "delete pod", "get nodes -o wide"]
  },
  {
    prefix: "helm",
    completions: ["list -A", "install", "upgrade", "uninstall", "repo update", "status"]
  },

  // --- 版本控制 Git ---
  {
    prefix: "git",
    completions: ["status", "pull origin", "push origin", "commit -m ''", "checkout -b", "log --oneline -n 10", "diff", "stash", "stash pop", "clone", "branch -a", "remote -v", "rebase"]
  },

  // --- 权限管理与用户 ---
  {
    prefix: "chmod",
    completions: ["+x", "755", "644", "700", "600", "-R 755", "-R 644"]
  },
  {
    prefix: "chown",
    completions: ["-R www-data:www-data", "-R root:root", "-R ubuntu:ubuntu", "-R $USER:$USER"]
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
    prefix: "sudo",
    completions: ["-i", "-u www-data", "systemctl restart", "su -"]
  },
  {
    prefix: "useradd",
    completions: ["-m -s /bin/bash", "-g sudo", "-G docker"]
  },
  {
    prefix: "usermod",
    completions: ["-aG docker", "-s /bin/bash", "-L", "-U"]
  },
  {
    prefix: "passwd",
    completions: ["root", "--status", "-l", "-u"]
  },

  // --- 文件与归档压缩 ---
  {
    prefix: "tar",
    completions: ["-zxvf", "-czvf", "-xvf", "-tvf", "-jxvf", "-Jcvf"]
  },
  {
    prefix: "gzip",
    completions: ["-d", "-9", "-k", "-v", "-r"]
  },
  {
    prefix: "gunzip",
    completions: ["-k", "-v"]
  },
  {
    prefix: "zip",
    completions: ["-r", "-q", "-e", "-u"]
  },
  {
    prefix: "unzip",
    completions: ["-l", "-q", "-d"]
  },
  {
    prefix: "rsync",
    completions: ["-avz --progress", "-avz -e ssh ./", "--delete -avz", "-avzhP"]
  },
  {
    prefix: "scp",
    completions: ["-P 22", "-r", "-C", "-v"]
  },

  // --- 文本处理与搜索 ---
  {
    prefix: "grep",
    completions: ["-rnI", "-i", "-E", "-v", "--color=auto", "-C 5", "-l", "-w"]
  },
  {
    prefix: "find",
    completions: [". -name ''", "/ -size +100M", ". -type f -mtime -7", ". -type d", ". -name '*.log' -delete"]
  },
  {
    prefix: "sed",
    completions: ["'s/old/new/g'", "-i 's/old/new/g'", "-n '1,10p'", "-i.bak 's/old/new/g'"]
  },
  {
    prefix: "awk",
    completions: ["'{print $1}'", " -F: '{print $1,$3}'", "'/pattern/ {print $0}'", "'END {print NR}'"]
  },
  {
    prefix: "cat",
    completions: ["-n", "-b", "-A", "/etc/os-release", "/var/log/syslog"]
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
    prefix: "jq",
    completions: [".", ".status", ".items[]", "-r", "-c"]
  },

  // --- 网络 & 诊断安全 ---
  {
    prefix: "curl",
    completions: ["-I", "-v", "-X POST", "-H 'Content-Type: application/json'", "-k", "-s", "-u user:pass"]
  },
  {
    prefix: "wget",
    completions: ["-c", "-q", "-O", "--no-check-certificate", "-b"]
  },
  {
    prefix: "netstat",
    completions: ["-tulnp", "-anp | grep", "-s", "-r"]
  },
  {
    prefix: "ss",
    completions: ["-tuln", "-tulpn", "-s", "-m", "-i"]
  },
  {
    prefix: "ping",
    completions: ["-c 4", "-i 0.2", "-s 1024", "-w 5"]
  },
  {
    prefix: "ip",
    completions: ["addr show", "link show", "route show", "-s link", "neigh"]
  },
  {
    prefix: "ifconfig",
    completions: ["eth0", "-a", "down", "up"]
  },
  {
    prefix: "route",
    completions: ["-n", "add default gw"]
  },
  {
    prefix: "traceroute",
    completions: ["-n", "-T -p 80", "-m 30"]
  },
  {
    prefix: "mtr",
    completions: ["--report", "-n", "-c 10"]
  },
  {
    prefix: "dig",
    completions: ["+short", "ANY", "MX", "NS", "@8.8.8.8", "+trace"]
  },
  {
    prefix: "nslookup",
    completions: ["-type=mx", "-type=ns"]
  },
  {
    prefix: "tcpdump",
    completions: ["-i any port 80 -n -X", "-i eth0 tcp port 443", "-w capture.pcap", "-c 100"]
  },
  {
    prefix: "nc",
    completions: ["-zv", "-l -p 8080", "-w 3"]
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
    prefix: "firewalld",
    completions: ["--state", "--get-active-zones", "--add-port=80/tcp --permanent", "--reload"]
  },

  // --- 磁盘、文件系统与硬件 ---
  {
    prefix: "df",
    completions: ["-h", "-T", "-i"]
  },
  {
    prefix: "du",
    completions: ["-sh *", "-h --max-depth=1", "-ah", "-sk * | sort -n"]
  },
  {
    prefix: "lsblk",
    completions: ["-f", "-m", "-p", "-o NAME,FSTYPE,SIZE,MOUNTPOINT"]
  },
  {
    prefix: "fdisk",
    completions: ["-l", "/dev/sda", "/dev/nvme0n1"]
  },
  {
    prefix: "parted",
    completions: ["-l", "/dev/sda print"]
  },
  {
    prefix: "mount",
    completions: ["-a", "-t ext4", "-o loop", "-t nfs", "-o remount,rw"]
  },
  {
    prefix: "umount",
    completions: ["-l", "-f"]
  },

  // --- Web 服务器 & 包管理器 ---
  {
    prefix: "nginx",
    completions: ["-t", "-s reload", "-s stop", "-V"]
  },
  {
    prefix: "apt",
    completions: ["update", "upgrade -y", "install", "remove", "autoremove", "search"]
  },
  {
    prefix: "apt-get",
    completions: ["update", "install -y", "remove", "dist-upgrade"]
  },
  {
    prefix: "yum",
    completions: ["update -y", "install", "remove", "search", "clean all"]
  },
  {
    prefix: "dnf",
    completions: ["update -y", "install", "remove", "search"]
  },

  // --- 内核调试 & 性能分析 ---
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
    prefix: "lsof",
    completions: ["-i :8080", "-i -P -n", "-p", "+D /var/log"]
  },
  {
    prefix: "modprobe",
    completions: ["-v", "-r", "--show-depends"]
  },
  {
    prefix: "sysctl",
    completions: ["-p", "-a", "net.ipv4.ip_forward=1"]
  },
  {
    prefix: "crontab",
    completions: ["-l", "-e", "-r", "-u root"]
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

// Extract ALL 350+ Linux command names from Runoob + dictionary + sysadmin tools
const RAW_COMMAND_NAMES: string[] = Array.from(
  new Set([
    ...LINUX_SHELL_DICTIONARY.map((d) => d.prefix),
    ...FLAT_RUNOOB_COMMANDS.map((c) => c.name.split("/")[0].trim().toLowerCase()),
    // File & Directory (50)
    "ls", "cd", "pwd", "cp", "mv", "rm", "mkdir", "rmdir", "touch", "ln", "stat", "file", "find", "locate", "updatedb", "tree", "dir", "vdir", "install", "mkfifo", "mknod", "readlink", "realpath", "basename", "dirname", "pathchk", "shred", "truncate", "unlink", "sync", "dd", "df", "du", "lsblk", "fdisk", "parted", "sfdisk", "mkfs", "fsck", "mount", "umount", "blkid", "losetup", "e2fsck", "tune2fs", "resize2fs", "xfs_repair", "xfs_growfs", "badblocks", "chattr", "lsattr",
    // Text Processing & Filtering & Search (45)
    "cat", "tac", "more", "less", "head", "tail", "grep", "egrep", "fgrep", "rgrep", "sed", "awk", "gawk", "cut", "sort", "uniq", "wc", "tr", "tee", "split", "csplit", "join", "paste", "nl", "fold", "column", "col", "expand", "unexpand", "fmt", "pr", "diff", "diff3", "cmp", "comm", "patch", "jq", "yq", "iconv", "dos2unix", "unix2dos", "xxd", "hexdump", "od", "strings",
    // Process & System & Resource Monitoring (40)
    "ps", "pstree", "pgrep", "top", "htop", "btop", "atop", "glances", "nethogs", "iftop", "iotop", "vmstat", "iostat", "mpstat", "sar", "pidstat", "free", "uptime", "uname", "hostname", "hostnamectl", "timedatectl", "localectl", "loginctl", "dmesg", "journalctl", "systemctl", "service", "init", "telinit", "crontab", "at", "batch", "nohup", "screen", "tmux", "time", "timeout", "nice", "renice", "taskset",
    // Network & Connectivity & Security (55)
    "ping", "ping6", "ifconfig", "ip", "route", "netstat", "ss", "traceroute", "tracepath", "mtr", "dig", "nslookup", "host", "whois", "tcpdump", "wireshark", "tshark", "nmap", "nc", "netcat", "socat", "curl", "wget", "aria2c", "ssh", "sshd", "scp", "sftp", "rsync", "ssh-keygen", "ssh-copy-id", "ssh-add", "ssh-agent", "ufw", "iptables", "ip6tables", "nftables", "firewalld", "firewall-cmd", "fail2ban-client", "openssl", "gpg", "envsubst", "ethtool", "iwconfig", "nmcli", "nmtui", "resolvectl", "arp", "rarp", "iptunnel", "tunctl", "tcpwrapper", "openvpn", "wireguard", "wg",
    // User Management & Authentication & Security (35)
    "useradd", "userdel", "usermod", "groupadd", "groupdel", "groupmod", "passwd", "chfn", "chsh", "gpasswd", "newgrp", "id", "whoami", "who", "w", "last", "lastb", "users", "su", "sudo", "sudoedit", "visudo", "chmod", "chown", "chgrp", "umask", "faillock", "pam_tally2", "chage", "logname", "finger", "write", "wall", "mesg", "talk",
    // Archive & Compression & Backup (25)
    "tar", "gzip", "gunzip", "zcat", "bzip2", "bunzip2", "bzcat", "xz", "unxz", "xzcat", "lzma", "unlzma", "zip", "unzip", "zipinfo", "7z", "rar", "unrar", "cpio", "pax", "ar", "zstd", "unzstd", "zstdcat", "dump", "restore",
    // DevOps & Containers & Android Containers & Cloud & Orchestration (45)
    "docker", "docker-compose", "podman", "buildah", "skopeo", "crictl", "ctr", "containerd", "kubectl", "kubectx", "kubens", "helm", "minikube", "kind", "k3s", "terraform", "ansible", "ansible-playbook", "vagrant", "packer", "git", "git-lfs", "gh", "glab", "nginx", "apache2", "httpd", "caddy", "haproxy", "envoy", "redis-cli", "mysql", "mysqldump", "psql", "pg_dump", "sqlite3", "adb", "scrcpy", "waydroid", "redroid", "fastboot", "aapt", "apksigner", "zipalign",
    // Package Management & System Installers (30)
    "apt", "apt-get", "apt-cache", "dpkg", "dpkg-reconfigure", "snap", "flatpak", "yum", "dnf", "rpm", "repoquery", "zypper", "pacman", "makepkg", "apk", "emerge", "brew", "pip", "pip3", "npm", "npx", "pnpm", "yarn", "bun", "gem", "cargo", "go", "composer", "cpan", "luarocks",
    // Kernel, Hardware & Low-Level Diagnostics (35)
    "lspci", "lsusb", "lscpu", "lsscsi", "lsblk", "dmidecode", "inxi", "hwinfo", "arch", "lshw", "numactl", "turbostat", "sensors", "smartctl", "hdparm", "nvme", "strace", "ltrace", "perf", "sysctl", "modprobe", "lsmod", "insmod", "rmmod", "modinfo", "depmod", "bpftool", "ebpf", "slabtop", "page-types", "fuser", "lsof", "execsnoop", "biolatency"
  ])
);

/**
 * 💡 获取按用户使用频率倒序排序的 Linux 命令全量清单
 */
export function getSortedLinuxCommandNames(): string[] {
  const usageMap = getCommandUsageMap();
  return [...RAW_COMMAND_NAMES].sort((a, b) => {
    const freqA = usageMap[a] || 0;
    const freqB = usageMap[b] || 0;
    if (freqB !== freqA) {
      return freqB - freqA; // 经常使用的排在最上面
    }
    return a.localeCompare(b);
  });
}

export const ALL_LINUX_COMMAND_NAMES: string[] = getSortedLinuxCommandNames();

export function getShellSuggestion(
  input: string,
  historyCommands: string[] = [],
  userCommands: string[] = []
): string | null {
  if (!input || !input.trim()) return null;
  const rawInput = input.trimStart();
  const lowerInput = rawInput.toLowerCase();

  // 1. Search in history commands (sorted by recency)
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

  // 3. Command Name Completion (sorted by user usage frequency)
  if (!rawInput.includes(" ")) {
    const sortedCommands = getSortedLinuxCommandNames();
    const matchedCmd = sortedCommands.find(
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
