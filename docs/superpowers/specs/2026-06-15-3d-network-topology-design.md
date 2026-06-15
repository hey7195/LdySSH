# LdySSH v2.0 - 3D WebGL 集群网络拓扑看板 (方案 B) 设计规格书

本项目旨在为开源轻量级 SSH 客户端 LdySSH v2.0 设计并实现 **3D WebGL 集群网络拓扑看板**。在用户选定的**方案 B (经典卡片 + 浮动 3D 拓扑面板 / Hybrid Drawer)** 下，本文档细化了其视觉、交互、技术架构以及接口协议的设计。

---

## 1. 业务价值与目的

*   **直观集群全局感知**：提供可视化 3D 网络拓扑结构，使用户一目了然看清多机房、多节点的集群连通状态与流量路由关系。
*   **极高人机交互品质**：将传统单调的文本/表格主机列表，升华为富有未来科技感的 3D WebGL 硬件加速看板。
*   **业务操作闭环**：不仅是展示看板，还支持点击 3D 节点直接进行“快捷 SSH 连接”和“发起 SFTP 队列传输”，达成“看板即控制”的直观体验。

---

## 2. 界面与交互流 (UI & Interaction Flow)

### 2.1 主界面布局
*   **默认态 (Closed State)**：主界面左侧保留简洁、实用的主机卡片列表（包含 IP、自定义名称、SSH 状态及延迟）。
*   **3D 入口**：在右上角显著位置增加一个高科技感的毛玻璃质感圆形图标按钮：`[🌐 3D集群拓扑]`。
*   **展开态 (Opened State)**：
    *   点击入口按钮，触发贝塞尔曲线动效 (`transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)`)，上方/侧边滑入半透明的抽屉式浮层（占屏幕比例约 60%）。
    *   抽屉内嵌 WebGL WebView2，加载 Three.js 构建 of 3D 星系/节点渲染层。

### 2.2 3D 场景交互
*   **自由视角控制**：支持使用鼠标滚轮进行缩放，左键按住旋转视角，右键平移。
*   **主机节点状态视觉指示**：
    *   **连通性**：绿光球体 (延迟 < 50ms)、黄光球体 (延迟 50~150ms)、红光闪烁球体 (连接断开)。
    *   **标签悬浮**：球体上方使用 `CSS2DRenderer` 悬浮显示 IP 和别名标签。
    *   **路由连线**：节点与网关之间有发光霓虹激光线条连接，线条上的发光微粒流动速度对应实时网络流量大小。
*   **节点选中反馈**：
    *   单击 3D 节点，该节点四周生成环绕式旋转光环，且主界面的主机卡片同步亮起。
    *   双击 3D 节点，或者点击节点弹出框中的 `[连接终端]`，即可直接激活对应的 SSH Terminal 会话。

---

## 3. 技术架构设计

```mermaid
graph TD
    subgraph UI_Layer [主机卡片 UI (pywebview HTML/JS)]
        MainCards[主机列表卡片]
        Drawer[3D 拓扑抽屉]
        ThreeJS[Three.js WebGL 渲染管线]
    end

    subgraph Bridge_Layer [通信桥接 (RPC)]
        PyBridge[pywebview RPC / window.pywebview.api]
    end

    subgraph Native_Layer [C++ 核心引擎 (LdySSH Core)]
        PingEngine[C++ 心跳探测引擎]
        ConfigMgr[主机配置管理器]
        TerminalMgr[SSH 终端会话管理器]
    end

    MainCards <-->|点击交互/数据双向绑定| Drawer
    Drawer -->|嵌入加载| ThreeJS
    ThreeJS <-->|RPC 事件调用| PyBridge
    PyBridge <-->|C++ API 交互| Native_Layer
    PingEngine -->|定时推延迟/状态| PyBridge
```

### 3.1 3D 前端渲染 (Three.js)
*   **核心引擎**：引入离线打包的 `three.min.js` 和 `OrbitControls.js`，保证无网环境可靠加载。
*   **粒子背景**：在场景中混入由 1000+ 星空微粒 (`Points`) 组成的缓缓自转暗星空，提升 3D 看板的景深与品质感。
*   **CPU/GPU 负载平衡**：
    *   所有 3D 球体采用统一的 `InstancedMesh` 渲染以减少 WebGL draw calls。
    *   线条粒子流使用着色器 (`ShaderMaterial`) 在 GPU 中进行动画计算，避免由于粒子数量多引起 CPU 占用增高。

### 3.2 pywebview 双向 RPC 协议
1.  **C++ 推送主机状态至前端 (`C++ -> JS`)**：
    *   C++ 的心跳探测线程每 5 秒发起一次并发非阻塞 ping/TCP 连通性测试。
    *   当心跳延迟有变动时，C++ 向 WebView2 发送指令：
        ```javascript
        window.updateNodeDelay("192.168.1.100", 24, "connected");
        ```
    *   前端 Three.js 接收后，动态平滑改变对应 Node 的发光材质颜色和连线微粒流动速度。
2.  **前端调用 C++ 连接主机 (`JS -> C++`)**：
    *   用户在 3D 拓扑中双击节点或点击“连接”：
        ```javascript
        window.pywebview.api.connect_host("192.168.1.100");
        ```
    *   C++ 端接收到 IP 参数，拉起 libssh2 会话并初始化终端窗口。

---

## 4. 容错与优雅降级 (Robustness & Fallback)

*   **WebGL 硬件检测降级**：
    *   在加载 Three.js 时首先运行 WebGL 兼容性检测。若用户的运行环境（例如虚拟机或未装显卡驱动的旧服务器）不支持 WebGL 硬件加速，系统将静默降级为基于 Canvas 2D 的拓扑关系图。
    *   同时向用户右上角提示：“当前设备不支持 WebGL，已切换到极速 2D 拓扑视角”。
*   **WebView2 加载自愈**：
    *   若 WebView2 在渲染抽屉时由于内存不足发生异常崩溃，C++ 容器层将捕获异常并重新 reload 渲染进程，恢复拓扑看板。

---

## 5. 校验与验证方案 (Verification Plan)

### 5.1 自动化测试
*   运行心跳保活和数据包发送测试：验证 C++ 心跳探测引擎在后台以 5s 周期向多节点发送包时的 CPU 损耗，需确保多文件 SFTP 高带宽传输时 3D 重绘不卡顿。

### 5.2 手动验证
*   **视觉确认**：展开 3D 拓扑抽屉，观察缓动动画是否丝滑，粒子星云背景自转是否正常。
*   **功能联动**：
    *   手动关闭某台测试主机，观察 3D 看板上的节点是否在 5 秒内由绿色变红色，并闪烁告警。
    *   双击 3D 节点，验证是否正确拉起了 SSH 命令行会话。
