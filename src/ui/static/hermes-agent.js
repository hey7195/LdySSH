// ==========================================================================
// LdySSH v2.5 - Nous Research Hermes AI Agent Controller
// ==========================================================================

class HermesAgentController {
    constructor() {
        this.socket = null;
        this.reconnectTimer = null;
        this.wsUrl = 'ws://localhost:61355';
        this.currentRole = 'devops'; // 默认角色
        this.isThinking = false;
        this.pendingToolCall = null;
        
        // 角色预设
        this.roles = {
            devops: "你是一个专业的 Linux 系统运维专家，主要协助用户管理集群主机、排查系统问题、优化配置。你的名字叫 Hermes。你可以自动调用工具来获取主机列表、连接主机或执行终端命令。所有执行命令均需用户审批通过后才能真正注入终端，请保持回复简洁专业。",
            secops: "你是一个经验丰富的网络安全审计师，负责审查和执行系统漏洞扫描、分析安全日志、固化配置。保持高度的警惕性，指导用户运行安全的命令，并指出可能存在的安全风险。",
            coder: "你是一个熟练的 Shell/Python 自动化脚本大师，善于编写优雅、健壮的运维脚本。你可以根据用户的意图编写一行式命令或复杂脚本，并协助其在终端执行。"
        };
    }

    init() {
        this.bindEvents();
        this.connect();
    }

    connect() {
        if (this.socket) {
            this.socket.close();
        }
        
        console.log(`Connecting to Hermes AI Backend: ${this.wsUrl}`);
        this.socket = new WebSocket(this.wsUrl);
        
        this.socket.onopen = () => {
            console.log("Hermes AI Backend successfully connected.");
            this.updateStatusIndicator(true);
            if (this.reconnectTimer) {
                clearInterval(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            // 欢迎语
            this.appendMessage('assistant', '🔮 **Hermes AI 智能运维助手已上线。** \n您可以输入运维命令，例如：\n* *"帮我连接到我的 Linux 主机"* \n* *"检查服务器磁盘空间"* \n我会自动寻找合适的主机并在您的批准下执行命令。');
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleBackendMessage(message);
            } catch (e) {
                console.error("Failed to parse websocket message:", e);
            }
        };

        this.socket.onclose = () => {
            console.warn("Hermes AI Backend disconnected. Retrying in 5 seconds...");
            this.updateStatusIndicator(false);
            this.setThinking(false);
            if (!this.reconnectTimer) {
                this.reconnectTimer = setInterval(() => this.connect(), 5000);
            }
        };

        this.socket.onerror = (error) => {
            console.error("Hermes AI Backend connection error:", error);
        };
    }

    bindEvents() {
        const sendBtn = document.getElementById('hermesSendBtn');
        const inputEl = document.getElementById('hermesInput');
        const roleSelect = document.getElementById('hermesRoleSelect');
        const approveYes = document.getElementById('hermesApproveYes');
        const approveNo = document.getElementById('hermesApproveNo');
        
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }
        if (roleSelect) {
            roleSelect.addEventListener('change', (e) => {
                this.currentRole = e.target.value;
                this.appendMessage('system', `已切换系统角色为：**${roleSelect.options[roleSelect.selectedIndex].text}**`);
            });
        }
        if (approveYes) {
            approveYes.addEventListener('click', () => this.handleApproval(true));
        }
        if (approveNo) {
            approveNo.addEventListener('click', () => this.handleApproval(false));
        }
    }

    updateStatusIndicator(online) {
        const indicator = document.getElementById('hermesStatusDot');
        const text = document.getElementById('hermesStatusText');
        if (indicator) {
            indicator.className = online ? 'status-dot online' : 'status-dot offline';
        }
        if (text) {
            text.textContent = online ? 'Hermes AI 连通中' : 'AI 离线 (重连中...)';
        }
    }

