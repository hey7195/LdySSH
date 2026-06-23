import os
import sys
import time
import threading
import subprocess
import zipfile
import json
import urllib.request
import urllib.error
import socket
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import logging
logger = logging.getLogger("PrismSSH.LocalLLM")

# Thread-safe global variables for download status
download_progress_engine = 0.0
download_progress_model = 0.0
download_status = "idle"       # "idle", "downloading", "completed", "failed"
download_error = ""
download_speed_text = "0 KB/s"

llama_process = None
mock_server = None
download_thread = None
status_lock = threading.Lock()

def get_app_dir() -> Path:
    """
    Get LdySSH installation or runtime root directory.
    """
    if hasattr(sys, '_MEIPASS'):
        return Path(sys.executable).parent
    else:
        return Path(__file__).parent.parent

def get_ui_hermes_dir() -> Path:
    app_dir = get_app_dir()
    p1 = app_dir / "ui" / "hermes"
    if p1.exists():
        return p1
    p2 = app_dir / "src" / "ui" / "hermes"
    if p2.exists():
        return p2
    return p1 # fallback

def update_ui_status_file():
    try:
        hermes_dir = get_ui_hermes_dir()
        hermes_dir.mkdir(parents=True, exist_ok=True)
        status_file = hermes_dir / "status.json"
        
        with status_lock:
            status = download_status
            err = download_error
            prog_eng = download_progress_engine
            prog_mod = download_progress_model
            speed = download_speed_text
            
        res = {
            "success": True,
            "status": status,
            "progress_engine": prog_eng,
            "progress_model": prog_mod,
            "speed": speed,
            "error": err
        }
        status_file.write_text(json.dumps(res), encoding='utf-8')
    except Exception as e:
        logger.error(f"Failed to write status.json: {e}")

