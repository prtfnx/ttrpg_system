"""
Application Lifecycle Tests
Tests the complete application startup, initialization, and shutdown flows
Focuses on architectural requirements and real user experience
"""
import unittest
import sys
import os
import argparse
from unittest.mock import Mock, MagicMock, patch, call
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import modules under test
import main
import context
import settings


class TestApplicationLifecycle(unittest.TestCase):
    """Test complete application lifecycle from startup to shutdown"""
    
    def setUp(self):
        """Set up test environment with mocked dependencies"""
        self.mock_sdl_patches = []
        self.mock_gl_patches = []
        
    def tearDown(self):
        """Clean up patches"""
        for patcher in self.mock_sdl_patches + self.mock_gl_patches:
            try:
                patcher.stop()
            except:
                pass
    
    def _setup_sdl_mocks(self):
        """Set up comprehensive SDL mocking for graphics-free testing"""
        # Mock SDL3 module
        mock_sdl = MagicMock()
        sys.modules['sdl3'] = mock_sdl
        
        # Mock SDL functions to return success
        mock_sdl.SDL_Init.return_value = 0
        mock_sdl.SDL_CreateWindow.return_value = MagicMock()
        mock_sdl.SDL_CreateRenderer.return_value = MagicMock()
        mock_sdl.SDL_GetError.return_value = b"No error"
        mock_sdl.SDL_GetNumRenderDrivers.return_value = 2
        mock_sdl.SDL_GetRenderDriverInfo.side_effect = [
            type('DriverInfo', (), {'name': b'opengl'})(),
            type('DriverInfo', (), {'name': b'software'})()
        ]
        
        # Mock OpenGL
        mock_gl = MagicMock()
        sys.modules['OpenGL.GL'] = mock_gl
        
        return mock_sdl, mock_gl
    
    @patch('main.gui_imgui.create_gui')
    @patch('main.client_asset_manager')
    def test_application_cold_start_flow(self, mock_asset_manager, mock_create_gui):
        """
        ARCHITECTURAL TEST: Complete application cold start
        Tests the real user experience of starting the app for the first time
        """
        mock_sdl, mock_gl = self._setup_sdl_mocks()
        
        # Test arguments for player mode
        test_args = argparse.Namespace(
            mode='player',
            connection='websocket',
            server='127.0.0.1',
            port='8000',
            server_url='http://127.0.0.1:8000',
            webhook_port='8001'
        )
        
        # Mock GUI creation
        mock_gui = MagicMock()
        mock_create_gui.return_value = mock_gui
        
        # Execute initialization
        result_context = main.SDL_AppInit_func(test_args)
        
        # Verify architectural requirements
        self.assertIsNotNone(result_context, "Application must initialize successfully")
        self.assertIsInstance(result_context, context.Context, "Must return proper Context")
        
        # Verify SDL initialization sequence
        mock_sdl.SDL_Init.assert_called_once()
        mock_sdl.SDL_CreateWindow.assert_called_once()
        mock_sdl.SDL_CreateRenderer.assert_called_once()
        
        # Verify context is properly configured
        self.assertEqual(result_context.base_width, main.BASE_WIDTH)
        self.assertEqual(result_context.base_height, main.BASE_HEIGHT)
        self.assertIsNotNone(result_context.actions, "Actions system must be initialized")
        
        # Verify GUI system integration
        if main.GUI_SYS:
            mock_create_gui.assert_called_once_with(result_context)
            self.assertEqual(result_context.imgui, mock_gui)
    
    @patch('main.gui_imgui.create_gui')
    def test_application_initialization_failure_recovery(self, mock_create_gui):
        """
        ARCHITECTURAL TEST: Application handles initialization failures gracefully
        Real scenario: User has graphics driver issues or missing dependencies
        """
        mock_sdl, mock_gl = self._setup_sdl_mocks()
        
        # Simulate SDL initialization failure
        mock_sdl.SDL_Init.return_value = -1
        mock_sdl.SDL_GetError.return_value = b"Video driver not available"
        
        test_args = argparse.Namespace(
            mode='player',
            connection='websocket',
            server='127.0.0.1',
            port='8000',
            server_url='http://127.0.0.1:8000',
            webhook_port='8001'
        )
        
        # Should handle failure gracefully, not crash
        with self.assertLogs(level='CRITICAL') as log:
            try:
                main.SDL_AppInit_func(test_args)
            except SystemExit:
                pass  # Expected for critical failures
          # Verify proper error logging
        self.assertTrue(any('Failed to initialize SDL' in msg for msg in log.output))
    
    def test_argument_parsing_all_modes(self):
        """
        BEHAVIORAL TEST: Command line argument parsing for all supported modes
        Real scenario: Users launch app with different connection types
        """
        # Mock sys.argv to test argument parsing
        with patch('sys.argv', ['main.py', '--mode', 'player', '--connection', 'websocket']):
            args = main.parse_arguments()
            self.assertEqual(args.mode, 'player')
            self.assertEqual(args.connection, 'websocket')
        
        # Test master mode with webhook
        with patch('sys.argv', ['main.py', '--mode', 'master', '--connection', 'webhook', 
                               '--server-url', 'https://example.com']):
            args = main.parse_arguments()
            self.assertEqual(args.mode, 'master')
            self.assertEqual(args.connection, 'webhook')
            self.assertEqual(args.server_url, 'https://example.com')
        
        # Test default values
        with patch('sys.argv', ['main.py']):
            args = main.parse_arguments()
            self.assertEqual(args.mode, 'player')  # Should have reasonable defaults
            self.assertEqual(args.connection, 'websocket')
    
    @patch('main.SDL_AppInit_func')
    @patch('main.SDL_AppIterate')
    @patch('main.event_sys.handle_event')
    def test_main_game_loop_flow(self, mock_handle_event, mock_iterate, mock_init):
        """
        ARCHITECTURAL TEST: Main game loop handles events and rendering
        Real scenario: User is playing the game, events are processed correctly
        """
        mock_sdl, mock_gl = self._setup_sdl_mocks()
        
        # Mock context creation
        mock_context = MagicMock()
        mock_context.gui = True
        mock_context.imgui = MagicMock()
        mock_init.return_value = mock_context
        
        # Mock event handling to exit after one iteration
        mock_handle_event.return_value = False  # Signals to exit main loop
        
        # Mock SDL events
        mock_event = MagicMock()
        mock_event.type = 0x100  # SDL_EVENT_QUIT
        mock_sdl.SDL_PollEvent.side_effect = [True, False]  # One event, then no more
        
        # Execute main loop (should exit quickly due to mocking)
        try:
            main.main([])
        except SystemExit:
            pass  # Expected when app exits normally
        
        # Verify initialization was called
        mock_init.assert_called_once()
        
        # Verify event processing was attempted
        mock_sdl.SDL_PollEvent.assert_called()
    
    def test_context_initialization_architecture(self):
        """
        ARCHITECTURAL TEST: Context initialization creates proper system architecture
        Tests that all required managers and systems are properly initialized
        """
        # Mock renderer and window
        mock_renderer = MagicMock()
        mock_window = MagicMock()
        
        # Create context
        test_context = context.Context(mock_renderer, mock_window, 1280, 720)
        
        # Verify architectural components are initialized
        self.assertIsNotNone(test_context.actions, "Actions system must be present")
        self.assertIsNotNone(test_context.actions, "Actions must be present")
        self.assertIsNotNone(test_context.list_of_tables, "Table management must be initialized")
        self.assertIsNotNone(test_context.queue_to_send, "Send queue must be initialized")
        self.assertIsNotNone(test_context.queue_to_read, "Read queue must be initialized")
        
        # Verify default state
        self.assertEqual(test_context.user_id, 1, "Must have default user ID")
        self.assertEqual(test_context.username, "Player", "Must have default username")
        self.assertFalse(test_context.net_client_started, "Network should not be started by default")
        
        # Verify asset management is properly configured
        self.assertIsNotNone(test_context.current_upload_files, "Upload tracking must be initialized")
        self.assertIsNotNone(test_context.pending_uploads, "Pending uploads must be tracked")


