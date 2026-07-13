import json
import unittest
from pathlib import Path
from src.config import Config
from src.connection_store import ConnectionStore

class ConnectionStoreSafetyTests(unittest.TestCase):
    def setUp(self):
        self.config = Config()
        self.config.config_dir = "tests"
        self.config.connections_file = "tests/test_connections.json"
        self.config.key_file = "tests/test_key.key"
        self.test_file = Path(self.config.connections_file)
        
        # 清理可能残留的 key 文件和 connections 文件
        if self.test_file.exists():
            self.test_file.unlink()
        key_path = Path(self.config.key_file)
        if key_path.exists():
            key_path.unlink()
        key_info_file = Path(self.config.config_dir) / ".key_info"
        if key_info_file.exists():
            key_info_file.unlink()
            
        self.store = ConnectionStore(self.config)

    def tearDown(self):
        if self.test_file.exists():
            self.test_file.unlink()
        key_path = Path(self.config.key_file)
        if key_path.exists():
            key_path.unlink()
        key_info_file = Path(self.config.config_dir) / ".key_info"
        if key_info_file.exists():
            key_info_file.unlink()

    def test_save_and_delete_keeps_other_passwords_encrypted(self):
        # 1. 保存第一台主机连接（带密码）
        conn1 = {
            "name": "Host 1",
            "hostname": "192.168.1.1",
            "username": "user1",
            "port": 22,
            "password": "secret_password_1"
        }
        self.assertTrue(self.store.save_connection(conn1))
        
        # 验证写入磁盘时已经被加密
        with open(self.test_file, "r") as f:
            raw_data = json.load(f)
        key1 = "192.168.1.1@user1"
        self.assertTrue(raw_data[key1].get("password_encrypted"))
        self.assertNotEqual(raw_data[key1]["password"], "secret_password_1")
        
        # 2. 保存第二台主机连接，验证不会破坏第一台主机的加密密码状态
        conn2 = {
            "name": "Host 2",
            "hostname": "192.168.1.2",
            "username": "user2",
            "port": 22,
            "password": "secret_password_2"
        }
        self.assertTrue(self.store.save_connection(conn2))
        
        # 验证两台主机在磁盘上的密码都是加密的！
        with open(self.test_file, "r") as f:
            raw_data_v2 = json.load(f)
        key2 = "192.168.1.2@user2"
        
        self.assertTrue(raw_data_v2[key1].get("password_encrypted"))
        self.assertNotEqual(raw_data_v2[key1]["password"], "secret_password_1")
        
        self.assertTrue(raw_data_v2[key2].get("password_encrypted"))
        self.assertNotEqual(raw_data_v2[key2]["password"], "secret_password_2")

        # 3. 删除第二台主机，验证第一台主机的加密密码仍然保持加密
        self.assertTrue(self.store.delete_connection(key2))
        
        with open(self.test_file, "r") as f:
            raw_data_v3 = json.load(f)
            
        self.assertNotIn(key2, raw_data_v3)
        self.assertTrue(raw_data_v3[key1].get("password_encrypted"))
        self.assertNotEqual(raw_data_v3[key1]["password"], "secret_password_1")

if __name__ == "__main__":
    unittest.main()
