import type { CommandFolder } from "./bridge";
import { LINUX_SHELL_DICTIONARY, getCommandUsageFrequency } from "./terminalIntelliSense";

export type CommandSuggestionSource = "history" | "shortcut" | "linux";
export type CommandSuggestionApplyKey = "enter" | "tab" | "ctrlSpace" | "altEnter" | "custom";

export interface CommandSuggestionCustomApplyKey {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  label: string;
}

export interface CommandSuggestion {
  id: string;
  command: string;
  label: string;
  description?: string;
  source: CommandSuggestionSource;
  shortcut?: {
    folderId: string;
    commandId: string;
  };
}

export interface CommandSuggestionSources {
  history: boolean;
  shortcuts: boolean;
  linux: boolean;
}

const MAX_HISTORY_ITEMS = 80;
const MAX_SUGGESTIONS = 6;
const FULL_SCREEN_COMMANDS = new Set(["vi", "vim", "nvim", "nano", "less", "more", "man", "top", "htop", "watch", "tmux", "screen"]);

export const defaultCommandSuggestionApplyKey: CommandSuggestionApplyKey = "enter";
export const defaultCommandSuggestionSources: CommandSuggestionSources = {
  history: true,
  shortcuts: true,
  linux: true
};

const LINUXCOOL_COMMAND_DESCRIPTIONS: Record<string, string> = {
  "apt-get": "APT 软件包管理工具",
  cat: "在终端设备上显示文件内容",
  cd: "切换当前工作目录",
  chmod: "修改文件或目录权限",
  chown: "修改文件或目录所有者",
  cp: "复制文件或目录",
  curl: "传输 URL 数据",
  date: "显示或设置系统日期时间",
  df: "显示磁盘空间使用量情况",
  dig: "查询 DNS 域名解析信息",
  dmesg: "显示内核环形缓冲区信息",
  docker: "管理 Docker 容器和镜像",
  du: "统计文件或目录磁盘占用",
  echo: "输出字符串或提取后的变量值",
  find: "根据路径和条件搜索指定文件",
  free: "显示系统内存使用情况",
  grep: "强大的文本搜索工具",
  groupadd: "创建新的用户组",
  gunzip: "解压 gzip 压缩文件",
  gzip: "压缩或解压 gzip 文件",
  head: "查看文件开头内容",
  htop: "交互式进程监控工具",
  id: "显示用户与用户组信息",
  ifconfig: "显示或配置网络接口",
  ip: "显示或管理网络、路由和隧道",
  journalctl: "查看 systemd 日志",
  kill: "终止指定进程",
  killall: "按名称终止进程",
  less: "分页查看文件内容",
  lsb_release: "查看 LSB 版本信息",
  "lsb-release": "显示 Linux 发行版信息",
  ls: "显示目录中文件及其属性信息",
  lsblk: "列出块设备信息",
  lsof: "列出打开的文件",
  mkdir: "创建目录文件",
  mount: "将文件系统挂载到目录",
  mv: "移动或改名文件",
  nano: "文本编辑器",
  nc: "网络读写与端口调试工具",
  netstat: "显示网络状态",
  nmap: "网络探测和端口扫描工具",
  nslookup: "查询 DNS 域名解析",
  passwd: "修改用户密码",
  pgrep: "按条件查找进程 ID",
  ping: "测试主机网络连通性",
  pkill: "按名称终止进程",
  podman: "管理 Podman 容器和镜像",
  ps: "显示当前进程状态",
  pwd: "显示当前工作目录的路径",
  rm: "删除文件或目录",
  route: "显示或设置路由表",
  rpm: "RPM 软件包管理器",
  rsync: "远程数据同步工具",
  screen: "终端复用工具",
  scp: "安全复制文件",
  sed: "批量编辑文本文件",
  service: "管理系统服务",
  ss: "查看套接字统计信息",
  ssh: "安全的远程连接服务",
  sudo: "以其他用户身份执行命令",
  systemctl: "管理 systemd 服务",
  tail: "查看文件尾部内容",
  tar: "打包和解包归档文件",
  top: "实时显示进程动态",
  touch: "创建文件或修改文件时间",
  tree: "以树状结构列出目录内容",
  uname: "显示系统内核信息",
  umount: "卸载文件系统",
  unzip: "解压 zip 文件",
  useradd: "创建用户账户",
  usermod: "修改用户账户",
  watch: "周期性执行命令",
  wget: "下载网络文件",
  whoami: "显示当前用户名",
  yum: "YUM 软件包管理器",
  zip: "创建 zip 压缩文件"
};

