// ==========================================================================
// LdySSH v2.6 - Nous Research Hermes AI Agent Controller & Iframe Bridge
// ==========================================================================

class HermesAgentController {
    constructor() {
        this.pendingToolCall = null;
    }

    init() {
        this.bindEvents();
        this.setupMessageListener();
    }

    bindEvents() {
        const approveYes = document.getElementById('hermesApproveYes');
        const approveNo = document.getElementById('hermesApproveNo');
        
        if (approveYes) {
            approveYes.addEventListener('click', () => this.handleApproval(true));
        }
        if (approveNo) {
            approveNo.addEventListener('click', () => this.handleApproval(false));
        }
    }

    setupMessageListener() {
        // 监听来自内嵌 iframe (Hermes WebUI) 的 postMessage 跨域操控信号
        window.addEventListener('message', (event) => {
            // 确保消息结构合法
            if (event.data && event.data.type === 'LDYSSH_API') {
                const { action, id, arguments: args } = event.data;
                console.log("Hermes Bridge: received action", action, args);
                
                // 将指令暂存，等待安全审批
                this.pendingToolCall = {
                    id: id || `call_${Date.now()}`,
                    name: action,
                    arguments: args
                };

                // 敏感指令，拦截并进入“安全审批气囊”弹窗
                this.showApprovalModal(action, args);
            }
        });
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
            console.warn(`User rejected AI tool execution: ${call.name}`);
            return;
        }

        // 批准后，执行真实调用
        try {
            if (call.name === 'connect_to_host') {
                if (window.LdySSHAPI) {
                    window.LdySSHAPI.quickConnect(call.arguments.key);
                    this.sendToolResult(call.id, { success: true, message: `Successfully requested connection for key ${call.arguments.key}` });
                } else {
                    throw new Error("LdySSHAPI not found");
                }
            } else if (call.name === 'execute_terminal_command') {
                if (window.LdySSHAPI) {
                    const activeId = window.LdySSHAPI.getActiveSessionId();
                    if (!activeId) {
                        this.sendToolResult(call.id, { success: false, error: 'No active terminal session. Please connect to a server first.' });
                        alert('❌ 执行失败：当前没有处于活跃的 SSH 终端会话。');
                        return;
                    }
                    const ok = window.LdySSHAPI.executeTerminalCommand(activeId, call.arguments.command);
                    if (ok) {
                        this.sendToolResult(call.id, { success: true, message: `Command sent to active terminal session ${activeId}.` });
                    } else {
                        throw new Error("Failed to execute command on active session");
                    }
                } else {
                    throw new Error("LdySSHAPI not found");
                }
            }
        } catch (err) {
            this.sendToolResult(call.id, { success: false, error: err.message });
            console.error(`Error executing AI tool: ${err.message}`);
        }
    }

    sendToolResult(callId, result) {
        // 将执行结果安全回传给 iframe 内部的 Hermes WebUI
        const iframe = document.getElementById('hermesIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'LDYSSH_API_RESULT',
                id: callId,
                result: result
            }, '*');
        }
    }
}

// 绑定并初始化全局对象
window.HermesAI = new HermesAgentController();
document.addEventListener('DOMContentLoaded', () => {
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

// 独立窗口弹出触发
window.popHermesWindow = function() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.pop_hermes_window) {
        window.pywebview.api.pop_hermes_window();
    } else {
        console.error("Pywebview API not available");
        // 兜底在新浏览器标签页中打开
        window.open("http://localhost:61356", "_blank");
    }
};
