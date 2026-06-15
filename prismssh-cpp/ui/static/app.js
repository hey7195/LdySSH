// --- Global Console Logging Redirection to Local Log File ---
(function() {
    let isLogForwarding = false;
    
    function safeForward(level, args) {
        if (isLogForwarding) return;
        isLogForwarding = true;
        try {
            const msg = args.map(arg => {
                if (arg instanceof Error) {
                    return arg.message + "\n" + arg.stack;
                }
                if (typeof arg === 'object') {
                    try { return JSON.stringify(arg); } catch(e) { return "[Object]"; }
                }
                return String(arg);
            }).join(' ');
            
            if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.write_log === 'function') {
                window.pywebview.api.write_log(level, msg).catch(() => {});
            }
        } catch (e) {
            // prevent infinite loops
        } finally {
            isLogForwarding = false;
        }
    }

    const orgLog = console.log;
    console.log = function(...args) {
        orgLog.apply(console, args);
        safeForward("JS_INFO", args);
    };

    const orgWarn = console.warn;
    console.warn = function(...args) {
        orgWarn.apply(console, args);
        safeForward("JS_WARN", args);
    };

    const orgError = console.error;
    console.error = function(...args) {
        orgError.apply(console, args);
        safeForward("JS_ERROR", args);
    };
})();

// 每个工具独立的侧边栏宽度缓存，避免宽度相互影响
let sidebarWidths = {
    commands: '380px',
    sftp: '700px',
    monitor: '380px',
    portForward: '380px',
    highlight: '380px',
    ai: '400px'
};

let currentSessionId = null;
let currentTerminal = null;
let sessions = {};
let isSplitMode = false;
let splitLeftSessionId = null;
let splitRightSessionId = null;
let outputPollingInterval = null;
let outputPollFailureCount = 0;
let fitAddon = null;
let currentTool = null;
let currentPath = '/';
let isLoadingFiles = false;
let savedConnectionsCache = [];
let highlightRules = [];
let cachedHighlightRegex = null;
let activeHighlightRules = [];
let connectionsHomeView = 'grid';
let isPrivacyMode = true;
const RECENT_CONNECTION_LIMIT = 5;
let systemMonitorInterval = null;
let systemMonitorLoading = false;
let systemMonitorData = {
    systemInfo: null,
    systemStats: null,
    processList: null,
    diskUsage: null,
    networkInfo: null
};

const LDYSSH_LOCALIZED_MARKERS = { disconnected: '连接已断开，是否重新连接？', monitorUnsupported: '当前环境不支持系统监控，或权限不足。' };
const OUTPUT_POLL_DELAY_MS = 20; // Drastically reduced for extreme responsiveness
const STATUS_FAILURE_LIMIT = 3;
const TERMINAL_SCROLLBACK = 1000;
const MAX_POLL_DELAY_MS = 1000;
let currentPollDelay = OUTPUT_POLL_DELAY_MS;
let lastStatusCheckTime = 0;
const COMMAND_INPUT_MAX = 240;
const AI_CONTEXT_MAX = 4000;
// 注入的海量智能命令库
let LINUX_COMMAND_SUGGESTIONS = window.LINUX_COMMAND_SUGGESTIONS || [];
if (!Array.isArray(LINUX_COMMAND_SUGGESTIONS)) {
    LINUX_COMMAND_SUGGESTIONS = [];
}
// console.log(`[AI AutoComplete] Successfully loaded ${LINUX_COMMAND_SUGGESTIONS.length} intelligent commands`);

// Optimistic typing state
let pendingEchoBuffer = [];
const ECHO_TIMEOUT_MS = 2000;

function isOptimisticChar(data) {
    if (data.length !== 1) return false;
    const code = data.charCodeAt(0);
    if (code === 127) return true; // backspace
    return code >= 32;
}

function stripPredictedEchoes(output) {
    if (pendingEchoBuffer.length === 0) return output;

    const now = Date.now();

    while (pendingEchoBuffer.length > 0 && now - pendingEchoBuffer[0].time > ECHO_TIMEOUT_MS) {
        pendingEchoBuffer.shift();
    }

    if (pendingEchoBuffer.length === 0) return output;

    let outputPos = 0;
    let matched = 0;

    while (matched < pendingEchoBuffer.length && outputPos < output.length) {
        if (output[outputPos] === pendingEchoBuffer[matched].char) {
            outputPos++;
            matched++;
        } else {
            break;
        }
    }

    if (matched > 0) {
        pendingEchoBuffer.splice(0, matched);
    }

    return output.substring(outputPos);
}

function getCommandInputState(sessionId) {
    if (!sessions[sessionId]) return null;
    if (!sessions[sessionId].commandInput) {
        sessions[sessionId].commandInput = { buffer: '', suggestions: [], suggestionIndex: 0 };
    }
    return sessions[sessionId].commandInput;
}

let commandHistoryCache = null;

function getCommandHistory() {
    if (commandHistoryCache !== null) return commandHistoryCache;
    try {
        commandHistoryCache = JSON.parse(localStorage.getItem('prism_command_history') || '[]');
    } catch {
        commandHistoryCache = [];
    }
    return commandHistoryCache;
}

