(function() {
    console.log("LdySSH Bridge loaded inside Hermes WebUI!");

    // 全局已处理的指令，防止在流式打印时多次发送
    const processedActions = new Set();

    // 扫描页面捕获 AI 产生的 LdySSH 特殊指令
    function scanForCommands() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.nodeValue;
            
            // 1. 匹配连接主机: [LDYSSH_CONNECT:jupiter]
            const connMatch = text.match(/\[LDYSSH_CONNECT:(.*?)\]/);
            if (connMatch) {
                const key = connMatch[1].trim();
                const actionId = `connect_${key}`;
                if (!processedActions.has(actionId)) {
                    processedActions.add(actionId);
                    
                    // 向父层客户端发送安全连接信号
                    window.parent.postMessage({
                        type: 'LDYSSH_API',
                        action: 'connect_to_host',
                        id: actionId,
                        arguments: { key: key }
                    }, '*');

                    // 将页面丑陋的占位符美化为炫酷的高级卡片提示
                    replaceTextNodeWithCard(node, `🌐 已经向 LdySSH 请求连接主机：[${key}]`, 'connect');
                }
            }

            // 2. 匹配执行命令: [LDYSSH_EXECUTE:df -h]
            const execMatch = text.match(/\[LDYSSH_EXECUTE:(.*?)\]/);
            if (execMatch) {
                const command = execMatch[1].trim();
                // 用 base64 处理做 md5-like 去重 Key
                const actionId = `execute_${btoa(unescape(encodeURIComponent(command))).replace(/=/g, '')}`;
                if (!processedActions.has(actionId)) {
                    processedActions.add(actionId);

                    // 向父层客户端发送命令执行信号
                    window.parent.postMessage({
                        type: 'LDYSSH_API',
                        action: 'execute_terminal_command',
                        id: actionId,
                        arguments: { command: command }
                    }, '*');

                    // 将页面丑陋的占位符美化为炫酷的高级卡片提示
                    replaceTextNodeWithCard(node, `⚡ 已经向 LdySSH 请求在活跃终端执行命令：\n${command}`, 'execute');
                }
            }
        }
    }

    function replaceTextNodeWithCard(textNode, labelText, type) {
        const parent = textNode.parentNode;
        if (!parent) return;

        const card = document.createElement('div');
        card.className = 'ldyssh-bridge-action-card';
        card.style.background = 'rgba(0, 242, 254, 0.04)';
        card.style.border = '1px dashed rgba(0, 242, 254, 0.3)';
        card.style.borderRadius = '8px';
        card.style.padding = '10px 14px';
        card.style.margin = '8px 0';
        card.style.fontSize = '12px';
        card.style.color = '#00f2fe';
        card.style.fontFamily = 'Consolas, Monaco, monospace';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '6px';
        card.style.boxShadow = '0 0 12px rgba(0, 242, 254, 0.05)';

        const badge = document.createElement('span');
        badge.style.fontWeight = 'bold';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '6px';
        badge.innerHTML = type === 'connect' ? '🪐 LdySSH 行星自动跃迁连接' : '🛡️ LdySSH 敏感命令执行申请';

        const content = document.createElement('pre');
        content.style.margin = '0';
        content.style.whiteSpace = 'pre-wrap';
        content.style.wordBreak = 'break-all';
        content.style.color = '#e2e8f0';
        content.style.background = 'rgba(0, 0, 0, 0.3)';
        content.style.padding = '8px';
        content.style.borderRadius = '4px';
        content.style.border = '1px solid rgba(255,255,255,0.05)';
        content.innerText = labelText;

        card.appendChild(badge);
        card.appendChild(content);

        parent.replaceChild(card, textNode);
    }

    // 挂载高频高能 DOM 侦听，应对流式大语言模型动态打字输入场景
    const observer = new MutationObserver((mutations) => {
        scanForCommands();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    function initBridge() {
        scanForCommands();

        // 注入大模型下载/就绪指示横幅 CSS 样式
        const style = document.createElement('style');
        style.innerHTML = `
            .ldyssh-llm-banner {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 38px;
                background: rgba(15, 23, 42, 0.9);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border-bottom: 1px solid rgba(168, 85, 247, 0.45);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 16px;
                box-sizing: border-box;
                color: #f1f5f9;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 12px;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s;
            }
            .ldyssh-llm-banner.hidden {
                transform: translateY(-38px);
                opacity: 0;
                pointer-events: none;
            }
            .ldyssh-llm-banner-content {
                display: flex;
                align-items: center;
                gap: 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex-grow: 1;
            }
            .ldyssh-llm-badge {
                background: linear-gradient(135deg, #a855f7, #ec4899);
                color: #fff;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
                white-space: nowrap;
            }
            .ldyssh-llm-badge.ready {
                background: linear-gradient(135deg, #10b981, #059669);
            }
            .ldyssh-llm-badge.error {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
            }
            .ldyssh-llm-close-btn {
                background: none;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                font-size: 18px;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s;
                line-height: 1;
            }
            .ldyssh-llm-close-btn:hover {
                color: #f1f5f9;
            }
            /* 调整页面主体以防 banner 遮挡 */
            body {
                padding-top: 38px !important;
                transition: padding-top 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            body.banner-closed {
                padding-top: 0px !important;
            }
        `;
        document.head.appendChild(style);

        // 创建 Banner 节点
        const banner = document.createElement('div');
        banner.className = 'ldyssh-llm-banner';
        banner.innerHTML = `
            <div class="ldyssh-llm-banner-content">
                <span class="ldyssh-llm-badge" id="llmBadge">AI 连接中</span>
                <span id="llmText">正在初始化本地大模型连接状态...</span>
            </div>
            <button class="ldyssh-llm-close-btn" id="llmCloseBtn" title="关闭提示">×</button>
        `;
        document.body.appendChild(banner);

        document.getElementById('llmCloseBtn').onclick = () => {
            banner.classList.add('hidden');
            document.body.classList.add('banner-closed');
        };

        let checkInterval = null;

        async function checkStatus() {
            try {
                const res = await fetch('status.json?t=' + Date.now());
                if (!res.ok) {
                    showConnectingState();
                    return;
                }
                const data = await res.json();
                
                if (data.status === 'completed') {
                    showReadyState();
                } else if (data.status === 'failed') {
                    showErrorState(data.error || '下载失败');
                } else if (data.status === 'downloading') {
                    showDownloadingState(data.progress_engine, data.progress_model, data.speed);
                } else {
                    showConnectingState();
                }
            } catch (err) {
                showConnectingState();
            }
        }

        function showConnectingState() {
            const badge = document.getElementById('llmBadge');
            const text = document.getElementById('llmText');
            if (badge && text) {
                badge.className = 'ldyssh-llm-badge';
                badge.innerText = 'AI 连接中';
                text.innerHTML = '正在连接本地大模型推理引擎... 如果是首次开启，后台正在自动为您下载环境依赖（约 1GB）。';
            }
        }

        function showDownloadingState(progEng, progMod, speed) {
            const badge = document.getElementById('llmBadge');
            const text = document.getElementById('llmText');
            if (badge && text) {
                badge.className = 'ldyssh-llm-badge';
                badge.innerText = '部署中';
                text.innerHTML = `📥 正在自动下载部署本地离线 AI 大模型（共约 1GB）: 引擎已下载 <b>${progEng.toFixed(1)}%</b>，大模型已下载 <b>${progMod.toFixed(1)}%</b> [下载速度: ${speed}]。完成后即可完全离线极速运行！`;
            }
        }

        function showErrorState(err) {
            const badge = document.getElementById('llmBadge');
            const text = document.getElementById('llmText');
            if (badge && text) {
                badge.className = 'ldyssh-llm-badge error';
                badge.innerText = '下载异常';
                text.innerHTML = `❌ 本地 AI 服务集成失败：<b>${err}</b>。请检查您的网络连接并重新启动 LdySSH 软件。`;
            }
        }

        function showReadyState() {
            const badge = document.getElementById('llmBadge');
            const text = document.getElementById('llmText');
            if (badge && text) {
                badge.className = 'ldyssh-llm-badge ready';
                badge.innerText = '本地 AI 已就绪';
                text.innerHTML = '🟢 本地离线 Qwen2.5 物理大模型已就绪！<b>💡 提示：点击左侧聊天大区上方的 “+” 按钮新建会话，即可与离线 AI 展开对话！</b>';
            }
            // 就绪 8 秒后自动收起
            setTimeout(() => {
                banner.classList.add('hidden');
                document.body.classList.add('banner-closed');
            }, 8000);
            
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }
        }

        checkInterval = setInterval(checkStatus, 2000);
        checkStatus();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initBridge);
    } else {
        initBridge();
    }
})();
