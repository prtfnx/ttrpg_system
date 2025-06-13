"""
Minimal SDL3 Storage Manager for TTRPG System.
Uses only SDL3 Storage API - no file system operations.
"""
import logging
from typing import Optional, Any
import sdl3
import settings

logger = logging.getLogger(__name__)


class StorageManager:
    """
    Minimal storage manager using only SDL3 Storage API.
    """
    def __init__(self):
        # Open user storage with correct SDL3 API
        import ctypes
        org = ctypes.c_char_p(b"ttrpg_system")
        app = ctypes.c_char_p(b"ttrpg_system")
        # Create empty properties
        props = sdl3.SDL_CreateProperties()
        self._storage = sdl3.SDL_OpenUserStorage(org, app, props)
        if not self._storage:
            raise RuntimeError(f"Failed to open SDL3 storage")
        sdl3.SDL_DestroyProperties(props)
    
    def __del__(self):
        """Cleanup SDL storage"""
        if hasattr(self, '_storage') and self._storage:
            sdl3.SDL_CloseStorage(self._storage)    
    
    def save_data_sdl(self, key: str, data: Any) -> bool:
        """Save data to SDL storage"""
        try:
            import json
            import ctypes
            json_data = json.dumps(data).encode('utf-8')
            # SDL3 API with proper ctypes
            key_ptr = ctypes.c_char_p(key.encode('utf-8'))
            data_ptr = ctypes.c_char_p(json_data)
            length = ctypes.c_uint64(len(json_data))
            result = sdl3.SDL_WriteStorageFile(self._storage, key_ptr, data_ptr, length)
            return bool(result)
        except Exception as e:
            logger.error(f"Failed to save data '{key}': {e}")
            return False
    
    def load_data_sdl(self, key: str) -> Optional[Any]:
        """Load data from SDL storage"""
        try:
            import json
            data = sdl3.SDL_ReadStorageFile(self._storage, key)
            if data:
                return json.loads(data.decode('utf-8'))
            return None
        except Exception as e:
            logger.error(f"Failed to load data '{key}': {e}")
            return None
    
    def delete_data_sdl(self, key: str) -> bool:
        """Delete data from SDL storage"""
        try:
            result = sdl3.SDL_RemoveStoragePath(self._storage, key)
            return result != 0
        except Exception as e:
            logger.error(f"Failed to delete data '{key}': {e}")
            return False
    
    def list_storage_keys(self) -> list[str]:
        """List all keys in SDL storage"""
        try:
            files = []
            def enum_callback(userdata, dirname, filename):
                if filename:
                    files.append(filename)
                return 1
            
            sdl3.SDL_EnumerateStorageDirectory(self._storage, "", enum_callback, None)
            return files
        except Exception as e:
            logger.error(f"Failed to list storage keys: {e}")
            return []
    
    def get_storage_info(self) -> dict:
        """Get basic storage information"""
        try:
            info = sdl3.SDL_GetStorageSpaceRemaining(self._storage)
            return {
                "space_remaining": info if info >= 0 else "unknown",
                "keys_count": len(self.list_storage_keys())
            }
        except Exception as e:
            logger.error(f"Failed to get storage info: {e}")
            return {"space_remaining": "unknown", "keys_count": 0}
      # Minimal compatibility methods
    def detect_file_type(self, file_path: str) -> str:
        """Detect file type based on extension"""
        return settings.get_folder_for_file_type(file_path)
    
    def save_file(self, source_path: str, filename: str, file_type: Optional[str] = None) -> Optional[str]:
        """Save file metadata to SDL storage"""
        import os
        if not os.path.exists(source_path):
            return None
        
        file_info = {
            "filename": filename,
            "file_type": file_type or self.detect_file_type(source_path),
            "original_path": source_path,
            "size": os.path.getsize(source_path)
        }
        
        key = f"file_{filename}"
        if self.save_data_sdl(key, file_info):
            return source_path
        return None
    
    def list_files(self, file_type: str) -> list[str]:
        """List files of specific type"""
        files = []
        for key in self.list_storage_keys():
            if key.startswith("file_"):
                data = self.load_data_sdl(key)
                if data and data.get("file_type") == file_type:
                    files.append(data["filename"])
        return files
    
    def get_storage_stats(self) -> dict:
        """Get storage statistics"""
        info = self.get_storage_info()
        files_by_type = {"images": 0, "video": 0, "music": 0, "other": 0}
        
        for key in self.list_storage_keys():
            if key.startswith("file_"):
                data = self.load_data_sdl(key)
                if data and data.get("file_type") in files_by_type:
                    files_by_type[data["file_type"]] += 1
        
        return {
            "total_files": sum(files_by_type.values()),
            "files_by_type": files_by_type,
            "space_remaining": info["space_remaining"],
            "root_path": "SDL3_Storage"
        }


# Global instance
_storage_manager = None

def get_storage_manager() -> StorageManager:
    """Get global storage manager instance"""
    global _storage_manager
    if _storage_manager is None:
        _storage_manager = StorageManager()
    return _storage_manager