function saveCommandToHistory(command) {
    try {
        const cmd = String(command || '').trim();
        if (!cmd || cmd.length < 2) return;
        let history = getCommandHistory();
        history = history.filter(c => c !== cmd);
        history.unshift(cmd);
        if (history.length > 500) history = history.slice(0, 500);
        commandHistoryCache = history;
        localStorage.setItem('prism_command_history', JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save command history', e);
    }
}

function findCommandSuggestions(buffer) {
    const input = String(buffer || '').trimStart().toLowerCase();
    if (input.length < 1) return [];

    let matches = [];
    const history = getCommandHistory();
    const seenCommands = new Set();

    // 1. Search in local history first (highest priority)
    for (const cmdStr of history) {
        const cmd = cmdStr.toLowerCase();
        if (cmd.startsWith(input) || cmd.includes(input)) {
            let score = cmd.startsWith(input) ? 200 : 150;
            score -= cmd.length * 0.1; // Shorter matching commands score slightly higher
            // Wrap string into item object format
            matches.push({ item: { command: cmdStr, description: '记忆: 历史命令' }, score });
            seenCommands.add(cmdStr);
        }
    }

    // 2. Search in default library
    for (const item of LINUX_COMMAND_SUGGESTIONS) {
        // Skip if already in matches (via history)
        if (seenCommands.has(item.command)) continue;
        
        let score = 0;
        const cmd = item.command.toLowerCase();
        const desc = item.description.toLowerCase();

        if (cmd.startsWith(input)) score = 100;
        else if (cmd.includes(input)) score = 50;
        else if (desc.includes(input)) score = 30;

        if (score > 0) {
            score -= cmd.length * 0.1;
            matches.push({ item, score });
            seenCommands.add(item.command);
        }
    }

    return matches.sort((a, b) => b.score - a.score).map(m => m.item).slice(0, 5);
}

function hideCommandSuggestion() {
    const suggestionEl = document.getElementById('terminalCommandSuggest');
    if (suggestionEl) {
        suggestionEl.style.display = 'none';
        suggestionEl.innerHTML = '';
    }
}

function commandSuggestIsVisible() {
    const suggestionEl = document.getElementById('terminalCommandSuggest');
    return suggestionEl && suggestionEl.style.display === 'block';
}

function renderCommandSuggestion(sessionId) {
    if (currentSessionId !== sessionId) return;

    const state = getCommandInputState(sessionId);
    const suggestionEl = document.getElementById('terminalCommandSuggest');
    if (!state || !suggestionEl || !state.suggestions || state.suggestions.length === 0) {
        hideCommandSuggestion();
        return;
    }

    const typed = state.buffer.trimStart();
    if (!typed) {
        hideCommandSuggestion();
        return;
    }

    if (state.suggestionIndex < 0) state.suggestionIndex = 0;
    if (state.suggestionIndex >= state.suggestions.length) state.suggestionIndex = state.suggestions.length - 1;

    let html = '';
    state.suggestions.forEach((item, idx) => {
        const isSelected = idx === state.suggestionIndex;
        const className = isSelected ? 'terminal-command-item selected' : 'terminal-command-item';
        html += `<div class="${className}" style="${isSelected ? 'background: rgba(255,255,255,0.1); border-left: 2px solid var(--accent-color); padding-left: 8px;' : 'padding-left: 10px; border-left: 2px solid transparent;'} display: flex; justify-content: space-between; padding-top: 4px; padding-bottom: 4px; padding-right: 10px; font-size: 13px; cursor: pointer;" onclick="selectCommandSuggestionAndAccept('${escapeJs(item.command)}', '${escapeJs(sessionId)}'); event.stopPropagation();">
                    <span class="terminal-command-main" style="${isSelected ? 'color: var(--accent-color); font-weight: bold;' : ''}">${escapeHtml(item.command)}</span>
                    <span class="terminal-command-desc" style="color: #aaa; margin-left: 15px; opacity: 0.8; font-size: 12px; white-space: nowrap;">${escapeHtml(item.description)}</span>
                 </div>`;
    });

    suggestionEl.innerHTML = html;
    suggestionEl.style.display = 'block';
    suggestionEl.style.padding = '4px 0'; // override default padding for multi-line

    // Position near the terminal cursor
    try {
        if (currentTerminal && currentTerminal.element) {
            let leftPos = 0;
            let topPos = 0;
            
            const cursorX = currentTerminal.buffer.active.cursorX || 0;
            const cursorY = currentTerminal.buffer.active.cursorY || 0;
            
            // Find the hidden IME textarea which xterm.js magically keeps perfectly aligned with the cursor pixel
            const textarea = currentTerminal.element.querySelector('.xterm-helper-textarea') || currentTerminal.element.querySelector('textarea');
            
            // Extract the true cell height from internal renderer API if available
            let cellH = 17;
            if (currentTerminal._core && currentTerminal._core._renderService && currentTerminal._core._renderService.dimensions) {
                const dims = currentTerminal._core._renderService.dimensions;
                cellH = dims.actualCellHeight || (dims.css && dims.css.cell ? dims.css.cell.height : 17);
            }

            let cursorTop = 0;
            if (textarea) {
                const rect = textarea.getBoundingClientRect();
                leftPos = rect.left;
                cursorTop = rect.top;
                topPos = cursorTop + cellH + 5;
            } else {
                // Ultimate fallback
                const screenNode = currentTerminal.element.querySelector('.xterm-screen') || currentTerminal.element;
                const screenRect = screenNode.getBoundingClientRect();
                let cellW = 9;
                if (currentTerminal._core && currentTerminal._core._renderService && currentTerminal._core._renderService.dimensions) {
                    const dims = currentTerminal._core._renderService.dimensions;
                    cellW = dims.actualCellWidth || (dims.css && dims.css.cell ? dims.css.cell.width : 9);
                } else {
                    cellW = screenRect.width / (currentTerminal.cols || 80);
                    cellH = screenRect.height / (currentTerminal.rows || 24);
                }
                leftPos = screenRect.left + (cursorX * cellW);
                cursorTop = screenRect.top + (cursorY * cellH);
                topPos = cursorTop + cellH + 5;
            }
            
            // Move the popup to the document body to prevent ANY CSS positioning bugs from parent containers
            if (suggestionEl.parentElement !== document.body) {
                document.body.appendChild(suggestionEl);
            }
            
            const suggestW = suggestionEl.offsetWidth || 300;
            const suggestH = suggestionEl.offsetHeight || 50;
            
            // Adjust if goes out of viewport
            if (leftPos + suggestW > window.innerWidth) leftPos = Math.max(10, window.innerWidth - suggestW - 20);
            if (topPos + suggestH > window.innerHeight) {
                // If it goes off the bottom, pop it ABOVE the cursor
                topPos = cursorTop - suggestH - 5;
            }
            
            suggestionEl.style.position = 'fixed';
            suggestionEl.style.left = `${leftPos}px`;
            suggestionEl.style.top = `${topPos}px`;
            suggestionEl.style.bottom = 'auto';
            suggestionEl.style.right = 'auto';
            suggestionEl.style.transform = 'translateY(0)';
        }
    } catch (e) {
        console.warn('Failed to position command suggestion:', e);
    }
}

function updateCommandSuggestion(sessionId, data) {
    if (sessions[sessionId] && sessions[sessionId].hostname === 'Local CMD') return;
    
    const state = getCommandInputState(sessionId);
    if (!state) return;

    if (data === '\r' || data === '\n' || data === '\u0003' || data === '\u001b') {
        state.buffer = '';
        state.suggestions = [];
        hideCommandSuggestion();
        return;
    }

    if (data === '\t') return;

    if (data.charCodeAt(0) === 127 || data === '\b') {
        state.buffer = state.buffer.slice(0, -1);
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        state.buffer = (state.buffer + data).slice(-COMMAND_INPUT_MAX);
    } else {
        return;
    }

    if (state.buffer.trim() === '') {
        state.suggestions = [];
        hideCommandSuggestion();
        return;
    }

    state.suggestions = findCommandSuggestions(state.buffer);
    state.suggestionIndex = 0;
    state.suggestionExplicitlySelected = false;
    renderCommandSuggestion(sessionId);
}

function acceptCommandSuggestion(sessionId) {
    const state = getCommandInputState(sessionId);
    if (!state || !state.suggestions || state.suggestions.length === 0) return false;

    const selectedItem = state.suggestions[state.suggestionIndex];
    if (!selectedItem || !selectedItem.command) return false;

    saveCommandToHistory(selectedItem.command);

    const typed = state.buffer;
    let sequence = '';
    // 发送与已输入字符等量的退格符，让远程 Shell 自动擦除提示内容
    for (let i = 0; i < typed.length; i++) {
        sequence += '\x7f';
    }
    // 发送完整的预测命令
    sequence += selectedItem.command;

    window.pywebview.api.send_input(sessionId, sequence);
    
    // 清除状态，收起提示框
    state.buffer = '';
    state.suggestions = [];
    hideCommandSuggestion();

    return true;
}

function selectCommandSuggestionAndAccept(commandText, sessionId) {
    const state = getCommandInputState(sessionId);
    if (!state) return;
    
    saveCommandToHistory(commandText);

    const typed = state.buffer;
    let sequence = '';
    // 发送与已输入字符等量的退格符，让远程 Shell 自动擦除提示内容
    for (let i = 0; i < typed.length; i++) {
        sequence += '\x7f';
    }
    // 发送完整的预测命令
    sequence += commandText;

    if (currentSessionId && sessions[currentSessionId]?.connected) {
        window.pywebview.api.send_input(sessionId, sequence).catch(console.error);
    }
    
    // 清除状态，收起提示框
    state.buffer = '';
    state.suggestions = [];
    hideCommandSuggestion();
}

function appendSessionOutputContext(sessionId, output) {
    if (!sessions[sessionId] || !output) return;
    const previous = sessions[sessionId].recentOutput || '';
    sessions[sessionId].recentOutput = (previous + output).slice(-AI_CONTEXT_MAX);
}

function getDefaultHighlightRules() {
    return [
        // Level 1: Core Severities
        { id: 'error', name: '错误 (Error)', pattern: '\\b(error|failed|failure|denied|refused|exception|fatal|panic|segfault)\\b', color: '#ff2a6d', enabled: true },
        { id: 'warning', name: '警告 (Warning)', pattern: '\\b(warn|warning|timeout|retry|deprecated|unstable)\\b', color: '#ff9f43', enabled: true },
        { id: 'success', name: '成功 (Success)', pattern: '\\b(ok|success|successful|accepted|connected|enabled|completed|done)\\b', color: '#10ac84', enabled: true },
        { id: 'info', name: '信息 (Info)', pattern: '\\b(info|notice|started|listening|ready|running)\\b', color: '#0abde3', enabled: true },
        { id: 'debug', name: '调试 (Debug)', pattern: '\\b(debug|trace|verbose)\\b', color: '#8395a7', enabled: true },

        // Level 2: Networking
        { id: 'ip', name: 'IPv4 地址', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', color: '#1dd1a1', enabled: true },
        { id: 'ipv6', name: 'IPv6 地址', pattern: '\\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\\b', color: '#01a3a4', enabled: true },
        { id: 'mac', name: 'MAC 地址', pattern: '\\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\\b', color: '#00d2d3', enabled: true },
        { id: 'port', name: '端口号', pattern: '(:\\d{2,5}\\b|\\bport\\s+\\d{2,5}\\b)', color: '#feca57', enabled: true },
        { id: 'http_method', name: 'HTTP 方法', pattern: '\\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\\b', color: '#9b59b6', enabled: true },
        { id: 'http_status', name: 'HTTP 状态码', pattern: '\\b(200 OK|404 Not Found|500 Internal|403 Forbidden|401 Unauthorized|502 Bad Gateway)\\b', color: '#fd79a8', enabled: true },
        { id: 'url', name: 'URL 链接', pattern: 'https?://[^\\s]+', color: '#5f27cd', enabled: true },
        
        // Level 3: DevOps & Containers
        { id: 'docker', name: 'Docker 镜像/容器', pattern: '\\b([a-z0-9_-]+/[a-z0-9_-]+:[a-zA-Z0-9_.-]+)\\b', color: '#0984e3', enabled: true },
        { id: 'k8s', name: 'K8s 资源', pattern: '\\b(pod|svc|deployment|node|ingress|configmap|secret)/[a-zA-Z0-9.-]+\\b', color: '#326ce5', enabled: true },
        { id: 'git_hash', name: 'Git Commit', pattern: '\\b[0-9a-f]{7,40}\\b', color: '#fdcb6e', enabled: true },
        { id: 'git_branch', name: 'Git 分支', pattern: '\\b(master|main|develop|HEAD)\\b', color: '#e17055', enabled: true },
        { id: 'package', name: '包管理工具', pattern: '\\b(apt|yum|dnf|apk|pip|npm|pnpm|yarn|gradle|maven)\\b', color: '#f368e0', enabled: true },
        { id: 'commands', name: '常用系统命令', pattern: '\\b(systemctl|journalctl|docker|kubectl|git|service|tar|grep|awk|sed|find)\\b', color: '#48dbfb', enabled: true },

        // Level 4: Development & Code
        { id: 'sql', name: 'SQL 关键字', pattern: '\\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|GROUP BY|ORDER BY|LIMIT)\\b', color: '#f39c12', enabled: true },
        { id: 'jsonkey', name: 'JSON 键名', pattern: '"[A-Za-z0-9_-]+"(?=\\s*:)', color: '#1e90ff', enabled: true },
        { id: 'boolean', name: '布尔值', pattern: '\\b(true|false|True|False)\\b', color: '#ff7f50', enabled: true },
        { id: 'hex', name: '十六进制数', pattern: '\\b0x[0-9a-fA-F]+\\b', color: '#ffeaa7', enabled: true },
        { id: 'numbers', name: '数字 (孤立)', pattern: '\\b\\d+(?:\\.\\d+)?\\b', color: '#55efc4', enabled: true },
        { id: 'env_var', name: '环境变量', pattern: '\\$[A-Z_][A-Z0-9_]*|\\$\\{[A-Z_][A-Z0-9_]*\\}', color: '#00cec9', enabled: true },
        { id: 'semver', name: '版本号 (SemVer)', pattern: '\\bv?\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?\\b', color: '#ff9ff3', enabled: true },

        // Level 5: System & Files
        { id: 'path', name: '绝对路径', pattern: '(/(?:[A-Za-z0-9._-]+/?)+)', color: '#3498db', enabled: true },
        { id: 'size', name: '存储容量', pattern: '\\b\\d+(?:\\.\\d+)?\\s*(B|KB|MB|GB|TB|PB)\\b', color: '#81ecec', enabled: true },
        { id: 'date', name: '日期', pattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b', color: '#a29bfe', enabled: true },
        { id: 'time', name: '时间', pattern: '\\b\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?\\b', color: '#6c5ce7', enabled: true },
        { id: 'pid', name: '进程 PID', pattern: '\\b(?:pid|PID)\\s*[:=]?\\s*\\d+\\b', color: '#e056fd', enabled: true },
        { id: 'bracket_tag', name: '中括号标签', pattern: '\\[[A-Za-z0-9_-]+\\]', color: '#00b894', enabled: true },
        { id: 'email', name: '邮箱地址', pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b', color: '#ff9ff3', enabled: true },
        { id: 'uuid', name: 'UUID/GUID', pattern: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b', color: '#c8d6e5', enabled: true },
        { id: 'hash', name: 'MD5/SHA 哈希', pattern: '\\b[a-fA-F0-9]{32}\\b|\\b[a-fA-F0-9]{40}\\b|\\b[a-fA-F0-9]{64}\\b', color: '#576574', enabled: true },

        // Level 6: Exceptions & Security
        { id: 'java_exc', name: 'Java 异常', pattern: '\\b[a-z]+(?:\\.[a-z]+)*\\.[A-Z][a-zA-Z]*Exception\\b', color: '#e84393', enabled: true },
        { id: 'python_exc', name: 'Python 追踪', pattern: '\\bTraceback \\(most recent call last\\):|File "[^"]+", line \\d+\\b', color: '#d63031', enabled: true },
        { id: 'root', name: 'Root 提示符', pattern: '(^|\\s)(root@[\\w.-]+|#)\\s*$', color: '#eb4d4b', enabled: true },
        { id: 'permission', name: '权限异常', pattern: '\\b(permission denied|not permitted|unauthorized|forbidden)\\b', color: '#ff3f34', enabled: true },
        { id: 'network', name: '网络异常', pattern: '\\b(connection reset|no route|unreachable|network is down|broken pipe)\\b', color: '#ff5e57', enabled: true },
        { id: 'secrets', name: '敏感词汇', pattern: '\\b(password|secret|token|apikey|private_key)\\b', color: '#d63031', enabled: true }
    ];
}

function compileHighlightRegex() {
    activeHighlightRules = highlightRules.filter(rule => rule.enabled && rule.pattern);
    if (activeHighlightRules.length === 0) {
        cachedHighlightRegex = null;
        return;
    }

    try {
        const ansiRegex = '\\x1b\\[[0-9;?]*[a-zA-Z]|\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)';
        const combinedPattern = `(?<ansi>${ansiRegex})|` + activeHighlightRules.map((r, i) => {
            let pattern = r.pattern;
            // 智能边界保护：若是纯字母/数字/下划线单词，自动增加 \b 边界限制以防误伤
            if (/^[a-zA-Z0-9_-]+$/.test(pattern)) {
                pattern = `\\b${pattern}\\b`;
            }
            return `(?<rule${i}>${pattern})`;
        }).join('|');
        cachedHighlightRegex = new RegExp(combinedPattern, 'gi');
    } catch (error) {
        console.error('合并高亮正则失败，可能存在语法错误的规则：', error);
        cachedHighlightRegex = null;
    }
}

function loadHighlightRules() {
    try {
        const raw = localStorage.getItem('ldysshHighlightRules') || localStorage.getItem('prismsshHighlightRules');
        const parsed = raw ? JSON.parse(raw) : null;
        // Require 46 rules to force upgrade to new extensive version
        highlightRules = Array.isArray(parsed) && parsed.length >= 46 ? parsed : getDefaultHighlightRules();
    } catch (error) {
        console.error('加载高亮规则失败：', error);
        highlightRules = getDefaultHighlightRules();
    }
    compileHighlightRegex();
}

function saveHighlightRules() {
    localStorage.setItem('ldysshHighlightRules', JSON.stringify(highlightRules));
    localStorage.setItem('prismsshHighlightRules', JSON.stringify(highlightRules));
    compileHighlightRegex();
}

function resetHighlightRules() {
    localStorage.removeItem('ldysshHighlightRules');
    localStorage.removeItem('prismsshHighlightRules');
    highlightRules = getDefaultHighlightRules();
    compileHighlightRegex();
    renderHighlightRules();
}

function escapeRegExpReplacement(text) {
    return String(text).replace(/\$/g, '$$$$');
}

function normalizeHighlightColor(color) {
    return ansiColorToCss(color);
}

function getHighlightAnsiStart(color, useBg) {
    const value = String(color || '').trim();
    const match = value.match(/^#([0-9a-fA-F]{6})$/);
    if (!match) {
        return `\x1b[1;${value || '96'}m`;
    }

    const hex = match[1];
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    
    if (useBg) {
        // 计算同色系、暗色调的背景色（透明底色质感，降噪）
        const bgR = Math.round(red * 0.22);
        const bgG = Math.round(green * 0.22);
        const bgB = Math.round(blue * 0.22);
        // 38;2 是前景色，48;2 是背景色，1 是加粗
        return `\x1b[1;38;2;${red};${green};${blue};48;2;${bgR};${bgG};${bgB}m`;
    } else {
        // 只使用高对比度前景色，不带背景底色，避免背景块泛滥导致“不真实”
        return `\x1b[1;38;2;${red};${green};${blue}m`;
    }
}

function applyTerminalHighlights(output) {
    if (!output || !cachedHighlightRegex || activeHighlightRules.length === 0) return output;

    cachedHighlightRegex.lastIndex = 0;
    
    return String(output).replace(cachedHighlightRegex, (match, ...args) => {
        const groups = args[args.length - 1];
        
        if (groups.ansi) return match;

        for (let i = 0; i < activeHighlightRules.length; i++) {
            if (groups[`rule${i}`] !== undefined) {
                const rule = activeHighlightRules[i];
                // 只有高危警告、错误、异常、敏感词、根提示符等核心严重性词汇才获得微光背景高亮
                const useBg = ['error', 'warning', 'permission', 'network', 'python_exc', 'java_exc', 'secrets', 'root'].includes(rule.id);
                const start = getHighlightAnsiStart(rule.color, useBg);
                return `${start}${match}\x1b[0m`;
            }
        }
        return match;
    });
}

function renderHighlightRules() {
    const container = document.getElementById('highlightRulesList');
    if (!container) return;

    if (!Array.isArray(highlightRules) || highlightRules.length === 0) {
        loadHighlightRules();
    }

    container.innerHTML = '';
    highlightRules.forEach(rule => {
        const item = document.createElement('div');
        item.className = 'highlight-rule-item';
        item.innerHTML = `
            <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleHighlightRule('${escapeJs(rule.id)}', this.checked)">
            <div class="highlight-rule-fields">
                <input class="highlight-rule-name-input" value="${escapeHtml(rule.name)}" oninput="updateHighlightRule('${escapeJs(rule.id)}', 'name', this.value)" title="规则名称">
                <input class="highlight-rule-pattern-input" value="${escapeHtml(rule.pattern)}" oninput="updateHighlightRule('${escapeJs(rule.id)}', 'pattern', this.value)" title="${escapeHtml(rule.pattern)}">
            </div>
            <div class="highlight-rule-color">
                <input class="highlight-rule-color-input" type="color" value="${normalizeHighlightColor(rule.color)}" oninput="updateHighlightRule('${escapeJs(rule.id)}', 'color', this.value)" title="高亮颜色">
                <span class="highlight-rule-preview" style="color: ${normalizeHighlightColor(rule.color)}">Highlight</span>
            </div>
        `;
        container.appendChild(item);
    });
}

function toggleHighlightRule(ruleId, enabled) {
    const rule = highlightRules.find(item => item.id === ruleId);
    if (!rule) return;
    rule.enabled = enabled;
    saveHighlightRules();
    renderHighlightRules();
}

function updateHighlightRule(ruleId, field, value) {
    const rule = highlightRules.find(item => item.id === ruleId);
    if (!rule || !['name', 'pattern', 'color'].includes(field)) return;
    rule[field] = value;
    saveHighlightRules();
    if (field === 'color') {
        renderHighlightRules();
    }
}

function ansiColorToCss(code) {
    const colors = {
        '91': '#ff5c7a',
        '92': '#5dff9a',
        '93': '#ffd35d',
        '94': '#67a7ff',
        '95': '#d18cff',
        '96': '#4de7ff'
    };
    const value = String(code || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    return colors[value] || '#ffffff';
}

// Tool panel functions
function openTool(toolName) {
    // Check if we have an active session (AI tool is exempt from this check)
    if (toolName !== 'ai') {
        if (!currentSessionId || !sessions[currentSessionId]) {
            closeToolPanel();
            alert('请先连接服务器');
            return;
        }
    }

    // Close current tool if clicking the same icon
    if (currentTool === toolName) {
        closeToolPanel();
        return;
    }

    if (currentTool === 'ai' && toolName !== 'ai') {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.hide_chatgpt_subwindow();
        }
    }

    if (currentTool === 'monitor') {
        clearSystemMonitorRefresh();
    }

    // Reset tool activity buttons
    document.querySelectorAll('#sftpIcon, #portForwardIcon, #monitorIcon, #highlightIcon, #activityCommands, #aiIcon').forEach(icon => {
        icon.classList.remove('active', 'tool-active');
    });

    // Hide all tool panels
    document.querySelectorAll('.tool-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Open the selected tool
    currentTool = toolName;
    const toolActivity = document.getElementById(toolName + 'Icon');
    if (toolActivity) {
        toolActivity.classList.add('active', 'tool-active');
    }
    const toolPanel = document.getElementById(toolName + 'Panel');
    const rightSidebar = document.getElementById('rightSidebar');
    if (!toolPanel || !rightSidebar) {
        console.error('工具面板不存在：', toolName);
        return;
    }
    // 动态应用该工具独享的侧边栏宽度，防止不同功能间宽度相互污染
    const targetWidth = sidebarWidths[toolName] || '380px';
    rightSidebar.style.setProperty('--sidebar-width', targetWidth);

    toolPanel.classList.add('active');
    rightSidebar.classList.add('open');

    // Initialize tool based on type
    if (toolName === 'commands') {
        document.getElementById('commandsPanel').classList.add('active');
        document.getElementById('activityCommands').classList.add('active', 'tool-active');
        renderCommandLibrary();
    } else if (toolName === 'sftp') {
        initializeSFTP();
    } else if (toolName === 'monitor') {
        initializeSystemMonitor();
    } else if (toolName === 'portForward') {
        initializePortForwarding();
    } else if (toolName === 'highlight') {
        renderHighlightRules();
    } else if (toolName === 'ai') {
        document.getElementById('aiPanel').classList.add('active');
        document.getElementById('aiIcon').classList.add('active', 'tool-active');
        
        // 智能提取屏幕上下文并传给 C++！
        try {
            const getTerminalContext = (linesCount = 40) => {
                const session = sessions[currentSessionId];
                if (!session || !session.terminal) return "";
                const term = session.terminal;
                const buffer = term.buffer.active;
                let lines = [];
                const end = buffer.length - 1;
                const start = Math.max(0, end - linesCount + 1);
                for (let i = start; i <= end; i++) {
                    const line = buffer.getLine(i);
                    if (line) {
                        lines.push(line.translateToString(true));
                    }
                }
                return lines.join('\n');
            };
            const context = getTerminalContext(40);
            if (context && window.pywebview && window.pywebview.api && window.pywebview.api.send_ai_context) {
                window.pywebview.api.send_ai_context(context);
            }
        } catch(e) {
            console.error("Failed to send terminal AI context", e);
        }

        startSyncAiSubWindow();
    }

    // Resize terminal after sidebar opens
    setTimeout(() => {
        if (sessions[currentSessionId]?.calculateSize) {
            sessions[currentSessionId].calculateSize();
        }
    }, 350); // After animation completes
}

function closeToolPanel() {
    if (currentTool === 'ai') {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.hide_chatgpt_subwindow();
        }
    }

    clearSystemMonitorRefresh();
    currentTool = null;
    document.getElementById('rightSidebar')?.classList.remove('open');
    document.querySelectorAll('#sftpIcon, #portForwardIcon, #monitorIcon, #highlightIcon, #activityCommands, #aiIcon').forEach(icon => {
        icon.classList.remove('active', 'tool-active');
    });
    document.querySelectorAll('.tool-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Resize terminal after sidebar closes
    setTimeout(() => {
        if (sessions[currentSessionId]?.calculateSize) {
            sessions[currentSessionId].calculateSize();
        }
    }, 350);
}

// SFTP Functions
async function initializeSFTP() {
    const username = sessions[currentSessionId].username;
    currentPath = username === 'root' ? '/root' : '/home/' + username;
    document.getElementById('currentPath').value = currentPath;
    await listFiles(currentPath);

    // 初始化本地文件浏览器
    localCurrentPath = 'C:\\';
    document.getElementById('localCurrentPath').value = localCurrentPath;
    await listLocalFiles(localCurrentPath);
    setupSftpDragAndDrop();
}

function navigateToPath(path) {
    if (!path || isLoadingFiles) return;
    currentPath = path;
    document.getElementById('currentPath').value = currentPath;
    listFiles(currentPath);
}

async function listFiles(path) {
    // Prevent multiple simultaneous requests
    if (isLoadingFiles) {
        // console.log('Already loading files, please wait...');
        return;
    }

    isLoadingFiles = true;
    const fileList = document.getElementById('fileList');
    const loadingIndicator = document.getElementById('fileBrowserLoading');

    // Show loading state
    fileList.classList.add('loading');
    loadingIndicator.classList.add('active');

    try {
        const result = JSON.parse(
            await window.pywebview.api.list_directory(currentSessionId, path)
        );

        if (!result.success) {
            console.error('Failed to list directory:', result.error);
            fileList.innerHTML = '<div class="empty-message">文件加载失败</div>';
            return;
        }

        fileList.innerHTML = '';

        // Add parent directory if not at root
        if (path !== '/') {
            const parentItem = document.createElement('div');
            parentItem.className = 'file-item';
            parentItem.innerHTML = `
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="file-name">..</span>
                <span class="file-size">-</span>
                <span class="file-date">-</span>
            `;
            parentItem.ondblclick = () => {
                if (!isLoadingFiles) navigateUp();
            };
            parentItem.onclick = () => selectFile(parentItem);
            fileList.appendChild(parentItem);
        }

        // Add files and directories
        result.files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.setAttribute('data-filename', file.name);
            item.setAttribute('data-filetype', file.type);
            item.innerHTML = `
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${file.type === 'directory' ?
                        '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' :
                        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
                    }
                </svg>
                <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                <span class="file-size">${escapeHtml(file.size)}</span>
                <span class="file-date">${escapeHtml(file.date)}</span>
            `;

            if (file.type === 'directory') {
                item.ondblclick = () => {
                    if (!isLoadingFiles) navigateToFolder(file.name);
                };
            } else {
                item.ondblclick = () => {
                    if (!isLoadingFiles) {
                        const isTextFile = /\.(txt|py|js|html|css|json|md|conf|sh|ini|log|yml|yaml|xml|c|cpp|h|hpp|java|go|rs|php|sql|bat|ps1|csv)$/i.test(file.name);
                        // Prevent OOM crash on huge files. Fallback to download if > 1MB
                        if (isTextFile && file.raw_size < 1 * 1024 * 1024) {
                            editFile(file.name);
                        } else {
                            if (isTextFile) {
                                alert(`文件过大 (${(file.raw_size / 1024 / 1024).toFixed(2)} MB)，内置编辑器最多支持 1MB 的文本文件。为防止内存溢出或卡顿，将自动切换为本地下载。`);
                            }
                            downloadFile(file.name);
                        }
                    }
                };
            }

            item.onclick = () => selectFile(item);

            // Add right-click context menu
            item.oncontextmenu = (e) => {
                e.preventDefault();
                showContextMenu(e, item);
            };

            fileList.appendChild(item);
        });

        // Scroll to top after loading
        fileList.scrollTop = 0;

    } catch (error) {
        console.error('Error listing files:', error);
        fileList.innerHTML = '<div class="empty-message">文件加载失败</div>';
    } finally {
        // Hide loading state
        isLoadingFiles = false;
        fileList.classList.remove('loading');
        loadingIndicator.classList.remove('active');
    }
}

function selectFile(element) {
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
}

function navigateUp() {
    if (isLoadingFiles) return;

    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    currentPath = '/' + parts.join('/');
    if (currentPath === '/') currentPath = '/';
    document.getElementById('currentPath').value = currentPath;
    listFiles(currentPath);
}

function navigateToFolder(folderName) {
    if (isLoadingFiles) return;

    currentPath = currentPath.endsWith('/') ?
        currentPath + folderName :
        currentPath + '/' + folderName;
    document.getElementById('currentPath').value = currentPath;
    listFiles(currentPath);
}

function refreshFiles() {
    if (isLoadingFiles) return;
    listFiles(currentPath);
}

function createNewFolder() {
    const folderName = prompt('Enter folder name:');
    if (folderName) {
        const fullPath = currentPath.endsWith('/') ?
            currentPath + folderName :
            currentPath + '/' + folderName;

        window.pywebview.api.create_directory(currentSessionId, fullPath).then(result => {
            const res = JSON.parse(result);
            if (res.success) {
                refreshFiles();
            } else {
                alert('Failed to create folder');
            }
        });
    }
}

function selectFiles() {
    document.getElementById('fileInput').click();
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        await uploadFiles(Array.from(files));
        // Clear the input so the same file can be selected again
        event.target.value = '';
    }
}

// Format bytes to human readable string
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Generate unique upload ID
function generateUploadId() {
    return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Add File objects to upload queue (from Browse button)
async function uploadFiles(files) {
    if (!currentSessionId || !sessions[currentSessionId]) {
        alert('请先连接服务器');
        return;
    }

    // Read files as base64 and add to queue
    for (const file of files) {
        const remotePath = currentPath.endsWith('/') ?
            currentPath + file.name :
            currentPath + '/' + file.name;
        const fileContent = await readFileAsBase64(file);
        uploadQueue.push({ fileContent, remotePath, fileName: file.name, isBase64: true });
    }

    // console.log(`Added ${files.length} files to queue. Queue size: ${uploadQueue.length}`);

    if (!isProcessingUploads) {
        processUploadQueue();
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove the data:*;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Upload queue system
let uploadQueue = [];
let isProcessingUploads = false;

// Add files to upload queue
function uploadFilesFromPaths(filePaths) {
    if (!currentSessionId || !sessions[currentSessionId]) {
        alert('请先连接服务器');
        return;
    }

    // Add to queue
    for (const localPath of filePaths) {
        const fileName = localPath.split(/[/\\]/).pop();
        const remotePath = currentPath.endsWith('/') ?
            currentPath + fileName :
            currentPath + '/' + fileName;
        uploadQueue.push({ localPath, remotePath, fileName });
    }

    // console.log(`Added ${filePaths.length} files to queue. Queue size: ${uploadQueue.length}`);

    // Start processing if not already
    if (!isProcessingUploads) {
        processUploadQueue();
    }
}


// Process upload queue
let currentUploadId = null;
async function processUploadQueue() {
    if (isProcessingUploads || uploadQueue.length === 0) return;

    // 浅拷贝保存一份作为渲染任务队列明细的依据
    const activeTransfers = uploadQueue.map((item, index) => ({
        id: index,
        fileName: item.fileName,
        remotePath: item.remotePath,
        status: 'queued', // 'queued' | 'uploading' | 'completed' | 'failed'
        percentage: 0,
        uploadedBytes: 0,
        totalBytes: 0,
        speed: '',
        errorMsg: ''
    }));

    isProcessingUploads = true;
    try {
        // 动态获取或创建进度卡片
        let progressDiv = document.getElementById('uploadProgress');
        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'uploadProgress';
            progressDiv.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: linear-gradient(135deg, rgba(10, 10, 25, 0.92) 0%, rgba(20, 15, 35, 0.92) 100%);
                border: 1px solid rgba(0, 242, 254, 0.35);
                border-radius: 12px;
                padding: 18px;
                min-width: 340px;
                max-width: 440px;
                z-index: 10002;
                box-shadow: 0 12px 40px rgba(0, 242, 254, 0.25), inset 0 0 15px rgba(0, 242, 254, 0.08);
                backdrop-filter: blur(16px);
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            `;
            progressDiv.innerHTML = `
                <style>
                    @keyframes uploadShimmer {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    @keyframes uploadPulse {
                        0% { opacity: 0.5; transform: scale(0.92); }
                        100% { opacity: 1; transform: scale(1.08); }
                    }
                    .upload-progress-fill-shimmer {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                        animation: uploadShimmer 2s infinite;
                    }
                    .upload-pulse-dot {
                        width: 8px;
                        height: 8px;
                        background-color: #00f2fe;
                        border-radius: 50%;
                        box-shadow: 0 0 8px #00f2fe;
                        animation: uploadPulse 1s ease-in-out infinite alternate;
                    }
                    .transfer-queue-container {
                        max-height: 180px;
                        overflow-y: auto;
                        margin-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.08);
                        padding-top: 8px;
                        font-size: 12px;
                    }
                    .transfer-queue-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 6px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.03);
                        gap: 12px;
                    }
                    .transfer-item-name {
                        max-width: 160px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        color: rgba(255,255,255,0.85);
                    }
                    .transfer-item-status {
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                    }
                    .transfer-item-progress-bar-bg {
                        width: 80px;
                        height: 4px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 2px;
                        overflow: hidden;
                    }
                    .transfer-item-progress-bar-fill {
                        height: 100%;
                        background: #00f2fe;
                        border-radius: 2px;
                        width: 0%;
                        transition: width 0.1s linear;
                    }
                    .transfer-queue-toggle-btn {
                        background: transparent;
                        border: none;
                        color: #00f2fe;
                        font-size: 11px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 0;
                        margin-top: 8px;
                    }
                </style>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" id="uploadHeaderGroup">
                        <div class="upload-pulse-dot"></div>
                        <div style="font-weight: 600; font-size: 14px; color: #00f2fe; letter-spacing: 0.5px;" id="uploadStatusText">正在上传...</div>
                    </div>
                    <button id="cancelUploadBtn" style="
                        background: transparent;
                        border: none;
                        color: rgba(255,255,255,0.5);
                        font-size: 16px;
                        cursor: pointer;
                        padding: 0 4px;
                        line-height: 1;
                        transition: color 0.2s;
                    " onmouseover="this.style.color='#ff4d4f'" onmouseout="this.style.color='rgba(255,255,255,0.5)'">✕</button>
                </div>
                <div style="margin-bottom: 8px;">
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; position: relative;">
                        <div id="uploadBar" style="
                            width: 0%;
                            height: 100%;
                            background: linear-gradient(90deg, #00f2fe 0%, #a18cd1 100%);
                            border-radius: 3px;
                            box-shadow: 0 0 10px rgba(0, 242, 254, 0.7);
                            transition: width 0.1s linear;
                            position: relative;
                        ">
                            <div class="upload-progress-fill-shimmer"></div>
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,0.6);">
                    <span id="uploadBytes">0 B / 0 B</span>
                    <span id="uploadSpeed">0 KB/s</span>
                </div>
                
                <button class="transfer-queue-toggle-btn" id="transferQueueToggleBtn" type="button">
                    <span>展开任务明细</span> <span id="transferQueueToggleIcon">▼</span>
                </button>
                <div class="transfer-queue-container" id="transferQueueContainer" style="display: none;">
                    <!-- 传输任务明细项会在这里渲染 -->
                </div>
            `;
            document.body.appendChild(progressDiv);
            
            // 绑定取消按钮事件
            const cancelBtn = progressDiv.querySelector('#cancelUploadBtn');
            cancelBtn.addEventListener('click', async () => {
                if (confirm('确定要取消上传当前任务吗？')) {
                    if (currentUploadId) {
                        await window.pywebview.api.cancel_upload(currentUploadId);
                    }
                    uploadQueue = [];
                    isProcessingUploads = false;
                    progressDiv.style.display = 'none';
                }
            });
        } else {
            progressDiv.style.opacity = '1';
            progressDiv.style.display = 'block';
        }

        const toggleBtn = progressDiv.querySelector('#transferQueueToggleBtn');
        const toggleIcon = progressDiv.querySelector('#transferQueueToggleIcon');
        const toggleText = toggleBtn.querySelector('span');
        const queueContainer = progressDiv.querySelector('#transferQueueContainer');
        const headerGroup = progressDiv.querySelector('#uploadHeaderGroup');

        // 解除旧监听并重新绑定
        const newToggleQueue = () => {
            if (queueContainer.style.display === 'none') {
                queueContainer.style.display = 'block';
                toggleText.textContent = '收折任务明细';
                toggleIcon.textContent = '▲';
            } else {
                queueContainer.style.display = 'none';
                toggleText.textContent = '展开任务明细';
                toggleIcon.textContent = '▼';
            }
        };
        toggleBtn.replaceWith(toggleBtn.cloneNode(true));
        headerGroup.replaceWith(headerGroup.cloneNode(true));
        
        const freshToggleBtn = progressDiv.querySelector('#transferQueueToggleBtn');
        const freshHeaderGroup = progressDiv.querySelector('#uploadHeaderGroup');
        freshToggleBtn.addEventListener('click', newToggleQueue);
        freshHeaderGroup.addEventListener('click', newToggleQueue);

        const renderTransferQueueList = () => {
            queueContainer.innerHTML = '';
            activeTransfers.forEach(t => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'transfer-queue-item';

                let statusLabel = '';
                let progressHtml = '';
                if (t.status === 'queued') {
                    statusLabel = `<span style="color: rgba(255,255,255,0.4)">等待中</span>`;
                    progressHtml = `<div class="transfer-item-progress-bar-bg"><div class="transfer-item-progress-bar-fill"></div></div>`;
                } else if (t.status === 'uploading') {
                    const speedLabel = t.speed ? ` (${t.speed})` : '';
                    statusLabel = `<span style="color: #00f2fe">${t.percentage}%${speedLabel}</span>`;
                    progressHtml = `<div class="transfer-item-progress-bar-bg"><div class="transfer-item-progress-bar-fill" style="width: ${t.percentage}%"></div></div>`;
                } else if (t.status === 'completed') {
                    statusLabel = `<span style="color: #52c41a">✓ 已完成</span>`;
                    progressHtml = `<div class="transfer-item-progress-bar-bg"><div class="transfer-item-progress-bar-fill" style="width: 100%; background: #52c41a"></div></div>`;
                } else if (t.status === 'failed') {
                    statusLabel = `<span style="color: #ff4d4f" title="${t.errorMsg || '传输失败'}">✗ 失败</span>`;
                    progressHtml = `<div class="transfer-item-progress-bar-bg"><div class="transfer-item-progress-bar-fill" style="width: 0%; background: #ff4d4f"></div></div>`;
                }

                itemDiv.innerHTML = `
                    <span class="transfer-item-name" title="${t.fileName}">${t.fileName}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${progressHtml}
                        <span class="transfer-item-status">${statusLabel}</span>
                    </div>
                `;
                queueContainer.appendChild(itemDiv);
            });
        };

        const statusText = document.getElementById('uploadStatusText');
        const uploadBar = document.getElementById('uploadBar');
        const uploadBytes = document.getElementById('uploadBytes');
        const uploadSpeed = document.getElementById('uploadSpeed');
        const dot = progressDiv.querySelector('.upload-pulse-dot');
        
        // 初始化样式
        statusText.style.color = '#00f2fe';
        uploadBar.style.background = 'linear-gradient(90deg, #00f2fe 0%, #a18cd1 100%)';
        uploadBar.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.7)';
        if (dot) {
            dot.style.backgroundColor = '#00f2fe';
            dot.style.boxShadow = '0 0 8px #00f2fe';
            dot.style.animation = 'uploadPulse 1s ease-in-out infinite alternate';
        }

        renderTransferQueueList();

        let uploadedCount = 0;
        let failedCount = 0;
        let activeIndex = 0;

        while (uploadQueue.length > 0) {
            const item = uploadQueue.shift();
            const { remotePath, fileName } = item;
            const queueRemaining = uploadQueue.length;

            statusText.textContent = queueRemaining > 0
                ? `Uploading ${fileName} (${queueRemaining} queued)...`
                : `Uploading ${fileName}...`;

            // 更新当前活跃任务状态
            const currentTransfer = activeTransfers[activeIndex];
            if (currentTransfer) {
                currentTransfer.status = 'uploading';
                renderTransferQueueList();
            }

            const uploadId = generateUploadId();
            currentUploadId = uploadId;

            try {
                let startResult;
                if (item.isBase64) {
                    // Browse button upload (base64 content)
                    startResult = await window.pywebview.api.start_upload_with_progress(
                        currentSessionId,
                        item.fileContent,
                        remotePath,
                        uploadId
                    );
                } else {
                    // Drag-drop upload (local path)
                    startResult = await window.pywebview.api.upload_from_path_with_progress(
                        currentSessionId,
                        item.localPath,
                        remotePath,
                        uploadId
                    );
                }

                if (!startResult || !JSON.parse(startResult).success) {
                    throw new Error(startResult ? JSON.parse(startResult).error : 'Failed to start upload');
                }

                // Poll progress
                let completed = false;
                let lastBytes = 0;
                let lastTime = Date.now();

                while (!completed) {
                    await new Promise(r => setTimeout(r, 200));
                    const progressResult = await window.pywebview.api.get_upload_progress(currentSessionId, uploadId);
                    if (!progressResult) continue;

                    const progress = JSON.parse(progressResult);
                    if (progress.status === 'uploading' || progress.status === 'starting') {
                        uploadBar.style.width = `${progress.percentage}%`;
                        uploadBytes.textContent = `${formatBytes(progress.uploaded)} / ${formatBytes(progress.total)}`;

                        const now = Date.now();
                        const timeDiff = (now - lastTime) / 1000;
                        let speedText = '';
                        if (timeDiff >= 0.5) {
                            const bytesDiff = progress.uploaded - lastBytes;
                            const speed = bytesDiff / timeDiff;
                            speedText = speed > 0 ? `${formatBytes(speed)}/s` : '';
                            uploadSpeed.textContent = speedText;
                            lastBytes = progress.uploaded;
                            lastTime = now;
                        }

                        // 更新任务明细
                        if (currentTransfer) {
                            currentTransfer.percentage = progress.percentage;
                            if (speedText) currentTransfer.speed = speedText;
                            renderTransferQueueList();
                        }

                        const queueNow = uploadQueue.length;
                        statusText.textContent = queueNow > 0
                            ? `Uploading ${fileName} (${queueNow} queued)...`
                            : `Uploading ${fileName}...`;

                    } else if (progress.status === 'completed') {
                        uploadBar.style.width = '100%';
                        uploadBytes.textContent = `${formatBytes(progress.total)} / ${formatBytes(progress.total)}`;
                        uploadSpeed.textContent = '';
                        uploadedCount++;
                        completed = true;

                        if (currentTransfer) {
                            currentTransfer.status = 'completed';
                            currentTransfer.percentage = 100;
                            renderTransferQueueList();
                        }
                    } else if (progress.status === 'error' || progress.status === 'cancelled') {
                        completed = true;
                        failedCount++;
                        console.error('Upload failed:', fileName, progress.error || progress.status);

                        if (currentTransfer) {
                            currentTransfer.status = 'failed';
                            currentTransfer.errorMsg = progress.error || '上传被取消';
                            renderTransferQueueList();
                        }
                    } else if (progress.status === 'unknown') {
                        completed = true;
                        uploadedCount++;

                        if (currentTransfer) {
                            currentTransfer.status = 'completed';
                            currentTransfer.percentage = 100;
                            renderTransferQueueList();
                        }
                    }
                }

                await window.pywebview.api.clear_upload_progress(currentSessionId, uploadId);
                uploadBar.style.width = '0%';

            } catch (error) {
                console.error('Upload error for', fileName, error);
                failedCount++;
            }
        }

        if (failedCount === 0) {
            statusText.textContent = `上传完成 (${uploadedCount} 个文件)`;
            statusText.style.color = '#52c41a';
            uploadBar.style.background = 'linear-gradient(90deg, #52c41a 0%, #b7eb8f 100%)';
            uploadBar.style.boxShadow = '0 0 10px rgba(82, 196, 26, 0.7)';
            if (dot) {
                dot.style.backgroundColor = '#52c41a';
                dot.style.boxShadow = '0 0 8px #52c41a';
                dot.style.animation = 'none';
            }
            setTimeout(() => {
                if (!isProcessingUploads) {
                    progressDiv.style.opacity = '0';
                    setTimeout(() => {
                        if (!isProcessingUploads && progressDiv.style.opacity === '0') {
                            progressDiv.style.display = 'none';
                            progressDiv.style.opacity = '1';
                            // 还原成初始样式
                            statusText.style.color = '#00f2fe';
                            uploadBar.style.background = 'linear-gradient(90deg, #00f2fe 0%, #a18cd1 100%)';
                            uploadBar.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.7)';
                            if (dot) {
                                dot.style.backgroundColor = '#00f2fe';
                                dot.style.boxShadow = '0 0 8px #00f2fe';
                                dot.style.animation = 'uploadPulse 1s ease-in-out infinite alternate';
                            }
                        }
                    }, 300);
                }
            }, 1500);
        } else {
            statusText.textContent = `上传结束 (成功 ${uploadedCount}, 失败 ${failedCount})`;
            statusText.style.color = '#ff4d4f';
            uploadBar.style.background = 'linear-gradient(90deg, #ff4d4f 0%, #ffccc7 100%)';
            uploadBar.style.boxShadow = '0 0 10px rgba(255, 77, 79, 0.7)';
            if (dot) {
                dot.style.backgroundColor = '#ff4d4f';
                dot.style.boxShadow = '0 0 8px #ff4d4f';
                dot.style.animation = 'none';
            }
            setTimeout(() => {
                if (!isProcessingUploads) {
                    progressDiv.style.display = 'none';
                    // 还原样式
                    statusText.style.color = '#00f2fe';
                    uploadBar.style.background = 'linear-gradient(90deg, #00f2fe 0%, #a18cd1 100%)';
                    uploadBar.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.7)';
                    if (dot) {
                        dot.style.backgroundColor = '#00f2fe';
                        dot.style.boxShadow = '0 0 8px #00f2fe';
                        dot.style.animation = 'uploadPulse 1s ease-in-out infinite alternate';
                    }
                }
            }, 3000);
        }

        await listFiles(currentPath);
    } catch (criticalErr) {
        console.error("Critical error in processUploadQueue:", criticalErr);
    } finally {
        isProcessingUploads = false;
        currentUploadId = null;
    }
}

// Handle native file drop from pywebview (receives full file paths)
async function handleNativeFileDrop(filePaths) {
    // console.log('Native file drop received:', filePaths);
    if (filePaths && filePaths.length > 0) {
        await uploadFilesFromPaths(filePaths);
    }
}

// Drag and drop support
const setupDragDrop = () => {
    const uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) {
        console.warn('uploadArea element not found, skipping uploadArea listeners.');
    } else {
        uploadArea.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('dragover');

            const dt = e.dataTransfer;
            const files = dt?.files;
            const htmlData = dt?.getData('text/html') || '';

            if (files && files.length > 0) {
                await uploadFiles(Array.from(files));
                return;
            }

            if (htmlData.includes('file://')) {
                const matches = htmlData.match(/file:\/\/[^"'<>\s\]]+/g);
                if (matches && matches.length > 0) {
                    const paths = [...new Set(matches)].map(uri => decodeURIComponent(uri.replace('file://', '')));
                    await uploadFilesFromPaths(paths);
                    return;
                }
            }
        });
    }

    const terminalEl = document.getElementById('terminal');
    if (terminalEl) {
        terminalEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        terminalEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                if (currentSessionId && sessions[currentSessionId]) {
                    const file = e.dataTransfer.files[0];
                    sessions[currentSessionId].pendingDropFile = file;
                    const base64Rz = bytesToBase64(new TextEncoder().encode("rz -be\r"));
                    window.pywebview.api.send_input_base64(currentSessionId, base64Rz).catch(console.error);
                }
            }
        });
    }

    // Prevent browser from opening files when dropped anywhere on the page
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });
};

// Context Menu Functions
let contextMenuTarget = null;

function showContextMenu(event, fileItem, isLocal = false) {
    const contextMenu = document.getElementById('contextMenu');

    // Hide any existing context menu
    contextMenu.style.display = 'none';

    isContextMenuLocal = isLocal;

    // Remove previous selection from both lists to be safe
    document.querySelectorAll('#localFileList .file-item, #fileList .file-item').forEach(item => {
        item.classList.remove('context-selected');
    });

    // Select the target item
    fileItem.classList.add('context-selected');
    contextMenuTarget = fileItem;

    // Get file type to show/hide relevant menu items
    const fileType = fileItem.getAttribute('data-filetype');
    const isDirectory = fileType === 'directory';

    // Show/hide menu items based on file type
    const editMenuItem = contextMenu.querySelector('[onclick*="edit"]');
    const downloadMenuItem = contextMenu.querySelector('[onclick*="download"]');

    if (editMenuItem) {
        // 本地文件右键没有编辑选项
        editMenuItem.style.display = (isLocal || isDirectory) ? 'none' : 'flex';
    }
    if (downloadMenuItem) {
        if (isLocal) {
            downloadMenuItem.textContent = '上传 (Upload)';
            downloadMenuItem.style.display = isDirectory ? 'none' : 'flex';
        } else {
            downloadMenuItem.textContent = '下载 (Download)';
            downloadMenuItem.style.display = isDirectory ? 'none' : 'flex';
        }
    }

    // Position the context menu
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.display = 'block';

    // Hide context menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'none';

    // Remove selection highlight
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('context-selected');
    });

    contextMenuTarget = null;
}

async function contextMenuAction(action) {
    if (!contextMenuTarget) return;

    const fileName = contextMenuTarget.getAttribute('data-filename');
    const fileType = contextMenuTarget.getAttribute('data-filetype');

    if (isContextMenuLocal) {
        const sep = localCurrentPath.endsWith('\\') ? '' : '\\';
        const filePath = localCurrentPath + sep + fileName;
        
        hideContextMenu();
        
        switch (action) {
            case 'download': // 本地上传
                await uploadFileFromPath(filePath, fileName);
                break;
            case 'rename':
                showLocalRenameModal(fileName, filePath);
                break;
            case 'delete':
                if (confirm(`确定要删除本地 ${fileType === 'directory' ? '文件夹' : '文件'} ${fileName} 吗？`)) {
                    try {
                        const result = JSON.parse(await window.pywebview.api.delete_local_file(filePath));
                        if (result.success) {
                            refreshLocalFiles();
                        } else {
                            alert("删除失败: " + result.error);
                        }
                    } catch(e) {
                        alert("删除失败: " + e.message);
                    }
                }
                break;
        }
    } else {
        const filePath = currentPath.endsWith('/') ?
            currentPath + fileName :
            currentPath + '/' + fileName;

        hideContextMenu();

        switch (action) {
            case 'download':
                await downloadFile(fileName);
                break;
            case 'edit':
                await editFile(fileName);
                break;
            case 'rename':
                showRenameModal(fileName);
                break;
            case 'delete':
                await deleteFileOrFolder(fileName, fileType, filePath);
                break;
        }
    }
}

async function downloadFile(fileName) {
    const remotePath = currentPath.endsWith('/') ?
        currentPath + fileName :
        currentPath + '/' + fileName;

    try {
        // console.log('Downloading:', remotePath);

        // Get file size info
        const infoResult = await window.pywebview.api.get_file_info(currentSessionId, remotePath);
        const infoResponse = JSON.parse(infoResult);

        let fileSize = 0;
        if (infoResponse.success && infoResponse.info && infoResponse.info.size) {
            fileSize = infoResponse.info.size;
            // console.log(`File size: ${(fileSize / (1024 * 1024)).toFixed(2)}MB`);
        }

        // DEFAULT TO NATIVE FILE DIALOG - no stupid prompts
        // Always show the native OS file dialog first
        await downloadFileWithPicker(fileName, remotePath);

    } catch (error) {
        console.error('Download error:', error);
        alert('Download failed: ' + error.message);
    }
}

async function downloadFileToBrowser(fileName, remotePath) {
    try {
        // Get file size first
        const infoResult = await window.pywebview.api.get_file_info(currentSessionId, remotePath);
        const infoResponse = JSON.parse(infoResult);
        const fileSize = infoResponse.success ? infoResponse.info.size : 0;

        // For large files (>50MB), automatically use native file dialog instead of browser download
        if (fileSize > 50 * 1024 * 1024) {
            // console.log(`File is ${(fileSize/(1024*1024)).toFixed(1)}MB - using native file dialog for better performance`);
            await downloadFileWithPicker(fileName, remotePath);
            return;
        }

        // Show download progress with file size and cancel button
        const progressNotification = showDownloadProgressWithCancel(fileName, fileSize);

        // Generate unique download ID
        const downloadId = 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Start download with progress tracking
        const startResult = await window.pywebview.api.start_download_with_progress(currentSessionId, remotePath, downloadId);
        const startResponse = JSON.parse(startResult);

        if (!startResponse.success) {
            // Hide progress notification on error
            if (progressNotification.parentNode) {
                progressNotification.parentNode.removeChild(progressNotification);
            }
            alert(`Failed to start download: ${startResponse.error}`);
            return;
        }

        // Poll for progress updates
        const progressInterval = setInterval(async () => {
            try {
                const progressResult = await window.pywebview.api.get_download_progress(currentSessionId, downloadId);
                const progress = JSON.parse(progressResult);

                if (progress.status === 'downloading' && progress.total > 0) {
                    updateDownloadProgress(progress.downloaded, progress.total);
                } else if (progress.status === 'completed') {
                    clearInterval(progressInterval);

                    // Download completed - process the content asynchronously to avoid UI freeze
                    if (progress.content) {
                        // console.log('Processing download completion...');
                        updateDownloadProgress(progress.size, progress.size);

                        // Process large files asynchronously to prevent UI freeze
                        processDownloadCompletion(progress.content, fileName, progressNotification);
                    }
                } else if (progress.status === 'error') {
                    clearInterval(progressInterval);

                    // Hide progress notification on error
                    if (progressNotification.parentNode) {
                        progressNotification.parentNode.removeChild(progressNotification);
                    }

                    let errorMsg = progress.error || 'Unknown error';
                    if (errorMsg.includes('Garbage packet')) {
                        errorMsg = `Download failed due to connection issues.\n\nTry using "Choose Save Location" option instead for large files.`;
                    }

                    alert(`Download failed: ${errorMsg}`);
                } else if (progress.status === 'cancelled') {
                    clearInterval(progressInterval);

                    // Hide progress notification
                    if (progressNotification.parentNode) {
                        progressNotification.parentNode.removeChild(progressNotification);
                    }

                    // console.log('Download cancelled by user');
                }
            } catch (error) {
                console.error('Error polling download progress:', error);
                clearInterval(progressInterval);

                // Hide progress notification on error
                if (progressNotification.parentNode) {
                    progressNotification.parentNode.removeChild(progressNotification);
                }
                alert('Download failed: ' + error.message);
            }
        }, 1000); // Poll every 1000ms to reduce overhead

        // Store interval for cancellation
        progressNotification.downloadId = downloadId;
        progressNotification.progressInterval = progressInterval;

        return; // Early return since we're handling everything in the polling loop

    } catch (error) {
        console.error('Browser download error:', error);

        // Hide progress notification on error
        if (progressNotification && progressNotification.parentNode) {
            progressNotification.parentNode.removeChild(progressNotification);
        }

        alert('Browser download failed: ' + error.message);
    }
}

async function downloadFileWithPicker(fileName, remotePath) {
    try {
        // Show native save file dialog
        const dialogResult = await window.pywebview.api.show_save_file_dialog(fileName);
        const dialogResponse = JSON.parse(dialogResult);

        if (!dialogResponse.success) {
            if (dialogResponse.cancelled) {
                return; // User cancelled
            } else if (dialogResponse.fallback_needed) {
                // Fallback to simple prompt if native dialog fails
                const savePath = prompt(
                    `Native file dialog not available. Enter save path for "${fileName}":`,
                    `${fileName}`
                );

                if (!savePath) {
                    return; // User cancelled
                }

                // Use the prompted path
                dialogResponse.success = true;
                dialogResponse.path = savePath;
            } else {
                alert(`Error opening save dialog: ${dialogResponse.error || 'Unknown error'}`);
                return;
            }
        }

        const savePath = dialogResponse.path;

        // Get file size first
        const infoResult = await window.pywebview.api.get_file_info(currentSessionId, remotePath);
        const infoResponse = JSON.parse(infoResult);
        const fileSize = infoResponse.success ? infoResponse.info.size : 0;

        // Show download progress with cancel button
        const progressNotification = showDownloadProgressWithCancel(fileName, fileSize);

        // console.log(`Starting REAL progress tracked download to: ${savePath}`);

        // Generate unique download ID for REAL progress tracking
        const downloadId = 'picker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Start DIRECT download with REAL progress tracking - no content transfer through browser
        const startResult = await window.pywebview.api.start_direct_download_with_progress(currentSessionId, remotePath, savePath, downloadId);
        const startResponse = JSON.parse(startResult);

        if (!startResponse.success) {
            // Hide progress notification on error
            if (progressNotification.parentNode) {
                progressNotification.parentNode.removeChild(progressNotification);
            }
            alert(`Failed to start download: ${startResponse.error}`);
            return;
        }

        // Poll for REAL progress updates
        const progressInterval = setInterval(async () => {
            try {
                const progressResult = await window.pywebview.api.get_download_progress(currentSessionId, downloadId);
                const progress = JSON.parse(progressResult);

                if (progress.status === 'downloading' && progress.total > 0) {
                    // This is REAL progress from the actual download
                    updateDownloadProgress(progress.downloaded, progress.total);
                } else if (progress.status === 'completed') {
                    clearInterval(progressInterval);

                    // Download completed directly to chosen path - no content transfer needed!
                    // console.log('Direct download with REAL progress completed to:', savePath);

                    // Show completion
                    updateDownloadProgress(progress.downloaded || fileSize, progress.total || fileSize);

                    // Hide progress after showing 100%
                    setTimeout(() => {
                        if (progressNotification && progressNotification.parentNode) {
                            progressNotification.parentNode.removeChild(progressNotification);
                        }
                    }, 1500);

                    showSuccessNotification(`Downloaded to ${savePath}`);
                } else if (progress.status === 'error') {
                    clearInterval(progressInterval);

                    // Hide progress notification on error
                    if (progressNotification.parentNode) {
                        progressNotification.parentNode.removeChild(progressNotification);
                    }

                    let errorMsg = progress.error || 'Unknown error';
                    if (errorMsg.includes('Garbage packet')) {
                        errorMsg = `Download failed due to connection issues.\n\nPlease try again.`;
                    }

                    alert(`Download failed: ${errorMsg}`);
                } else if (progress.status === 'cancelled') {
                    clearInterval(progressInterval);

                    // Hide progress notification
                    if (progressNotification.parentNode) {
                        progressNotification.parentNode.removeChild(progressNotification);
                    }

                    // console.log('Download cancelled by user');
                }
            } catch (error) {
                console.error('Error polling download progress:', error);
                clearInterval(progressInterval);

                // Hide progress notification on error
                if (progressNotification.parentNode) {
                    progressNotification.parentNode.removeChild(progressNotification);
                }
                alert('Download failed: ' + error.message);
            }
        }, 1000); // Poll every 1000ms for REAL progress

        // Store interval for cancellation (REAL cancellation that actually works)
        progressNotification.downloadId = downloadId;
        progressNotification.progressInterval = progressInterval;
        progressNotification.isDirectDownload = false; // This uses REAL progress tracking with REAL cancellation

    } catch (error) {
        console.error('Direct download error:', error);
        alert('Download failed: ' + error.message);
    }
}


function showDownloadProgress(fileName, fileSize = null) {
    const notification = document.createElement('div');
    notification.id = 'downloadProgress';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
        border: 2px solid #00d4ff;
        border-radius: 12px;
        padding: 20px;
        min-width: 350px;
        max-width: 450px;
        z-index: 10001;
        box-shadow: 0 8px 32px rgba(0, 212, 255, 0.3);
        backdrop-filter: blur(10px);
        color: white;
        font-family: 'Inter', sans-serif;
    `;

    const sizeInfo = fileSize ? ` (${(fileSize / (1024 * 1024)).toFixed(2)}MB)` : '';
    const truncatedName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="
                width: 20px;
                height: 20px;
                border: 3px solid rgba(0, 212, 255, 0.3);
                border-top-color: #00d4ff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            " id="spinner"></div>
            <div>
                <div style="font-weight: 600; font-size: 14px; color: #00d4ff;">Downloading</div>
                <div style="font-size: 12px; color: #e0e0e0;" title="${escapeHtml(fileName)}">${escapeHtml(truncatedName)}${sizeInfo}</div>
            </div>
        </div>

        <div style="margin-bottom: 8px;">
            <div style="
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            ">
                <div id="progressBar" style="
                    width: 0%;
                    height: 100%;
                    background: linear-gradient(90deg, #00d4ff, #0099cc);
                    border-radius: 4px;
                    transition: width 0.3s ease;
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                        animation: shimmer 2s infinite;
                    "></div>
                </div>
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #a0a0a0;">
            <span id="progressText">Initializing...</span>
            <span id="progressPercent">0%</span>
        </div>
    `;

    document.body.appendChild(notification);
    return notification;
}

function showDownloadProgressWithCancel(fileName, fileSize = null) {
    const notification = document.createElement('div');
    notification.id = 'downloadProgress';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
        border: 2px solid #00d4ff;
        border-radius: 12px;
        padding: 20px;
        min-width: 350px;
        max-width: 450px;
        z-index: 10001;
        box-shadow: 0 8px 32px rgba(0, 212, 255, 0.3);
        backdrop-filter: blur(10px);
        color: white;
        font-family: 'Inter', sans-serif;
    `;

    const sizeInfo = fileSize ? ` (${(fileSize / (1024 * 1024)).toFixed(2)}MB)` : '';
    const truncatedName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="
                    width: 20px;
                    height: 20px;
                    border: 3px solid rgba(0, 212, 255, 0.3);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                " id="spinner"></div>
                <div>
                    <div style="font-weight: 600; font-size: 14px; color: #00d4ff;">Downloading</div>
                    <div style="font-size: 12px; color: #e0e0e0;" title="${escapeHtml(fileName)}">${escapeHtml(truncatedName)}${sizeInfo}</div>
                </div>
            </div>
            <button id="cancelDownload" style="
                background: rgba(255, 68, 68, 0.2);
                border: 1px solid rgba(255, 68, 68, 0.5);
                border-radius: 4px;
                color: #ff6b6b;
                padding: 4px 8px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s ease;
            " onmouseover="this.style.background='rgba(255, 68, 68, 0.3)'" onmouseout="this.style.background='rgba(255, 68, 68, 0.2)'">Cancel</button>
        </div>

        <div style="margin-bottom: 8px;">
            <div style="
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            ">
                <div id="progressBar" style="
                    width: 0%;
                    height: 100%;
                    background: linear-gradient(90deg, #00d4ff, #0099cc);
                    border-radius: 4px;
                    transition: width 0.3s ease;
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                        animation: shimmer 2s infinite;
                    "></div>
                </div>
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #a0a0a0;">
            <span id="progressText">Initializing...</span>
            <span id="progressPercent">0%</span>
        </div>
    `;

    document.body.appendChild(notification);

    // Add cancel functionality
    const cancelButton = notification.querySelector('#cancelDownload');
    cancelButton.addEventListener('click', async () => {
        if (notification.downloadId && notification.progressInterval) {
            try {
                // Check if this is a direct download or threaded download
                if (notification.isDirectDownload) {
                    // For direct downloads, we can only stop the progress simulation
                    // console.log('Stopping direct download progress (note: actual download cannot be cancelled)');
                    clearInterval(notification.progressInterval);

                    // Remove the notification
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                } else {
                    // For threaded downloads, cancel properly
                    await window.pywebview.api.cancel_download(currentSessionId, notification.downloadId);

                    // Clear the progress polling
                    clearInterval(notification.progressInterval);

                    // Remove the notification
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }

                // console.log('Download cancelled by user');
            } catch (error) {
                console.error('Error cancelling download:', error);
            }
        }
    });

    return notification;
}

async function processDownloadCompletion(base64Content, fileName, progressNotification) {
    try {
        // console.log('Starting async file processing...');

        // Show processing status
        const progressText = document.getElementById('progressText');
        const spinner = document.getElementById('spinner');
        if (progressText) {
            progressText.textContent = 'Processing file...';
        }
        if (spinner) {
            spinner.style.display = 'block';
        }

        // Process large base64 content in chunks to avoid UI freeze
        const chunkSize = 1024 * 1024; // 1MB chunks
        const contentLength = base64Content.length;
        const chunks = [];

        // Decode base64 in chunks using requestAnimationFrame to keep UI responsive
        for (let i = 0; i < contentLength; i += chunkSize) {
            const chunk = base64Content.slice(i, i + chunkSize);
            chunks.push(chunk);

            // Yield to browser every chunk to keep UI responsive
            if (i % (chunkSize * 4) === 0) { // Every 4MB
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }

        // console.log(`Split into ${chunks.length} chunks, decoding...`);

        // Decode chunks
        const binaryChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            try {
                const binaryString = atob(chunks[i]);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) {
                    bytes[j] = binaryString.charCodeAt(j);
                }
                binaryChunks.push(bytes);

                // Update processing progress
                if (progressText) {
                    const processPercent = Math.round(((i + 1) / chunks.length) * 100);
                    progressText.textContent = `Processing file... ${processPercent}%`;
                }

                // Yield to browser every few chunks
                if (i % 5 === 0) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
            } catch (e) {
                console.error('Error decoding chunk', i, ':', e);
                throw new Error(`Failed to decode file chunk ${i}: ${e.message}`);
            }
        }

        // console.log('Creating blob...');

        // Create blob from chunks
        const blob = new Blob(binaryChunks, { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        // console.log('Triggering download...');

        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = fileName;
        downloadLink.style.display = 'none';

        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Hide progress after showing completion
        setTimeout(() => {
            if (progressNotification && progressNotification.parentNode) {
                progressNotification.parentNode.removeChild(progressNotification);
            }
        }, 1000);

        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        // console.log('Successfully downloaded to browser:', fileName);
        showSuccessNotification(`Downloaded ${fileName}`);

    } catch (error) {
        console.error('Error processing download:', error);

        // Hide progress on error
        if (progressNotification && progressNotification.parentNode) {
            progressNotification.parentNode.removeChild(progressNotification);
        }

        alert(`Failed to process download: ${error.message}`);
    }
}

function updateDownloadProgress(downloaded, total, speed = null) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const spinner = document.getElementById('spinner');

    if (!progressBar) return;

    const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);

    // Update progress bar
    progressBar.style.width = `${percentage}%`;

    // Update text
    let statusText = `${downloadedMB}MB / ${totalMB}MB`;
    if (speed) {
        const speedMB = (speed / (1024 * 1024)).toFixed(1);
        statusText += ` 鈥?${speedMB}MB/s`;
    }

    progressText.textContent = statusText;
    progressPercent.textContent = `${percentage}%`;

    // Hide spinner when we have real progress
    if (percentage > 0 && spinner) {
        spinner.style.display = 'none';
    }
}

function showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 255, 136, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
    `;
    notification.textContent = `✔ ${message}`;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Built-in Code Editor Variables
let aceEditor = null;
let currentEditingPath = null;

function initAceEditor() {
    if (aceEditor) return;
    try {
        aceEditor = ace.edit("codeEditor");
        aceEditor.setTheme("ace/theme/monokai");
        aceEditor.setOptions({
            fontSize: "14px",
            showPrintMargin: false,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true
        });
        
        // Setup Close & Save buttons
        document.getElementById('editorCloseBtn').onclick = () => {
            document.getElementById('editorPanel').classList.remove('active');
            currentEditingPath = null;
            // Reset position on close
            document.getElementById('editorPanel').style.transform = '';
            document.getElementById('editorPanel').style.left = '';
            document.getElementById('editorPanel').style.top = '';
        };

        // Editor Dragging & Resizing Logic
        const editorHeader = document.getElementById('editorHeader');
        const editorPanel = document.getElementById('editorPanel');
        let isDraggingEditor = false;
        let editorOffsetX, editorOffsetY;

        editorHeader.addEventListener('mousedown', (e) => {
            isDraggingEditor = true;
            const rect = editorPanel.getBoundingClientRect();
            editorOffsetX = e.clientX - rect.left;
            editorOffsetY = e.clientY - rect.top;
            
            // Disable transitions while dragging so it moves instantly
            editorPanel.style.transition = 'none';
            editorPanel.style.transform = 'none';
            editorPanel.style.margin = '0';
            // Set fixed position to detach from any relative parent constraints
            editorPanel.style.position = 'fixed';
            editorPanel.style.left = rect.left + 'px';
            editorPanel.style.top = rect.top + 'px';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDraggingEditor) return;
            let newTop = e.clientY - editorOffsetY;
            let newLeft = e.clientX - editorOffsetX;
            
            // Basic bounds checking
            if (newTop < 0) newTop = 0;
            if (newTop > window.innerHeight - 40) newTop = window.innerHeight - 40;
            if (newLeft < -editorPanel.offsetWidth + 100) newLeft = -editorPanel.offsetWidth + 100;
            if (newLeft > window.innerWidth - 100) newLeft = window.innerWidth - 100;
            
            editorPanel.style.left = newLeft + 'px';
            editorPanel.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingEditor) {
                isDraggingEditor = false;
                // We keep transition='none' because if we restore it, 
                // any subsequent movement (or closing) might look weird if left/top are animated.
                // But we can restore opacity/transform transitions specifically if needed.
            }
        });
        
        document.getElementById('editorSaveBtn').onclick = async () => {
            if (!currentEditingPath) return;
            const content = aceEditor.getValue();
            // Encode Base64
            const base64Content = btoa(unescape(encodeURIComponent(content)));
            
            try {
                const saveBtn = document.getElementById('editorSaveBtn');
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中';
                saveBtn.disabled = true;
                
                const result = await window.pywebview.api.upload_file_content(currentSessionId, base64Content, currentEditingPath);
                const response = JSON.parse(result);
                
                if (response.success) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
                    setTimeout(() => {
                        saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
                    }, 2000);
                } else {
                    alert(`Save failed: ${response.error}`);
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存';
                }
            } catch(e) {
                alert(`Error saving file: ${e}`);
                document.getElementById('editorSaveBtn').innerHTML = '<i class="fas fa-save"></i> 保存';
            } finally {
                document.getElementById('editorSaveBtn').disabled = false;
            }
        };

        // Add Ctrl+S Shortcut
        aceEditor.commands.addCommand({
            name: 'save',
            bindKey: {win: 'Ctrl-S',  mac: 'Command-S'},
            exec: function(editor) {
                document.getElementById('editorSaveBtn').click();
            }
        });
    } catch(e) {
        console.warn('Ace Editor failed to initialize', e);
    }
}

function getAceMode(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const modes = {
        'js': 'javascript', 'json': 'json', 'py': 'python',
        'html': 'html', 'css': 'css', 'md': 'markdown',
        'sh': 'sh', 'bash': 'sh', 'xml': 'xml', 'sql': 'sql',
        'yaml': 'yaml', 'yml': 'yaml', 'ini': 'ini', 'conf': 'ini',
        'c': 'c_cpp', 'cpp': 'c_cpp', 'h': 'c_cpp', 'java': 'java',
        'go': 'golang', 'rs': 'rust', 'php': 'php', 'txt': 'text'
    };
    return modes[ext] || 'text';
}

async function editFile(fileName) {
    const remotePath = currentPath.endsWith('/') ?
        currentPath + fileName :
        currentPath + '/' + fileName;

    try {
        // console.log('Loading file for editing:', remotePath);
        
        // Show Loading
        const panel = document.getElementById('editorPanel');
        document.getElementById('editorFileName').innerText = fileName + " (加载中...)";
        panel.classList.add('active');

        // Request file content
        const result = await window.pywebview.api.download_file_content(currentSessionId, remotePath);
        const response = JSON.parse(result);

        if (!response.success) {
            alert(`Failed to load file content: ${response.error}`);
            panel.classList.remove('active');
            return;
        }

        // Decode Base64 efficiently without OOM
        // Using fetch data URI is heavily optimized in Chromium/WebView2 and avoids JS heap spikes
        const content = await fetch(`data:application/octet-stream;base64,${response.content}`).then(r => r.text());
        
        initAceEditor();
        if (aceEditor) {
            aceEditor.session.setMode("ace/mode/" + getAceMode(fileName));
            aceEditor.setValue(content, -1);
            currentEditingPath = remotePath;
            document.getElementById('editorFileName').innerText = fileName;
        } else {
            alert("Ace Editor is not initialized.");
            panel.classList.remove('active');
        }

    } catch (error) {
        console.error('Error editing file:', error);
        alert('Failed to edit file: ' + error.message);
        document.getElementById('editorPanel').classList.remove('active');
    }
}

// Called from Python backend when a file is synced
function showSyncNotification(fileName) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 212, 255, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
    `;
    notification.textContent = `鉁?${fileName} synced`;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

async function deleteFileOrFolder(fileName, fileType, filePath) {
    const itemType = fileType === 'directory' ? 'folder' : 'file';

    if (!confirm(`Are you sure you want to delete this ${itemType}?\n\n${fileName}`)) {
        return;
    }

    try {
        let result;
        if (fileType === 'directory') {
            result = await window.pywebview.api.delete_directory(currentSessionId, filePath);
        } else {
            result = await window.pywebview.api.delete_file(currentSessionId, filePath);
        }

        const response = JSON.parse(result);
        if (response.success) {
            // console.log('Successfully deleted:', fileName);
            // Refresh file list
            await listFiles(currentPath);
        } else {
            alert(`Failed to delete ${fileName}: ${response.error}`);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Delete failed: ' + error.message);
    }
}

// Rename Modal Functions
let renameTarget = null;

function showRenameModal(fileName) {
    renameTarget = fileName;
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');

    input.value = fileName;
    modal.style.display = 'flex';

    // Focus and select the filename (without extension for files)
    setTimeout(() => {
        input.focus();
        if (fileName.includes('.')) {
            const dotIndex = fileName.lastIndexOf('.');
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }
    }, 100);

    // Handle Enter key
    input.onkeyup = (e) => {
        if (e.key === 'Enter') {
            confirmRename();
        } else if (e.key === 'Escape') {
            closeRenameModal();
        }
    };
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    modal.style.display = 'none';
    renameTarget = null;
    isRenameLocal = false;
}

async function confirmRename() {
    const newName = document.getElementById('renameInput').value.trim();

    if (!newName) {
        alert('请输入有效名称');
        return;
    }

    if (newName === renameTarget) {
        closeRenameModal();
        return;
    }

    if (isRenameLocal) {
        const sep = localCurrentPath.endsWith('\\') ? '' : '\\';
        const newPath = localCurrentPath + sep + newName;
        try {
            const result = JSON.parse(await window.pywebview.api.rename_local_file(localRenameOldPath, newPath));
            if (result.success) {
                closeRenameModal();
                refreshLocalFiles();
            } else {
                alert("重命名失败: " + result.error);
            }
        } catch(e) {
            alert("重命名失败: " + e.message);
        }
    } else {
        const oldPath = currentPath.endsWith('/') ?
            currentPath + renameTarget :
            currentPath + '/' + renameTarget;

        const newPath = currentPath.endsWith('/') ?
            currentPath + newName :
            currentPath + '/' + newName;

        try {
            const result = await window.pywebview.api.rename_file(currentSessionId, oldPath, newPath);
            const response = JSON.parse(result);

            if (response.success) {
                closeRenameModal();
                await listFiles(currentPath);
            } else {
                alert(`重命名失败: ${response.error}`);
            }
        } catch (error) {
            console.error('Rename error:', error);
            alert('Rename failed: ' + error.message);
        }
    }
}

// HTML escaping function to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// JavaScript string escaping for use in onclick attributes
function escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r');
}

// Toggle collapsible sections
function toggleSection(sectionName) {
    const content = document.getElementById(sectionName + 'Content');
    const chevron = document.getElementById(sectionName + 'Chevron');

    content.classList.toggle('open');
    chevron.classList.toggle('open');
}

function togglePrivacyMode() {
    isPrivacyMode = !isPrivacyMode;
    const btn = document.getElementById('privacyModeBtn');
    if (btn) {
        btn.classList.toggle('active', isPrivacyMode);
        btn.innerHTML = isPrivacyMode ? '🔒 隐私模式' : '👁️ 隐私模式';
    }
    renderRecentConnections();
    renderConnectionsHome();
}

// Load saved connections on startup
async function loadSavedConnections() {
    try {
        // console.log('正在加载保存的连接...');
        const response = await window.pywebview.api.get_saved_connections();
        const connections = JSON.parse(response);
        // console.log('保存的连接数:', connections.length, '个');
        savedConnectionsCache = connections;
        filterSavedConnections();
        renderRecentConnections();
        renderConnectionsHome();
        if (topoViewer) {
            topoViewer.buildTopology();
        }
    } catch (error) {
        console.error('加载保存连接失败', error);
    }
}

function getConnectionSearchHaystack(conn) {
    return [conn.name, conn.hostname, conn.username, conn.port, conn.key]
        .filter(value => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
}

function getConnectionDisplayParts(connection) {
    const name = connection.name || connection.hostname || connection.key || '未命名主机';
    const username = connection.username || 'root';
    const hostname = connection.hostname || '';
    const port = Number(connection.port || 22);
    const portLabel = port && port !== 22 ? `:${port}` : '';
    const target = `${username}@${hostname}${portLabel}`;
    return { name, username, hostname, port, portLabel, target };
}

function updateHomeConnectionSummary(filteredCount = null) {
    const summary = document.getElementById('homeConnectionSummary');
    if (!summary) return;

    const total = savedConnectionsCache.length;
    if (total === 0) {
        summary.textContent = '暂无保存主机，可从左侧新建连接。';
        return;
    }

    if (filteredCount !== null && filteredCount !== total) {
        summary.textContent = `已保存 ${total} 台主机，当前筛选 ${filteredCount} 台`;
        return;
    }

    summary.textContent = `已保存 ${total} 台主机，点击卡片即可连接`;
}

function renderRecentConnections() {
    const container = document.getElementById('recentConnectionsList');
    if (!container) return;

    container.innerHTML = '';
    const recentConnections = savedConnectionsCache.slice(0, RECENT_CONNECTION_LIMIT);
    if (recentConnections.length === 0) {
        container.innerHTML = '<div class="empty-message">暂无最近主机</div>';
        return;
    }

    recentConnections.forEach(conn => {
        const parts = getConnectionDisplayParts(conn);
        const item = document.createElement('div');
        item.className = 'recent-connection-item';
        item.onclick = () => quickConnectSavedConnection(conn.key);
        item.innerHTML = `
            <span class="recent-connection-dot"></span>
            <span class="recent-connection-copy">
                <span class="recent-connection-name" title="${escapeHtml(parts.name)}">${escapeHtml(parts.name)}</span>
                <span class="recent-connection-address" title="${escapeHtml(parts.target)}">${escapeHtml(isPrivacyMode ? '******@***.***' : parts.target)}</span>
            </span>
            <button type="button" class="recent-connection-action" onclick="event.stopPropagation(); quickConnectSavedConnection('${escapeJs(conn.key)}');">连接</button>
        `;
        container.appendChild(item);
    });
}

function renderConnectionsHome() {
    const container = document.getElementById('homeConnectionsList');
    const empty = document.getElementById('homeConnectionsEmpty');
    const search = document.getElementById('homeConnectionSearch');
    if (!container || !empty) return;

    const query = (search?.value || '').trim().toLowerCase();
    const connections = query
        ? savedConnectionsCache.filter(conn => getConnectionSearchHaystack(conn).includes(query))
        : savedConnectionsCache;

    container.classList.toggle('list-view', connectionsHomeView === 'list');
    document.querySelectorAll('.home-view-switch button').forEach(button => {
        button.classList.toggle('active', button.dataset.view === connectionsHomeView);
    });
    container.innerHTML = '';
    empty.style.display = connections.length === 0 ? 'block' : 'none';
    updateHomeConnectionSummary(connections.length);

    connections.forEach(conn => {
        const parts = getConnectionDisplayParts(conn);
        const card = document.createElement('div');
        card.className = 'home-connection-card';
        card.onclick = () => quickConnectSavedConnection(conn.key);
        card.oncontextmenu = (event) => showHomeConnectionMenu(event, conn.key);
        card.innerHTML = `
            <div class="home-connection-top">
                <span class="home-connection-icon">~</span>
                <span class="home-connection-protocol">SSH</span>
                <button class="home-connection-edit" type="button" onclick="editSavedConnection('${escapeJs(conn.key)}'); event.stopPropagation();" title="编辑主机">编辑</button>
            </div>
            <div class="home-connection-title-row"><span class="home-connection-name">${escapeHtml(parts.name)}</span></div>
            <div class="home-connection-address">${escapeHtml(isPrivacyMode ? '******@***.***' : parts.target)}</div>
            <div class="home-connection-card-actions">
                <button class="home-connection-delete" type="button" onclick="deleteConnection('${escapeJs(conn.key)}'); event.stopPropagation();" title="删除主机">删除</button>
                <button class="home-connection-button home-card-connect" type="button" onclick="quickConnectSavedConnection('${escapeJs(conn.key)}'); event.stopPropagation();">连接</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function showHomeConnectionMenu(event, key) {
    event.preventDefault();
    event.stopPropagation();

    const existing = document.getElementById('homeConnectionMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'homeConnectionMenu';
    menu.className = 'context-menu home-connection-menu';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.style.display = 'block';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="connect">连接</div>
        <div class="context-menu-item" data-action="edit">编辑</div>
        <div class="context-menu-item context-menu-delete" data-action="delete">删除</div>
    `;

    menu.onclick = async (clickEvent) => {
        const action = clickEvent.target?.dataset?.action;
        if (!action) return;
        menu.remove();
        if (action === 'connect') await quickConnectSavedConnection(key);
        if (action === 'edit') await editSavedConnection(key);
        if (action === 'delete') await deleteConnection(key);
    };

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}

function setConnectionsHomeView(view) {
    connectionsHomeView = view === 'list' ? 'list' : 'grid';
    try {
        localStorage.setItem('ldysshConnectionsHomeView', connectionsHomeView);
        localStorage.setItem('prismsshConnectionsHomeView', connectionsHomeView);
    } catch (error) {
        console.warn('保存主机视图失败：', error);
    }
    renderConnectionsHome();
}

function restoreConnectionsHomeView() {
    try {
        connectionsHomeView = localStorage.getItem('ldysshConnectionsHomeView') || localStorage.getItem('prismsshConnectionsHomeView') || 'grid';
    } catch (error) {
        connectionsHomeView = 'grid';
    }
}

async function quickConnectSavedConnection(key) {
    await quickConnect(key);
}

function editSavedConnection(key, focusPassword = false) {
    return loadConnection(key).then(loaded => {
        if (!loaded.loaded) return;
        openNewConnectionForm(focusPassword || loaded.passwordUnavailable ? 'password' : 'hostname');
    });
}

function showConnectionsHome() {
    const home = document.getElementById('welcomeScreen');
    if (home) home.style.display = 'block';
    renderConnectionsHome();
    toggleWorkbenchActive(true);
}

function filterSavedConnections() {
    const searchInput = document.getElementById('savedConnectionSearch');
    const query = (searchInput?.value || '').trim().toLowerCase();

    if (!query) {
        updateSavedConnectionsList(savedConnectionsCache);
        return;
    }

    const filteredConnections = savedConnectionsCache.filter(conn => {
        const haystack = [
            conn.name,
            conn.hostname,
            conn.username,
            conn.port,
            conn.key
        ].filter(value => value !== undefined && value !== null)
            .join(' ')
            .toLowerCase();

        return haystack.includes(query);
    });

    updateSavedConnectionsList(filteredConnections);
}

function updateSavedConnectionsList(connections) {
    const container = document.getElementById('savedConnectionsList');
    container.innerHTML = '';

    if (connections.length === 0) {
        const hasSearch = (document.getElementById('savedConnectionSearch')?.value || '').trim();
        container.innerHTML = `<div class="empty-message">${hasSearch ? '未找到匹配连接' : '暂无保存连接'}</div>`;
        return;
    }

    connections.forEach(conn => {
        const item = document.createElement('div');
        item.className = 'saved-connection-item';
        item.innerHTML = `
            <div class="saved-connection-info" onclick="loadConnection('${escapeJs(conn.key)}')">
                <div class="saved-connection-name">${escapeHtml(conn.name || conn.key)}</div>
                <div class="saved-connection-details">${escapeHtml(conn.hostname)}:${escapeHtml(String(conn.port))}</div>
            </div>
            <div class="saved-connection-actions">
                <button class="action-btn" onclick="quickConnect('${escapeJs(conn.key)}'); event.stopPropagation();">连接</button>
                <button class="action-btn delete" onclick="deleteConnection('${escapeJs(conn.key)}'); event.stopPropagation();">删除</button>
            </div>
        `;
        container.appendChild(item);
    });
}

async function loadConnection(key) {
    const connections = JSON.parse(await window.pywebview.api.get_saved_connections());
    const conn = connections.find(c => c.key === key);
    if (!conn) {
        return { loaded: false, passwordUnavailable: false };
    }

    document.getElementById('connectionName').value = conn.name || '';
    document.getElementById('hostname').value = conn.hostname;
    document.getElementById('port').value = conn.port || 22;
    document.getElementById('username').value = conn.username;
    document.getElementById('saveConnection').checked = true;

    // 填入堡垒机高级参数
    document.getElementById('jumpHost').value = conn.jumpHost || '';
    document.getElementById('jumpPort').value = conn.jumpPort || 22;
    document.getElementById('jumpUser').value = conn.jumpUser || '';
    document.getElementById('jumpPass').value = conn.jumpPass || '';
    document.getElementById('jumpKey').value = conn.jumpKey || '';
    document.getElementById('jumpKeyPassphrase').value = conn.jumpKeyPassphrase || '';

    const jumpHostFields = document.getElementById('jumpHostFields');
    const jumpHostChevron = document.getElementById('jumpHostChevron');
    if (conn.jumpHost) {
        jumpHostFields.style.display = 'block';
        jumpHostChevron.textContent = '▼';
    } else {
        jumpHostFields.style.display = 'none';
        jumpHostChevron.textContent = '▶';
    }

    // 填入代理高级参数
    document.getElementById('proxyType').value = conn.proxyType || 'none';
    document.getElementById('proxyHost').value = conn.proxyHost || '';
    document.getElementById('proxyPort').value = conn.proxyPort || 1080;
    document.getElementById('proxyUser').value = conn.proxyUser || '';
    document.getElementById('proxyPass').value = conn.proxyPass || '';

    const proxyFields = document.getElementById('proxyFields');
    const proxyChevron = document.getElementById('proxyChevron');
    if (conn.proxyType && conn.proxyType !== 'none') {
        proxyFields.style.display = 'block';
        proxyChevron.textContent = '▼';
    } else {
        proxyFields.style.display = 'none';
        proxyChevron.textContent = '▶';
    }

    if (conn.password_unavailable) {
        document.getElementById('authType').value = 'password';
        document.getElementById('password').value = '';
        document.getElementById('keyPassphrase').value = '';
        document.getElementById('passwordGroup').style.display = 'block';
        document.getElementById('keyGroup').style.display = 'none';
    } else if (conn.password) {
        document.getElementById('authType').value = 'password';
        document.getElementById('password').value = conn.password;
        document.getElementById('keyPassphrase').value = '';
        document.getElementById('passwordGroup').style.display = 'block';
        document.getElementById('keyGroup').style.display = 'none';
    } else if (conn.keyPath) {
        document.getElementById('authType').value = 'key';
        document.getElementById('keyPath').value = conn.keyPath;
        document.getElementById('keyPassphrase').value = '';
        document.getElementById('passwordGroup').style.display = 'none';
        document.getElementById('keyGroup').style.display = 'block';
    }

    return { loaded: true, passwordUnavailable: Boolean(conn.password_unavailable) };
}

async function quickConnect(key) {
    const loaded = await loadConnection(key);
    if (!loaded || loaded.passwordUnavailable) {
        openNewConnectionForm('password');
        return;
    }
    await connect();
}

async function deleteConnection(key) {
    if (confirm('确定删除这个保存的连接吗？')) {
        // console.log('Deleting connection:', key);
        try {
            const result = await window.pywebview.api.delete_saved_connection(key);
            const parsedResult = JSON.parse(result);
            // console.log('Delete result:', parsedResult);

            if (parsedResult.success) {
                // Add a small delay to ensure file system has updated
                await new Promise(resolve => setTimeout(resolve, 100));
                await loadSavedConnections();
            } else {
                alert('删除连接失败：' + (parsedResult.error || '未知错误'));
            }
        } catch (error) {
            console.error('Error deleting connection:', error);
            alert('删除连接时发生错误');
        }
    }
}

// Check encryption status and show warning if needed
async function checkEncryptionStatus() {
    try {
        const response = await window.pywebview.api.get_encryption_status();
        const status = JSON.parse(response);

        // Add warning indicator to save connection checkbox if encryption not available
        if (!status.available) {
            addEncryptionWarningToUI();
        }
    } catch (error) {
        console.error('Error checking encryption status:', error);
        addEncryptionWarningToUI();
    }
}

function addEncryptionWarningToUI() {
    const saveConnectionGroup = document.querySelector('.checkbox-group');
    if (saveConnectionGroup) {
        const warningBadge = document.createElement('span');
        warningBadge.innerHTML = ' ⚠️';
        warningBadge.style.color = '#ff6b35';
        warningBadge.style.fontSize = '12px';
        warningBadge.title = '当前环境未启用密码加密，建议谨慎保存密码。';

        const label = saveConnectionGroup.querySelector('label');
        if (label) {
            label.appendChild(warningBadge);
        }
    }
}

async function acknowledgeEncryptionWarning() {
    try {
        await window.pywebview.api.mark_encryption_warning_shown();
    } catch (error) {
        console.error('Error marking encryption warning as shown:', error);
    }

    const overlay = document.getElementById('encryptionWarningOverlay');
    if (overlay) {
        overlay.remove();
    }
}

function copyInstallCommand() {
    const command = 'pip install cryptography';

    if (navigator.clipboard) {
        navigator.clipboard.writeText(command).then(() => {
            // Show temporary feedback
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.style.background = 'rgba(0, 255, 136, 0.2)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = 'rgba(255, 255, 255, 0.1)';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy command:', err);
            alert('Install command: ' + command);
        });
    } else {
        // Fallback for older browsers
        alert('Install command: ' + command);
    }
}

async function connectWithHostVerification(sessionId, connectionParams) {
    try {
        // console.log('Connecting session:', sessionId);

        // For now, connect directly without host key verification UI
        // TODO: Re-enable host key verification once API methods are confirmed
        const result = await window.pywebview.api.connect(
            sessionId,
            JSON.stringify(connectionParams)
        );

        // console.log('Connection result:', result);
        return JSON.parse(result);

    } catch (error) {
        console.error('Connection error:', error);
        return { success: false, error: error.toString() };
    }
}

function showHostKeyVerificationModal(details) {
    return new Promise((resolve) => {
        const modalHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: 'Inter', sans-serif;
            " id="hostKeyModal">
                <div style="
                    background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
                    border: 2px solid #00d4ff;
                    border-radius: 12px;
                    padding: 30px;
                    max-width: 600px;
                    width: 90%;
                    box-shadow: 0 20px 50px rgba(0, 212, 255, 0.3);
                    color: #fff;
                ">
                    <div style="
                        font-size: 48px;
                        margin-bottom: 20px;
                        color: #00d4ff;
                        text-align: center;
                    ">馃攼</div>

                    <h2 style="
                        color: #00d4ff;
                        margin: 0 0 20px 0;
                        font-size: 24px;
                        font-weight: 700;
                        text-align: center;
                    ">Unknown Host Key</h2>

                    <p style="
                        margin: 0 0 20px 0;
                        font-size: 16px;
                        line-height: 1.5;
                        color: #e0e0e0;
                    ">
                        The authenticity of host <strong>${escapeHtml(details.hostname)}</strong> can't be established.
                    </p>

                    <div style="
                        background: rgba(0, 212, 255, 0.1);
                        border: 1px solid rgba(0, 212, 255, 0.3);
                        border-radius: 8px;
                        padding: 15px;
                        margin: 20px 0;
                        font-family: 'Consolas', monospace;
                        font-size: 14px;
                    ">
                        <strong>Key Type:</strong> ${escapeHtml(details.key_type)}<br>
                        <strong>Fingerprint:</strong><br>
                        <span style="color: #00ff88; word-break: break-all;">${escapeHtml(details.fingerprint)}</span>
                    </div>

                    <p style="
                        margin: 20px 0;
                        font-size: 14px;
                        color: #ffa500;
                    ">
                        ⚠️ <strong>Are you sure you want to continue connecting?</strong><br>
                        If you trust this host, the key will be saved for future connections.
                    </p>

                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 25px;">
                        <button onclick="document.getElementById('hostKeyModal').remove(); window.hostKeyResolve(true)" style="
                            background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
                            border: none;
                            border-radius: 6px;
                            padding: 12px 24px;
                            color: white;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 5px 15px rgba(0, 212, 255, 0.4)'"
                           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            Yes, Trust This Host
                        </button>

                        <button onclick="document.getElementById('hostKeyModal').remove(); window.hostKeyResolve(false)" style="
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 6px;
                            padding: 12px 24px;
                            color: white;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.background='rgba(255, 68, 68, 0.2)'"
                           onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                            No, Cancel Connection
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Set up the resolve function
        window.hostKeyResolve = (accepted) => {
            resolve(accepted);
            delete window.hostKeyResolve;
        };
    });
}

// Copy/Paste functionality for terminals - uses Python backend for clipboard
function setupTerminalClipboard(terminal, sessionId) {
    // Handle copy/paste keyboard shortcuts
    terminal.attachCustomKeyEventHandler((event) => {
        
        // Check for Ctrl+F (Search)
        if (event.ctrlKey && !event.shiftKey && (event.key === 'F' || event.key === 'f')) {
            if (event.type === 'keydown' && !event.repeat) {
                openTerminalSearch();
            }
            return false;
        }

        // Check for Ctrl+C (Copy if text selected, otherwise pass as SIGINT)
        if (event.ctrlKey && !event.shiftKey && (event.key === 'C' || event.key === 'c')) {
            const selection = terminal.getSelection();
            if (selection) {
                if (event.type === 'keydown' && !event.repeat) {
                    window.pywebview.api.clipboard_copy(selection);
                    showToast('已复制到剪贴板', 'success');
                    terminal.clearSelection();
                }
                return false; // Intercept so it doesn't send SIGINT
            }
            return true; // Allow SIGINT to pass to the terminal
        }

        // Check for Ctrl+V (Paste)
        if (event.ctrlKey && !event.shiftKey && (event.key === 'V' || event.key === 'v')) {
            event.preventDefault();
            event.stopPropagation();
            if (event.type === 'keydown' && !event.repeat) {
                window.pywebview.api.clipboard_paste().then(result => {
                    const data = JSON.parse(result);
                    if (data.success && data.text && currentSessionId === sessionId) {
                        window.pywebview.api.send_input(sessionId, data.text);
                        showToast('已粘贴', 'success');
                    }
                });
            }
            return false;
        }

        return true;
    });

    // Add right-click context menu for copy/paste
    terminal.element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showTerminalContextMenu(e, terminal, sessionId);
    });
}

function showTerminalContextMenu(event, terminal, sessionId) {
    // Remove any existing context menu
    const existingMenu = document.getElementById('terminalContextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // Capture selection NOW before any click events can clear it
    const hasSelection = terminal.hasSelection();
    const capturedSelection = hasSelection ? terminal.getSelection() : '';

    // Create context menu
    const contextMenu = document.createElement('div');
    contextMenu.id = 'terminalContextMenu';
    contextMenu.style.cssText = `
        position: fixed;
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 150px;
        z-index: 10000;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        font-family: 'Inter', sans-serif;
        font-size: 14px;
    `;

    // Copy option
    const copyOption = document.createElement('div');
    copyOption.style.cssText = `
        padding: 8px 16px;
        color: ${hasSelection ? '#ffffff' : '#666666'};
        cursor: ${hasSelection ? 'pointer' : 'not-allowed'};
        transition: background-color 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    copyOption.innerHTML = `
        <span style="font-family: monospace;">📄</span>
        Copy${hasSelection ? '' : ' (no selection)'}
        <span style="margin-left: auto; font-size: 12px; color: #888;">Ctrl+c</span>
    `;

    if (hasSelection) {
        copyOption.onmouseover = () => copyOption.style.background = 'rgba(0, 212, 255, 0.2)';
        copyOption.onmouseout = () => copyOption.style.background = 'transparent';
        copyOption.onclick = () => {
            window.pywebview.api.clipboard_copy(capturedSelection);
            contextMenu.remove();
        };
    }

    // Paste option
    const pasteOption = document.createElement('div');
    pasteOption.style.cssText = `
        padding: 8px 16px;
        color: #ffffff;
        cursor: pointer;
        transition: background-color 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    pasteOption.innerHTML = `
        <span style="font-family: monospace;">📋</span>
        Paste
        <span style="margin-left: auto; font-size: 12px; color: #888;">Ctrl+v</span>
    `;
    pasteOption.onmouseover = () => pasteOption.style.background = 'rgba(0, 212, 255, 0.2)';
    pasteOption.onmouseout = () => pasteOption.style.background = 'transparent';
    pasteOption.onclick = () => {
        window.pywebview.api.clipboard_paste().then(result => {
            const data = JSON.parse(result);
            if (data.success && data.text && currentSessionId === sessionId) {
                window.pywebview.api.send_input(sessionId, data.text);
            }
        });
        contextMenu.remove();
    };

    // Add separator
    const separator = document.createElement('div');
    separator.style.cssText = `
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 4px 0;
    `;

    // Select All option
    const selectAllOption = document.createElement('div');
    selectAllOption.style.cssText = `
        padding: 8px 16px;
        color: #ffffff;
        cursor: pointer;
        transition: background-color 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    selectAllOption.innerHTML = `
        <span style="font-family: monospace;">☑️</span>
        Select All
        <span style="margin-left: auto; font-size: 12px; color: #888;">Ctrl+a</span>
    `;
    selectAllOption.onmouseover = () => selectAllOption.style.background = 'rgba(0, 212, 255, 0.2)';
    selectAllOption.onmouseout = () => selectAllOption.style.background = 'transparent';
    selectAllOption.onclick = () => {
        terminal.selectAll();
        contextMenu.remove();
    };


    // Search option
    const searchOption = document.createElement('div');
    searchOption.style.cssText = `
        padding: 8px 16px;
        color: #ffffff;
        cursor: pointer;
        transition: background-color 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    searchOption.innerHTML = `
        <span style="font-family: monospace;">🔍</span>
        Search
        <span style="margin-left: auto; font-size: 12px; color: #888;">Ctrl+f</span>
    `;
    searchOption.onmouseover = () => searchOption.style.background = 'rgba(0, 212, 255, 0.2)';
    searchOption.onmouseout = () => searchOption.style.background = 'transparent';
    searchOption.onclick = () => {
        openTerminalSearch();
        contextMenu.remove();
    };

    // Clear option
    const clearOption = document.createElement('div');
    clearOption.style.cssText = `
        padding: 8px 16px;
        color: #ffffff;
        cursor: pointer;
        transition: background-color 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    clearOption.innerHTML = `
        <span style="font-family: monospace;">🗑️</span>
        Clear Terminal
        <span style="margin-left: auto; font-size: 12px; color: #888;">Ctrl+l</span>
    `;
    clearOption.onmouseover = () => clearOption.style.background = 'rgba(255, 68, 68, 0.2)';
    clearOption.onmouseout = () => clearOption.style.background = 'transparent';
    clearOption.onclick = () => {
        terminal.clear();
        contextMenu.remove();
    };

    // Assemble menu
    contextMenu.appendChild(copyOption);
    contextMenu.appendChild(pasteOption);
    contextMenu.appendChild(separator);
    contextMenu.appendChild(selectAllOption);
    contextMenu.appendChild(clearOption);

    // Position menu
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';

    // Add to page
    document.body.appendChild(contextMenu);

    // Hide menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', () => {
            if (contextMenu.parentNode) {
                contextMenu.remove();
            }
        }, { once: true });
    }, 0);

    // Prevent the default context menu
    event.preventDefault();
    event.stopPropagation();
}

function showCopyNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        background: ${type === 'error' ? 'rgba(255, 68, 68, 0.9)' :
                    type === 'warning' ? 'rgba(255, 165, 0, 0.9)' :
                    'rgba(0, 255, 136, 0.9)'};
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        font-family: 'Inter', sans-serif;
        animation: slideInFromRight 0.3s ease;
    `;

    const icon = type === 'error' ? '!' : type === 'warning' ? '!' : 'OK';
    notification.textContent = `${icon} ${message}`;

    // Add animation keyframes if not already added
    if (!document.getElementById('copyNotificationStyles')) {
        const style = document.createElement('style');
        style.id = 'copyNotificationStyles';
        style.textContent = `
            @keyframes slideInFromRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Remove after 2 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideInFromRight 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 2000);
}

function getSavedTheme() {
    try {
        return localStorage.getItem('ldysshTheme') || localStorage.getItem('prismsshTheme') || 'blue';
    } catch (error) {
        return 'blue';
    }
}

function getCurrentThemeName() {
    const app = document.querySelector('.app');
    return app?.classList.contains('theme-gold') ? 'gold' : 'blue';
}

function getTerminalTheme() {
    if (getCurrentThemeName() === 'gold') {
        return {
            background: 'transparent',
            foreground: '#f5f7fa',
            cursor: '#d5dbe2',
            selectionBackground: 'rgba(255, 217, 102, 0.5)',
            black: '#090b0d',
            red: '#ff6b6b',
            green: '#8bd450',
            yellow: '#ffd966',
            blue: '#72a7ff',
            magenta: '#d99aff',
            cyan: '#79e6d8',
            white: '#fff4d4',
            brightBlack: '#6d6557',
            brightRed: '#ff8585',
            brightGreen: '#a6e36a',
            brightYellow: '#ffe58a',
            brightBlue: '#94bdff',
            brightMagenta: '#e5b3ff',
            brightCyan: '#9cf1e7',
            brightWhite: '#ffffff'
        };
    }

    return {
        background: '#00000000',
        foreground: '#f8f8f2',
        cursor: '#70a5eb',
        selectionBackground: 'rgba(122, 162, 247, 0.5)',
        black: '#15161e',
        red: '#ff757f',
        green: '#9ece6a',
        yellow: '#ffc777',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#e3e6ee',
        brightBlack: '#565f89',
        brightRed: '#ff757f',
        brightGreen: '#c3e88d',
        brightYellow: '#ffc777',
        brightBlue: '#89ddff',
        brightMagenta: '#c099ff',
        brightCyan: '#b4f9ff',
        brightWhite: '#ffffff'
    };
}

function applyTerminalThemeToAll() {
    const terminalTheme = getTerminalTheme();
    Object.values(sessions).forEach((session) => {
        if (session?.terminal) {
            session.terminal.options.theme = terminalTheme;
        }
    });
}

function applyTheme(theme) {
    const normalized = theme === 'gold' ? 'gold' : 'blue';
    const app = document.querySelector('.app');
    const toggle = document.getElementById('themeToggle');
    if (!app) return;

    app.classList.toggle('theme-blue', normalized === 'blue');
    app.classList.toggle('theme-gold', normalized === 'gold');
    if (toggle) {
        toggle.title = normalized === 'blue' ? '切换到暖金主题' : '切换到蓝色主题';
        toggle.querySelector('span').textContent = normalized === 'blue' ? '☾' : '☀';
    }

    try {
        localStorage.setItem('ldysshTheme', normalized);
        localStorage.setItem('prismsshTheme', normalized);
    } catch (error) {
        console.warn('保存主题失败：', error);
    }

    applyTerminalThemeToAll();
}

function toggleTheme() {
    const app = document.querySelector('.app');
    const nextTheme = app?.classList.contains('theme-gold') ? 'blue' : 'gold';
    applyTheme(nextTheme);
}

// Wait for page to load
window.addEventListener('DOMContentLoaded', () => {
    // console.log('Page loaded, checking Terminal availability...');
    applyTheme(getSavedTheme());
    restoreConnectionsHomeView();
    loadHighlightRules();
    renderHighlightRules();

    // Check if Terminal is available
    if (typeof Terminal === 'undefined') {
        console.error('Terminal library not loaded!');
        alert('Error: Terminal library failed to load. Please check your internet connection and refresh the page.');
        return;
    }

    // console.log('Terminal library loaded successfully');

    // Wait for pywebview API to be ready
    async function loadOpenAiSettings() {
        try {
            const result = JSON.parse(await window.pywebview.api.get_openai_settings());
            if (result.success) {
                const keyInput = document.getElementById('openaiApiKey');
                const baseUrlInput = document.getElementById('openaiBaseUrl');
                const modelInput = document.getElementById('openaiModel');
                if (keyInput && result.hasApiKey) {
                    keyInput.placeholder = result.apiKeyMasked || '已设置密钥';
                }
                if (baseUrlInput && result.baseUrl) {
                    baseUrlInput.value = result.baseUrl;
                }
                if (modelInput && result.model) {
                    modelInput.value = result.model;
                }
                if (result.hasApiKey && typeof showAiChat === 'function') {
                    showAiChat();
                }
            }
        } catch (e) {
            console.error('Failed to load OpenAI settings:', e);
        }
    }

    function waitForAPI() {
        if (window.pywebview && window.pywebview.api) {
            // console.log('PyWebView API ready, loading saved connections...');
            // Check encryption status first
            checkEncryptionStatus();
            // Load saved connections
            loadSavedConnections();
            // Load OpenAI settings
            loadOpenAiSettings();
            // Setup drag and drop
            setupDragDrop();
        } else {
            // console.log('Waiting for PyWebView API...');
            setTimeout(waitForAPI, 100);
        }
    }

    waitForAPI();

    // Handle auth type change
    document.getElementById('authType').addEventListener('change', (e) => {
        if (e.target.value === 'password') {
            document.getElementById('passwordGroup').style.display = 'block';
            document.getElementById('keyGroup').style.display = 'none';
        } else {
            document.getElementById('passwordGroup').style.display = 'none';
            document.getElementById('keyGroup').style.display = 'block';
        }
    });
});

async function connect() {
    const connectionName = document.getElementById('connectionName').value.trim();
    const hostname = document.getElementById('hostname').value;
    const port = document.getElementById('port').value || 22;
    const username = document.getElementById('username').value;
    const authType = document.getElementById('authType').value;
    const password = authType === 'password' ? document.getElementById('password').value : null;
    const keyPath = authType === 'key' ? document.getElementById('keyPath').value : null;
    const keyPassphrase = authType === 'key' ? document.getElementById('keyPassphrase').value : null;
    const saveConnection = document.getElementById('saveConnection').checked;

    // 获取堡垒机参数
    const jumpHost = document.getElementById('jumpHost').value.trim();
    const jumpPort = parseInt(document.getElementById('jumpPort').value || 22);
    const jumpUser = document.getElementById('jumpUser').value.trim();
    const jumpPass = document.getElementById('jumpPass').value;
    const jumpKey = document.getElementById('jumpKey').value.trim();
    const jumpKeyPassphrase = document.getElementById('jumpKeyPassphrase').value;

    // 获取代理参数
    const proxyType = document.getElementById('proxyType').value;
    const proxyHost = document.getElementById('proxyHost').value.trim();
    const proxyPort = parseInt(document.getElementById('proxyPort').value || 1080);
    const proxyUser = document.getElementById('proxyUser').value.trim();
    const proxyPass = document.getElementById('proxyPass').value;

    if (jumpHost && !jumpUser) {
        alert('请填入堡垒机用户名');
        document.getElementById('jumpUser').focus();
        return;
    }

    if (proxyType && proxyType !== 'none' && !proxyHost) {
        alert('请填入代理主机/IP');
        document.getElementById('proxyHost').focus();
        return;
    }

    if (authType === 'password' && !password) {
        alert('请输入 SSH 密码');
        document.getElementById('password').focus();
        return;
    }

    if (authType === 'key' && !keyPath) {
        alert('请输入 SSH 私钥路径');
        document.getElementById('keyPath').focus();
        return;
    }

    if (!hostname || !username) {
        alert('请填写主机地址和用户名');
        return;
    }

    // Show connecting screen
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('connectingScreen').style.display = 'block';

    try {
        // Create new session
        const sessionId = await window.pywebview.api.create_session();

        const connectionParams = {
            hostname,
            port: parseInt(port),
            username,
            authType,
            password,
            keyPath,
            keyPassphrase,
            save: saveConnection,
            name: connectionName,
            // 传入堡垒机参数
            jumpHost,
            jumpPort,
            jumpUser,
            jumpPass,
            jumpKey,
            jumpKeyPassphrase,
            // 传入代理参数
            proxyType,
            proxyHost,
            proxyPort,
            proxyUser,
            proxyPass
        };

        // Connect (with host verification if needed)
        const result = await connectWithHostVerification(sessionId, connectionParams);

        if (result.success) {
            // Add basic session info first
            sessions[sessionId] = {
                id: sessionId,
                hostname,
                username,
                name: connectionName,
                connected: true,
                connectionParams: connectionParams,
                connectTime: Date.now()
            };

            // Create terminal (this will update the sessions object)
            createTerminalForSession(sessionId, hostname);

            updateSessionsList();
            updateSessionTabs();
            switchToSession(sessionId);

            // Start polling for output
            startOutputPolling(sessionId);

            // Reload saved connections if a new one was saved
            if (saveConnection) {
                await loadSavedConnections();
            }

            // Automatically hide SSH sidebar and show CMD panel upon successful connection
            const appNode = document.querySelector('.app');
            if (appNode) {
                appNode.classList.add('ssh-sidebar-collapsed');
            }
            if (typeof openTool === 'function') {
                openTool('commands');
            }

            // console.log('Terminal setup complete');
        } else {
            console.error('Connection failed:', result.error);
            alert(formatConnectionError(result.error));
            document.getElementById('splashScreen').style.display = 'none'; document.getElementById('splashScreen').style.display = 'none'; document.getElementById('connectingScreen').style.display = 'none';
            showConnectionsHome();
        }
    } catch (error) {
        console.error('Connection error:', error);
        alert(formatConnectionError(error));
        document.getElementById('splashScreen').style.display = 'none'; document.getElementById('splashScreen').style.display = 'none'; document.getElementById('connectingScreen').style.display = 'none';
        showConnectionsHome();
    }
}

async function createLocalSession() {
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('connectingScreen').style.display = 'block';

    try {
        const sessionId = await window.pywebview.api.create_local_session();

        sessions[sessionId] = {
            id: sessionId,
            hostname: 'Local CMD',
            username: 'localhost',
            name: 'Local CMD',
            connected: true,
            isLocal: true
        };

        createTerminalForSession(sessionId, 'Local CMD');
        updateSessionsList();
        updateSessionTabs();
        switchToSession(sessionId);
        startOutputPolling(sessionId);

        const appNode = document.querySelector('.app');
        if (appNode) {
            appNode.classList.add('ssh-sidebar-collapsed');
        }
    } catch (error) {
        console.error('Local CMD Connection error:', error);
        alert(formatConnectionError(error));
        document.getElementById('splashScreen').style.display = 'none'; document.getElementById('splashScreen').style.display = 'none'; document.getElementById('connectingScreen').style.display = 'none';
        showConnectionsHome();
    }
}

function getSessionDisplayName(session) {
    if (!session) return 'SSH';
    return session.name || `${session.username}@${session.hostname}`;
}

function updateSessionTabs() {
    const tabsContainer = document.getElementById('tabsContainer');
    if (!tabsContainer) return;

    const sessionValues = Object.values(sessions);
    tabsContainer.innerHTML = '';
    
    if (sessionValues.length > 0) {
        tabsContainer.style.display = 'flex';
        
        // Add Home/Workbench Tab
        const homeTab = document.createElement('div');
        homeTab.className = 'session-tab home-tab' + (currentSessionId === null ? ' active' : '');
        homeTab.title = '主机工作台';
        homeTab.onclick = () => window.showWorkbench();
        homeTab.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" style="margin-right: 0;">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
        `;
        tabsContainer.appendChild(homeTab);
    } else {
        tabsContainer.style.display = 'none';
    }

    sessionValues.forEach(session => {
        const isActive = session.id === currentSessionId;
        const isConnected = session.connected !== false;
        const tab = document.createElement('div');
        tab.className = 'session-tab' + (isActive ? ' active' : '') + (!isConnected ? ' disconnected' : '');
        tab.title = getSessionDisplayName(session);
        tab.onclick = () => switchToSession(session.id);
        tab.oncontextmenu = (event) => {
            event.preventDefault();
            showSessionTabMenu(event, session.id);
        };
        tab.innerHTML = `
            <span class="tab-title">${escapeHtml(getSessionDisplayName(session))}</span>
            <button class="tab-close" type="button" title="关闭终端" onclick="closeSessionTab('${escapeJs(session.id)}'); event.stopPropagation();">×</button>
        `;
        tabsContainer.appendChild(tab);
    });
}

function showSessionTabMenu(event, sessionId) {
    const existing = document.getElementById('sessionTabMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'sessionTabMenu';
    menu.className = 'context-menu session-tab-menu';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.style.display = 'block';

    const session = sessions[sessionId];
    const canReconnect = session && session.connected === false;
    const canDisconnect = session && session.connected !== false;
    
    let splitMenuItem = '';
    if (isSplitMode) {
        splitMenuItem = `<div class="context-menu-item" data-action="unsplit">退出分屏</div>`;
    } else {
        splitMenuItem = `<div class="context-menu-item" data-action="split">垂直分屏 (右侧)</div>`;
    }

    menu.innerHTML = `
        <div class="context-menu-item ${canReconnect ? '' : 'disabled'}" data-action="reconnect">连接</div>
        <div class="context-menu-item ${canDisconnect ? '' : 'disabled'}" data-action="disconnect">断开连接</div>
        ${splitMenuItem}
        <div class="context-menu-item" data-action="close">关闭终端</div>
        <div class="context-menu-item" data-action="reconnectAll">连接全部</div>
        <div class="context-menu-item context-menu-delete" data-action="closeAll">关闭全部终端</div>
    `;

    menu.onclick = async (clickEvent) => {
        const action = clickEvent.target?.dataset?.action;
        if (!action) return;
        menu.remove();
        if (action === 'reconnect' && canReconnect) await reconnectSession(sessionId);
        if (action === 'disconnect' && canDisconnect) await disconnectSession(sessionId);
        if (action === 'close') await closeSessionTab(sessionId);
        if (action === 'reconnectAll') await reconnectAllSessions();
        if (action === 'closeAll') await closeAllSessions();
        if (action === 'unsplit') disableSplitScreen();
        if (action === 'split') {
            const otherActiveIds = Object.keys(sessions).filter(id => id !== sessionId && sessions[id].connected !== false);
            if (otherActiveIds.length > 0) {
                enableSplitScreen(sessionId, otherActiveIds[0]);
            } else {
                await cloneAndSplitSession(sessionId);
            }
        }
    };

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}

async function closeAllSessions() {
    const ids = Object.keys(sessions);
    for (const id of ids) {
        await closeSessionTab(id);
    }
}

async function reconnectAllSessions() {
    const disconnected = Object.values(sessions).filter(session => session.connected === false);
    for (const session of disconnected) {
        await reconnectSession(session.id);
    }
}

async function closeSessionTab(sessionId) {
    if (!sessions[sessionId]) return;

    try {
        if (sessions[sessionId].connected !== false) {
            await window.pywebview.api.disconnect(sessionId);
        }
    } catch (error) {
        console.error('关闭会话失败', error);
    }

    removeSession(sessionId);
}

function formatConnectionError(error) {
    const text = String(error || '未知错误');
    if (text.includes('Authentication failed')) {
        return `认证失败：${text}`;
    }
    if (text.includes('transport shut down') || text.includes('saw EOF')) {
        return `连接被服务器关闭：${text}`;
    }
    if (text.includes('Host key')) {
        return `主机密钥校验失败：${text}`;
    }
    if (text.includes('Network error')) {
        return `网络错误：${text}`;
    }
    return `连接失败：${text}`;
}

function createTerminalForSession(sessionId, hostname) {
    try {
        // Create a unique terminal container for this session
        const terminalWrapper = document.getElementById('terminalWrapper');
        const terminalElement = document.createElement('div');
        terminalElement.id = `terminal-${sessionId}`;
        terminalElement.style.position = 'absolute';
        terminalElement.style.top = '0';
        terminalElement.style.left = '0';
        terminalElement.style.right = '0';
        terminalElement.style.bottom = '0';
        terminalElement.style.display = 'none'; // Initially hidden
        terminalWrapper.appendChild(terminalElement);

        const terminal = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, Courier, monospace',
            fontWeight: 'normal',
            fontWeightBold: 'bold',
            theme: getTerminalTheme(),
            scrollback: TERMINAL_SCROLLBACK,
            convertEol: true,
            windowsMode: true,
            allowTransparency: true,
            allowProposedApi: true
        });

        // Create fit addon
        let terminalFitAddon = null;
        if (typeof FitAddon !== 'undefined') {
            terminalFitAddon = new FitAddon.FitAddon();
            terminal.loadAddon(terminalFitAddon);
        }

        // Create search addon
        let terminalSearchAddon = null;
        if (typeof SearchAddon !== 'undefined') {
            terminalSearchAddon = new SearchAddon.SearchAddon();
            terminal.loadAddon(terminalSearchAddon);
        }

        // WebGL addon enabled for 120 FPS high-performance text rendering
        if (typeof WebglAddon !== 'undefined') {
            try {
                const webglAddon = new WebglAddon.WebglAddon();
                webglAddon.onContextLoss(() => {
                    console.warn('WebGL context lost, falling back to Canvas renderer.');
                    webglAddon.dispose();
                });
                terminal.loadAddon(webglAddon);
            } catch (e) {
                console.warn('WebGL addon failed to load, falling back to default renderer.', e);
            }
        }

        // Open terminal
        terminal.open(terminalElement);

        // Register OSC 7 directory synchronization
        if (sessionId.startsWith('ssh_')) {
            try {
                terminal.parser.registerOscHandler(7, data => {
                    try {
                        if (currentSessionId !== sessionId) {
                            return true; // Skip background session path syncs to prevent tab conflicts
                        }
                        let path = null;
                        if (data.startsWith("file://")) {
                            let rawUrl = data.substring(7);
                            let firstSlash = rawUrl.indexOf('/');
                            if (firstSlash !== -1) {
                                path = rawUrl.substring(firstSlash);
                            } else {
                                path = "/";
                            }
                            try {
                                path = decodeURIComponent(path);
                            } catch(err) {}
                        }
                        if (path) {
                            if (/^\/[A-Za-z]:/.test(path)) {
                                path = path.substring(1);
                            }
                            if (path && typeof navigateToPath === 'function') {
                                if (path !== currentPath) {
                                    console.log(`[LdySSH OSC 7] Auto syncing folder to: ${path}`);
                                    navigateToPath(path);
                                }
                            }
                        }
                    } catch (e) {
                        console.error("OSC 7 path extraction error:", e);
                    }
                    return true;
                });
            } catch (e) {
                console.error("Failed to register OSC 7 handler:", e);
            }
        }

        // Set up copy/paste functionality
        setupTerminalClipboard(terminal, sessionId);

        // 点击终端容器，瞬间激活对应的分屏会话与高亮
        terminalElement.addEventListener('mousedown', () => {
            if (currentSessionId !== sessionId) {
                switchToSession(sessionId);
                updateSplitScreenHighlight();
            }
        });

        if (terminal.textarea) {
            terminal.textarea.addEventListener('focus', () => {
                if (currentSessionId !== sessionId) {
                    switchToSession(sessionId);
                    updateSplitScreenHighlight();
                }
            });
        }

        // Feature REMOVED: addTimestampToLine. 
        // This was a massive CPU drain during high-throughput output (like 'cat' large files) 
        // and caused the UI to lock up. Disabled for extreme performance.

        // Get container dimensions and calculate rows/cols
        const calculateTerminalSize = () => {
            const wrapper = document.getElementById('terminalWrapper');
            if (!wrapper) return;

            const rect = wrapper.getBoundingClientRect();
            const padding = 16; // Account for padding
            const availableHeight = rect.height - padding * 2;
            const availableWidth = rect.width - padding * 2;

            // Estimate character dimensions
            const charHeight = 17; // Approximate line height for 14px font
            const charWidth = 8; // Approximate char width

            const rows = Math.floor(availableHeight / charHeight);
            const cols = Math.floor(availableWidth / charWidth);

            // console.log(`Terminal size: ${cols}x${rows} (${availableWidth}x${availableHeight}px)`);

            // Manually resize terminal
            if (rows > 0 && cols > 0) {
                terminal.resize(cols, rows);
            }

            // Then try fit addon
            if (terminalFitAddon) {
                try {
                    terminalFitAddon.fit();
                } catch (e) {
                    console.error('Fit addon error:', e);
                }
            }
        };

        sessions[sessionId].calculateTerminalSize = calculateTerminalSize;

        // Calculate size after delays
        setTimeout(calculateTerminalSize, 50);
        setTimeout(calculateTerminalSize, 200);
        setTimeout(calculateTerminalSize, 500);

        // Ensure focus happens after DOM is fully ready and transitions are done
        setTimeout(() => {
            if (currentTerminal === terminal) {
                terminal.focus();
            }
        }, 100);

        // Handle input - ensure input goes to the correct session
        terminal.onData((data) => {
            if (currentSessionId !== sessionId) {
                switchToSession(sessionId);
                updateSplitScreenHighlight();
            }
            
            const state = getCommandInputState(sessionId);
            
            // --- Start Dangerous Command Interceptor ---
            // Only run on small data chunks to prevent OOM on massive log files (e.g. cat huge.log)
            if ((data.includes('\r') || data.includes('\n')) && data.length < 5000) {
                let cmd = '';
                // Extract the actual rendered line from the screen to catch commands retrieved via Up Arrow
                if (terminal.buffer && terminal.buffer.active) {
                    const bufferY = terminal.buffer.active.baseY + terminal.buffer.active.cursorY;
                    const lineObj = terminal.buffer.active.getLine(bufferY);
                    if (lineObj) {
                        cmd = lineObj.translateToString(true);
                    }
                }
                
                // Combine with keystroke buffer and incoming paste data for absolute safety
                const checkCmd = cmd + " " + ((state && state.buffer) ? state.buffer : "") + " " + data;
                
                if (checkCmd.length < 10000) {
                    let isDangerous = false;
                    const subCmds = checkCmd.split(/;|&&|\|\||\||\r|\n/);
                    for (let subCmd of subCmds) {
                        const tokens = subCmd.trim().split(/\s+/);
                        let rmFound = false;
                        let hasTarget = false;

                        for (let i = 0; i < tokens.length; i++) {
                            const token = tokens[i];
                            if (token === 'rm') rmFound = true;
                            else if (rmFound && (token === '*' || token === '/*' || token === '/')) {
                                hasTarget = true;
                            }
                        }
                        // Block rm targeting *, /*, or / 
                        if (rmFound && hasTarget) {
                            isDangerous = true;
                            break;
                        }
                    }
                    
                    if (isDangerous) {
                        terminal.write('\r\n\x1b[41;37;1m [拦截机制] 高危操作警告 \x1b[0m\r\n');
                        terminal.write(`\x1b[31mLdySSH 已阻止执行潜在的毁灭性命令。\x1b[0m\r\n`);
                        terminal.write('\x1b[33m系统提示: 请避免使用 rm -rf /* 或 rm -rf *，这可能导致整个系统或当前目录数据被永久删除且无法恢复。\x1b[0m\r\n');
                        
                        // Send Ctrl+C to cancel the prompt on the remote server
                        window.pywebview.api.send_input(sessionId, '\x03');
                        
                        // Reset local state
                        if (state) {
                            state.buffer = '';
                            state.suggestions = [];
                        }
                        hideCommandSuggestion();
                        return; // Stop processing to prevent the \r from executing the command
                    } else if (state && state.buffer && state.buffer.trim().length >= 2) {
                        saveCommandToHistory(state.buffer.trim());
                    }
                }
            }
            // --- End Dangerous Command Interceptor ---
            
            // If suggestion box is open, capture Up/Down/Enter/RightArrow
            if (commandSuggestIsVisible() && state && state.suggestions && state.suggestions.length > 0) {
                if (data === '\x1b[C' || data === '\t') {
                    // Right Arrow or Tab accepts suggestion
                    if (acceptCommandSuggestion(sessionId)) return;
                } else if (data === '\r' || data === '\n') {
                    // Enter accepts only if explicitly navigated
                    if (state.suggestionExplicitlySelected && acceptCommandSuggestion(sessionId)) {
                        window.pywebview.api.send_input(sessionId, '\r');
                        state.buffer = '';
                        return;
                    } else {
                        // Otherwise pass through to terminal
                        hideCommandSuggestion();
                        state.suggestions = [];
                        state.buffer = '';
                    }
                } else if (data === '\x1b[A') { // Up Arrow
                    state.suggestionIndex = Math.max(0, state.suggestionIndex - 1);
                    state.suggestionExplicitlySelected = true;
                    renderCommandSuggestion(sessionId);
                    return; // prevent history backward
                } else if (data === '\x1b[B') { // Down Arrow
                    state.suggestionIndex = Math.min(state.suggestions.length - 1, state.suggestionIndex + 1);
                    state.suggestionExplicitlySelected = true;
                    renderCommandSuggestion(sessionId);
                    return; // prevent history forward
                }
            } else {
                if (data === '\x1b[C' && acceptCommandSuggestion(sessionId)) {
                    return;
                }
            }

            updateCommandSuggestion(sessionId, data);

            if (isOptimisticChar(data)) {
                if (data.charCodeAt(0) === 127) {
                    const hasPendingChar = pendingEchoBuffer.some(e => e.char);
                    if (hasPendingChar) {
                        for (let i = pendingEchoBuffer.length - 1; i >= 0; i--) {
                            if (pendingEchoBuffer[i].char) {
                                pendingEchoBuffer.splice(i, 1);
                                break;
                            }
                        }
                        terminal.write('\b \b');
                    }
                } else {
                    terminal.write(data);
                    pendingEchoBuffer.push({ char: data, time: Date.now() });
                }
            }
            
            if (sessionId && sessions[sessionId]?.connected) {
                window.pywebview.api.send_input(sessionId, data).catch(console.error);
                // Extreme Responsiveness: Immediately trigger an output poll to instantly see the echoed character
                scheduleOutputPoll(sessionId, 0);
            }
        });

        // Handle resize
        terminal.onResize(async ({ cols, rows }) => {
            // console.log(`Terminal resized to ${cols}x${rows}`);
            await window.pywebview.api.resize_terminal(sessionId, cols, rows);
        });

        currentTerminal = terminal;
        sessions[sessionId] = {
            ...sessions[sessionId],
            terminal,
            terminalElement,
            fitAddon: terminalFitAddon,
            searchAddon: terminalSearchAddon,
            calculateSize: calculateTerminalSize
        };

        // Set up resize observer
        const resizeObserver = new ResizeObserver(() => {
            if (currentSessionId === sessionId) {
                calculateTerminalSize();
            }
        });

        const wrapper = document.getElementById('terminalWrapper');
        if (wrapper) {
            resizeObserver.observe(wrapper);
        }

        terminalElement.addEventListener('blur', hideCommandSuggestion);

    } catch (error) {
        console.error('Error creating terminal:', error);
        alert('Failed to create terminal: ' + error.message);
    }
}

function scheduleOutputPoll(sessionId, delay = OUTPUT_POLL_DELAY_MS) {
    if (outputPollingInterval) {
        clearTimeout(outputPollingInterval);
    }
    outputPollingInterval = setTimeout(() => pollSessionOutput(sessionId), delay);
}

async function pollSessionOutput(sessionId) {
    outputPollingInterval = null;
    if (currentSessionId !== sessionId || !sessions[sessionId] || sessions[sessionId].connected === false) {
        return;
    }

    let hasOutput = false;
    try {
        const result = JSON.parse(await window.pywebview.api.get_output(sessionId));
        hasOutput = Boolean(result.output);
        if (result.output) {
            console.log("[LdySSH Debug] base64 output: ", result.output);
            const rawBytes = base64ToBytes(result.output);
            console.log("[LdySSH Debug] rawBytes len: ", rawBytes.length);
            if (rawBytes.length > 0) {
                const sentinel = sessionId.startsWith('ssh_') ? getZmodemSentinel(sessionId) : null;
                
                if (activeZsession) {
                    try {
                        activeZsession.consume(Array.from(rawBytes));
                    } catch (zerr) {
                        console.warn("Zmodem session consume error:", zerr);
                    }
                } else if (sentinel) {
                    try {
                        sentinel.consume(Array.from(rawBytes));
                    } catch (zerr) {
                        console.warn("Zmodem sentinel consume error:", zerr);
                    }
                }

                // Normal terminal rendering - active only when not in Zmodem file transfer session
                if (!activeZsession && currentTerminal) {
                    const filtered = stripPredictedEchoes(bytesToUtf8(sessionId, rawBytes));
                    if (filtered.length > 0) {
                        if (filtered.length > 50000) {
                            currentTerminal.write(filtered);
                        } else {
                            currentTerminal.write(applyTerminalHighlights(filtered));
                        }
                        appendSessionOutputContext(sessionId, filtered);

                        // Adaptive Reflow: If the terminal was opened hidden and size collapsed to <= 5, trigger layout calculation
                        if (currentTerminal.cols <= 5 || currentTerminal.rows <= 5) {
                            console.log(`[LdySSH Fit] Collapsed layout detected (${currentTerminal.cols}x${currentTerminal.rows}). Refitting...`);
                            const session = sessions[sessionId];
                            if (session) {
                                if (typeof session.calculateTerminalSize === 'function') {
                                    session.calculateTerminalSize();
                                } else if (session.fitAddon) {
                                    try { session.fitAddon.fit(); } catch(e) {}
                                }
                            }
                        }
                        
                        // Real-time SFTP Sync from Terminal Screen Prompt (debounced to prevent main thread blocking)
                        triggerSftpSyncDebounced(sessionId);
                        
                        // Smart cd command detection fallback to sync SFTP when OSC 7 is not configured on remote host
                        if (sessionId.startsWith('ssh_') && filtered) {
                            const cdRegex = /(?:^|\r?\n|;)\s*cd\s+([^\r\n;&\s]+)/g;
                            let match;
                            while ((match = cdRegex.exec(filtered)) !== null) {
                                let target = match[1].trim();
                                target = target.replace(/^['"]|['"]$/g, '');
                                if (target) {
                                    let targetPath = '';
                                    if (target.startsWith('/')) {
                                        targetPath = target;
                                    } else if (target === '~') {
                                        targetPath = '/';
                                    } else if (target === '..') {
                                        const parts = currentPath.split('/').filter(Boolean);
                                        parts.pop();
                                        targetPath = '/' + parts.join('/');
                                    } else if (target === '.') {
                                        continue;
                                    } else {
                                        const base = currentPath.endsWith('/') ? currentPath : currentPath + '/';
                                        targetPath = base + target;
                                    }
                                    
                                    targetPath = targetPath.replace(/\/+/g, '/');
                                    if (targetPath.endsWith('/') && targetPath.length > 1) {
                                        targetPath = targetPath.slice(0, -1);
                                    }
                                    
                                    console.log("[LdySSH Sync] Sniffed 'cd' command to: " + targetPath);
                                    if (typeof navigateToPath === 'function') {
                                        setTimeout(() => {
                                            navigateToPath(targetPath);
                                        }, 400);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error polling output:', error);
        alert('Poll Error: ' + error.message + '\n' + error.stack);
    }

    if (hasOutput) {
        currentPollDelay = OUTPUT_POLL_DELAY_MS;
    } else {
        currentPollDelay = Math.min(MAX_POLL_DELAY_MS, currentPollDelay * 1.5);
    }
    
    // Only check status occasionally if there's no output to reduce IPC overhead
    const now = Date.now();
    if (hasOutput || now - lastStatusCheckTime > 2000) {
        try {
            const statusResult = JSON.parse(await window.pywebview.api.get_status(sessionId));
            if (statusResult.connected) {
                outputPollFailureCount = 0;
            } else {
                outputPollFailureCount += 1;
                if (outputPollFailureCount >= STATUS_FAILURE_LIMIT) {
                    handleSessionDisconnect(sessionId, false);
                    return;
                }
            }
            lastStatusCheckTime = now;
        } catch (error) {
            outputPollFailureCount += 1;
            console.error(`Error polling status (${outputPollFailureCount}/${STATUS_FAILURE_LIMIT}):`, error);
            if (outputPollFailureCount >= STATUS_FAILURE_LIMIT) {
                handleSessionDisconnect(sessionId, false);
                return;
            }
        }
    }

    scheduleOutputPoll(sessionId, currentPollDelay);
}

window.handlePushOutput = function(sessionId, base64Output) {
    if (!sessions[sessionId] || sessions[sessionId].connected === false) {
        return;
    }
    if (!base64Output) return;

    const rawBytes = base64ToBytes(base64Output);
    if (rawBytes.length > 0) {
        const sentinel = sessionId.startsWith('ssh_') ? getZmodemSentinel(sessionId) : null;
        if (activeZsession && currentSessionId === sessionId) {
            try {
                activeZsession.consume(Array.from(rawBytes));
            } catch (zerr) {
                console.warn("Zmodem session consume error:", zerr);
            }
        } else if (sentinel && currentSessionId === sessionId) {
            try {
                sentinel.consume(Array.from(rawBytes));
            } catch (zerr) {
                console.warn("Zmodem sentinel consume error:", zerr);
            }
        }

        const targetTerminal = sessions[sessionId].terminal;
        if (!activeZsession && targetTerminal) {
            const filtered = stripPredictedEchoes(bytesToUtf8(sessionId, rawBytes));
            if (filtered.length > 0) {
                if (filtered.length > 50000) {
                    targetTerminal.write(filtered);
                } else {
                    targetTerminal.write(applyTerminalHighlights(filtered));
                }
                appendSessionOutputContext(sessionId, filtered);

                if (targetTerminal.cols <= 5 || targetTerminal.rows <= 5) {
                    const session = sessions[sessionId];
                    if (session) {
                        if (typeof session.calculateTerminalSize === 'function') {
                            session.calculateTerminalSize();
                        } else if (session.fitAddon) {
                            try { session.fitAddon.fit(); } catch(e) {}
                        }
                    }
                }
                
                triggerSftpSyncDebounced(sessionId);
                
                if (sessionId.startsWith('ssh_') && filtered) {
                    const cdRegex = /(?:^|\r?\n|;)\s*cd\s+([^\r\n;&\s]+)/g;
                    let match;
                    while ((match = cdRegex.exec(filtered)) !== null) {
                        let target = match[1].trim();
                        target = target.replace(/^['"]|['"]$/g, '');
                        if (target) {
                            let targetPath = '';
                            if (target.startsWith('/')) {
                                targetPath = target;
                            } else if (target === '~') {
                                targetPath = '/';
                            } else if (target === '..') {
                                const parts = currentPath.split('/').filter(Boolean);
                                parts.pop();
                                targetPath = '/' + parts.join('/');
                            } else if (target === '.') {
                                continue;
                            } else {
                                const base = currentPath.endsWith('/') ? currentPath : currentPath + '/';
                                targetPath = base + target;
                            }
                            
                            targetPath = targetPath.replace(/\/+/g, '/');
                            if (targetPath.endsWith('/') && targetPath.length > 1) {
                                    targetPath = targetPath.slice(0, -1);
                            }
                            
                            console.log("[LdySSH Sync] Sniffed 'cd' command to: " + targetPath);
                            if (typeof navigateToPath === 'function') {
                                setTimeout(() => {
                                    navigateToPath(targetPath);
                                }, 400);
                            }
                        }
                    }
                }
            }
        }
    }
};

async function startOutputPolling(sessionId) {
    // Polling has been completely replaced by high-performance PostMessage push notifications (0% Idle CPU)
    return;
}

function handleSessionDisconnect(sessionId, wasLogout, promptReconnect = true) {
    if (!sessions[sessionId] || sessions[sessionId].disconnectHandled) {
        return;
    }
    sessions[sessionId].disconnectHandled = true;
    // console.log(`会话断开 ${sessionId}, logout: ${wasLogout}`);

    if (outputPollingInterval) {
        clearTimeout(outputPollingInterval);
        outputPollingInterval = null;
    }

    const message = wasLogout ?
        '\r\n\r\n[会话已结束 - 用户退出]\r\n' :
        '\r\n\r\n[连接已断开 - 可右键重新连接]\r\n';

    if (sessions[sessionId].terminal) {
        sessions[sessionId].terminal.write(message);
    }

    sessions[sessionId].connected = false;
    updateSessionsList();
    updateSessionTabs();

    if (currentSessionId === sessionId) {
        document.getElementById('statusBar').style.display = 'none';
        if (!promptReconnect) {
            return;
        }
        setTimeout(() => {
            if (sessions[sessionId] && !sessions[sessionId].connected) {
                if (confirm('连接已断开，是否重新连接？')) {
                    reconnectSession(sessionId);
                } else {
                    removeSession(sessionId);
                }
            }
        }, 1000);
    }
}

function removeSession(sessionId) {
    // console.log(`Removing session ${sessionId}`);

    if (sessions[sessionId]) {
        if (typeof hideCommandSuggestion === 'function') hideCommandSuggestion();
        
        const wasCurrent = currentSessionId === sessionId;
        
        if (wasCurrent) {
            clearSystemMonitorRefresh();
            if (outputPollingInterval) {
                clearTimeout(outputPollingInterval);
                outputPollingInterval = null;
            }
        }

        // Cleanup terminal
        if (sessions[sessionId].terminal) {
            sessions[sessionId].terminal.dispose();
            sessions[sessionId].terminal = null;
        }

        // Remove terminal element from DOM
        if (sessions[sessionId].terminalElement) {
            sessions[sessionId].terminalElement.remove();
            sessions[sessionId].terminalElement = null;
        }

        // Remove from sessions
        delete sessions[sessionId];
        updateSessionsList();
        updateSessionTabs();

        // If this was the current session, show welcome screen
        if (wasCurrent) {
            const nextSession = Object.values(sessions).find(session => session.connected !== false);
            if (nextSession) {
                switchToSession(nextSession.id);
            } else {
                currentSessionId = null;
                currentTerminal = null;
                document.getElementById('terminalWrapper').style.display = 'none';
                showConnectionsHome();
                document.getElementById('statusBar').style.display = 'none';
                updateSessionTabs();
            }
        }
    }
}

async function reconnectSession(oldSessionId) {
    const session = sessions[oldSessionId];
    if (!session) return;

    // console.log(`Reconnecting session ${oldSessionId}`);

    // Fill in connection details
    document.getElementById('hostname').value = session.hostname;
    document.getElementById('username').value = session.username;

    // Remove old session
    removeSession(oldSessionId);

    // Connect
    await connect();
}

window.showWorkbench = function() {
    // 回到主机工作台时，自动关闭右侧栏面板，释放被占用的屏幕空间，防止布局错乱
    closeToolPanel();

    const termContainer = document.querySelector('.terminal-container');
    if (termContainer) {
        termContainer.classList.add('in-workbench');
    }
    if (outputPollingInterval) {
        clearTimeout(outputPollingInterval);
        outputPollingInterval = null;
    }

    currentSessionId = null;
    if (typeof hideCommandSuggestion === 'function') hideCommandSuggestion();

    Object.keys(sessions).forEach(id => {
        if (sessions[id].terminalElement) {
            sessions[id].terminalElement.style.display = 'none';
        }
    });

    document.getElementById('welcomeScreen').style.display = 'block';
    document.getElementById('splashScreen').style.display = 'none'; document.getElementById('splashScreen').style.display = 'none'; document.getElementById('connectingScreen').style.display = 'none';
    document.getElementById('terminalWrapper').style.display = 'none';

    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        statusBar.style.display = 'none';
    }

    updateUIForCurrentSession();
    toggleWorkbenchActive(true);
};

function switchToSession(sessionId) {
    toggleWorkbenchActive(false);
    const termContainer = document.querySelector('.terminal-container');
    if (termContainer) {
        termContainer.classList.remove('in-workbench');
    }
    if (isSplitMode && sessionId !== splitLeftSessionId && sessionId !== splitRightSessionId) {
        disableSplitScreen();
    }

    // Stop current output polling if switching from another session
    if (outputPollingInterval) {
        clearTimeout(outputPollingInterval);
        outputPollingInterval = null;
    }

    const oldSessionId = currentSessionId;
    currentSessionId = sessionId;
    pendingEchoBuffer = [];
    if (typeof hideCommandSuggestion === 'function') hideCommandSuggestion();

    // Hide all terminal elements from previous sessions, respecting split mode visibility
    Object.keys(sessions).forEach(id => {
        if (sessions[id].terminalElement) {
            if (isSplitMode && (id === splitLeftSessionId || id === splitRightSessionId)) {
                sessions[id].terminalElement.style.display = 'block';
            } else {
                sessions[id].terminalElement.style.display = 'none';
            }
        }
    });

    // Hide all screens
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('splashScreen').style.display = 'none'; document.getElementById('splashScreen').style.display = 'none'; document.getElementById('connectingScreen').style.display = 'none';
    
    const wrapper = document.getElementById('terminalWrapper');
    if (wrapper) {
        wrapper.style.display = isSplitMode ? 'flex' : 'block';
    }

    // Show status bar
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        statusBar.style.display = sessions[sessionId].connected === false ? 'none' : 'flex';
    }
    const statusHost = document.getElementById('statusHost');
    if (statusHost) {
        statusHost.textContent = sessions[sessionId].hostname;
    }

    // Show and focus the correct terminal
    if (sessions[sessionId].terminal && sessions[sessionId].terminalElement) {
        currentTerminal = sessions[sessionId].terminal;

        // Show this terminal container
        sessions[sessionId].terminalElement.style.display = 'block';

        // Focus the terminal after a tiny delay to ensure the browser has rendered it visible
        setTimeout(() => {
            currentTerminal.focus();
        }, 50);

        // Force fit after switching
        setTimeout(() => {
            if (sessions[sessionId].fitAddon) {
                try {
                    sessions[sessionId].fitAddon.fit();
                    // console.log(`Terminal fitted for session ${sessionId}`);
                } catch (e) {
                    console.error('Error fitting terminal on switch:', e);
                }
            }
        }, 100);

        if (sessions[sessionId].connected !== false) {
            startOutputPolling(sessionId);
        }
    }

    updateSessionsList();
    updateSessionTabs();
}

function enableSplitScreen(leftId, rightId, direction = 'row') {
    if (!sessions[leftId] || !sessions[rightId]) return;
    
    isSplitMode = true;
    splitLeftSessionId = leftId;
    splitRightSessionId = rightId;
    
    const wrapper = document.getElementById('terminalWrapper');
    if (!wrapper) return;

    // 配置容器为 flex 弹性布局
    wrapper.style.position = 'relative';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = direction === 'row' ? 'row' : 'column';
    wrapper.style.gap = '8px';
    wrapper.style.padding = '4px';
    wrapper.style.boxSizing = 'border-box';
    
    // 遍历所有会话
    Object.keys(sessions).forEach(id => {
        const el = sessions[id].terminalElement;
        if (el) {
            if (id === leftId || id === rightId) {
                // 显示分屏元素，设为弹性占据
                el.style.display = 'block';
                el.style.position = 'relative';
                el.style.left = 'auto';
                el.style.top = 'auto';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                el.style.width = '100%';
                el.style.height = '100%';
                el.style.flex = '1';
                el.style.boxSizing = 'border-box';
                el.style.borderRadius = '6px';
                el.style.overflow = 'hidden';
                el.style.border = '1px solid rgba(255, 255, 255, 0.05)';
            } else {
                el.style.display = 'none';
            }
        }
    });
    
    document.getElementById('welcomeScreen').style.display = 'none';
    
    // 切换当前聚焦会话
    if (currentSessionId !== leftId && currentSessionId !== rightId) {
        currentSessionId = leftId;
    }
    
    updateSplitScreenHighlight();
    
    // 触发尺寸自适应
    setTimeout(() => {
        [leftId, rightId].forEach(id => {
            if (sessions[id]) {
                if (typeof sessions[id].calculateTerminalSize === 'function') {
                    sessions[id].calculateTerminalSize();
                } else if (sessions[id].fitAddon) {
                    try { sessions[id].fitAddon.fit(); } catch(e) {}
                }
            }
        });
    }, 150);
    
    updateSessionsList();
    updateSessionTabs();
    
    if (sessions[currentSessionId] && sessions[currentSessionId].terminal) {
        sessions[currentSessionId].terminal.focus();
    }
}

function disableSplitScreen() {
    isSplitMode = false;
    splitLeftSessionId = null;
    splitRightSessionId = null;
    
    const wrapper = document.getElementById('terminalWrapper');
    if (wrapper) {
        wrapper.style.display = 'block';
        wrapper.style.padding = '0';
    }
    
    // 恢复原来的绝对定位样式
    Object.keys(sessions).forEach(id => {
        const el = sessions[id].terminalElement;
        if (el) {
            el.style.position = 'absolute';
            el.style.left = '0';
            el.style.top = '0';
            el.style.right = '0';
            el.style.bottom = '0';
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.flex = 'none';
            el.style.border = 'none';
            el.classList.remove('active-split');
            
            if (id === currentSessionId) {
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
    });
    
    setTimeout(() => {
        if (currentSessionId && sessions[currentSessionId]) {
            if (typeof sessions[currentSessionId].calculateTerminalSize === 'function') {
                sessions[currentSessionId].calculateTerminalSize();
            } else if (sessions[currentSessionId].fitAddon) {
                try { sessions[currentSessionId].fitAddon.fit(); } catch(e) {}
            }
            if (sessions[currentSessionId].terminal) {
                sessions[currentSessionId].terminal.focus();
            }
        }
    }, 150);
    
    updateSessionsList();
    updateSessionTabs();
}

async function cloneAndSplitSession(sessionId) {
    const srcSession = sessions[sessionId];
    if (!srcSession) return;
    
    document.getElementById('welcomeScreen').style.display = 'none';
    const connectingScreen = document.getElementById('connectingScreen');
    connectingScreen.style.display = 'block';
    
    const textNode = connectingScreen.querySelector('div:last-child');
    const originalText = textNode ? textNode.textContent : '正在连接...';
    if (textNode) {
        textNode.textContent = '正在克隆会话并配置双分屏...';
    }
    
    try {
        if (srcSession.isLocal) {
            const newSessionId = await window.pywebview.api.create_local_session();
            sessions[newSessionId] = {
                id: newSessionId,
                hostname: 'Local CMD',
                username: 'localhost',
                name: 'Local CMD (2)',
                connected: true,
                isLocal: true
            };
            
            createTerminalForSession(newSessionId, 'Local CMD');
            startOutputPolling(newSessionId);
            enableSplitScreen(sessionId, newSessionId);
        } else {
            if (!srcSession.connectionParams) {
                alert('克隆失败：未找到原始连接的认证参数');
                connectingScreen.style.display = 'none';
                if (textNode) textNode.textContent = originalText;
                return;
            }
            
            const newParams = { ...srcSession.connectionParams };
            newParams.name = (newParams.name || 'SSH') + ' (分屏)';
            newParams.save = false;
            
            const newSessionId = await window.pywebview.api.create_session();
            const result = await connectWithHostVerification(newSessionId, newParams);
            
            if (result.success) {
                sessions[newSessionId] = {
                    id: newSessionId,
                    hostname: newParams.hostname,
                    username: newParams.username,
                    name: newParams.name,
                    connected: true,
                    connectionParams: newParams
                };
                
                createTerminalForSession(newSessionId, newParams.hostname);
                startOutputPolling(newSessionId);
                enableSplitScreen(sessionId, newSessionId);
            } else {
                alert('克隆分屏失败：' + (result.error || '未知连接错误'));
            }
        }
    } catch (error) {
        console.error('Error cloning session for split screen:', error);
        alert('克隆分屏发生异常：' + error.message);
    } finally {
        connectingScreen.style.display = 'none';
        if (textNode) textNode.textContent = originalText;
        
        const appNode = document.querySelector('.app');
        if (appNode) {
            appNode.classList.add('ssh-sidebar-collapsed');
        }
    }
}

let lastSessionsListFingerprint = '';
function updateSessionsList() {
    const sessionValues = Object.values(sessions);
    
    // Create a fingerprint of the current state: id + connected + isActive
    const fingerprint = sessionValues.map(s => `${s.id}:${s.connected}:${s.id === currentSessionId}`).join('|');
    if (fingerprint === lastSessionsListFingerprint) {
        return; // No changes, avoid DOM reflow
    }
    lastSessionsListFingerprint = fingerprint;

    const container = document.getElementById('sessionsList');
    container.innerHTML = '';

    if (sessionValues.length === 0) {
        container.innerHTML = '<div class="empty-message">暂无活动会话</div>';
        return;
    }

    document.getElementById('activeSessionsContent').classList.add('open');
    document.getElementById('activeSessionsChevron').classList.add('open');

    sessionValues.forEach(session => {
        const item = document.createElement('div');
        const isActive = session.id === currentSessionId;
        const isConnected = session.connected !== false;

        item.className = 'session-item' + (isActive ? ' active' : '') + (!isConnected ? ' disconnected' : '');
        item.innerHTML = `
            <div class="session-status" style="background: ${isConnected ? '#00ff88' : '#ff4444'}"></div>
            <div class="session-info">
                <div class="session-name">${escapeHtml(session.username)}@${escapeHtml(session.hostname)}</div>
                <div class="session-host">会话 ${escapeHtml(session.id.split('_')[1])} ${!isConnected ? '(已断开)' : ''}</div>
            </div>
            <div class="session-actions" style="opacity: 0; transition: opacity 0.2s ease;">
                ${isConnected ?
                    '<button class="action-btn" onclick="disconnectSession(\'' + escapeJs(session.id) + '\'); event.stopPropagation();">断开</button>' :
                    '<button class="action-btn" onclick="removeSession(\'' + escapeJs(session.id) + '\'); event.stopPropagation();">移除</button>'
                }
            </div>
        `;

        if (isConnected) {
            item.onclick = () => switchToSession(session.id);
        } else {
            item.onclick = () => {
                if (confirm('该会话已断开，是否重新连接？')) {
                    reconnectSession(session.id);
                }
            };
        }

        item.onmouseenter = () => {
            const actions = item.querySelector('.session-actions');
            if (actions) actions.style.opacity = '1';
        };
        item.onmouseleave = () => {
            const actions = item.querySelector('.session-actions');
            if (actions) actions.style.opacity = '0';
        };

        container.appendChild(item);
    });
}

async function disconnectSession(sessionId) {
    if (confirm('确定要断开这个会话吗？')) {
        // console.log(`断开会话 ${sessionId}`);

        try {
            await window.pywebview.api.disconnect(sessionId);
            handleSessionDisconnect(sessionId, true, false);
        } catch (error) {
            console.error('关闭会话失败', error);
        }
    }
}

async function initializeSystemMonitor() {
    // console.log('Initializing system monitor...');

    // Check if we have an active session
    if (!currentSessionId || !sessions[currentSessionId]) {
        document.getElementById('systemInfo').innerHTML = '<div class="error-message">当前没有活动会话，请先连接服务器。</div>';
        return;
    }

    // Load initial data
    await loadSystemMonitorData();

    clearSystemMonitorRefresh();

    systemMonitorInterval = setInterval(async () => {
        // Only update if monitor panel is still open and we have a session
        if (document.getElementById('monitorPanel').classList.contains('active') &&
            currentSessionId && sessions[currentSessionId]) {
            await loadSystemMonitorData();
        }
    }, 10000);
}

async function loadSystemMonitorData() {
    if (systemMonitorLoading) return;
    systemMonitorLoading = true;
    try {
        // console.log('姝ｅ湪鍔犺浇绯荤粺鐩戞帶鏁版嵁...');

        await loadSystemInfo();
        await loadSystemStats();
        await loadProcessList();
        await loadDiskUsage();
        await loadNetworkInfo();

        // console.log('System monitor data loaded successfully');

    } catch (error) {
        console.error('加载系统监控数据失败：', error);
    } finally {
        systemMonitorLoading = false;
    }
}

function clearSystemMonitorRefresh() {
    if (systemMonitorInterval) {
        clearInterval(systemMonitorInterval);
        systemMonitorInterval = null;
    }
}

function getMonitorErrorMessage(error) {
    if (error === 'unsupported_monitoring' || error === 'Unknown operating system') {
        return '当前环境不支持系统监控，或权限不足。';
    }
    return error || '无法获取监控信息。';
}

function renderMonitorError(containerId, error) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="error-message">${escapeHtml(getMonitorErrorMessage(error))}</div>`;
}

async function loadSystemInfo() {
    try {
        const response = await window.pywebview.api.get_system_info(currentSessionId);
        const result = JSON.parse(response);

        if (result.success) {
            systemMonitorData.systemInfo = result.info;
            displaySystemInfo(result.info);
        } else {
            systemMonitorData.systemInfo = null;
            renderMonitorError('systemInfo', result.error);
        }
    } catch (error) {
        console.error('加载系统信息失败：', error);
        systemMonitorData.systemInfo = null;
        renderMonitorError('systemInfo', error.message);
    }
}

async function loadSystemStats() {
    try {
        const response = await window.pywebview.api.get_system_stats(currentSessionId);
        const result = JSON.parse(response);

        if (result.success) {
            systemMonitorData.systemStats = result.stats;
            displaySystemStats(result.stats);
        } else {
            systemMonitorData.systemStats = null;
            renderMonitorError('systemStats', result.error);
        }
    } catch (error) {
        console.error('加载资源占用失败：', error);
        systemMonitorData.systemStats = null;
        renderMonitorError('systemStats', error.message);
    }
}

async function loadProcessList() {
    try {
        const response = await window.pywebview.api.get_process_list(currentSessionId);
        const result = JSON.parse(response);

        if (result.success) {
            systemMonitorData.processList = result.processes;
            displayProcessList(result.processes);
        } else {
            systemMonitorData.processList = null;
            renderMonitorError('processList', result.error);
        }
    } catch (error) {
        console.error('加载进程列表失败：', error);
        systemMonitorData.processList = null;
        renderMonitorError('processList', error.message);
    }
}

async function loadDiskUsage() {
    try {
        const response = await window.pywebview.api.get_disk_usage(currentSessionId);
        const result = JSON.parse(response);

        if (result.success) {
            systemMonitorData.diskUsage = result.disk_usage;
            displayDiskUsage(result.disk_usage);
        } else {
            systemMonitorData.diskUsage = null;
            renderMonitorError('diskUsage', result.error);
        }
    } catch (error) {
        console.error('加载磁盘使用失败：', error);
        systemMonitorData.diskUsage = null;
        renderMonitorError('diskUsage', error.message);
    }
}

async function loadNetworkInfo() {
    try {
        const response = await window.pywebview.api.get_network_info(currentSessionId);
        const result = JSON.parse(response);

        if (result.success) {
            systemMonitorData.networkInfo = result.network_info;
            displayNetworkInfo(result.network_info);
        } else {
            systemMonitorData.networkInfo = null;
            renderMonitorError('networkInfo', result.error);
        }
    } catch (error) {
        console.error('加载网络信息失败：', error);
        systemMonitorData.networkInfo = null;
        renderMonitorError('networkInfo', error.message);
    }
}

// Chart.js instances
let cpuChartInstance = null;
let memChartInstance = null;
const maxChartPoints = 20;
const chartTimeLabels = Array(maxChartPoints).fill('');

window.hideDragOverlay = function() {
    dragCounter = 0;
    if (dropZone) dropZone.classList.remove('active');
};

function initCharts() {
    try {
        if (!window.Chart) {
            document.getElementById('systemStats').innerHTML += '<div style="color:red;font-size:12px;">Chart.js not loaded.</div>';
            return;
        }
        Chart.defaults.color = 'rgba(0, 240, 255, 0.7)';
        Chart.defaults.font.family = "'Inter', sans-serif";

        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: {
                    min: 0, max: 100,
                    grid: { color: 'rgba(0, 240, 255, 0.1)' },
                    border: { dash: [5, 5] },
                    ticks: { stepSize: 25 }
                }
            },
            elements: {
                line: { tension: 0.4, borderWidth: 2 },
                point: { radius: 0 }
            }
        };

        if (!cpuChartInstance) {
            const ctxCpu = document.getElementById('cpuChart');
            if (ctxCpu) {
                cpuChartInstance = new Chart(ctxCpu, {
                    type: 'line',
                    data: {
                        labels: [...chartTimeLabels],
                        datasets: [{
                            label: 'CPU Usage (%)',
                            data: Array(maxChartPoints).fill(0),
                            borderColor: '#00f0ff',
                            backgroundColor: 'rgba(0, 240, 255, 0.1)',
                            fill: true
                        }]
                    },
                    options: { ...commonOptions, plugins: { title: { display: true, text: 'CPU Usage', color: '#00f0ff' }, legend: { display: false } } }
                });
            }
        }

    if (!memChartInstance) {
        const ctxMem = document.getElementById('memChart');
        if (ctxMem) {
            memChartInstance = new Chart(ctxMem, {
                type: 'line',
                data: {
                    labels: [...chartTimeLabels],
                    datasets: [{
                        label: 'RAM Usage (%)',
                        data: Array(maxChartPoints).fill(0),
                        borderColor: '#ff003c',
                        backgroundColor: 'rgba(255, 0, 60, 0.1)',
                        fill: true
                    }]
                },
                options: { ...commonOptions, plugins: { title: { display: true, text: 'Memory Usage', color: '#ff003c' }, legend: { display: false } } }
            });
        }
    }
    } catch (e) {
        document.getElementById('systemStats').innerHTML += `<div style="color:red;font-size:12px;">Chart Error: ${e.message}</div>`;
        console.error("Chart initialization error:", e);
    }
}

function updateChart(chart, newValue) {
    if (!chart) return;
    const data = chart.data.datasets[0].data;
    data.push(newValue);
    data.shift();
    chart.update();
}

function displaySystemStats(stats) {
    const container = document.getElementById('systemStats');

    if (stats.error) {
        renderMonitorError('systemStats', stats.error);
        return;
    }

    // Update charts
    initCharts();
    if (stats.cpu_usage) {
        const cpuVal = parseFloat(stats.cpu_usage.replace('%', ''));
        updateChart(cpuChartInstance, cpuVal);
    }
    if (stats.memory_usage) {
        const memVal = parseFloat(stats.memory_usage.replace('%', ''));
        updateChart(memChartInstance, memVal);
    }

    let html = '';

    function getBarColor(val) {
        if (val < 60) return '#10ac84'; // Green
        if (val < 85) return '#feca57'; // Yellow
        return '#ff4757'; // Red
    }

    if (stats.cpu_usage) {
        const cpuVal = parseFloat(stats.cpu_usage);
        const color = getBarColor(cpuVal);
        html += `
            <div class="stat-item">
                <div class="stat-header"><span>CPU 使用率</span><span style="color:${color}; text-shadow:0 0 5px ${color}">${escapeHtml(stats.cpu_usage)}</span></div>
                <div class="stat-bar-bg"><div class="stat-bar-fill" style="width: ${cpuVal}%; background-color: ${color}; color: ${color};"></div></div>
            </div>
        `;
    }

    if (stats.memory_usage) {
        const memVal = parseFloat(stats.memory_usage);
        const color = getBarColor(memVal);
        html += `
            <div class="stat-item">
                <div class="stat-header"><span>内存使用率</span><span style="color:${color}; text-shadow:0 0 5px ${color}">${escapeHtml(stats.memory_usage)}</span></div>
                <div class="stat-bar-bg"><div class="stat-bar-fill" style="width: ${memVal}%; background-color: ${color}; color: ${color};"></div></div>
            </div>
        `;
    }

    if (stats.swap_usage) {
        const swapVal = parseFloat(stats.swap_usage);
        const color = getBarColor(swapVal);
        html += `
            <div class="stat-item">
                <div class="stat-header"><span>Swap 使用率</span><span style="color:${color}; text-shadow:0 0 5px ${color}">${escapeHtml(stats.swap_usage)}</span></div>
                <div class="stat-bar-bg"><div class="stat-bar-fill" style="width: ${swapVal}%; background-color: ${color}; color: ${color};"></div></div>
            </div>
        `;
    }

    if (stats.disk_usage) {
        const diskVal = parseFloat(stats.disk_usage);
        const color = getBarColor(diskVal);
        html += `
            <div class="stat-item">
                <div class="stat-header"><span>磁盘使用率 (${escapeHtml(stats.disk_used || '')} / ${escapeHtml(stats.disk_total || '')})</span><span style="color:${color}; text-shadow:0 0 5px ${color}">${escapeHtml(stats.disk_usage)}</span></div>
                <div class="stat-bar-bg"><div class="stat-bar-fill" style="width: ${diskVal}%; background-color: ${color}; color: ${color};"></div></div>
            </div>
        `;
    }

    container.innerHTML = html || '<div class="loading-message">暂无资源数据</div>';
}

function displaySystemInfo(info) {
    const container = document.getElementById('systemInfo');

    if (info.error) {
        renderMonitorError('systemInfo', info.error);
        return;
    }

    let html = '';

    const fields = [
        { key: 'os_name', label: '操作系统' },
        { key: 'os_version', label: '系统版本' },
        { key: 'hostname', label: '主机名' },
        { key: 'architecture', label: '架构' },
        { key: 'cpu', label: 'CPU' },
        { key: 'total_memory', label: '总内存' },
        { key: 'uptime', label: '运行时间' }
    ];

    fields.forEach(field => {
        if (info[field.key]) {
            html += `
                <div class="info-item">
                    <div class="info-label">${field.label}</div>
                    <div class="info-value">${escapeHtml(String(info[field.key]))}</div>
                </div>
            `;
        }
    });

    container.innerHTML = html || '<div class="loading-message">暂无系统信息</div>';
}


function displayProcessList(processes) {
    const container = document.getElementById('processList');

    if (!processes || processes.length === 0) {
        container.innerHTML = '<div class="loading-message">暂无数据</div>';
        return;
    }

    if (processes[0] && processes[0].error) {
        renderMonitorError('processList', processes[0].error);
        return;
    }

    const isLinux = processes[0] && processes[0].cpu !== undefined;

    let html = '<div class="process-header">';
    html += '<div>进程</div>';
    html += '<div>PID</div>';
    html += '<div>CPU</div>';
    html += '<div>内存</div>';
    html += '</div>';

    processes.slice(0, 20).forEach(process => {
        html += `
            <div class="process-item">
                <div class="process-name">${escapeHtml(process.name || process.command || '')}</div>
                <div>${escapeHtml(String(process.pid || ''))}</div>
                <div>${escapeHtml(String(process.cpu || process.cpu_percent || ''))}</div>
                <div>${escapeHtml(String(process.memory || process.memory_percent || ''))}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function displayDiskUsage(disks) {
    const container = document.getElementById('diskUsage');

    if (!disks || disks.length === 0) {
        container.innerHTML = '<div class="loading-message">暂无数据</div>';
        return;
    }

    if (disks[0] && disks[0].error) {
        renderMonitorError('diskUsage', disks[0].error);
        return;
    }

    let html = '';

    disks.forEach(disk => {
        const usagePercent = parseFloat(disk.usage?.replace('%', '') || '0');
        const displayName = disk.device || disk.mount || '未知磁盘';

        html += `
            <div class="disk-item">
                <div class="disk-header">
                    <div class="disk-name">${escapeHtml(displayName)}</div>
                    <div class="disk-usage-percent">${escapeHtml(disk.usage || '0%')}</div>
                </div>
                <div class="disk-bar">
                    <div class="disk-bar-fill" style="width: ${Math.min(usagePercent, 100)}%"></div>
                </div>
                <div class="disk-details">
                    <span>已用 ${escapeHtml(disk.used || '0')}</span>
                    <span>可用 ${escapeHtml(disk.free || '0')}</span>
                    <span>总计 ${escapeHtml(disk.total || '0')}</span>
                </div>
                ${disk.mount ? `<div style="font-size: 11px; color: #666; margin-top: 4px;">挂载 ${escapeHtml(disk.mount)}</div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

function displayNetworkInfo(interfaces) {
    const container = document.getElementById('networkInfo');

    if (!interfaces || interfaces.length === 0) {
        container.innerHTML = '<div class="loading-message">暂无数据</div>';
        return;
    }

    if (interfaces[0] && interfaces[0].error) {
        renderMonitorError('networkInfo', interfaces[0].error);
        return;
    }

    let html = '';

    interfaces.forEach(iface => {
        html += `
            <div class="network-item">
                <div class="network-name">${escapeHtml(iface.name || iface.interface || '未知网卡')}</div>
                <div class="network-details">
                    <div class="network-detail"><span class="network-detail-label">IP</span><span class="network-detail-value">${escapeHtml(iface.ip || iface.address || '-')}</span></div>
                    <div class="network-detail"><span class="network-detail-label">状态</span><span class="network-detail-value">${escapeHtml(iface.status || '-')}</span></div>
                    <div class="network-detail"><span class="network-detail-label">流量</span><span class="network-detail-value">${escapeHtml(iface.traffic || '-')}</span></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function refreshSystemMonitor() {
    // console.log('刷新系统监控...');

    document.getElementById('systemInfo').innerHTML = '<div class="loading-message">正在加载...</div>';
    document.getElementById('systemStats').innerHTML = '<div class="loading-message">正在加载...</div>';
    document.getElementById('processList').innerHTML = '<div class="loading-message">正在加载...</div>';
    document.getElementById('diskUsage').innerHTML = '<div class="loading-message">正在加载...</div>';
    document.getElementById('networkInfo').innerHTML = '<div class="loading-message">正在加载...</div>';

    await loadSystemMonitorData();
}

async function createPortForward(type) {
    if (!currentSessionId || !sessions[currentSessionId]) {
        alert('请先连接服务器');
        return;
    }

    try {
        let result;

        if (type === 'local') {
            const localPort = parseInt(document.getElementById('localPort').value);
            const remoteHost = document.getElementById('remoteHost').value;
            const remotePort = parseInt(document.getElementById('remotePort').value);

            if (!localPort || !remoteHost || !remotePort) {
                alert('请完整填写转发信息');
                return;
            }

            if (localPort < 1 || localPort > 65535 || remotePort < 1 || remotePort > 65535) {
                alert('端口必须在 1 到 65535 之间');
                return;
            }

            result = await window.pywebview.api.create_local_port_forward(
                currentSessionId, localPort, remoteHost, remotePort
            );

            // Clear form on success
            if (JSON.parse(result).success) {
                document.getElementById('localPort').value = '';
                document.getElementById('remotePort').value = '';
            }

        } else if (type === 'remote') {
            const remotePort = parseInt(document.getElementById('remotePortR').value);
            const localHost = document.getElementById('localHost').value;
            const localPort = parseInt(document.getElementById('localPortR').value);

            if (!remotePort || !localHost || !localPort) {
                alert('请完整填写转发信息');
                return;
            }

            if (remotePort < 1 || remotePort > 65535 || localPort < 1 || localPort > 65535) {
                alert('端口必须在 1 到 65535 之间');
                return;
            }

            result = await window.pywebview.api.create_remote_port_forward(
                currentSessionId, remotePort, localHost, localPort
            );

            // Clear form on success
            if (JSON.parse(result).success) {
                document.getElementById('remotePortR').value = '';
                document.getElementById('localPortR').value = '';
            }

        } else if (type === 'dynamic') {
            const socksPort = parseInt(document.getElementById('socksPort').value);

            if (!socksPort) {
                alert('请输入 SOCKS 代理端口');
                return;
            }

            if (socksPort < 1 || socksPort > 65535) {
                alert('端口必须在 1 到 65535 之间');
                return;
            }

            result = await window.pywebview.api.create_dynamic_port_forward(
                currentSessionId, socksPort
            );

            // Clear form on success
            if (JSON.parse(result).success) {
                document.getElementById('socksPort').value = '';
            }
        }

        const response = JSON.parse(result);
        if (response.success) {
            // console.log(`Created ${type} port forward:`, response.forward_id);
            await refreshPortForwards();
        } else {
            alert(`创建端口转发失败：${response.error}`);
        }

    } catch (error) {
        console.error('创建端口转发失败:', error);
        alert('创建端口转发失败：' + error.message);
    }
}

async function stopPortForward(forwardId) {
    if (!currentSessionId || !sessions[currentSessionId]) {
        return;
    }

    try {
        const result = await window.pywebview.api.stop_port_forward(currentSessionId, forwardId);
        const response = JSON.parse(result);

        if (response.success) {
            // console.log('Stopped port forward:', forwardId);
            await refreshPortForwards();
        } else {
            alert('停止端口转发失败');
        }
    } catch (error) {
        console.error('创建端口转发失败:', error);
        alert('创建端口转发失败：' + error.message);
    }
}

async function refreshPortForwards() {
    if (!currentSessionId || !sessions[currentSessionId]) {
        document.getElementById('forwardsList').innerHTML = '<div class="loading-message">暂无数据</div>';
        return;
    }

    try {
        const result = await window.pywebview.api.list_port_forwards(currentSessionId);
        const response = JSON.parse(result);

        if (response.success) {
            displayPortForwards(response.forwards);
        } else {
            document.getElementById('forwardsList').innerHTML = '<div class="error-message">加载端口转发失败</div>';
        }
    } catch (error) {
        console.error('关闭会话失败', error);
        document.getElementById('forwardsList').innerHTML = '<div class="error-message">加载端口转发失败</div>';
    }
}

function displayPortForwards(forwards) {
    const forwardsList = document.getElementById('forwardsList');

    if (!forwards || forwards.length === 0) {
        forwardsList.innerHTML = '<div class="loading-message">暂无数据</div>';
        return;
    }

    const forwardsHtml = forwards.map(forward => {
        const typeClass = forward.type === 'local' ? 'local' : forward.type === 'remote' ? 'remote' : 'dynamic';
        const typeName = forward.type === 'local' ? '本地' : forward.type === 'remote' ? '远程' : '动态';
        const isActive = forward.active;
        const connections = forward.connections || 0;

        return `
            <div class="forward-item">
                <div class="forward-header">
                    <span class="forward-type ${typeClass}">${typeName}</span>
                    <button class="forward-delete" onclick="stopPortForward('${forward.id}')" title="删除">×</button>
                </div>
                <div class="forward-description">${escapeHtml(forward.description)}</div>
                <div class="forward-status">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div class="forward-status-indicator" style="background: ${isActive ? '#00ff88' : '#ff4444'};"></div>
                        <span>${isActive ? '\u8fd0\u884c\u4e2d' : '\u5df2\u505c\u6b62'}</span>
                    </div>
                    <span class="forward-connections">${connections} 个连接</span>
                </div>
            </div>
        `;
    }).join('');

    forwardsList.innerHTML = forwardsHtml;
}

let resizeTimeout;
window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentTerminal && sessions[currentSessionId]?.calculateSize) {
            sessions[currentSessionId].calculateSize();
        } else if (typeof fitAddon !== 'undefined' && fitAddon) {
            fitAddon.fit();
        }
    }, 150);
});

function resizeTerminalAfterLayout(delay = 180) {
    setTimeout(() => {
        if (sessions[currentSessionId]?.calculateSize) {
            sessions[currentSessionId].calculateSize();
        } else if (typeof fitAddon !== 'undefined' && fitAddon) {
            fitAddon.fit();
        }
    }, delay);
}

// --- OpenAI integrated sidebar panels ---

let aiSubWindowResizeInterval = null;

function updateAiSubWindowBounds() {
    const placeholder = document.getElementById('aiSubWindowPlaceholder');
    if (!placeholder || currentTool !== 'ai') return;

    const rect = placeholder.getBoundingClientRect();
    const dpi = window.devicePixelRatio || 1;
    
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = {
        left: Math.round(rect.left * dpi),
        top: Math.round(rect.top * dpi),
        width: Math.round(rect.width * dpi),
        height: Math.round(rect.height * dpi)
    };

    if (window.pywebview && window.pywebview.api && window.pywebview.api.resize_chatgpt_subwindow) {
        window.pywebview.api.resize_chatgpt_subwindow(JSON.stringify(bounds));
    }
}

function startSyncAiSubWindow() {
    if (aiSubWindowResizeInterval) clearInterval(aiSubWindowResizeInterval);

    const startTime = Date.now();
    aiSubWindowResizeInterval = setInterval(() => {
        updateAiSubWindowBounds();
        if (Date.now() - startTime > 350) {
            clearInterval(aiSubWindowResizeInterval);
            aiSubWindowResizeInterval = null;
        }
    }, 16);
}

window.addEventListener('resize', () => {
    if (currentTool === 'ai') {
        updateAiSubWindowBounds();
    }
});

// --- Right Sidebar Resizable drag logic ---

let isResizingSidebar = false;
let startSidebarWidth = 380;
let startMouseX = 0;

function initSidebarResizer() {
    const resizer = document.getElementById('sidebarResizer');
    const sidebar = document.getElementById('rightSidebar');
    if (!resizer || !sidebar) return;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizingSidebar = true;
        startSidebarWidth = sidebar.getBoundingClientRect().width;
        startMouseX = e.clientX;

        resizer.classList.add('dragging');
        sidebar.classList.add('no-transition');

        let dragOverlay = document.getElementById('sidebarDragOverlay');
        if (!dragOverlay) {
            dragOverlay = document.createElement('div');
            dragOverlay.id = 'sidebarDragOverlay';
            dragOverlay.style.position = 'fixed';
            dragOverlay.style.left = '0';
            dragOverlay.style.top = '0';
            dragOverlay.style.width = '100vw';
            dragOverlay.style.height = '100vh';
            dragOverlay.style.zIndex = '99999';
            dragOverlay.style.cursor = 'col-resize';
            dragOverlay.style.background = 'transparent';
            document.body.appendChild(dragOverlay);
        }
    });
}

