#!/usr/bin/env python3

"""
Test script to verify multiple fog polygons work correctly.
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

def test_multiple_fog_polygons():
    """Test that multiple separate fog polygons are created correctly"""
    print("Testing multiple fog polygons...")
    
    # Create test objects
    gm = GeometricManager()
    rm = RenderManager(None, None)
    rm.GeometricManager = gm
    
    # Test rectangles - two separate areas that don't intersect
    hide_rects = [
        ((100, 100), (200, 200)),  # First fog area
        ((300, 300), (400, 400)),  # Second fog area (separate)
        ((150, 150), (250, 250))   # Overlaps with first - should merge
    ]
    
    reveal_rects = [
        ((120, 120), (180, 180))   # Reveals part of first area
    ]
    
    table = MockTable()
    context = MockContext(is_gm=False)
    
    # Test GeometricManager multiple polygons
    print("Testing GeometricManager.compute_fog_polygons...")
    fog_polygons = gm.compute_fog_polygons(hide_rects, reveal_rects)
    
    print(f"Number of separate fog polygons: {len(fog_polygons)}")
    print("Expected: 2 polygons (one merged from rectangles 1&3, one from rectangle 2)")
    
    for i, polygon in enumerate(fog_polygons):
        print(f"Polygon {i+1}: {polygon.shape[0]} vertices")
        
    # Test RenderManager multiple polygons
    print("\nTesting RenderManager multiple polygons...")
    rm.compute_fog_polygon(hide_rects, reveal_rects, table, context)
    
    print(f"Number of fog polygon vertex arrays: {len(rm.fog_polygon_vertices_list)}")
    
    for i, vertices in enumerate(rm.fog_polygon_vertices_list):
        print(f"Vertex array {i+1}: {len(vertices)} vertices")
        
        # Check color (should be black for player)
        if vertices:
            first_vertex = vertices[0]
            color = first_vertex.color
            print(f"  Color: r={color.r}, g={color.g}, b={color.b}, a={color.a}")
    
    # Test with GM context
    print("\nTesting with GM context...")
    gm_context = MockContext(is_gm=True)
    rm.force_fog_polygon_regeneration()
    rm.compute_fog_polygon(hide_rects, reveal_rects, table, gm_context)
    
    print(f"GM fog polygon vertex arrays: {len(rm.fog_polygon_vertices_list)}")
    
    if rm.fog_polygon_vertices_list:
        first_vertex = rm.fog_polygon_vertices_list[0][0]
        color = first_vertex.color
        print(f"GM color: r={color.r}, g={color.g}, b={color.b}, a={color.a}")
    
    print("\nMultiple fog polygons test completed!")

if __name__ == "__main__":
    test_multiple_fog_polygons()
