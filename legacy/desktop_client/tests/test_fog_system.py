#!/usr/bin/env python3
"""
Test fog of war system with proper coordinate conversion
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ContextTable import ContextTable
from GeometricManager import GeometricManager
from unittest.mock import Mock

def test_fog_system_coordinates():
    """Test that fog system uses proper coordinate conversion"""
    
    print("=== Testing Fog System Coordinate Handling ===")
    
    # Create table and context
    table = ContextTable("test", 1000, 800)
    table.set_screen_area(100, 50, 600, 400)
    table.table_scale = 1.0
    table.viewport_x = 0.0
    table.viewport_y = 0.0
    
    context = Mock()
    context.current_table = table
    
    # Test 1: Screen coordinates convert to table coordinates
    print("Test 1: Screen to table coordinate conversion")
    screen_x, screen_y = 200, 150  # Point in screen space
    table_x, table_y = table.screen_to_table(screen_x, screen_y)
    print(f"Screen ({screen_x}, {screen_y}) -> Table ({table_x}, {table_y})")
    
    # Test 2: Create fog rectangles in table coordinates
    print("\nTest 2: Creating fog rectangles in table coordinates")
    hide_rectangles = [
        ((table_x, table_y), (table_x + 50, table_y + 50))  # 50x50 rectangle
    ]
    reveal_rectangles = [
        ((table_x + 10, table_y + 10), (table_x + 40, table_y + 40))  # 30x30 hole
    ]
    
    print(f"Hide rectangle: {hide_rectangles[0]}")
    print(f"Reveal rectangle: {reveal_rectangles[0]}")
    
    # Test 3: Compute fog polygon
    print("\nTest 3: Computing fog polygon")
    fog_polygon = GeometricManager.compute_fog_polygon(hide_rectangles, reveal_rectangles)
    print(f"Fog polygon has {fog_polygon.shape[0]} vertices")
    print(f"First few vertices: {fog_polygon[:3] if fog_polygon.shape[0] > 0 else 'None'}")
    
    # Test 4: Convert vertices to screen coordinates
    print("\nTest 4: Converting vertices to screen coordinates")
    if fog_polygon.shape[0] > 0:
        screen_vertices = []
        for vertex in fog_polygon:
            screen_vertex_x, screen_vertex_y = table.table_to_screen(vertex[0], vertex[1])
            screen_vertices.append([screen_vertex_x, screen_vertex_y])
        
        print(f"First vertex: Table {fog_polygon[0]} -> Screen {screen_vertices[0]}")
        print(f"All vertices in screen space: {len(screen_vertices)} vertices")
        
        # Verify vertices are in screen space (should be larger than table coordinates)
        avg_screen_x = sum(v[0] for v in screen_vertices) / len(screen_vertices)
        avg_screen_y = sum(v[1] for v in screen_vertices) / len(screen_vertices)
        avg_table_x = sum(v[0] for v in fog_polygon) / len(fog_polygon)
        avg_table_y = sum(v[1] for v in fog_polygon) / len(fog_polygon)
        
        print(f"Average table coordinates: ({avg_table_x:.1f}, {avg_table_y:.1f})")
        print(f"Average screen coordinates: ({avg_screen_x:.1f}, {avg_screen_y:.1f})")
        
        # For scale=1.0, screen coordinates should be offset by screen_area position
        expected_screen_x = avg_table_x + 100  # screen_area x offset
        expected_screen_y = avg_table_y + 50   # screen_area y offset
        
        assert abs(avg_screen_x - expected_screen_x) < 1.0, f"Screen X coordinate mismatch: {avg_screen_x} != {expected_screen_x}"
        assert abs(avg_screen_y - expected_screen_y) < 1.0, f"Screen Y coordinate mismatch: {avg_screen_y} != {expected_screen_y}"
        
        print("✓ Coordinate conversion from table to screen successful")
    
    # Test 5: Test with different scale
    print("\nTest 5: Testing with different scale")
    table.table_scale = 2.0
    
    # Same table coordinates
    screen_vertex_x, screen_vertex_y = table.table_to_screen(table_x, table_y)
    print(f"Scale 2.0: Table ({table_x}, {table_y}) -> Screen ({screen_vertex_x}, {screen_vertex_y})")
    
    # Test 6: Test with viewport offset
    print("\nTest 6: Testing with viewport offset")
    table.table_scale = 1.0
    table.viewport_x = 25.0
    table.viewport_y = 25.0
    
    screen_vertex_x, screen_vertex_y = table.table_to_screen(table_x, table_y)
    print(f"Viewport (25, 25): Table ({table_x}, {table_y}) -> Screen ({screen_vertex_x}, {screen_vertex_y})")
    
    print("\n=== All fog system coordinate tests passed! ===")

if __name__ == "__main__":
    test_fog_system_coordinates()