window.addEventListener('mousemove', (e) => {
    if (!isResizingSidebar) return;

    const sidebar = document.getElementById('rightSidebar');
    if (!sidebar) return;

    const dx = startMouseX - e.clientX;
    let newWidth = startSidebarWidth + dx;

    const minWidth = 260;
    const maxWidth = Math.round(window.innerWidth * 0.8);
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    const widthStr = newWidth + 'px';
    sidebar.style.setProperty('--sidebar-width', widthStr);

    // 拖拽宽度时，动态更新当前激活工具所独享的宽度缓存
    if (currentTool && sidebarWidths[currentTool] !== undefined) {
        sidebarWidths[currentTool] = widthStr;
    }

    if (currentTool === 'ai') {
        updateAiSubWindowBounds();
    }
});

window.addEventListener('mouseup', () => {
    if (!isResizingSidebar) return;

    isResizingSidebar = false;

    const resizer = document.getElementById('sidebarResizer');
    const sidebar = document.getElementById('rightSidebar');
    if (resizer) resizer.classList.remove('dragging');
    if (sidebar) sidebar.classList.remove('no-transition');

    const dragOverlay = document.getElementById('sidebarDragOverlay');
    if (dragOverlay) dragOverlay.remove();

    if (sessions[currentSessionId]?.calculateSize) {
        sessions[currentSessionId].calculateSize();
    } else if (typeof fitAddon !== 'undefined' && fitAddon) {
        fitAddon.fit();
    }
});

