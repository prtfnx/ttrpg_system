"""
Client Asset Manager for R2 Integration
Handles asset downloading, local caching, and integration with the game client.
"""
import os
import requests
import hashlib
import json
import logging
import time
import asyncio
import ctypes
import xxhash   
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse
from net.protocol import Message, MessageType
import settings
import shutil
import sdl3
from Sprite import Sprite  
logger = logging.getLogger(__name__)

class ClientAssetManager:
    """Manages R2 assets on the client side with local caching"""
    def __init__(self, cache_dir: Optional[str] = None):
        # Use settings-defined cache directory if none provided
        if cache_dir is None:
            cache_dir = settings.ASSET_CACHE_DIR
        
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.registry_file = Path(settings.ASSET_REGISTRY_FILE)
        self.registry_file.parent.mkdir(parents=True, exist_ok=True)
        
        self.asset_registry: Dict[str, Dict] = {}
        self.session_assets: Dict[str, Dict] = {}
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

    def _calculate_file_xxhash(self, file_path: Path) -> str:
        """Calculate xxHash for a file (fast hash for local operations)"""
        try:
            hasher = xxhash.xxh64()  # xxh64 is faster and has good distribution
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):  # 64KB chunks for speed
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate xxHash for {file_path}: {e}")
            return ""

  

    def calculate_file_xxhash_for_upload(self, file_path: str) -> str:
        """Calculate xxHash for a file before upload (public method)"""
        return self._calculate_file_xxhash(Path(file_path))

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

    def _add_to_hash_lookup(self, asset_id: str, xxhash_value: str):
        """Add asset to hash lookup table"""
        if xxhash_value:
            self.hash_to_asset[xxhash_value] = asset_id

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

    async def download_asset(self, asset_id: str, download_url: str, filename: str, 
                           expected_size: Optional[int] = None, expected_xxhash: Optional[str] = None) -> Tuple[bool, str]:
        """Download asset with hash verification"""
        try:
            cache_path = self._get_cache_path(asset_id, filename)
            logger.info(f"Downloading asset {asset_id} to {cache_path}")
            
            # Download file
            response = requests.get(download_url, stream=True, timeout=60)
            response.raise_for_status()
            # Check content length
            content_length = response.headers.get('content-length')
            if expected_size and content_length:
                if int(content_length) != expected_size:
                    logger.warning(f"Size mismatch for {asset_id}: expected {expected_size}, got {content_length}")
            
            # Write file to disk
            total_bytes = 0
            with open(cache_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_bytes += len(chunk)
            
            # Calculate hashes
            file_xxhash = self._calculate_file_xxhash(cache_path)

            
            # Verify xxHash if provided
            hash_verified = True
            if expected_xxhash:
                hash_verified = (file_xxhash == expected_xxhash)
                if hash_verified:
                    self.download_stats['hash_verifications'] += 1
                    logger.info(f"Hash verification successful for {asset_id}: {file_xxhash}")
                else:
                    self.download_stats['hash_failures'] += 1
                    logger.error(f"Hash verification failed for {asset_id}: expected {expected_xxhash}, got {file_xxhash}")
                    # Delete corrupted file
                    cache_path.unlink()
                    return False, f"Hash verification failed"
            
            # Register asset in cache
            self.asset_registry[asset_id] = {
                'asset_id': asset_id,
                'filename': filename,
                'local_path': str(cache_path),
                'download_time': time.time(),
                'file_size': total_bytes,
                'xxhash': file_xxhash,     # Add xxHash
                'download_url': download_url,
                'hash_verified': hash_verified
            }
            
            # Add to hash lookup
            self._add_to_hash_lookup(asset_id, file_xxhash)
            
            # Save registry
            self._save_registry()
            
            # Update stats
            self.download_stats['successful_downloads'] += 1
            self.download_stats['total_bytes_downloaded'] += total_bytes
            
            logger.info(f"Successfully downloaded {filename} ({total_bytes} bytes) for asset {asset_id} (xxHash: {file_xxhash})")
            return True, str(cache_path)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error downloading asset {asset_id}: {e}")
            self.download_stats['failed_downloads'] += 1
            return False, f"Network error: {e}"
        except Exception as e:
            logger.error(f"Error downloading asset {asset_id}: {e}")
            self.download_stats['failed_downloads'] += 1
            return False, f"Download error: {e}"
        finally:
            self.download_stats['total_downloads'] += 1

    def update_session_assets(self, assets: List[Dict]):
        """Update available session assets"""
        self.session_assets.clear()
        for asset in assets:
            asset_id = asset.get('asset_id')
            if asset_id:
                self.session_assets[asset_id] = asset
        logger.info(f"Updated session assets: {len(self.session_assets)} assets available")

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

    async def request_asset_download(self, context, asset_id: str) -> bool:
        """Request asset download from server"""
        if not context.net_socket:
            logger.error("No network connection available for asset download")
            return False
        
        download_request = Message(
            MessageType.ASSET_DOWNLOAD_REQUEST,
            {
                "asset_id": asset_id,
                "session_code": getattr(context, 'session_code', 'unknown'),
                "user_id": getattr(context, 'user_id', 0),
                "username": getattr(context, 'username', 'unknown')
            }
        )
        
        try:
            context.queue_to_send.put((1, download_request))
            logger.info(f"Requested download for asset {asset_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to request asset download {asset_id}: {e}")
            return False

    def handle_download_response(self, message_data: Dict) -> bool:
        """Handle download response from server"""
        try:
            asset_id = message_data.get('asset_id')
            download_url = message_data.get('download_url')
            filename = message_data.get('filename', f'{asset_id}.unknown')
            expires_in = message_data.get('expires_in', 3600)
            expected_xxhash = message_data.get('xxhash')  # Get expected xxHash from server
            expected_size = message_data.get('file_size')
            
            if not asset_id or not download_url:
                logger.error("Invalid download response: missing asset_id or download_url")
                return False
            
            download_info = {
                'asset_id': asset_id,
                'download_url': download_url,
                'filename': filename,
                'expires_in': expires_in,
                'expected_xxhash': expected_xxhash,
                'expected_size': expected_size,
                'queued_time': time.time()
            }
            
            self.download_queue.append(download_info)
            logger.info(f"Queued download for asset {asset_id}: {filename} (xxHash: {expected_xxhash})")
            
            if not self.downloading:
                asyncio.create_task(self._process_download_queue())
            
            return True
            
        except Exception as e:
            logger.error(f"Error handling download response: {e}")
            return False

    async def _process_download_queue(self):
        """Process download queue"""
        if self.downloading:
            return
        
        self.downloading = True
        try:
            while self.download_queue:
                download_info = self.download_queue.pop(0)
                
                # Check if URL expired
                queued_time = download_info['queued_time']
                expires_in = download_info['expires_in']
                if time.time() - queued_time > expires_in:
                    logger.warning(f"Download URL expired for asset {download_info['asset_id']}")
                    continue
                
                # Download with hash verification
                success, result = await self.download_asset(
                    download_info['asset_id'],
                    download_info['download_url'],
                    download_info['filename'],
                    expected_size=download_info.get('expected_size'),
                    expected_xxhash=download_info.get('expected_xxhash')
                )
                
                if success:
                    logger.info(f"Background download completed: {download_info['filename']}")
                else:
                    logger.error(f"Background download failed: {result}")
                
                # Small delay between downloads
                await asyncio.sleep(0.1)
                
        except Exception as e:
            logger.error(f"Error processing download queue: {e}")
        finally:
            self.downloading = False

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
            cached_xxhash = self._calculate_file_xxhash(cache_path)
            cached_sha256 = self._calculate_file_hash(cache_path)
            
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
            current_xxhash = self._calculate_file_xxhash(cache_path)
            
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
            'session_assets': len(self.session_assets),
            'cache_size_mb': total_cache_size / 1024 / 1024,
            'download_queue_size': len(self.download_queue),
            'downloading': self.downloading,
            'hash_lookup_entries': len(self.hash_to_asset),
            **self.download_stats
        }

    def register_uploaded_asset(self, asset_id: str, local_file_path: str, filename: str):
        """Register an uploaded asset in the local cache"""
        try:
            # Copy the file to cache directory
            cache_path = self._get_cache_path(asset_id, filename)
            
            # Create cache directory if it doesn't exist
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy file to cache
            
            shutil.copy2(local_file_path, cache_path)
            
            # Register in asset registry
            self.asset_registry[asset_id] = {
                'asset_id': asset_id,
                'filename': filename,
                'local_path': str(cache_path),
                'cached_at': time.time(),
                'source': 'upload',
                'file_size': cache_path.stat().st_size
            }
            
            # Save registry
            self._save_registry()
            
            logger.info(f"Registered uploaded asset {asset_id} in cache: {cache_path}")
            
        except Exception as e:
            logger.error(f"Error registering uploaded asset {asset_id}: {e}")
            raise
    
    def handle_load_asset(self, operation_id: str, filename: str, data: bytes) -> Optional[bool]:
        """Handle loading an asset by filename or asset ID"""
        if not filename and not operation_id:
            logger.error("No filename or operation ID provided for loading asset")
            return None
        
        # Check by operation ID
        if operation_id:
            sprite = self.dict_of_sprites.get(operation_id)
            if sprite:
                surface = self.surface_from_bytes(data, filename)
                if not surface:
                    logger.error(f"Failed to create surface from bytes for operation ID {operation_id}")
                    return None                
                texture_with_w_h = self.create_texture_from_surface(sprite.renderer, surface)
                if not texture_with_w_h:
                    logger.error(f"Failed to create texture from surface for operation ID {operation_id}")
                    return None
                texture, w, h = texture_with_w_h
                sprite.reload_texture(texture, w, h)
                logger.info(f"Loaded asset for operation ID {operation_id} with texture {filename}")
                return True
            else:
                logger.warning(f"Sprite with operation id {operation_id} not finded")
        
        # TODO: Then check by filename
           
        logger.warning(f"Filename {filename} or {operation_id} not found in cache")
        return None
    
    def surface_from_bytes(self, data: bytes, filename: str,) -> Optional[sdl3.SDL_Surface]:
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
    
    def create_texture_from_surface(self, renderer: sdl3.SDL_Renderer, surface: sdl3.SDL_Surface) -> Optional[tuple[sdl3.SDL_Texture,int, int]]: 
            """Create texture from surface"""
            texture = sdl3.SDL_CreateTextureFromSurface(renderer, surface)
            if not texture:
                error_msg = sdl3.SDL_GetError()
                logger.error(f"Failed to create texture from surface: {error_msg}")
                sdl3.SDL_DestroySurface(surface)
                return None
            
            # Get surface dimensions            
            width = surface.contents.w
            height = surface.contents.h
            # Clean up surface (texture now owns the pixel data)
            sdl3.SDL_DestroySurface(surface)
            return texture, width, height
    
           
     