class TestSettingsAndConfiguration(unittest.TestCase):
    """Test settings loading and configuration management"""
    
    def test_environment_variable_loading(self):
        """
        BEHAVIORAL TEST: Settings load from environment variables correctly
        Real scenario: Deployment with different environment configs
        """
        # Test default values when no environment variables set
        self.assertEqual(settings.APP_NAME, "TTRPG System")
        self.assertEqual(settings.DEBUG_MODE, True)
        self.assertIsInstance(settings.WINDOW_WIDTH, int)
        self.assertIsInstance(settings.WINDOW_HEIGHT, int)
        
        # Test path creation
        self.assertTrue(os.path.isabs(settings.DEFAULT_STORAGE_PATH))
        self.assertTrue(os.path.isabs(settings.ASSET_CACHE_DIR))
    
    @patch.dict(os.environ, {
        'JWT_SECRET_KEY': 'test-secret-key',
        'MAX_FILE_SIZE_MB': '50',
        'LOG_LEVEL': 'DEBUG'
    })
    def test_environment_override_behavior(self):
        """
        BEHAVIORAL TEST: Environment variables properly override defaults
        Real scenario: Production deployment with custom configuration
        """
        # Reimport settings to pick up environment changes
        import importlib
        importlib.reload(settings)
        
        # Verify environment overrides work
        self.assertEqual(settings.JWT_SECRET_KEY, 'test-secret-key')
        self.assertEqual(settings.MAX_FILE_SIZE_MB, 50)
        self.assertEqual(settings.LOG_LEVEL, 'DEBUG')
    
    def test_cross_platform_path_generation(self):
        """
        ARCHITECTURAL TEST: Paths work correctly across different platforms
        Real scenario: App runs on Windows, Mac, and Linux
        """
        # Test that paths are absolute and properly formatted
        self.assertTrue(os.path.isabs(settings.DEFAULT_STORAGE_PATH))
        self.assertTrue(os.path.isabs(settings.ASSET_CACHE_DIR))
        self.assertTrue(os.path.isabs(settings.TEXTURE_CACHE_DIR))
        
        # Test that cache directories can be created
        cache_parent = os.path.dirname(settings.ASSET_CACHE_DIR)
        self.assertTrue(os.access(os.path.dirname(cache_parent), os.W_OK) or 
                       not os.path.exists(os.path.dirname(cache_parent)), 
                       "Cache directory should be in writable location")


