export interface RunoobCommand {
  name: string;
  desc: string;
  link: string;
  category: string;
}

export interface RunoobCategory {
  category: string;
  commands: Array<{ name: string; desc: string; link: string }>;
}

export const RUNOOB_LINUX_COMMAND_DATA: RunoobCategory[] = [
  {
    category: "文件管理",
    commands: [
      { name: "cat", link: "/linux/linux-comm-cat.html", desc: "连接并显示文件内容" },
      { name: "chattr", link: "/linux/linux-comm-chattr.html", desc: "更改文件属性" },
      { name: "chgrp", link: "/linux/linux-comm-chgrp.html", desc: "更改文件所属组" },
      { name: "chmod", link: "/linux/linux-comm-chmod.html", desc: "更改文件权限" },
      { name: "chown", link: "/linux/linux-comm-chown.html", desc: "更改文件所有者" },
      { name: "cksum", link: "/linux/linux-comm-cksum.html", desc: "计算文件校验和" },
      { name: "cmp", link: "/linux/linux-comm-cmp.html", desc: "逐字节比较两个文件" },
      { name: "diff", link: "/linux/linux-comm-diff.html", desc: "比较文件内容差异" },
      { name: "file", link: "/linux/linux-comm-file.html", desc: "识别文件类型" },
      { name: "find", link: "/linux/linux-comm-find.html", desc: "查找文件或目录" },
      { name: "git", link: "/linux/linux-comm-git.html", desc: "分布式版本控制" },
      { name: "cut", link: "/linux/linux-comm-cut.html", desc: "按列提取文本" },
      { name: "ln", link: "/linux/linux-comm-ln.html", desc: "创建软硬链接文件" },
      { name: "less", link: "/linux/linux-comm-less.html", desc: "分页查看文件内容" },
      { name: "locate", link: "/linux/linux-comm-locate.html", desc: "快速查找文件" },
      { name: "ls", link: "/linux/linux-comm-ls.html", desc: "列出目录内容与详细属性" },
      { name: "mv", link: "/linux/linux-comm-mv.html", desc: "移动或重命名文件" },
      { name: "od", link: "/linux/linux-comm-od.html", desc: "以八进制等格式输出文件" },
      { name: "paste", link: "/linux/linux-comm-paste.html", desc: "合并文件内容" },
      { name: "patch", link: "/linux/linux-comm-patch.html", desc: "为文件打补丁" },
      { name: "rm", link: "/linux/linux-comm-rm.html", desc: "删除文件或目录" },
      { name: "split", link: "/linux/linux-comm-split.html", desc: "分割大文件" },
      { name: "tee", link: "/linux/linux-comm-tee.html", desc: "输出重定向并保存" },
      { name: "touch", link: "/linux/linux-comm-touch.html", desc: "创建空白文件或修改时间戳" },
      { name: "which", link: "/linux/linux-comm-which.html", desc: "查找可执行文件路径" },
      { name: "cp", link: "/linux/linux-comm-cp.html", desc: "复制文件或目录" },
      { name: "whereis", link: "/linux/linux-comm-whereis.html", desc: "定位命令的二进制/源码/帮助" },
      { name: "scp", link: "/linux/linux-comm-scp.html", desc: "跨服务器安全复制文件" },
      { name: "awk", link: "/linux/linux-comm-awk.html", desc: "文本处理与分析工具" },
      { name: "rename", link: "/linux/linux-comm-rename.html", desc: "批量重命名文件" },
      { name: "realpath", link: "/linux/linux-comm-realpath.html", desc: "显示文件的绝对路径" },
      { name: "shred", link: "/linux/linux-comm-shred.html", desc: "安全覆盖抹除文件" }
    ]
  },
  {
    category: "文档编辑",
    commands: [
      { name: "comm", link: "/linux/linux-comm-comm.html", desc: "比较两个排序好的文件" },
      { name: "grep", link: "/linux/linux-comm-grep.html", desc: "强大的文本正则匹配搜索工具" },
      { name: "sed", link: "/linux/linux-comm-sed.html", desc: "流编辑器 (替换/插入/删除文本)" },
      { name: "sort", link: "/linux/linux-comm-sort.html", desc: "排序文本内容" },
      { name: "tr", link: "/linux/linux-comm-tr.html", desc: "字符替换或删除" },
      { name: "uniq", link: "/linux/linux-comm-uniq.html", desc: "去除重复行" },
      { name: "wc", link: "/linux/linux-comm-wc.html", desc: "统计文件行数、单词数与字节数" },
      { name: "vim", link: "/linux/linux-vim.html", desc: "功能极其强大的终端文本编辑器" },
      { name: "jq", link: "/linux/linux-comm-jq.html", desc: "命令行 JSON 解析与处理工具" },
      { name: "iconv", link: "/linux/linux-comm-iconv.html", desc: "转换文件编码 (UTF-8/GBK)" },
      { name: "dos2unix", link: "/linux/linux-comm-dos2unix.html", desc: "转换 CRLF 换行符为 Unix 格式" }
    ]
  },
  {
    category: "磁盘与维护",
    commands: [
      { name: "cd", link: "/linux/linux-comm-cd.html", desc: "切换当前工作目录" },
      { name: "df", link: "/linux/linux-comm-df.html", desc: "显示文件系统磁盘空间使用率" },
      { name: "du", link: "/linux/linux-comm-du.html", desc: "查看目录或文件占用磁盘空间大小" },
      { name: "mkdir", link: "/linux/linux-comm-mkdir.html", desc: "创建新目录" },
      { name: "pwd", link: "/linux/linux-comm-pwd.html", desc: "显示当前绝对工作路径" },
      { name: "mount", link: "/linux/linux-comm-mount.html", desc: "挂载磁盘或文件系统" },
      { name: "umount", link: "/linux/linux-comm-umount.html", desc: "卸载挂载的文件系统" },
      { name: "rmdir", link: "/linux/linux-comm-rmdir.html", desc: "删除空目录" },
      { name: "fdisk", link: "/linux/linux-comm-fdisk.html", desc: "磁盘 MBR/GPT 分区工具" },
      { name: "fsck", link: "/linux/linux-comm-fsck.html", desc: "检查并修复 Linux 文件系统" },
      { name: "mkfs", link: "/linux/linux-comm-mkfs.html", desc: "格式化创建 Ext4/XFS 文件系统" },
      { name: "lsblk", link: "/linux/linux-comm-lsblk.html", desc: "列出所有块设备与挂载节点" },
      { name: "parted", link: "/linux/linux-comm-parted.html", desc: "高级磁盘分区管理工具" }
    ]
  },
  {
    category: "网络通讯",
    commands: [
      { name: "netstat", link: "/linux/linux-comm-netstat.html", desc: "网络连接与端口监听状态" },
      { name: "ss", link: "/linux/linux-comm-ss.html", desc: "替代 netstat 的高效套接字统计" },
      { name: "ping", link: "/linux/linux-comm-ping.html", desc: "测试网络连通性与延迟" },
      { name: "ifconfig", link: "/linux/linux-comm-ifconfig.html", desc: "配置或显示网络接口 IP" },
      { name: "ip", link: "/linux/linux-comm-ip.html", desc: "强大的网络路由与网卡管理" },
      { name: "route", link: "/linux/linux-comm-route.html", desc: "显示与操作 IP 路由表" },
      { name: "traceroute", link: "/linux/linux-comm-traceroute.html", desc: "追踪数据包在网络中的路由路径" },
      { name: "dig", link: "/linux/linux-comm-dig.html", desc: "DNS 域名解析详细查询" },
      { name: "tcpdump", link: "/linux/linux-comm-tcpdump.html", desc: "网络抓包与数据包分析" },
      { name: "wget", link: "/linux/linux-comm-wget.html", desc: "命令行网络文件下载工具" },
      { name: "curl", link: "/linux/linux-comm-curl.html", desc: "强大的 HTTP/HTTPS 请求传输工具" },
      { name: "ufw", link: "/linux/linux-comm-ufw.html", desc: "Ubuntu/Debian 防火墙策略管理" },
      { name: "iptables", link: "/linux/linux-comm-iptables.html", desc: "Linux 内核包过滤防火墙配置" }
    ]
  },
  {
    category: "系统管理与进程",
    commands: [
      { name: "top", link: "/linux/linux-comm-top.html", desc: "实时显示进程与系统资源占用" },
      { name: "ps", link: "/linux/linux-comm-ps.html", desc: "查看当前运行进程状态快照" },
      { name: "kill", link: "/linux/linux-comm-kill.html", desc: "向指定进程发送信号 (SIGTERM/SIGKILL)" },
      { name: "pkill", link: "/linux/linux-comm-pkill.html", desc: "根据进程名称批量杀死进程" },
      { name: "free", link: "/linux/linux-comm-free.html", desc: "显示内存与 Swap 交换空间使用量" },
      { name: "uptime", link: "/linux/linux-comm-uptime.html", desc: "查看系统运行时间与平均负载 (Load)" },
      { name: "uname", link: "/linux/linux-comm-uname.html", desc: "显示内核版本与系统架构" },
      { name: "useradd", link: "/linux/linux-comm-useradd.html", desc: "创建新用户账号" },
      { name: "sudo", link: "/linux/linux-comm-sudo.html", desc: "以管理员/Root 身份执行命令" },
      { name: "systemctl", link: "/linux/linux-comm-systemctl.html", desc: "Systemd 后台服务控制工具" },
      { name: "journalctl", link: "/linux/linux-comm-journalctl.html", desc: "查看 Systemd 实时日志" }
    ]
  },
  {
    category: "备份与压缩",
    commands: [
      { name: "tar", link: "/linux/linux-comm-tar.html", desc: "打包与解压文件 (.tar.gz / .tar.bz2)" },
      { name: "gzip", link: "/linux/linux-comm-gzip.html", desc: "压缩文件为 .gz 格式" },
      { name: "gunzip", link: "/linux/linux-comm-gunzip.html", desc: "解压缩 .gz 文件" },
      { name: "zip", link: "/linux/linux-comm-zip.html", desc: "打包压缩为 .zip 文件" },
      { name: "unzip", link: "/linux/linux-comm-unzip.html", desc: "解压 .zip 压缩包" }
    ]
  }
];

export const FLAT_RUNOOB_COMMANDS = RUNOOB_LINUX_COMMAND_DATA.flatMap((cat) =>
  cat.commands.map((cmd) => ({ ...cmd, category: cat.category }))
);