    sendMessage() {
        const inputEl = document.getElementById('hermesInput');
        if (!inputEl || this.isThinking) return;
        
        const text = inputEl.value.trim();
        if (!text) return;
        
        inputEl.value = '';
        this.appendMessage('user', text);
        this.setThinking(true);
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'chat',
                prompt: text,
                system: this.roles[this.currentRole]
            }));
        } else {
            this.appendMessage('system', '❌ 无法发送消息：AI 后端未连接。请检查本地模型代理是否已运行。');
            this.setThinking(false);
        }
    }

    setThinking(thinking) {
        this.isThinking = thinking;
        const loader = document.getElementById('hermesThinkingLoader');
        const sendBtn = document.getElementById('hermesSendBtn');
        if (loader) {
            loader.style.display = thinking ? 'flex' : 'none';
        }
        if (sendBtn) {
            sendBtn.disabled = thinking;
        }
    }

    appendMessage(role, text) {
        const chatLog = document.getElementById('hermesChatLog');
        if (!chatLog) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${role}`;
        
        let icon = '🔮';
        if (role === 'user') icon = '👤';
        else if (role === 'system') icon = '⚙️';
        
        // 解析简单的 Markdown 格式
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br/>');
            
        msgDiv.innerHTML = `<span class="msg-icon">${icon}</span><div class="msg-bubble">${html}</div>`;
        chatLog.appendChild(msgDiv);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    handleBackendMessage(msg) {
        if (msg.type === 'response') {
            this.setThinking(false);
            if (msg.text) {
                this.appendMessage('assistant', msg.text);
            }
        } else if (msg.type === 'tool_call') {
            this.handleToolCall(msg);
        } else if (msg.type === 'error') {
            this.setThinking(false);
            this.appendMessage('system', `⚠️ AI 服务异常：${msg.message}`);
        }
    }

    handleToolCall(call) {
        const { id, name, arguments: args } = call;
        console.log("Received Tool Call from AI:", name, args);

        if (name === 'get_hosts_list') {
            // 直接执行并返回（无敏感操作）
            const hosts = window.LdySSHAPI ? window.LdySSHAPI.getSavedConnections() : [];
            const result = hosts.map(h => ({
                key: h.key,
                name: h.name || h.hostname,
                hostname: h.hostname,
                username: h.username,
                group: h.group || '未分组'
            }));
            this.sendToolResult(id, result);
            this.appendMessage('system', '🤖 *AI 自动读取了已保存的主机列表。*');
            return;
        }

        // 敏感操作，拦截进入“安全审批气囊”
        this.pendingToolCall = call;
        this.showApprovalModal(name, args);
    }

    showApprovalModal(name, args) {
        const modal = document.getElementById('hermesApproveModal');
        const title = document.getElementById('approveActionTitle');
        const desc = document.getElementById('approveActionDesc');
        
        if (!modal || !title || !desc) return;
        
        if (name === 'connect_to_host') {
            title.innerHTML = '🌐 申请自动发起 SSH 连接';
            desc.innerHTML = `AI 请求建立新的 SSH 终端窗口：<br/><strong>主机 Key:</strong> <code>${args.key}</code>`;
        } else if (name === 'execute_terminal_command') {
            title.innerHTML = '⚡ 申请自动执行终端命令';
            desc.innerHTML = `AI 试图在当前的活跃终端执行命令：<br/><pre class="approve-cmd-block"><code>${args.command}</code></pre>`;
        }
        
        modal.style.display = 'flex';
        modal.offsetHeight; // 强制回流
        modal.classList.add('active');
    }

    hideApprovalModal() {
        const modal = document.getElementById('hermesApproveModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    }

    handleApproval(approved) {
        this.hideApprovalModal();
        if (!this.pendingToolCall) return;
        
        const call = this.pendingToolCall;
        this.pendingToolCall = null;
        
        if (!approved) {
            this.sendToolResult(call.id, { success: false, error: 'User rejected the operation.' });
            this.appendMessage('system', `❌ *您拒绝了 AI 执行 ${call.name} 的请求。*`);
            return;
        }

        // 执行操作
        try {
            if (call.name === 'connect_to_host') {
                if (window.LdySSHAPI) {
                    window.LdySSHAPI.quickConnect(call.arguments.key);
                    this.sendToolResult(call.id, { success: true, message: `Successfully requested connection for key ${call.arguments.key}` });
                    this.appendMessage('system', `✅ *已批准：自动连接到主机 [${call.arguments.key}]。*`);
                } else {
                    throw new Error("LdySSHAPI not found");
                }
            } else if (call.name === 'execute_terminal_command') {
                if (window.LdySSHAPI) {
                    const activeId = window.LdySSHAPI.getActiveSessionId();
                    if (!activeId) {
                        this.sendToolResult(call.id, { success: false, error: 'No active terminal session. Please connect to a server first.' });
                        this.appendMessage('system', '❌ *执行失败：当前没有处于活跃的 SSH 终端会话。*');
                        return;
                    }
                    const ok = window.LdySSHAPI.executeTerminalCommand(activeId, call.arguments.command);
                    if (ok) {
                        this.sendToolResult(call.id, { success: true, message: `Command sent to active terminal session ${activeId}.` });
                        this.appendMessage('system', `✅ *已批准：向终端发送命令 [${call.arguments.command}]。*`);
                    } else {
                        throw new Error("Failed to execute command on active session");
                    }
                } else {
                    throw new Error("LdySSHAPI not found");
                }
            }
        } catch (err) {
            this.sendToolResult(call.id, { success: false, error: err.message });
            this.appendMessage('system', `⚠️ *执行工具调用时出错：${err.message}*`);
        }
    }

    sendToolResult(callId, result) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'tool_result',
                id: callId,
                result: result
            }));
        }
    }
}

// 绑定到全局 window
window.HermesAI = new HermesAgentController();
document.addEventListener('DOMContentLoaded', () => {
    // 延时加载 AI 面板防止干扰主流程
    setTimeout(() => {
        window.HermesAI.init();
    }, 500);
});

// 前端 Drawer 侧滑开关
window.toggleHermesDrawer = function() {
    const drawer = document.getElementById('hermesDrawer');
    if (drawer) {
        drawer.classList.toggle('collapsed');
    }
};