def is_port_in_use(port: int) -> bool:
    """
    Check if a local TCP port is currently in use.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def download_file_with_progress(url: str, dest_path: Path, progress_callback, user_agent="Mozilla/5.0"):
    """
    Download a file chunks by chunks and update progress, reporting speed.
    """
    req = urllib.request.Request(url, headers={'User-Agent': user_agent})
    chunk_size = 512 * 1024 # 512 KB
    
    # 3 retries
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                start_time = time.time()
                last_time = start_time
                last_downloaded = 0
                
                global download_speed_text
                
                with open(dest_path, 'wb') as f:
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        # Calculate progress percentage
                        progress = 0.0
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100.0
                        
                        # Speed calculation every 0.5s
                        current_time = time.time()
                        if current_time - last_time >= 0.5:
                            elapsed = current_time - last_time
                            speed = (downloaded - last_downloaded) / elapsed
                            last_downloaded = downloaded
                            last_time = current_time
                            
                            with status_lock:
                                if speed > 1024 * 1024:
                                    download_speed_text = f"{speed / (1024*1024):.1f} MB/s"
                                elif speed > 1024:
                                    download_speed_text = f"{speed / 1024:.1f} KB/s"
                                else:
                                    download_speed_text = f"{speed:.0f} B/s"
                        
                        progress_callback(progress)
                return # Successful download
        except Exception as e:
            logger.warning(f"Download attempt {attempt+1} failed for {url}: {e}")
            if attempt == max_retries - 1:
                raise e
            time.sleep(2)

def download_and_extract_engine(bin_dir: Path):
    """
    Download llama-server zip from mirrors and extract llama-server.exe
    """
    global download_progress_engine
    zip_path = bin_dir / "llama_temp.zip"
    
    # Mirror list for high speed downloads in China / Global
    urls = [
        "https://mirror.ghproxy.com/https://github.com/ggml-org/llama.cpp/releases/download/b3152/llama-b3152-bin-win-avx2-x64.zip",
        "https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/b3152/llama-b3152-bin-win-avx2-x64.zip",
        "https://ghproxy.net/https://github.com/ggml-org/llama.cpp/releases/download/b3152/llama-b3152-bin-win-avx2-x64.zip",
        "https://github.com/ggml-org/llama.cpp/releases/download/b3152/llama-b3152-bin-win-avx2-x64.zip"
    ]
    
    def update_eng_progress(p):
        global download_progress_engine
        with status_lock:
            download_progress_engine = p
        update_ui_status_file()
            
    success = False
    last_err = None
    for url in urls:
        logger.info(f"Attempting to download engine from: {url}")
        try:
            download_file_with_progress(url, zip_path, update_eng_progress)
            success = True
            break
        except Exception as e:
            last_err = e
            logger.warning(f"Engine download failed from {url}: {e}")
            
    if not success:
        raise last_err or Exception("All engine download URLs failed")
        
    logger.info("Extracting llama-server.exe and dynamic libraries from zip...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        found_server = False
        for file_info in zip_ref.infolist():
            filename = os.path.basename(file_info.filename)
            if not filename:
                continue
            if filename.endswith("llama-server.exe") or filename.endswith(".dll"):
                data = zip_ref.read(file_info.filename)
                dest_file = bin_dir / filename
                dest_file.write_bytes(data)
                logger.info(f"Successfully extracted {filename} to {dest_file}")
                if filename.endswith("llama-server.exe"):
                    found_server = True
        if not found_server:
            raise Exception("llama-server.exe not found inside the downloaded zip archive")
            
    # Clean up temp file
    if zip_path.exists():
        try:
            os.remove(zip_path)
        except Exception:
            pass

def download_model(models_dir: Path):
    """
    Download Qwen2.5-Coder-1.5B GGUF from ModelScope
    """
    global download_progress_model
    model_url = "https://www.modelscope.cn/api/v1/models/qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/repo?Revision=master&FilePath=qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
    dest_path = models_dir / "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
    
    def update_model_progress(p):
        global download_progress_model
        with status_lock:
            download_progress_model = p
        update_ui_status_file()
            
    logger.info(f"Downloading model from ModelScope: {model_url}")
    download_file_with_progress(model_url, dest_path, update_model_progress)
    logger.info("Successfully downloaded Qwen2.5-Coder-1.5B GGUF model")

def download_worker():
    """
    Background worker thread to pull assets and switch server
    """
    global download_status, download_error
    try:
        app_dir = get_app_dir()
        bin_dir = app_dir / "bin"
        models_dir = app_dir / "models"
        
        bin_dir.mkdir(parents=True, exist_ok=True)
        models_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. Download engine
        llama_exe = bin_dir / "llama-server.exe"
        llama_dll = bin_dir / "llama.dll"
        if not llama_exe.exists() or not llama_dll.exists():
            with status_lock:
                download_status = "downloading"
            update_ui_status_file()
            logger.info("Engine llama-server.exe or llama.dll not found. Starting download...")
            download_and_extract_engine(bin_dir)
        else:
            with status_lock:
                download_progress_engine = 100.0
            update_ui_status_file()
                
        # 2. Download model
        model_file = models_dir / "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
        if not model_file.exists():
            with status_lock:
                download_status = "downloading"
            update_ui_status_file()
            logger.info("Model GGUF file not found. Starting download...")
            download_model(models_dir)
        else:
            with status_lock:
                download_progress_model = 100.0
            update_ui_status_file()
                
        # 3. Mark completed
        with status_lock:
            download_status = "completed"
        update_ui_status_file()
        logger.info("All local LLM assets verified successfully. Transitioning to real llama-server...")
        
        # Shutdown Mock server
        stop_mock_api_server()
        
        # Allow socket resource to fully bind free
        time.sleep(1.0)
        
        # Launch real llama-server.exe
        start_real_llama_server()
        
    except Exception as e:
        logger.error(f"Error in local LLM download worker: {e}")
        with status_lock:
            download_status = "failed"
            download_error = str(e)
        update_ui_status_file()

# ── Mock HTTP Server ────────────────────────────────────────────────────────

class MockOpenAIServer(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence default http.server logs to stderr
        pass
        
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.end_headers()
        
    def do_GET(self):
        if self.path == "/v1/models":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            res = {
                "object": "list",
                "data": [
                    {
                        "id": "qwen2.5-coder-1.5b-instruct",
                        "object": "model",
                        "created": 1686935002,
                        "owned_by": "prismssh"
                    }
                ]
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))
        elif self.path == "/v1/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            with status_lock:
                status = download_status
                err = download_error
                prog_eng = download_progress_engine
                prog_mod = download_progress_model
                speed = download_speed_text
                
            res = {
                "success": True,
                "status": status,
                "progress_engine": prog_eng,
                "progress_model": prog_mod,
                "speed": speed,
                "error": err
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            
    def do_POST(self):
        if self.path == "/v1/chat/completions":
            content_length = int(self.headers.get('Content-Length', 0))
            is_stream = True
            try:
                if content_length > 0:
                    post_data = self.rfile.read(content_length).decode('utf-8')
                    req_json = json.loads(post_data)
                    is_stream = req_json.get("stream", False)
            except Exception:
                pass
                
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream" if is_stream else "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()
            
            if not is_stream:
                status_desc = "【🔮 本地 AI 首次集成中】推理引擎和 1.5B 物理大模型正在下载中，请稍候。"
                res = {
                    "id": "chatcmpl-mock",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": "qwen2.5-coder-1.5b-instruct",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": status_desc
                            },
                            "finish_reason": "stop"
                        }
                    ]
                }
                self.wfile.write(json.dumps(res).encode('utf-8'))
                return
                
            # Stream response (SSE)
            init_msg = (
                "【🔮 本地 AI 首次集成中】\n"
                "您好！为了实现‘双击开箱即用’且完全不依赖您电脑上安装任何全局大模型软件（如 Ollama），我们正在自动为您在本地目录中部署轻量级的本地推理引擎（llama-server.exe）与 1.5B 物理模型文件。首次启动需要进行依赖补全（文件大小约 1.05 GB），在后续使用中均完全本地离线运行，彻底绿色！\n\n"
                "我们将每隔 2 秒在此为您流式更新下载进度，下载完毕后将自动热加载！\n\n"
            )
            
            self.send_sse_chunk(init_msg)
            
            with status_lock:
                status = download_status
                err = download_error
                prog_eng = download_progress_engine
                prog_mod = download_progress_model
                speed = download_speed_text
                
            if status == "completed":
                finish_msg = (
                    "🎉 **本地推理引擎和模型已自动下载并集成成功！**\n"
                    "正在拉起本地高性能推理服务器（约 2 秒），您可以重新发送您的提问，即可开始对话！"
                )
                self.send_sse_chunk(finish_msg)
            elif status == "failed":
                err_msg = f"❌ **本地 AI 服务集成失败**：{err}\n您可以检查网络连接并尝试重新启动软件。"
                self.send_sse_chunk(err_msg)
            else:
                # Instant response with current progress, preventing proxy timeout issues
                init_msg = (
                    "【🔮 本地 AI 首次集成中】\n"
                    "您好！为了实现‘双击开箱即用’且完全离线运行（无需您安装 Ollama 软件），我们正在自动为您部署本地推理引擎（llama-server.exe）与 1.5B 物理大模型（约 1.05 GB）。\n\n"
                )
                self.send_sse_chunk(init_msg)
                
                progress_line = (
                    f"⏳ **实时进度**：\n"
                    f" - 🎯 AI 推理引擎 (llama-server.exe): **{prog_eng:.1f}%**\n"
                    f" - 🧠 1.5B 物理模型 (Qwen2.5-Coder): **{prog_mod:.1f}%** ({speed})\n\n"
                    "💡 *下载正在后台快速进行。请您在 5-10 秒后发送任意字符（例如 '.'）重新查询最新进度，集成完毕后即可正常对话！*"
                )
                self.send_sse_chunk(progress_line)
                
            try:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception:
                pass
        else:
            self.send_response(404)
            self.end_headers()

    def send_sse_chunk(self, content: str):
        data = {
            "choices": [
                {
                    "delta": {
                        "content": content
                    },
                    "index": 0,
                    "finish_reason": None
                }
            ]
        }
        self.wfile.write(f"data: {json.dumps(data)}\n\n".encode('utf-8'))
        self.wfile.flush()

def start_mock_api_server():
    """
    Launch the mock OpenAI completions server on port 61357.
    """
    global mock_server
    try:
        mock_server = ThreadingHTTPServer(('127.0.0.1', 61357), MockOpenAIServer)
        logger.info("Mock LLM HTTP Server started on http://127.0.0.1:61357")
        t = threading.Thread(target=mock_server.serve_forever, daemon=True)
        t.start()
    except Exception as e:
        logger.error(f"Failed to start Mock LLM Server: {e}")

def stop_mock_api_server():
    """
    Stop the mock HTTP server.
    """
    global mock_server
    if mock_server:
        try:
            logger.info("Stopping Mock LLM HTTP Server...")
            mock_server.shutdown()
            mock_server.server_close()
            logger.info("Mock LLM HTTP Server stopped.")
        except Exception as e:
            logger.error(f"Error stopping Mock LLM Server: {e}")
        mock_server = None

# ── Real llama-server.exe Control ───────────────────────────────────────────

def start_real_llama_server():
    """
    Launch the actual llama-server.exe in background.
    """
    global llama_process
    app_dir = get_app_dir()
    llama_exe = app_dir / "bin" / "llama-server.exe"
    model_file = app_dir / "models" / "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
    
    if not llama_exe.exists() or not model_file.exists():
        logger.error("Cannot launch real llama-server: assets missing.")
        return
        
    # Check port conflicts
    if is_port_in_use(61357):
        logger.warning("Port 61357 is already in use. Retrying to launch real server anyway.")
        
    cmd = [
        str(llama_exe),
        "-m", str(model_file),
        "--port", "61357",
        "--host", "127.0.0.1",
        "-c", "2048"
    ]
    
    logger.info(f"Launching real llama-server: {' '.join(cmd)}")
    
    creationflags = 0
    if sys.platform == "win32":
        creationflags = 0x08000000 # CREATE_NO_WINDOW
        
    try:
        # Launch process completely silent
        llama_process = subprocess.Popen(
            cmd,
            creationflags=creationflags,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        logger.info(f"Real llama-server.exe started successfully (PID: {llama_process.pid})")
    except Exception as e:
        logger.error(f"Failed to launch llama-server.exe process: {e}")

# ── Public APIs ─────────────────────────────────────────────────────────────

def start_local_llm_backend():
    """
    Start the local LLM system: Either launch llama-server directly or launch mock status server + download thread.
    """
    global download_status
    logger.info("Local LLM autostart has been completely disabled to prevent high CPU utilization.")
    with status_lock:
        download_status = "disabled"
    update_ui_status_file()

def stop_local_llm_backend():
    """
    Clean up all LLM servers and processes.
    """
    global llama_process
    
    # Stop Mock Server
    stop_mock_api_server()
    
    # Kill llama-server process
    if llama_process:
        try:
            logger.info(f"Terminating real llama-server.exe (PID: {llama_process.pid})...")
            llama_process.terminate()
            llama_process.wait(timeout=3)
            logger.info("Real llama-server.exe stopped.")
        except Exception as e:
            logger.error(f"Error stopping llama-server.exe: {e}")
            try:
                llama_process.kill()
                logger.info("llama-server.exe killed.")
            except:
                pass
        llama_process = None
