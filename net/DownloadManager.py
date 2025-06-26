"""
Non-blocking Download Manager for SDL Applications.
Thread pool-based downloads/uploads that don't block the main thread.
"""
import os
import queue
import uuid
import hashlib
import xxhash
import requests
from pathlib import Path
from typing import Optional, Dict, Any, Union, List
from concurrent.futures import ThreadPoolExecutor
import logging

logger = logging.getLogger(__name__)


class DownloadManager:
    """Non-blocking download/upload manager for SDL apps using thread pool."""
    
    def __init__(self, download_dir: Union[str, Path] = "downloads", max_workers: int = 3):
        self.download_dir = Path(download_dir)
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="download")
        self._completed_operations = queue.Queue()
        self._pending_operations = {}
          # Create download directory
        self.download_dir.mkdir(parents=True, exist_ok=True)
    
    def download_file_async(self, url: str, filename: Optional[str] = None, 
                           subdir: str = "", metadata: Optional[Dict[str, Any]] = None,
                           expected_hash: Optional[str] = None) -> str:
        """Download file asynchronously. Returns operation ID.
        
        Args:
            url: URL to download from
            filename: Optional filename (extracted from URL if not provided)
            subdir: Subdirectory within download_dir
            metadata: Optional metadata to store with operation
            expected_hash: Optional xxHash to verify downloaded file
            
        Returns:
            Operation ID for tracking completion
        """
        operation_id = str(uuid.uuid4())[:8]
        
        # If no filename provided, extract from URL
        if not filename:
            filename = os.path.basename(url.split('?')[0]) or f"download_{operation_id}"
        
        def _download():
            try:
                # Prepare download path
                file_path = self.download_dir / subdir / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                logger.info(f"Starting download: {url} -> {file_path}")
                
                # Download with streaming to handle large files
                response = requests.get(url, stream=True, timeout=30)
                response.raise_for_status()                # Write file in chunks and always calculate xxHash for consistency with AssetManager
                total_size = 0
                hash_obj = xxhash.xxh64()  # Always calculate hash for duplicate detection
                expected_hash_obj = xxhash.xxh64() if expected_hash else None
                
                with open(file_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            total_size += len(chunk)
                            hash_obj.update(chunk)
                            if expected_hash_obj:
                                expected_hash_obj.update(chunk)
                
                # Always get the downloaded file hash
                download_hash = hash_obj.hexdigest()
                
                # Verify hash if expected hash was provided
                hash_valid = True
                if expected_hash:
                    if expected_hash_obj:
                        calculated_expected = expected_hash_obj.hexdigest()
                        hash_valid = calculated_expected.lower() == expected_hash.lower()
                    else:
                        # Compare directly if expected_hash is already a hash
                        hash_valid = download_hash.lower() == expected_hash.lower()
                    
                    if not hash_valid:
                        logger.warning(f"Hash mismatch for {filename}: expected {expected_hash}, got {download_hash}")
                
                logger.info(f"Download completed: {filename} ({total_size} bytes)")
                
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'download',
                    'url': url,
                    'filename': filename,
                    'file_path': str(file_path),
                    'success': True,
                    'error': None,
                    'size': total_size,
                    'hash': download_hash,
                    'hash_valid': hash_valid,
                    'metadata': metadata or {}
                })
                
            except Exception as e:
                logger.error(f"Download failed for {url}: {e}")
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'download',
                    'url': url,
                    'filename': filename,
                    'file_path': None,
                    'success': False,
                    'error': str(e),
                    'size': 0,
                    'hash': None,
                    'hash_valid': False,
                    'metadata': metadata or {}
                })
        
        self._pending_operations[operation_id] = self._executor.submit(_download)
        return operation_id
    
    def upload_file_async(self, file_path: Union[str, Path], upload_url: str,
                         metadata: Optional[Dict[str, Any]] = None) -> str:
        """Upload file asynchronously. Returns operation ID."""
        operation_id = str(uuid.uuid4())[:8]
        file_path = Path(file_path)
        
        def _upload():
            try:
                if not file_path.exists():
                    raise FileNotFoundError(f"File not found: {file_path}")
                
                logger.info(f"Starting upload: {file_path} -> {upload_url}")
                  # Calculate file hash and size
                file_size = file_path.stat().st_size
                hash_obj = xxhash.xxh64()
                
                with open(file_path, 'rb') as f:
                    # Calculate hash while uploading
                    data = f.read()
                    hash_obj.update(data)
                    f.seek(0)  # Reset for upload
                    
                    # Perform upload
                    response = requests.put(upload_url, data=data, timeout=60)
                    response.raise_for_status()
                
                file_hash = hash_obj.hexdigest()
                logger.info(f"Upload completed: {file_path.name} ({file_size} bytes)")
                
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'upload',
                    'file_path': str(file_path),
                    'upload_url': upload_url,
                    'filename': file_path.name,
                    'success': True,
                    'error': None,
                    'size': file_size,
                    'hash': file_hash,
                    'metadata': metadata or {}
                })
                
            except Exception as e:
                logger.error(f"Upload failed for {file_path}: {e}")
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'upload',
                    'file_path': str(file_path),
                    'upload_url': upload_url,
                    'filename': file_path.name if file_path.exists() else 'unknown',
                    'success': False,
                    'error': str(e),
                    'size': 0,
                    'hash': None,
                    'metadata': metadata or {}
                })
        
        self._pending_operations[operation_id] = self._executor.submit(_upload)
        return operation_id
    
    def process_completed_operations(self) -> List[Dict[str, Any]]:
        """Process completed operations. Call this in SDL main loop."""
        completed = []
        while not self._completed_operations.empty():
            try:
                operation = self._completed_operations.get_nowait()
                completed.append(operation)
                # Clean up pending operations
                self._pending_operations.pop(operation['operation_id'], None)
            except queue.Empty:
                break
        return completed
    
    def is_busy(self) -> bool:
        """Check if any operations are pending."""
        return len(self._pending_operations) > 0
    
    def get_pending_count(self) -> int:
        """Get number of pending operations."""
        return len(self._pending_operations)
    
    def cancel_all(self):
        """Cancel all pending operations."""
        for future in self._pending_operations.values():
            future.cancel()
        self._pending_operations.clear()
    
    def close(self):
        """Shutdown download manager and wait for pending operations."""
        # Wait for all pending operations to complete
        for future in self._pending_operations.values():
            try:
                future.result(timeout=10.0)
            except:
                pass
        
        self._executor.shutdown(wait=True)
    
    def _calculate_file_xxhash(self, file_path: Path) -> str:
        """Calculate xxHash for a file (for consistency with AssetManager)"""
        try:
            hasher = xxhash.xxh64()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate xxHash for {file_path}: {e}")
            return ""
    
    def _calculate_data_xxhash(self, data: bytes) -> str:
        """Calculate xxHash for data in memory (for consistency with AssetManager)"""
        try:
            if not data:
                return ""
            hasher = xxhash.xxh64()
            hasher.update(data)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate xxHash for data: {e}")
            return ""

    def get_file_xxhash(self, file_path: Union[str, Path]) -> str:
        """Calculate xxHash for any file (public method for AssetManager integration)"""
        return self._calculate_file_xxhash(Path(file_path))
    
    def download_file_with_hash_check_async(self, url: str, filename: Optional[str] = None,
                                           subdir: str = "", expected_xxhash: Optional[str] = None,
                                           metadata: Optional[Dict[str, Any]] = None) -> str:
        """Download file with xxHash verification (AssetManager compatible)"""
        return self.download_file_async(
            url=url,
            filename=filename,
            subdir=subdir,
            metadata=metadata,
            expected_hash=expected_xxhash
        )

def main():
    """Example usage in SDL main loop."""
    download_mgr = DownloadManager("test_downloads")
    
    # Start some async operations
    download_id = download_mgr.download_file_async(
        "https://httpbin.org/json", 
        "test.json",
        metadata={"source": "httpbin"}
    )
    
    print(f"Started download: {download_id}")
    
    # SDL main loop simulation
    while download_mgr.is_busy():
        # Process completed operations
        completed = download_mgr.process_completed_operations()
        
        for op in completed:
            print(f"Operation {op['operation_id']} completed:")
            print(f"  Type: {op['type']}")
            print(f"  Success: {op['success']}")
            print(f"  File: {op.get('filename', 'N/A')}")
            if op['success']:
                print(f"  Size: {op.get('size', 0)} bytes")
                print(f"  Hash: {op.get('hash', 'N/A')}")
            if op['error']:
                print(f"  Error: {op['error']}")
        
        # Simulate SDL event processing
        import time
        time.sleep(0.1)
    
    download_mgr.close()
    print("Download manager closed.")


if __name__ == "__main__":
    main()
