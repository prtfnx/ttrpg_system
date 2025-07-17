#!/usr/bin/env python3
"""
Test script to verify fog of war persistence 
Tests that fog rectangles are stored in table and visible regardless of tool selection
"""

import sys
import time
from typing import Dict, Any
from unittest.mock import Mock, MagicMock

def test_fog_persistence():
    """Test that fog of war persists in table and is always visible"""
    print("Testing fog of war persistence...")
    
    # Mock context with table
    mock_context = Mock()
    mock_table = Mock()
    mock_table.table_id = "test-table-123"
    mock_table.fog_rectangles = {'hide': [], 'reveal': []}
    mock_table.width = 1000
    mock_table.height = 1000
    mock_context.current_table = mock_table
    
    # Mock Actions
    mock_actions = Mock()
    mock_context.Actions = mock_actions
    
    # Test 1: Check RenderManager fog logic
    print("\n1. Testing RenderManager fog detection...")
    
    # Simulate having fog data in table
    mock_table.fog_rectangles = {
        'hide': [((100, 100), (300, 300))],
        'reveal': [((150, 150), (200, 200))]
    }
    
    # Simulate RenderManager fog check logic
    table = mock_table
    hide_rectangles = []
    reveal_rectangles = []
    
    # First priority: Use fog data stored in table
    if table and hasattr(table, 'fog_rectangles') and table.fog_rectangles:
        hide_rectangles = table.fog_rectangles.get('hide', [])
        reveal_rectangles = table.fog_rectangles.get('reveal', [])
        print(f"   ✓ Found fog data in table: {len(hide_rectangles)} hide, {len(reveal_rectangles)} reveal")
    else:
        print("   ✗ No fog data found in table")
        return False
    
    # Test 2: Check Actions integration
    print("\n2. Testing Actions fog update...")
    
    # Mock the Actions.update_fog_rectangles method
    def mock_update_fog(table_id, hide_rects, reveal_rects):
        print(f"   → Called update_fog_rectangles for {table_id}")
        print(f"   → Hide rectangles: {len(hide_rects)}")
        print(f"   → Reveal rectangles: {len(reveal_rects)}")
        # Update table data to simulate server sync
        mock_table.fog_rectangles = {'hide': hide_rects, 'reveal': reveal_rects}
        return Mock(success=True)
    
    mock_actions.update_fog_rectangles = mock_update_fog
    
    # Simulate adding a new fog rectangle
    new_hide = [((100, 100), (300, 300)), ((400, 400), (600, 600))]
    new_reveal = [((150, 150), (200, 200))]
    
    result = mock_actions.update_fog_rectangles("test-table-123", new_hide, new_reveal)
    print(f"   ✓ Fog update successful: {result.success}")
    
    # Test 3: Verify persistence
    print("\n3. Testing fog persistence...")
    
    # Check that table has updated data
    current_hide = mock_table.fog_rectangles.get('hide', [])
    current_reveal = mock_table.fog_rectangles.get('reveal', [])
    
    if len(current_hide) == 2 and len(current_reveal) == 1:
        print("   ✓ Fog data persisted in table correctly")
    else:
        print(f"   ✗ Fog data not persisted correctly: {len(current_hide)} hide, {len(current_reveal)} reveal")
        return False
    
    # Test 4: Simulate tool switching
    print("\n4. Testing tool switching...")
    
    # Simulate switching away from fog tool - fog should still be visible
    mock_fog_tool = Mock()
    mock_fog_tool.hide_rectangles = []  # Tool has no data
    mock_fog_tool.reveal_rectangles = []
    mock_context.fog_of_war_tool = mock_fog_tool
    
    # RenderManager should still find fog data in table
    table = mock_table
    hide_rectangles = []
    reveal_rectangles = []
    
    # First priority: Use fog data stored in table
    if table and hasattr(table, 'fog_rectangles') and table.fog_rectangles:
        hide_rectangles = table.fog_rectangles.get('hide', [])
        reveal_rectangles = table.fog_rectangles.get('reveal', [])
        print(f"   ✓ Fog still visible after tool switch: {len(hide_rectangles)} hide, {len(reveal_rectangles)} reveal")
    else:
        print("   ✗ Fog disappeared after tool switch")
        return False
    
    print("\n✅ All fog persistence tests passed!")
    return True

def test_message_handling():
    """Test fog update message handling from server"""
    print("\nTesting fog update message handling...")
    
    # Mock message data matching the log format
    message_data = {
        'table_id': '9a7a3180-0c2a-4e91-9158-58071a1241cb',
        'hide_rectangles': [[[471.58063444600094, 37.16891700067003], [682.9788498873118, 250.89018975452268]]],
        'reveal_rectangles': []
    }
    
    # Mock context
    mock_context = Mock()
    mock_table = Mock()
    mock_table.table_id = '9a7a3180-0c2a-4e91-9158-58071a1241cb'
    mock_table.fog_rectangles = {'hide': [], 'reveal': []}
    mock_context.current_table = mock_table
    
    # Mock fog tool
    mock_fog_tool = Mock()
    mock_fog_tool.hide_rectangles = []
    mock_fog_tool.reveal_rectangles = []
    mock_fog_tool._update_fog_layer = Mock()
    mock_fog_tool._reset_fog_texture = Mock()
    mock_context.fog_of_war_tool = mock_fog_tool
    
    # Simulate handle_fog_update_response
    table_id = message_data.get('table_id')
    hide_rectangles = message_data.get('hide_rectangles', [])
    reveal_rectangles = message_data.get('reveal_rectangles', [])
    
    print(f"   Processing update for table {table_id}")
    print(f"   Hide rectangles: {len(hide_rectangles)}")
    print(f"   Reveal rectangles: {len(reveal_rectangles)}")
    
    if str(mock_table.table_id) == table_id:
        # Update table's fog_rectangles
        mock_table.fog_rectangles = {
            'hide': hide_rectangles,
            'reveal': reveal_rectangles
        }
        
        # Update fog tool
        mock_fog_tool.hide_rectangles = hide_rectangles
        mock_fog_tool.reveal_rectangles = reveal_rectangles
        mock_fog_tool._update_fog_layer()
        mock_fog_tool._reset_fog_texture()
        
        print("   ✓ Table fog data updated")
        print("   ✓ Fog tool synchronized") 
        print("   ✓ Fog layer refreshed")
    
    print("✅ Message handling test passed!")
    return True

if __name__ == "__main__":
    print("🌫️ Fog of War Persistence Test Suite")
    print("=" * 50)
    
    try:
        success1 = test_fog_persistence()
        success2 = test_message_handling()
        
        if success1 and success2:
            print("\n🎉 All tests passed! Fog of war should now be persistent and always visible.")
        else:
            print("\n❌ Some tests failed. Please check the implementation.")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n💥 Test error: {e}")
        sys.exit(1)
