"""
Client Asset Manager for R2 Integration
Handles asset downloading, local caching, and integration with the game client.
"""
import os
import requests
import hashlib
import json
import time
import ctypes
import xxhash   
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from net.protocol import Message, MessageType
from logger import setup_logger
import settings
import shutil
import sdl3
from Sprite import Sprite
from storage.StorageManager import StorageManager
from net.DownloadManager import DownloadManager  

logger = setup_logger(__name__)

class ClientAssetManager:
    """Manages R2 assets on the client side with local caching"""
    def __init__(self, cache_dir: Optional[str] = None, storage_root: Optional[str] = None):
        # Use settings-defined cache directory if none provided
        if cache_dir is None:
            cache_dir = settings.ASSET_CACHE_DIR
        if storage_root is None:
            storage_root = settings.DEFAULT_STORAGE_PATH
            
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
          # Create and own StorageManager
        try:
            self.StorageManager = StorageManager(storage_root)
            logger.info(f"StorageManager initialized with root: {storage_root}")
        except Exception as e:
            logger.error(f"Failed to initialize StorageManager: {e}")
            self.StorageManager = None
            
        # Create and own DownloadManager
        try:
            download_dir = self.cache_dir / "downloads"
            download_dir.mkdir(exist_ok=True)
            self.DownloadManager = DownloadManager(str(download_dir))
            logger.info(f"DownloadManager initialized with dir: {download_dir}")
        except Exception as e:
            logger.error(f"Failed to initialize DownloadManager: {e}")
            self.DownloadManager = None
        
        self.registry_file = Path(settings.ASSET_REGISTRY_FILE)
        self.registry_file.parent.mkdir(parents=True, exist_ok=True)
        
        self.asset_registry: Dict[str, Dict] = {}
        self.session_textures: Dict[str, sdl3.SDL_Texture] = {}
        self.download_queue = []
        self.downloading = False
        self.download_stats = {
            'total_downloads': 0,
            'successful_downloads': 0,
            'failed_downloads': 0,
            'cache_hits': 0,
            'total_bytes_downloaded': 0,
            'hash_verifications': 0,
            'hash_failures': 0
        }
        self.path_to_asset: Dict[str, str] = {}  # path -> asset_id
        # Hash lookup cache for fast duplicate detection
        self.hash_to_asset: Dict[str, str] = {}  # xxhash -> asset_id
        self.dict_of_sprites: Dict[str, Sprite] = {}  # operation ID -> sprite object
        
        self._load_registry()
        self._build_hash_lookup()
        
        logger.info(f"ClientAssetManager initialized with cache dir: {self.cache_dir}")

    def _load_registry(self):
        """Load asset registry from disk"""
        if self.registry_file.exists():
            try:
                with open(self.registry_file, 'r') as f:
                    self.asset_registry = json.load(f)
                logger.info(f"Loaded {len(self.asset_registry)} cached assets from registry")
            except Exception as e:
                logger.error(f"Failed to load asset registry: {e}")
                self.asset_registry = {}

    def _save_registry(self):
        """Save asset registry to disk"""
        try:
            with open(self.registry_file, 'w') as f:
                json.dump(self.asset_registry, f, indent=2)
            logger.debug("Asset registry saved to disk")
        except Exception as e:
            logger.error(f"Failed to save asset registry: {e}")

    def _build_hash_lookup(self):
        """Build hash lookup table for fast duplicate detection"""
        self.hash_to_asset.clear()
        for asset_id, asset_info in self.asset_registry.items():
            xxhash_value = asset_info.get('xxhash')
            if xxhash_value:
                self.hash_to_asset[xxhash_value] = asset_id
        logger.debug(f"Built hash lookup table with {len(self.hash_to_asset)} entries")

    def _get_cache_path(self, asset_id: str, filename: str) -> Path:
        """Get cache path for an asset"""
        subdir = asset_id[:2] if len(asset_id) >= 2 else "misc"
        cache_subdir = self.cache_dir / subdir
        cache_subdir.mkdir(exist_ok=True)
        return cache_subdir / f"{asset_id}_{filename}"

    
    def _calculate_data_xxhash(self, data: bytes) -> str:
        """Calculate xxHash for data in memory (fast hash for loaded data)"""
        try:
            if not data:
                logger.warning("No data provided for xxHash calculation")
                return ""
                
            hasher = xxhash.xxh64()  
            hasher.update(data)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate xxHash for data: {e}")
            return ""
    

  
    def generate_asset_id(self, data: bytes) -> str:
        """Generate unique asset ID using xxHash"""        
        return self._calculate_data_xxhash(data)[:16]  # Use first 16 characters for asset ID
    
    def calculate_file_xxhash_for_upload(self, file_path: str) -> str:
        """Calculate xxHash for a file before upload (public method) - temporarily sync"""
        # TODO: This should be async via StorageManager
        try:
            hasher = xxhash.xxh64()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate xxHash for file {file_path}: {e}")
            return ""

    def find_asset_by_xxhash(self, xxhash_value: str) -> Optional[str]:
        """Find cached asset by xxHash (fast duplicate detection)"""
        asset_id = self.hash_to_asset.get(xxhash_value)
        if asset_id and self.is_asset_cached(asset_id):
            logger.info(f"Found cached asset by xxHash: {xxhash_value} -> {asset_id}")
            return asset_id
        elif asset_id:
            # Asset was in lookup but cache file missing, clean up
            logger.warning(f"Asset {asset_id} in hash lookup but not cached, cleaning up")
            self._remove_from_hash_lookup(asset_id)
        return None
    
    def find_asset_by_path(self, file_path: str) -> Optional[str]:
        """Find cached asset by file path"""
        asset_id = self.path_to_asset.get(file_path)
        if asset_id and self.is_asset_cached(asset_id):
            logger.info(f"Found cached asset by path: {file_path} -> {asset_id}")
            return asset_id
        elif asset_id:
            # Asset was in lookup but cache file missing, clean up
            logger.warning(f"Asset {asset_id} in path lookup but not cached, cleaning up")
            del self.path_to_asset[file_path]
        return None
    
    def find_texture_by_asset_id(self, asset_id: str) -> Optional[sdl3.SDL_Texture]:
        """Find texture by asset ID in session textures"""
        if asset_id in self.session_textures:
            return self.session_textures[asset_id]
        logger.warning(f"Texture for asset {asset_id} not found in session textures")
        return None
    
    def _add_to_hash_lookup(self, asset_id: str, xxhash_value: str):
        """Add asset to hash lookup table"""
        if xxhash_value:
            self.hash_to_asset[xxhash_value] = asset_id
    def _add_to_path_lookup(self, asset_id: str, file_path: str):
        """Add asset to path lookup table"""
        if file_path:
            self.path_to_asset[file_path] = asset_id
            logger.debug(f"Added asset {asset_id} to path lookup: {file_path}")
            
    def _remove_from_hash_lookup(self, asset_id: str):
        """Remove asset from hash lookup table"""
        # Find and remove the hash entry for this asset_id
        hash_to_remove = None
        for hash_val, cached_asset_id in self.hash_to_asset.items():
            if cached_asset_id == asset_id:
                hash_to_remove = hash_val
                break
        
        if hash_to_remove:
            del self.hash_to_asset[hash_to_remove]
    
    def is_asset_cached(self, asset_id: str) -> bool:
        """Check if asset is cached locally"""
        if asset_id not in self.asset_registry:
            return False
        asset_info = self.asset_registry[asset_id]
        cache_path = Path(asset_info.get('local_path', ''))
        return cache_path.exists()

    def get_cached_asset_path(self, asset_id: str) -> Optional[str]:
        """Get local path for cached asset"""
        if not self.is_asset_cached(asset_id):
            return None
        asset_info = self.asset_registry[asset_id]
        return asset_info.get('local_path')

   

    def update_session_textures(self):
        """Update available session assets"""
        self.session_textures.clear()
        for key, sprite in self.dict_of_sprites.items():
            texture = sprite.texture
            if texture:
                self.session_textures[key] = texture
        logger.info(f"Updated session textures: {len(self.session_textures)} textures available")

    def register_texture(self, asset_id: str, texture: sdl3.SDL_Texture):
        """Register a texture for asset"""
        if not texture:
            logger.error(f"Cannot register None texture for asset {asset_id}")
            return
        
        if asset_id in self.session_textures:
            logger.warning(f"Texture for asset {asset_id} already registered, replacing")
        self.session_textures[asset_id] = texture
        logger.info(f"Registered texture for asset {asset_id}")


    def get_asset_for_sprite(self, asset_id: str) -> Optional[str]:
        """Get asset path for sprite, checking cache first"""
        if self.is_asset_cached(asset_id):
            self.download_stats['cache_hits'] += 1
            cache_path = self.get_cached_asset_path(asset_id)
            logger.debug(f"Asset {asset_id} served from cache: {cache_path}")
            return cache_path
        logger.info(f"Asset {asset_id} not cached, download required")
        return None

    def get_asset_for_sprite_by_xxhash(self, xxhash_value: str) -> Optional[str]:
        """Get asset path by xxHash (fast duplicate detection)"""
        asset_id = self.find_asset_by_xxhash(xxhash_value)
        if asset_id:
            return self.get_asset_for_sprite(asset_id)
        return None  

   

    def register_uploaded_asset(self, asset_id: str, local_file_path: str, filename: str):
        """Register an uploaded asset in the local cache"""
        try:
            # Calculate xxHash for the original file
            original_xxhash = self.calculate_file_xxhash_for_upload(local_file_path)
            
            # Check if we already have this file by hash
            existing_asset_id = self.find_asset_by_xxhash(original_xxhash)
            if existing_asset_id:
                logger.info(f"File already cached with asset_id {existing_asset_id}, xxHash: {original_xxhash}")
                # Update registry to include this new asset_id mapping
                existing_info = self.asset_registry[existing_asset_id].copy()
                existing_info['asset_id'] = asset_id
                existing_info['source'] = 'upload'
                existing_info['cached_at'] = time.time()
                self.asset_registry[asset_id] = existing_info
                self._save_registry()
                return
            
            # Copy the file to cache directory
            cache_path = self._get_cache_path(asset_id, filename)
            
            # Create cache directory if it doesn't exist
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy file to cache
            shutil.copy2(local_file_path, cache_path)
            
            # Calculate hashes for cached file
            cached_xxhash = self._calculate_data_xxhash(cache_path.read_bytes())
            cached_sha256 = hashlib.sha256(cache_path.read_bytes()).hexdigest()
            
            # Verify copy was successful
            if original_xxhash != cached_xxhash:
                logger.error(f"Hash mismatch after copying file to cache: {original_xxhash} != {cached_xxhash}")
                cache_path.unlink()  # Remove corrupted copy
                raise Exception("File copy verification failed")
            
            # Register in asset registry
            self.asset_registry[asset_id] = {
                'asset_id': asset_id,
                'filename': filename,
                'local_path': str(cache_path),
                'cached_at': time.time(),
                'source': 'upload',
                'file_size': cache_path.stat().st_size,
                'file_hash': cached_sha256,
                'xxhash': cached_xxhash,
                'hash_verified': True
            }
            
            # Add to hash lookup
            self._add_to_hash_lookup(asset_id, cached_xxhash)
            
            # Save registry
            self._save_registry()
            
            logger.info(f"Registered uploaded asset {asset_id} in cache: {cache_path} (xxHash: {cached_xxhash})")
            
        except Exception as e:
            logger.error(f"Error registering uploaded asset {asset_id}: {e}")
            raise

    def verify_cached_asset(self, asset_id: str) -> bool:
        """Verify integrity of cached asset using stored hash"""
        try:
            if not self.is_asset_cached(asset_id):
                return False
            
            asset_info = self.asset_registry[asset_id]
            cache_path = Path(asset_info['local_path'])
            stored_xxhash = asset_info.get('xxhash')
            
            if not stored_xxhash:
                logger.warning(f"No stored xxHash for asset {asset_id}")
                return True  # Assume valid if no hash to check
            
            # Calculate current hash
            current_xxhash = self._calculate_data_xxhash(cache_path.read_bytes())
            
            # Verify
            if current_xxhash == stored_xxhash:
                logger.debug(f"Asset {asset_id} verification successful")
                return True
            else:
                logger.error(f"Asset {asset_id} verification failed: stored={stored_xxhash}, current={current_xxhash}")
                return False
                
        except Exception as e:
            logger.error(f"Error verifying asset {asset_id}: {e}")
            return False

    def cleanup_cache(self, max_age_days: Optional[int] = None, max_size_mb: Optional[int] = None):
        """Clean up old/large cache files"""
        # Use settings defaults if not provided
        if max_age_days is None:
            max_age_days = settings.CACHE_CLEANUP_AGE_DAYS
        if max_size_mb is None:
            max_size_mb = settings.MAX_ASSET_CACHE_SIZE_MB
            
        try:
            current_time = time.time()
            max_age_seconds = max_age_days * 24 * 3600
            max_size_bytes = max_size_mb * 1024 * 1024
            
            cached_files = []
            total_size = 0
            
            # Collect cache file info
            for asset_id, asset_info in self.asset_registry.items():
                cache_path = Path(asset_info.get('local_path', ''))
                if cache_path.exists():
                    stat = cache_path.stat()
                    cached_files.append({
                        'asset_id': asset_id,
                        'path': cache_path,
                        'size': stat.st_size,
                        'age': current_time - asset_info.get('download_time', current_time)
                    })
                    total_size += stat.st_size
            
            logger.info(f"Cache cleanup: {len(cached_files)} files, {total_size / 1024 / 1024:.1f} MB total")
            
            removed_count = 0
            freed_bytes = 0
            
            # Remove old files
            for file_info in cached_files.copy():
                if file_info['age'] > max_age_seconds:
                    try:
                        file_info['path'].unlink()
                        self._remove_from_hash_lookup(file_info['asset_id'])
                        del self.asset_registry[file_info['asset_id']]
                        cached_files.remove(file_info)
                        removed_count += 1
                        freed_bytes += file_info['size']
                        total_size -= file_info['size']
                        logger.debug(f"Removed old cached file: {file_info['path']}")
                    except Exception as e:
                        logger.error(f"Failed to remove {file_info['path']}: {e}")
            
            # Remove files if cache too large (oldest first)
            if total_size > max_size_bytes:
                cached_files.sort(key=lambda x: self.asset_registry[x['asset_id']].get('download_time', 0))
                for file_info in cached_files:
                    if total_size <= max_size_bytes:
                        break
                    try:
                        file_info['path'].unlink()
                        self._remove_from_hash_lookup(file_info['asset_id'])
                        del self.asset_registry[file_info['asset_id']]
                        removed_count += 1
                        freed_bytes += file_info['size']
                        total_size -= file_info['size']
                        logger.debug(f"Removed cached file (size limit): {file_info['path']}")
                    except Exception as e:
                        logger.error(f"Failed to remove {file_info['path']}: {e}")
            
            if removed_count > 0:
                self._save_registry()
                logger.info(f"Cache cleanup completed: removed {removed_count} files, freed {freed_bytes / 1024 / 1024:.1f} MB")
                
        except Exception as e:
            logger.error(f"Error during cache cleanup: {e}")

    def get_stats(self) -> Dict:
        """Get asset manager statistics"""
        cached_count = sum(1 for asset_id in self.asset_registry if self.is_asset_cached(asset_id))
        total_cache_size = 0
        
        for asset_info in self.asset_registry.values():
            cache_path = Path(asset_info.get('local_path', ''))
            if cache_path.exists():
                total_cache_size += cache_path.stat().st_size        
        return {
            'cached_assets': cached_count,
            'session_textures': len(self.session_textures),
            'cache_size_mb': total_cache_size / 1024 / 1024,
            'download_queue_size': len(self.download_queue),
            'downloading': self.downloading,
            'hash_lookup_entries': len(self.hash_to_asset),
            **self.download_stats
        }


    def handle_file_loaded(self, operation_id: str, filename: str, data: bytes) -> Optional[Tuple[str,str]]:
        """Handle loading an asset by filename or operation ID"""
        if not filename and not operation_id:
            logger.error("No filename or operation ID provided for loading asset")
            return None
        
        # Check by operation ID
        xxhash = self._calculate_data_xxhash(data)
        asset_id = xxhash[:16]
        self._add_to_hash_lookup(asset_id, xxhash)
        self._add_to_path_lookup(asset_id, filename)
        if operation_id:
            sprite = self.dict_of_sprites.get(operation_id)            
            if sprite:
                logger.info(f"Found sprite for operation ID {operation_id} with filename {filename}, create surgface")
                surface = self.surface_from_bytes(data, filename)
                if not surface:
                    logger.error(f"Failed to create surface from bytes for operation ID {operation_id}")
                    return None                
                logger.info(f"Creating texture from surface for operation ID {operation_id} and filename {filename}")
                texture_with_w_h = self.create_texture_from_surface(sprite.renderer, surface)
                if not texture_with_w_h:
                    logger.error(f"Failed to create texture from surface for operation ID {operation_id}")
                    return None
                texture, w, h = texture_with_w_h
                if texture and w and h:
                    logger.info(f"Reloading texture for sprite with operation ID {operation_id} and filename {filename}")
                    sprite.reload_texture(texture, w, h)
                    sprite.asset_id = asset_id                    
                    logger.info(f"Texture reloaded for operation ID {operation_id} with size {w}x{h}")
                    self.register_texture(asset_id, texture)
                    logger.info(f"Loaded asset for operation ID {operation_id} with texture {filename}")
                    return asset_id, xxhash
                else:
                    logger.error(f"Failed to reload texture for operation ID {operation_id}")
                    return None
            else:
                logger.warning(f"Sprite with operation id {operation_id} not finded")
        
        # TODO: Then check by filename
           
        logger.warning(f"Filename {filename} or {operation_id} not found in cache")
        return None
    
    def surface_from_bytes(self, data: bytes, filename: str,) -> Optional['sdl3.LP_SDL_Surface']:
        """Make Surface from raw bytes data"""
        if not data:
            logger.error("No data provided for creating sprite")
            return None           
            
        try:            
            sdl_io_stream = sdl3.SDL_IOFromConstMem(data, len(data))
            if not sdl_io_stream:
                logger.error("Failed to create sdl io stream from bytes data")
                return None            
            # Load surface from stream using SDL_image
            surface = sdl3.IMG_Load_IO(sdl_io_stream, 1)  # 1 = automatically close stream
            if not surface:
                error_msg = sdl3.SDL_GetError()
                logger.error(f"Failed to load surface from bytes: {error_msg}")
                return None
            return surface
            
        except Exception as e:
            logger.error(f"Error creating surface from bytes data for {filename}: {e}")
            return None

    def create_texture_from_surface(self, renderer:  'sdl3.LP_SDL_Renderer', surface: 'sdl3.LP_SDL_Surface') -> Optional[tuple['sdl3.SDL_Texture', int, int]]: 
            """Create texture from surface"""
            texture = sdl3.SDL_CreateTextureFromSurface(renderer, surface)
            if not texture:
                error_msg = sdl3.SDL_GetError()
                logger.error(f"Failed to create texture from surface: {error_msg}")
                sdl3.SDL_DestroySurface(surface)
                return None
            
            # Get surface dimensions
            surface_contents=surface.contents
            print(f"Surface contents: {surface_contents.w}")            
            width = surface_contents.w
            height = surface_contents.h
            # Clean up surface (texture now owns the pixel data)
            sdl3.SDL_DestroySurface(surface)
            return texture, width, height
    
    def load_asset_for_sprite(self, sprite: Sprite, file_path: str, to_server:bool=False) -> Optional[bool]:
        """Load asset for sprite from cache or disk, importing external files if needed"""
        logger.debug(f"Loading asset for sprite: {sprite} from file path: {file_path}")
        if not sprite:
            logger.error("No sprite provided for loading asset")
            return None
        
        if not self.StorageManager:
            logger.error("StorageManager not initialized, cannot load asset")
            return None
            
        # Check if asset is already cached
        asset_id = self.find_asset_by_path(file_path)
        if asset_id:
            # Asset found in cache 
            logger.info(f"Asset {asset_id} found in cache")
            texture = self.find_texture_by_asset_id(asset_id)
            if texture:
                logger.info(f"Using cached texture for asset {asset_id}")
                sprite.reload_texture(texture, sprite.rect.w, sprite.rect.h)
                return True
            else:
                logger.warning(f"Texture for asset {asset_id} not found in session textures, loading from disk")
                cached_file_path = self.get_cached_asset_path(asset_id)
                if cached_file_path:
                    file_path = cached_file_path
                else:
                    logger.error(f"Cached asset path not found for asset ID {asset_id}")
        
        # Check if this is an external file that needs importing
        if self._is_external_file(file_path):
            logger.info(f"External file detected: {file_path}, importing to managed storage")
            filename = Path(file_path).name
            operation_id = self.StorageManager.import_external_file_async(
                file_path, 
                target_filename=filename,
                subdir="assets"
            )
            self.dict_of_sprites[operation_id] = sprite
            logger.debug(f"Importing external file with operation ID {operation_id}")
            return True
        
        # File is already in managed storage, load it
        logger.info(f"Loading asset from managed storage: {file_path}")                      
        filename = Path(file_path).name
        subdir = Path(file_path).parent.name if Path(file_path).parent.name != "." else ""
        
        operation_id = self.StorageManager.load_file_async(filename, subdir=subdir, as_json=False, to_server=to_server)
        self.dict_of_sprites[operation_id] = sprite
        logger.debug(f"Loading asset from storage with operation ID {operation_id} and filename {filename}")
        return True

    def cache_downloaded_asset(self, asset_id: str, downloaded_file_path: str) -> bool:
        """Cache a downloaded asset in the local registry"""
        try:
            # Calculate file hash
            file_path = Path(downloaded_file_path)
            if not file_path.exists():
                logger.error(f"Downloaded file not found: {downloaded_file_path}")
                return False
            
            file_hash = self._calculate_data_xxhash(file_path.read_bytes())
            file_size = file_path.stat().st_size
            
            # Get filename
            filename = file_path.name
            
            # Update asset registry
            self.asset_registry[asset_id] = {
                'asset_id': asset_id,
                'filename': filename,
                'local_path': str(file_path),
                'file_size': file_size,
                'xxhash': file_hash,
                'download_time': int(time.time()),
                'source': 'downloaded'
            }
            
            # Update lookup tables
            self._add_to_hash_lookup(asset_id, file_hash)
            
            # Save registry
            self._save_registry()
            
            logger.info(f"Cached downloaded asset {asset_id}: {filename} ({file_size} bytes)")
            return True
            
        except Exception as e:
            logger.error(f"Error caching downloaded asset {asset_id}: {e}")
            return False    
    def process_all_completed_operations(self) -> List[Dict[str, Any]]:
        """Single point for processing all async I/O operations"""
        completed = []
        
        # Collect from storage operations
        if self.StorageManager:
            try:
                storage_completed = self.StorageManager.process_completed_operations()
                for op in storage_completed:
                    op['source'] = 'storage'
                    completed.append(op)
            except Exception as e:
                logger.error(f"Error processing storage completions: {e}")
        
        # Collect from download operations  
        if self.DownloadManager:
            try:
                download_completed = self.DownloadManager.process_completed_operations()
                for op in download_completed:
                    op['source'] = 'download'
                    completed.append(op)
            except Exception as e:
                logger.error(f"Error processing download completions: {e}")                
        return completed
    
    def cleanup_operation_tracking(self, operation_id: str):
        """Clean up tracking for completed operation"""
        self.dict_of_sprites.pop(operation_id, None)
        logger.debug(f"Cleaned up tracking for operation {operation_id}")

    def _is_external_file(self, file_path: str) -> bool:
        """Check if a file path is external to the StorageManager's root"""
        if not self.StorageManager:
            return True  # If no StorageManager, consider all files external
        
        try:
            file_path_obj = Path(file_path).resolve()
            storage_root = self.StorageManager.root_path.resolve()
            
            # Check if file_path is under storage_root
            return not str(file_path_obj).startswith(str(storage_root))
        except Exception as e:
            logger.error(f"Error checking if file is external: {e}")
            return True  # Assume external on error
    
    def upload_asset_async(self, file_path: str, upload_url: str, asset_id: str, 
                          required_xxhash: str) -> Optional[str]:
        """Upload asset to server using presigned URL with proper headers"""
        if not self.DownloadManager:
            logger.error("DownloadManager not initialized, cannot upload asset")
            return None
        
        try:
            file_path_obj = Path(file_path)
            if not file_path_obj.exists():
                logger.error(f"File to upload does not exist: {file_path}")
                return None
            
            # Prepare metadata with required headers
            metadata = {
                'asset_id': asset_id,
                'required_xxhash': required_xxhash,
                'original_file_path': str(file_path_obj),
                'headers': {
                    'x-amz-meta-xxhash': required_xxhash,
                    'x-amz-meta-upload-timestamp': str(int(time.time()))
                }
            }
            
            logger.info(f"Starting async upload of {file_path} to {upload_url} with xxHash {required_xxhash}")
            
            # Use DownloadManager's upload functionality  
            operation_id = self.DownloadManager.upload_file_async(
                file_path=file_path_obj,
                upload_url=upload_url,
                metadata=metadata
            )
            
            logger.debug(f"Upload started with operation ID {operation_id} for asset {asset_id}")
            return operation_id
            
        except Exception as e:
            logger.error(f"Error starting upload for asset {asset_id}: {e}")
            return None
    
    # File path is now provided by StorageManager completion data

