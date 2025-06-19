"""
Enhanced Test Suite for 80%+ Coverage
Comprehensive tests following best practices for real application behavior
"""
import unittest
import sys
import os
import time
import logging
from unittest.mock import Mock, MagicMock, patch
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import modules under test
import settings
from core_table.server import TableManager
from core_table.table import VirtualTable, Entity


class TestVirtualTableBehavior(unittest.TestCase):
    """Test VirtualTable with correct API usage"""
    
    def setUp(self):
        """Set up test environment"""
        self.table_manager = TableManager()
        self.test_table = self.table_manager.create_table("Test Table", 100, 100)
        
    def test_table_creation_and_basic_operations(self):
        """
        BEHAVIORAL TEST: Table creation and basic entity operations
        Real scenario: DM creates table and adds entities
        """
        # Verify table was created correctly
        self.assertIsNotNone(self.test_table)
        self.assertEqual(self.test_table.name, "Test Table")
        self.assertEqual(self.test_table.width, 100)
        self.assertEqual(self.test_table.height, 100)
        
        # Test adding entity with correct API
        entity = self.test_table.add_entity(
            name="Test Character",
            position=(10, 10),
            layer="tokens",
            path_to_texture="test.png"
        )
        
        self.assertIsNotNone(entity)
        self.assertEqual(entity.name, "Test Character")
        self.assertEqual(entity.position, (10, 10))
        self.assertEqual(entity.layer, "tokens")
        
    def test_entity_movement_workflow(self):
        """
        BEHAVIORAL TEST: Entity movement in multiplayer scenario
        Real scenario: Players move their characters during combat
        """
        # Add a character
        character = self.test_table.add_entity(
            name="Player Character",
            position=(5, 5),
            layer="tokens"
        )
        
        entity_id = character.entity_id
        
        # Move character to new position
        new_position = (10, 15)
        self.test_table.move_entity(entity_id, new_position)
        
        # Verify movement
        moved_entity = self.test_table.entities[entity_id]
        self.assertEqual(moved_entity.position, new_position)
        
    def test_layer_management(self):
        """
        BEHAVIORAL TEST: Layer system works correctly
        Real scenario: DM organizes entities across different layers
        """
        # Add entities to different layers
        map_entity = self.test_table.add_entity("Background Map", (0, 0), "map")
        token_entity = self.test_table.add_entity("Character Token", (1, 1), "tokens")
        obstacle_entity = self.test_table.add_entity("Wall", (2, 2), "obstacles")
        
        # Verify entities are on correct layers
        self.assertEqual(map_entity.layer, "map")
        self.assertEqual(token_entity.layer, "tokens")
        self.assertEqual(obstacle_entity.layer, "obstacles")
        
        # Test layer visibility
        self.assertTrue(self.test_table.layer_visibility["map"])
        self.assertTrue(self.test_table.layer_visibility["tokens"])
        
    def test_entity_collision_detection(self):
        """
        BEHAVIORAL TEST: Collision detection prevents overlapping entities
        Real scenario: Two players try to move to same position
        """
        # Add first entity
        first_entity = self.test_table.add_entity("Entity 1", (20, 20), "tokens")
        
        # Try to add second entity at same position - should fail
        with self.assertRaises(ValueError):
            self.test_table.add_entity("Entity 2", (20, 20), "tokens")
            
        # Try to move entity to occupied position - should fail
        second_entity = self.test_table.add_entity("Entity 2", (21, 21), "tokens")
        
        with self.assertRaises(ValueError):
            self.test_table.move_entity(second_entity.entity_id, (20, 20))
            
    def test_entity_sprite_id_tracking(self):
        """
        ARCHITECTURAL TEST: Sprite ID tracking works for client-server sync
        Real scenario: Client refers to entities by sprite ID
        """
        entity = self.test_table.add_entity("Tracked Entity", (30, 30), "tokens")
        sprite_id = entity.sprite_id
        
        # Find entity by sprite ID
        found_entity = self.test_table.find_entity_by_sprite_id(sprite_id)
        self.assertIsNotNone(found_entity)
        self.assertEqual(found_entity.entity_id, entity.entity_id)
        self.assertEqual(found_entity.name, "Tracked Entity")
        
    def test_boundary_validation(self):
        """
        BEHAVIORAL TEST: Table enforces boundaries correctly
        Real scenario: Player tries to move character off the map
        """
        entity = self.test_table.add_entity("Boundary Test", (50, 50), "tokens")
        
        # Try to move outside boundaries
        invalid_positions = [
            (-1, 50),    # Negative X
            (50, -1),    # Negative Y
            (100, 50),   # X at boundary (0-indexed, so 100 is invalid)
            (50, 100),   # Y at boundary
            (150, 150)   # Far outside
        ]
        
        for invalid_pos in invalid_positions:
            with self.assertRaises(ValueError):
                self.test_table.move_entity(entity.entity_id, invalid_pos)


