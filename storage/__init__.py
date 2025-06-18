# Storage system for TTRPG
from .r2_manager import R2AssetManager

# Lazy import of StorageManager to avoid SDL3 import on server
def get_storage_manager():
    """Lazy import of StorageManager to avoid SDL3 dependency on server"""
    from .storage_manager import StorageManager, get_storage_manager as _get_storage_manager
    return _get_storage_manager()

__all__ = [
    'get_storage_manager',
    'R2AssetManager', 
]
