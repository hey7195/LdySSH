// ==========================================================================
// LdySSH v2.4 - Event Driven 3D Topology Component
// ==========================================================================

class LightEventBus {
    constructor() {
        this.listeners = {};
    }
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`Error in event listener for ${event}:`, e);
            }
        });
    }
}

// 挂载全局事件总线
if (!window.LdySSHBus) {
    window.LdySSHBus = new LightEventBus();
}

let topoViewer = null;

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
        this.starfields = [];
        this.gateway = null;
        this.sunAtmosphere = null;
        this.sunParticles = null;
        this.orbits = [];
        this.lastFrameTime = 0;
        this.fpsInterval = 1000 / 30; // Limit WebGL backdrop rendering to 30 FPS to save CPU/GPU resource
        this.warpFactor = 1.0;
    }

    createSunGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 248, 220, 1.0)');
        grad.addColorStop(0.18, 'rgba(255, 140, 0, 0.85)');
        grad.addColorStop(0.5, 'rgba(220, 45, 0, 0.2)');
        grad.addColorStop(1, 'rgba(220, 45, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    createSunTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(0, 0, 512, 256);
        
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 256;
            const r = 15 + Math.random() * 35;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255, 230, 0, 0.95)');
            grad.addColorStop(0.5, 'rgba(255, 90, 0, 0.55)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.fillStyle = 'rgba(50, 5, 0, 0.45)';
        for (let i = 0; i < 15; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 512, Math.random() * 256, 3 + Math.random() * 7, 0, Math.PI * 2);
            ctx.fill();
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    }

    createEarthTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        const oceanGrad = ctx.createLinearGradient(0, 0, 0, 256);
        oceanGrad.addColorStop(0, '#0a1d37');
        oceanGrad.addColorStop(0.5, '#0d2240');
        oceanGrad.addColorStop(1, '#0a1d37');
        ctx.fillStyle = oceanGrad;
        ctx.fillRect(0, 0, 512, 256);
        
        const continents = [
            { x: 260, y: 100, rx: 95, ry: 55, rot: -0.1 },
            { x: 280, y: 145, rx: 50, ry: 40, rot: 0.15 },
            { x: 120, y: 95, rx: 55, ry: 45, rot: 0.2 },
            { x: 145, y: 170, rx: 42, ry: 58, rot: -0.1 },
            { x: 380, y: 180, rx: 32, ry: 22, rot: 0.05 },
            { x: 180, y: 45, rx: 25, ry: 15, rot: -0.2 }
        ];

        continents.forEach(c => {
            ctx.fillStyle = '#1b5e20';
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, c.rx, c.ry, c.rot, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#7d6608';
            for (let s = 0; s < 12; s++) {
                const sx = c.x + (Math.random() - 0.5) * c.rx * 1.2;
                const sy = c.y + (Math.random() - 0.5) * c.ry * 1.2;
                const sr = 6 + Math.random() * 15;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.fillStyle = '#2e7d32';
            for (let s = 0; s < 8; s++) {
                const sx = c.x + (Math.random() - 0.5) * c.rx * 1.4;
                const sy = c.y + (Math.random() - 0.5) * c.ry * 1.4;
                const sr = 3 + Math.random() * 7;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.fillStyle = 'rgba(240, 245, 255, 0.95)';
        ctx.beginPath();
        ctx.ellipse(256, 12, 180, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(256, 244, 210, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    createCloudTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 256);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        for (let i = 0; i < 30; i++) {
            const cx = Math.random() * 512;
            const cy = 25 + Math.random() * 206;
            const rx = 35 + Math.random() * 95;
            const ry = 8 + Math.random() * 18;
            const rot = (Math.random() - 0.5) * 0.12;
            
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
            ctx.fill();
            
            if (Math.random() < 0.25) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                ctx.beginPath();
                ctx.arc(cx, cy, rx * 0.35, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            }
        }
        return new THREE.CanvasTexture(canvas);
    }

    createJupiterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ad825c';
        ctx.fillRect(0, 0, 512, 256);
        
        const colors = [
            '#592c14', '#754425', '#995f3b', '#b38864', 
            '#cca687', '#ebd7c5', '#52341d', '#ebd5c0'
        ];
        
        let curY = 0;
        while (curY < 256) {
            const h = 6 + Math.random() * 15;
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(0, curY, 512, h);
            
            if (Math.random() < 0.6) {
                ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
                ctx.beginPath();
                for (let x = 0; x <= 512; x += 10) {
                    const waveY = curY + Math.sin(x * 0.08) * 3;
                    ctx.lineTo(x, waveY);
                }
                ctx.lineTo(512, curY + h);
                ctx.lineTo(0, curY + h);
                ctx.closePath();
                ctx.fill();
            }
            curY += h;
        }
        
        const rx = 340;
        const ry = 165;
        ctx.fillStyle = 'rgba(128, 25, 12, 0.95)';
        ctx.beginPath();
        ctx.ellipse(rx, ry, 32, 17, 0.06, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#c62828';
        ctx.beginPath();
        ctx.ellipse(rx - 1, ry, 24, 12, 0.06, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.ellipse(rx - 2, ry - 1, 14, 7, 0.06, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rx, ry, 40, Math.PI, Math.PI * 1.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, ry, 36, 0, Math.PI * 0.8);
        ctx.stroke();

        return new THREE.CanvasTexture(canvas);
    }

    createSaturnTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e2cfa7';
        ctx.fillRect(0, 0, 256, 128);
        
        const colors = ['#cca672', '#ecd9bd', '#dbbe97', '#ebdcb9', '#dbb888'];
        ctx.globalAlpha = 0.6;
        for (let y = 0; y < 128; y += 5 + Math.random() * 8) {
            const h = 5 + Math.random() * 10;
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(0, y, 256, h);
        }
        ctx.globalAlpha = 1.0;
        return new THREE.CanvasTexture(canvas);
    }

    createSaturnRingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 16);
        
        for (let x = 0; x < 256; x += 1 + Math.random() * 3) {
            const w = 1 + Math.random() * 3;
            if (x > 140 && x < 155 && Math.random() < 0.85) {
                continue; 
            }
            const alpha = 0.12 + Math.random() * 0.65;
            ctx.fillStyle = `rgba(${225 + Math.floor(Math.random() * 20)}, ${200 + Math.floor(Math.random() * 15)}, ${160 + Math.floor(Math.random() * 20)}, ${alpha})`;
            ctx.fillRect(x, 0, w, 16);
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    }

    createNeptuneTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2b5fcb';
        ctx.fillRect(0, 0, 256, 128);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        for (let i = 0; i < 8; i++) {
            ctx.fillRect(0, Math.random() * 128, 256, 5 + Math.random() * 8);
        }

        ctx.fillStyle = '#132860';
        ctx.beginPath();
        ctx.ellipse(170, 75, 18, 10, 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(170, 75, 23, Math.PI * 0.9, Math.PI * 1.6);
        ctx.stroke();

        return new THREE.CanvasTexture(canvas);
    }

    createMarsTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#b24a25';
        ctx.fillRect(0, 0, 256, 128);
        
        ctx.fillStyle = '#803013';
        for (let i = 0; i < 15; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 128, 12 + Math.random() * 24, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#cd643d';
        for (let i = 0; i < 10; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 128, 6 + Math.random() * 12, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#fdfdfd';
        ctx.beginPath();
        ctx.ellipse(128, 3, 30, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(128, 125, 25, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    createMercuryTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#6d737a';
        ctx.fillRect(0, 0, 256, 128);
        
        ctx.fillStyle = '#555a60';
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 128, 8 + Math.random() * 16, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 25; i++) {
            const cx = Math.random() * 256;
            const cy = Math.random() * 128;
            const r = 3 + Math.random() * 8;
            
            ctx.fillStyle = 'rgba(40, 42, 45, 0.7)';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(160, 170, 180, 0.5)';
            ctx.beginPath();
            ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.85, 0, Math.PI * 2);
            ctx.fill();
            
            if (r > 6 && Math.random() < 0.4) {
                ctx.strokeStyle = 'rgba(200, 205, 210, 0.25)';
                ctx.lineWidth = 0.8;
                const rays = 5 + Math.floor(Math.random() * 5);
                for (let k = 0; k < rays; k++) {
                    const angle = (k / rays) * Math.PI * 2 + Math.random() * 0.5;
                    const len = r * (1.5 + Math.random() * 2);
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
                    ctx.stroke();
                }
            }
        }
        return new THREE.CanvasTexture(canvas);
    }

    createVenusTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e3cc9a';
        ctx.fillRect(0, 0, 256, 128);
        
        const colors = ['#cca362', '#ebd2a2', '#d6b885', '#e9dcbf'];
        ctx.globalAlpha = 0.55;
        for (let y = 0; y < 128; y += 4 + Math.random() * 6) {
            const h = 4 + Math.random() * 8;
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(0, y, 256, h);
        }
        ctx.globalAlpha = 1.0;
        return new THREE.CanvasTexture(canvas);
    }

    init() {
        if (!this.container) return;
        const width = window.innerWidth;
        const height = window.innerHeight;

        const termContainer = document.querySelector('.terminal-container');
        if (termContainer) {
            termContainer.classList.add('in-workbench');
        }

        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x050608, 0.005);
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1500);
        this.camera.position.set(0, 75, 130);

        // 2. WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        // 3. Orbit Controls
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.enableZoom = false; 
            this.controls.enablePan = false;  
            this.controls.maxPolarAngle = Math.PI / 2 - 0.02; 
            this.controls.minDistance = 30; 
            this.controls.maxDistance = 350; 
        }

        // Custom Title Bar Drag Handling & Event Isolation
        const titleBar = document.querySelector('.title-bar');
        if (titleBar) {
            const handleDrag = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    return;
                }
                if (window.chrome && window.chrome.webview) {
                    window.chrome.webview.postMessage(JSON.stringify({
                        id: 'drag',
                        action: 'window_drag',
                        args: []
                    }));
                }
                e.stopPropagation();
            };

            ['mousedown', 'pointerdown', 'touchstart'].forEach(evt => {
                titleBar.addEventListener(evt, (e) => {
                    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                        return;
                    }
                    if (evt === 'mousedown') {
                        handleDrag(e);
                    } else {
                        e.stopPropagation();
                    }
                }, { capture: true });
            });
        }

        // 4. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(ambientLight);
        const sunLight = new THREE.PointLight(0xffaa44, 2.5, 400);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);

        // 5. Starfield Background
        this.starfields = [];
        const starParams = [
            { count: 300, size: 1.6, color: 0x00f2fe, speed: 0.0003, radius: 400 },
            { count: 800, size: 1.0, color: 0x7928ca, speed: 0.00015, radius: 600 },
            { count: 1500, size: 0.7, color: 0xffffff, speed: 0.00008, radius: 800 }
        ];
        starParams.forEach(param => {
            const starsGeometry = new THREE.BufferGeometry();
            const starsPositions = new Float32Array(param.count * 3);
            for (let i = 0; i < param.count * 3; i++) {
                starsPositions[i] = (Math.random() - 0.5) * param.radius;
            }
            starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
            const starsMaterial = new THREE.PointsMaterial({
                color: param.color,
                size: param.size,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.8
            });
            const points = new THREE.Points(starsGeometry, starsMaterial);
            this.scene.add(points);
            this.starfields.push({ points, speed: param.speed });
        });

        // 6. Build Grid and Connections
        this.buildTopology();

        // 6.1 初始化 Hover 引力环
        const ringGeo = new THREE.RingGeometry(1.4, 1.55, 64);
        this.hoverRingMaterial = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.hoverRing = new THREE.Mesh(ringGeo, this.hoverRingMaterial);
        this.hoverRing.rotateX(Math.PI / 2);
        this.scene.add(this.hoverRing);

        // 6.2 初始化悬浮菜单相关属性
        this.hoveredNode = null;
        this.menuHideTimeout = null;

        // 6.3 绑定菜单自身的 Mouse 事件以防止闪烁消失
        const hoverMenu = document.getElementById('topoHoverMenu');
        if (hoverMenu) {
            hoverMenu.addEventListener('mouseenter', () => {
                if (this.menuHideTimeout) {
                    clearTimeout(this.menuHideTimeout);
                    this.menuHideTimeout = null;
                }
            });
            hoverMenu.addEventListener('mouseleave', () => {
                this.menuHideTimeout = setTimeout(() => {
                    this.hideHoverMenu();
                }, 350);
            });
        }

        // 7. Event listeners
        this.onResizeHandler = this.onWindowResize.bind(this);
        this.onClickHandler = this.onDocumentClick.bind(this);
        this.onMouseMoveHandler = this.onDocumentMouseMove.bind(this);
        window.addEventListener('resize', this.onResizeHandler);
        this.renderer.domElement.addEventListener('click', this.onClickHandler);
        this.renderer.domElement.addEventListener('pointermove', this.onMouseMoveHandler);

        // 8. Global event forwarding for terminal drag backdrop rotation
        this.onTerminalPointerDown = (e) => {
            if (e.isTriggeredByAntigravity) return;
            const term = e.target.closest('#terminalWrapper') || e.target.closest('.terminal-container');
            if (term) {
                const cloneEvent = new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    screenX: e.screenX,
                    screenY: e.screenY,
                    button: e.button,
                    buttons: e.buttons,
                    pointerId: e.pointerId,
                    pointerType: e.pointerType,
                    isPrimary: e.isPrimary,
                    view: window
                });
                cloneEvent.isTriggeredByAntigravity = true;
                if (this.renderer && this.renderer.domElement) {
                    this.renderer.domElement.dispatchEvent(cloneEvent);
                }
            }
        };
        document.addEventListener('pointerdown', this.onTerminalPointerDown, { capture: true });
    }

    buildTopology() {
        if (this.gateway) {
            this.scene.remove(this.gateway);
            if (this.gateway.geometry) this.gateway.geometry.dispose();
            if (this.gateway.material) this.gateway.material.dispose();
            this.gateway = null;
        }
        if (this.sunAtmosphere) {
            this.scene.remove(this.sunAtmosphere);
            if (this.sunAtmosphere.geometry) this.sunAtmosphere.geometry.dispose();
            if (this.sunAtmosphere.material) this.sunAtmosphere.material.dispose();
            this.sunAtmosphere = null;
        }
        if (this.sunParticles) {
            this.scene.remove(this.sunParticles);
            if (this.sunParticles.geometry) this.sunParticles.geometry.dispose();
            if (this.sunParticles.material) this.sunParticles.material.dispose();
            this.sunParticles = null;
        }

        this.nodes.forEach(n => {
            this.scene.remove(n.mesh);
            if (n.mesh.geometry) n.mesh.geometry.dispose();
            if (n.mesh.material) n.mesh.material.dispose();
            
            n.mesh.traverse(child => {
                if (child !== n.mesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }
            });
        });
        this.lines.forEach(l => {
            this.scene.remove(l);
            if (l.geometry) l.geometry.dispose();
            if (l.material) l.material.dispose();
        });
        this.orbits.forEach(o => {
            this.scene.remove(o);
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        this.nodes = [];
        this.lines = [];
        this.orbits = [];

        // 1. Glowing Sun Core
        const gatewayGeo = new THREE.SphereGeometry(5.0, 32, 32);
        const sunTex = this.createSunTexture();
        const gatewayMat = new THREE.MeshBasicMaterial({
            map: sunTex,
            transparent: true,
            opacity: 0.98
        });
        this.gateway = new THREE.Mesh(gatewayGeo, gatewayMat);
        this.gateway.position.set(0, 0, 0);
        this.scene.add(this.gateway);

        // 2. Sun Outer Atmosphere Layer
        const atmosGeo = new THREE.SphereGeometry(5.4, 32, 32);
        const atmosMat = new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        this.sunAtmosphere = new THREE.Mesh(atmosGeo, atmosMat);
        this.sunAtmosphere.position.set(0, 0, 0);
        this.scene.add(this.sunAtmosphere);

        // 3. Sun Glow Sprite
        const sunGlowTex = this.createSunGlowTexture();
        const sunGlowMat = new THREE.SpriteMaterial({
            map: sunGlowTex,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.85
        });
        this.sunParticles = new THREE.Sprite(sunGlowMat);
        this.sunParticles.scale.set(30, 30, 1);
        this.scene.add(this.sunParticles);

        // Get actual connections
        const actualConnections = window.LdySSHAPI ? window.LdySSHAPI.getSavedConnections() : [];
        
        const planetConfigs = [
            { name: '水星', r: 1.2, color: 0x8899a6, emissive: 0x111622, shininess: 80, orbitR: 22, speed: 0.0055, incline: 0.08 },
            { name: '金星', r: 1.6, color: 0xe3bb76, emissive: 0x221a11, shininess: 50, orbitR: 30, speed: 0.0042, incline: -0.05 },
            { name: '地球', r: 1.8, color: 0x1b72e8, emissive: 0x052244, shininess: 100, orbitR: 38, speed: 0.0034, incline: 0.12, isEarth: true },
            { name: '火星', r: 1.4, color: 0xc1440e, emissive: 0x331105, shininess: 20, orbitR: 46, speed: 0.0028, incline: -0.10 },
            { name: '木星', r: 2.6, color: 0xb07f35, emissive: 0x221a05, shininess: 30, orbitR: 55, speed: 0.0022, incline: 0.06 },
            { name: '土星', r: 2.3, color: 0xe2bf7d, emissive: 0x222211, shininess: 30, orbitR: 64, speed: 0.0016, incline: -0.08, hasRing: true },
            { name: '海王星', r: 2.0, color: 0x4b70dd, emissive: 0x051133, shininess: 70, orbitR: 72, speed: 0.0011, incline: 0.15 }
        ];

        const numPlanets = Math.max(7, actualConnections.length);

        for (let i = 0; i < numPlanets; i++) {
            const conn = actualConnections[i];
            const isVirtual = !conn;

            let cfg;
            if (i < 7) {
                cfg = planetConfigs[i];
            } else {
                const orbitR = 72 + (i - 6) * 9;
                const speed = 0.012 / Math.sqrt(orbitR);
                const incline = (i % 2 === 0 ? 0.08 : -0.08) + (Math.random() - 0.5) * 0.04;
                const r = 1.6 + Math.random() * 0.8;
                
                const randomHue = Math.random();
                let color = 0x4facfe;
                if (randomHue < 0.25) color = 0xff3366;
                else if (randomHue < 0.5) color = 0x33ff99;
                else if (randomHue < 0.75) color = 0xffcc33;
                else color = 0xa855f7;

                cfg = {
                    name: '外圈行星-' + (i + 1),
                    r: r,
                    color: color,
                    emissive: 0x111122,
                    shininess: 40,
                    orbitR: orbitR,
                    speed: speed,
                    incline: incline
                };
            }

            // 3. Draw Orbit Ring
            const points = [];
            const segments = 128;
            for (let s = 0; s <= segments; s++) {
                const theta = (s / segments) * Math.PI * 2;
                const ox = cfg.orbitR * Math.cos(theta);
                const oy = cfg.orbitR * Math.sin(theta) * Math.sin(cfg.incline);
                const oz = cfg.orbitR * Math.sin(theta) * Math.cos(cfg.incline);
                points.push(new THREE.Vector3(ox, oy, oz));
            }
            const orbitGeo = new THREE.BufferGeometry().setFromPoints(points);
            const orbitMat = new THREE.LineBasicMaterial({
                color: isVirtual ? 0x00f2fe : 0x4facfe,
                transparent: true,
                opacity: isVirtual ? 0.05 : 0.12,
                depthWrite: false
            });
            const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
            this.scene.add(orbitLine);
            this.orbits.push(orbitLine);

            // 4. Planet Sphere
            const nodeGeo = new THREE.SphereGeometry(cfg.r, 32, 32); 
            let color = cfg.color;
            let emissive = cfg.emissive;
            let mapTex = null;
            let specularColor = 0x222222;
            let shininess = cfg.shininess;

            if (isVirtual) {
                color = 0x00f2fe;
                emissive = 0x001122;
            } else {
                if (i === 0) mapTex = this.createMercuryTexture();
                else if (i === 1) mapTex = this.createVenusTexture();
                else if (i === 2) {
                    mapTex = this.createEarthTexture(); 
                    specularColor = 0x444444;
                    shininess = 60;
                }
                else if (i === 3) mapTex = this.createMarsTexture();
                else if (i === 4) mapTex = this.createJupiterTexture();
                else if (i === 5) mapTex = this.createSaturnTexture();
                else if (i === 6) mapTex = this.createNeptuneTexture();
                else mapTex = this.createNeptuneTexture();
            }

            const nodeMat = new THREE.MeshPhongMaterial({
                color: color,
                map: mapTex,
                emissive: emissive,
                specular: specularColor,
                shininess: shininess,
                transparent: isVirtual,
                opacity: isVirtual ? 0.28 : 1.0
            });

            const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);

            // Special planetary system: Saturn Rings
            if (cfg.hasRing) {
                const ringGeo = new THREE.RingGeometry(cfg.r * 1.4, cfg.r * 2.3, 64);
                const ringTex = this.createSaturnRingTexture();
                const ringMat = new THREE.MeshBasicMaterial({
                    map: ringTex,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.82,
                    depthWrite: false
                });
                const ringMesh = new THREE.Mesh(ringGeo, ringMat);
                ringMesh.rotateX(Math.PI / 2);
                nodeMesh.add(ringMesh);
            }

            // Special planetary system: Earth Clouds & Atmosphere
            if (cfg.isEarth) {
                const cloudGeo = new THREE.SphereGeometry(cfg.r * 1.05, 32, 32);
                const cloudMat = new THREE.MeshPhongMaterial({
                    map: this.createCloudTexture(),
                    transparent: true,
                    opacity: 0.38,
                    depthWrite: false
                });
                const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
                cloudMesh.userData = { isCloud: true };
                nodeMesh.add(cloudMesh);
                nodeMesh.userData.cloudMesh = cloudMesh;

                const glowGeo = new THREE.SphereGeometry(cfg.r * 1.15, 32, 32);
                const glowMat = new THREE.MeshBasicMaterial({
                    color: 0x00aaff,
                    transparent: true,
                    opacity: 0.15,
                    side: THREE.BackSide
                });
                const glowMesh = new THREE.Mesh(glowGeo, glowMat);
                nodeMesh.add(glowMesh);
            }

            const initialPhase = Math.random() * Math.PI * 2;
            const px = cfg.orbitR * Math.cos(initialPhase);
            const py = cfg.orbitR * Math.sin(initialPhase) * Math.sin(cfg.incline);
            const pz = cfg.orbitR * Math.sin(initialPhase) * Math.cos(cfg.incline);
            nodeMesh.position.set(px, py, pz);

            nodeMesh.userData = {
                key: isVirtual ? ('virtual_' + i) : conn.key,
                ip: isVirtual ? ('Virtual-Planet-0' + (i + 1)) : conn.hostname,
                name: isVirtual ? ('未配置行星-' + (i + 1)) : (conn.name || conn.hostname),
                isVirtual: isVirtual
            };

            this.scene.add(nodeMesh);

            const linePoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(px, py, pz)];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const lineMat = new THREE.LineBasicMaterial({
                color: isVirtual ? 0x00f2fe : 0x4facfe,
                transparent: true,
                opacity: isVirtual ? 0.06 : 0.24
            });
            const line = new THREE.Line(lineGeo, lineMat);
            this.scene.add(line);
            this.lines.push(line);

            this.nodes.push({
                mesh: nodeMesh,
                ip: isVirtual ? null : conn.hostname,
                key: isVirtual ? null : conn.key,
                isVirtual: isVirtual,
                orbitR: cfg.orbitR,
                speed: cfg.speed,
                incline: cfg.incline,
                phase: initialPhase,
                line: line,
                originalColor: color,
                originalEmissive: emissive
            });
        }
    }

    warpToNode(nodeIp) {
        if (!this.nodes) return;
        const node = this.nodes.find(n => n.ip === nodeIp);
        if (!node || !node.mesh) return;

        this.isWarping = true;
        this.isWarpingBack = false;
        this.warpStartTime = Date.now();
        this.warpDuration = 900;

        this.warpStartPos = this.camera.position.clone();
        this.warpStartFov = this.camera.fov;
        
        if (this.controls) {
            this.warpStartTarget = this.controls.target.clone();
        }

        const nodePos = node.mesh.position.clone();
        const dir = nodePos.clone().normalize();
        const offsetDist = node.mesh.geometry.parameters.radius * 3.5;
        this.warpTargetPos = nodePos.clone().add(dir.multiplyScalar(offsetDist));
        this.warpTargetNode = node;
    }

    resetWarp() {
        if (!this.warpStartPos) return;
        
        this.isWarping = false;
        this.isWarpingBack = true;
        this.warpBackStartTime = Date.now();
        this.warpBackDuration = 800;

        this.warpBackStartPos = this.camera.position.clone();
        this.warpBackStartFov = this.camera.fov;
        if (this.controls) {
            this.warpBackStartTarget = this.controls.target.clone();
        }
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        
        if (elapsed < this.fpsInterval) {
            return;
        }
        
        this.lastFrameTime = now - (elapsed % this.fpsInterval);

        let warpSpeedMultiplier = 1.0;
        if (this.isWarping && this.warpTargetNode) {
            const t = Math.min(1.0, (Date.now() - this.warpStartTime) / this.warpDuration);
            const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            
            this.camera.position.lerpVectors(this.warpStartPos, this.warpTargetPos, easeT);
            
            if (this.controls && this.warpStartTarget) {
                this.controls.target.lerpVectors(this.warpStartTarget, this.warpTargetNode.mesh.position, easeT);
            }
            
            this.camera.fov = this.warpStartFov + Math.sin(t * Math.PI) * 25;
            this.camera.updateProjectionMatrix();
            
            warpSpeedMultiplier = 1.0 + Math.sin(t * Math.PI) * 45;
            
            if (t >= 1.0) {
                this.isWarping = false;
            }
        } else if (this.isWarpingBack) {
            const t = Math.min(1.0, (Date.now() - this.warpBackStartTime) / this.warpBackDuration);
            const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            
            const defaultPos = new THREE.Vector3(0, 40, 80);
            const defaultTarget = new THREE.Vector3(0, 0, 0);
            
            this.camera.position.lerpVectors(this.warpBackStartPos, defaultPos, easeT);
            
            if (this.controls && this.warpBackStartTarget) {
                this.controls.target.lerpVectors(this.warpBackStartTarget, defaultTarget, easeT);
            }
            
            this.camera.fov = this.warpBackStartFov + (60 - this.warpBackStartFov) * easeT;
            this.camera.updateProjectionMatrix();
            
            warpSpeedMultiplier = 1.0 + (1.0 - easeT) * 15;
            
            if (t >= 1.0) {
                this.isWarpingBack = false;
            }
        }

        if (this.controls) {
            this.controls.enabled = !(this.isWarping || this.isWarpingBack);
            this.controls.update();
        }

        if (this.hoverRing) {
            if (this.hoveredNode && this.hoveredNode.mesh) {
                this.hoverRing.position.copy(this.hoveredNode.mesh.position);
                const r = this.hoveredNode.mesh.geometry.parameters.radius || 1.6;
                
                this.warpFactor += (1.0 - this.warpFactor) * 0.15;
                const currentScale = r * this.warpFactor;
                this.hoverRing.scale.set(currentScale, currentScale, currentScale);
                
                this.hoverRing.rotation.z += 0.025; 
                this.hoverRingMaterial.opacity = 0.75 * Math.min(this.warpFactor, 1.5);
                
                this.updateHoverMenuPosition();
            } else {
                this.warpFactor = 1.0;
                this.hoverRingMaterial.opacity += (0.0 - this.hoverRingMaterial.opacity) * 0.18;
            }
        }

        if (this.gateway) {
            this.gateway.rotation.y += 0.0006;
            if (this.gateway.material && this.gateway.material.map) {
                this.gateway.material.map.offset.x += 0.0004;
                this.gateway.material.map.offset.y += 0.0001;
            }
        }
        if (this.sunAtmosphere) {
            this.sunAtmosphere.rotation.y -= 0.0003;
        }
        if (this.sunParticles) {
            this.sunParticles.rotation.z += 0.0002; 
        }

        this.starfields.forEach(sf => {
            if (sf.points) {
                sf.points.rotation.y += sf.speed * warpSpeedMultiplier;
            }
        });

        this.nodes.forEach((n, idx) => {
            if (n.mesh) {
                n.mesh.rotation.y += 0.008 * (1.0 + (warpSpeedMultiplier - 1.0) * 0.15);

                n.mesh.traverse(child => {
                    if (child.userData && child.userData.isCloud) {
                        child.rotation.y += 0.005; 
                        child.rotation.x += 0.001;
                    }
                });

                n.phase += n.speed * (1.0 + (warpSpeedMultiplier - 1.0) * 0.15);

                const x = n.orbitR * Math.cos(n.phase);
                const y = n.orbitR * Math.sin(n.phase) * Math.sin(n.incline);
                const z = n.orbitR * Math.sin(n.phase) * Math.cos(n.incline);

                n.mesh.position.set(x, y, z);

                const pulse = 1.0 + 0.012 * Math.sin(Date.now() * 0.0008 + idx);
                n.mesh.scale.set(pulse, pulse, pulse);

                if (n.mesh.material) {
                    let speed = 0.002;
                    let minIntensity = 0.15;
                    let maxIntensity = 1.0;
                    
                    if (n.status === 'disconnected') {
                        speed = 0.001; 
                        minIntensity = 0.05;
                        maxIntensity = 0.25;
                    } else if (n.delay > 150) {
                        speed = 0.008; 
                        minIntensity = 0.3;
                        maxIntensity = 1.6;
                    } else if (n.delay > 50) {
                        speed = 0.004; 
                        minIntensity = 0.15;
                        maxIntensity = 1.0;
                    } else {
                        speed = 0.0025; 
                        minIntensity = 0.2;
                        maxIntensity = 1.3;
                    }
                    
                    const timeFactor = Date.now() * speed + idx * 1.5;
                    const emissiveIntensity = minIntensity + (Math.sin(timeFactor) + 1.0) * 0.5 * (maxIntensity - minIntensity);
                    n.mesh.material.emissiveIntensity = emissiveIntensity;
                }

                if (n.line) {
                    const positions = n.line.geometry.attributes.position.array;
                    positions[3] = x;
                    positions[4] = y;
                    positions[5] = z;
                    n.line.geometry.attributes.position.needsUpdate = true;
                }
            }
        });

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        window.removeEventListener('resize', this.onResizeHandler);
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.removeEventListener('click', this.onClickHandler);
            if (this.onMouseMoveHandler) {
                this.renderer.domElement.removeEventListener('pointermove', this.onMouseMoveHandler);
            }
        }
        if (this.onTerminalPointerDown) {
            document.removeEventListener('pointerdown', this.onTerminalPointerDown, { capture: true });
        }
        if (this.menuHideTimeout) {
            clearTimeout(this.menuHideTimeout);
            this.menuHideTimeout = null;
        }
        if (this.hoverRing) {
            this.scene.remove(this.hoverRing);
            if (this.hoverRing.geometry) this.hoverRing.geometry.dispose();
            if (this.hoverRing.material) this.hoverRing.material.dispose();
            this.hoverRing = null;
        }
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    onDocumentClick(event) {
        if (event.target.tagName !== 'CANVAS') return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const targetObjects = [];
        this.nodes.forEach(n => {
            if (n.mesh) {
                targetObjects.push(n.mesh);
                n.mesh.traverse(child => {
                    if (child !== n.mesh) {
                        targetObjects.push(child);
                    }
                });
            }
        });

        const intersects = this.raycaster.intersectObjects(targetObjects);

        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            
            let targetMesh = selectedMesh;
            if (!selectedMesh.userData || selectedMesh.userData.key === undefined) {
                if (selectedMesh.parent && selectedMesh.parent.userData && selectedMesh.parent.userData.key !== undefined) {
                    targetMesh = selectedMesh.parent;
                }
            }
            
            if (targetMesh.userData.isVirtual) {
                console.log("Clicked virtual placeholder planet");
                return;
            }

            const connKey = targetMesh.userData.key;
            console.log("Selected planetary host in 3D backdrop:", targetMesh.userData.ip);
            
            if (connKey) {
                window.LdySSHBus.emit('request-connect', connKey);
            }
        }
    }

    onDocumentMouseMove(event) {
        if (!this.renderer || !this.renderer.domElement) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const targetObjects = [];
        this.nodes.forEach(n => {
            if (n.mesh) {
                targetObjects.push(n.mesh);
                n.mesh.traverse(child => {
                    if (child !== n.mesh) {
                        targetObjects.push(child);
                    }
                });
            }
        });

        const intersects = this.raycaster.intersectObjects(targetObjects);

        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            let targetMesh = selectedMesh;
            if (!selectedMesh.userData || selectedMesh.userData.key === undefined) {
                if (selectedMesh.parent && selectedMesh.parent.userData && selectedMesh.parent.userData.key !== undefined) {
                    targetMesh = selectedMesh.parent;
                }
            }
            
            if (targetMesh.userData && targetMesh.userData.key !== undefined) {
                const node = this.nodes.find(n => n.mesh === targetMesh);
                if (node) {
                    if (this.menuHideTimeout) {
                        clearTimeout(this.menuHideTimeout);
                        this.menuHideTimeout = null;
                    }
                    this.showHoverMenu(node);
                    return;
                }
            }
        }

        if (!this.menuHideTimeout) {
            this.menuHideTimeout = setTimeout(() => {
                this.hideHoverMenu();
            }, 350);
        }
    }

    showHoverMenu(node) {
        if (this.hoveredNode === node) return; 
        this.hoveredNode = node;
        
        this.warpFactor = 2.4;

        const hoverMenu = document.getElementById('topoHoverMenu');
        if (hoverMenu) {
            if (node.isVirtual) {
                hoverMenu.classList.add('is-virtual-planet');
            } else {
                hoverMenu.classList.remove('is-virtual-planet');
            }
            hoverMenu.style.display = 'block';
            hoverMenu.offsetHeight; 
            hoverMenu.classList.add('active');
        }

        const focusFrame = document.getElementById('topoFocusFrame');
        if (focusFrame) {
            if (node.isVirtual) {
                focusFrame.classList.add('is-virtual-planet');
            } else {
                focusFrame.classList.remove('is-virtual-planet');
            }
            focusFrame.style.display = 'block';
            
            focusFrame.classList.remove('warp-active');
            focusFrame.offsetHeight; 
            focusFrame.classList.add('warp-active');
            
            focusFrame.classList.add('active');
        }

        const satelliteOrbit = document.getElementById('topoSatelliteOrbit');
        if (satelliteOrbit) {
            const name = (node.name || '').toLowerCase();
            const hostname = (node.ip || '').toLowerCase();
            let osIcon = '🐧';
            let osName = 'Linux OS';
            if (node.isVirtual) {
                osIcon = '⚙️';
                osName = '待配置连接';
            } else if (name.includes('win') || hostname.includes('win')) {
                osIcon = '🪟';
                osName = 'Windows Server';
            } else if (name.includes('mac') || hostname.includes('mac') || name.includes('apple')) {
                osIcon = '🍎';
                osName = 'macOS Server';
            } else {
                osIcon = '🐧';
                osName = 'Linux OS';
            }
            
            const pingVal = node.isVirtual ? '0ms' : `${Math.floor(Math.random() * 17) + 8}ms`;
            
            document.getElementById('topoSatelliteIcon').textContent = osIcon;
            document.getElementById('topoSatelliteOs').textContent = `OS: ${osName}`;
            document.getElementById('topoSatellitePing').textContent = `PING: ${pingVal}`;
            
            if (node.isVirtual) {
                satelliteOrbit.classList.add('is-virtual-planet');
            } else {
                satelliteOrbit.classList.remove('is-virtual-planet');
            }
            
            satelliteOrbit.style.display = 'block';
            satelliteOrbit.offsetHeight; 
            satelliteOrbit.classList.add('active');
            
            setTimeout(() => {
                if (this.hoveredNode === node) {
                    satelliteOrbit.classList.add('hud-visible');
                }
            }, 100);
        }
    }

    hideHoverMenu() {
        this.hoveredNode = null;
        const hoverMenu = document.getElementById('topoHoverMenu');
        if (hoverMenu) {
            hoverMenu.classList.remove('active');
            setTimeout(() => {
                if (!this.hoveredNode && !hoverMenu.classList.contains('active')) {
                    hoverMenu.style.display = 'none';
                }
            }, 220);
        }

        const focusFrame = document.getElementById('topoFocusFrame');
        if (focusFrame) {
            focusFrame.classList.remove('active');
            focusFrame.classList.remove('warp-active');
            setTimeout(() => {
                if (!this.hoveredNode && !focusFrame.classList.contains('active')) {
                    focusFrame.style.display = 'none';
                }
            }, 350);
        }

        const satelliteOrbit = document.getElementById('topoSatelliteOrbit');
        if (satelliteOrbit) {
            satelliteOrbit.classList.remove('hud-visible');
            satelliteOrbit.classList.remove('active');
            setTimeout(() => {
                if (!this.hoveredNode && !satelliteOrbit.classList.contains('active')) {
                    satelliteOrbit.style.display = 'none';
                }
            }, 350);
        }
    }

    updateHoverMenuPosition() {
        if (!this.hoveredNode || !this.hoveredNode.mesh || !this.camera || !this.renderer) return;
        const hoverMenu = document.getElementById('topoHoverMenu');
        const focusFrame = document.getElementById('topoFocusFrame');
        const satelliteOrbit = document.getElementById('topoSatelliteOrbit');
        if (!hoverMenu && !focusFrame && !satelliteOrbit) return;

        const vector = new THREE.Vector3();
        this.hoveredNode.mesh.getWorldPosition(vector);
        
        vector.project(this.camera);
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        
        const x = rect.left + (vector.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-vector.y * 0.5 + 0.5) * rect.height;
        
        if (hoverMenu) {
            hoverMenu.style.left = `${x}px`;
            hoverMenu.style.top = `${y}px`;
        }
        if (focusFrame) {
            focusFrame.style.left = `${x}px`;
            focusFrame.style.top = `${y}px`;
        }
        if (satelliteOrbit) {
            satelliteOrbit.style.left = `${x}px`;
            satelliteOrbit.style.top = `${y}px`;
        }
    }

    updateNodeDelay(ip, delay, status) {
        if (!this.nodes) return;
        const node = this.nodes.find(n => n.ip === ip);
        if (node && node.mesh) {
            node.delay = delay;
            node.status = status;
            let color = node.originalColor;
            let emissive = node.originalEmissive;
            let lineOpacity = 0.24;
            let lineColor = 0x4facfe;

            if (status === 'disconnected') {
                color = 0x555555;      
                emissive = 0x221111;   
                lineColor = 0xff3366;  
                lineOpacity = 0.12;
            } else if (delay > 150) {
                color = 0xffaa00;      
                emissive = 0x331100;
                lineColor = 0xffaa00;
                lineOpacity = 0.45;
            } else if (delay > 50) {
                color = 0xffff33;      
                emissive = 0x222200;
                lineColor = 0xffff33;
                lineOpacity = 0.38;
            } else {
                lineColor = 0x00ff88;
                lineOpacity = 0.32;
            }
            
            node.mesh.material.color.setHex(color);
            node.mesh.material.emissive.setHex(emissive);
            
            if (node.line) {
                node.line.material.color.setHex(lineColor);
                node.line.material.opacity = lineOpacity;
            }
            console.log(`Updated 3D planetary node ${ip} latency: ${delay}ms, status: ${status}`);
        }
    }
}

