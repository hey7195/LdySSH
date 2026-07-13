# LdySSH 操作手册

LdySSH 是一个面向日常运维的 Windows SSH 客户端。当前版本由 C++ 桌面壳、WebView2 前端和本地 Python API 组成，核心目标是把 SSH 会话、本地类 Linux 终端、SFTP 文件管理、命令库、智能提示、AI 辅助、主机监控和常用网页入口放到一个工作台里。

## 1. 功能说明

### 1.1 主机管理

- 支持新增、编辑、删除 SSH 主机。
- 支持密码登录、私钥登录、私钥口令。
- 支持跳板机和代理参数。
- 编辑已保存主机时，密码使用 `***` 占位，未修改时保留原密码。
- 删除主机前会弹出确认，避免误删。
- 最近主机和主机列表都可以直接发起连接。
- 连接失败且密码缺失或不可用时，会弹出密码输入框，输入后重试当前连接。
- 支持未知主机密钥确认，避免静默信任陌生主机。

### 1.2 SSH 终端

- 支持多 SSH 会话和多标签页。
- 支持断开、重连、关闭、复制会话等常用操作。
- 切换左侧功能区或右侧工作栏时保留终端输出。
- 终端尺寸会在连接成功后同步到远端，减少进入 `vim`、`top`、`less` 等全屏程序时的显示和输入异常。
- 终端输入走原生 Base64 通道，避免 WebView 字符集和控制字符破坏输入。
- 支持终端搜索，覆盖当前保留的历史输出。

### 1.3 本地终端

- 点击左侧“本地”可以打开 Local Shell。
- 本地终端优先使用随包内置的 BusyBox for Windows：

```text
tools\busybox\busybox.exe sh -l
```

- 如果内置 BusyBox 缺失，会按顺序回退：

```text
Git Bash -> WSL -> PowerShell -> CMD
```

- BusyBox 提供常用类 Linux 命令，例如 `sh`、`ls`、`cat`、`grep`、`find`、`awk`、`sed`、`tar`、`wget` 等，目标是接近 MobaXterm 本地终端的基础体验。

### 1.4 SFTP 文件管理

- SSH 会话右侧“文件”面板可浏览远端目录。
- 支持上传、下载、直接下载到指定路径、取消传输。
- 支持创建目录、删除、重命名。
- 下载和上传有进度状态。
- 支持打开本地下载文件。
- 支持远端文件内容下载、编辑后同步上传。

### 1.5 命令库

- 支持命令文件夹和命令的新增、编辑、删除。
- 支持命令描述。
- 删除命令或文件夹前会确认。
- 支持从 FinalShell 命令 JSON 导入。
- 支持 LdySSH 命令库 JSON 的本地导入和导出。
- 终端右侧“命令”面板展示当前命令库，固定尺寸显示，长命令不撑开终端区域。
- 命令可直接发送到当前活动终端。
- 含参数占位的快捷命令会先弹出参数输入面板，再发送到终端。

参数占位格式：

```text
[p#1 端口]
[p#2 关键字]
```

示例：

```text
sudo iptables -t nat -nL | grep [p#1 端口]
```

### 1.6 命令智能提示

- 终端输入命令时会显示候选命令。
- 候选来源支持三个独立开关：
  - 历史命令
  - 快捷命令
  - 内置 Linux 命令
- 默认补齐按键是 `Alt+Enter`。
- `Enter` 默认仍执行当前已输入命令，不会因为出现候选项而误补齐。
- `Tab` 不再作为默认补齐键，用户仍可在设置中手动改回。
- 可在设置里选择补齐按键：
  - `Alt+Enter`
  - `Ctrl+Space`
  - `Tab`
  - 自定义按键
- 自定义按键使用“录入按键”按钮配置。
- 方向键上下切换候选，`Esc` 关闭候选。
- 快捷命令如果包含参数，占用补齐键后会打开参数面板，行为和手动点击快捷命令一致。

### 1.7 AI 辅助

- 支持本地 Codex CLI。
- 支持 Hermes WebUI。
- Hermes 使用 Base URL、用户名、密码登录，不依赖手工填写 Token。
- 支持 Hermes HTTP、Socket.IO polling 和可选 WSS 地址。
- 支持把当前终端选择内容作为 AI 上下文。
- 支持上传文本文件、上传图片、粘贴图片作为附件。
- Codex 执行会以后台任务方式运行，界面轮询任务结果。
- AI 输出会过滤过程噪声，优先展示最终答复。

### 1.8 主机监控

- 支持读取活动 SSH 会话的系统信息。
- 展示 CPU、内存、磁盘、进程、网络等信息。
- 监控数据以图表和表格展示，不直接把 JSON 原文丢给用户。

