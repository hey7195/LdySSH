import type { CommandFolder } from "./bridge";

export type CommandSuggestionSource = "history" | "shortcut" | "linux";
export type CommandSuggestionApplyKey = "tab" | "ctrlSpace" | "altEnter" | "custom";

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

export const defaultCommandSuggestionApplyKey: CommandSuggestionApplyKey = "altEnter";
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
  { label: "ls", command: "ls -la" },
  { label: "cd", command: "cd " },
  { label: "cat", command: "cat " },
  { label: "grep", command: "grep -R " },
  { label: "find", command: "find . -name " },
  { label: "systemctl status", command: "systemctl status " },
  { label: "journalctl", command: "journalctl -u " },
  { label: "docker ps", command: "docker ps" },
  { label: "podman ps", command: "podman ps" },
  { label: "ps", command: "ps aux" },
  { label: "top", command: "top" },
  { label: "free", command: "free -m" },
  { label: "df", command: "df -h" },
  { label: "du", command: "du -sh *" },
  { label: "tar", command: "tar -czf archive.tar.gz " },
  { label: "curl", command: "curl -I " },
  { label: "wget", command: "wget " },
  { label: "ssh", command: "ssh user@host" },
  { label: "scp", command: "scp " },
  { label: "iptables", command: "iptables -L -n" }
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

const LINUX_COMMAND_SUGGESTIONS: Array<Omit<CommandSuggestion, "id" | "source">> = [
  ...LINUX_COMMANDS,
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

  return suggestions.slice(0, limit);
}

export function isFullScreenCommand(command: string) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const firstCommand = tokens[0] === "sudo" ? tokens[1] : tokens[0];
  if (!firstCommand) return false;
  const executable = firstCommand.split(/[\\/]/).at(-1) || firstCommand;
  return FULL_SCREEN_COMMANDS.has(executable);
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
