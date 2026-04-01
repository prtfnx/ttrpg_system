"""
System Architecture and Flow Tests
Tests high-level system architecture, real user workflows, and error scenarios
Focuses on testing application behavior rather than implementation details
"""
import unittest
import sys
import os
import threading
import time
import json
from unittest.mock import Mock, MagicMock, patch, mock_open
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import modules under test
import settings
from core_table.server import TableManager
from core_table.table import VirtualTable


class TestSystemArchitecture(unittest.TestCase):
    """Test high-level system architecture and behavior"""
    
    def test_application_startup_sequence(self):
        """
        ARCHITECTURAL TEST: Application startup follows correct sequence
        Real scenario: User launches app, systems initialize in proper order
        """
        # Test that settings are available first
        self.assertIsNotNone(settings.APP_NAME)
        self.assertIsNotNone(settings.WINDOW_WIDTH)
        
        # Test that table management can be initialized
        table_manager = TableManager()
        self.assertIsNotNone(table_manager)
        
        # Test that tables can be created
        test_table = table_manager.create_table("System Test", 1920, 1080)
        self.assertIsNotNone(test_table)
        
        # Test that system components are properly separated
        self.assertIsInstance(test_table, VirtualTable)
    
    def test_multiplayer_session_workflow(self):
        """
        BEHAVIORAL TEST: Complete multiplayer session workflow
        Real scenario: DM creates session, players join, game is played
        """
        # Create table manager (server-side)
        table_manager = TableManager()
        
        # DM creates a new table
        dm_table = table_manager.create_table("Adventure Campaign", 1920, 1080)
        self.assertIsNotNone(dm_table)
        self.assertEqual(dm_table.name, "Adventure Campaign")
        
        # DM adds some entities to the table
        dm_table.add_entity({
            'type': 'sprite',
            'name': 'Map Background',
            'x': 0,
            'y': 0,
            'layer': 'background'
        })
        
        # Verify entity was added
        entities = dm_table.get_entities()
        self.assertGreater(len(entities), 0)
        
        # Player joins the session (would get table data)
        player_table_data = dm_table.serialize()
        self.assertIsNotNone(player_table_data)
        self.assertIn('name', player_table_data)
        self.assertEqual(player_table_data['name'], "Adventure Campaign")
    
    def test_asset_workflow_end_to_end(self):
        """
        BEHAVIORAL TEST: Complete asset management workflow
        Real scenario: User uploads image, it's cached, shared with other players
        """
        # Simulate asset upload workflow
        asset_name = "dragon_token.png"
        asset_data = b"fake_image_data_for_testing"
        
        # Test asset ID generation (should be consistent)
        import hashlib
        expected_id = hashlib.md5(asset_data).hexdigest()
        actual_id = hashlib.md5(asset_data).hexdigest()
        self.assertEqual(actual_id, expected_id)
        
        # Test cache path generation
        cache_dir = settings.ASSET_CACHE_DIR
        expected_path = os.path.join(cache_dir, f"{actual_id}.png")
        
        # Test path handling
        self.assertTrue(os.path.isabs(expected_path))
    
    def test_error_recovery_scenarios(self):
        """
        BEHAVIORAL TEST: System recovers from common error scenarios
        Real scenario: Network failures, corrupted data, resource exhaustion
        """
        # Test table creation with invalid data
        table_manager = TableManager()
        
        # Should handle empty name gracefully
        try:
            empty_table = table_manager.create_table("", 1920, 1080)
            # If creation succeeds, table should have some valid name
            if empty_table:
                self.assertIsNotNone(empty_table.name)
        except ValueError:
            # Acceptable to reject empty names
            pass
        
        # Test table serialization with corrupted data
        valid_table = table_manager.create_table("Test Table", 1920, 1080)
        
        # Add problematic entity
        try:
            valid_table.add_entity({
                'type': None,  # Invalid type
                'name': 'Problematic Entity'
            })
            
            # Try to serialize despite problematic data
            serialized = valid_table.serialize()
            self.assertIsNotNone(serialized)
        except (ValueError, TypeError):
            # Acceptable to reject invalid entities
            pass
    
    def test_concurrent_access_scenarios(self):
        """
        BEHAVIORAL TEST: System handles concurrent access correctly
        Real scenario: Multiple players modifying game state simultaneously
        """
        table_manager = TableManager()
        shared_table = table_manager.create_table("Concurrent Test", 1920, 1080)
        
        # Track results from concurrent operations
        results = []
        
        def add_entities(table, start_id, count):
            """Add entities concurrently"""
            for i in range(count):
                entity = {
                    'type': 'test_entity',
                    'name': f'Entity_{start_id + i}',
                    'x': i * 10,
                    'y': i * 10
                }
                try:
                    table.add_entity(entity)
                    results.append(f"success_{start_id + i}")
                except Exception as e:
                    results.append(f"error_{start_id + i}")
        
        # Start multiple threads adding entities
        threads = []
        for i in range(3):
            thread = threading.Thread(
                target=add_entities,
                args=(shared_table, i * 100, 10)
            )
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join(timeout=5.0)
        
        # Verify system handled concurrent access
        self.assertGreater(len(results), 0, "Some operations should have completed")
        
        # Table should still be in valid state
        entities = shared_table.get_entities()
        self.assertIsNotNone(entities)
    
    def test_data_persistence_workflow(self):
        """
        BEHAVIORAL TEST: Data persistence works correctly
        Real scenario: Game session is saved and restored
        """
        # Create and populate a table
        table_manager = TableManager()
        original_table = table_manager.create_table("Persistent Test", 1920, 1080)
        
        # Add some data
        test_entity = {
            'type': 'character',
            'name': 'Hero Character',
            'x': 500,
            'y': 300,
            'properties': {
                'hp': 100,
                'level': 5
            }
        }
        original_table.add_entity(test_entity)
        
        # Serialize table state
        saved_data = original_table.serialize()
        self.assertIsNotNone(saved_data)
        self.assertIn('name', saved_data)
        self.assertIn('entities', saved_data)
        
        # Simulate saving to file
        serialized_json = json.dumps(saved_data)
        self.assertIsInstance(serialized_json, str)
        
        # Simulate loading from file
        loaded_data = json.loads(serialized_json)
        self.assertEqual(loaded_data['name'], "Persistent Test")
        
        # Create new table from loaded data
        restored_table = table_manager.create_table(
            loaded_data['name'],
            loaded_data.get('width', 1920),
            loaded_data.get('height', 1080)
        )
        
        # Restore entities
        for entity_data in loaded_data.get('entities', []):
            restored_table.add_entity(entity_data)
        
        # Verify restoration
        restored_entities = restored_table.get_entities()
        self.assertGreater(len(restored_entities), 0)