const LINUX_COMMANDS: Array<Omit<CommandSuggestion, "id" | "source">> = [
  { label: "ls -la", command: "ls -la" },
  { label: "ls -lh", command: "ls -lh" },
  { label: "cd", command: "cd " },
  { label: "cat", command: "cat " },
  { label: "chmod +x", command: "chmod +x " },
  { label: "chmod 755", command: "chmod 755 " },
  { label: "chmod -R 755", command: "chmod -R 755 " },
  { label: "chown -R www-data", command: "chown -R www-data:www-data " },
  { label: "chown -R root", command: "chown -R root:root " },
  { label: "grep -rnI", command: "grep -rnI " },
  { label: "grep -i", command: "grep -i " },
  { label: "grep -E", command: "grep -E " },
  { label: "find . -name", command: "find . -name " },
  { label: "find / -size +100M", command: "find / -size +100M" },
  { label: "systemctl status", command: "systemctl status " },
  { label: "systemctl restart", command: "systemctl restart " },
  { label: "systemctl start", command: "systemctl start " },
  { label: "systemctl stop", command: "systemctl stop " },
  { label: "systemctl enable", command: "systemctl enable " },
  { label: "systemctl daemon-reload", command: "systemctl daemon-reload" },
  { label: "journalctl -u", command: "journalctl -u " },
  { label: "journalctl -f", command: "journalctl -f -n 100" },
  { label: "docker ps", command: "docker ps" },
  { label: "docker ps -a", command: "docker ps -a" },
  { label: "docker compose up -d", command: "docker compose up -d" },
  { label: "docker compose down", command: "docker compose down" },
  { label: "docker logs -f", command: "docker logs -f --tail 100 " },
  { label: "docker exec -it", command: "docker exec -it " },
  { label: "docker images", command: "docker images" },
  { label: "docker system prune", command: "docker system prune -f" },
  { label: "podman ps", command: "podman ps" },
  { label: "podman ps -a", command: "podman ps -a" },
  { label: "kubectl get pods", command: "kubectl get pods -A" },
  { label: "kubectl logs -f", command: "kubectl logs -f --tail=100 " },
  { label: "kubectl exec -it", command: "kubectl exec -it " },
  { label: "kubectl describe pod", command: "kubectl describe pod " },
  { label: "ps aux", command: "ps aux" },
  { label: "ps -ef", command: "ps -ef" },
  { label: "top", command: "top" },
  { label: "htop", command: "htop" },
  { label: "btop", command: "btop" },
  { label: "free -h", command: "free -h" },
  { label: "free -m", command: "free -m" },
  { label: "df -h", command: "df -h" },
  { label: "du -sh *", command: "du -sh *" },
  { label: "du -h --max-depth=1", command: "du -h --max-depth=1" },
  { label: "tar -zxvf", command: "tar -zxvf " },
  { label: "tar -czvf", command: "tar -czvf " },
  { label: "tar -xvf", command: "tar -xvf " },
  { label: "curl -I", command: "curl -I " },
  { label: "curl -v", command: "curl -v " },
  { label: "curl -X POST", command: "curl -X POST " },
  { label: "wget -c", command: "wget -c " },
  { label: "ssh", command: "ssh user@host" },
  { label: "scp -P 22", command: "scp -P 22 " },
  { label: "rsync -avz", command: "rsync -avz --progress " },
  { label: "netstat -tulnp", command: "netstat -tulnp" },
  { label: "ss -tuln", command: "ss -tuln" },
  { label: "ufw status", command: "ufw status verbose" },
  { label: "ufw allow 80", command: "ufw allow 80/tcp" },
  { label: "iptables -L -n", command: "iptables -L -n -v" },
  { label: "tail -f", command: "tail -f " },
  { label: "tail -n 100", command: "tail -n 100 " },
  { label: "sed 's/old/new/g'", command: "sed -i 's/old/new/g' " },
  { label: "awk '{print $1}'", command: "awk '{print $1}' " },
  { label: "kill -9", command: "kill -9 " },
  { label: "pkill -9", command: "pkill -9 " },
  { label: "crontab -l", command: "crontab -l" },
  { label: "crontab -e", command: "crontab -e" },
  { label: "dmesg -wH", command: "dmesg -wH --color=always" },
  { label: "perf top", command: "perf top -g" },
  { label: "strace -c -p", command: "strace -c -p " },
  { label: "lsof -i :8080", command: "lsof -i :8080" }
];