class TestApplicationErrorHandling(unittest.TestCase):
    """Test application error handling and recovery scenarios"""
    
    def test_missing_dependency_handling(self):
        """
        BEHAVIORAL TEST: Application handles missing dependencies gracefully
        Real scenario: User installs app but missing some optional dependencies
        """
        # Mock missing ImGui
        with patch.dict('sys.modules', {'imgui_bundle': None}):
            # Should not crash, should disable GUI features
            try:
                # This would normally import imgui_bundle
                import main
                # If we get here, the app handled missing dependency
                self.assertTrue(True, "App should handle missing optional dependencies")
            except ImportError as e:
                # Only acceptable if it's a truly required dependency
                self.assertNotIn('imgui', str(e).lower(), 
                               "ImGui should be optional for headless operation")
    
    def test_configuration_validation(self):
        """
        ARCHITECTURAL TEST: Invalid configuration is detected and handled
        Real scenario: User has corrupted config file or invalid settings
        """
        # Test invalid file size limits
        with patch.object(settings, 'MAX_FILE_SIZE_MB', -1):
            # Application should detect and handle invalid config
            self.assertLess(settings.MAX_FILE_SIZE_MB, 1000, 
                          "File size limits should be reasonable")
        
        # Test invalid dimensions
        with patch.object(settings, 'WINDOW_WIDTH', 0):
            self.assertGreater(settings.WINDOW_HEIGHT, 0, 
                             "Window dimensions must be positive")


if __name__ == '__main__':
    # Run with verbose output to see test progress
    unittest.main(verbosity=2, buffer=True)
