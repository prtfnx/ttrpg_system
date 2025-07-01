#!/usr/bin/env python3
"""
Integration test script for TTRPG system features
Tests measurement tool, paint manager integration, layer management, and user modes
"""

import sys
import os
import logging

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from logger import setup_logger

logger = setup_logger(__name__)

def test_measurement_tool():
    """Test measurement tool functionality"""
    logger.info("Testing measurement tool...")
    
    try:
        from gui.tools.measurement_tool import MeasurementTool
        
        # Create a mock context
        class MockContext:
            def __init__(self):
                self.current_table = MockTable()
        
        class MockTable:
            def screen_to_table(self, x, y):
                return x / 2.0, y / 2.0  # Mock zoom of 2x
            
            def table_to_screen(self, x, y):
                return x * 2.0, y * 2.0
        
        context = MockContext()
        tool = MeasurementTool(context)
        
        # Test tool lifecycle
        tool.start()
        assert tool.active, "Tool should be active after start"
        
        # Test measurement
        tool.handle_mouse_down(100, 100)
        assert tool.measuring, "Tool should be measuring after mouse down"
        assert tool.start_point is not None, "Start point should be set"
        
        tool.handle_mouse_motion(200, 200)
        assert tool.end_point is not None, "End point should be set on motion"
        
        distance = tool.get_distance()
        assert distance is not None, "Distance should be calculated"
        assert distance > 0, "Distance should be positive"
        
        tool.handle_mouse_up(200, 200)
        assert not tool.measuring, "Tool should stop measuring after mouse up"
        
        # Test measurement text
        measurement_text = tool.get_measurement_text()
        assert "Distance:" in measurement_text, "Measurement text should contain distance"
        
        tool.stop()
        assert not tool.active, "Tool should be inactive after stop"
        
        logger.info("✓ Measurement tool tests passed")
        
    except Exception as e:
        logger.error(f"✗ Measurement tool tests failed: {e}")
        return False
    
    return True

def test_gui_actions_bridge():
    """Test GUI actions bridge functionality"""
    logger.info("Testing GUI actions bridge...")
    
    try:
        from gui.gui_actions_bridge import GuiActionsBridge
        
        # Create a mock context
        class MockContext:
            def __init__(self):
                self.current_table = None
                self.is_gm = True
                self.Actions = MockActions()
            
            def set_current_tool(self, tool):
                self.current_tool = tool
        
        class MockActions:
            def get_table_info(self, table_id):
                from core_table.actions_protocol import ActionResult
                return ActionResult(True, "Mock table info", {"name": "Test Table"})
            
            def get_all_tables(self):
                from core_table.actions_protocol import ActionResult
                return ActionResult(True, "Mock tables", {"tables": {}})
            
            def add_chat_message(self, message):
                from core_table.actions_protocol import ActionResult
                return ActionResult(True, f"Added message: {message}")
        
        context = MockContext()
        bridge = GuiActionsBridge(context)
        
        # Test user mode functionality
        assert bridge.is_gm_mode(), "Default should be GM mode"
        
        bridge.set_user_mode(False)
        assert not bridge.is_gm_mode(), "Should be player mode after setting"
        
        # Test layer access
        visible_layers = bridge.get_visible_layers_for_mode()
        assert len(visible_layers) == 2, "Player mode should have limited layers"
        assert "tokens" in visible_layers, "Player should see tokens layer"
        assert "light" in visible_layers, "Player should see light layer"
        
        bridge.set_user_mode(True)
        visible_layers = bridge.get_visible_layers_for_mode()
        assert len(visible_layers) > 2, "GM mode should have more layers"
        
        # Test panel access
        assert bridge.can_access_panel("chat_panel"), "Should access chat panel"
        bridge.set_user_mode(False)
        assert not bridge.can_access_panel("debug_panel"), "Player shouldn't access debug panel"
        
        # Test tool methods
        bridge.set_current_tool("Measure")
        assert bridge.get_current_tool() == "Measure", "Tool should be set"
        
        logger.info("✓ GUI actions bridge tests passed")
        
    except Exception as e:
        logger.error(f"✗ GUI actions bridge tests failed: {e}")
        return False
    
    return True

def test_paint_integration():
    """Test paint manager integration"""
    logger.info("Testing paint manager integration...")
    
    try:
        # Test paint manager import and basic functionality
        import PaintManager
        
        # These should not raise exceptions
        active = PaintManager.is_paint_mode_active()
        logger.info(f"Paint mode initially active: {active}")
        
        logger.info("✓ Paint manager integration tests passed")
        
    except Exception as e:
        logger.error(f"✗ Paint manager integration tests failed: {e}")
        return False
    
    return True

def run_all_tests():
    """Run all integration tests"""
    logger.info("Running TTRPG system integration tests...")
    
    tests = [
        test_measurement_tool,
        test_gui_actions_bridge,
        test_paint_integration,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            logger.error(f"Test {test.__name__} crashed: {e}")
            failed += 1
    
    logger.info(f"Integration tests completed: {passed} passed, {failed} failed")
    
    if failed == 0:
        logger.info("🎉 All integration tests passed!")
    else:
        logger.warning(f"⚠️  {failed} tests failed")
    
    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