const LINUXCOOL_COMMAND_NAMES = [
  "ls",
  "cd",
  "cat",
  "cp",
  "mv",
  "rm",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "grep",
  "find",
  "sed",
  "awk",
  "tail",
  "head",
  "less",
  "more",
  "nano",
  "ps",
  "top",
  "htop",
  "free",
  "df",
  "du",
  "lsblk",
  "mount",
  "umount",
  "systemctl",
  "service",
  "journalctl",
  "dmesg",
  "ip",
  "ss",
  "netstat",
  "ping",
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "gzip",
  "gunzip",
  "zip",
  "unzip",
  "docker",
  "podman",
  "firewall-cmd",
  "crontab",
  "lsof",
  "tree",
  "date",
  "uname",
  "whoami",
  "id",
  "sudo",
  "su",
  "passwd",
  "useradd",
  "usermod",
  "groupadd",
  "kill",
  "killall",
  "pkill",
  "pgrep",
  "screen",
  "tmux",
  "watch",
  "nc",
  "nmap",
  "dig",
  "nslookup",
  "route",
  "ifconfig",
  "hostnamectl",
  "apt-get",
  "dpkg",
  "rpm",
  "yum",
  "fsview",
  "sln",
  "mkfifo",
  "install",
  "pinfo",
  "info",
  "manpath",
  "mshowfat",
  "nologin",
  "sulogin",
  "telinit",
  "makedev",
  "mread",
  "mren",
  "indent",
  "joe",
  "minicom",
  "newaliases",
  "mingetty",
  "vgchange",
  "pvremove",
  "vgextend",
  "pvcreate",
  "vgconvert",
  "pvscan",
  "dris",
  "bzmore",
  "bzless",
  "lftpget",
  "builtin",
  "apk",
  "apropos",
  "bmodinfo",
  "cancel",
  "clockdiff",
  "uucico",
  "semanage",
  "rpmverify",
  "lsusb",
  "setpci",
  "lvcreate",
  "lvextend",
  "e2image",
  "get-module",
  "kernelversion",
  "xset",
  "xlsfonts",
  "cdrecord",
  "pidof",
  "basename",
  "getopt",
  "runlevel",
  "setquota",
  "script",
  "rpcinfo",
  "repquota",
  "pmap",
  "dpkg-split",
  "dpkg-statoverride",
  "dpkg-trigger",
  "dpkg-reconfigure",
  "dpkg-query",
  "dpkg-preconfigure",
  "dpkg-divert",
  "dpkg-deb",
  "apt-key",
  "apt-sortpkgs",
  "ipvsadm",
  "gdisk",
  "mc",
  "iostat",
  "vigr",
  "enable",
  "symlinks",
  "iptraf-ng",
  "cu",
  "nethogs",
  "setserial",
  "dnsconf",
  "dirname",
  "sgdisk",
  "uuto",
  "swapon",
  "vgremove",
  "lvremove",
  "pvs",
  "lvdisplay",
  "pvck",
  "pvchange",
  "pvdisplay",
  "lvresize",
  "partprobe",
  "lvreduce",
  "crudini",
  "vgcreate",
  "vgdisplay",
  "source",
  "strings",
  "supervisord",
  "znew",
  "syslog",
  "speedtest-cli",
  "unrar",
  "trap",
  "iptables-save",
  "consoletype",
  "convertquota",
  "e2label",
  "hostid",
  "ip6tables-restore",
  "iptables-restore",
  "ip6tables-save",
  "ip6tables",
  "gdb",
  "gcc",
  "as",
  "mysqladmin",
  "gcov",
  "ldd",
  "ld",
  "mysql",
  "mysqlimport",
  "unprotoize",
  "unlink",
  "tcpreplay",
  "tput",
  "telint",
  "tailf",
  "tempfile",
  "mysqldump",
  "lspci",
  "vgrename",
  "nice",
  "lftp",
  "lscpu",
  "axel",
  "tac",
  "newusers",
  "mkswap",
  "mknod",
  "lvscan",
  "lynx",
  "sensors",
  "bzcat",
  "time",
  "timeconfig",
  "stat",
  "statserial",
  "smbd",
  "ytalk",
  "kbdconfig",
  "gitps",
  "lua",
  "at",
  "write",
  "whatis",
  "wall",
  "wait",
  "volname",
  "vgscan",
  "xargs",
  "xz",
  "squidclient",
  "smbpasswd",
  "showmount",
  "sendmail",
  "mysqlshow",
  "batch",
  "env",
  "tune2fs",
  "pr",
  "seinfo",
  "rename",
  "vimdiff",
  "uucp",
  "fsck-ext2",
  "uustat",
  "diff3",
  "uuname",
  "squid",
  "iptstate",
  "ssh-keyscan",
  "sshd",
  "bunzip2",
  "apmd",
  "minfo",
  "chroot",
  "rlogin",
  "skill",
  "nfsstat",
  "blockdev",
  "chsh",
  "history",
  "mouseconfig",
  "chkconfig",
  "test",
  "ssh-agent",
  "ssh-copy-id",
  "ssh-add",
  "type",
  "mii-tool",
  "hostname",
  "shapecfg",
  "ssh-keygen",
  "lsb-release",
  "httpd",
  "smbclient",
  "logsave",
  "sar",
  "iotop",
  "ifstat",
  "mtr",
  "mmove",
  "printf",
  "depmod",
  "arch",
  "xauth",
  "xhost",
  "startx",
  "sysctl",
  "modprobe",
  "kexec",
  "slabtop",
  "lsmod",
  "dos2unix",
  "bg",
  "fg",
  "nstat",
  "usernetctl",
  "rdate",
  "swatch",
  "mpstat",
  "rdev",
  "mail",
  "bye",
  "svgatextmode",
  "let",
  "bzip2recover",
  "mkkickstart",
  "dump",
  "tty"
];

