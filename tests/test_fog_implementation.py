#!/usr/bin/env python3
"""
Simple test to verify fog of war client-server implementation
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core_table.table import VirtualTable
from core_table.actions_core import ActionsCore
from core_table.actions_protocol import ActionResult

def test_fog_implementation():
    """Test the basic fog of war implementation"""
    print("=== Testing Fog of War Implementation ===")
    
    try:
        # Test 1: VirtualTable fog storage
        print("\n1. Testing VirtualTable fog storage...")
        table = VirtualTable("test_table", 10, 10)
        
        # Check initial fog state
        print(f"   Initial fog rectangles: {table.fog_rectangles}")
        assert table.fog_rectangles == {'hide': [], 'reveal': []}
        print("   ✓ Initial fog state correct")
        
        # Test 2: Fog serialization
        print("\n2. Testing fog serialization...")
        table.fog_rectangles['hide'] = [((0, 0), (5, 5))]
        table.fog_rectangles['reveal'] = [((1, 1), (2, 2))]
        
        table_dict = table.to_dict()
        assert 'fog_rectangles' in table_dict
        assert table_dict['fog_rectangles']['hide'] == [((0, 0), (5, 5))]
        print("   ✓ Fog serialization works")
        
        # Test 3: Fog deserialization
        print("\n3. Testing fog deserialization...")
        new_table = VirtualTable("new_table", 10, 10)
        test_data = {
            'name': 'loaded_table',
            'width': 10,
            'height': 10,
            'layers': {},
            'fog_rectangles': {
                'hide': [((2, 2), (7, 7))],
                'reveal': [((3, 3), (4, 4))]
            }
        }
        new_table.from_dict(test_data)
        
        assert new_table.fog_rectangles['hide'] == [((2, 2), (7, 7))]
        assert new_table.fog_rectangles['reveal'] == [((3, 3), (4, 4))]
        print("   ✓ Fog deserialization works")
        
        # Test 4: ActionsCore fog methods
        print("\n4. Testing ActionsCore fog methods...")
        # Create a mock table manager
        class MockTableManager:
            def __init__(self):
                self.tables_id = {'test_table': table}
        
        table_manager = MockTableManager()
        actions_core = ActionsCore(table_manager)
        
        # Test update_fog_rectangles
        import asyncio
        async def test_async():
            result = await actions_core.update_fog_rectangles(
                'test_table', 
                [((0, 0), (10, 10))], 
                [((2, 2), (8, 8))]
            )
            assert result.success
            assert table.fog_rectangles['hide'] == [((0, 0), (10, 10))]
            assert table.fog_rectangles['reveal'] == [((2, 2), (8, 8))]
            print("   ✓ ActionsCore.update_fog_rectangles works")
            
            # Test get_fog_rectangles
            result = await actions_core.get_fog_rectangles('test_table')
            assert result.success
            fog_data = result.data['fog_rectangles']
            assert fog_data['hide'] == [((0, 0), (10, 10))]
            assert fog_data['reveal'] == [((2, 2), (8, 8))]
            print("   ✓ ActionsCore.get_fog_rectangles works")
        
        asyncio.run(test_async())
        
        print("\n✅ All fog of war tests passed!")
        print("\nImplementation Summary:")
        print("- VirtualTable stores fog rectangles in serializable format")
        print("- Fog data persists through save/load operations")
        print("- ActionsCore provides async methods for server operations")
        print("- Ready for client-server synchronization")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = test_fog_implementation()
    sys.exit(0 if success else 1)
