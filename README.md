# LdSSH

LdSSH 是一个面向日常运维的 Windows SSH 客户端。当前版本由 C++ 桌面壳、WebView2 前端和 Python 本地 API 组成，重点放在主机管理、多终端会话、命令库、AI 辅助、监控面板和常用网页入口。

## 功能概览

### 主机管理

- 新增、编辑、删除 SSH 主机。
- 删除主机前弹出确认框，避免误删。
- 已保存密码在编辑时使用 `***` 占位，未修改时保留原密码。
- 支持密码登录和私钥登录，私钥路径可以通过本地文件选择器浏览。
- 连接失败时弹出密码输入框，可直接补充密码并重试当前连接。
- 最近主机和主机列表都可以直接发起连接。

### 终端工作台

- 支持本地终端和 SSH 终端多会话。
- 会话支持复制、重连、断开、关闭等常用操作。
- 切换状态栏或工作区时保留终端输出。
- 终端内置搜索，覆盖未达到记录上限的历史输出，使用方式接近 FinalShell 查找。
- 可配置终端背景图、背景遮罩透明度、字体、字号、前景色和背景色。
- 支持会话侧边栏和本地侧边栏之间的会话恢复。

### 命令库

- 支持命令文件夹和命令的新增、编辑、删除。
- 删除命令和命令文件夹前弹出确认框。
- 支持从 FinalShell 命令文件导入。
- 支持本地导入、导出命令库 JSON。
- 终端侧边命令文件夹固定宽度显示，长名称自动换行，不再因为选择不同分类导致位置跳动。

### AI 对话

- 支持本地 Codex CLI 和 Hermes WebUI。
- Hermes 使用账号密码登录，不再依赖单独填写 API Token。
- 支持 Hermes HTTP、Socket.IO polling 和可选 WSS 地址。
- AI 输出做了降噪处理，默认聚焦最终回复，过程信息按模式折叠。
- 支持上传文件、上传图片和直接粘贴图片，附件会保存到本地配置目录后随提示词发送。
- 普通对话不需要审批流程。

### 监控与工具

- 主机监控信息图形化展示，包括 CPU、内存、磁盘、进程和网络数据。
- 浏览器状态栏支持自定义网页卡片，每张卡片包含标签和 URL，点击后调用系统浏览器打开。
- 禁用 WebView2 默认右键菜单，避免弹出刷新、另存为、检查等浏览器菜单。
- 支持正则高亮和常用界面主题设置。

## 目录结构

```text
.
├─ frontend/                 # React + Vite 前端源码
├─ prismssh-cpp/             # C++ WebView2 桌面壳和原生能力
│  ├─ ui/                    # 前端构建后同步到 C++ 工程的 UI 资源
│  └─ x64/Release/           # Release 输出目录
├─ src/                      # Python 本地 API、SSH、命令库、AI 桥接
│  └─ ui/                    # Python 运行时可访问的 UI 资源
├─ tests/                    # Python 测试
├─ prismssh.py               # Python API 启动入口
├─ requirements.txt          # Python 依赖
└─ README.md
```

## 开发环境

- Windows 10/11 x64。
- Python 3.10+。
- Node.js 20+。
- Visual Studio 2022 Build Tools，安装 `Desktop development with C++`，使用 v143 工具集。
- Microsoft Edge WebView2 Runtime。

Python 依赖：

```powershell
uv venv
uv pip install -r requirements.txt
```

前端依赖：

```powershell
cd frontend
npm install
```

## 本地开发

启动前端开发服务：

```powershell
cd frontend
npm run dev
```

构建前端并同步 UI 资源：

```powershell
cd frontend
npm run build
```

`npm run build` 会执行 TypeScript 编译、Vite 构建，并把最新 UI 资源同步到：

- `src/ui`
- `prismssh-cpp/ui`
- `prismssh-cpp/x64/Release/ui`

## 验证

前端类型检查：

```powershell
cd frontend
npm run typecheck
```

前端测试：

```powershell
cd frontend
npm test
```

Python 测试：

```powershell
.\.venv\Scripts\python -m pytest
```

Release 编译：

```powershell
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\amd64\MSBuild.exe' prismssh-cpp\prismssh-cpp.vcxproj /p:Configuration=Release /p:Platform=x64
```

## 打包

先完成前端构建和 C++ Release 编译：

```powershell
cd E:\adb\tools\LdSSH
cd frontend
npm run build
cd ..
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\amd64\MSBuild.exe' prismssh-cpp\prismssh-cpp.vcxproj /p:Configuration=Release /p:Platform=x64
```

推荐发布包内容：

```text
LdSSH-Release/
├─ prismssh-cpp.exe
├─ WebView2Loader.dll
├─ ui/
├─ prismssh.py
├─ src/
├─ requirements.txt
├─ README.md
└─ LICENSE
```

不要把下面这些目录或文件放入发布包：

- `prismssh-cpp.exe.WebView2/`
- `prismssh_debug.log`
- `*.pdb`
- `*.obj`
- `*.tlog`
- `__pycache__/`

生成 ZIP 示例：

```powershell
$version = Get-Date -Format 'yyyyMMdd-HHmm'
$stage = "artifacts\LdSSH-Release-$version"
$zip = "$stage.zip"
Remove-Item $stage, $zip -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item prismssh-cpp\x64\Release\prismssh-cpp.exe $stage
Copy-Item prismssh-cpp\x64\Release\WebView2Loader.dll $stage
Copy-Item prismssh-cpp\x64\Release\ui $stage -Recurse
Copy-Item prismssh.py, requirements.txt, README.md, LICENSE $stage
Copy-Item src $stage -Recurse -Exclude __pycache__
Get-ChildItem $stage -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
```

## 部署与运行

1. 在目标 Windows 机器安装 Python 3.10+ 和 Microsoft Edge WebView2 Runtime。
2. 解压发布包到固定目录，例如 `D:\tools\LdSSH`。
3. 在解压目录安装 Python 依赖：

```powershell
uv venv
uv pip install -r requirements.txt
```

4. 双击运行：

```powershell
.\prismssh-cpp.exe
```

也可以用 PowerShell 启动，便于排查问题：

```powershell
.\prismssh-cpp.exe
```

程序会在本机启动 Python API，C++ 壳会通过 WebView2 加载打包后的 UI。用户配置、命令库、AI 附件和连接信息保存在本机用户配置目录，不建议放进发布包。

## 常见问题

### Hermes 提示未认证

在 AI 配置里填写 Hermes Base URL、用户名和登录密码。新版 Hermes WebUI 走账号密码登录，LdSSH 会先登录再发起会话。

### Hermes Socket.IO 超时

先确认 Base URL 能访问，账号密码能登录 WebUI。如果内网代理或反向代理不支持 Socket.IO polling，可以改填 WSS 地址。

### 连接失败后没有密码

如果主机没有保存密码，或者保存的密码不可用，连接失败后会弹出密码输入框。输入后会重试当前会话。

### 终端背景被黑色遮住

到设置里调整背景遮罩透明度。数值越低，背景图越明显。

### FinalShell 命令怎么导入

在命令库面板点击 `导入 FinalShell`，选择 FinalShell 导出的命令 JSON 文件。导入后可以继续用 LdSSH 的本地导入、导出功能备份。

## 许可证

本项目使用 [MIT License](LICENSE)。
