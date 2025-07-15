#!/usr/bin/env python3

"""
Test script to verify the fog color fix works properly.
"""

import sys
import os

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from RenderManager import RenderManager
from GeometricManager import GeometricManager
import numpy as np

class MockContext:
    def __init__(self, is_gm=False):
        self.is_gm = is_gm

class MockTable:
    def __init__(self):
        self.width = 1000
        self.height = 800
        
    def table_to_screen(self, x, y):
        return x, y

def test_fog_color_fix():
    """Test that fog color is properly applied based on user role"""
    print("Testing fog color fix...")
    
    # Create test objects
    gm = GeometricManager()
    rm = RenderManager(None, None)
    rm.GeometricManager = gm
    
    # Test rectangles
    hide_rects = [((100, 100), (200, 200))]
    reveal_rects = [((120, 120), (180, 180))]
    table = MockTable()
    
    # Test GM context (should get gray fog)
    print("Testing GM context...")
    gm_context = MockContext(is_gm=True)
    rm.compute_fog_polygon(hide_rects, reveal_rects, table, gm_context)
    
    if rm.fog_polygon_vertices:
        # Check first vertex color (should be gray)
        first_vertex = rm.fog_polygon_vertices[0]
        color = first_vertex.color
        print(f"GM fog color: r={color.r}, g={color.g}, b={color.b}, a={color.a}")
        
        # Should be gray (0.5, 0.5, 0.5, 0.3)
        if abs(color.r - 0.5) < 0.01 and abs(color.g - 0.5) < 0.01 and abs(color.b - 0.5) < 0.01:
            print("✓ GM fog color correct (gray)")
        else:
            print("✗ GM fog color incorrect")
    else:
        print("✗ No fog polygon vertices generated for GM")
    
    # Test player context (should get black fog)
    print("\nTesting Player context...")
    player_context = MockContext(is_gm=False)
    rm.force_fog_polygon_regeneration()  # Force regeneration
    rm.compute_fog_polygon(hide_rects, reveal_rects, table, player_context)
    
    if rm.fog_polygon_vertices:
        # Check first vertex color (should be black)
        first_vertex = rm.fog_polygon_vertices[0]
        color = first_vertex.color
        print(f"Player fog color: r={color.r}, g={color.g}, b={color.b}, a={color.a}")
        
        # Should be black (0.0, 0.0, 0.0, 1.0)
        if abs(color.r - 0.0) < 0.01 and abs(color.g - 0.0) < 0.01 and abs(color.b - 0.0) < 0.01:
            print("✓ Player fog color correct (black)")
        else:
            print("✗ Player fog color incorrect")
    else:
        print("✗ No fog polygon vertices generated for player")
    
    print("\nFog color fix test completed!")

if __name__ == "__main__":
    test_fog_color_fix()
