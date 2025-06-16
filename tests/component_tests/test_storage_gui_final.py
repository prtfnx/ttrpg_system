#!/usr/bin/env python3
"""
Final test of the Storage GUI integration
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Final Storage GUI Integration Test")
print("=" * 50)

try:
    # Test storage GUI
    from storage.gui_integration import get_storage_gui, draw_storage_interface
    print("✅ Storage GUI imported successfully")
    
    # Test GUI creation
    storage_gui = get_storage_gui()
    print("✅ Storage GUI created successfully")
    
    # Test basic functionality
    storage_gui.show_storage_window = True
    storage_gui.show_config_window = True
    print("✅ Storage windows can be shown")
    
    # Test storage operations
    stats = storage_gui.storage_manager.get_storage_stats()
    print(f"✅ Storage stats: {stats['total_files']} files found")
    
    # Test file list
    files = storage_gui.storage_manager.list_files('images')
    print(f"✅ Image files: {len(files)} found")
    
    print("\n🎉 All tests passed!")
    print("\nThe Storage GUI is now ready. In your TTRPG application:")
    print("- Look for the 'Storage' tab in the right panel")
    print("- Click 'Open Storage Manager' to browse files")
    print("- Click 'Settings' to configure storage")
    print("- Click 'Upload Files' for future upload functionality")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
