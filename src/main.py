"""Main application entry point for PrismSSH."""

import sys
import os
import platform
import json
from pathlib import Path

# Force GTK backend on Linux to avoid PyQt5/Python 3.13 compatibility issues
if platform.system() == 'Linux' and 'PYWEBVIEW_GUI' not in os.environ:
    os.environ['PYWEBVIEW_GUI'] = 'gtk'

import webview

# Add src directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Handle imports - try relative first, then absolute
try:
    from .config import Config
    from .logger import Logger
    from .api import PrismSSHAPI
    from .ai_agent import start_ai_agent_server
    from .local_llm import start_local_llm_backend, stop_local_llm_backend
except ImportError:
    # Fallback to absolute imports when running as script
    from config import Config
    from logger import Logger
    from api import PrismSSHAPI
    from ai_agent import start_ai_agent_server
    from local_llm import start_local_llm_backend, stop_local_llm_backend


import subprocess

hermes_process = None

def ensure_hermes_dependencies(logger):
    try:
        import yaml
        import cryptography
        logger.info("Hermes dependencies (pyyaml, cryptography) are already satisfied.")
    except ImportError:
        logger.info("Hermes dependencies missing. Auto installing...")
        try:
            # 静默安装最小依赖
            subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml", "cryptography"])
            logger.info("Hermes dependencies installed successfully.")
        except Exception as e:
            logger.error(f"Failed to install Hermes dependencies: {e}")

def setup_local_llm_backend(logger):
    """
    Auto configures local standalone LLM backend config and triggers asset downloading/launch.
    """
    try:
        # Start local LLM background server (or Mock API server)
        start_local_llm_backend()
    except Exception as e:
        logger.error(f"Failed to start local LLM backend: {e}")
        
    # Write pre-configured config.yaml and settings.json targeting port 61357 (OpenAI API)
    hermes_home = Path.home() / ".prismssh" / "hermes_home"
    hermes_home.mkdir(parents=True, exist_ok=True)
    
    config_yaml_path = hermes_home / "config.yaml"
    settings_json_path = hermes_home / "webui" / "settings.json"
    
    config_content = """model:
  provider: openai
  name: qwen2.5-coder-1.5b-instruct
providers:
  openai:
    api_key: sk-local-prismssh
    base_url: http://127.0.0.1:61357/v1
"""
    try:
        config_yaml_path.write_text(config_content, encoding="utf-8")
        logger.info("Wrote pre-configured config.yaml referencing local llama-server via OpenAI API")
    except Exception as e:
        logger.error(f"Failed to write config.yaml: {e}")
        
    settings_content = """{
  "onboarding_completed": true,
  "default_model": "qwen2.5-coder-1.5b-instruct",
  "default_provider": "openai"
}"""
    try:
        settings_json_path.parent.mkdir(parents=True, exist_ok=True)
        settings_json_path.write_text(settings_content, encoding="utf-8")
        logger.info("Wrote pre-configured settings.json with onboarding_completed=true")
    except Exception as e:
        logger.error(f"Failed to write settings.json: {e}")

def start_hermes_webui_server(logger):
    global hermes_process
    ensure_hermes_dependencies(logger)
    
    # Start local LLM backend and setup config
    try:
        setup_local_llm_backend(logger)
    except Exception as e:
        logger.error(f"Failed to auto-configure local LLM: {e}")
    
    if hasattr(sys, '_MEIPASS'):
        base_dir = Path(sys._MEIPASS)
        hermes_dir = base_dir / "upstream-hermes-webui"
        parent_dir = base_dir
    else:
        parent_dir = Path(__file__).parent.parent
        hermes_dir = parent_dir / "upstream-hermes-webui"
        if not hermes_dir.exists():
            hermes_dir = Path(__file__).parent / "upstream-hermes-webui"
            parent_dir = Path(__file__).parent
    server_script = hermes_dir / "server.py"
    
    if not server_script.exists():
        logger.error(f"Hermes WebUI server script not found at {server_script}")
        return
        
    try:
        logger.info(f"Starting Hermes WebUI Server from {hermes_dir}...")
        creationflags = 0
        if platform.system() == "Windows":
            creationflags = 0x08000000  # CREATE_NO_WINDOW
            
        import os
        env = os.environ.copy()
        env["HERMES_WEBUI_PORT"] = "61356"
        env["HERMES_HOME"] = str(Path.home() / ".prismssh" / "hermes_home")
        env["HERMES_WEBUI_DEFAULT_WORKSPACE"] = str(parent_dir.resolve())

        # Redirect stdout/stderr to help diagnostic
        log_dir = Path.home() / ".prismssh"
        log_dir.mkdir(exist_ok=True)
        log_file_path = log_dir / "hermes_server_debug.log"
        log_file = open(log_file_path, "a", encoding="utf-8")

        hermes_process = subprocess.Popen(
            [sys.executable, str(server_script)],
            cwd=str(hermes_dir),
            env=env,
            creationflags=creationflags,
            stdout=log_file,
            stderr=log_file
        )
        logger.info(f"Hermes WebUI Server started successfully (PID: {hermes_process.pid})")
    except Exception as e:
        logger.error(f"Failed to start Hermes WebUI Server: {e}")

