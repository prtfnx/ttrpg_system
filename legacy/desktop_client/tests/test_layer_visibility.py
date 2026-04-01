#!/usr/bin/env python3
"""
Test script to verify fog of war layer visibility during role switching
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from gui.gui_actions_bridge import GuiActionsBridge
from gui.tools.fog_of_war_tool import FogOfWarTool
from RenderManager import RenderManager
from GeometricManager import GeometricManager
from unittest.mock import Mock
import logging

# Configure logging for debug
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class MockActions:
    def get_layer_visibility(self, table_id, layer):
        from Actions import ActionResult
        return ActionResult(True, "Success", {'visible': True})
    
    def set_layer_visibility(self, table_id, layer, visible):
        from Actions import ActionResult
        return ActionResult(True, "Success")

class MockTable:
    def __init__(self):
        self.table_id = "test_table"
        self.dict_of_sprites_list = {'fog_of_war': []}
        self.width = 1000
        self.height = 800
    
    def table_to_screen(self, x, y):
        return x, y

class MockContext:
    def __init__(self):
        self.current_table = MockTable()
        self.is_gm = True
        self.RenderManager = None

def test_layer_visibility_during_role_switching():
    """Test that fog layer visibility is properly managed during role switching"""
    print("Testing fog layer visibility during role switching...")
    
    # Create mock context
    context = MockContext()
    
    # Create render manager
    gm = GeometricManager()
    rm = RenderManager(None, None)
    rm.GeometricManager = gm
    context.RenderManager = rm
    
    # Create actions bridge
    actions = MockActions()
    bridge = GuiActionsBridge(context, actions)
    
    # Create fog tool
    fog_tool = FogOfWarTool(context)
    fog_tool.start()
    
    # Add some fog rectangles
    print("\n1. Adding fog rectangles in GM mode...")
    fog_tool.hide_rectangles = [((100, 100), (200, 200))]
    fog_tool.reveal_rectangles = [((120, 120), (180, 180))]
    fog_tool._update_fog_polygon()
    
    # Check GM mode fog visibility
    print(f"   GM mode: is_gm={context.is_gm}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Switch to player mode
    print("\n2. Switching to player mode...")
    bridge.set_user_mode(False)
    print(f"   Player mode: is_gm={context.is_gm}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Check that fog is still computed
    if rm.fog_polygon_vertices_list:
        first_vertex = rm.fog_polygon_vertices_list[0][0]
        color = (first_vertex.color.r, first_vertex.color.g, first_vertex.color.b, first_vertex.color.a)
        print(f"   Player fog color: {color}")
        if abs(color[0] - 0.0) < 0.01 and abs(color[1] - 0.0) < 0.01 and abs(color[2] - 0.0) < 0.01:
            print("   ✓ Player fog color is correct (black)")
        else:
            print("   ✗ Player fog color is incorrect")
    else:
        print("   ✗ No fog polygons in player mode")
    
    # Switch back to GM mode
    print("\n3. Switching back to GM mode...")
    bridge.set_user_mode(True)
    print(f"   GM mode: is_gm={context.is_gm}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Check GM fog color
    if rm.fog_polygon_vertices_list:
        first_vertex = rm.fog_polygon_vertices_list[0][0]
        color = (first_vertex.color.r, first_vertex.color.g, first_vertex.color.b, first_vertex.color.a)
        print(f"   GM fog color: {color}")
        if abs(color[0] - 0.5) < 0.01 and abs(color[1] - 0.5) < 0.01 and abs(color[2] - 0.5) < 0.01:
            print("   ✓ GM fog color is correct (gray)")
        else:
            print("   ✗ GM fog color is incorrect")
    else:
        print("   ✗ No fog polygons in GM mode")
    
    # Try to add new fog in GM mode
    print("\n4. Adding new fog rectangles in GM mode...")
    fog_tool.hide_rectangles.append(((300, 300), (400, 400)))
    fog_tool._update_fog_polygon()
    print(f"   New fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    # Switch to player mode again
    print("\n5. Switching to player mode with new fog...")
    bridge.set_user_mode(False)
    print(f"   Player mode: is_gm={context.is_gm}")
    print(f"   Fog polygons: {len(rm.fog_polygon_vertices_list)}")
    
    print("\nLayer visibility test completed!")

if __name__ == "__main__":
    test_layer_visibility_during_role_switching()