// 在初始化中调用
initSidebarResizer();

// --- Workbench side panels ---
function setSshSidebarVisible(visible) {
    const app = document.querySelector('.app');
    const activity = document.getElementById('activitySsh');
    if (!app) return;

    app.classList.toggle('ssh-sidebar-collapsed', !visible);
    if (activity) {
        activity.classList.toggle('active', visible);
    }

    resizeTerminalAfterLayout(240);
}

function clearConnectionForm() {
    document.getElementById('connectionName').value = '';
    document.getElementById('hostname').value = '';
    document.getElementById('port').value = '22';
    document.getElementById('username').value = '';
    document.getElementById('authType').value = 'password';
    document.getElementById('password').value = '';
    document.getElementById('keyPath').value = '';
    document.getElementById('keyPassphrase').value = '';
    document.getElementById('saveConnection').checked = false;
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('keyGroup').style.display = 'none';

    // 重置堡垒机相关
    document.getElementById('jumpHost').value = '';
    document.getElementById('jumpPort').value = '22';
    document.getElementById('jumpUser').value = '';
    document.getElementById('jumpPass').value = '';
    document.getElementById('jumpKey').value = '';
    document.getElementById('jumpKeyPassphrase').value = '';
    document.getElementById('jumpHostFields').style.display = 'none';
    document.getElementById('jumpHostChevron').textContent = '▶';

    // 重置代理相关
    document.getElementById('proxyType').value = 'none';
    document.getElementById('proxyHost').value = '';
    document.getElementById('proxyPort').value = '1080';
    document.getElementById('proxyUser').value = '';
    document.getElementById('proxyPass').value = '';
    document.getElementById('proxyFields').style.display = 'none';
    document.getElementById('proxyChevron').textContent = '▶';
}