window.handleTopoMenu = function(action) {
    if (!topoViewer || !topoViewer.hoveredNode) return;
    const node = topoViewer.hoveredNode;
    const connKey = node.key;
    
    topoViewer.hideHoverMenu();
    
    window.LdySSHBus.emit('topo-menu-action', { action, connKey, node });
};

window.updateNodeDelay = function(ip, delay, status) {
    window.LdySSHBus.emit('node-delay-updated', { ip, delay, status });
};

function initBackgroundTopology() {
    if (topoViewer) return;
    const container = document.getElementById('threejsBackground');
    const termContainer = document.querySelector('.terminal-container');
    if (!container || !termContainer || typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
        setTimeout(initBackgroundTopology, 100);
        return;
    }
    try {
        topoViewer = new TopologyViewer('threejsBackground');
        topoViewer.init();
        topoViewer.animate();
        console.log("3D Background Topology successfully initialized.");
        if (window.LdySSHAPI) {
            const activeSessionId = window.LdySSHAPI.getActiveSessionId();
            window.LdySSHBus.emit('workbench-active-changed', !activeSessionId);
        }
    } catch (e) {
        console.error("Failed to initialize 3D topology:", e);
        topoViewer = null;
        setTimeout(initBackgroundTopology, 1000);
    }
}

// 绑定事件总线监听器以解耦 app.js
window.LdySSHBus.on('connections-loaded', () => {
    if (topoViewer) {
        topoViewer.buildTopology();
    }
});

window.LdySSHBus.on('node-delay-updated', ({ ip, delay, status }) => {
    if (topoViewer) {
        topoViewer.updateNodeDelay(ip, delay, status);
    }
});

window.LdySSHBus.on('connect-start', (hostname) => {
    if (topoViewer && typeof topoViewer.warpToNode === 'function') {
        topoViewer.warpToNode(hostname);
    }
});

window.LdySSHBus.on('show-connections-home', () => {
    if (topoViewer && typeof topoViewer.resetWarp === 'function') {
        topoViewer.resetWarp();
    }
});

window.LdySSHBus.on('workbench-active-changed', (active) => {
    if (topoViewer && topoViewer.controls) {
        topoViewer.controls.enabled = active;
        
        const bg = document.getElementById('threejsBackground');
        if (bg) {
            bg.style.pointerEvents = active ? 'auto' : 'none';
        }
    }
});

// 立即运行
initBackgroundTopology();