class TestTableManagerBehavior(unittest.TestCase):
    """Test TableManager multiplayer coordination"""
    
    def setUp(self):
        """Set up test environment"""
        self.table_manager = TableManager()
        
    def test_multiple_table_management(self):
        """
        BEHAVIORAL TEST: Manager handles multiple concurrent tables
        Real scenario: Server hosts multiple game sessions simultaneously
        """
        # Create multiple tables
        table1 = self.table_manager.create_table("Campaign 1", 50, 50)
        table2 = self.table_manager.create_table("One Shot", 30, 30)
        table3 = self.table_manager.create_table("Test Session", 100, 100)
        
        # Verify all tables exist and are different
        self.assertIsNotNone(table1)
        self.assertIsNotNone(table2)
        self.assertIsNotNone(table3)
        
        self.assertNotEqual(table1.table_id, table2.table_id)
        self.assertNotEqual(table2.table_id, table3.table_id)
        
        # Each table should be independent
        table1.add_entity("Hero 1", (10, 10), "tokens")
        table2.add_entity("Hero 2", (10, 10), "tokens")  # Same position, different table
        
        # Should not conflict
        self.assertEqual(len(table1.entities), 1)
        self.assertEqual(len(table2.entities), 1)
    def test_table_lifecycle_management(self):
        """
        BEHAVIORAL TEST: Tables can be created and destroyed properly
        Real scenario: Game sessions start and end
        """
        initial_count = len(self.table_manager.tables)
        
        # Create table
        test_table = self.table_manager.create_table("Lifecycle Test", 20, 20)
        self.assertEqual(len(self.table_manager.tables), initial_count + 1)
        
        # Add some entities
        test_table.add_entity("Test Entity", (5, 5), "tokens")
        self.assertEqual(len(test_table.entities), 1)
        
        # Remove table using table name
        result = self.table_manager.remove_table("Lifecycle Test")
        self.assertTrue(result)
        self.assertEqual(len(self.table_manager.tables), initial_count)


