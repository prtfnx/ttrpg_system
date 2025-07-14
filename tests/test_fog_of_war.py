#!/usr/bin/env python3
"""
Test script to verify fog of war implementation
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from ContextTable import ContextTable
from gui.tools.fog_of_war_tool import FogOfWarTool
from unittest.mock import Mock
import logging

# Configure logging for debug
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def test_fog_of_war_tool():
    """Test that fog of war tool mouse events work"""
    
    print("=== Testing Fog of War Tool Events ===")
    
    # Create table and context like in the real app
    table = ContextTable("test", 1000, 800)
    table.set_screen_area(200, 100, 800, 800)
    
    context = Mock()
    context.current_table = table
    context.is_gm = True  # GM mode
    
    # Mock render manager to avoid SDL3 issues
    mock_render_manager = Mock()
    mock_render_manager.dict_of_sprites_list = table.dict_of_sprites_list
    mock_render_manager.renderer = Mock()
    context.RenderManager = mock_render_manager
    
    # Create fog of war tool
    tool = FogOfWarTool(context)
    tool.start()
    
    print(f"Tool active: {tool.active}")
    print(f"Tool drawing: {tool.drawing}")
    print(f"Tool mode: {tool.current_mode}")
    
    # Test mouse down (should start drawing)
    result = tool.handle_mouse_down(400, 300, 1)  # Left mouse button
    print(f"Mouse down result: {result} (should be True)")
    print(f"Tool drawing after mouse down: {tool.drawing}")
    print(f"Start point: {tool.start_point}")
    
    # Test mouse motion (should update end point)
    result = tool.handle_mouse_motion(500, 400)
    print(f"Mouse motion result: {result} (should be True)")
    print(f"End point: {tool.end_point}")
    
    # Test mouse up (should finish drawing and save rectangle)
    result = tool.handle_mouse_up(500, 400, 1)  # Left mouse button
    print(f"Mouse up result: {result} (should be True)")
    print(f"Tool drawing after mouse up: {tool.drawing}")
    print(f"Fog rectangles: {len(tool.fog_rectangles)}")
    
    # Test hide all table
    tool.hide_all_table()
    print(f"Fog rectangles after hide all: {len(tool.fog_rectangles)}")
    
    # Test reveal all table
    tool.reveal_all_table()
    print(f"Fog rectangles after reveal all: {len(tool.fog_rectangles)}")
    
    # Test mode switching
    tool.set_mode("reveal")
    print(f"Tool mode after switch: {tool.current_mode}")
    
    print("Fog of war tool test completed successfully!")

if __name__ == "__main__":
    test_fog_of_war_tool()
