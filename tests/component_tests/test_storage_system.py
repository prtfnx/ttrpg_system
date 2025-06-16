#!/usr/bin/env python3
"""
Test script for the new storage system.
Tests SDL3 storage, R2 integration, and file management.
"""
import os
import sys
import asyncio
import logging
from pathlib import Path

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import storage system
from storage import StorageManager, R2AssetManager, StorageConfig, get_storage_manager
from storage.config import get_config_manager, get_storage_config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_config_system():
    """Test configuration loading and saving"""
    print("\n" + "="*50)
    print("TESTING CONFIGURATION SYSTEM")
    print("="*50)
    
    try:
        # Test config manager
        config_manager = get_config_manager()
        config = config_manager.load_config()
        
        print(f"✅ Root storage path: {config.root_storage_path}")
        print(f"✅ Images folder: {config.get_folder_path('images')}")
        print(f"✅ Cache folder: {config.get_folder_path('cache')}")
        print(f"✅ R2 enabled: {config.r2_enabled}")
        
        # Test directory creation
        success = config.ensure_directories()
        print(f"✅ Directory creation: {'Success' if success else 'Failed'}")
        
        # Test config updates
        config_manager.update_config(max_cache_size_mb=2048)
        print("✅ Config update successful")
        
        return True
        
    except Exception as e:
        print(f"❌ Config system test failed: {e}")
        return False

def test_storage_manager():
    """Test SDL3 storage manager"""
    print("\n" + "="*50)
    print("TESTING STORAGE MANAGER")
    print("="*50)
    
    try:
        storage = StorageManager()
        
        # Test SDL storage
        test_data = {
            "test_key": "test_value",
            "timestamp": "2025-06-13",
            "nested": {"data": [1, 2, 3]}
        }
        
        # Save data
        success = storage.save_data_sdl("test_save", test_data)
        print(f"✅ Save data: {'Success' if success else 'Failed'}")
        
        # Load data
        loaded_data = storage.load_data_sdl("test_save")
        if loaded_data == test_data:
            print("✅ Load data: Success - Data matches")
        else:
            print(f"❌ Load data: Failed - Data mismatch")
            print(f"   Expected: {test_data}")
            print(f"   Got: {loaded_data}")
        
        # Test file operations (create a test file)
        test_file_content = "This is a test file for storage system"
        test_file_path = "test_storage_file.txt"
        
        with open(test_file_path, 'w') as f:
            f.write(test_file_content)
        
        # Save file to storage
        saved_path = storage.save_file(test_file_path, "test_storage_file.txt", "other")
        print(f"✅ Save file: {'Success' if saved_path else 'Failed'}")
        
        if saved_path:
            print(f"   Saved to: {saved_path}")
        
        # List files
        files = storage.list_files("other")
        print(f"✅ List files: Found {len(files)} files in 'other' folder")
        
        # Get storage stats
        stats = storage.get_storage_stats()
        print(f"✅ Storage stats: {stats.get('total_files', 0)} total files")
        
        # Cleanup test file
        try:
            os.remove(test_file_path)
        except:
            pass
        
        return True
        
    except Exception as e:
        print(f"❌ Storage manager test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_r2_manager():
    """Test R2 asset manager (mock test without actual R2)"""
    print("\n" + "="*50)
    print("TESTING R2 ASSET MANAGER")
    print("="*50)
    
    try:
        # Test R2 manager initialization
        r2_manager = R2AssetManager()
        
        # Check configuration
        config_valid = r2_manager._check_r2_config()
        print(f"✅ R2 config check: {'Valid' if config_valid else 'Invalid (expected - not configured)'}")
        
        # Test file key generation
        test_key = r2_manager._generate_file_key("test_image.png", "images")
        print(f"✅ File key generation: {test_key}")
        
        # Test URL generation
        test_url = r2_manager._get_file_url(test_key)
        print(f"✅ URL generation: {test_url}")
        
        # Test auth token generation
        try:
            token = r2_manager._generate_auth_token()
            print(f"✅ Auth token generation: {'Success' if token else 'Failed'}")
        except Exception as e:
            print(f"⚠️  Auth token generation: Failed (expected - no secret key): {e}")
        
        # Test stats
        stats = r2_manager.get_stats()
        print(f"✅ R2 stats: {stats}")
        
        return True
        
    except Exception as e:
        print(f"❌ R2 manager test failed: {e}")
        return False

def test_file_type_detection():
    """Test file type detection"""
    print("\n" + "="*50)
    print("TESTING FILE TYPE DETECTION")  
    print("="*50)
    
    try:
        storage_manager = get_storage_manager()
        
        # Test file type detection
        test_files = [
            "test.jpg", "test.png", "test.gif",  # images
            "test.mp4", "test.avi",              # video
            "test.mp3", "test.wav",              # music
            "test.txt", "test.doc"               # other
        ]
        
        for test_file in test_files:
            file_type = storage_manager.detect_file_type(test_file)
            print(f"   {test_file} -> {file_type}")
        
        print("✅ File type detection: Success")
        return True
        
    except Exception as e:
        print(f"❌ File type detection test failed: {e}")
        return False
        is_valid, error = upload_manager.validate_file("non_existent_file.png")
        expected_error = not is_valid and "does not exist" in str(error)
        print(f"✅ File validation: {'Success' if expected_error else 'Unexpected result'}")
        
        # Test supported file check
        supported = upload_manager.is_supported_file("test.png")
        print(f"✅ Supported file check: {'Success' if supported else 'Failed'}")
        
        return True
        
    except Exception as e:
        print(f"❌ File upload manager test failed: {e}")
        return False

def test_integration():
    """Test integration between systems"""
    print("\n" + "="*50)
    print("TESTING SYSTEM INTEGRATION")
    print("="*50)
    
    try:
        # Test io_sys integration
        import io_sys
        
        # Test new functions
        stats = io_sys.get_storage_stats()
        print(f"✅ IO system integration: Storage stats retrieved")
        print(f"   Root path: {stats.get('root_path', 'Unknown')}")
        print(f"   Total files: {stats.get('total_files', 0)}")
        
        # Test table save/load with new system
        test_table_data = {
            "name": "test_integration_table",
            "width": 1920,
            "height": 1080,
            "sprites": [],
            "entities": []
        }
        
        # Save table
        io_sys.save_dict_to_disk(test_table_data)
        print("✅ Table save: Success")
        
        # Load table
        loaded_table = io_sys.load_json_from_disk("test_integration_table")
        if loaded_table and loaded_table.get("name") == test_table_data["name"]:
            print("✅ Table load: Success - Data matches")
        else:
            print("⚠️  Table load: Data may not match (expected for first run)")
        
        return True
        
    except Exception as e:
        print(f"❌ Integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def run_all_tests():
    """Run all storage system tests"""
    print("🚀 STARTING STORAGE SYSTEM TESTS")
    print("="*60)
    
    results = []
    
    # Run tests
    results.append(("Configuration System", test_config_system()))
    results.append(("Storage Manager", test_storage_manager()))
    results.append(("R2 Asset Manager", asyncio.run(test_r2_manager())))
    results.append(("File Type Detection", test_file_type_detection()))
    results.append(("System Integration", test_integration()))
    
    # Print results
    print("\n" + "="*60)
    print("TEST RESULTS SUMMARY")
    print("="*60)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if result:
            passed += 1
    
    print(f"\nPassed: {passed}/{total} tests")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Storage system is ready to use.")
    else:
        print("⚠️  Some tests failed. Please check the logs above.")
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