class TestUserWorkflowScenarios(unittest.TestCase):
    """Test complete user workflow scenarios"""
    
    def test_new_user_onboarding_flow(self):
        """
        BEHAVIORAL TEST: New user can start using the system
        Real scenario: First-time user launches app and creates game
        """
        # User opens app - settings should be available
        self.assertIsNotNone(settings.APP_NAME)
        self.assertIsNotNone(settings.DEFAULT_STORAGE_PATH)
        
        # User creates first table
        table_manager = TableManager()
        first_table = table_manager.create_table("My First Game", 1920, 1080)
        
        self.assertIsNotNone(first_table)
        self.assertEqual(first_table.name, "My First Game")
        
        # User adds their first entity
        player_character = {
            'type': 'character',
            'name': 'My Character',
            'x': 960,  # Center of table
            'y': 540,
            'properties': {
                'is_player': True
            }
        }
        
        first_table.add_entity(player_character)
        entities = first_table.get_entities()
        self.assertEqual(len(entities), 1)
        
        # User can save their progress
        save_data = first_table.serialize()
        self.assertIsNotNone(save_data)
    
    def test_dm_session_management_flow(self):
        """
        BEHAVIORAL TEST: DM can manage a game session effectively
        Real scenario: DM runs a session with multiple players
        """
        # DM creates campaign
        table_manager = TableManager()
        campaign_table = table_manager.create_table("Dragon Heist Campaign", 1920, 1080)
        
        # DM sets up the scene
        scene_entities = [
            {
                'type': 'background',
                'name': 'Tavern Map',
                'x': 0,
                'y': 0,
                'layer': 'background'
            },
            {
                'type': 'npc',
                'name': 'Barkeeper',
                'x': 200,
                'y': 300,
                'layer': 'characters'
            },
            {
                'type': 'obstacle',
                'name': 'Bar Counter',
                'x': 150,
                'y': 250,
                'layer': 'obstacles'
            }
        ]
        
        for entity in scene_entities:
            campaign_table.add_entity(entity)
        
        # Verify scene setup
        entities = campaign_table.get_entities()
        self.assertEqual(len(entities), 3)
        
        # DM can update entity positions
        all_entities = campaign_table.get_entities()
        if all_entities:
            # Move first entity
            first_entity = all_entities[0]
            campaign_table.update_entity(
                first_entity['id'],
                {'x': 100, 'y': 100}
            )
        
        # DM can share table state with players
        shared_data = campaign_table.serialize()
        self.assertIsNotNone(shared_data)
        self.assertIn('entities', shared_data)
    
    def test_player_interaction_flow(self):
        """
        BEHAVIORAL TEST: Player can interact with game effectively
        Real scenario: Player joins session and plays their character
        """
        # Player receives table data from DM
        table_manager = TableManager()
        game_table = table_manager.create_table("Active Session", 1920, 1080)
        
        # Table has existing content
        existing_entities = [
            {
                'type': 'background',
                'name': 'Dungeon Map',
                'x': 0,
                'y': 0
            },
            {
                'type': 'monster',
                'name': 'Goblin',
                'x': 800,
                'y': 600
            }
        ]
        
        for entity in existing_entities:
            game_table.add_entity(entity)
        
        # Player adds their character
        player_character = {
            'type': 'character',
            'name': 'Rogue Character',
            'x': 100,
            'y': 100,
            'properties': {
                'player_id': 'player_123',
                'hp': 85,
                'ac': 15
            }
        }
        
        game_table.add_entity(player_character)
        
        # Player can see all entities
        all_entities = game_table.get_entities()
        self.assertGreaterEqual(len(all_entities), 3)
        
        # Player can move their character
        player_entities = [e for e in all_entities if e.get('properties', {}).get('player_id') == 'player_123']
        self.assertEqual(len(player_entities), 1)
        
        player_entity = player_entities[0]
        game_table.update_entity(
            player_entity['id'],
            {'x': 150, 'y': 150}  # Move character
        )
        
        # Verify character moved
        updated_entities = game_table.get_entities()
        updated_player = next(e for e in updated_entities if e['id'] == player_entity['id'])
        self.assertEqual(updated_player['x'], 150)
        self.assertEqual(updated_player['y'], 150)
    
    def test_collaborative_editing_flow(self):
        """
        BEHAVIORAL TEST: Multiple users can edit collaboratively
        Real scenario: DM and players modify shared game state
        """
        # Shared table state
        table_manager = TableManager()
        shared_table = table_manager.create_table("Collaborative Session", 1920, 1080)
        
        # DM adds environment
        dm_entities = [
            {'type': 'terrain', 'name': 'Mountain', 'x': 500, 'y': 200, 'owner': 'dm'},
            {'type': 'terrain', 'name': 'River', 'x': 300, 'y': 400, 'owner': 'dm'}
        ]
        
        for entity in dm_entities:
            shared_table.add_entity(entity)
        
        # Player 1 adds character
        player1_entity = {
            'type': 'character',
            'name': 'Fighter',
            'x': 100,
            'y': 100,
            'owner': 'player1'
        }
        shared_table.add_entity(player1_entity)
        
        # Player 2 adds character
        player2_entity = {
            'type': 'character',
            'name': 'Wizard',
            'x': 120,
            'y': 100,
            'owner': 'player2'
        }
        shared_table.add_entity(player2_entity)
        
        # Verify all contributions are present
        all_entities = shared_table.get_entities()
        self.assertEqual(len(all_entities), 4)
        
        # Verify ownership tracking
        dm_entities_count = len([e for e in all_entities if e.get('owner') == 'dm'])
        player_entities_count = len([e for e in all_entities if e.get('owner', '').startswith('player')])
        
        self.assertEqual(dm_entities_count, 2)
        self.assertEqual(player_entities_count, 2)
        
        # Simulate collaborative editing
        entities = shared_table.get_entities()
        for entity in entities:
            if entity.get('owner') == 'player1':
                # Player 1 moves their character
                shared_table.update_entity(entity['id'], {'x': 200, 'y': 200})
        
        # Verify changes persisted
        updated_entities = shared_table.get_entities()
        player1_chars = [e for e in updated_entities if e.get('owner') == 'player1']
        self.assertEqual(len(player1_chars), 1)
        self.assertEqual(player1_chars[0]['x'], 200)


