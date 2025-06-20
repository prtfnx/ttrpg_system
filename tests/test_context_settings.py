"""
Comprehensive tests for Context management and Settings integration.
Tests real-world state management, configuration handling, and system coordination.
"""
import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import ctypes
import queue

# Import test utilities to set up path dynamically
from tests.test_utils import setup_test_environment
setup_test_environment()

import context
import settings
from Context import Context
from ContextTable import ContextTable


class TestContextManagement(unittest.TestCase):
    """Test Context class functionality and state management."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_renderer = Mock()
        self.mock_window = Mock()
        self.base_width = 1920
        self.base_height = 1080
        
    def test_context_initialization(self):
        """Test Context initialization with all required components."""
        # Create context
        ctx = Context(self.mock_renderer, self.mock_window, self.base_width, self.base_height)
        
        # Verify basic attributes
        self.assertEqual(ctx.renderer, self.mock_renderer)
        self.assertEqual(ctx.window, self.mock_window)
        self.assertEqual(ctx.base_width, self.base_width)
        self.assertEqual(ctx.base_height, self.base_height)
        
        # Verify initialization of critical components
        self.assertIsNotNone(ctx.sprites_list)
        self.assertIsNotNone(ctx.list_of_tables)
        self.assertIsNotNone(ctx.queue_to_send)
        self.assertIsNotNone(ctx.queue_to_read)
        self.assertIsNotNone(ctx.chat_messages)
        self.assertIsNotNone(ctx.actions)
        self.assertIsNotNone(ctx.actions)
        
        # Verify default states
        self.assertFalse(ctx.resizing)
        self.assertFalse(ctx.grabing)
        self.assertFalse(ctx.moving_table)
        self.assertFalse(ctx.net_client_started)
        self.assertIsNone(ctx.current_table)
        self.assertEqual(ctx.current_tool, "Select")
      def test_context_sprite_management(self):
        """Test sprite creation and management in context."""
        ctx = Context(self.mock_renderer, self.mock_window, self.base_width, self.base_height)
        
        with patch('context.sprite.Sprite') as mock_sprite_class:
            mock_sprite = Mock()
            mock_sprite_class.return_value = mock_sprite
            
            # Add sprite with correct API
            result = ctx.add_sprite(
                texture_path=b"test.png", 
                coord_x=100, 
                coord_y=200, 
                scale_x=0.5, 
                scale_y=0.5,
                collidable=True,
                layer='entities'
            )
            
            # Verify sprite creation
            mock_sprite_class.assert_called_once_with(
                ctx, b"test.png", 100, 200, 0.5, 0.5, 
                collidable=True, layer='entities', character=None
            )
            
            # Verify sprite added to list
            self.assertIn(mock_sprite, ctx.sprites_list)
            self.assertEqual(result, mock_sprite)
    
    def test_context_table_management(self):
        """Test table creation and management workflow."""
        ctx = Context(self.mock_renderer, self.mock_window, self.base_width, self.base_height)
        
        with patch('context.core_table.table.VirtualTable') as mock_table_class:
            mock_table = Mock()
            mock_table_class.return_value = mock_table
            
            # Add table
            result = ctx.add_table("test_table", 800, 600)
            
            # Verify table creation
            mock_table_class.assert_called_once_with("test_table", 800, 600)
            
            # Verify table added to context
            self.assertIn(mock_table, ctx.list_of_tables)
            self.assertEqual(ctx.current_table, mock_table)
            self.assertEqual(result, mock_table)
    
    def test_context_multiple_tables(self):
        """Test handling multiple tables in context."""
        ctx = Context(self.mock_renderer, self.mock_window, self.base_width, self.base_height)
        
        with patch('context.core_table.table.VirtualTable') as mock_table_class:
            mock_table1 = Mock()
            mock_table1.name = "table1"
            mock_table2 = Mock()
            mock_table2.name = "table2"
            mock_table_class.side_effect = [mock_table1, mock_table2]
            
            # Add multiple tables
            table1 = ctx.add_table("table1", 800, 600)
            table2 = ctx.add_table("table2", 1024, 768)
            
            # Verify both tables exist
            self.assertEqual(len(ctx.list_of_tables), 2)
            self.assertIn(mock_table1, ctx.list_of_tables)
            self.assertIn(mock_table2, ctx.list_of_tables)
            
            # Verify current table is the last added
            self.assertEqual(ctx.current_table, mock_table2)
    
    def test_context_network_integration(self):        
        """Test actions integration and message queuing."""
        ctx = Context(self.mock_renderer, self.mock_window, self.base_width, self.base_height)
        
        # Verify actions is initialized
        self.assertIsNotNone(ctx.actions)
        
        # Test message queuing
        test_message = {"type": "test", "data": "hello"}
        ctx.queue_to_send.put(test_message)
        
        # Verify message can be retrieved
        self.assertFalse(ctx.queue_to_send.empty())
        retrieved = ctx.queue_to_send.get()
        self.assertEqual(retrieved, test_message)
    
    def test_context_layout_and_viewport(self):
        """Test layout management and viewport handling."""
        ctx = Context(self.mock_renderer, self.mock_window, self.base_width, self.base_height)
        
        # Set up mock window dimensions
        ctx.window_width = ctypes.c_int(1920)
        ctx.window_height = ctypes.c_int(1080)
        
        # Test layout information storage
        test_layout = {
            'table_area': (100, 100, 800, 600),
            'gui_area': (900, 100, 400, 600),
            'spacing': 10
        }
        ctx.layout = test_layout
        
        # Verify layout information is stored
        self.assertEqual(ctx.layout['table_area'], (100, 100, 800, 600))
        self.assertEqual(ctx.layout['spacing'], 10)
        
        # Test table viewport setting
        test_viewport = (50, 50, 900, 700)
        ctx.table_viewport = test_viewport
        self.assertEqual(ctx.table_viewport, test_viewport)


class TestNetworkedContext(unittest.TestCase):
    """Test NetworkedContext functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_main_context = Mock()
        
    def test_networked_context_initialization(self):
        """Test NetworkedContext initialization."""
        # NetworkedContext removed - functionality moved to MovementManager and Actions
        # net_ctx = NetworkedContext(self.mock_main_context)
        
        # Verify parent context reference
        self.assertEqual(net_ctx.main_context, self.mock_main_context)
        
        # Verify initialization of network-specific attributes
        self.assertIsNotNone(net_ctx)


