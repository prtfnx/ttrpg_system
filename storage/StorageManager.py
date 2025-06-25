"""
Non-blocking Storage Manager for SDL Applications.
Thread pool-based file operations that don't block the main thread.
"""
import json
import queue
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any, Union, Callable
from concurrent.futures import ThreadPoolExecutor


class StorageManager:
    """Non-blocking storage manager for SDL apps using thread pool."""
    
    def __init__(self, root_path: Union[str, Path] = "storage"):
        self.root_path = Path(root_path)
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="storage")
        self._completed_operations = queue.Queue()
        self._pending_operations = {}        
        # Create root directory
        self.root_path.mkdir(parents=True, exist_ok=True)
    
    def save_file_async(self, filename: str, data: Union[bytes, str, Dict], 
                       subdir: str = "") -> str:
        """Save file asynchronously. Returns operation ID."""
        operation_id = str(uuid.uuid4())[:8]
        
        def _save():
            try:
                file_path = self.root_path / subdir / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                if isinstance(data, dict):
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2)
                elif isinstance(data, str):
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(data)                
                else:
                    with open(file_path, 'wb') as f:
                        f.write(data)
                
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'save',
                    'filename': filename,
                    'success': True,
                    'error': None
                })
            except Exception as e:
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'save',
                    'filename': filename,
                    'success': False,
                    'error': str(e)
                })
        
        self._pending_operations[operation_id] = self._executor.submit(_save)
        return operation_id
    
    def load_file_async(self, filename: str, subdir: str = "", 
                       as_json: bool = False) -> str:
        """Load file asynchronously. Returns operation ID."""
        operation_id = str(uuid.uuid4())[:8]
        
        def _load():
            try:
                print(f"Loading file: {filename} from {subdir}, root: {self.root_path}")
                file_path = self.root_path / subdir / filename                
                if as_json or filename.endswith('.json'):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                elif filename.endswith(('.txt', '.log', '.md')):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = f.read()
                else:
                    with open(file_path, 'rb') as f:
                        data = f.read()
                
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'load',
                    'filename': filename,
                    'success': True,
                    'data': data,
                    'error': None
                })
            except FileNotFoundError:
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'load',
                    'filename': filename,
                    'success': False,
                    'data': None,
                    'error': 'File not found'
                })
            except Exception as e:
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'load',
                    'filename': filename,
                    'success': False,
                    'data': None,
                    'error': str(e)
                })
        
        self._pending_operations[operation_id] = self._executor.submit(_load)
        return operation_id
    
    def list_files_async(self, pattern: str = "*.json", subdir: str = "") -> str:
        """List files asynchronously. Returns operation ID."""
        operation_id = str(uuid.uuid4())[:8]
        
        def _list():
            try:
                search_path = self.root_path / subdir
                files = []
                if search_path.exists():
                    files = [str(p.relative_to(self.root_path)) 
                            for p in search_path.glob(pattern) if p.is_file()]
                
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'list',
                    'success': True,
                    'data': sorted(files),
                    'error': None
                })
            except Exception as e:
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'list',
                    'success': False,
                    'data': [],
                    'error': str(e)
                })
        
        self._pending_operations[operation_id] = self._executor.submit(_list)
        return operation_id
    
    def delete_file_async(self, filename: str, subdir: str = "") -> str:
        """Delete file asynchronously. Returns operation ID."""
        operation_id = str(uuid.uuid4())[:8]
        
        def _delete():
            try:
                file_path = self.root_path / subdir / filename
                file_path.unlink()
                
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'delete',
                    'filename': filename,
                    'success': True,
                    'error': None
                })
            except Exception as e:
                self._completed_operations.put({
                    'operation_id': operation_id,
                    'type': 'delete',
                    'filename': filename,
                    'success': False,
                    'error': str(e)
                })
        
        self._pending_operations[operation_id] = self._executor.submit(_delete)
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
    
    def close(self):
        """Shutdown storage manager and wait for pending operations."""
        # Wait for all pending operations to complete
        for future in self._pending_operations.values():
            try:
                future.result(timeout=5.0)
            except:
                pass
        
        self._executor.shutdown(wait=True)


def main():
    """Example usage in SDL main loop."""
    storage = StorageManager("test_storage")
    
    # Start some async operations
    save_id = storage.save_file_async("config.json", {"app": "ttrpg", "version": "1.0"})
    load_id = storage.load_file_async("config.json")
    list_id = storage.list_files_async()
    
    print(f"Started operations: save={save_id}, load={load_id}, list={list_id}")
    
    # SDL main loop simulation
    while storage.is_busy():
        # Process completed operations
        
        completed = storage.process_completed_operations()
        
        for op in completed:
            print(f"Operation {op['operation_id']} completed:")
            print(f"  Type: {op['type']}")
            print(f"  Success: {op['success']}")
            if 'data' in op and op['data'] is not None:
                print(f"  Data: {op['data']}")
            if op['error']:
                print(f"  Error: {op['error']}")
        
        # Simulate SDL event processing
        # import time
        #time.sleep(0.1)
    
    storage.close()
    print("Storage manager closed.")


if __name__ == "__main__":
    main()