function openNewConnectionForm(focusField = 'hostname', clearForm = false) {
    setSshSidebarVisible(true);
    if (clearForm) clearConnectionForm();

    const content = document.getElementById('newConnectionContent');
    const chevron = document.getElementById('newConnectionChevron');
    content.classList.add('open');
    chevron.classList.add('open');

    setTimeout(() => {
        if (focusField === 'password') {
            document.getElementById('password').focus();
        } else {
            document.getElementById('hostname')?.focus();
        }
    }, 180);
}

function toggleSshSidebar() {
    const app = document.querySelector('.app');
    if (!app) return;

    const isCollapsed = app.classList.contains('ssh-sidebar-collapsed');
    if (isCollapsed) {
        openNewConnectionForm('hostname', true);
    } else {
        setSshSidebarVisible(false);
    }
}

function syncCommandActivity() {
    const app = document.querySelector('.app');
    const activity = document.getElementById('activityCommands');
    if (!app || !activity) return;

    activity.classList.toggle('active', !app.classList.contains('command-library-collapsed'));
}


// --- FinalShell-style command library ---
let commandLibraryFolders = [];
let activeCommandFolderIndex = 0;
let commandLibraryModalMode = 'command';
let commandLibraryPrefilledCommand = '';
let commandLibraryEditIndex = -1;
let commandLibraryHandleDragged = false;

