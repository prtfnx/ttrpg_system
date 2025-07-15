#!/usr/bin/env python3
"""
Test coordinate precision in fog of war system
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ContextTable import ContextTable
from GeometricManager import GeometricManager
from unittest.mock import Mock

def test_coordinate_precision():
    """Test that fog coordinates maintain precision"""
    
    print("=== Testing Fog Coordinate Precision ===")
    
    # Create table
    table = ContextTable("test", 1000, 800)
    table.set_screen_area(100, 50, 600, 400)
    table.table_scale = 1.0
    table.viewport_x = 0.0
    table.viewport_y = 0.0
    
    # Test precise coordinates
    precise_x1, precise_y1 = 150.5, 200.75
    precise_x2, precise_y2 = 250.25, 300.5
    
    print(f"Original coordinates: ({precise_x1}, {precise_y1}) to ({precise_x2}, {precise_y2})")
    
    # Create rectangle tuple (same as fog tool)
    rect_tuple = ((precise_x1, precise_y1), (precise_x2, precise_y2))
    hide_rectangles = [rect_tuple]
    
    # Test union operation
    polygon = GeometricManager.union_rectangles_vertices(hide_rectangles)
    print(f"Polygon vertices from union_rectangles_vertices:")
    for i, vertex in enumerate(polygon):
        print(f"  Vertex {i}: ({vertex[0]}, {vertex[1]})")
    
    # Check if precision is maintained
    expected_vertices = [
        [precise_x1, precise_y1],  # bottom-left
        [precise_x2, precise_y1],  # bottom-right
        [precise_x2, precise_y2],  # top-right
        [precise_x1, precise_y2]   # top-left
    ]
    
    print(f"\nExpected vertices:")
    for i, vertex in enumerate(expected_vertices):
        print(f"  Vertex {i}: ({vertex[0]}, {vertex[1]})")
    
    # Check precision
    precision_ok = True
    for i, (actual, expected) in enumerate(zip(polygon, expected_vertices)):
        if abs(actual[0] - expected[0]) > 1e-10 or abs(actual[1] - expected[1]) > 1e-10:
            print(f"❌ Precision error at vertex {i}: actual ({actual[0]}, {actual[1]}) != expected ({expected[0]}, {expected[1]})")
            precision_ok = False
    
    if precision_ok:
        print("✅ Coordinate precision maintained correctly")
    
    # Test coordinate conversion to screen
    print(f"\n=== Testing Screen Coordinate Conversion ===")
    screen_vertices = []
    for vertex in polygon:
        screen_x, screen_y = table.table_to_screen(vertex[0], vertex[1])
        screen_vertices.append([screen_x, screen_y])
        print(f"Table ({vertex[0]}, {vertex[1]}) -> Screen ({screen_x}, {screen_y})")
    
    # Convert back to table coordinates
    print(f"\n=== Testing Roundtrip Conversion ===")
    for i, screen_vertex in enumerate(screen_vertices):
        table_x, table_y = table.screen_to_table(screen_vertex[0], screen_vertex[1])
        original_vertex = polygon[i]
        print(f"Screen ({screen_vertex[0]}, {screen_vertex[1]}) -> Table ({table_x}, {table_y})")
        print(f"  Original: ({original_vertex[0]}, {original_vertex[1]})")
        
        # Check roundtrip precision
        if abs(table_x - original_vertex[0]) > 1e-10 or abs(table_y - original_vertex[1]) > 1e-10:
            print(f"❌ Roundtrip precision error: ({table_x}, {table_y}) != ({original_vertex[0]}, {original_vertex[1]})")
            precision_ok = False
    
    if precision_ok:
        print("✅ Roundtrip coordinate conversion maintains precision")
    
    print(f"\n=== Test Result: {'PASS' if precision_ok else 'FAIL'} ===")

if __name__ == "__main__":
    test_coordinate_precision()
