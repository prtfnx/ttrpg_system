#!/usr/bin/env python3
"""
Test drag and drop coordinate conversion
"""
import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import unittest
from unittest.mock import Mock, MagicMock
import logging

# Import the modules we're testing
from dragdrop_sys import _get_drop_position, Position
from ContextTable import ContextTable

# Configure logging for tests
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


class TestDragDropCoordinates(unittest.TestCase):
    """Test coordinate conversion in drag and drop system"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.table = ContextTable("test_table", 1000, 800)
        # Set screen area (x=100, y=50, width=600, height=400)
        self.table.set_screen_area(100, 50, 600, 400)
        
        # Set some viewport offset and scale for testing
        self.table.viewport_x = 0.0
        self.table.viewport_y = 0.0
        self.table.table_scale = 1.0
        
    def test_screen_to_table_conversion(self):
        """Test that screen coordinates are properly converted to table coordinates"""
        # Test basic conversion (no offset, scale=1.0)
        screen_x, screen_y = 200, 150  # Point in screen space
        table_x, table_y = self.table.screen_to_table(screen_x, screen_y)
        
        # Expected: screen point (200, 150) should become table point (100, 100)
        # Because screen area starts at (100, 50), so relative point is (100, 100)
        self.assertAlmostEqual(table_x, 100.0, places=2)
        self.assertAlmostEqual(table_y, 100.0, places=2)
        
    def test_screen_to_table_with_viewport_offset(self):
        """Test conversion with viewport offset"""
        # Set viewport offset
        self.table.viewport_x = 50.0
        self.table.viewport_y = 25.0
        
        screen_x, screen_y = 200, 150
        table_x, table_y = self.table.screen_to_table(screen_x, screen_y)
        
        # With offset (50, 25), the table coordinates should be offset by that amount
        self.assertAlmostEqual(table_x, 150.0, places=2)  # 100 + 50
        self.assertAlmostEqual(table_y, 125.0, places=2)  # 100 + 25
        
    def test_screen_to_table_with_scaling(self):
        """Test conversion with table scaling"""
        # Set table scale
        self.table.table_scale = 2.0
        
        screen_x, screen_y = 200, 150
        table_x, table_y = self.table.screen_to_table(screen_x, screen_y)
        
        # With scale=2.0, table coordinates should be halved
        self.assertAlmostEqual(table_x, 50.0, places=2)  # 100 / 2.0
        self.assertAlmostEqual(table_y, 50.0, places=2)  # 100 / 2.0
        
    def test_get_drop_position_with_context_cursor(self):
        """Test _get_drop_position using cursor position from context"""
        # Create mock context with cursor position
        context = Mock()
        context.cursor_position_x = 200.0
        context.cursor_position_y = 150.0
        context.current_table = self.table
        
        position = _get_drop_position(context)
        
        # Should get converted table coordinates
        self.assertAlmostEqual(position.x, 100.0, places=2)
        self.assertAlmostEqual(position.y, 100.0, places=2)
        
    def test_get_drop_position_fallback_to_table_center(self):
        """Test _get_drop_position fallback to table center when no cursor position"""
        # Create mock context without cursor position
        context = Mock()
        context.current_table = self.table
        # Remove cursor position attributes
        if hasattr(context, 'cursor_position_x'):
            delattr(context, 'cursor_position_x')
        if hasattr(context, 'cursor_position_y'):
            delattr(context, 'cursor_position_y')
        
        position = _get_drop_position(context)
        
        # Should get table center
        expected_x = self.table.width // 2  # 500
        expected_y = self.table.height // 2  # 400
        self.assertEqual(position.x, expected_x)
        self.assertEqual(position.y, expected_y)
        
    def test_get_drop_position_no_table(self):
        """Test _get_drop_position with no current table"""
        # Create mock context without table
        context = Mock()
        context.cursor_position_x = 200.0
        context.cursor_position_y = 150.0
        context.current_table = None
        
        position = _get_drop_position(context)
        
        # Should use screen coordinates as-is when no table
        self.assertEqual(position.x, 200.0)
        self.assertEqual(position.y, 150.0)
        
    def test_get_drop_position_default_fallback(self):
        """Test _get_drop_position ultimate fallback to default position"""
        # Create mock context with no cursor position and no table
        context = Mock()
        context.current_table = None
        # Remove cursor position attributes
        if hasattr(context, 'cursor_position_x'):
            delattr(context, 'cursor_position_x')
        if hasattr(context, 'cursor_position_y'):
            delattr(context, 'cursor_position_y')
        
        position = _get_drop_position(context)
        
        # Should get default position
        self.assertEqual(position.x, 400)
        self.assertEqual(position.y, 300)
        
    def test_table_coordinate_roundtrip(self):
        """Test that table_to_screen and screen_to_table are inverses"""
        # Start with a table coordinate
        original_table_x, original_table_y = 123.5, 456.7
        
        # Convert to screen and back
        screen_x, screen_y = self.table.table_to_screen(original_table_x, original_table_y)
        recovered_table_x, recovered_table_y = self.table.screen_to_table(screen_x, screen_y)
        
        # Should get back the original coordinates
        self.assertAlmostEqual(recovered_table_x, original_table_x, places=5)
        self.assertAlmostEqual(recovered_table_y, original_table_y, places=5)


if __name__ == '__main__':
    print("Running drag and drop coordinate conversion tests...")
    unittest.main()
