#!/usr/bin/env python3
"""
Test script for the DownloadManager implementation.
This tests the async download functionality independently.
"""
import time
from logger import setup_logger
from net.DownloadManager import DownloadManager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = setup_logger(__name__)

def test_download_manager():
    """Test the DownloadManager functionality"""
    print("Testing DownloadManager...")
    
    # Create download manager
    download_mgr = DownloadManager("test_downloads")
    
    # Test 1: Simple download
    print("\n=== Test 1: Simple Download ===")
    download_id = download_mgr.download_file_async(
        "https://httpbin.org/json", 
        "test.json",
        metadata={"test": "simple_download"}
    )
    print(f"Started download: {download_id}")
    
    # Test 2: Download with hash verification
    print("\n=== Test 2: Download with hash (simulated) ===")
    download_id2 = download_mgr.download_file_async(
        "https://httpbin.org/uuid",
        "uuid.json",
        metadata={"test": "hash_verification"}
    )
    print(f"Started download with hash: {download_id2}")
    
    # Test 3: Invalid URL (should fail)
    print("\n=== Test 3: Invalid URL (should fail) ===")
    download_id3 = download_mgr.download_file_async(
        "https://invalid-url-that-does-not-exist.com/file.txt",
        "invalid.txt",
        metadata={"test": "should_fail"}
    )
    print(f"Started invalid download: {download_id3}")
    
    # Process completed operations (simulate main loop)
    print("\n=== Processing Results ===")
    max_wait = 30  # 30 seconds timeout
    start_time = time.time()
    
    while download_mgr.is_busy() and (time.time() - start_time) < max_wait:
        completed = download_mgr.process_completed_operations()
        
        for op in completed:
            print(f"\nOperation {op['operation_id']} completed:")
            print(f"  Type: {op['type']}")
            print(f"  Success: {op['success']}")
            print(f"  File: {op.get('filename', 'N/A')}")
            
            if op['success']:
                print(f"  Size: {op.get('size', 0)} bytes")
                print(f"  Path: {op.get('file_path', 'N/A')}")
                print(f"  Hash: {op.get('hash', 'N/A')[:16]}..." if op.get('hash') else "  Hash: N/A")
                print(f"  Metadata: {op.get('metadata', {})}")
            else:
                print(f"  Error: {op.get('error', 'Unknown error')}")
        
        if completed:
            print(f"Processed {len(completed)} operations")
        
        # Small delay to avoid busy waiting
        time.sleep(0.1)
    
    # Final status
    if download_mgr.is_busy():
        print(f"\nTimeout reached. Still {download_mgr.get_pending_count()} operations pending")
        download_mgr.cancel_all()
    else:
        print("\nAll operations completed!")
    
    # Cleanup
    download_mgr.close()
    print("DownloadManager closed.")

if __name__ == "__main__":
    test_download_manager()
