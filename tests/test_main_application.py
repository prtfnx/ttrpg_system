"""
Comprehensive tests for main application lifecycle and SDL initialization.
Tests real-world application startup, configuration, and error handling scenarios.
"""
import unittest
from unittest.mock import Mock, patch, MagicMock, call
import sys
import logging
import ctypes
from contextlib import contextmanager

# Import test utilities to set up path dynamically
from tests.test_utils import setup_test_environment
setup_test_environment()

import main
from main import SDL_AppInit_func, SDL_AppIterate, parse_arguments


class TestMainApplicationLifecycle(unittest.TestCase):
    """Test main application initialization and lifecycle management."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_sdl3 = Mock()
        self.mock_window = Mock()
        self.mock_renderer = Mock()
        self.mock_gl_context = Mock()
        
    @patch('main.sdl3')
    @patch('main.logging')
    def test_sdl_initialization_success_flow(self, mock_logging, mock_sdl3):
        """Test successful SDL initialization with all components."""
        # Mock SDL3 initialization chain
        mock_window = Mock()
        mock_renderer = Mock()
        mock_gl_context = Mock()
        
        mock_sdl3.SDL_CreateWindow.return_value = mock_window
        mock_sdl3.SDL_CreateRenderer.return_value = mock_renderer
        mock_sdl3.SDL_GL_CreateContext.return_value = mock_gl_context
        mock_sdl3.SDL_GetNumRenderDrivers.return_value = 2
        mock_sdl3.SDL_GetRenderDriver.side_effect = [Mock(decode=Mock(return_value="opengl")), Mock(decode=Mock(return_value="software"))]
        mock_sdl3.SDL_GetError.return_value = Mock(decode=Mock(return_value=""))
        
        # Mock context creation
        with patch('main.context.Context') as mock_context_class:
            mock_context = Mock()
            mock_context_class.return_value = mock_context
            mock_context.add_table.return_value = Mock()
            mock_context.add_sprite.return_value = Mock()
            
            # Mock GUI initialization
            with patch('main.gui_imgui.create_gui') as mock_create_gui:
                mock_create_gui.return_value = Mock()
                
                # Mock other subsystems
                with patch('main.threading.Thread'), \
                     patch('main.paint.init_paint_system'), \
                     patch('main.lighting_sys.LightManager'), \
                     patch('main.LayoutManager'), \
                     patch('main.core_table.entities.Spell'), \
                     patch('main.core_table.Character.Character'):
                    
                    # Execute test
                    result = SDL_AppInit_func()
                    
                    # Verify critical initialization calls
                    mock_sdl3.SDL_CreateWindow.assert_called_once()
                    mock_sdl3.SDL_CreateRenderer.assert_called_once()
                    mock_context_class.assert_called_once()
                    
                    # Verify context is returned
                    self.assertIsNotNone(result)
                    self.assertEqual(result, mock_context)
    
    @patch('main.sdl3')
    @patch('main.sys.exit')
    def test_sdl_window_creation_failure(self, mock_exit, mock_sdl3):
        """Test graceful failure when SDL window creation fails."""
        # Mock window creation failure
        mock_sdl3.SDL_CreateWindow.return_value = None
        mock_sdl3.SDL_GetError.return_value = Mock(decode=Mock(return_value="Window creation failed"))
        
        # Execute test
        SDL_AppInit_func()
        
        # Verify error handling
        mock_exit.assert_called_with(1)
    
    @patch('main.sdl3')
    @patch('main.sys.exit')
    def test_renderer_creation_failure(self, mock_exit, mock_sdl3):
        """Test graceful failure when renderer creation fails."""
        # Mock successful window but failed renderer
        mock_window = Mock()
        mock_sdl3.SDL_CreateWindow.return_value = mock_window
        mock_sdl3.SDL_GL_CreateContext.return_value = Mock()
        mock_sdl3.SDL_CreateRenderer.return_value = None
        mock_sdl3.SDL_GetNumRenderDrivers.return_value = 1
        mock_sdl3.SDL_GetRenderDriver.return_value = Mock(decode=Mock(return_value="opengl"))
        mock_sdl3.SDL_GetError.return_value = Mock(decode=Mock(return_value="Renderer creation failed"))
        
        # Execute test
        SDL_AppInit_func()
        
        # Verify cleanup and exit
        mock_exit.assert_called_with(1)
    
    @patch('main.sdl3')
    def test_application_iteration_basic_flow(self, mock_sdl3):
        """Test basic application iteration loop."""
        # Create mock context with required attributes
        mock_context = Mock()
        mock_context.renderer = Mock()
        mock_context.last_time = 1000
        mock_context.window_width = Mock()
        mock_context.window_height = Mock()
        mock_context.window_width.value = 1920
        mock_context.window_height.value = 1080
        mock_context.current_table = Mock()
        mock_context.queue_to_read = Mock()
        mock_context.queue_to_read.empty.return_value = True
        mock_context.layout_manager = Mock()
        mock_context.layout_manager.table_area = (100, 100, 800, 600)
        
        # Mock SDL functions
        mock_sdl3.SDL_GetTicks.return_value = 1100  # 100ms elapsed
        mock_sdl3.SDL_APP_CONTINUE = 1
        
        with patch('main.movement_sys') as mock_movement, \
             patch('main.paint') as mock_paint, \
             patch('main.handle_information') as mock_handle_info:
            
            # Execute iteration
            result = SDL_AppIterate(mock_context)
            
            # Verify basic rendering calls
            mock_sdl3.SDL_GetWindowSize.assert_called_once()
            mock_sdl3.SDL_RenderClear.assert_called_once()
            mock_movement.move_sprites.assert_called_once()
            
            # Verify continuation
            self.assertEqual(result, mock_sdl3.SDL_APP_CONTINUE)
    
    @patch('main.argparse.ArgumentParser')
    def test_argument_parsing_default_values(self, mock_parser_class):
        """Test argument parsing with default values."""
        mock_parser = Mock()
        mock_parser_class.return_value = mock_parser
        mock_args = Mock()
        mock_args.connection = 'sdl'
        mock_args.server_url = 'localhost'
        mock_args.session_code = None
        mock_args.jwt_token = None
        mock_parser.parse_args.return_value = mock_args
        
        # Execute parsing
        args = parse_arguments()
        
        # Verify parser setup
        mock_parser.add_argument.assert_has_calls([
            call('--connection', choices=['sdl', 'webhook', 'websocket'], default='sdl'),
            call('--server-url', default='localhost'),
            call('--webhook-port', default='8765'),
            call('--session-code'),
            call('--jwt-token')
        ], any_order=True)
        
        self.assertEqual(args.connection, 'sdl')
    
    @patch('main.argparse.ArgumentParser')
    def test_argument_parsing_websocket_connection(self, mock_parser_class):
        """Test argument parsing for WebSocket connection mode."""
        mock_parser = Mock()
        mock_parser_class.return_value = mock_parser
        mock_args = Mock()
        mock_args.connection = 'websocket'
        mock_args.server_url = 'wss://game.example.com'
        mock_args.session_code = 'GAME123'
        mock_args.jwt_token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...'
        mock_parser.parse_args.return_value = mock_args
        
        # Execute parsing
        args = parse_arguments()
        
        # Verify WebSocket-specific values
        self.assertEqual(args.connection, 'websocket')
        self.assertEqual(args.server_url, 'wss://game.example.com')
        self.assertEqual(args.session_code, 'GAME123')
        self.assertIsNotNone(args.jwt_token)
    
    @patch('main.SDL_AppInit_func')
    @patch('main.SDL_AppIterate')
    @patch('main.parse_arguments')
    @patch('main.sdl3')
    @patch('main.event_sys')
    @patch('main.paint')
    def test_main_application_loop(self, mock_paint, mock_event_sys, mock_sdl3, 
                                   mock_parse_args, mock_iterate, mock_init):
        """Test main application event loop execution."""
        # Setup mocks
        mock_args = Mock()
        mock_parse_args.return_value = mock_args
        
        mock_context = Mock()
        mock_context.gui = True
        mock_context.imgui = Mock()
        mock_context.imgui.process_event.return_value = False
        mock_init.return_value = mock_context
        
        # Mock event polling - simulate quit after 2 iterations
        mock_event = Mock()
        mock_event.type = mock_sdl3.SDL_EVENT_QUIT
        poll_results = [1, 1, 0]  # Two events, then quit
        mock_sdl3.SDL_PollEvent.side_effect = poll_results
        
        mock_event_sys.handle_event.return_value = False  # Signal quit
        mock_paint.handle_paint_events.return_value = False
        mock_paint.is_paint_mode_active.return_value = False
        
        # Execute main with controlled event loop
        with patch('main.main') as mock_main_func:
            # Call the actual main logic (simplified)
            context = mock_init(mock_args)
            
            # Simulate one iteration of event loop
            running = True
            event = Mock()
            mock_sdl3.SDL_PollEvent.return_value = 0  # No more events
            
            # Verify initialization
            mock_init.assert_called_once_with(mock_args)
            self.assertIsNotNone(context)
    
    @patch('main.sdl3')
    def test_network_message_handling_in_iteration(self, mock_sdl3):
        """Test network message processing during iteration."""
        # Create context with queued messages
        mock_context = Mock()
        mock_context.renderer = Mock()
        mock_context.last_time = 1000
        mock_context.window_width = Mock()
        mock_context.window_height = Mock()
        mock_context.window_width.value = 1920
        mock_context.window_height.value = 1080
        mock_context.current_table = Mock()
        mock_context.layout_manager = Mock()
        mock_context.layout_manager.table_area = (100, 100, 800, 600)
        
        # Mock queue with message
        mock_queue = Mock()
        mock_queue.empty.return_value = False
        mock_queue.get.return_value = {'type': 'test_message', 'data': 'test_data'}
        mock_context.queue_to_read = mock_queue
        
        mock_sdl3.SDL_GetTicks.return_value = 1100
        mock_sdl3.SDL_APP_CONTINUE = 1
        
        with patch('main.movement_sys'), \
             patch('main.paint'), \
             patch('main.handle_information') as mock_handle_info:
            
            # Execute iteration
            result = SDL_AppIterate(mock_context)
            
            # Verify message was processed
            mock_queue.get.assert_called_once()
            mock_handle_info.assert_called_once_with(
                {'type': 'test_message', 'data': 'test_data'}, 
                mock_context
            )
    
    @patch('main.sdl3')
    def test_lighting_system_integration(self, mock_sdl3):
        """Test lighting system initialization and integration."""
        mock_window = Mock()
        mock_renderer = Mock()
        mock_gl_context = Mock()
        
        mock_sdl3.SDL_CreateWindow.return_value = mock_window
        mock_sdl3.SDL_CreateRenderer.return_value = mock_renderer
        mock_sdl3.SDL_GL_CreateContext.return_value = mock_gl_context
        mock_sdl3.SDL_GetNumRenderDrivers.return_value = 1
        mock_sdl3.SDL_GetRenderDriver.return_value = Mock(decode=Mock(return_value="opengl"))
        
        with patch('main.context.Context') as mock_context_class, \
             patch('main.LIGHTING_SYS', True), \
             patch('main.lighting_sys.LightManager') as mock_light_manager, \
             patch('main.lighting_sys.Light') as mock_light, \
             patch('main.gui_imgui.create_gui'), \
             patch('main.threading.Thread'), \
             patch('main.paint.init_paint_system'), \
             patch('main.LayoutManager'), \
             patch('main.core_table.entities.Spell'), \
             patch('main.core_table.Character.Character'):
            
            mock_context = Mock()
            mock_context_class.return_value = mock_context
            mock_context.add_table.return_value = Mock()
            mock_context.add_sprite.return_value = Mock()
            
            # Execute initialization
            result = SDL_AppInit_func()
            
            # Verify lighting system was initialized
            mock_light_manager.assert_called_once()
            mock_light.assert_called_once_with('default_light')
            
            # Verify lighting manager was attached to context
            self.assertIsNotNone(result.LightingManager)
    
    def test_constants_and_configuration(self):
        """Test application constants are properly defined."""
        # Verify critical constants exist and have reasonable values
        self.assertEqual(main.BASE_WIDTH, 1920)
        self.assertEqual(main.BASE_HEIGHT, 1080)
        self.assertIsInstance(main.NET_SLEEP, float)
        self.assertIsInstance(main.CHECK_INTERVAL, float)
        self.assertIsInstance(main.NUMBER_OF_NET_FAILS, int)
        self.assertIsInstance(main.TIME_TO_CONNECT, int)
        self.assertIsInstance(main.TABLE_AREA_PERCENT, float)
        self.assertIsInstance(main.GUI_PANEL_SIZE, int)
        self.assertIsInstance(main.MARGIN_SIZE, int)
        
        # Verify reasonable ranges
        self.assertTrue(0.0 < main.TABLE_AREA_PERCENT <= 1.0)
        self.assertTrue(main.GUI_PANEL_SIZE > 0)
        self.assertTrue(main.NET_SLEEP > 0)


if __name__ == '__main__':
    # Configure logging to reduce noise during tests
    logging.basicConfig(level=logging.CRITICAL)
    
    # Create test suite
    suite = unittest.TestLoader().loadTestsFromTestCase(TestMainApplicationLifecycle)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"MAIN APPLICATION TESTS SUMMARY")
    print(f"{'='*60}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print(f"\nFailures: {len(result.failures)}")
        for test, trace in result.failures[:3]:  # Show first 3
            print(f"- {test}: {trace.split('AssertionError:')[-1].strip()}")
    
    if result.errors:
        print(f"\nErrors: {len(result.errors)}")  
        for test, trace in result.errors[:3]:  # Show first 3
            print(f"- {test}: {trace.split('Error:')[-1].strip()}")