// 动态全量展开 LINUX_SHELL_DICTIONARY 中所有的 命令 + 参数/选项 组合
const DICTIONARY_PARAMETRIZED_SUGGESTIONS: Array<Omit<CommandSuggestion, "id" | "source">> = LINUX_SHELL_DICTIONARY.flatMap((item) =>
  item.completions.map((comp) => {
    const fullCmd = `${item.prefix} ${comp}`.trim();
    return {
      label: fullCmd,
      command: fullCmd
    };
  })
);

const LINUX_COMMAND_SUGGESTIONS: Array<Omit<CommandSuggestion, "id" | "source">> = [
  ...LINUX_COMMANDS,
  ...DICTIONARY_PARAMETRIZED_SUGGESTIONS,
  ...LINUXCOOL_COMMAND_NAMES.map((command) => ({ label: command, command }))
];

export function recordCommandHistory(history: string[], command: string) {
  const trimmed = command.trim();
  if (!trimmed) return history;

  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY_ITEMS);
}

type CommandSuggestionBuildOptions = Partial<CommandSuggestionSources> & { limit?: number };

export function buildCommandSuggestions(
  prefix: string,
  history: string[],
  folders: CommandFolder[],
  optionsOrLimit: CommandSuggestionBuildOptions | number = MAX_SUGGESTIONS
): CommandSuggestion[] {
  const query = normalizeCommand(prefix);
  if (!query) return [];

  const sources = typeof optionsOrLimit === "number" ? defaultCommandSuggestionSources : { ...defaultCommandSuggestionSources, ...optionsOrLimit };
  const limit = typeof optionsOrLimit === "number" ? optionsOrLimit : optionsOrLimit.limit ?? MAX_SUGGESTIONS;
  const suggestions: CommandSuggestion[] = [];
  const seen = new Set<string>();
  const add = (suggestion: CommandSuggestion) => {
    const key = normalizeCommand(suggestion.command);
    if (!key || seen.has(key) || key === query || !key.startsWith(query)) return;
    seen.add(key);
    suggestions.push(suggestion);
  };

  if (sources.history) {
    history.forEach((command, index) => {
      add({
        id: `history-${index}-${command}`,
        label: command,
        command,
        description: describeCommand(command, command),
        source: "history"
      });
    });
  }

  if (sources.shortcuts) {
    folders.forEach((folder) => {
      folder.commands.forEach((command) => {
        add({
          id: `shortcut-${folder.id}-${command.id}`,
          label: command.name,
          command: command.command,
          description: command.name || describeCommand(command.command, command.command),
          source: "shortcut",
          shortcut: {
            folderId: folder.id,
            commandId: command.id
          }
        });
      });
    });
  }

  if (sources.linux) {
    LINUX_COMMAND_SUGGESTIONS.forEach((command, index) => {
      add({
        id: `linux-${index}`,
        ...command,
        description: command.description || describeCommand(command.command, command.label),
        source: "linux"
      });
    });
  }

  suggestions.sort((a, b) => {
    const freqA = getCommandUsageFrequency(a.command);
    const freqB = getCommandUsageFrequency(b.command);
    if (freqB !== freqA) {
      return freqB - freqA;
    }
    return 0;
  });

  return suggestions.slice(0, limit);
}