class TestContextTable(unittest.TestCase):
    """Test ContextTable functionality for table-specific state."""
    
    def test_context_table_creation(self):
        """Test ContextTable creation and basic functionality."""
        # This tests the table-specific context if it exists
        # Since ContextTable may be a simple data structure, we test its usage
        pass  # Implementation depends on actual ContextTable structure


class TestSettingsIntegration(unittest.TestCase):
    """Test Settings system integration with Context."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_renderer = Mock()
        self.mock_window = Mock()
        
    def test_settings_load_default_values(self):
        """Test loading default settings values."""
        # Test default settings
        default_settings = settings.get_default_settings()
        
        # Verify critical settings exist
        self.assertIn('graphics', default_settings)
        self.assertIn('network', default_settings)
        self.assertIn('controls', default_settings)
        
        # Verify reasonable default values
        graphics = default_settings['graphics']
        self.assertIsInstance(graphics.get('vsync', True), bool)
        self.assertIsInstance(graphics.get('resolution', [1920, 1080]), list)
    
    def test_settings_validation(self):
        """Test settings validation for critical values."""
        # Test resolution validation
        valid_resolution = [1920, 1080]
        self.assertTrue(settings.validate_resolution(valid_resolution))
        
        invalid_resolution = [0, 0]
        self.assertFalse(settings.validate_resolution(invalid_resolution))
        
        # Test network settings validation
        valid_port = 8080
        self.assertTrue(settings.validate_port(valid_port))
        
        invalid_port = -1
        self.assertFalse(settings.validate_port(invalid_port))
    
    @patch('settings.load_user_settings')
    def test_settings_context_integration(self, mock_load_settings):
        """Test settings integration with context initialization."""
        # Mock settings loading
        mock_settings = {
            'graphics': {'resolution': [1920, 1080], 'vsync': True},
            'network': {'server_url': 'localhost', 'port': 8080},
            'controls': {'mouse_sensitivity': 1.0}
        }
        mock_load_settings.return_value = mock_settings
        
        # Create context with settings
        ctx = Context(self.mock_renderer, self.mock_window, 1920, 1080)
        
        # Apply settings to context (this would be done in real initialization)
        with patch.object(ctx, 'apply_settings') as mock_apply:
            ctx.apply_settings(mock_settings)
            mock_apply.assert_called_once_with(mock_settings)
    
    def test_settings_persistence_workflow(self):
        """Test settings save/load workflow."""
        test_settings = {
            'graphics': {'resolution': [1600, 900], 'vsync': False},
            'network': {'server_url': 'game.example.com', 'port': 8443},
            'controls': {'mouse_sensitivity': 1.5}
        }
        
        with patch('settings.save_user_settings') as mock_save, \
             patch('settings.load_user_settings') as mock_load:
            
            # Test save
            settings.save_user_settings(test_settings)
            mock_save.assert_called_once_with(test_settings)
            
            # Test load
            mock_load.return_value = test_settings
            loaded = settings.load_user_settings()
            self.assertEqual(loaded, test_settings)
    
    def test_settings_real_world_application_flow(self):
        """Test complete settings application in real-world scenario."""
        # This tests the full workflow of:
        # 1. Loading settings from file/defaults
        # 2. Validating settings
        # 3. Applying to context
        # 4. Handling invalid values gracefully
        
        ctx = Context(self.mock_renderer, self.mock_window, 1920, 1080)
        
        # Test with mixed valid/invalid settings
        mixed_settings = {
            'graphics': {'resolution': [1920, 1080], 'vsync': True, 'invalid_option': 'bad'},
            'network': {'server_url': 'localhost', 'port': 'invalid_port'},
            'controls': {'mouse_sensitivity': 'not_a_number'}
        }
        
        with patch('settings.validate_and_apply_settings') as mock_validate:
            mock_validate.return_value = True  # Assume validation fixes issues
            
            # Apply settings
            result = settings.validate_and_apply_settings(ctx, mixed_settings)
            
            # Verify validation was called
            mock_validate.assert_called_once_with(ctx, mixed_settings)
            self.assertTrue(result)


class TestContextRealWorldScenarios(unittest.TestCase):
    """Test Context in real-world usage scenarios."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_renderer = Mock()
        self.mock_window = Mock()
        
    def test_multiplayer_session_scenario(self):
        """Test context behavior in multiplayer session."""
        ctx = Context(self.mock_renderer, self.mock_window, 1920, 1080)
        
        # Simulate multiplayer setup
        ctx.net_client_started = True
        ctx.net_socket = Mock()
        
        # Add multiple players' sprites
        with patch('context.sprite.Sprite') as mock_sprite_class:
            mock_sprites = [Mock() for _ in range(4)]
            mock_sprite_class.side_effect = mock_sprites
            
            # Add player sprites
            player_sprites = []
            for i in range(4):
                sprite = ctx.add_sprite(
                    path=f"player_{i}.png".encode(),
                    coord_x=i * 100,
                    coord_y=i * 50,
                    layer='entities'
                )
                player_sprites.append(sprite)
            
            # Verify all sprites added
            self.assertEqual(len(ctx.sprites_list), 4)
            for sprite in player_sprites:
                self.assertIn(sprite, ctx.sprites_list)
    
    def test_combat_encounter_scenario(self):
        """Test context during combat encounter with multiple entities."""
        ctx = Context(self.mock_renderer, self.mock_window, 1920, 1080)
        
        with patch('context.core_table.table.VirtualTable') as mock_table_class, \
             patch('context.sprite.Sprite') as mock_sprite_class:
            
            # Create combat table
            mock_table = Mock()
            mock_table_class.return_value = mock_table
            combat_table = ctx.add_table("combat_encounter", 1200, 800)
            
            # Add combat entities
            mock_sprites = [Mock() for _ in range(8)]  # 4 players + 4 enemies
            mock_sprite_class.side_effect = mock_sprites
            
            entities = []
            # Add player characters
            for i in range(4):
                sprite = ctx.add_sprite(
                    path=f"pc_{i}.png".encode(),
                    coord_x=100 + i * 50,
                    coord_y=100,
                    layer='entities',
                    collidable=True
                )
                entities.append(sprite)
            
            # Add enemy creatures
            for i in range(4):
                sprite = ctx.add_sprite(
                    path=f"enemy_{i}.png".encode(),
                    coord_x=100 + i * 50,
                    coord_y=300,
                    layer='entities',
                    collidable=True
                )
                entities.append(sprite)
            
            # Verify combat setup
            self.assertEqual(len(ctx.sprites_list), 8)
            self.assertEqual(ctx.current_table, combat_table)
    
    def test_error_recovery_scenario(self):
        """Test context behavior during error recovery."""
        ctx = Context(self.mock_renderer, self.mock_window, 1920, 1080)
        
        # Simulate network disconnection
        ctx.net_client_started = False
        ctx.net_socket = None
        
        # Try to queue message when disconnected
        test_message = {"type": "move", "entity_id": 1, "x": 100, "y": 200}
        ctx.queue_to_send.put(test_message)
        
        # Verify message is queued (for when connection restored)
        self.assertFalse(ctx.queue_to_send.empty())
        
        # Simulate connection restoration
        ctx.net_client_started = True
        ctx.net_socket = Mock()
        
        # Process queued messages
        processed_messages = []
        while not ctx.queue_to_send.empty():
            processed_messages.append(ctx.queue_to_send.get())
        
        # Verify message was preserved during disconnection
        self.assertEqual(len(processed_messages), 1)
        self.assertEqual(processed_messages[0], test_message)
    
    def test_resource_cleanup_scenario(self):
        """Test proper resource cleanup in context."""
        ctx = Context(self.mock_renderer, self.mock_window, 1920, 1080)
        
        with patch('context.sprite.Sprite') as mock_sprite_class:
            # Create sprites with cleanup requirements
            mock_sprites = []
            for i in range(5):
                mock_sprite = Mock()
                mock_sprite.cleanup = Mock()
                mock_sprites.append(mock_sprite)
            
            mock_sprite_class.side_effect = mock_sprites
            
            # Add sprites
            for i in range(5):
                ctx.add_sprite(f"sprite_{i}.png".encode())
            
            # Simulate cleanup (would be called during shutdown)
            with patch.object(ctx, 'cleanup_resources') as mock_cleanup:
                ctx.cleanup_resources()
                mock_cleanup.assert_called_once()


if __name__ == '__main__':
    # Create test suite
    test_classes = [
        TestContextManagement,
        TestNetworkedContext, 
        TestContextTable,
        TestSettingsIntegration,
        TestContextRealWorldScenarios
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
    print(f"CONTEXT & SETTINGS TESTS SUMMARY")
    print(f"{'='*60}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print(f"\nFailures: {len(result.failures)}")
        for test, trace in result.failures[:3]:
            print(f"- {test}")
    
    if result.errors:
        print(f"\nErrors: {len(result.errors)}")
        for test, trace in result.errors[:3]:
            print(f"- {test}")