function getDefaultCommandLibrary() {
    return [
        {
            name: '默认',
            commands: [
                { name: '列出文件', command: 'ls -la\n' },
                { name: '磁盘', command: 'df -h\n' },
                { name: '内存', command: 'free -m\n' },
                { name: '进程', command: 'ps aux --sort=-%cpu | head\n' }
            ]
        },
        {
            name: '服务',
            commands: [
                { name: '服务状态', command: 'systemctl status\n' },
                { name: '最近日志', command: 'journalctl -n 80 --no-pager\n' },
                { name: '监听端口', command: 'ss -tunlp\n' }
            ]
        },
        {
            name: 'ADB',
            commands: [
                { name: 'Logcat 错误', command: 'logcat *:E\n' },
                { name: '当前 Activity', command: 'dumpsys activity top\n' },
                { name: '包列表', command: 'pm list packages\n' }
            ]
        }
    ];
}

function hasCommandLibraryApi() {
    return Boolean(window.pywebview?.api?.get_command_library && window.pywebview?.api?.save_command_library);
}

async function loadCommandLibrary() {
    try {
        let parsed = null;
        if (hasCommandLibraryApi()) {
            const response = await window.pywebview.api.get_command_library();
            const result = JSON.parse(response);
            if (!result.success) {
                throw new Error(result.error || 'load failed');
            }
            parsed = result.folders;
        } else {
            const raw = localStorage.getItem('ldysshCommandLibrary') || localStorage.getItem('prismsshCommandLibrary');
            parsed = raw ? JSON.parse(raw) : null;
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
            commandLibraryFolders = parsed;
        } else {
            commandLibraryFolders = getDefaultCommandLibrary();
        }

        // Clean up legacy ADB commands with 'adb shell' or 'adb' prefix if present
        let migrationPerformed = false;
        commandLibraryFolders.forEach(folder => {
            if (folder.name === 'ADB' && Array.isArray(folder.commands)) {
                folder.commands.forEach(cmd => {
                    if (cmd.name === 'Logcat 错误' && (cmd.command.startsWith('adb ') || cmd.command.startsWith('adb.exe '))) {
                        cmd.command = 'logcat *:E\n';
                        migrationPerformed = true;
                    }
                    if (cmd.name === '当前 Activity' && cmd.command.startsWith('adb shell ')) {
                        cmd.command = 'dumpsys activity top\n';
                        migrationPerformed = true;
                    }
                    if (cmd.name === '包列表' && cmd.command.startsWith('adb shell ')) {
                        cmd.command = 'pm list packages\n';
                        migrationPerformed = true;
                    }
                });
            }
        });
        if (migrationPerformed) {
            saveCommandLibrary().catch(err => console.error('Failed to auto-save migrated command library:', err));
        }
    } catch (error) {
        console.error('加载保存连接失败', error);
        commandLibraryFolders = getDefaultCommandLibrary();
    }
}

async function saveCommandLibrary() {
    try {
        const payload = JSON.stringify(commandLibraryFolders);
        if (hasCommandLibraryApi()) {
            const response = await window.pywebview.api.save_command_library(payload);
            const result = JSON.parse(response);
            if (!result.success) {
                throw new Error(result.error || 'save failed');
            }
        } else {
            localStorage.setItem('ldysshCommandLibrary', payload);
            localStorage.setItem('prismsshCommandLibrary', payload);
        }
        return true;
    } catch (error) {
        console.error('加载保存连接失败', error);
        alert('命令库保存失败，请检查配置目录权限。');
        return false;
    }
}

function toggleCommandLibrary() {
    const app = document.querySelector('.app');
    if (!app) return;
    app.classList.toggle('command-library-collapsed');
    syncCommandActivity();
    resizeTerminalAfterLayout(120);
}

function renderCommandLibrary() {
    const tabs = document.getElementById('commandFolderTabs');
    const grid = document.getElementById('commandGrid');
    if (!tabs || !grid) return;

    if (!Array.isArray(commandLibraryFolders) || commandLibraryFolders.length === 0) {
        commandLibraryFolders = getDefaultCommandLibrary();
    }

    if (activeCommandFolderIndex >= commandLibraryFolders.length) {
        activeCommandFolderIndex = 0;
    }

    tabs.innerHTML = '';
    commandLibraryFolders.forEach((folder, index) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'command-folder-tab' + (index === activeCommandFolderIndex ? ' active' : '');
        tab.textContent = folder.name;
        tab.onclick = () => {
            activeCommandFolderIndex = index;
            renderCommandLibrary();
        };
        tab.oncontextmenu = (event) => {
            event.preventDefault();
            showSnippetContextMenu(event, 'folder', index);
        };
        tabs.appendChild(tab);
    });

    const activeFolder = commandLibraryFolders[activeCommandFolderIndex];
    const commands = activeFolder?.commands || [];
    grid.innerHTML = '';

    if (commands.length === 0) {
        grid.innerHTML = '<div class="command-empty">这个文件夹还没有命令。</div>';
        return;
    }

    commands.forEach((item, index) => {
        const isAuto = item.auto_execute !== false;
        
        // Detect parameters, e.g. [p#1 Parameter Name]
        const paramRegex = /\[p#(\d+)\s+([^\]]+)\]/;
        const hasParams = paramRegex.test(item.command);
        
        let clickTimeout = null;
        
        if (!hasParams) {
            // No parameters, render standard command button but with custom glow style
            const button = document.createElement('div');
            button.className = 'glow-btn';
            
            if (!isAuto) {
                button.title = item.command + ' (只输入不执行)';
            } else {
                button.title = item.command + ' (直接执行)';
            }
            
            const borderLeftStyle = !isAuto ? 'border-left: 3px solid var(--theme-secondary) !important;' : '';
            
            // Inner container with narrow padding, no gear icon
            button.innerHTML = `<div class="glow-btn-inner" style="${borderLeftStyle}">${escapeHtml(item.name)}</div>`;
            
            button.onclick = (event) => {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                clickTimeout = setTimeout(() => {
                    sendCommandLibraryCommand(item.command, isAuto);
                    clickTimeout = null;
                }, 250);
            };
            
            button.ondblclick = (event) => {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                event.stopPropagation();
                openCommandLibraryModal('edit-command', '', index);
            };
            
            button.oncontextmenu = (event) => {
                event.preventDefault();
                showSnippetContextMenu(event, 'command', index);
            };
            grid.appendChild(button);
        } else {
            // Contains parameters, render as custom glow-btn with compact inline layout
            const button = document.createElement('div');
            button.className = 'glow-btn';
            
            if (!isAuto) {
                button.title = item.command + ' (只输入不执行)';
            } else {
                button.title = item.command + ' (直接执行)';
            }
            
            const borderLeftStyle = !isAuto ? 'border-left: 3px solid var(--theme-secondary) !important;' : '';
            
            // Inner container with narrow padding and inline gear icon
            button.innerHTML = `<div class="glow-btn-inner" style="${borderLeftStyle}">${escapeHtml(item.name)}<span style="font-size: 9px; color: var(--theme-primary, #38bdf8); margin-left: 2px;">⚙️</span></div>`;
            
            button.onclick = (event) => {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                clickTimeout = setTimeout(() => {
                    toggleDynamicConsole(event, index);
                    clickTimeout = null;
                }, 250);
            };
            
            button.ondblclick = (event) => {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                event.stopPropagation();
                openCommandLibraryModal('edit-command', '', index);
            };
            
            button.oncontextmenu = (event) => {
                event.preventDefault();
                showSnippetContextMenu(event, 'command', index);
            };
            grid.appendChild(button);
        }
    });
}