export function isFullScreenCommand(command: string) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const firstCommand = tokens[0] === "sudo" ? tokens[1] : tokens[0];
  if (!firstCommand) return false;
  const executable = firstCommand.split(/[\\/]/).at(-1) || firstCommand;
  return FULL_SCREEN_COMMANDS.has(executable);
}

export interface DangerousCommandInfo {
  isDangerous: boolean;
  patternName?: string;
  warningText?: string;
}

export interface CustomDangerousRule {
  id: string;
  name: string;
  pattern: string;
  warningText: string;
  enabled: boolean;
}

export interface AuditLogRecord {
  id: string;
  timestamp: number;
  command: string;
  patternName: string;
  warningText: string;
  action: "intercepted_cancelled" | "intercepted_force_sent";
  hostTitle?: string;
}

export function checkDangerousCommand(command: string, customRules: CustomDangerousRule[] = []): DangerousCommandInfo {
  const clean = command.trim();
  if (!clean) return { isDangerous: false };

  // 用户自定义高危规则优先审查
  for (const rule of customRules) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const reg = new RegExp(rule.pattern, "i");
      if (reg.test(clean)) {
        return {
          isDangerous: true,
          patternName: rule.name || "自定义高危拦截规则",
          warningText: rule.warningText || `匹配自定义拦截规则: ${rule.pattern}`
        };
      }
    } catch {
      // 忽略非法正则表达式
    }
  }

  // 1. Fork 炸弹特例识别
  if (/:{\s*:\|:&\s*};:/.test(clean.replace(/\s+/g, ""))) {
    return {
      isDangerous: true,
      patternName: "Fork 炸弹无限进程剥离",
      warningText: "Fork 炸弹会瞬间耗尽系统 CPU 与进程 PID 资源，导致服务器死机卡死！"
    };
  }

  // 按管道符 | 或命令连接符 ; && || 拆分出多个子命令独立审查
  const subCommands = clean.split(/;|&&|\|\||\|/).map((cmd) => cmd.trim()).filter(Boolean);

  for (const subCmd of subCommands) {
    const info = checkSingleCommandTokens(subCmd);
    if (info.isDangerous) return info;
  }

  return { isDangerous: false };
}

