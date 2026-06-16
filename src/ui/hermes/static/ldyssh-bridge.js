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

    // 页面完全载入后做一次全面预扫
    window.addEventListener('DOMContentLoaded', () => {
        scanForCommands();
    });
})();
