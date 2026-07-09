from __future__ import annotations
"""Connection storage and encryption management for PrismSSH."""

import json
import os
import base64
import threading
from typing import Dict, Any, Optional
from pathlib import Path

# Handle imports - try relative first, then absolute
try:
    from .config import Config
    from .logger import Logger
    from .exceptions import EncryptionError, ConfigurationError
except ImportError:
    from config import Config
    from logger import Logger
    from exceptions import EncryptionError, ConfigurationError

try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    ENCRYPTION_AVAILABLE = True
except ImportError:
    ENCRYPTION_AVAILABLE = False


class ConnectionStore:
    """Manages saved SSH connections with optional encrypted password storage."""
    
    def __init__(self, config: Config):
        self.config = config
        self.logger = Logger.get_logger(__name__)
        self.cipher = self._get_cipher() if ENCRYPTION_AVAILABLE else None
        self.encryption_warning_shown = False
        self._lock = threading.RLock()
        
        if not ENCRYPTION_AVAILABLE:
            self.logger.warning(
                "Cryptography package not installed. Passwords will be stored in plain text. "
                "Install with: pip install cryptography"
            )
        
        self._ensure_config_dir()
        self._import_ssh_config_migration()
    
    def get_encryption_status(self) -> dict:
        """Get encryption status for frontend warning."""
        return {
            'available': ENCRYPTION_AVAILABLE,
            'warning_needed': not ENCRYPTION_AVAILABLE and not self.encryption_warning_shown
        }
    
    def mark_encryption_warning_shown(self):
        """Mark that the encryption warning has been shown to the user."""
        self.encryption_warning_shown = True
    
    def _ensure_config_dir(self) -> bool:
        """Create config directory if it doesn't exist."""
        try:
            Path(self.config.config_dir).mkdir(
                mode=self.config.config_dir_permissions,
                parents=True,
                exist_ok=True
            )
            return True
        except Exception as e:
            self.logger.error(f"Error creating config directory: {e}")
            raise ConfigurationError(f"Failed to create config directory: {e}")
    
    def _get_cipher(self) -> Optional[Fernet]:
        """Get or create encryption cipher for passwords."""
        if not ENCRYPTION_AVAILABLE:
            return None
            
        try:
            key_info_file = Path(self.config.config_dir) / ".key_info"

            if Path(self.config.key_file).exists() and key_info_file.exists():
                # Load existing key and salt
                with open(self.config.key_file, 'rb') as f:
                    key = f.read()
                with open(key_info_file, 'rb') as f:
                    stored_salt = f.read()
            else:
                # Generate a new key with random salt and passphrase
                salt = os.urandom(32)  # Use 32-byte salt
                
                # Generate a random passphrase for this installation
                random_passphrase = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8')
                
                kdf = PBKDF2HMAC(
                    algorithm=hashes.SHA256(),
                    length=32,
                    salt=salt,
                    iterations=self.config.encryption_key_iterations,
                )
                key_material = kdf.derive(random_passphrase.encode())
                key = base64.urlsafe_b64encode(key_material)
                
                # Save key and salt info
                with open(self.config.key_file, 'wb') as f:
                    f.write(key)
                os.chmod(self.config.key_file, self.config.key_file_permissions)
                
                with open(key_info_file, 'wb') as f:
                    f.write(salt)
                os.chmod(key_info_file, self.config.key_file_permissions)
                
                self.logger.info("Generated new encryption key with random passphrase")
            
            return Fernet(key)
        except Exception as e:
            self.logger.error(f"Error setting up encryption: {e}")
            raise EncryptionError(f"Failed to setup encryption: {e}")
    
    def _backup_config(self):
        """Create a rolling backup (up to 5 versions) of the connections configuration."""
        try:
            conn_path = Path(self.config.connections_file)
            if not conn_path.exists() or conn_path.stat().st_size == 0:
                return
            
            # Roll backups: .bak.4 -> .bak.5, ..., connections.json -> .bak.1
            for i in range(4, 0, -1):
                src = conn_path.with_name(f"{conn_path.name}.bak.{i}")
                dst = conn_path.with_name(f"{conn_path.name}.bak.{i+1}")
                if src.exists():
                    if dst.exists():
                        dst.unlink()
                    src.rename(dst)
            
            bak1 = conn_path.with_name(f"{conn_path.name}.bak.1")
            if bak1.exists():
                bak1.unlink()
            
            import shutil
            shutil.copy2(conn_path, bak1)
            self.logger.debug("Rolling backup created for connections configuration")
        except Exception as e:
            self.logger.error(f"Error creating config backup: {e}")

    def _attempt_disaster_recovery(self) -> Optional[Dict[str, Any]]:
        """Try to recover connection settings from rolling backups .bak.1 to .bak.5."""
        conn_path = Path(self.config.connections_file)
        for i in range(1, 6):
            bak_path = conn_path.with_name(f"{conn_path.name}.bak.{i}")
            if bak_path.exists():
                try:
                    with open(bak_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    # Successfully parsed backup, write back to primary connections.json
                    self._ensure_config_dir()
                    with open(self.config.connections_file, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2)
                    self.logger.info(f"Disaster recovery: successfully restored config from backup version {i}")
                    return data
                except Exception as ex:
                    self.logger.error(f"Failed to recover from backup version {i}: {ex}")
        return None

    def _import_ssh_config_migration(self):
        """Scan ~/.ssh/config and import hosts that are not yet saved in connections.json."""
        try:
            ssh_config_path = Path.home() / ".ssh" / "config"
            if not ssh_config_path.exists():
                return
            
            self.logger.info(f"Migration Helper: Found SSH config at {ssh_config_path}, scanning...")
            
            with open(ssh_config_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            imported_count = 0
            current_host = {}
            connections = self.load_connections()
            
            for line in content.splitlines():
                line_stripped = line.strip()
                if not line_stripped or line_stripped.startswith('#'):
                    continue
                
                parts = line_stripped.split(None, 1)
                if len(parts) < 2:
                    continue
                
                key = parts[0].lower()
                val = parts[1].strip().strip('"')
                
                if key == 'host':
                    # Save previous host if valid
                    if current_host.get('hostname') and current_host.get('username'):
                        store_key = f"{current_host['hostname']}@{current_host['username']}"
                        if store_key not in connections:
                            self.save_connection(current_host)
                            connections[store_key] = current_host.copy()
                            imported_count += 1
                    
                    # Start new host parsing
                    current_host = {
                        'name': val,
                        'hostname': '',
                        'port': 22,
                        'username': '',
                        'keyPath': '',
                        'password': ''
                    }
                elif current_host:
                    if key == 'hostname':
                        current_host['hostname'] = val
                    elif key == 'user':
                        current_host['username'] = val
                    elif key == 'port':
                        try:
                            current_host['port'] = int(val)
                        except ValueError:
                            current_host['port'] = 22
                    elif key == 'identityfile':
                        expanded_path = os.path.expanduser(val)
                        current_host['keyPath'] = expanded_path
            
            # Save the last host if valid
            if current_host.get('hostname') and current_host.get('username'):
                store_key = f"{current_host['hostname']}@{current_host['username']}"
                if store_key not in connections:
                    self.save_connection(current_host)
                    imported_count += 1
            
            if imported_count > 0:
                self.logger.info(f"Migration Helper: Automatically imported {imported_count} hosts from ~/.ssh/config")
        except Exception as e:
            self.logger.error(f"Migration Helper error: {e}")

    def _load_raw_connections(self) -> Dict[str, Any]:
        """Load connections from disk without decrypting passwords."""
        with self._lock:
            if not Path(self.config.connections_file).exists():
                return {}
            try:
                with open(self.config.connections_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                self.logger.error(f"Error loading raw connections, attempting disaster recovery: {e}")
                recovered = self._attempt_disaster_recovery()
                if recovered is not None:
                    return recovered
                return {}

    def save_connection(self, connection: Dict[str, Any]) -> bool:
        """Save a connection profile."""
        with self._lock:
            try:
                connections = self._load_raw_connections()
                
                # Clone the connection object to avoid side effects on caller memory
                conn_to_save = connection.copy()
                
                # Encrypt password if encryption is available and password exists
                if self.cipher and conn_to_save.get('password'):
                    try:
                        conn_to_save['password'] = self.cipher.encrypt(
                            conn_to_save['password'].encode()
                        ).decode()
                        conn_to_save['password_encrypted'] = True
                    except Exception as e:
                        self.logger.error(f"Error encrypting password: {e}")
                        # Store in plain text if encryption fails
                        conn_to_save['password_encrypted'] = False
                
                # Use hostname@username as key
                key = f"{conn_to_save['hostname']}@{conn_to_save['username']}"
                connections[key] = conn_to_save
                
                # Ensure directory exists before writing
                self._ensure_config_dir()
                self._backup_config()
                
                with open(self.config.connections_file, 'w', encoding='utf-8') as f:
                    json.dump(connections, f, indent=2)
                    
                self.logger.info(f"Connection saved: {key}")
                return True
                
            except Exception as e:
                self.logger.error(f"Error saving connection: {e}")
                return False

    def save_raw_connection(self, key: str, connection: Dict[str, Any], old_key: str = "") -> bool:
        """Save a connection object that already has its secret fields in disk format."""
        with self._lock:
            try:
                connections = self._load_raw_connections()
                if old_key and old_key != key:
                    connections.pop(old_key, None)
                connections[key] = connection.copy()

                self._ensure_config_dir()
                self._backup_config()

                with open(self.config.connections_file, 'w', encoding='utf-8') as f:
                    json.dump(connections, f, indent=2)

                self.logger.info(f"Raw connection saved: {key}")
                return True
            except Exception as e:
                self.logger.error(f"Error saving raw connection: {e}")
                return False

    def load_connections(self) -> Dict[str, Any]:
        """Load all saved connections."""
        with self._lock:
            if not Path(self.config.connections_file).exists():
                return {}
            
            try:
                with open(self.config.connections_file, 'r', encoding='utf-8') as f:
                    connections = json.load(f)
            except Exception as e:
                self.logger.error(f"Error loading connections, attempting disaster recovery: {e}")
                recovered = self._attempt_disaster_recovery()
                if recovered is None:
                    return {}
                connections = recovered
                
            try:
                # Decrypt passwords if cipher is available
                for key, conn in connections.items():
                    if conn.get('password_encrypted') and conn.get('password') and self.cipher:
                        try:
                            conn['password'] = self.cipher.decrypt(
                                conn['password'].encode()
                              ).decode()
                        except Exception as e:
                            self.logger.error(f"Error decrypting password for {key}: {e}")
                            # If decryption fails, remove the password
                            conn['password'] = ''
                        conn.pop('password_encrypted', None)
                    elif conn.get('password_encrypted') and not self.cipher:
                        # Encrypted password but no cipher available
                        self.logger.warning(
                            f"Cannot decrypt password for {key} (install cryptography package)"
                        )
                        conn['password'] = ''
                        conn.pop('password_encrypted', None)
                
                return connections
            except Exception as e:
                self.logger.error(f"Error decrypting passwords: {e}")
                return connections
    
    def delete_connection(self, key: str) -> bool:
        """Delete a saved connection."""
        with self._lock:
            try:
                connections = self._load_raw_connections()
                if key in connections:
                    del connections[key]
                    self._backup_config()
                    with open(self.config.connections_file, 'w', encoding='utf-8') as f:
                        json.dump(connections, f, indent=2)
                    self.logger.info(f"Connection deleted: {key}")
                    return True
                else:
                    self.logger.warning(f"Connection not found: {key}")
                    return False
            except Exception as e:
                self.logger.error(f"Error deleting connection: {e}")
                return False
    
    def get_connection(self, key: str) -> Optional[Dict[str, Any]]:
        """Get a specific connection by key."""
        with self._lock:
            connections = self.load_connections()
            return connections.get(key)