function checkSingleCommandTokens(rawCmd: string): DangerousCommandInfo {
  // Token 化处理
  const tokens = rawCmd.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { isDangerous: false };

  // 剔除前缀修饰符 sudo / doas / pkexec / env / nohup / time / xargs
  let startIndex = 0;
  while (startIndex < tokens.length) {
    const current = tokens[startIndex].toLowerCase();
    if (["sudo", "doas", "pkexec", "env", "nohup", "time", "xargs", "busybox"].includes(current)) {
      startIndex++;
      continue;
    }
    if (current.includes("=") && !current.startsWith("-")) {
      startIndex++;
      continue;
    }
    break;
  }

  const cmdTokens = tokens.slice(startIndex);
  if (cmdTokens.length === 0) return { isDangerous: false };

  const rawExec = cmdTokens[0];
  const exec = rawExec.split(/[\\/]/).at(-1)?.toLowerCase() || rawExec.toLowerCase();
  const args = cmdTokens.slice(1);

  // 1. rm 删除命令（支持参数在目标前、目标后或混合位置）
  if (exec === "rm") {
    let hasRecursive = false;
    let hasForce = false;
    let hasNoPreserveRoot = false;
    const targets: string[] = [];

    for (const arg of args) {
      if (arg === "--no-preserve-root") {
        hasNoPreserveRoot = true;
        continue;
      }
      if (arg.startsWith("--recursive")) {
        hasRecursive = true;
        continue;
      }
      if (arg.startsWith("--force")) {
        hasForce = true;
        continue;
      }
      if (arg.startsWith("-") && !arg.startsWith("--")) {
        const flags = arg.slice(1);
        if (/[rR]/.test(flags)) hasRecursive = true;
        if (/[fF]/.test(flags)) hasForce = true;
        continue;
      }
      targets.push(arg);
    }

    // 判断目标是否涉及危险路径、通配符或系统根目录
    const isDangerousTarget = targets.some((t) => {
      const cleanT = t.trim();
      return (
        cleanT === "/" ||
        cleanT === "/*" ||
        cleanT === "*" ||
        cleanT === "~" ||
        cleanT === "~/" ||
        cleanT === "." ||
        cleanT === "./" ||
        cleanT === ".." ||
        cleanT === "../" ||
        /^(\/|\*|~\/|\.\/|\.\.\/)+$/.test(cleanT) ||
        /^\/(bin|boot|dev|etc|home|lib|lib64|media|mnt|opt|proc|root|run|sbin|srv|sys|tmp|usr|var)(\/.*)?$/.test(cleanT)
      );
    });

    if (hasNoPreserveRoot || (hasRecursive && (isDangerousTarget || targets.length === 0))) {
      return {
        isDangerous: true,
        patternName: "rm 级联强制删除",
        warningText: `该命令包含 rm 递归删除参数，涉及路径 (${targets.join(" ") || "全盘"})，将导致数据永久不可逆清空！`
      };
    }
  }

  // 2. 关机与重启命令 (reboot, shutdown, poweroff, halt, init 0, init 6, systemctl reboot)
  if (["reboot", "shutdown", "poweroff", "halt"].includes(exec)) {
    return {
      isDangerous: true,
      patternName: "服务器关机与重启",
      warningText: "该命令将导致服务器立即断开所有网络与 SSH 连接并重启/关机！"
    };
  }

  if (exec === "init") {
    const firstArg = args[0];
    if (firstArg === "0" || firstArg === "6") {
      return {
        isDangerous: true,
        patternName: `init ${firstArg} 关机与重启`,
        warningText: `该命令 init ${firstArg} 将导致服务器立即关机或重启！`
      };
    }
  }

  if (exec === "systemctl") {
    const subCmd = args[0]?.toLowerCase();
    if (["reboot", "poweroff", "halt", "kexec", "suspend", "hibernate"].includes(subCmd)) {
      return {
        isDangerous: true,
        patternName: "systemctl 重启与关机",
        warningText: `systemctl ${subCmd} 会导致系统网络中断并关机重启！`
      };
    }
  }

  // 3. 磁盘格式化与分区改写 (mkfs, fdisk, gdisk, parted, sfdisk)
  if (exec.startsWith("mkfs") || ["fdisk", "gdisk", "parted", "sfdisk"].includes(exec)) {
    return {
      isDangerous: true,
      patternName: "磁盘格式化与分区改写",
      warningText: "格式化或改写磁盘分区表将直接抹除目标磁盘分区的全部文件数据！"
    };
  }

  // 4. dd 物理底层块覆盖
  if (exec === "dd") {
    const hasDangerousOf = args.some((arg) => {
      const lower = arg.toLowerCase();
      return lower.startsWith("of=/dev/") && !lower.startsWith("of=/dev/null") && !lower.startsWith("of=/dev/zero");
    });
    if (hasDangerousOf) {
      return {
        isDangerous: true,
        patternName: "dd 磁盘物理块改写",
        warningText: "直接向 /dev/ 块设备写入数据将破坏磁盘 MBR/GPT 分区表或存储介质！"
      };
    }
  }

  // 5. 全局 chmod / chown 递归修改 (chmod -R 777 /)
  if (exec === "chmod" || exec === "chown") {
    const hasRecursive = args.some((a) => a === "-R" || a === "-r" || a.startsWith("--recursive"));
    const hasGlobalPerm = args.some((a) => a === "777" || a === "0777" || a === "a+rwx");
    const hasRootTarget = args.some((a) => a === "/" || a === "/*" || a === "*" || a === ".");

    if (hasRecursive && (hasGlobalPerm || hasRootTarget)) {
      return {
        isDangerous: true,
        patternName: `${exec} -R 全局权限改写`,
        warningText: "将系统路径递归修改权限/所有者会导致 Linux 安全体系崩溃并无法再次通过 SSH 登录！"
      };
    }
  }

  // 6. 容器/集群全局毁灭性命令 (docker, kubectl)
  if (exec === "docker") {
    const joined = args.join(" ").toLowerCase();
    if (joined.includes("system prune -a") || joined.includes("rmi -f") || joined.includes("rm -f $(docker ps")) {
      return {
        isDangerous: true,
        patternName: "Docker 批量容器/镜像清空",
        warningText: "该命令将批量强制销毁所有运行中的容器或本地镜像！"
      };
    }
  }

  if (exec === "kubectl") {
    const joined = args.join(" ").toLowerCase();
    if (
      joined.includes("delete ns --all") ||
      joined.includes("delete namespace --all") ||
      joined.includes("delete all --all") ||
      joined.includes("delete node")
    ) {
      return {
        isDangerous: true,
        patternName: "Kubernetes 集群资源全量删除",
        warningText: "该命令将批量清空 K8s 命名空间、节点或全部集群 Workload 资源！"
      };
    }
  }

  return { isDangerous: false };
}

function normalizeCommand(command: string) {
  return command.trimStart().replace(/\s+/g, " ").toLowerCase();
}

function describeCommand(command: string, fallback: string) {
  const name = extractExecutableName(command);
  return LINUXCOOL_COMMAND_DESCRIPTIONS[name] || fallback;
}

function extractExecutableName(command: string) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const executable = tokens[0] === "sudo" ? tokens[1] : tokens[0];
  return (executable || command).split(/[\\/]/).at(-1)?.toLowerCase() || command.toLowerCase();
}