function sendCommandLibraryCommand(command, autoExecute = true) {
    if (!currentSessionId || !sessions[currentSessionId]) {
        alert('请先连接服务器。');
        return;
    }
    
    // Detect placeholders like [p#1 Parameter Name]
    const paramRegex = /\[p#(\d+)\s+([^\]]+)\]/;
    if (paramRegex.test(command)) {
        const activeFolder = commandLibraryFolders[activeCommandFolderIndex];
        const commands = activeFolder?.commands || [];
        const index = commands.findIndex(c => c.command === command);
        if (index !== -1) {
            toggleDynamicConsole(null, index);
            return;
        }
    }
    
    const finalCommand = autoExecute ? (command.endsWith('\n') ? command : `${command}\n`) : (command.endsWith('\n') ? command.slice(0, -1) : command);
    window.pywebview.api.send_input(currentSessionId, finalCommand);
}

function addCommandFolder() {
    openCommandLibraryModal('folder');
}

function addCommandToLibrary(prefilledCommand = '') {
    openCommandLibraryModal('command', prefilledCommand);
}

function openCommandLibraryModal(mode, prefilledCommand = '', editIndex = -1) {
    if (!Array.isArray(commandLibraryFolders) || commandLibraryFolders.length === 0) {
        commandLibraryFolders = getDefaultCommandLibrary();
        activeCommandFolderIndex = 0;
    }

    commandLibraryModalMode = mode;
    commandLibraryEditIndex = editIndex;
    commandLibraryPrefilledCommand = prefilledCommand || '';

    const modal = document.getElementById('commandLibraryModal');
    const title = document.getElementById('commandLibraryModalTitle');
    const nameInput = document.getElementById('commandLibraryNameInput');
    const commandLabel = document.getElementById('commandLibraryCommandLabel');
    const commandInput = document.getElementById('commandLibraryCommandInput');
    if (!modal || !title || !nameInput || !commandLabel || !commandInput) return;

    const deleteBtn = document.getElementById('commandLibraryModalDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = (mode.startsWith('edit-')) ? 'block' : 'none';

    if (mode === 'edit-folder') {
        title.textContent = '编辑文件夹';
        nameInput.value = commandLibraryFolders[editIndex].name;
        commandInput.value = '';
        nameInput.placeholder = '文件夹名称';
    } else if (mode === 'edit-command') {
        title.textContent = '编辑命令';
        const item = commandLibraryFolders[activeCommandFolderIndex].commands[editIndex];
        nameInput.value = item.name;
        commandInput.value = item.command;
        nameInput.placeholder = '命令名称';
    } else {
        title.textContent = mode === 'folder' ? '新建文件夹' : '添加命令';
        nameInput.value = '';
        nameInput.placeholder = mode === 'folder' ? '例如：服务器巡检' : '例如：查看磁盘';
        commandInput.value = commandLibraryPrefilledCommand || 'ls -la';
    }
    const isFolder = commandLibraryModalMode === 'folder' || commandLibraryModalMode === 'edit-folder';
    commandLabel.style.display = isFolder ? 'none' : 'block';
    commandInput.style.display = isFolder ? 'none' : 'block';
    
    modal.style.display = 'flex';
    setTimeout(() => nameInput.focus(), 30);
}

function closeCommandLibraryModal() {
    const modal = document.getElementById('commandLibraryModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function confirmCommandLibraryModal() {
    const nameInput = document.getElementById('commandLibraryNameInput');
    const commandInput = document.getElementById('commandLibraryCommandInput');
    if (!nameInput || !commandInput) return;

    if (!Array.isArray(commandLibraryFolders) || commandLibraryFolders.length === 0) {
        commandLibraryFolders = getDefaultCommandLibrary();
        activeCommandFolderIndex = 0;
    }

    if (!commandLibraryFolders[activeCommandFolderIndex]) {
        activeCommandFolderIndex = 0;
    }

    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        return;
    }

    const command = commandInput.value.trim();
    
    
    let normalizedCommand = '';
    if (command) {
        normalizedCommand = command.endsWith('\\n') ? command : `${command}\\n`;
    }

    if (commandLibraryModalMode === 'folder') {
        commandLibraryFolders.push({ name, commands: [] });
        activeCommandFolderIndex = commandLibraryFolders.length - 1;
    } else if (commandLibraryModalMode === 'edit-folder') {
        commandLibraryFolders[commandLibraryEditIndex].name = name;
    } else if (commandLibraryModalMode === 'edit-command') {
        if (!command) { commandInput.focus(); return; }
        commandLibraryFolders[activeCommandFolderIndex].commands[commandLibraryEditIndex].name = name;
        commandLibraryFolders[activeCommandFolderIndex].commands[commandLibraryEditIndex].command = normalizedCommand;
        
    } else {
        if (!command) { commandInput.focus(); return; }
        commandLibraryFolders[activeCommandFolderIndex].commands.push({ name, command: normalizedCommand });
    }

    if (!(await saveCommandLibrary())) return;
    renderCommandLibrary();
    closeCommandLibraryModal();
}

async function initCommandLibrary() {
    await loadCommandLibrary();
    renderCommandLibrary();
    const app = document.querySelector('.app');
    if (app && !app.classList.contains('command-library-collapsed')) {
        app.classList.add('command-library-collapsed');
    }
    initCommandLibraryResize();
    initCommandLibraryModal();
    syncCommandActivity();
}

function initCommandLibraryModal() {
    const modal = document.getElementById('commandLibraryModal');
    const nameInput = document.getElementById('commandLibraryNameInput');
    if (!modal || !nameInput || modal.dataset.bound === 'true') return;

    modal.dataset.bound = 'true';
    nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmCommandLibraryModal();
        }
    });
}

function initCommandLibraryResize() {
    const handle = document.getElementById('commandLibraryHandle');
    const app = document.querySelector('.app');
    if (!handle || !app || handle.dataset.bound === 'true') return;

    const savedHeight = 200; // Forced reset 
      // Number(localStorage.getItem('prismsshCommandLibraryHeightV2'));
    if (savedHeight >= 200 && savedHeight <= 680) {
        app.style.setProperty('--command-library-height', `${savedHeight}px`);
    }

    const beginResize = (event, moveEventName, upEventName) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        document.body.classList.add('command-library-resizing');
        commandLibraryHandleDragged = false;
        const startY = event.clientY;
        const panel = document.getElementById('commandLibraryPanel');
        const startHeight = panel ? panel.getBoundingClientRect().height : 200;

        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientY - startY) < 4) return;
            commandLibraryHandleDragged = true;
            if (app.classList.contains('command-library-collapsed')) {
                app.classList.remove('command-library-collapsed');
                syncCommandActivity();
            }
            const nextHeight = Math.max(200, Math.min(680, startHeight + startY - moveEvent.clientY));
            app.style.setProperty('--command-library-height', `${nextHeight}px`);
            resizeTerminalAfterLayout(20);
        };

        const onUp = () => {
            document.removeEventListener(moveEventName, onMove);
            document.removeEventListener(upEventName, onUp);
            document.body.classList.remove('command-library-resizing');
            const currentHeight = parseInt(
                getComputedStyle(app).getPropertyValue('--command-library-height'),
                10
            );
            if (currentHeight) {
                localStorage.setItem('ldysshCommandLibraryHeightV2', String(currentHeight));
                localStorage.setItem('prismsshCommandLibraryHeightV2', String(currentHeight));
            }
        };

        document.addEventListener(moveEventName, onMove);
        document.addEventListener(upEventName, onUp);
    };

    handle.dataset.bound = 'true';
    handle.addEventListener('mousedown', (event) => {
        beginResize(event, 'mousemove', 'mouseup');
    });
    handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse') {
            beginResize(event, 'pointermove', 'pointerup');
        }
    });

    handle.addEventListener('click', (event) => {
        event.preventDefault();
        
        commandLibraryHandleDragged = false;
    });
    handle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleCommandLibrary();
        }
    });
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initCommandLibrary();
} else {
    document.addEventListener('DOMContentLoaded', initCommandLibrary);
}

// --- Frameless Window Controls ---
function windowMinimize() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.window_minimize();
    }
}

function windowMaximize() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.window_toggle_maximize();
    }
}

function windowClose() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.window_close();
    }
}

// --- THEMES ENGINE ---
function changeTheme(themeName) {
    if (themeName === 'cyberpunk') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
    localStorage.setItem('prism_theme', themeName);
    
    // Update terminal theme colors if active
    if (currentTerminal && currentTerminal._core) {
        updateTerminalTheme(themeName);
    }
}

function updateTerminalTheme(themeName) {
    const themes = {
        cyberpunk: { background: '#0a0a0a', foreground: '#e0e0e0', cursor: '#00d4ff', selectionBackground: 'rgba(0, 212, 255, 0.6)' },
        matrix: { background: '#020202', foreground: '#00ff41', cursor: '#00ff41', selectionBackground: 'rgba(0, 255, 65, 0.6)' },
        dracula: { background: '#282a36', foreground: '#f8f8f2', cursor: '#ff79c6', selectionBackground: 'rgba(189, 147, 249, 0.6)' },
        solarized: { background: '#002b36', foreground: '#839496', cursor: '#2aa198', selectionBackground: 'rgba(38, 139, 210, 0.6)' }
    };
    const t = themes[themeName] || themes['cyberpunk'];
    currentTerminal.options.theme = {
        ...currentTerminal.options.theme,
        background: t.background,
        foreground: t.foreground,
        cursor: t.cursor,
        selectionBackground: t.selectionBackground
    };
}

// Load theme on startup
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('prism_theme') || 'cyberpunk';
    const selector = document.getElementById('themeSelector');
    if (selector) selector.value = savedTheme;
    changeTheme(savedTheme);
});

async function deleteCommandLibraryModal() {
    if (commandLibraryModalMode === 'edit-folder') {
        if (commandLibraryFolders.length <= 1) {
            alert('至少保留一个文件夹。');
            return;
        }
        if (confirm(`确定要删除文件夹 "${commandLibraryFolders[commandLibraryEditIndex].name}" 以及里面所有命令吗？`)) {
            commandLibraryFolders.splice(commandLibraryEditIndex, 1);
            activeCommandFolderIndex = Math.max(0, activeCommandFolderIndex - 1);
            if (await saveCommandLibrary()) {
                renderCommandLibrary();
                closeCommandLibraryModal();
            }
        }
    } else if (commandLibraryModalMode === 'edit-command') {
        const item = commandLibraryFolders[activeCommandFolderIndex].commands[commandLibraryEditIndex];
        if (confirm(`确定要删除命令 "${item.name}" 吗？`)) {
            commandLibraryFolders[activeCommandFolderIndex].commands.splice(commandLibraryEditIndex, 1);
            if (await saveCommandLibrary()) {
                renderCommandLibrary();
                closeCommandLibraryModal();
            }
        }
    }
}

let currentSnippetContextIndex = -1;
let currentSnippetContextType = '';

function showSnippetContextMenu(event, type, index) {
    const pasteBtn = document.getElementById('snippetCtxPaste');
    if (pasteBtn) pasteBtn.style.display = type === 'command' ? 'block' : 'none';
    event.preventDefault();
    currentSnippetContextType = type;
    currentSnippetContextIndex = index;
    const menu = document.getElementById('snippetContextMenu');
    menu.style.display = 'block';
    
    let x = event.clientX;
    let y = event.clientY;
    if (x + menu.offsetWidth > window.innerWidth) x -= menu.offsetWidth;
    if (y + menu.offsetHeight > window.innerHeight) y -= menu.offsetHeight;
    
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function handleSnippetContextEdit() {
    document.getElementById('snippetContextMenu').style.display = 'none';
    openCommandLibraryModal('edit-' + currentSnippetContextType, '', currentSnippetContextIndex);
}

function handleSnippetContextDelete() {
    document.getElementById('snippetContextMenu').style.display = 'none';
    commandLibraryModalMode = 'edit-' + currentSnippetContextType;
    commandLibraryEditIndex = currentSnippetContextIndex;
    deleteCommandLibraryModal();
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('snippetContextMenu');
    if (menu && e.target.closest('#snippetContextMenu') === null) {
        menu.style.display = 'none';
    }
});

function handleSnippetContextPaste() {
    document.getElementById('snippetContextMenu').style.display = 'none';
    if (currentSnippetContextType === 'command') {
        const item = commandLibraryFolders[activeCommandFolderIndex].commands[currentSnippetContextIndex];
        let rawCmd = item.command;
        if (rawCmd.endsWith('\n')) rawCmd = rawCmd.slice(0, -1);
        sendCommandLibraryCommand(rawCmd, false);
    }
}

// --- Port Forwarding Logic ---

function showToast(msg, type='info') {
    const container = document.getElementById('toastContainer');
    if (!container) return alert(msg); // Fallback if container is missing

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content" style="flex:1;">${escapeHtml(msg)}</div>
        <div class="toast-close" style="cursor:pointer; opacity:0.6; padding: 4px;" onclick="this.parentElement.classList.replace('show', 'hide'); setTimeout(() => this.parentElement.remove(), 300);">&times;</div>
    `;
    
    container.appendChild(toast);

    // Trigger reflow to ensure animation runs
    void toast.offsetWidth;
    toast.classList.add('show');

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.replace('show', 'hide');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }
    }, 3000);
}

function selectForwardType(type) {
    document.querySelectorAll('.forward-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.forward-form').forEach(f => f.style.display = 'none');
    
    document.getElementById(`${type}Tab`).classList.add('active');
    document.getElementById(`${type}Forward`).style.display = 'block';
}

async function createPortForward(type) {
    if (!currentSessionId) {
        showToast('请先连接一个会话', 'error');
        return;
    }

    try {
        let resultStr;
        if (type === 'local') {
            const localPort = parseInt(document.getElementById('localPort').value);
            const remoteHost = document.getElementById('remoteHost').value;
            const remotePort = parseInt(document.getElementById('remotePort').value);
            if (!localPort || !remoteHost || !remotePort) return showToast('请填写所有必要字段', 'error');
            
            resultStr = await window.pywebview.api.create_local_port_forward(currentSessionId, localPort, remoteHost, remotePort);
            
        } else if (type === 'remote') {
            const remotePortR = parseInt(document.getElementById('remotePortR').value);
            const localHost = document.getElementById('localHost').value;
            const localPortR = parseInt(document.getElementById('localPortR').value);
            if (!remotePortR || !localHost || !localPortR) return showToast('请填写所有必要字段', 'error');
            
            resultStr = await window.pywebview.api.create_remote_port_forward(currentSessionId, remotePortR, localHost, localPortR);
            
        } else if (type === 'dynamic') {
            const socksPort = parseInt(document.getElementById('socksPort').value);
            if (!socksPort) return showToast('请填写所有必要字段', 'error');
            
            resultStr = await window.pywebview.api.create_dynamic_port_forward(currentSessionId, socksPort);
        }

        const result = JSON.parse(resultStr);
        if (result.success) {
            showToast('端口转发创建成功', 'success');
            document.querySelectorAll('.forward-form input').forEach(i => i.value = '');
            refreshPortForwards();
        } else {
            showToast('创建失败', 'error');
        }
    } catch (e) {
        showToast('创建异常: ' + e.message, 'error');
    }
}

async function refreshPortForwards() {
    if (!currentSessionId) return;
    const list = document.getElementById('forwardsList');
    
    try {
        const resultStr = await window.pywebview.api.list_port_forwards(currentSessionId);
        const result = JSON.parse(resultStr);
        
        if (result.success && result.forwards) {
            list.innerHTML = '';
            if (result.forwards.length === 0) {
                list.innerHTML = '<div style="text-align:center; color:#888; padding: 20px;">暂无数据</div>';
                return;
            }
            
            result.forwards.forEach(fw => {
                const item = document.createElement('div');
                item.className = 'forward-item' + (fw.active ? ' active' : '');
                item.style.padding = '10px';
                item.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';
                item.style.fontSize = '12px';
                
                const statusColor = fw.active ? '#00e0ff' : '#ff5555';
                
                item.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="color:#ddd;">${escapeHtml(fw.description)}</span>
                        <span style="color:#888; font-size:11px;">
                            类型: ${escapeHtml(fw.type.toUpperCase())} | 
                            <span style="color:${statusColor}">${fw.active ? '运行中' : '已停止'}</span> | 
                            连接数: ${fw.connections}
                        </span>
                    </div>
                    <button class="action-btn" style="color:#ff5555" onclick="stopPortForward('${escapeJs(fw.id)}')">停止</button>
                `;
                list.appendChild(item);
            });
        }
    } catch (e) {
        console.error('获取端口转发列表失败:', e);
    }
}

async function stopPortForward(forwardId) {
    if (!currentSessionId || !confirm('确认停止此端口转发吗？')) return;
    try {
        const resultStr = await window.pywebview.api.stop_port_forward(currentSessionId, forwardId);
        const result = JSON.parse(resultStr);
        if (result.success) {
            showToast('已停止端口转发', 'success');
            refreshPortForwards();
        } else {
            showToast('停止失败', 'error');
        }
    } catch (e) {
        showToast('异常: ' + e.message, 'error');
    }
}

// Set up drag and drop for file browser area
document.addEventListener('DOMContentLoaded', () => {
    const fileListContainer = document.getElementById('fileListContainer');
    const uploadArea = document.getElementById('uploadArea');
    
    if (fileListContainer) {
        fileListContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (uploadArea) uploadArea.classList.add('dragover');
            fileListContainer.style.boxShadow = 'inset 0 0 20px rgba(var(--theme-primary), 0.2)';
        });
        
        fileListContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!e.relatedTarget || !fileListContainer.contains(e.relatedTarget)) {
                if (uploadArea) uploadArea.classList.remove('dragover');
                fileListContainer.style.boxShadow = '';
            }
        });
        
        fileListContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            if (uploadArea) uploadArea.classList.remove('dragover');
            fileListContainer.style.boxShadow = '';
            
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                uploadFiles(Array.from(e.dataTransfer.files));
            }
        });
    }
});



window.terminalContextMenuAction = function(action) {
    const menu = document.getElementById('terminalContextMenu');
    if (menu) menu.style.display = 'none';
    
    if (action === 'copy') {
        if (currentTerminal) {
            const selection = currentTerminal.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection);
                showToast('已复制到剪贴板', 'success');
            } else {
                showToast('没有选中文本', 'info');
            }
        }
    } else if (action === 'paste') {
        navigator.clipboard.readText().then(text => {
            if (text && currentSessionId) {
                window.pywebview.api.send_input(currentSessionId, text);
            }
        }).catch(err => {
            showToast('无法读取剪贴板', 'error');
        });
    } else if (action === 'clear') {
        if (currentTerminal) {
            currentTerminal.clear();
        }
    }
};

document.addEventListener('click', function(e) {
    const termMenu = document.getElementById('terminalContextMenu');
    if (termMenu && e.target.closest('#terminalContextMenu') === null) {
        termMenu.style.display = 'none';
    }
});

// SFTP Drag & Drop Logic
document.addEventListener('DOMContentLoaded', () => {
    const fileListContainer = document.getElementById('fileListContainer');
    const overlay = document.getElementById('sftpDragOverlay');
    if (!fileListContainer || !overlay) return;

    fileListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.add('active');
    });

    fileListContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.relatedTarget && fileListContainer.contains(e.relatedTarget)) {
            return; // Ignore internal element transitions
        }
        overlay.classList.remove('active');
    });

    fileListContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.remove('active');
        
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect({ target: { files: e.dataTransfer.files } });
        }
    });
});

// --- Terminal Inline Search ---
function openTerminalSearch() {
    const ui = document.getElementById('terminalSearchUI');
    if (ui) {
        ui.style.display = 'flex';
        const input = document.getElementById('terminalSearchInput');
        if (input) {
            input.focus();
            input.select();
        }
    }
}
function closeTerminalSearch() {
    const ui = document.getElementById('terminalSearchUI');
    if (ui) ui.style.display = 'none';
    const session = sessions[currentSessionId];
    if (session && session.searchAddon) {
        session.searchAddon.clearDecorations();
    }
    if (session && session.terminal) {
        session.terminal.focus();
    }
}
function handleTerminalSearch(e) {
    const session = sessions[currentSessionId];
    if (!session || !session.searchAddon) return;
    
    if (e.key === 'Enter') {
        e.preventDefault(); // Stop any default browser behaviors
        const term = e.target.value;
        if (!term || term.length > 100) return; // Prevent infinite loop on empty string or OOM on massive strings

        const searchOptions = {
            wrap: false, // wrap:true can cause OOM in some xterm versions
            caseSensitive: false,
            incremental: false
        };
        // In a terminal, the prompt is at the bottom.
        // Users expect 'Enter' to search backwards (UP) into the history.
        // 'Shift+Enter' will search forwards (DOWN).
        if (e.shiftKey) {
            session.searchAddon.findNext(term, searchOptions);
        } else {
            session.searchAddon.findPrevious(term, searchOptions);
        }
    } else if (e.key === 'Escape') {
        closeTerminalSearch();
    }
}

let sftpSyncTimers = {};
function triggerSftpSyncDebounced(sessionId) {
    if (sftpSyncTimers[sessionId]) {
        clearTimeout(sftpSyncTimers[sessionId]);
    }
    sftpSyncTimers[sessionId] = setTimeout(() => {
        syncSftpFromTerminalPrompt(sessionId);
        delete sftpSyncTimers[sessionId];
    }, 120);
}

// Real-time SFTP Sync from Terminal Screen Prompt
function syncSftpFromTerminalPrompt(sessionId) {
    if (!sessionId.startsWith('ssh_') || !currentTerminal) return;
    
    // Avoid early path sniffing/sftp syncing in the first 5 seconds of session connection
    // to prevent blocking the WebView main thread during SSH/SFTP handshake lockup in C++
    const session = sessions[sessionId];
    if (session && session.connectTime && (Date.now() - session.connectTime < 5000)) {
        return;
    }

    try {
        const term = currentTerminal;
        const buffer = term.buffer.active;
        if (!buffer) return;
        
        const cursorLineIndex = buffer.baseY + buffer.cursorY;
        const startLine = Math.max(0, cursorLineIndex - 2);
        const endLine = Math.min(buffer.length - 1, cursorLineIndex);
        
        console.log(`[LdySSH Sync Debug] Session: ${sessionId}, CursorY: ${buffer.cursorY}, BaseY: ${buffer.baseY}, ScanLines: [${startLine} to ${endLine}]`);
        
        let targetPath = null;
        let matchedLineText = "";
        
        // Regexp to match path after colon E.g.: root@host:/var/log$ or user@host:~$
        const promptRegex = /:([\/~][^\s$#>\(\)]*)/;
        
        // Regexp to extract username E.g.: root@f6b95c8493b114d9
        const userRegex = /(?:^|\s)([a-zA-Z0-9_\-\.]+)(?:@[a-zA-Z0-9_\-\.]+):/;
        
        // Scan bottom-up to capture the absolute LATEST prompt path
        for (let i = endLine; i >= startLine; i--) {
            const line = buffer.getLine(i);
            if (line) {
                const lineText = line.translateToString(true);
                console.log(`[LdySSH Sync Debug] Line ${i} content: ${JSON.stringify(lineText)}`);
                
                const match = promptRegex.exec(lineText);
                if (match) {
                    targetPath = match[1].trim();
                    matchedLineText = lineText;
                    console.log(`[LdySSH Sync Debug] Hit prompt on Line ${i}: ${targetPath}`);
                    break; // Found the latest prompt, break out immediately
                }
            }
        }
        
        if (targetPath) {
            // Intelligent home directory (~) path mapping
            if (targetPath.startsWith('~')) {
                const userMatch = userRegex.exec(matchedLineText);
                const username = userMatch ? userMatch[1].trim() : 'root';
                
                const relativeRemainder = targetPath.slice(1); // everything after '~'
                let homePrefix = (username === 'root') ? '/root' : '/home/' + username;
                targetPath = homePrefix + relativeRemainder;
                console.log(`[LdySSH Sync Debug] Mapped home symbol ~ to absolute path: ${targetPath} (user: ${username})`);
            }
            
            // Normalize path separators
            targetPath = targetPath.replace(/\/+/g, '/');
            if (targetPath.endsWith('/') && targetPath.length > 1) {
                targetPath = targetPath.slice(0, -1);
            }
            
            if (targetPath && targetPath !== currentPath) {
                console.log(`[LdySSH Sync] Synced folder to: ${targetPath} (Sniffed from terminal)`);
                if (typeof navigateToPath === 'function') {
                    navigateToPath(targetPath);
                }
            } else {
                console.log(`[LdySSH Sync Debug] Target path is already active: targetPath=${targetPath}, currentPath=${currentPath}`);
            }
        } else {
            console.log("[LdySSH Sync Debug] No prompt pattern matched in scanning range.");
        }
    } catch (e) {
        console.warn("[LdySSH Sync] Prompt path extraction error:", e);
    }
}

// --- Base64 / Binary conversion helpers ---
function base64ToBytes(base64) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}

function bytesToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function bytesToUtf8(sessionId, bytes) {
    if (typeof TextDecoder !== 'undefined') {
        const session = sessions[sessionId];
        if (session) {
            if (!session.textDecoder) {
                session.textDecoder = new TextDecoder('utf-8');
            }
            return session.textDecoder.decode(bytes, { stream: true });
        }
        return new TextDecoder('utf-8').decode(bytes);
    }
    let utf8 = '';
    for (let i = 0; i < bytes.length; i++) {
        utf8 += String.fromCharCode(bytes[i]);
    }
    return utf8;
}

// --- Zmodem (sz/rz) Integration ---
let activeZsession = null;
let zsentinels = {}; // Mapping from sessionId to its Zmodem.Sentinel instance

// Zmodem 进度更新与界面控制函数
function updateZmodemProgress(title, offset, total) {
    const panel = document.getElementById("zmodemProgressPanel");
    const titleEl = document.getElementById("zmodemProgressTitle");
    const percentEl = document.getElementById("zmodemProgressPercent");
    const barEl = document.getElementById("zmodemProgressBar");
    const sizeEl = document.getElementById("zmodemProgressSize");
    
    if (panel) panel.style.display = "block";
    if (titleEl) titleEl.innerText = title;
    
    const pct = total > 0 ? Math.min(100, Math.floor((offset / total) * 100)) : 0;
    if (percentEl) percentEl.innerText = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;
    
    const formattedOffset = (offset / 1024).toFixed(1);
    const formattedTotal = (total / 1024).toFixed(1);
    if (sizeEl) sizeEl.innerText = `${formattedOffset} KB / ${formattedTotal} KB`;
}

function hideZmodemProgress() {
    const panel = document.getElementById("zmodemProgressPanel");
    if (panel) panel.style.display = "none";
}

function cancelActiveZmodem() {
    if (activeZsession) {
        try {
            activeZsession.abort();
        } catch(e) {}
    }
    const currentSess = currentSessionId;
    const term = currentSess ? sessions[currentSess]?.terminal : null;
    cleanupZmodem(term);
}

let zmodemWarned = false;
function getZmodemSentinel(sessionId) {
    let zmodemLib = null;
    if (typeof zmodem !== 'undefined') {
        zmodemLib = zmodem;
    } else if (typeof Zmodem !== 'undefined') {
        zmodemLib = Zmodem;
    }
    
    if (!zmodemLib) {
        if (!zmodemWarned) {
            console.warn('zmodem.js is not loaded.');
            zmodemWarned = true;
        }
        return null;
    }
    
    const SentinelConstructor = zmodemLib.Sentry || zmodemLib.Sentinel || (zmodemLib.Browser && zmodemLib.Browser.Sentinel) || (zmodemLib.Browser && zmodemLib.Browser.Sentry);
    if (!SentinelConstructor || typeof SentinelConstructor !== 'function') {
        console.warn('Zmodem Sentry/Sentinel constructor is not available in the library.');
        return null;
    }
    
    if (!zsentinels[sessionId]) {
        try {
            zsentinels[sessionId] = new SentinelConstructor({
                on_detect: function(detection) {
                    startZmodemSession(sessionId, detection);
                },
                on_retract: function() {
                    // Cancelled
                },
                sender: function(octets) {
                    const base64Data = bytesToBase64(new Uint8Array(octets));
                    window.pywebview.api.send_input_base64(sessionId, base64Data).catch(console.error);
                }
            });
        } catch (instError) {
            console.error("Zmodem Sentinel instantiation failed:", instError);
            return null;
        }
    }
    return zsentinels[sessionId];
}

function startZmodemSession(sessionId, detection) {
    const term = sessions[sessionId]?.terminal;
    if (!term) return;

    term.write("\r\n[LdySSH] 检测到 Zmodem 传输启动...\r\n");
    const zsession = detection.confirm();
    activeZsession = zsession;

    if (zsession.type === "receive") {
        zsession.on("offer", function(offer) {
            const details = offer.get_details();
            const fileName = details.name;
            const fileSize = details.size;

            window.pywebview.api.show_save_file_dialog(fileName).then(res => {
                const response = JSON.parse(res);
                const savePath = response.filePath;
                if (!savePath) {
                    offer.skip();
                    cleanupZmodem(term);
                    return;
                }

                term.write(`[LdySSH] 正在下载: ${fileName} (${(fileSize / 1024).toFixed(2)} KB) -> ${savePath}\r\n`);
                updateZmodemProgress(`下载: ${fileName}`, 0, fileSize || 1);
                
                offer.accept().then(function() {
                    let receivedChunks = [];
                    offer.on("chunk", function(chunk) {
                        receivedChunks.push(new Uint8Array(chunk));
                        const currentOffset = offer.get_offset();
                        updateZmodemProgress(`下载: ${fileName}`, currentOffset, fileSize || 1);
                    });

                    offer.on("close", function() {
                        const totalLen = receivedChunks.reduce((acc, val) => acc + val.length, 0);
                        const fileData = new Uint8Array(totalLen);
                        let offset = 0;
                        for (let chunk of receivedChunks) {
                            fileData.set(chunk, offset);
                            offset += chunk.length;
                        }
                        const base64Content = bytesToBase64(fileData);
                        window.pywebview.api.write_base64_file(savePath, base64Content).then(res => {
                            const response = JSON.parse(res);
                            if (response.success) {
                                term.write(`\r\n[LdySSH] 下载成功: ${fileName}\r\n`);
                            } else {
                                term.write(`\r\n[LdySSH] 写入文件失败: ${response.error || '未知错误'}\r\n`);
                            }
                            cleanupZmodem(term);
                        });
                    });
                });
            });
        });
    } else {
        // 如果有拖入的待发送文件，直接处理
        const pendingFile = sessions[sessionId]?.pendingDropFile;
        if (pendingFile) {
            sessions[sessionId].pendingDropFile = null;
            
            const reader = new FileReader();
            reader.onerror = function(err) {
                term.write(`\r\n[LdySSH] 读取拖拽文件失败: ${err}\r\n`);
                zsession.close();
                cleanupZmodem(term);
            };
            reader.onload = function(evt) {
                const fileBytes = new Uint8Array(evt.target.result);
                const fileName = pendingFile.name;
                
                term.write(`[LdySSH] 正在上传拖拽文件: ${fileName} (${(fileBytes.length / 1024).toFixed(2)} KB)\r\n`);
                updateZmodemProgress(`上传: ${fileName}`, 0, fileBytes.length);
                
                zsession.send_offer({
                    name: fileName,
                    size: fileBytes.length
                }).then(function(xfer) {
                    if (!xfer) {
                        term.write(`\r\n[LdySSH] 上传被远程跳过或拒绝\r\n`);
                        cleanupZmodem(term);
                        return;
                    }
                    
                    const chunkSize = 64 * 1024;
                    let sentOffset = 0;
                    function sendNextChunk() {
                        if (!activeZsession) return; // 被中途取消
                        if (sentOffset >= fileBytes.length) {
                            xfer.close().then(function() {
                                term.write(`\r\n[LdySSH] 上传成功: ${fileName}\r\n`);
                                cleanupZmodem(term);
                            });
                            return;
                        }
                        const slice = fileBytes.slice(sentOffset, sentOffset + chunkSize);
                        xfer.send(slice);
                        sentOffset += slice.length;
                        updateZmodemProgress(`上传: ${fileName}`, sentOffset, fileBytes.length);
                        setTimeout(sendNextChunk, 2);
                    }
                    sendNextChunk();
                });
            };
            reader.readAsArrayBuffer(pendingFile);
            return;
        }

        // 正常的系统文件对话框触发
        window.pywebview.api.show_open_file_dialog().then(res => {
            const response = JSON.parse(res);
            const localPath = response.filePath;
            if (!localPath) {
                zsession.close();
                cleanupZmodem(term);
                return;
            }

            window.pywebview.api.read_base64_file(localPath).then(readRes => {
                const readResult = JSON.parse(readRes);
                const base64Content = readResult.content;
                if (!base64Content) {
                    term.write(`\r\n[LdySSH] 读取本地文件失败\r\n`);
                    zsession.close();
                    cleanupZmodem(term);
                    return;
                }

                const fileBytes = base64ToBytes(base64Content);
                const fileName = localPath.split(/[\\/]/).pop();
                
                term.write(`[LdySSH] 正在上传: ${fileName} (${(fileBytes.length / 1024).toFixed(2)} KB) 从 ${localPath}\r\n`);
                updateZmodemProgress(`上传: ${fileName}`, 0, fileBytes.length);

                zsession.send_offer({
                    name: fileName,
                    size: fileBytes.length
                }).then(function(xfer) {
                    if (!xfer) {
                        term.write(`\r\n[LdySSH] 上传被远程跳过或拒绝\r\n`);
                        cleanupZmodem(term);
                        return;
                    }

                    const chunkSize = 64 * 1024;
                    let sentOffset = 0;
                    function sendNextChunk() {
                        if (!activeZsession) return;
                        if (sentOffset >= fileBytes.length) {
                            xfer.close().then(function() {
                                term.write(`\r\n[LdySSH] 上传成功: ${fileName}\r\n`);
                                cleanupZmodem(term);
                            });
                            return;
                        }
                        const slice = fileBytes.slice(sentOffset, sentOffset + chunkSize);
                        xfer.send(slice);
                        sentOffset += slice.length;
                        updateZmodemProgress(`上传: ${fileName}`, sentOffset, fileBytes.length);
                        setTimeout(sendNextChunk, 2);
                    }
                    sendNextChunk();
                });
            });
        });
    }
}

function cleanupZmodem(term) {
    activeZsession = null;
    hideZmodemProgress();
    if (term) {
        term.focus();
        term.write("\r\n[LdySSH] Zmodem 会话已结束。\r\n");
    }
}

// --- Parameter Interpolation Helpers for Shortcuts ---
function getParamHistory(paramName) {
    const raw = localStorage.getItem('ldyssh_param_hist_' + paramName) || localStorage.getItem('prismssh_param_hist_' + paramName);
    try {
        return raw ? JSON.parse(raw) : [];
    } catch(e) {
        return [];
    }
}

function saveParamValueToHistory(paramName, value) {
    if (!value || !value.trim()) return;
    let history = getParamHistory(paramName);
    history = history.filter(h => h !== value);
    history.unshift(value);
    if (history.length > 15) history = history.slice(0, 15);
    localStorage.setItem('ldyssh_param_hist_' + paramName, JSON.stringify(history));
    localStorage.setItem('prismssh_param_hist_' + paramName, JSON.stringify(history));
}

function showParamHistoryDropdown(event, buttonEl, paramName, inputEl) {
    if (event) event.stopPropagation();
    
    const old = document.getElementById('param-history-popover');
    if (old) old.remove();
    
    const history = getParamHistory(paramName);
    if (history.length === 0) {
        alert('暂无该参数的历史记录');
        return;
    }
    
    const popover = document.createElement('div');
    popover.id = 'param-history-popover';
    
    const rect = buttonEl.getBoundingClientRect();
    
    popover.style = `
        position: fixed; z-index: 11000; background: #1f202e;
        border: 1px solid rgba(255,255,255,0.18); border-radius: 6px;
        padding: 4px 0; width: 200px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        left: ${rect.left + rect.width - 200}px; top: ${rect.bottom + 4}px;
        font-family: inherit;
    `;
    
    history.forEach(val => {
        const item = document.createElement('div');
        item.style = 'padding: 8px 12px; font-size: 12px; color: #e2e8f0; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background 0.15s;';
        item.textContent = val;
        item.onmouseover = () => item.style.background = 'var(--theme-primary, #38bdf8)';
        item.onmouseout = () => item.style.background = 'transparent';
        item.onclick = () => {
            inputEl.value = val;
            popover.remove();
            inputEl.focus();
        };
        popover.appendChild(item);
    });
    
    document.body.appendChild(popover);
    
    const outsideClick = (e) => {
        if (!popover.contains(e.target) && e.target !== buttonEl) {
            popover.remove();
            document.removeEventListener('mousedown', outsideClick);
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', outsideClick);
    }, 50);
}

function insertParamPlaceholder(num) {
    const input = document.getElementById('commandLibraryCommandInput');
    if (!input) return;
    const val = input.value;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const textToInsert = `[p#${num} 参数${num}]`;
    input.value = val.slice(0, start) + textToInsert + val.slice(end);
    // Move cursor and select the parameter name "参数X" for easy renaming
    input.selectionStart = start + 5; // right after "[p#X "
    input.selectionEnd = start + textToInsert.length - 1; // right before "]"
    input.focus();
}

let currentActiveConsoleIndex = -1;

function escapeHtml(string) {
    const r = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;"
    };
    return String(string).replace(/[&<>"'/]/g, (s) => r[s]);
}

function toggleDynamicConsole(event, index) {
    if (event) event.stopPropagation();
    
    const consoleEl = document.getElementById('dynamicCommandConsole');
    if (!consoleEl) return;
    
    // 折叠/收起控制台时的排版优化：清空内容并彻底移除外边距、内边距、边框占位，解决白边残留
    if (currentActiveConsoleIndex === index && consoleEl.style.display !== 'none') {
        consoleEl.style.display = 'none';
        consoleEl.style.marginTop = '0px';
        consoleEl.style.borderTop = 'none';
        consoleEl.style.paddingTop = '0px';
        consoleEl.innerHTML = '';
        currentActiveConsoleIndex = -1;
        return;
    }
    
    currentActiveConsoleIndex = index;
    const item = commandLibraryFolders[activeCommandFolderIndex].commands[index];
    const isAuto = item.auto_execute !== false;
    
    // Parse parameters like [p#1 PID游戏]
    const paramRegexLocal = /\[p#(\d+)\s+([^\]]+)\]/g;
    const paramsFound = [];
    let match;
    while ((match = paramRegexLocal.exec(item.command)) !== null) {
        paramsFound.push({
            num: parseInt(match[1]),
            name: match[2].trim(),
            rawMatch: match[0]
        });
    }
    
    let inputsHtml = '';
    paramsFound.forEach(p => {
        const history = getParamHistory(p.name);
        const latestVal = history.length > 0 ? history[0] : '';
        
        let labelHtml = '';
        if (/^\d+$/.test(p.name)) {
            labelHtml = `<span class="glow-console-param-label" title="参数 ${p.name}"># ${p.name.padStart(2, '0')}</span>`;
        } else {
            labelHtml = `<span class="glow-console-param-label" style="min-width: 50px !important; color: #38bdf8 !important; background: rgba(56,189,248,0.08) !important; border-color: rgba(56,189,248,0.22) !important;" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>`;
        }
        
        inputsHtml += `
            <div style="display: flex; align-items: center; margin-top: 8px; gap: 8px; width: 100%;">
                <div style="width: 70px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0;">
                    ${labelHtml}
                </div>
                <input type="text" class="glow-console-input param-console-input" data-raw="${escapeHtml(p.rawMatch)}" data-name="${escapeHtml(p.name)}" value="${escapeHtml(latestVal)}">
                <button type="button" class="glow-console-action-btn" onclick="showParamHistoryDropdown(event, this, '${p.name.replace(/'/g, "\\'")}', this.previousElementSibling)">历史</button>
            </div>
        `;
    });
    
    consoleEl.innerHTML = `
        <div class="glow-console">
            <div class="glow-console-inner">
                <!-- Top Line: Send Button + Command Preview + Edit button -->
                <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                    <button type="button" id="console-btn-send" class="glow-console-send-btn">🚀 执行: ${escapeHtml(item.name)}</button>
                    
                    <div class="glow-console-preview" title="${escapeHtml(item.command)}">
                        ${escapeHtml(item.command)}
                    </div>
                    
                    <button type="button" class="glow-console-action-btn" onclick="openCommandLibraryModal('edit-command', '', ${index})">编辑</button>
                </div>
                
                <!-- Parameters Inputs -->
                <div style="margin-top: 4px;">
                    ${inputsHtml}
                </div>
            </div>
        </div>
    `;
    
    // 展开时恢复边框和内边距，确保布局正常
    consoleEl.style.display = 'block';
    consoleEl.style.marginTop = '10px';
    consoleEl.style.borderTop = 'none';
    consoleEl.style.paddingTop = '0px';
    
    // Bind Execute Action
    const executeAction = () => {
        if (!currentSessionId || !sessions[currentSessionId]) {
            alert('请先连接服务器。');
            return;
        }
        
        let finalCmd = item.command;
        const inputs = consoleEl.querySelectorAll('.param-console-input');
        inputs.forEach(input => {
            const raw = input.getAttribute('data-raw');
            const name = input.getAttribute('data-name');
            const val = input.value.trim();
            finalCmd = finalCmd.replaceAll(raw, val);
            saveParamValueToHistory(name, val);
        });
        
        const executed = isAuto ? (finalCmd.endsWith('\n') ? finalCmd : `${finalCmd}\n`) : (finalCmd.endsWith('\n') ? finalCmd.slice(0, -1) : finalCmd);
        window.pywebview.api.send_input(currentSessionId, executed);
    };
    
    consoleEl.querySelector('#console-btn-send').onclick = executeAction;
    
    // Bind Enter key on inputs
    const inputs = consoleEl.querySelectorAll('.param-console-input');
    inputs.forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                executeAction();
            }
        });
    });
}