### 1.9 端口转发

后端支持 SSH 端口转发能力：

- 本地端口转发，对应 `ssh -L`。
- 远程端口转发，对应 `ssh -R`。
- 动态端口转发，对应 `ssh -D`，可作为 SOCKS 代理。
- 支持查看和停止已有转发。

### 1.10 网页入口

- 左侧“网页”支持自定义常用网页卡片。
- 每张卡片包含标题和 URL。
- 点击后调用系统外部浏览器打开。
- WebView2 默认右键菜单已禁用，避免误触刷新、另存为、检查等浏览器操作。

### 1.11 设置

- 支持浅色和深色界面。
- 支持终端主题、字体、字号、前景色、背景色。
- 支持终端背景图和遮罩透明度。
- 支持正则高亮规则。
- 支持命令智能提示开关、候选来源开关和补齐按键配置。

## 2. 数据和配置

用户数据保存在本机用户配置目录，不应放入发布包：

- SSH 主机配置
- 命令库
- 网页收藏
- AI 附件
- 终端设置

发布包只放程序、UI 资源和内置工具链。

## 3. 目录结构

```text
.
├─ frontend/                 # React + Vite 前端源码
├─ prismssh-cpp/             # C++ WebView2 桌面壳和原生能力
│  ├─ ui/                    # 前端构建后同步到 C++ 工程的 UI 资源
│  └─ x64/Release/           # Release 输出目录
├─ src/                      # Python 本地 API、SSH、SFTP、命令库、AI 桥接
│  └─ ui/                    # Python 运行时可访问的 UI 资源
├─ tests/                    # Python 测试
├─ tools/
│  └─ busybox/               # 内置 BusyBox 本地类 Linux 终端
├─ prismssh.py               # Python API 启动入口
├─ requirements.txt          # Python 依赖
└─ README.md                 # 操作手册
```

## 4. 环境要求

### 4.1 运行环境

- Windows 10/11 x64。
- Microsoft Edge WebView2 Runtime。
- 如果运行完整源码版，需要 Python 3.10+ 和依赖环境。
- 如果运行当前 C++ 发布包，直接解压后运行 `prismssh-cpp.exe`。

### 4.2 开发环境

- Windows 10/11 x64。
- Python 3.10+。
- uv。
- Node.js 20+ 或 22+。
- Visual Studio 2022 Build Tools。
- 安装 `Desktop development with C++`，使用 v143 工具集。
- Microsoft Edge WebView2 Runtime。

## 5. 开发初始化

在仓库根目录执行：

```powershell
uv venv
uv pip install -r requirements.txt
```

安装前端依赖：

```powershell
cd frontend
npm install
cd ..
```

## 6. 本地开发

启动前端开发服务：

```powershell
cd frontend
npm run dev
```

构建前端并同步 UI 资源：

```powershell
cd frontend
npm run build
cd ..
```

`npm run build` 会执行 TypeScript 编译、Vite 构建，并同步 UI 到：

- `src/ui`
- `prismssh-cpp/ui`
- `prismssh-cpp/x64/Release/ui`

## 7. 验证

Python 测试：

```powershell
uv run --with pytest python -m pytest tests
```

前端测试：

```powershell
cd frontend
npm test
cd ..
```

前端类型检查和构建：

```powershell
cd frontend
npm run build
cd ..
```

C++ Release 编译：

```powershell
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe' prismssh-cpp\prismssh-cpp.vcxproj /p:Configuration=Release /p:Platform=x64 /m
```

## 8. 打包

先完成前端构建和 C++ Release 编译：

```powershell
cd E:\adb\tools\LdSSH
cd frontend
npm run build
cd ..
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe' prismssh-cpp\prismssh-cpp.vcxproj /p:Configuration=Release /p:Platform=x64 /m
```

推荐发布包结构：

```text
LdySSH-Release/
├─ prismssh-cpp.exe
├─ WebView2Loader.dll
├─ ui/
├─ tools/
│  └─ busybox/
│     ├─ busybox.exe
│     ├─ README.txt
│     └─ SHA256SUM
├─ README.md
└─ LICENSE
```

不要放入发布包：

- `prismssh-cpp.exe.WebView2/`
- `prismssh_debug.log`
- `*.pdb`
- `*.obj`
- `*.tlog`
- `frontend/node_modules/`
- `frontend/dist/`
- `.pytest_cache/`
- `.venv/`
- `__pycache__/`

生成 ZIP 示例：

