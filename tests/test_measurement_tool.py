#!/usr/bin/env python3
"""
Test measurement tool functionality
"""
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from ContextTable import ContextTable
from gui.tools.measurement_tool import MeasurementTool
from unittest.mock import Mock
import logging

# Configure logging for debug
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def test_measurement_tool():
    """Test that measurement tool mouse events work"""
    
    print("=== Testing Measurement Tool Events ===")
    
    # Create table and context like in the real app
    table = ContextTable("test", 1000, 800)
    table.set_screen_area(200, 100, 800, 800)
    
    context = Mock()
    context.current_table = table
    
    # Create measurement tool
    tool = MeasurementTool(context)
    tool.start()
    
    print(f"Tool active: {tool.active}")
    print(f"Tool measuring: {tool.measuring}")
    
    # Test mouse down (should start measurement)
    result = tool.handle_mouse_down(400, 300)
    print(f"Mouse down result: {result} (should be True)")
    print(f"Tool measuring after mouse down: {tool.measuring}")
    print(f"Start point: {tool.start_point}")
    
    # Test mouse motion (should update end point)
    result = tool.handle_mouse_motion(500, 400)
    print(f"Mouse motion result: {result} (should be True)")
    print(f"End point: {tool.end_point}")
    
    # Test measurement calculation
    distance = tool.get_distance()
    print(f"Distance: {distance}")
    
    # Test mouse up (should finish measurement)
    result = tool.handle_mouse_up(500, 400)
    print(f"Mouse up result: {result} (should be True)")
    print(f"Tool measuring after mouse up: {tool.measuring}")
    print(f"Saved measurements: {len(tool.saved_measurements)}")
    
    print("Measurement tool test completed successfully!")

if __name__ == "__main__":
    test_measurement_tool()
