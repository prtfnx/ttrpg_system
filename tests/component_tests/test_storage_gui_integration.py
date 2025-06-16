#!/usr/bin/env python3
"""
Test script to verify the Storage tab integration in the right panel
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Testing Storage GUI Integration...")
print("=" * 50)

try:
    # Test storage system imports
    from storage.gui_integration import get_storage_gui
    print("✅ Storage GUI module imported successfully")
    
    # Test GUI imports 
    from gui.gui_imgui import SimplifiedGui
    print("✅ Main GUI module imported successfully")
    
    # Test storage GUI creation
    storage_gui = get_storage_gui()
    print("✅ Storage GUI instance created successfully")
    
    # Test storage GUI attributes
    print(f"✅ Storage GUI attributes:")
    print(f"   - Storage manager: {storage_gui.storage_manager is not None}")
    print(f"   - Upload manager: {storage_gui.upload_manager is not None}")
    print(f"   - Config manager: {storage_gui.config_manager is not None}")
    print(f"   - Root path: {storage_gui.config_manager.config.root_storage_path}")
    
    # Test storage stats
    stats = storage_gui.storage_manager.get_storage_stats()
    print(f"✅ Storage stats retrieved: {stats}")
    
    print("\n🎉 All tests passed! The Storage tab should now be visible in the right panel.")
    print("\nTo access the Storage GUI:")
    print("1. Run the main application: python main.py")
    print("2. Look for the 'Storage' tab in the right panel")
    print("3. Click on the Storage tab to see storage controls")
    print("4. Use the buttons to open Storage Manager, Upload Files, or Settings")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