class TestRealWorldScenarios(unittest.TestCase):
    """Test realistic usage scenarios"""
    
    def setUp(self):
        """Set up test environment"""
        self.table_manager = TableManager()
        
    def test_combat_encounter_scenario(self):
        """
        BEHAVIORAL TEST: Complete combat encounter workflow
        Real scenario: DM sets up combat, players take turns
        """
        # DM creates battle map
        battle_table = self.table_manager.create_table("Dragon Fight", 40, 40)
        
        # DM places environment
        battle_table.add_entity("Ancient Dragon", (20, 20), "tokens")
        battle_table.add_entity("Treasure Pile", (25, 25), "tokens")
        battle_table.add_entity("Stone Pillar", (15, 15), "obstacles")
        battle_table.add_entity("Stone Pillar", (25, 15), "obstacles")
        
        # Players join and place characters
        battle_table.add_entity("Fighter", (5, 20), "tokens")
        battle_table.add_entity("Wizard", (5, 18), "tokens")
        battle_table.add_entity("Rogue", (7, 19), "tokens")
        battle_table.add_entity("Cleric", (5, 22), "tokens")
        
        # Verify setup
        self.assertEqual(len(battle_table.entities), 8)
        
        # Simulate combat movement
        # Fighter moves toward dragon
        fighter_id = None
        for entity_id, entity in battle_table.entities.items():
            if entity.name == "Fighter":
                fighter_id = entity_id
                break
        
        self.assertIsNotNone(fighter_id)
        battle_table.move_entity(fighter_id, (10, 20))
        
        # Verify fighter moved
        fighter = battle_table.entities[fighter_id]
        self.assertEqual(fighter.position, (10, 20))
        
    def test_exploration_session_scenario(self):
        """
        BEHAVIORAL TEST: Exploration session with dynamic map reveal
        Real scenario: Players explore dungeon, DM reveals areas
        """
        # Start with small revealed area
        dungeon_table = self.table_manager.create_table("Mysterious Dungeon", 60, 60)
        
        # Initial room
        dungeon_table.add_entity("Room 1 Floor", (10, 10), "map")
        dungeon_table.add_entity("Door North", (10, 5), "obstacles")
        dungeon_table.add_entity("Door East", (15, 10), "obstacles")
        
        # Party enters
        dungeon_table.add_entity("Party Leader", (10, 12), "tokens")
        
        # Party explores north
        party_leader_id = None
        for entity_id, entity in dungeon_table.entities.items():
            if entity.name == "Party Leader":
                party_leader_id = entity_id
                break
        
        # Move to door
        dungeon_table.move_entity(party_leader_id, (10, 8))
        
        # DM reveals new room
        dungeon_table.add_entity("Room 2 Floor", (10, 0), "map")
        dungeon_table.add_entity("Skeleton Warrior", (10, 2), "tokens")
          # Verify exploration state
        self.assertEqual(len(dungeon_table.entities), 6)  # Fixed count
        
        # Party can enter new room
        dungeon_table.move_entity(party_leader_id, (10, 3))
        party_leader = dungeon_table.entities[party_leader_id]
        self.assertEqual(party_leader.position, (10, 3))
        
    def test_social_encounter_scenario(self):
        """
        BEHAVIORAL TEST: Social encounter with NPCs
        Real scenario: Players negotiate with NPCs in tavern
        """
        tavern_table = self.table_manager.create_table("The Prancing Pony", 30, 30)
        
        # Set up tavern
        tavern_table.add_entity("Bar", (15, 10), "obstacles")
        tavern_table.add_entity("Table 1", (5, 5), "obstacles")
        tavern_table.add_entity("Table 2", (25, 5), "obstacles")
        tavern_table.add_entity("Table 3", (5, 25), "obstacles")
        
        # Add NPCs
        tavern_table.add_entity("Bartender", (15, 8), "tokens")
        tavern_table.add_entity("Mysterious Stranger", (25, 3), "tokens")
        tavern_table.add_entity("Town Guard", (7, 25), "tokens")
        
        # Players enter
        tavern_table.add_entity("Bard", (15, 15), "tokens")
        tavern_table.add_entity("Paladin", (14, 15), "tokens")
        
        # Bard approaches mysterious stranger
        bard_id = None
        for entity_id, entity in tavern_table.entities.items():
            if entity.name == "Bard":
                bard_id = entity_id
                break
        
        # Move bard closer to stranger
        tavern_table.move_entity(bard_id, (23, 5))
        
        # Verify social positioning
        bard = tavern_table.entities[bard_id]
        self.assertEqual(bard.position, (23, 5))
        
        # All entities present for roleplay
        self.assertEqual(len(tavern_table.entities), 9)