```powershell
$version = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = "artifacts\LdySSH-Release-$version"
$zip = "$stage.zip"
Remove-Item $stage, $zip -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item prismssh-cpp\x64\Release\prismssh-cpp.exe $stage
Copy-Item prismssh-cpp\x64\Release\WebView2Loader.dll $stage
Copy-Item prismssh-cpp\x64\Release\ui $stage -Recurse
Copy-Item tools $stage -Recurse
Copy-Item README.md, LICENSE $stage
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
```

检查 ZIP 内容：

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipFile = Resolve-Path $zip
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipFile)
try {
  $archive.Entries | ForEach-Object FullName
} finally {
  $archive.Dispose()
}
```

必须包含：

- `prismssh-cpp.exe`
- `WebView2Loader.dll`
- `ui/template.html`
- `tools/busybox/busybox.exe`

## 9. 部署和运行

### 9.1 普通用户运行

1. 安装 Microsoft Edge WebView2 Runtime。
2. 下载 Release ZIP。
3. 解压到固定目录，例如：

```text
D:\tools\LdySSH
```

4. 双击运行：

```text
prismssh-cpp.exe
```

也可以用 PowerShell 启动，便于查看当前目录和排查问题：

```powershell
cd D:\tools\LdySSH
.\prismssh-cpp.exe
```

### 9.2 本地终端验证

打开 Local Shell 后执行：

```sh
echo ok
ls
grep --help
```

如果这些命令可用，说明内置 BusyBox 已加载。

### 9.3 开发者运行

如果需要从源码调试：

```powershell
uv venv
uv pip install -r requirements.txt
cd frontend
npm install
npm run build
cd ..
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe' prismssh-cpp\prismssh-cpp.vcxproj /p:Configuration=Release /p:Platform=x64 /m
.\prismssh-cpp\x64\Release\prismssh-cpp.exe
```

## 10. 发布到 GitHub

设置 GitHub 远端：

```powershell
git remote add github https://github.com/hey7195/LdySSH.git
```

如果远端已存在：

```powershell
git remote set-url github https://github.com/hey7195/LdySSH.git
```

推送主分支：

```powershell
git push github main
```

创建标签：

```powershell
git tag vYYYY.MM.DD
git push github vYYYY.MM.DD
```

在 GitHub Releases 页面创建发布，上传 `artifacts\LdySSH-Release-*.zip`。

## 11. 常见问题

### 11.1 Local Shell 不是 Linux 命令环境

检查发布包内是否存在：

```text
tools\busybox\busybox.exe
```

缺失时程序会回退 Git Bash、WSL、PowerShell、CMD。

### 11.2 智能提示挡住输入

候选框只显示有限候选，默认需要 `Alt+Enter` 才补齐。可以在设置里关闭智能提示，或者关闭历史、快捷命令、Linux 命令任意来源。

### 11.3 输入 `ls` 后按 Enter 被补齐

当前版本默认不会这样做。`Enter` 执行当前输入，`Alt+Enter` 才应用候选。若设置里改成了 Tab 或自定义键，以设置为准。

### 11.4 快捷命令带参数怎么输入

快捷命令包含 `[p#1 名称]` 这类参数占位时，点击命令或按补齐键都会先打开参数面板。填写参数后再发送。

### 11.5 进入 vim 后无法输入

当前终端输入改为更接近 JumpServer 网页端的直通方式，控制字符不会被错误拦截。若仍异常，先确认终端尺寸已同步，再检查远端 shell、TERM、vim 配置。

### 11.6 Hermes 提示未认证

在 AI 配置里填写 Hermes Base URL、用户名和密码。LdySSH 会先登录再发起会话。

### 11.7 Hermes Socket.IO 超时

先确认 Base URL 能访问，账号密码能登录 WebUI。如果内网代理或反向代理不支持 Socket.IO polling，可以改填 WSS 地址。

### 11.8 连接失败后没有密码

如果主机没有保存密码，或者保存的密码不可用，连接失败后会弹出密码输入框。输入后会重试当前会话。

### 11.9 终端背景太暗

到设置里调低背景遮罩透明度。数值越低，背景图越明显。

### 11.10 FinalShell 命令怎么导入

在命令库面板点击“导入 FinalShell”，选择 FinalShell 导出的命令 JSON 文件。导入后可以继续用 LdySSH 的本地导入、导出功能备份。

## 12. BusyBox 说明

内置 BusyBox for Windows 用于提供本地类 Linux 终端。

- 来源：<https://frippery.org/busybox/>
- 打包文件：`tools\busybox\busybox.exe`
- 启动方式：`busybox.exe sh -l`
- SHA256 记录在 `tools\busybox\README.txt`

## 13. 许可证

本项目使用 [MIT License](LICENSE)。
