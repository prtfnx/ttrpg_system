#!/usr/bin/env python3
"""
Test coordinate conversion in fog of war system
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ContextTable import ContextTable
from unittest.mock import Mock

def test_coordinate_conversion():
    """Test that fog tool coordinates are properly converted"""
    
    print("=== Testing Fog Tool Coordinate Conversion ===")
    
    # Create table and context like in the real app
    table = ContextTable("test", 1000, 800)
    table.set_screen_area(100, 50, 600, 400)  # Screen area: x=100, y=50, w=600, h=400
    table.table_scale = 1.0
    table.viewport_x = 0.0
    table.viewport_y = 0.0
    
    context = Mock()
    context.current_table = table
    
    # Test coordinate conversion
    print(f"Table dimensions: {table.width}x{table.height}")
    print(f"Screen area: {table.screen_area}")
    print(f"Table scale: {table.table_scale}")
    print(f"Viewport: ({table.viewport_x}, {table.viewport_y})")
    
    # Test point in the middle of the screen area
    screen_x, screen_y = 400, 250  # Middle of screen area (100+600/2, 50+400/2)
    
    # Convert to table coordinates
    table_x, table_y = table.screen_to_table(screen_x, screen_y)
    print(f"Screen ({screen_x}, {screen_y}) -> Table ({table_x}, {table_y})")
    
    # Convert back to screen coordinates
    back_screen_x, back_screen_y = table.table_to_screen(table_x, table_y)
    print(f"Table ({table_x}, {table_y}) -> Screen ({back_screen_x}, {back_screen_y})")
    
    # Verify roundtrip conversion
    assert abs(back_screen_x - screen_x) < 0.001, f"Screen X mismatch: {back_screen_x} != {screen_x}"
    assert abs(back_screen_y - screen_y) < 0.001, f"Screen Y mismatch: {back_screen_y} != {screen_y}"
    
    print("✓ Coordinate conversion roundtrip successful")
    
    # Test with different table scales
    print("\n=== Testing with different scales ===")
    table.table_scale = 2.0
    
    table_x, table_y = table.screen_to_table(screen_x, screen_y)
    print(f"Scale 2.0: Screen ({screen_x}, {screen_y}) -> Table ({table_x}, {table_y})")
    
    back_screen_x, back_screen_y = table.table_to_screen(table_x, table_y)
    print(f"Scale 2.0: Table ({table_x}, {table_y}) -> Screen ({back_screen_x}, {back_screen_y})")
    
    assert abs(back_screen_x - screen_x) < 0.001, f"Screen X mismatch at scale 2.0: {back_screen_x} != {screen_x}"
    assert abs(back_screen_y - screen_y) < 0.001, f"Screen Y mismatch at scale 2.0: {back_screen_y} != {screen_y}"
    
    print("✓ Coordinate conversion with scale 2.0 successful")
    
    # Test with viewport offset
    print("\n=== Testing with viewport offset ===")
    table.table_scale = 1.0
    table.viewport_x = 50.0
    table.viewport_y = 25.0
    
    table_x, table_y = table.screen_to_table(screen_x, screen_y)
    print(f"Viewport (50, 25): Screen ({screen_x}, {screen_y}) -> Table ({table_x}, {table_y})")
    
    back_screen_x, back_screen_y = table.table_to_screen(table_x, table_y)
    print(f"Viewport (50, 25): Table ({table_x}, {table_y}) -> Screen ({back_screen_x}, {back_screen_y})")
    
    assert abs(back_screen_x - screen_x) < 0.001, f"Screen X mismatch with viewport: {back_screen_x} != {screen_x}"
    assert abs(back_screen_y - screen_y) < 0.001, f"Screen Y mismatch with viewport: {back_screen_y} != {screen_y}"
    
    print("✓ Coordinate conversion with viewport offset successful")
    
    print("\n=== All coordinate conversion tests passed! ===")

if __name__ == "__main__":
    test_coordinate_conversion()