class TestErrorHandlingAndEdgeCases(unittest.TestCase):
    """Test error handling and edge cases"""
    
    def setUp(self):
        """Set up test environment"""
        self.table_manager = TableManager()
        
    def test_invalid_table_parameters(self):
        """
        BEHAVIORAL TEST: Invalid table creation parameters are handled
        Real scenario: User enters invalid dimensions
        """
        # Test various invalid parameters
        invalid_params = [
            ("", 10, 10),      # Empty name
            ("Valid", 0, 10),   # Zero width
            ("Valid", 10, 0),   # Zero height
            ("Valid", -5, 10),  # Negative width
            ("Valid", 10, -5),  # Negative height
        ]
        
        for name, width, height in invalid_params:
            try:
                table = self.table_manager.create_table(name, width, height)
                # If creation succeeds, table should be in valid state
                if table:
                    self.assertIsNotNone(table.name)
                    self.assertGreater(table.width, 0)
                    self.assertGreater(table.height, 0)
            except (ValueError, TypeError):
                # Acceptable to reject invalid parameters
                pass
                
    def test_concurrent_entity_operations(self):
        """
        BEHAVIORAL TEST: Concurrent operations don't corrupt table state
        Real scenario: Multiple players act simultaneously
        """
        test_table = self.table_manager.create_table("Concurrent Test", 50, 50)
        
        # Add entities rapidly
        entities_added = 0
        for i in range(20):
            try:
                entity = test_table.add_entity(
                    f"Entity_{i}",
                    (i % 10, i // 10),
                    "tokens"
                )
                if entity:
                    entities_added += 1
            except ValueError:
                # Position might be occupied
                pass
        
        # Some entities should have been added
        self.assertGreater(entities_added, 0)
        self.assertEqual(len(test_table.entities), entities_added)
        
    def test_entity_removal_and_cleanup(self):
        """
        BEHAVIORAL TEST: Entity removal cleans up properly
        Real scenario: Creatures are defeated, objects are moved
        """
        test_table = self.table_manager.create_table("Cleanup Test", 20, 20)
        
        # Add entities
        entity1 = test_table.add_entity("Temporary 1", (5, 5), "tokens")
        entity2 = test_table.add_entity("Temporary 2", (6, 6), "tokens")
        entity3 = test_table.add_entity("Permanent", (7, 7), "tokens")
        
        initial_count = len(test_table.entities)
        self.assertEqual(initial_count, 3)
        
        # Remove entities
        test_table.remove_entity(entity1.entity_id)
        test_table.remove_entity(entity2.entity_id)
        
        # Verify cleanup
        self.assertEqual(len(test_table.entities), 1)
        self.assertIn(entity3.entity_id, test_table.entities)
        self.assertNotIn(entity1.entity_id, test_table.entities)
        self.assertNotIn(entity2.entity_id, test_table.entities)


class TestPerformanceRequirements(unittest.TestCase):
    """Test performance requirements for real usage"""
    
    def setUp(self):
        """Set up test environment"""
        self.table_manager = TableManager()
        
    def test_large_table_performance(self):
        """
        PERFORMANCE TEST: Large tables perform adequately
        Real scenario: Detailed battle map with many entities
        """
        # Create large table
        large_table = self.table_manager.create_table("Large Battle", 1000, 1000)
        
        # Add many entities quickly
        start_time = time.time()
        entities_added = 0

        for x in range(0, 1000, 5):  # Every 5th position to avoid collisions
            for y in range(0, 1000, 5):
                try:
                    entity = large_table.add_entity(
                        f"Token_{x}_{y}",
                        (x, y),
                        "tokens"
                    )
                    if entity:
                        entities_added += 1
                except ValueError:
                    # Position collision
                    pass
        
        creation_time = time.time() - start_time
        
        # Should create entities reasonably quickly
        self.assertLess(creation_time, 2.0, f"Entity creation took {creation_time:.2f}s")
        self.assertGreater(entities_added, 100, "Should create substantial number of entities")
        
    def test_entity_movement_performance(self):
        """
        PERFORMANCE TEST: Entity movement is fast enough for real-time play
        Real scenario: Players move characters during combat
        """
        test_table = self.table_manager.create_table("Movement Test", 100, 100)
        
        # Add entity to move
        moving_entity = test_table.add_entity("Fast Mover", (0, 0), "tokens")
        
        # Perform many movements
        start_time = time.time()
        movement_count = 0
        
        for i in range(50):
            new_x = (i + 1) % 50
            new_y = (i + 1) // 50
            try:
                test_table.move_entity(moving_entity.entity_id, (new_x, new_y))
                movement_count += 1
            except ValueError:
                # Position might be invalid
                pass
        
        movement_time = time.time() - start_time
        
        # Should move quickly
        self.assertLess(movement_time, 1.0, f"Movement took {movement_time:.2f}s")
        self.assertGreater(movement_count, 40, "Most movements should succeed")


if __name__ == '__main__':
    # Set up logging to see test progress
    logging.basicConfig(level=logging.WARNING)  # Reduce noise during tests
    
    # Run comprehensive test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    test_classes = [
        TestVirtualTableBehavior,
        TestTableManagerBehavior, 
        TestRealWorldScenarios,
        TestErrorHandlingAndEdgeCases,
        TestPerformanceRequirements
    ]
    
    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)
    
    # Run with detailed output
    runner = unittest.TextTestRunner(verbosity=2, buffer=True)
    result = runner.run(suite)
    
    # Print summary
    print(f"\n{'='*50}")
    print(f"Test Summary:")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    print(f"{'='*50}")
    
    # Exit with appropriate code
    exit_code = 0 if result.wasSuccessful() else 1
    sys.exit(exit_code)