// --- 本地文件浏览器状态与函数 ---
let localCurrentPath = 'C:\\';
let isLoadingLocalFiles = false;
let selectedLocalFileElement = null;
let isRenameLocal = false;
let localRenameOldPath = '';
let isContextMenuLocal = false;

function getLocalParentPath(path) {
    let tempPath = path;
    if (tempPath.endsWith('\\') && tempPath.length > 3) {
        tempPath = tempPath.slice(0, -1);
    }
    const idx = tempPath.lastIndexOf('\\');
    if (idx !== -1) {
        let parent = tempPath.substring(0, idx);
        if (parent.endsWith(':')) {
            parent += '\\';
        }
        return parent;
    }
    return 'C:\\';
}

async function listLocalFiles(path) {
    if (isLoadingLocalFiles) return;
    isLoadingLocalFiles = true;
    const fileList = document.getElementById('localFileList');
    if (!fileList) return;
    fileList.classList.add('loading');
    
    try {
        const result = JSON.parse(
            await window.pywebview.api.list_local_directory(path)
        );
        if (!result.success) {
            console.error('Failed to list local directory:', result.error);
            fileList.innerHTML = '<div class="empty-message">文件加载失败</div>';
            return;
        }
        
        fileList.innerHTML = '';
        
        // 判断是否是根目录
        const isRoot = /^[a-zA-Z]:\\?$/.test(path);
        if (!isRoot) {
            const parentItem = document.createElement('div');
            parentItem.className = 'file-item';
            parentItem.innerHTML = `
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="file-name">..</span>
                <span class="file-size">-</span>
                <span class="file-date">-</span>
            `;
            parentItem.ondblclick = () => {
                if (!isLoadingLocalFiles) navigateLocalUp();
            };
            parentItem.onclick = () => selectLocalFile(parentItem);
            fileList.appendChild(parentItem);
        }
        
        result.files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.setAttribute('data-filename', file.name);
            item.setAttribute('data-filetype', file.is_dir ? 'directory' : 'file');
            
            // 支持拖拽上传
            item.draggable = true;
            item.ondragstart = (e) => {
                const sep = localCurrentPath.endsWith('\\') ? '' : '\\';
                const fullLocalPath = localCurrentPath + sep + file.name;
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    source: 'local',
                    name: file.name,
                    path: fullLocalPath,
                    isDir: file.is_dir
                }));
            };
            
            const sizeStr = file.is_dir ? '-' : formatBytes(file.size);
            
            item.innerHTML = `
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${file.is_dir ?
                        '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' :
                        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
                    }
                </svg>
                <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                <span class="file-size">${escapeHtml(sizeStr)}</span>
                <span class="file-date">${escapeHtml(file.date)}</span>
            `;
            
            if (file.is_dir) {
                item.ondblclick = () => {
                    if (!isLoadingLocalFiles) navigateLocalToFolder(file.name);
                };
            }
            
            item.onclick = () => selectLocalFile(item);
            item.oncontextmenu = (e) => {
                e.preventDefault();
                showContextMenu(e, item, true);
            };
            
            fileList.appendChild(item);
        });
        fileList.scrollTop = 0;
    } catch (e) {
        console.error('Error listing local files:', e);
        fileList.innerHTML = '<div class="empty-message">文件加载失败</div>';
    } finally {
        isLoadingLocalFiles = false;
        fileList.classList.remove('loading');
    }
}

function selectLocalFile(element) {
    document.querySelectorAll('#localFileList .file-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
    selectedLocalFileElement = element;
}

function navigateLocalToFolder(folderName) {
    if (isLoadingLocalFiles) return;
    const sep = localCurrentPath.endsWith('\\') ? '' : '\\';
    localCurrentPath = localCurrentPath + sep + folderName;
    document.getElementById('localCurrentPath').value = localCurrentPath;
    listLocalFiles(localCurrentPath);
}

function navigateLocalToPath(path) {
    if (!path || isLoadingLocalFiles) return;
    localCurrentPath = path;
    document.getElementById('localCurrentPath').value = localCurrentPath;
    listLocalFiles(localCurrentPath);
}

function navigateLocalUp() {
    if (isLoadingLocalFiles) return;
    const parent = getLocalParentPath(localCurrentPath);
    localCurrentPath = parent;
    document.getElementById('localCurrentPath').value = localCurrentPath;
    listLocalFiles(localCurrentPath);
}

function refreshLocalFiles() {
    listLocalFiles(localCurrentPath);
}

async function createLocalFolderPrompt() {
    const folderName = prompt("请输入新建本地文件夹的名称：");
    if (!folderName) return;
    const sep = localCurrentPath.endsWith('\\') ? '' : '\\';
    const fullPath = localCurrentPath + sep + folderName;
    try {
        const result = JSON.parse(await window.pywebview.api.create_local_directory(fullPath));
        if (result.success) {
            refreshLocalFiles();
        } else {
            alert("创建文件夹失败: " + result.error);
        }
    } catch(e) {
        alert("发生错误: " + e.message);
    }
}

function showLocalRenameModal(fileName, filePath) {
    isRenameLocal = true;
    localRenameOldPath = filePath;
    renameTarget = fileName;
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');

    input.value = fileName;
    modal.style.display = 'flex';

    setTimeout(() => {
        input.focus();
        if (fileName.includes('.')) {
            const dotIndex = fileName.lastIndexOf('.');
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }
    }, 100);

    input.onkeyup = (e) => {
        if (e.key === 'Enter') {
            confirmRename();
        } else if (e.key === 'Escape') {
            closeRenameModal();
        }
    };
}

async function downloadFileToLocalPath(remotePath, fileName) {
    const sep = localCurrentPath.endsWith('\\') ? '' : '\\';
    const savePath = localCurrentPath + sep + fileName;
    
    try {
        const infoResult = await window.pywebview.api.get_file_info(currentSessionId, remotePath);
        const infoResponse = JSON.parse(infoResult);
        const fileSize = infoResponse.success ? infoResponse.info.size : 0;

        const progressNotification = showDownloadProgressWithCancel(fileName, fileSize);
        const downloadId = 'drag_dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const startResult = await window.pywebview.api.start_direct_download_with_progress(currentSessionId, remotePath, savePath, downloadId);
        const startResponse = JSON.parse(startResult);

        if (!startResponse.success) {
            if (progressNotification && progressNotification.parentNode) {
                progressNotification.parentNode.removeChild(progressNotification);
            }
            alert(`下载启动失败: ${startResponse.error}`);
            return;
        }

        const progressInterval = setInterval(async () => {
            try {
                const progressResult = await window.pywebview.api.get_download_progress(currentSessionId, downloadId);
                const progress = JSON.parse(progressResult);

                if (progress.status === 'downloading' && progress.total > 0) {
                    updateDownloadProgress(progress.downloaded, progress.total);
                } else if (progress.status === 'completed') {
                    clearInterval(progressInterval);
                    updateDownloadProgress(progress.downloaded || fileSize, progress.total || fileSize);

                    setTimeout(() => {
                        if (progressNotification && progressNotification.parentNode) {
                            progressNotification.parentNode.removeChild(progressNotification);
                        }
                    }, 1500);

                    showSuccessNotification(`已下载至 ${savePath}`);
                    refreshLocalFiles();
                } else if (progress.status === 'error') {
                    clearInterval(progressInterval);
                    if (progressNotification.parentNode) {
                        progressNotification.parentNode.removeChild(progressNotification);
                    }
                    alert(`下载失败: ${progress.error || '未知错误'}`);
                } else if (progress.status === 'cancelled') {
                    clearInterval(progressInterval);
                    if (progressNotification.parentNode) {
                        progressNotification.parentNode.removeChild(progressNotification);
                    }
                }
            } catch (error) {
                console.error('轮询下载进度出错:', error);
                clearInterval(progressInterval);
                if (progressNotification.parentNode) {
                    progressNotification.parentNode.removeChild(progressNotification);
                }
            }
        }, 100);

    } catch (error) {
        console.error('下载出错:', error);
        alert('下载失败: ' + error.message);
    }
}

async function uploadFileFromPath(localPath, fileName) {
    if (!currentSessionId || !sessions[currentSessionId]) {
        alert('请先连接服务器');
        return;
    }
    const remotePath = currentPath.endsWith('/') ?
        currentPath + fileName :
        currentPath + '/' + fileName;
    
    uploadQueue.push({ localPath, remotePath, fileName });

    if (!isProcessingUploads) {
        processUploadQueue();
    }
}

function setupSftpDragAndDrop() {
    const localContainer = document.getElementById('localFileListContainer');
    const remoteContainer = document.getElementById('fileListContainer');
    if (!localContainer || !remoteContainer) return;

    remoteContainer.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    
    remoteContainer.ondrop = async (e) => {
        e.preventDefault();
        try {
            const dataStr = e.dataTransfer.getData('text/plain');
            if (dataStr) {
                const dragData = JSON.parse(dataStr);
                if (dragData && dragData.source === 'local') {
                    await uploadFileFromPath(dragData.path, dragData.name);
                    return;
                }
            }
        } catch(err) {}
        
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect({ target: { files: e.dataTransfer.files } });
        }
    };
    
    localContainer.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    
    localContainer.ondrop = async (e) => {
        e.preventDefault();
        try {
            const dataStr = e.dataTransfer.getData('text/plain');
            if (dataStr) {
                const dragData = JSON.parse(dataStr);
                if (dragData && dragData.source === 'remote') {
                    await downloadFileToLocalPath(dragData.path, dragData.name);
                    return;
                }
            }
        } catch(err) {
            console.error("Local container drop error:", err);
        }
    };
}

function toggleJumpHostFields() {
    const fields = document.getElementById('jumpHostFields');
    const chevron = document.getElementById('jumpHostChevron');
    if (fields.style.display === 'none') {
        fields.style.display = 'block';
        chevron.textContent = '▼';
    } else {
        fields.style.display = 'none';
        chevron.textContent = '▶';
    }
}

function toggleProxyFields() {
    const fields = document.getElementById('proxyFields');
    const chevron = document.getElementById('proxyChevron');
    if (fields.style.display === 'none') {
        fields.style.display = 'block';
        chevron.textContent = '▼';
    } else {
        fields.style.display = 'none';
        chevron.textContent = '▶';
    }
}

function updateSplitScreenHighlight() {
    Object.keys(sessions).forEach(id => {
        const el = sessions[id].terminalElement;
        if (el) {
            if (isSplitMode && id === currentSessionId) {
                el.classList.add('active-split');
            } else {
                el.classList.remove('active-split');
            }
        }
    });
}

// ==========================================================================
// 3D Topology Full-Screen Background Rendering and Control (LdySSH v2.0)
// ==========================================================================
let topoViewer = null;

function toggleWorkbenchActive(active) {
    if (active) {
        document.body.classList.add('workbench-active');
    } else {
        document.body.classList.remove('workbench-active');
    }
    const bg = document.getElementById('threejsBackground');
    if (bg) {
        bg.style.pointerEvents = 'auto';
    }
    if (topoViewer && topoViewer.controls) {
        topoViewer.controls.enabled = true;
    }
}

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
        if (!currentSessionId) {
            toggleWorkbenchActive(true);
        } else {
            toggleWorkbenchActive(false);
        }
    } catch (e) {
        console.error("Failed to initialize 3D topology:", e);
        topoViewer = null;
        setTimeout(initBackgroundTopology, 1000);
    }
}

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
        
        // 金黄红底色
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(0, 0, 512, 256);
        
        // 渲染斑驳的日冕火焰和太阳黑子细节
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
        
        // 加上一些黑子斑点
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
        
        // 渐变海洋底色
        const oceanGrad = ctx.createLinearGradient(0, 0, 0, 256);
        oceanGrad.addColorStop(0, '#0a1d37');
        oceanGrad.addColorStop(0.5, '#0d2240');
        oceanGrad.addColorStop(1, '#0a1d37');
        ctx.fillStyle = oceanGrad;
        ctx.fillRect(0, 0, 512, 256);
        
        // 陆地板块生成（画6大主要大陆板块和一些微小岛屿）
        const continents = [
            // 亚洲、欧洲、非洲主体
            { x: 260, y: 100, rx: 95, ry: 55, rot: -0.1 },
            { x: 280, y: 145, rx: 50, ry: 40, rot: 0.15 },
            // 美洲板块
            { x: 120, y: 95, rx: 55, ry: 45, rot: 0.2 },
            { x: 145, y: 170, rx: 42, ry: 58, rot: -0.1 },
            // 澳大利亚板块
            { x: 380, y: 180, rx: 32, ry: 22, rot: 0.05 },
            // 格陵兰岛
            { x: 180, y: 45, rx: 25, ry: 15, rot: -0.2 }
        ];

        // 陆地基底
        continents.forEach(c => {
            ctx.fillStyle = '#1b5e20'; // 深绿森林底色
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, c.rx, c.ry, c.rot, 0, Math.PI * 2);
            ctx.fill();
            
            // 渲染起伏的斑驳高原/山脉（土黄/褐色）
            ctx.fillStyle = '#7d6608';
            for (let s = 0; s < 12; s++) {
                const sx = c.x + (Math.random() - 0.5) * c.rx * 1.2;
                const sy = c.y + (Math.random() - 0.5) * c.ry * 1.2;
                const sr = 6 + Math.random() * 15;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // 陆地边缘的浅绿色浅滩/大陆架过渡
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

        // 绘制南北极盖 (白色冰川)
        ctx.fillStyle = 'rgba(240, 245, 255, 0.95)';
        // 北极
        ctx.beginPath();
        ctx.ellipse(256, 12, 180, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        // 南极
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
        
        // 用柔和半透明白色画气旋云层
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
            
            // 气旋风暴中心 (画螺旋感)
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
        
        // 绘制木星极其复杂的云层带
        const colors = [
            '#592c14', '#754425', '#995f3b', '#b38864', 
            '#cca687', '#ebd7c5', '#52341d', '#ebd5c0'
        ];
        
        let curY = 0;
        while (curY < 256) {
            const h = 6 + Math.random() * 15;
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(0, curY, 512, h);
            
            // 在边界处画波浪扰动 (气态云层的涡流感)
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
        
        // 绘制“大红斑” Great Red Spot (多层漩涡感)
        const rx = 340;
        const ry = 165;
        // 1. 深红外圈漩涡
        ctx.fillStyle = 'rgba(128, 25, 12, 0.95)';
        ctx.beginPath();
        ctx.ellipse(rx, ry, 32, 17, 0.06, 0, Math.PI * 2);
        ctx.fill();

        // 2. 鲜红中圈
        ctx.fillStyle = '#c62828';
        ctx.beginPath();
        ctx.ellipse(rx - 1, ry, 24, 12, 0.06, 0, Math.PI * 2);
        ctx.fill();

        // 3. 橙红核心
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.ellipse(rx - 2, ry - 1, 14, 7, 0.06, 0, Math.PI * 2);
        ctx.fill();

        // 4. 白色气流卷纹绕过红斑
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
        
        // 柔和条纹
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
        
        // 绘制不同宽度、颜色和透明度的同心线。X轴是半径方向。
        for (let x = 0; x < 256; x += 1 + Math.random() * 3) {
            const w = 1 + Math.random() * 3;
            // 环缝（卡西尼环缝）
            if (x > 140 && x < 155 && Math.random() < 0.85) {
                continue; 
            }
            const alpha = 0.12 + Math.random() * 0.65;
            // 呈现出米黄与浅灰尘埃的混合质感
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
        ctx.fillStyle = '#2b5fcb'; // 幽蓝色
        ctx.fillRect(0, 0, 256, 128);
        
        // 渐变气流带
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        for (let i = 0; i < 8; i++) {
            ctx.fillRect(0, Math.random() * 128, 256, 5 + Math.random() * 8);
        }

        // 大暗斑 (Great Dark Spot)
        ctx.fillStyle = '#132860';
        ctx.beginPath();
        ctx.ellipse(170, 75, 18, 10, 0.08, 0, Math.PI * 2);
        ctx.fill();

        // 大暗斑周围的白色亮条纹 (甲烷云)
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
        ctx.fillStyle = '#b24a25'; // 火星红褐色底色
        ctx.fillRect(0, 0, 256, 128);
        
        // 铁锈深褐色风化纹理
        ctx.fillStyle = '#803013';
        for (let i = 0; i < 15; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 128, 12 + Math.random() * 24, 0, Math.PI * 2);
            ctx.fill();
        }

        // 橙红色沙丘暗影
        ctx.fillStyle = '#cd643d';
        for (let i = 0; i < 10; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 128, 6 + Math.random() * 12, 0, Math.PI * 2);
            ctx.fill();
        }

        // 两极冰盖 (干冰与水冰)
        ctx.fillStyle = '#fdfdfd';
        // 北极盖
        ctx.beginPath();
        ctx.ellipse(128, 3, 30, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // 南极盖
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
        ctx.fillStyle = '#6d737a'; // 灰色底色
        ctx.fillRect(0, 0, 256, 128);
        
        // 暗斑
        ctx.fillStyle = '#555a60';
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 128, 8 + Math.random() * 16, 0, Math.PI * 2);
            ctx.fill();
        }

        // 环形山陨石坑 (带偏置阴影和喷射条纹)
        for (let i = 0; i < 25; i++) {
            const cx = Math.random() * 256;
            const cy = Math.random() * 128;
            const r = 3 + Math.random() * 8;
            
            // 坑沿的暗部
            ctx.fillStyle = 'rgba(40, 42, 45, 0.7)';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            
            // 坑底偏置的亮部 (立体光影)
            ctx.fillStyle = 'rgba(160, 170, 180, 0.5)';
            ctx.beginPath();
            ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.85, 0, Math.PI * 2);
            ctx.fill();
            
            // 较亮的辐射条纹线
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
        ctx.fillStyle = '#e3cc9a'; // 金星米黄/奶油底色
        ctx.fillRect(0, 0, 256, 128);
        
        // 金星大气的微弱漩涡和横条纹
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

        // Hide inner glowing border and dark overlay immediately on workbench load
        const termContainer = document.querySelector('.terminal-container');
        if (termContainer) {
            termContainer.classList.add('in-workbench');
        }

        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x050608, 0.005);
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1500);
        this.camera.position.set(0, 75, 130); // 抬高相机，提供更好的星盘俯瞰视角

        // 2. WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        // 3. Orbit Controls (Bound to WebGL canvas for event isolation)
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.enableZoom = false; // Disable zoom to prevent scroll issues
            this.controls.enablePan = false;  // Disable panning to focus on center
            this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent camera underfloor
            this.controls.minDistance = 30; // 限制拉近
            this.controls.maxDistance = 350; // 限制拉远
        }

        // Custom Title Bar Drag Handling & Event Isolation (保留原窗口拖拽)
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
        // 点光源，模拟太阳光，照亮整个星盘天体
        const sunLight = new THREE.PointLight(0xffaa44, 2.5, 400);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);

        // 5. Starfield Background (多层不同颜色、密度的尘埃星空效果)
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

        // 7. Event listeners
        this.onResizeHandler = this.onWindowResize.bind(this);
        this.onClickHandler = this.onDocumentClick.bind(this);
        window.addEventListener('resize', this.onResizeHandler);
        this.renderer.domElement.addEventListener('click', this.onClickHandler);

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
        // Clear existing nodes/lines/gateways/orbits/sun components
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
            
            // Dispose child layers if any
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

        // 1. Glowing Sun Core (使用 BasicMaterial 避免自发光体被阴影遮挡变暗)
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

        // 2. Sun Outer Atmosphere Layer (日冕柔和边缘发光层，代替丑陋线框)
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

        // 3. Sun Glow Sprite (径向渐变外圈漫反射光晕，消除刺眼突变)
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
        const actualConnections = savedConnectionsCache || [];
        
        // Define 7 core planetary configurations (simulating solar system)
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
                // Dynamically append outer orbits if connections > 7
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
                // Virtual placeholder planets render as beautiful crystal clear cyan spheres
                color = 0x00f2fe;
                emissive = 0x001122;
            } else {
                // Assign procedural generated textures based on planet identity
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
                map: mapTex, // 必须映射贴图！
                emissive: emissive,
                specular: specularColor,
                shininess: shininess,
                transparent: isVirtual,
                opacity: isVirtual ? 0.28 : 1.0
            });

            const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);

            // Special planetary system: Saturn Rings (精致同心砂砾质感星环)
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
                nodeMesh.add(ringMesh); // 自动跟随公转自转
            }

            // Special planetary system: Earth Clouds & Atmosphere (去除了丑陋的多面体线框)
            if (cfg.isEarth) {
                // Cloud layer mesh overlay (柔和白色半透明气流云层，非 wireframe)
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

                // Atmosphere refraction glow (边缘天蓝色大气透亮层)
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

            // Assign random initial phase
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

            // 5. Connection beam (polar light ray)
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

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        
        if (elapsed < this.fpsInterval) {
            return;
        }
        
        this.lastFrameTime = now - (elapsed % this.fpsInterval);

        if (this.controls) this.controls.update();

        // 1. 太阳表面流动与自转 (利用 UV 移动创造不断喷涌流出的岩浆效果)
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
            this.sunParticles.rotation.z += 0.0002; // 光晕精灵平面缓慢自转，消除刺眼抖动
        }

        // 2. 多层星空极慢旋转
        this.starfields.forEach(sf => {
            if (sf.points) {
                sf.points.rotation.y += sf.speed;
            }
        });

        // 3. 行星自转与公转
        this.nodes.forEach((n, idx) => {
            if (n.mesh) {
                // 行星自转
                n.mesh.rotation.y += 0.008;

                // 地球云层与大气的不同速度浮动自转
                n.mesh.traverse(child => {
                    if (child.userData && child.userData.isCloud) {
                        child.rotation.y += 0.005; // 云层比地球本体稍快
                        child.rotation.x += 0.001;
                    }
                });

                // 公转相位累加
                n.phase += n.speed;

                // 计算更新后的公转位置
                const x = n.orbitR * Math.cos(n.phase);
                const y = n.orbitR * Math.sin(n.phase) * Math.sin(n.incline);
                const z = n.orbitR * Math.sin(n.phase) * Math.cos(n.incline);

                n.mesh.position.set(x, y, z);

                // 行星轻微、柔和的呼吸尺寸感 (消除生硬的剧烈跳动)
                const pulse = 1.0 + 0.012 * Math.sin(Date.now() * 0.0008 + idx);
                n.mesh.scale.set(pulse, pulse, pulse);

                // 4. 更新动态连接光轨
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
        }
        if (this.onTerminalPointerDown) {
            document.removeEventListener('pointerdown', this.onTerminalPointerDown, { capture: true });
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
        
        // Match both planets and their child meshes (rings, clouds, land meshes)
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
            
            // Check if child elements clicked (rings, clouds, land lattices)
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
                quickConnect(connKey);
            }
        }
    }
}

window.updateNodeDelay = function(ip, delay, status) {
    if (!topoViewer || !topoViewer.nodes) return;
    const node = topoViewer.nodes.find(n => n.ip === ip);
    if (node && node.mesh) {
        let color = node.originalColor;
        let emissive = node.originalEmissive;
        let lineOpacity = 0.24;
        let lineColor = 0x4facfe;

        if (status === 'disconnected') {
            color = 0x555555;      // Dead slate grey
            emissive = 0x221111;   // Weak red emissive
            lineColor = 0xff3366;  // Red connection line
            lineOpacity = 0.12;
        } else if (delay > 150) {
            color = 0xffaa00;      // Warning orange
            emissive = 0x331100;
            lineColor = 0xffaa00;
            lineOpacity = 0.45;
        } else if (delay > 50) {
            color = 0xffff33;      // Moderate yellow
            emissive = 0x222200;
            lineColor = 0xffff33;
            lineOpacity = 0.38;
        } else {
            // Healthy connection: Use planet's beautiful native color, green connection line
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
};

// Initialize background 3D immediately
initBackgroundTopology();

// --- 主机工作台搜索历史记录功能 (Local Storage) ---
function getSearchHistory() {
    try {
        return JSON.parse(localStorage.getItem('home_search_history') || '[]');
    } catch (e) {
        return [];
    }
}

function saveSearchHistory(query) {
    query = (query || '').trim();
    if (!query) return;
    let history = getSearchHistory();
    history = history.filter(item => item !== query);
    history.unshift(query);
    if (history.length > 5) {
        history = history.slice(0, 5);
    }
    localStorage.setItem('home_search_history', JSON.stringify(history));
}

window.showSearchHistory = function() {
    const dropdown = document.getElementById('searchHistoryDropdown');
    const input = document.getElementById('homeConnectionSearch');
    if (!dropdown || !input) return;
    const history = getSearchHistory();
    if (history.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    let html = `<div class="search-history-header">
        <span>最近搜索</span>
        <span class="search-history-clear" onclick="clearSearchHistory(event)">清空</span>
    </div>`;
    
    history.forEach(item => {
        html += `<div class="search-history-item" onclick="selectSearchHistory('${item.replace(/'/g, "\\'")}', event)">
            <span>${item}</span>
            <span class="search-history-delete" onclick="deleteSearchHistory('${item.replace(/'/g, "\\'")}', event)">×</span>
        </div>`;
    });
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
};

window.selectSearchHistory = function(val, event) {
    if (event) event.stopPropagation();
    const input = document.getElementById('homeConnectionSearch');
    if (input) {
        input.value = val;
        renderConnectionsHome();
    }
    window.hideSearchHistory();
};

window.deleteSearchHistory = function(val, event) {
    if (event) event.stopPropagation();
    let history = getSearchHistory();
    history = history.filter(item => item !== val);
    localStorage.setItem('home_search_history', JSON.stringify(history));
    window.showSearchHistory();
};

window.clearSearchHistory = function(event) {
    if (event) event.stopPropagation();
    localStorage.removeItem('home_search_history');
    window.hideSearchHistory();
};

window.hideSearchHistory = function() {
    const dropdown = document.getElementById('searchHistoryDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
};

window.handleHomeSearchKeydown = function(event) {
    if (event.key === 'Enter') {
        const val = event.target.value.trim();
        if (val) {
            saveSearchHistory(val);
            window.hideSearchHistory();
        }
    }
};

// 点击页面其他区域时自动关闭搜索历史菜单
document.addEventListener('click', function(event) {
    const searchWrapper = document.querySelector('.home-search');
    if (searchWrapper && !searchWrapper.contains(event.target)) {
        window.hideSearchHistory();
    }
});