def stop_hermes_webui_server(logger):
    global hermes_process
    
    # Clean up local LLM processes
    try:
        stop_local_llm_backend()
    except Exception as e:
        logger.error(f"Error stopping local LLM backend: {e}")

    if hermes_process:
        try:
            logger.info(f"Terminating Hermes WebUI Server (PID: {hermes_process.pid})...")
            hermes_process.terminate()
            hermes_process.wait(timeout=3)
            logger.info("Hermes WebUI Server stopped.")
        except Exception as e:
            logger.error(f"Error stopping Hermes WebUI Server: {e}")
            try:
                hermes_process.kill()
                logger.info("Hermes WebUI Server killed.")
            except:
                pass
        hermes_process = None


def load_html_template() -> str:
    """Load the HTML template and embed CSS/JS."""
    if hasattr(sys, '_MEIPASS'):
        base_dir = Path(sys._MEIPASS) / "src"
    else:
        base_dir = Path(__file__).parent
        
    template_path = base_dir / "ui" / "template.html"
    css_path = base_dir / "ui" / "static" / "styles.css"
    js_path = base_dir / "ui" / "static" / "app.js"
    
    if not template_path.exists():
        # Fallback to inline HTML if template file doesn't exist
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>LdySSH - Template Not Found</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background: #1a1a1a; 
                    color: #fff; 
                }
            </style>
        </head>
        <body>
            <h1>LdySSH</h1>
            <p>Template file not found. Please ensure the UI template is available.</p>
        </body>
        </html>
        """
    
    try:
        # Load template
        with open(template_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        # Load CSS
        css_content = ""
        if css_path.exists():
            with open(css_path, 'r', encoding='utf-8') as f:
                css_content = f.read()
        
        # Load JavaScript
        js_content = ""
        for js_file in ["core-topology.js", "app.js", "hermes-agent.js"]:
            full_js_path = base_dir / "ui" / "static" / js_file
            if full_js_path.exists():
                with open(full_js_path, 'r', encoding='utf-8') as f:
                    js_content += f.read() + "\n\n"
        
        # Embed CSS and JS into the HTML
        html_content = html_content.replace(
            '    <style>',
            f'    <style>\n{css_content}\n        /*'
        )
        html_content = html_content.replace(
            '    <script>',
            f'    <script>\n{js_content}\n        //'
        )
        
        return html_content
        
    except Exception as e:
        print(f"Error loading template: {e}")
        return f"<html><body><h1>Error loading template: {e}</h1></body></html>"


def main():
    """Main application entry point."""
    import argparse
    parser = argparse.ArgumentParser(description="PrismSSH Backend / Client")
    parser.add_argument("--backend-only", action="store_true", help="Start only backend services (no GUI window)")
    args, unknown = parser.parse_known_args()

    # Initialize configuration
    config = Config()
    
    # Setup logging
    logger_instance = Logger(config.log_file)
    logger = Logger.get_logger(__name__)

    try:
        start_ai_agent_server()
    except Exception as e:
        print(f"Failed to start AI Agent Server: {e}")

    # Start Hermes WebUI Server
    start_hermes_webui_server(logger)
    
    if args.backend_only:
        logger.info("=== LdySSH Backend Only Mode (Daemon) Started ===")
        try:
            import time
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            stop_hermes_webui_server(logger)
            logger.info("=== LdySSH Backend Only Mode Stopped ===")
        sys.exit(0)

    logger.info("=== LdySSH Starting ===")
    logger.info(f"Config directory: {config.config_dir}")
    logger.info(f"Encryption available: {os.path.exists(config.key_file) if hasattr(config, 'key_file') else 'Unknown'}")
    
    # Ensure config directory exists
    if not config.ensure_config_dir():
        logger.error("Failed to create configuration directory")
        sys.exit(1)
    
    # Check if connections file exists
    if Path(config.connections_file).exists():
        logger.info(f"Found existing connections file: {config.connections_file}")
        try:
            import json
            with open(config.connections_file, 'r') as f:
                data = json.load(f)
                logger.info(f"Loaded {len(data)} saved connections")
        except Exception as e:
            logger.error(f"Error reading connections file: {e}")
    else:
        logger.info("No existing connections file found")
    
    # Create API instance
    try:
        api = PrismSSHAPI(config)
        logger.info("API instance created successfully")
    except Exception as e:
        logger.error(f"Failed to create API instance: {e}")
        sys.exit(1)
    
    # Load HTML template
    html_content = load_html_template()
    
    # Create window
    try:
        window = webview.create_window(
            title=config.get_app_title(),
            html=html_content,
            js_api=api,
            width=config.window_width,
            height=config.window_height,
            min_size=(config.window_min_width, config.window_min_height),
            resizable=True
        )
        logger.info("WebView window created")

        # Give API access to window for JS calls
        api.set_window(window)

        # Register cleanup on window close
        def on_window_closed():
            logger.info("Window closed, cleaning up...")
            stop_hermes_webui_server(logger)
            api.cleanup()

        # Start the GUI
        logger.info("Starting WebView...")
        webview.start(debug=False)
        
    except Exception as e:
        logger.error(f"Error starting application: {e}")
        sys.exit(1)
    finally:
        # Cleanup
        try:
            stop_hermes_webui_server(logger)
        except:
            pass
        try:
            api.cleanup()
        except:
            pass
        logger.info("=== LdySSH Shutdown ===")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        pass