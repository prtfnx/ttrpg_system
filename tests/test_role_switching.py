#!/usr/bin/env python3
"""
Test script to verify fog of war role switching behavior
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from RenderManager import RenderManager
from GeometricManager import GeometricManager
from unittest.mock import Mock
import logging

# Configure logging for debug
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class MockContext:
    def __init__(self, is_gm: bool):
        self.is_gm = is_gm

class MockTable:
    def table_to_screen(self, x, y):
        return x, y

def test_role_switching():
    """Test that fog persists when switching between GM and player roles"""
    print("Testing fog of war role switching...")
    
    # Create test objects
    gm = GeometricManager()
    rm = RenderManager(None, None)
    rm.GeometricManager = gm
    
    # Test rectangles
    hide_rects = [((100, 100), (200, 200))]
    reveal_rects = [((120, 120), (180, 180))]
    table = MockTable()
    
    # Initial computation in GM context
    print("1. Initial computation in GM context...")
    gm_context = MockContext(is_gm=True)
    result = rm.compute_fog_polygon(hide_rects, reveal_rects, table, gm_context)
    print(f"   Fog computed: {result}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Switch to player context - should maintain fog but change colors
    print("\n2. Switch to player context...")
    player_context = MockContext(is_gm=False)
    result = rm.compute_fog_polygon(hide_rects, reveal_rects, table, player_context)
    print(f"   Fog computed: {result}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Switch back to GM context - should still have fog
    print("\n3. Switch back to GM context...")
    result = rm.compute_fog_polygon(hide_rects, reveal_rects, table, gm_context)
    print(f"   Fog computed: {result}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Test adding new rectangles in GM mode
    print("\n4. Add new rectangles in GM mode...")
    new_hide_rects = [((100, 100), (200, 200)), ((300, 300), (400, 400))]
    result = rm.compute_fog_polygon(new_hide_rects, reveal_rects, table, gm_context)
    print(f"   Fog computed: {result}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Switch to player mode after adding rectangles
    print("\n5. Switch to player mode with new rectangles...")
    result = rm.compute_fog_polygon(new_hide_rects, reveal_rects, table, player_context)
    print(f"   Fog computed: {result}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    print("\nRole switching test completed!")

if __name__ == "__main__":
    test_role_switching()
