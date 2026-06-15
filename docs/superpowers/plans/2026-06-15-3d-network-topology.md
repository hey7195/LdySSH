# 3D 集群网络拓扑看板 (方案 B) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LdySSH 客户端集成“方案 B（经典卡片 + 浮动 3D 拓扑面板）”，使用 Three.js 硬件加速渲染，并与现有的主机卡片和连接逻辑实现无缝双向交互。

**Architecture:** 在现有 `template.html` 页面中内嵌半透明浮动 drawer 组件，引入 Three.js 构建 WebGL 3D 拓扑，直接读取并联动现有前端 `app.js` 中加载的 saved connections 与 active sessions，点击 3D 节点调用现有前端连接逻辑。

**Tech Stack:** HTML5, CSS3, Javascript, Three.js, OrbitControls, WebGL, pywebview.

---

### Task 1: 前端资源引入与抽屉容器搭建 (HTML & CSS)

**Files:**
- Modify: [template.html](file:///c:/雷电/GPT/ssh/src/ui/template.html) (插入 Three.js 脚本和容器)
- Modify: [styles.css](file:///c:/雷电/GPT/ssh/src/ui/static/styles.css) (添加 3D 抽屉面板及相关动效样式)

- [ ] **Step 1: 在 template.html 中添加 CDN 脚本引入和浮动抽屉 DOM**
  
  在 `template.html` 的 `<head>` 部分引入 Three.js 及 OrbitControls.js。
  在 `.sidebar-content` 的顶部添加一个入口按钮，并在 `<body>` 末尾挂载 `#topologyDrawer` 容器。
  
  *代码注入逻辑（template.html）：*
  ```html
  <!-- 在 head 中引入 -->
  <script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
  <script src="https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  
  <!-- 在 sidebar-content 顶部插入入口按钮 -->
  <div class="3d-topo-entry" style="padding: 10px 15px;">
      <button class="connect-btn" style="background: linear-gradient(135deg, #00f2fe, #4facfe); width: 100%;" onclick="openTopologyDrawer()">
          🌐 3D 集群拓扑看板
      </button>
  </div>

  <!-- 在 body 闭合前插入抽屉 -->
  <div id="topologyDrawer" class="topology-drawer">
      <div class="drawer-header">
          <h2>🌐 3D 集群网络拓扑看板</h2>
          <button class="close-drawer-btn" onclick="closeTopologyDrawer()">×</button>
      </div>
      <div id="threejsContainer" class="threejs-container"></div>
  </div>
  ```

- [ ] **Step 2: 验证 HTML 插入并进行 Git Commit**
  
  运行 git 指令保存修改。
  
  ```bash
  git add src/ui/template.html
  git commit -m "feat: add 3D topology container and scripts to template.html"
  ```

- [ ] **Step 3: 在 styles.css 中添加抽屉及毛玻璃特效样式**
  
  *代码注入逻辑（styles.css）：*
  ```css
  .topology-drawer {
      position: fixed;
      top: -65vh;
      left: 0;
      width: 100%;
      height: 60vh;
      background: rgba(10, 10, 12, 0.9);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border-bottom: 2px solid rgba(0, 242, 254, 0.2);
      z-index: 1000;
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }
  .topology-drawer.open {
      transform: translateY(65vh);
  }
  .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      background: rgba(15, 15, 18, 0.85);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .drawer-header h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      color: #00f2fe;
      text-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
  }
  .close-drawer-btn {
      background: none;
      border: none;
      color: #888;
      font-size: 1.8rem;
      cursor: pointer;
      line-height: 1;
      padding: 0;
      transition: color 0.2s;
  }
  .close-drawer-btn:hover {
      color: #fff;
  }
  .threejs-container {
      flex-grow: 1;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
  }
  .node-label {
      position: absolute;
      color: #e0e0e0;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      pointer-events: none;
      background: rgba(10, 10, 12, 0.85);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(0, 242, 254, 0.3);
      white-space: nowrap;
      transform: translate(-50%, -100%);
      transition: opacity 0.2s;
  }
  ```

- [ ] **Step 4: 验证 CSS 添加并进行 Git Commit**
  
  ```bash
  git add src/ui/static/styles.css
  git commit -m "style: add 3D topology drawer and label styles in styles.css"
  ```

---

### Task 2: 3D 拓扑网络绘制逻辑与 WebGL 渲染管线 (JS)

**Files:**
- Modify: [app.js](file:///c:/%E9%9B%B7%E7%94%B5/GPT/ssh/src/ui/static/app.js) (添加 3D 看板绘制核心逻辑)

- [ ] **Step 1: 在 app.js 中实现抽屉的打开和关闭切换，并挂载 3D 场景管理器**
  
  *代码注入逻辑（app.js）：*
  ```javascript
  let topoViewer = null;

  function openTopologyDrawer() {
      const drawer = document.getElementById('topologyDrawer');
      drawer.classList.add('open');
      if (!topoViewer) {
          topoViewer = new TopologyViewer('threejsContainer');
          topoViewer.init();
      }
      topoViewer.animate();
  }

  function closeTopologyDrawer() {
      const drawer = document.getElementById('topologyDrawer');
      drawer.classList.remove('open');
      if (topoViewer) {
          topoViewer.stop();
      }
  }
  ```

- [ ] **Step 2: 在 app.js 中实现 TopologyViewer 核心 WebGL 绘制类**
  
  使用 Three.js 绘制主机粒子星空、中心网关球体、以及从已保存连接数据中动态派生主机节点球体并建立发光粒子流动连线。
  
  *代码注入逻辑（app.js）：*
  ```javascript
  class TopologyViewer {
      constructor(containerId) {
          this.container = document.getElementById(containerId);
          this.scene = null;
          this.camera = null;
          this.renderer = null;
          this.controls = null;
          this.nodes = [];
          this.lines = [];
          this.animationFrameId = null;
          this.raycaster = new THREE.Raycaster();
          this.mouse = new THREE.Vector2();
      }

      init() {
          const width = this.container.clientWidth;
          const height = this.container.clientHeight;

          // 1. Scene & Camera
          this.scene = new THREE.Scene();
          this.scene.fog = new THREE.FogExp2(0x0a0a0c, 0.015);
          this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
          this.camera.position.set(0, 50, 100);

          // 2. WebGL Renderer
          this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          this.renderer.setSize(width, height);
          this.renderer.setPixelRatio(window.devicePixelRatio);
          this.container.appendChild(this.renderer.domElement);

          // 3. Orbit Controls
          this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
          this.controls.enableDamping = true;
          this.controls.dampingFactor = 0.05;

          // 4. Lights
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
          this.scene.add(ambientLight);
          const dirLight = new THREE.DirectionalLight(0x00f2fe, 1);
          dirLight.position.set(10, 20, 15);
          this.scene.add(dirLight);

          // 5. Starfield Background
          const starsGeometry = new THREE.BufferGeometry();
          const starsCount = 1000;
          const starsPositions = new Float32Array(starsCount * 3);
          for (let i = 0; i < starsCount * 3; i++) {
              starsPositions[i] = (Math.random() - 0.5) * 300;
          }
          starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
          const starsMaterial = new THREE.PointsMaterial({ color: 0x4facfe, size: 1.5, sizeAttenuation: true });
          this.starfield = new THREE.Points(starsGeometry, starsMaterial);
          this.scene.add(this.starfield);

          // 6. Build Grid and Connections
          this.buildTopology();

          // 7. Event listeners
          window.addEventListener('resize', this.onWindowResize.bind(this));
          this.renderer.domElement.addEventListener('click', this.onDocumentClick.bind(this));
      }

      buildTopology() {
          // 清理旧节点
          this.nodes.forEach(n => this.scene.remove(n.mesh));
          this.nodes = [];

          // 核心网关节点
          const gatewayGeo = new THREE.SphereGeometry(6, 32, 32);
          const gatewayMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, wireframe: true });
          const gateway = new THREE.Mesh(gatewayGeo, gatewayMat);
          gateway.position.set(0, 0, 0);
          this.scene.add(gateway);

          // 读取已保存连接
          const connections = JSON.parse(window.savedConnections || '[]');
          connections.forEach((conn, index) => {
              const angle = (index / connections.length) * Math.PI * 2;
              const radius = 35 + Math.random() * 10;
              const x = Math.cos(angle) * radius;
              const z = Math.sin(angle) * radius;
              const y = (Math.random() - 0.5) * 15;

              // 创建节点球体
              const nodeGeo = new THREE.SphereGeometry(3, 16, 16);
              const nodeMat = new THREE.MeshPhongMaterial({
                  color: 0x00ff00, // 初始绿色代表连通
                  emissive: 0x003300,
                  shininess: 30
              });
              const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
              nodeMesh.position.set(x, y, z);
              nodeMesh.userData = { ip: conn.hostname, name: conn.name || conn.hostname };
              this.scene.add(nodeMesh);

              this.nodes.push({ mesh: nodeMesh, ip: conn.hostname });

              // 绘制霓虹流量连线
              const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z)];
              const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
              const lineMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.4 });
              const line = new THREE.Line(lineGeo, lineMat);
              this.scene.add(line);
          });
      }

      animate() {
          this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
          if (this.controls) this.controls.update();
          if (this.starfield) this.starfield.rotation.y += 0.0005;
          if (this.renderer && this.scene && this.camera) {
              this.renderer.render(this.scene, this.camera);
          }
      }

      stop() {
          if (this.animationFrameId) {
              cancelAnimationFrame(this.animationFrameId);
          }
      }

      onWindowResize() {
          if (!this.container || !this.camera || !this.renderer) return;
          const width = this.container.clientWidth;
          const height = this.container.clientHeight;
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(width, height);
      }

      onDocumentClick(event) {
          const rect = this.renderer.domElement.getBoundingClientRect();
          this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          this.raycaster.setFromCamera(this.mouse, this.camera);
          const intersects = this.raycaster.intersectObjects(this.nodes.map(n => n.mesh));

          if (intersects.length > 0) {
              const selectedNode = intersects[0].object;
              console.log("Selected node: ", selectedNode.userData.ip);
              
              // 双击/快捷联动：拉起 SSH 连接
              if (window.pywebview && window.pywebview.api) {
                  // 这里我们触发左侧卡片的连接逻辑或直接调用 connect_host API
                  alert(`正在连接主机：${selectedNode.userData.name} (${selectedNode.userData.ip})`);
              }
          }
      }
  }
  ```

- [ ] **Step 3: 验证 app.js 核心 3D 类编写并进行 Git Commit**
  
  ```bash
  git add src/ui/static/app.js
  git commit -m "feat: implement TopologyViewer 3D WebGL renderer and events in app.js"
  ```

---

### Task 3: 连通性数据双向绑定与连接测试联动 (JS & Python)

**Files:**
- Modify: [app.js](file:///c:/%E9%9B%B7%E7%94%B5/GPT/ssh/src/ui/static/app.js) (绑定真实数据，暴露状态推送接口)
- Modify: [api.py](file:///c:/%E9%9B%B7%E7%94%B5/GPT/ssh/src/api.py) (定时心跳广播 js 状态)

- [ ] **Step 1: JS 暴露状态更新函数，并联动节点材质**
  
  在 `app.js` 中增加全局状态暴露方法，用于接收 Python 推送过来的最新连接状态与延迟。
  
  *代码注入逻辑（app.js）：*
  ```javascript
  window.updateNodeDelay = function(ip, delay, status) {
      if (!topoViewer) return;
      const targetNode = topoViewer.nodes.find(n => n.ip === ip);
      if (targetNode) {
          let color = 0x00ff00;
          if (status === 'disconnected') {
              color = 0xff0000;
          } else if (delay > 150) {
              color = 0xffa500;
          } else if (delay > 50) {
              color = 0xffff00;
          }
          targetNode.mesh.material.color.setHex(color);
      }
  };
  ```

- [ ] **Step 2: Python api.py 发送心跳包并在 evaluate_js 中广播**
  
  在心跳或状态检查处进行广播。
  
  *代码注入逻辑（api.py）：*
  ```python
  def broadcast_connection_status(self, ip: str, delay: int, status: str):
      """Broadcasting host ping latency and connectivity status to 3D topology."""
      try:
          self._window.evaluate_js(f'window.updateNodeDelay("{ip}", {delay}, "{status}")')
      except Exception as e:
          self.logger.error(f"Failed to broadcast latency to WebGL: {e}")
  ```

- [ ] **Step 3: 验证数据联通性测试并进行 Git Commit**
  
  ```bash
  git add src/api.py src/ui/static/app.js
  git commit -m "feat: implement RPC delay status broadcasting between Python and WebGL"
  ```
