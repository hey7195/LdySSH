import os
import sys
import json
import asyncio
import re
import threading

# 自动安装缺失的依赖 websockets
try:
    import websockets
except ImportError:
    import subprocess
    print("websockets library not found. Auto installing...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
        import websockets
    except Exception as e:
        print(f"Auto install websockets failed: {e}")

try:
    import websockets
except ImportError:
    # 极低概率安装失败时的简易 Socket-Based WebSocket 兜底
    # 这里我们假定系统已成功安装 websockets 库
    pass

class HermesAIServer:
    def __init__(self, host="localhost", port=61355):
        self.host = host
        self.port = port
        self.clients = set()
        self.loop = None
        self.pending_tool_calls = {}

    async def register(self, websocket):
        self.clients.add(websocket)
        print(f"Client connected: {websocket.remote_address}")

    async def unregister(self, websocket):
        if websocket in self.clients:
            self.clients.remove(websocket)
        print(f"Client disconnected")

    async def start(self):
        self.loop = asyncio.get_running_loop()
        async with websockets.serve(self.handler, self.host, self.port):
            print(f"Hermes AI WebSocket Server running on ws://{self.host}:{self.port}")
            await asyncio.Future()  # keep server running

    async def handler(self, websocket, path=None):
        await self.register(websocket)
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.process_client_message(websocket, data)
                except Exception as e:
                    print(f"Error handling message: {e}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": str(e)
                    }))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister(websocket)

    async def process_client_message(self, websocket, data):
        action = data.get("action")
        if action == "chat":
            prompt = data.get("prompt", "").strip()
            system_prompt = data.get("system", "")
            await self.handle_chat_request(websocket, prompt, system_prompt)
        elif action == "tool_result":
            call_id = data.get("id")
            result = data.get("result")
            await self.handle_tool_result(websocket, call_id, result)

    async def handle_chat_request(self, websocket, prompt, system_prompt):
        prompt_lower = prompt.lower()
        
        # 1. 模拟工具调用决策器 (NLP 规则匹配)
        # 连接主机场景
        if any(x in prompt_lower for x in ["连接", "登录", "连上", "connect", "ssh"]):
            planet_keys = {
                "水星": "mercury", "金星": "venus", "地球": "earth", 
                "火星": "mars", "木星": "jupiter", "土星": "saturn", 
                "海王星": "neptune"
            }
            matched_key = None
            for name, key in planet_keys.items():
                if name in prompt:
                    matched_key = key
                    break
            
            if matched_key:
                call_id = f"call_{int(asyncio.get_event_loop().time())}_conn"
                self.pending_tool_calls[call_id] = {"action": "connect", "key": matched_key}
                
                await websocket.send(json.dumps({
                    "type": "tool_call",
                    "id": call_id,
                    "name": "connect_to_host",
                    "arguments": {"key": matched_key}
                }))
            else:
                call_id = f"call_{int(asyncio.get_event_loop().time())}_list"
                self.pending_tool_calls[call_id] = {"action": "list_before_connect", "original_prompt": prompt}
                
                await websocket.send(json.dumps({
                    "type": "tool_call",
                    "id": call_id,
                    "name": "get_hosts_list",
                    "arguments": {}
                }))
            return

        # 执行命令场景
        if any(x in prompt_lower for x in ["执行", "运行", "run", "cmd", "命令", "查看进程", "查看磁盘", "进程", "磁盘", "cpu", "内存", "df", "ps", "top"]):
            command = "df -h" 
            if "进程" in prompt or "ps" in prompt_lower:
                command = "ps aux | head -n 15"
            elif "内存" in prompt or "free" in prompt_lower:
                command = "free -m"
            elif "cpu" in prompt or "top" in prompt_lower:
                command = "top -b -n 1 | head -n 12"
            
            custom_cmds = re.findall(r"['\"`](.*?)['\"`]", prompt)
            if custom_cmds:
                command = custom_cmds[0]
            else:
                # 模糊剔除多余文字
                clean_cmd = prompt
                for word in ["执行", "运行", "跑个", "跑一下", "命令", "指令", "在终端", "在控制台"]:
                    clean_cmd = clean_cmd.replace(word, "")
                clean_cmd = clean_cmd.strip()
                if len(clean_cmd) > 1 and clean_cmd not in ["进程", "磁盘", "cpu", "内存"]:
                    command = clean_cmd
            
            call_id = f"call_{int(asyncio.get_event_loop().time())}_cmd"
            self.pending_tool_calls[call_id] = {"action": "cmd", "command": command}
            
            await websocket.send(json.dumps({
                "type": "tool_call",
                "id": call_id,
                "name": "execute_terminal_command",
                "arguments": {"command": command}
            }))
            return

        # 2. 正常聊天回复
        response_text = f"我是 **Hermes AI 智能运维助手**。我已经接收到了您的指令。\n\n作为一个运行在 LdySSH 中的智能 Copilot，我可以帮您执行如下操作：\n\n1. 🌐 **自动发起 SSH 连接**：您可以说 *'连接木星主机'* 或 *'连上海的主机'*，我将自动帮您打开终端。\n2. ⚡ **快捷在当前终端执行命令**：如说 *'查看服务器内存'*，或 *执行 'ls -la'*，我会帮您在当前会话中下发命令（此操作需要您在弹窗中点按**授权执行**后才会生效）。\n3. 📊 **集群管理**：列出您所有保存的分组和机器。\n\n请问您想要进行哪项操作？"
        await websocket.send(json.dumps({
            "type": "response",
            "text": response_text
        }))

    async def handle_tool_result(self, websocket, call_id, result):
        if call_id not in self.pending_tool_calls:
            await websocket.send(json.dumps({
                "type": "response",
                "text": "操作已完成，但我丢失了此任务的执行上下文。请问还有什么我可以帮您的？"
            }))
            return

        ctx = self.pending_tool_calls.pop(call_id)
        action = ctx.get("action")

        if action == "list_before_connect":
            hosts = result if isinstance(result, list) else []
            orig_prompt = ctx.get("original_prompt", "")
            
            target_host = None
            for h in hosts:
                name = h.get("name", "").lower()
                key = h.get("key", "").lower()
                hostname = h.get("hostname", "").lower()
                if name in orig_prompt.lower() or key in orig_prompt.lower() or hostname in orig_prompt.lower():
                    target_host = h
                    break
            
            if target_host:
                new_call_id = f"call_{int(asyncio.get_event_loop().time())}_conn"
                self.pending_tool_calls[new_call_id] = {"action": "connect", "key": target_host["key"]}
                await websocket.send(json.dumps({
                    "type": "tool_call",
                    "id": new_call_id,
                    "name": "connect_to_host",
                    "arguments": {"key": target_host["key"]}
                }))
            else:
                if not hosts:
                    reply = "我读取了您的保存列表，发现当前**没有保存任何 SSH 主机配置**。您可以先在左侧侧栏中新建一个连接。"
                else:
                    reply = "我已获取到您的主机列表，请问您想要连接下面哪台机器？（请输入名称，如 *'连接木星'*）：\n\n"
                    for h in hosts:
                        reply += f"* 🪐 **{h['name']}** (`{h['username']}@{h['hostname']}`) - 分组: {h['group']}\n"
                await websocket.send(json.dumps({
                    "type": "response",
                    "text": reply
                }))
        
        elif action == "connect":
            if result.get("success"):
                await websocket.send(json.dumps({
                    "type": "response",
                    "text": f"🚀 **已成功向客户端发起连接请求！**\n主机星体正通过引力轨道进行坍缩跃迁，请查看新打开的终端窗口。"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "response",
                    "text": f"⚠️ **自动发起连接失败**：{result.get('error', '未知错误')}"
                }))
                
        elif action == "cmd":
            if result.get("success"):
                await websocket.send(json.dumps({
                    "type": "response",
                    "text": f"✅ **已成功下发命令！**\n命令 `\"{ctx.get('command')}\"` 已成功送达终端执行。数据反馈将显示在主终端窗口内。"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "response",
                    "text": f"❌ **终端命令发送失败**：{result.get('error', '未知错误')}"
                }))

def run_server():
    # 检查 asyncio loop，避免在线程中引发冲突
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        server = HermesAIServer()
        loop.run_until_complete(server.start())
    except Exception as e:
        print(f"Error in running WebSocket server: {e}")

def start_ai_agent_server():
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    print("Hermes AI WebSocket Backend Server thread started.")

if __name__ == "__main__":
    run_server()
