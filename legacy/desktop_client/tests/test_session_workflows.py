"""
Comprehensive test for TTRPG Session Management Workflows
Tests real user workflows: session creation, joining, table management, and persistence
"""
import unittest
import asyncio
import logging
import os
import sys
from unittest.mock import Mock, AsyncMock, patch
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from server_host.database.database import SessionLocal, init_db
from server_host.database import crud, models, schemas
from server_host.database.session_utils import (
    create_game_session_with_persistence,
    load_game_session_with_persistence
)
from server_host.service.game_session_protocol import GameSessionProtocolService
from core_table.table import VirtualTable


class TestSessionWorkflows(unittest.TestCase):
    """Test comprehensive session management workflows"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test database and logging"""
        logging.basicConfig(level=logging.WARNING)  # Reduce noise
        cls.logger = logging.getLogger(__name__)
        
        # Initialize test database
        init_db()
        cls.db = SessionLocal()
        
        # Use unique test data to avoid constraint violations
        import time
        timestamp = str(int(time.time()))
        
        # Create test user with unique email
        cls.test_user = models.User(
            username=f"dm_user_{timestamp}",
            email=f"dm_{timestamp}@test.com",
            hashed_password="hashed_password",
            full_name="Test DM"
        )
        cls.db.add(cls.test_user)
        cls.db.commit()
        cls.db.refresh(cls.test_user)
        
        # Create player user with unique email
        cls.player_user = models.User(
            username=f"player_user_{timestamp}",
            email=f"player_{timestamp}@test.com",
            hashed_password="hashed_password",
            full_name="Test Player"
        )
        cls.db.add(cls.player_user)
        cls.db.commit()
        cls.db.refresh(cls.player_user)

    @classmethod
    def tearDownClass(cls):
        """Clean up test database"""
        cls.db.close()

    def test_dm_creates_and_manages_session(self):
        """Test DM workflow: create session, create tables, add entities, save state"""
        
        # Step 1: DM creates a new game session
        protocol_service, error = create_game_session_with_persistence(
            self.db, "Epic Campaign", self.test_user.id
        )
        self.assertIsNone(error, "Session creation should succeed")
        self.assertIsNotNone(protocol_service, "Protocol service should be created")
        self.assertTrue(protocol_service.session_code, "Session should have a code")
        
        session_code = protocol_service.session_code
        
        # Step 2: DM creates multiple tables
        table_manager = protocol_service.table_manager
        
        # Create dungeon table
        dungeon_table = table_manager.create_table("dungeon_map", 50, 40)
        self.assertIsNotNone(dungeon_table, "Dungeon table should be created")
        self.assertEqual(dungeon_table.name, "dungeon_map")
        
        # Create overworld table
        overworld_table = table_manager.create_table("overworld", 100, 80)
        self.assertIsNotNone(overworld_table, "Overworld table should be created")
        
        # Step 3: DM adds entities to tables
        # Add party members to dungeon
        fighter = dungeon_table.add_entity("Fighter", (10, 15), layer='tokens')
        wizard = dungeon_table.add_entity("Wizard", (12, 15), layer='tokens')
        self.assertIsNotNone(fighter, "Fighter entity should be created")
        self.assertIsNotNone(wizard, "Wizard entity should be created")
        
        # Add enemies
        orc1 = dungeon_table.add_entity("Orc Warrior", (25, 20), layer='tokens')
        orc2 = dungeon_table.add_entity("Orc Archer", (27, 18), layer='tokens')
        
        # Add DM-only elements
        secret_door = dungeon_table.add_entity("Secret Door", (30, 25), layer='dungeon_master')
        
        self.assertEqual(len(dungeon_table.entities), 5, "Should have 5 entities")
        
        # Step 4: Save session state to database
        save_success = protocol_service.save_to_database()
        self.assertTrue(save_success, "Session should save successfully")
        
        # Step 5: Verify persistence by loading from database
        loaded_service, load_error = load_game_session_with_persistence(self.db, session_code)
        self.assertIsNone(load_error, "Session loading should succeed")
        self.assertIsNotNone(loaded_service, "Loaded service should exist")
        
        # Verify tables were persisted
        loaded_tables = loaded_service.table_manager.tables
        self.assertIn("dungeon_map", loaded_tables, "Dungeon table should be persisted")
        self.assertIn("overworld", loaded_tables, "Overworld table should be persisted")
        
        # Verify entities were persisted  
        loaded_dungeon = loaded_tables["dungeon_map"]
        self.assertEqual(len(loaded_dungeon.entities), 5, "All entities should be persisted")
        
        # Check specific entity
        fighter_entities = [e for e in loaded_dungeon.entities.values() if e.name == "Fighter"]
        self.assertEqual(len(fighter_entities), 1, "Fighter should be persisted")
        self.assertEqual(fighter_entities[0].position, (10, 15), "Fighter position should be correct")

    def test_player_joins_session_workflow(self):
        """Test player workflow: join existing session, see appropriate content"""
        
        # First, create a session as DM
        dm_service, _ = create_game_session_with_persistence(
            self.db, "Player Session", self.test_user.id
        )
        session_code = dm_service.session_code
        
        # DM creates content with different visibility layers
        table = dm_service.table_manager.create_table("test_table", 30, 20)
        
        # Public entities (visible to all)
        public_npc = table.add_entity("Friendly NPC", (5, 5), layer='tokens')
        treasure = table.add_entity("Treasure Chest", (10, 10), layer='tokens')
        
        # DM-only entities (hidden from players)
        dm_note = table.add_entity("DM Note: Trap here", (10, 11), layer='dungeon_master')
        hidden_enemy = table.add_entity("Hidden Assassin", (6, 5), layer='dungeon_master')
        
        dm_service.save_to_database()
        
        # Step 2: Player joins the session
        player_service, error = load_game_session_with_persistence(self.db, session_code)
        self.assertIsNone(error, "Player should be able to join session")
        
        # Step 3: Verify player sees appropriate content
        player_table = player_service.table_manager.tables["test_table"]
        
        # Player should see public entities
        visible_entities = [e for e in player_table.entities.values() 
                          if e.layer != 'dungeon_master']
        self.assertEqual(len(visible_entities), 2, "Player should see 2 public entities")
        
        # Verify specific entities are visible
        entity_names = [e.name for e in visible_entities]
        self.assertIn("Friendly NPC", entity_names, "Player should see NPC")
        self.assertIn("Treasure Chest", entity_names, "Player should see treasure")
        
        # Player should not see DM entities in normal gameplay
        # (Note: In actual implementation, layer filtering would be done at render/protocol level)

    def test_multi_table_session_management(self):
        """Test managing multiple tables within a session"""
        
        # Create session
        service, _ = create_game_session_with_persistence(
            self.db, "Multi-Table Campaign", self.test_user.id
        )
        
        # Create multiple themed tables
        tables_data = [
            ("tavern", 20, 15),
            ("forest_path", 60, 30), 
            ("dragon_lair", 40, 25),
            ("town_square", 35, 35)
        ]
        
        created_tables = {}
        for name, width, height in tables_data:
            table = service.table_manager.create_table(name, width, height)
            created_tables[name] = table
            
            # Add appropriate entities to each table
            if name == "tavern":
                table.add_entity("Bartender", (10, 7), layer='tokens')
                table.add_entity("Mysterious Stranger", (15, 12), layer='tokens')
            elif name == "forest_path":
                table.add_entity("Ancient Tree", (30, 15), layer='environment')
                table.add_entity("Wolf Pack", (45, 20), layer='tokens')
            elif name == "dragon_lair":
                table.add_entity("Red Dragon", (20, 12), layer='tokens')
                table.add_entity("Treasure Hoard", (35, 20), layer='tokens')
                table.add_entity("Secret Escape Route", (5, 5), layer='dungeon_master')
        
        # Verify all tables were created
        self.assertEqual(len(service.table_manager.tables), len(tables_data),
                        "All tables should be created")
        
        # Test table switching workflow
        for table_name in created_tables:
            table = service.table_manager.get_table(table_name)
            self.assertIsNotNone(table, f"Should be able to access {table_name}")
            self.assertEqual(table.name, table_name, "Table name should match")
        
        # Save and reload to test persistence
        service.save_to_database()
        
        loaded_service, _ = load_game_session_with_persistence(self.db, service.session_code)
        
        # Verify all tables and their content persisted
        for table_name, (width, height) in [(name, (w, h)) for name, w, h in tables_data]:
            loaded_table = loaded_service.table_manager.get_table(table_name)
            self.assertIsNotNone(loaded_table, f"{table_name} should be persisted")
            self.assertEqual(loaded_table.width, width, f"{table_name} width should match")
            self.assertEqual(loaded_table.height, height, f"{table_name} height should match")

    def test_session_state_persistence_and_recovery(self):
        """Test session state persistence and recovery scenarios"""
        
        # Create and populate session
        service, _ = create_game_session_with_persistence(
            self.db, "Persistence Test", self.test_user.id
        )
        
        # Create complex session state
        table = service.table_manager.create_table("complex_scenario", 50, 40)
        
        # Add various entities with different properties
        entities_data = [
            ("Hero", (10, 10), 'tokens', 'hero.png'),
            ("Villain", (40, 30), 'tokens', 'villain.png'),
            ("Map Background", (0, 0), 'map', 'dungeon_map.jpg'),
            ("Light Source", (25, 20), 'light', 'torch.png'),
            ("DM Notes", (5, 35), 'dungeon_master', None)
        ]
        
        created_entities = {}
        for name, pos, layer, texture in entities_data:
            entity = table.add_entity(name, pos, layer=layer, path_to_texture=texture)
            created_entities[name] = entity
        
        # Modify entity positions (simulate gameplay)
        hero = created_entities["Hero"]
        original_pos = hero.position
        new_pos = (15, 15)
        hero.move_to(new_pos)
        
        # Save initial state
        save_success = service.save_to_database()
        self.assertTrue(save_success, "Initial save should succeed")
        session_code = service.session_code
        
        # Simulate server restart by loading fresh session
        recovered_service, error = load_game_session_with_persistence(self.db, session_code)
        self.assertIsNone(error, "Recovery should succeed")
        
        # Verify all data was recovered correctly
        recovered_table = recovered_service.table_manager.get_table("complex_scenario")
        self.assertIsNotNone(recovered_table, "Table should be recovered")
        self.assertEqual(len(recovered_table.entities), 5, "All entities should be recovered")
        
        # Verify specific entity state
        recovered_hero = None
        for entity in recovered_table.entities.values():
            if entity.name == "Hero":
                recovered_hero = entity
                break
        
        self.assertIsNotNone(recovered_hero, "Hero should be recovered")
        self.assertEqual(recovered_hero.position, new_pos, "Hero position should be persisted")
        self.assertEqual(recovered_hero.layer, 'tokens', "Hero layer should be persisted")
        
        # Test multiple save/load cycles
        for i in range(3):
            # Make changes
            recovered_hero.move_to((20 + i, 20 + i))
            
            # Save
            save_success = recovered_service.save_to_database()
            self.assertTrue(save_success, f"Save cycle {i+1} should succeed")
            
            # Reload
            recovered_service, error = load_game_session_with_persistence(self.db, session_code)
            self.assertIsNone(error, f"Load cycle {i+1} should succeed")
            
            # Verify changes persisted
            recovered_table = recovered_service.table_manager.get_table("complex_scenario")
            updated_hero = next(e for e in recovered_table.entities.values() if e.name == "Hero")
            expected_pos = (20 + i, 20 + i)
            self.assertEqual(updated_hero.position, expected_pos, 
                           f"Position should be updated after cycle {i+1}")


if __name__ == '__main__':
    # Run tests
    unittest.main(verbosity=2)
