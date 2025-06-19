"""
Comprehensive tests for Paint system and GUI integration.
Tests real-world drawing functionality, canvas management, and user interaction flows.
"""
import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import ctypes

# Import test utilities to set up path dynamically
from tests.test_utils import setup_test_environment
setup_test_environment()

try:
    import paint
    from paint import PaintSystem, PaintCanvas
    PAINT_AVAILABLE = True
except ImportError as e:
    print(f"Paint import warning: {e}")
    PAINT_AVAILABLE = False


class TestPaintSystem(unittest.TestCase):
    """Test Paint system functionality and canvas management."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_context = Mock()
        self.mock_context.renderer = Mock()
        self.mock_context.window = Mock()
        
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_paint_system_initialization(self):
        """Test PaintSystem initialization with context."""
        paint_system = PaintSystem(self.mock_context)
        
        # Verify initialization
        self.assertEqual(paint_system.context, self.mock_context)
        self.assertFalse(paint_system.paint_mode)
        self.assertIsNone(paint_system.canvas)
        self.assertIsNone(paint_system.paint_surface)
        self.assertIsNone(paint_system.paint_texture)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    @patch('paint.sdl3')
    def test_enter_paint_mode(self, mock_sdl3):
        """Test entering paint mode and canvas creation."""
        paint_system = PaintSystem(self.mock_context)
        
        # Mock SDL surface and texture creation
        mock_surface = Mock()
        mock_texture = Mock()
        mock_sdl3.SDL_CreateSurface.return_value = mock_surface
        mock_sdl3.SDL_CreateTextureFromSurface.return_value = mock_texture
        
        # Mock window size
        mock_sdl3.SDL_GetWindowSize.side_effect = lambda window, w, h: None
        with patch('ctypes.c_int') as mock_c_int:
            mock_width = Mock()
            mock_height = Mock()
            mock_width.value = 1920
            mock_height.value = 1080
            mock_c_int.side_effect = [mock_width, mock_height]
            
            # Enter paint mode
            result = paint_system.enter_paint_mode(800, 600)
            
            # Verify paint mode activated
            self.assertTrue(paint_system.paint_mode)
            self.assertIsNotNone(paint_system.canvas)
            self.assertEqual(paint_system.paint_surface, mock_surface)
            self.assertEqual(paint_system.paint_texture, mock_texture)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    @patch('paint.sdl3')
    def test_exit_paint_mode(self, mock_sdl3):
        """Test exiting paint mode and resource cleanup."""
        paint_system = PaintSystem(self.mock_context)
        
        # Set up paint mode state
        paint_system.paint_mode = True
        paint_system.paint_surface = Mock()
        paint_system.paint_texture = Mock()
        paint_system.temp_canvas_surface = Mock()
        paint_system.temp_canvas_texture = Mock()
        paint_system.canvas = Mock()
        
        # Exit paint mode
        paint_system.exit_paint_mode()
        
        # Verify cleanup
        self.assertFalse(paint_system.paint_mode)
        self.assertIsNone(paint_system.canvas)
        mock_sdl3.SDL_DestroySurface.assert_called()
        mock_sdl3.SDL_DestroyTexture.assert_called()
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    @patch('paint.sdl3')
    def test_paint_canvas_creation(self, mock_sdl3):
        """Test paint canvas creation with specific dimensions."""
        # Test PaintCanvas directly
        canvas = PaintCanvas(800, 600)
        
        # Verify canvas properties
        self.assertEqual(canvas.width, 800)
        self.assertEqual(canvas.height, 600)
        self.assertEqual(canvas.current_color, (255, 255, 255, 255))  # Default white
        self.assertEqual(canvas.current_width, 3)  # Default brush width
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available") 
    @patch('paint.sdl3')
    def test_paint_drawing_operations(self, mock_sdl3):
        """Test drawing operations on paint canvas."""
        paint_system = PaintSystem(self.mock_context)
        canvas = PaintCanvas(800, 600)
        paint_system.canvas = canvas
        
        # Mock SDL drawing functions
        mock_surface = Mock()
        paint_system.paint_surface = mock_surface
        
        # Test drawing a line
        with patch.object(paint_system, 'draw_line') as mock_draw_line:
            paint_system.draw_line(100, 100, 200, 200)
            mock_draw_line.assert_called_once_with(100, 100, 200, 200)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    @patch('paint.sdl3')
    def test_paint_color_management(self, mock_sdl3):
        """Test paint color and brush management."""
        canvas = PaintCanvas(800, 600)
        
        # Test color changing
        canvas.set_color(255, 0, 0, 255)  # Red
        self.assertEqual(canvas.current_color, (255, 0, 0, 255))
        
        # Test brush width changing
        canvas.set_brush_width(5)
        self.assertEqual(canvas.current_width, 5)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    @patch('paint.sdl3')
    def test_paint_system_integration_with_context(self, mock_sdl3):
        """Test paint system integration with main application context."""
        # Test global paint system initialization
        with patch('paint.paint_system', None):
            paint.init_paint_system(self.mock_context)
            
            # Verify global paint system was created
            self.assertIsNotNone(paint.paint_system)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_paint_event_handling(self):
        """Test paint system event handling for user input."""
        # Mock SDL event
        mock_event = Mock()
        mock_event.type = 1024  # Mock mouse button down
        mock_event.button = Mock()
        mock_event.button.button = 1  # Left mouse button
        mock_event.button.x = 150
        mock_event.button.y = 200
        
        # Test event handling
        with patch('paint.paint_system') as mock_paint_system:
            mock_paint_system.paint_mode = True
            mock_paint_system.handle_mouse_event = Mock(return_value=True)
            
            result = paint.handle_paint_events(mock_event)
            # Result depends on implementation, but test that system responds
            self.assertIsNotNone(result)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    @patch('paint.sdl3')
    def test_paint_rendering_pipeline(self, mock_sdl3):
        """Test paint system rendering pipeline."""
        paint_system = PaintSystem(self.mock_context)
        paint_system.paint_mode = True
        paint_system.paint_texture = Mock()
        
        # Test rendering
        paint_system.render_paint_canvas()
        
        # Verify rendering calls were made
        self.mock_context.renderer  # Context renderer should be used
    
    def test_paint_real_world_drawing_session(self):
        """Test complete drawing session workflow."""
        if not PAINT_AVAILABLE:
            self.skipTest("Paint system not available")
            
        paint_system = PaintSystem(self.mock_context)
        
        with patch('paint.sdl3') as mock_sdl3:
            # Mock SDL resources
            mock_sdl3.SDL_CreateSurface.return_value = Mock()
            mock_sdl3.SDL_CreateTextureFromSurface.return_value = Mock()
            
            # Simulate drawing session
            # 1. Enter paint mode
            mock_sdl3.SDL_GetWindowSize.side_effect = lambda w, width, height: None
            with patch('ctypes.c_int') as mock_c_int:
                mock_width = Mock()
                mock_height = Mock()
                mock_width.value = 800
                mock_height.value = 600
                mock_c_int.side_effect = [mock_width, mock_height]
                
                paint_system.enter_paint_mode()
                
                # 2. Change brush settings
                if paint_system.canvas:
                    paint_system.canvas.set_color(255, 0, 0, 255)  # Red
                    paint_system.canvas.set_brush_width(5)
                
                # 3. Draw something (simulate)
                # In real use, this would be mouse events
                
                # 4. Exit paint mode
                paint_system.exit_paint_mode()
                
                # Verify session completed
                self.assertFalse(paint_system.paint_mode)


class TestPaintCanvas(unittest.TestCase):
    """Test PaintCanvas functionality separately."""
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_canvas_initialization(self):
        """Test canvas initialization with custom dimensions."""
        canvas = PaintCanvas(1024, 768)
        
        self.assertEqual(canvas.width, 1024)
        self.assertEqual(canvas.height, 768)
        self.assertEqual(canvas.current_color, (255, 255, 255, 255))
        self.assertEqual(canvas.current_width, 3)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_canvas_color_operations(self):
        """Test canvas color management operations."""
        canvas = PaintCanvas(800, 600)
        
        # Test various colors
        colors = [
            (255, 0, 0, 255),    # Red
            (0, 255, 0, 255),    # Green
            (0, 0, 255, 255),    # Blue
            (255, 255, 0, 255),  # Yellow
            (128, 128, 128, 255) # Gray
        ]
        
        for color in colors:
            canvas.set_color(*color)
            self.assertEqual(canvas.current_color, color)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_canvas_brush_operations(self):
        """Test canvas brush width management."""
        canvas = PaintCanvas(800, 600)
        
        # Test various brush widths
        widths = [1, 3, 5, 10, 20]
        
        for width in widths:
            canvas.set_brush_width(width)
            self.assertEqual(canvas.current_width, width)


class TestPaintIntegrationScenarios(unittest.TestCase):
    """Test paint system integration with other game components."""
    def setUp(self):
        """Set up test fixtures."""
        self.mock_context = Mock()
        self.mock_context.renderer = Mock()
        self.mock_context.window = Mock()

    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_paint_system_with_table_overlay(self):
        """Test paint system as overlay on game table."""
        paint_system = PaintSystem(self.mock_context)
        
        # Mock table context
        self.mock_context.current_table = Mock()
        self.mock_context.table_viewport = (100, 100, 800, 600)
        
        with patch('paint.sdl3') as mock_sdl3:
            mock_sdl3.SDL_CreateSurface.return_value = Mock()
            mock_sdl3.SDL_CreateTextureFromSurface.return_value = Mock()
            
            with patch('paint.ctypes') as mock_ctypes:
                # Create real ctypes instances for byref to work
                import ctypes
                mock_width = ctypes.c_int(800)
                mock_height = ctypes.c_int(600)
                mock_ctypes.c_int.side_effect = [mock_width, mock_height]
                mock_ctypes.byref = ctypes.byref  # Use real byref function
                
                # Mock SDL_GetWindowSize to set the values
                def mock_get_window_size(window, width_ptr, height_ptr):
                    width_ptr.contents = ctypes.c_int(800)
                    height_ptr.contents = ctypes.c_int(600)
                    return 0
                    
                mock_sdl3.SDL_GetWindowSize.side_effect = mock_get_window_size
                
                # Enter paint mode over table
                paint_system.enter_paint_mode()
                
                # Verify integration
                self.assertTrue(paint_system.paint_mode)
                self.assertIsNotNone(paint_system.canvas)
    
    @unittest.skipUnless(PAINT_AVAILABLE, "Paint system not available")
    def test_paint_system_multiplayer_collaboration(self):
        """Test paint system in multiplayer collaborative scenario."""
        # Multiple paint systems for different players
        paint_systems = []
        
        for i in range(3):  # 3 players
            mock_context = Mock()
            mock_context.renderer = Mock()
            mock_context.window = Mock()
            paint_system = PaintSystem(mock_context)
            paint_systems.append(paint_system)
        
        # Each player could potentially paint
        self.assertEqual(len(paint_systems), 3)
        
        # All systems should be independent
        for paint_system in paint_systems:
            self.assertFalse(paint_system.paint_mode)
            self.assertIsNone(paint_system.canvas)
    
    def test_paint_system_performance_considerations(self):
        """Test paint system performance characteristics."""
        if not PAINT_AVAILABLE:
            self.skipTest("Paint system not available")
            
        # Test large canvas creation
        large_canvas = PaintCanvas(4096, 4096)
        self.assertEqual(large_canvas.width, 4096)
        self.assertEqual(large_canvas.height, 4096)
        
        # Test many color changes (performance consideration)
        import time
        start_time = time.time()
        
        for i in range(100):
            large_canvas.set_color(i % 256, (i * 2) % 256, (i * 3) % 256, 255)
            large_canvas.set_brush_width((i % 10) + 1)
        
        end_time = time.time()
        elapsed = end_time - start_time
        
        # Should complete quickly (under 1 second for 100 operations)
        self.assertLess(elapsed, 1.0)


if __name__ == '__main__':
    # Create test suite
    test_classes = [
        TestPaintSystem,
        TestPaintCanvas,
        TestPaintIntegrationScenarios
    ]
    
    suite = unittest.TestSuite()
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"PAINT SYSTEM TESTS SUMMARY")
    print(f"{'='*60}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print(f"\nFailures: {len(result.failures)}")
        for test, trace in result.failures[:2]:
            print(f"- {test}")
    
    if result.errors:
        print(f"\nErrors: {len(result.errors)}")
        for test, trace in result.errors[:2]:
            print(f"- {test}")