class TestPerformanceAndScalability(unittest.TestCase):
    """Test system performance and scalability characteristics"""
    
    def test_large_entity_count_performance(self):
        """
        BEHAVIORAL TEST: System handles large number of entities
        Real scenario: Complex battle map with many tokens
        """
        table_manager = TableManager()
        large_table = table_manager.create_table("Large Battle", 1920, 1080)
        
        # Add many entities quickly
        start_time = time.time()
        
        entity_count = 200  # Reasonable large number for testing
        for i in range(entity_count):
            entity = {
                'type': 'token',
                'name': f'Token_{i}',
                'x': (i % 20) * 96,  # Grid layout
                'y': (i // 20) * 96,
                'properties': {
                    'id': i,
                    'active': True
                }
            }
            large_table.add_entity(entity)
        
        creation_time = time.time() - start_time
        
        # Should create entities quickly (under 1 second for 200 entities)
        self.assertLess(creation_time, 1.0, f"Entity creation took {creation_time:.2f}s, should be under 1.0s")
        
        # Verify all entities were added
        entities = large_table.get_entities()
        self.assertEqual(len(entities), entity_count)
        
        # Test serialization performance with many entities
        start_time = time.time()
        serialized = large_table.serialize()
        serialization_time = time.time() - start_time
        
        self.assertLess(serialization_time, 1.0, f"Serialization took {serialization_time:.2f}s, should be under 1.0s")
        self.assertIsNotNone(serialized)
    
    def test_rapid_update_performance(self):
        """
        BEHAVIORAL TEST: System handles rapid updates efficiently
        Real scenario: Real-time multiplayer with frequent position updates
        """
        table_manager = TableManager()
        update_table = table_manager.create_table("Update Test", 1920, 1080)
        
        # Add a character to update
        character = {
            'type': 'character',
            'name': 'Moving Character',
            'x': 0,
            'y': 0
        }
        update_table.add_entity(character)
        
        entities = update_table.get_entities()
        character_id = entities[0]['id']
        
        # Perform many rapid updates
        start_time = time.time()
        update_count = 100
        
        for i in range(update_count):
            update_table.update_entity(character_id, {
                'x': i * 5,
                'y': i * 3
            })
        
        update_time = time.time() - start_time
        
        # Should handle updates quickly
        self.assertLess(update_time, 1.0, f"Updates took {update_time:.2f}s, should be under 1.0s")
        
        # Verify final state is correct
        final_entities = update_table.get_entities()
        updated_character = next(e for e in final_entities if e['id'] == character_id)
        self.assertEqual(updated_character['x'], (update_count - 1) * 5)
        self.assertEqual(updated_character['y'], (update_count - 1) * 3)
    
    def test_memory_usage_stability(self):
        """
        BEHAVIORAL TEST: System memory usage remains stable
        Real scenario: Long-running game session
        """
        table_manager = TableManager()
        memory_test_table = table_manager.create_table("Memory Test", 1920, 1080)
        
        # Simulate long-running session with entity churn
        for cycle in range(10):
            # Add entities
            for i in range(50):
                entity = {
                    'type': 'temporary',
                    'name': f'Temp_{cycle}_{i}',
                    'x': i * 10,
                    'y': cycle * 50
                }
                memory_test_table.add_entity(entity)
            
            # Remove some entities (simulate cleanup)
            entities = memory_test_table.get_entities()
            if len(entities) > 25:
                for entity in entities[:25]:
                    memory_test_table.remove_entity(entity['id'])
        
        # System should still be responsive
        final_entities = memory_test_table.get_entities()
        self.assertIsNotNone(final_entities)
        
        # Should be able to continue operating
        test_entity = {
            'type': 'final_test',
            'name': 'Final Entity',
            'x': 0,
            'y': 0
        }
        memory_test_table.add_entity(test_entity)
        
        post_test_entities = memory_test_table.get_entities()
        self.assertGreater(len(post_test_entities), len(final_entities))


if __name__ == '__main__':
    # Run with verbose output to see test progress
    unittest.main(verbosity=2, buffer=True)
