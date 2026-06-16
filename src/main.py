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
except ImportError:
    # Fallback to absolute imports when running as script
    from config import Config
    from logger import Logger
    from api import PrismSSHAPI
    from ai_agent import start_ai_agent_server


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
    try:
        start_ai_agent_server()
    except Exception as e:
        print(f"Failed to start AI Agent Server: {e}")
    
    # Initialize configuration
    config = Config()
    
    # Setup logging
    logger_instance = Logger(config.log_file)
    logger = Logger.get_logger(__name__)
    
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
            min_size=(config.window_min_width, config.window_min_height)
        )
        logger.info("WebView window created")

        # Give API access to window for JS calls
        api.set_window(window)

        # Register cleanup on window close
        def on_window_closed():
            logger.info("Window closed, cleaning up...")
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