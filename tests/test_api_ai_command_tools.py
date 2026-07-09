import base64
import json
from pathlib import Path

from src.api import PrismSSHAPI
from src.config import Config


def make_api(tmp_path: Path) -> PrismSSHAPI:
    config = Config()
    config.config_dir = str(tmp_path)
    config.connections_file = str(tmp_path / "connections.json")
    config.key_file = str(tmp_path / ".key")
    config.log_file = str(tmp_path / "prismssh.log")
    return PrismSSHAPI(config)


def test_command_library_round_trip(tmp_path):
    api = make_api(tmp_path)
    try:
        folders = [{"id": "ops", "name": "运维", "commands": [{"id": "disk", "name": "磁盘", "command": "df -h"}]}]

        save_result = json.loads(api.save_command_library(json.dumps(folders, ensure_ascii=False)))
        load_result = json.loads(api.get_command_library())

        assert save_result["success"] is True
        assert load_result["success"] is True
        assert load_result["folders"] == folders
    finally:
        api.cleanup()


def test_run_codex_invokes_cli(monkeypatch, tmp_path):
    api = make_api(tmp_path)
    calls = []

    class Result:
        returncode = 0
        stdout = "done"
        stderr = ""

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return Result()

    monkeypatch.setattr("src.api.subprocess.run", fake_run)

    try:
        result = json.loads(api.run_codex(json.dumps({
            "command": "codex",
            "workingDirectory": str(tmp_path),
            "prompt": "分析错误日志"
        }, ensure_ascii=False)))

        assert result["success"] is True
        assert result["output"] == "done"
        assert calls[0][0] == ["codex", "exec", "-C", str(tmp_path), "-"]
        assert calls[0][1]["cwd"] == str(tmp_path)
        assert calls[0][1]["input"] == "分析错误日志"
    finally:
        api.cleanup()


def test_send_input_base64_decodes_before_dispatch(tmp_path):
    api = make_api(tmp_path)
    sent = []
    api.session_manager.send_input = lambda session_id, data: sent.append((session_id, data)) or True

    try:
        payload = base64.b64encode("df -h\n".encode("utf-8")).decode("ascii")
        result = json.loads(api.send_input_base64("session_1", payload))

        assert result["success"] is True
        assert sent == [("session_1", "df -h\n")]
    finally:
        api.cleanup()


def test_save_saved_connection_replaces_old_key(tmp_path):
    api = make_api(tmp_path)

    try:
        original = {
            "hostname": "10.0.0.8",
            "port": 22,
            "username": "root",
            "password": "secret",
            "name": "prod-1"
        }
        updated = {
            "hostname": "10.0.0.8",
            "port": 2222,
            "username": "deploy",
            "password": "secret",
            "name": "prod-main"
        }

        assert api.connection_store.save_connection(original) is True
        result = json.loads(api.save_saved_connection("10.0.0.8@root", json.dumps(updated)))
        connections = api.connection_store.load_connections()

        assert result == {"success": True, "key": "10.0.0.8@deploy"}
        assert "10.0.0.8@root" not in connections
        assert connections["10.0.0.8@deploy"]["name"] == "prod-main"
        assert connections["10.0.0.8@deploy"]["port"] == 2222
    finally:
        api.cleanup()
