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
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse
from net.protocol import Message, MessageType
import settings

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
            'total_bytes_downloaded': 0        }
        self._load_registry()
        logger.info(f"ClientAssetManager initialized with cache dir: {self.cache_dir}")

    def _load_registry(self):
        if self.registry_file.exists():
            try:
                with open(self.registry_file, 'r') as f:
                    self.asset_registry = json.load(f)
                logger.info(f"Loaded {len(self.asset_registry)} cached assets from registry")
            except Exception as e:
                logger.error(f"Failed to load asset registry: {e}")
                self.asset_registry = {}

    def _save_registry(self):
        try:
            with open(self.registry_file, 'w') as f:
                json.dump(self.asset_registry, f, indent=2)
            logger.debug("Asset registry saved to disk")
        except Exception as e:
            logger.error(f"Failed to save asset registry: {e}")

    def _get_cache_path(self, asset_id: str, filename: str) -> Path:
        subdir = asset_id[:2] if len(asset_id) >= 2 else "misc"
        cache_subdir = self.cache_dir / subdir
        cache_subdir.mkdir(exist_ok=True)
        return cache_subdir / f"{asset_id}_{filename}"

    def _calculate_file_hash(self, file_path: Path) -> str:
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)
            return sha256_hash.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate hash for {file_path}: {e}")
            return ""

    def is_asset_cached(self, asset_id: str) -> bool:
        if asset_id not in self.asset_registry:
            return False
        asset_info = self.asset_registry[asset_id]
        cache_path = Path(asset_info.get('local_path', ''))
        return cache_path.exists()

    def get_cached_asset_path(self, asset_id: str) -> Optional[str]:
        if not self.is_asset_cached(asset_id):
            return None
        asset_info = self.asset_registry[asset_id]
        return asset_info.get('local_path')

    async def download_asset(self, asset_id: str, download_url: str, filename: str, expected_size: Optional[int] = None) -> Tuple[bool, str]:
        try:
            cache_path = self._get_cache_path(asset_id, filename)
            logger.info(f"Downloading asset {asset_id} to {cache_path}")
            response = requests.get(download_url, stream=True, timeout=60)
            response.raise_for_status()
            content_length = response.headers.get('content-length')
            if expected_size and content_length:
                if int(content_length) != expected_size:
                    logger.warning(f"Size mismatch for {asset_id}: expected {expected_size}, got {content_length}")
            total_bytes = 0
            with open(cache_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_bytes += len(chunk)
            file_hash = self._calculate_file_hash(cache_path)
            self.asset_registry[asset_id] = {
                'filename': filename,
                'local_path': str(cache_path),
                'download_time': time.time(),
                'file_size': total_bytes,
                'file_hash': file_hash,
                'download_url': download_url
            }
            self._save_registry()
            self.download_stats['successful_downloads'] += 1
            self.download_stats['total_bytes_downloaded'] += total_bytes
            logger.info(f"Successfully downloaded {filename} ({total_bytes} bytes) for asset {asset_id}")
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
        self.session_assets.clear()
        for asset in assets:
            asset_id = asset.get('asset_id')
            if asset_id:
                self.session_assets[asset_id] = asset
        logger.info(f"Updated session assets: {len(self.session_assets)} assets available")

    def get_asset_for_sprite(self, asset_id: str) -> Optional[str]:
        if self.is_asset_cached(asset_id):
            self.download_stats['cache_hits'] += 1
            cache_path = self.get_cached_asset_path(asset_id)
            logger.debug(f"Asset {asset_id} served from cache: {cache_path}")
            return cache_path
        logger.info(f"Asset {asset_id} not cached, download required")
        return None

    async def request_asset_download(self, context, asset_id: str) -> bool:
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
        try:
            asset_id = message_data.get('asset_id')
            download_url = message_data.get('download_url')
            filename = message_data.get('filename', f'{asset_id}.unknown')
            expires_in = message_data.get('expires_in', 3600)
            if not asset_id or not download_url:
                logger.error("Invalid download response: missing asset_id or download_url")
                return False
            download_info = {
                'asset_id': asset_id,
                'download_url': download_url,
                'filename': filename,
                'expires_in': expires_in,
                'queued_time': time.time()
            }
            self.download_queue.append(download_info)
            logger.info(f"Queued download for asset {asset_id}: {filename}")
            if not self.downloading:
                asyncio.create_task(self._process_download_queue())
            return True
        except Exception as e:
            logger.error(f"Error handling download response: {e}")
            return False

    async def _process_download_queue(self):
        if self.downloading:
            return
        self.downloading = True
        try:
            while self.download_queue:
                download_info = self.download_queue.pop(0)
                queued_time = download_info['queued_time']
                expires_in = download_info['expires_in']
                if time.time() - queued_time > expires_in:
                    logger.warning(f"Download URL expired for asset {download_info['asset_id']}")
                    continue
                success, result = await self.download_asset(
                    download_info['asset_id'],
                    download_info['download_url'],
                    download_info['filename']
                )
                if success:
                    logger.info(f"Background download completed: {download_info['filename']}")
                else:
                    logger.error(f"Background download failed: {result}")
                await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Error processing download queue: {e}")
        finally:
            self.downloading = False

    def cleanup_cache(self, max_age_days: Optional[int] = None, max_size_mb: Optional[int] = None):
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
            for file_info in cached_files.copy():
                if file_info['age'] > max_age_seconds:
                    try:
                        file_info['path'].unlink()
                        del self.asset_registry[file_info['asset_id']]
                        cached_files.remove(file_info)
                        removed_count += 1
                        freed_bytes += file_info['size']
                        total_size -= file_info['size']
                        logger.debug(f"Removed old cached file: {file_info['path']}")
                    except Exception as e:
                        logger.error(f"Failed to remove {file_info['path']}: {e}")
            if total_size > max_size_bytes:
                cached_files.sort(key=lambda x: self.asset_registry[x['asset_id']].get('download_time', 0))
                for file_info in cached_files:
                    if total_size <= max_size_bytes:
                        break
                    try:
                        file_info['path'].unlink()
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
            import shutil
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

_client_asset_manager = None

def get_client_asset_manager() -> ClientAssetManager:
    global _client_asset_manager
    if _client_asset_manager is None:
        _client_asset_manager = ClientAssetManager()
    return _client_asset_manager
