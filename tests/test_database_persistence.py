"""
Comprehensive test for database persistence system
Tests: Create game session, create tables, add entities, move entities, save to DB, load from DB
"""
import pytest
import os
import sys
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

from server_host.database.database import Base
from server_host.database import crud, models, schemas
from server_host.database.session_utils import (
    create_game_session_with_persistence,
    load_game_session_with_persistence,
    save_game_session_state
)
from core_table.table import VirtualTable, Entity

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s:%(message)s')
logger = logging.getLogger(__name__)

class TestDatabasePersistence:
    """Test suite for database persistence functionality"""
    
    @classmethod
    def setup_class(cls):
        """Set up test database"""
        # Use in-memory SQLite for testing
        cls.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=cls.engine)
        cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        
        # Create test user
        cls.db = cls.SessionLocal()
        test_user = models.User(
            username="testuser",
            email="test@example.com",
            hashed_password="hashed_password_here",
            full_name="Test User"
        )
        cls.db.add(test_user)
        cls.db.commit()
        cls.db.refresh(test_user)
        cls.test_user_id = test_user.id
        logger.info(f"Created test user with ID: {cls.test_user_id}")
    
    @classmethod
    def teardown_class(cls):
        """Clean up test database"""
        cls.db.close()
        logger.info("Test database closed")
    
    def test_complete_persistence_workflow(self):
        """Complete test: create session, tables, entities, move, save, load, verify"""
        
        logger.info("=== Starting Complete Persistence Test ===")
        
        # Step 1: Create persistent game session
        logger.info("Step 1: Creating persistent game session")
        protocol_service, error = create_game_session_with_persistence(
            self.db, "Test Campaign Session", self.test_user_id
        )
        
        assert protocol_service is not None, f"Failed to create session: {error}"
        assert error is None, f"Unexpected error: {error}"
        
        session_code = protocol_service.session_code
        logger.info(f"Created session: {session_code}")
        
        # Verify initial state
        assert len(protocol_service.table_manager.tables) >= 1  # At least default table
        initial_table_count = len(protocol_service.table_manager.tables)
        logger.info(f"Initial tables: {list(protocol_service.table_manager.tables.keys())}")
        
        # Step 2: Create 3 new tables
        logger.info("Step 2: Creating 3 new tables")
        
        # Table 1: Battle Map
        battle_map = VirtualTable("battle_map", 50, 30)
        protocol_service.table_manager.add_table(battle_map)
        
        # Table 2: Town Square  
        town_square = VirtualTable("town_square", 40, 40)
        protocol_service.table_manager.add_table(town_square)
        
        # Table 3: Dungeon Level 1
        dungeon_l1 = VirtualTable("dungeon_level_1", 60, 35)
        protocol_service.table_manager.add_table(dungeon_l1)
        
        # Verify tables created
        expected_tables = {'battle_map', 'town_square', 'dungeon_level_1'}
        actual_tables = set(protocol_service.table_manager.tables.keys())
        assert expected_tables.issubset(actual_tables), f"Missing tables. Expected: {expected_tables}, Got: {actual_tables}"
        logger.info(f"Created tables: {list(expected_tables)}")
        
        # Step 3: Add entities to tables
        logger.info("Step 3: Adding entities to tables")
        
        # Battle Map entities
        hero = battle_map.add_entity("Hero", (5, 5), "tokens", "hero.png")
        orc1 = battle_map.add_entity("Orc Warrior", (10, 8), "tokens", "orc.png")
        orc2 = battle_map.add_entity("Orc Archer", (12, 10), "tokens", "orc_archer.png")
        wall = battle_map.add_entity("Stone Wall", (15, 5), "obstacles", "wall.png")
        
        # Town Square entities  
        npc1 = town_square.add_entity("Merchant", (20, 20), "tokens", "merchant.png")
        npc2 = town_square.add_entity("Guard", (22, 18), "tokens", "guard.png")
        fountain = town_square.add_entity("Fountain", (25, 25), "map", "fountain.png")
        
        # Dungeon entities
        boss = dungeon_l1.add_entity("Dragon", (30, 15), "tokens", "dragon.png") 
        treasure = dungeon_l1.add_entity("Treasure Chest", (35, 20), "tokens", "chest.png")
        trap = dungeon_l1.add_entity("Spike Trap", (28, 12), "obstacles", "trap.png")
        
        # Verify entities added
        assert len(battle_map.entities) == 4, f"Battle map should have 4 entities, got {len(battle_map.entities)}"
        assert len(town_square.entities) == 3, f"Town square should have 3 entities, got {len(town_square.entities)}"
        assert len(dungeon_l1.entities) == 3, f"Dungeon should have 3 entities, got {len(dungeon_l1.entities)}"
        
        # Store initial positions for verification later
        initial_positions = {
            hero.sprite_id: hero.position,
            orc1.sprite_id: orc1.position,
            npc1.sprite_id: npc1.position,
            boss.sprite_id: boss.position,
            wall.sprite_id: wall.position,
            trap.sprite_id: trap.position
        }
        
        logger.info(f"Added entities - Battle: {len(battle_map.entities)}, Town: {len(town_square.entities)}, Dungeon: {len(dungeon_l1.entities)}")
        logger.info(f"Initial positions: {initial_positions}")
        
        # Step 4: Move entities to test position changes
        logger.info("Step 4: Moving entities")
        
        # Move hero
        battle_map.move_entity(hero.entity_id, (8, 7))
        # Move orc
        battle_map.move_entity(orc1.entity_id, (11, 9))
        # Move NPC
        town_square.move_entity(npc1.entity_id, (21, 22))
        # Move boss
        dungeon_l1.move_entity(boss.entity_id, (32, 17))
        
        # Verify moves
        assert hero.position == (8, 7), f"Hero position should be (8, 7), got {hero.position}"
        assert orc1.position == (11, 9), f"Orc position should be (11, 9), got {orc1.position}"
        assert npc1.position == (21, 22), f"NPC position should be (21, 22), got {npc1.position}"
        assert boss.position == (32, 17), f"Boss position should be (32, 17), got {boss.position}"
        
        # Store moved positions
        moved_positions = {
            hero.sprite_id: hero.position,
            orc1.sprite_id: orc1.position,
            npc1.sprite_id: npc1.position,
            boss.sprite_id: boss.position,
            # These shouldn't have moved
            wall.sprite_id: wall.position,
            trap.sprite_id: trap.position
        }
        
        logger.info(f"Moved positions: {moved_positions}")
        
        # Step 5: Save game state to database
        logger.info("Step 5: Saving game state to database")
        
        additional_game_data = {
            "current_turn": 5,
            "phase": "combat",
            "round": 2,
            "test_metadata": "persistence_test"
        }
        
        save_success = save_game_session_state(protocol_service, additional_game_data)
        assert save_success, "Failed to save game state to database"
        logger.info("Successfully saved game state")
        
        # Step 6: Clear game session (simulate server restart)
        logger.info("Step 6: Clearing game session (simulating restart)")
        
        # Store references for verification
        original_session_code = protocol_service.session_code
        original_game_session_db_id = protocol_service.game_session_db_id
        
        # Clear the protocol service
        protocol_service.cleanup()
        protocol_service = None
        logger.info("Cleared game session from memory")
        
        # Step 7: Load game session from database
        logger.info("Step 7: Loading game session from database")
        
        loaded_service, load_error = load_game_session_with_persistence(
            self.db, original_session_code
        )
        
        assert loaded_service is not None, f"Failed to load session: {load_error}"
        assert load_error is None, f"Unexpected load error: {load_error}"
        assert loaded_service.session_code == original_session_code
        assert loaded_service.game_session_db_id == original_game_session_db_id
        
        logger.info(f"Successfully loaded session: {loaded_service.session_code}")
        
        # Step 8: Verify loaded state
        logger.info("Step 8: Verifying loaded state")
        
        # Check tables exist
        loaded_tables = set(loaded_service.table_manager.tables.keys())
        assert expected_tables.issubset(loaded_tables), f"Missing tables after load. Expected: {expected_tables}, Got: {loaded_tables}"
        
        # Get loaded tables
        loaded_battle_map = loaded_service.table_manager.get_table("battle_map")
        loaded_town_square = loaded_service.table_manager.get_table("town_square")
        loaded_dungeon_l1 = loaded_service.table_manager.get_table("dungeon_level_1")
        
        # Check entity counts
        assert len(loaded_battle_map.entities) == 4, f"Loaded battle map should have 4 entities, got {len(loaded_battle_map.entities)}"
        assert len(loaded_town_square.entities) == 3, f"Loaded town square should have 3 entities, got {len(loaded_town_square.entities)}"
        assert len(loaded_dungeon_l1.entities) == 3, f"Loaded dungeon should have 3 entities, got {len(loaded_dungeon_l1.entities)}"
        
        # Check entity positions (most important test)
        all_loaded_entities = {}
        for table in [loaded_battle_map, loaded_town_square, loaded_dungeon_l1]:
            for entity in table.entities.values():
                all_loaded_entities[entity.sprite_id] = entity
        
        logger.info("Verifying entity positions...")
        for sprite_id, expected_pos in moved_positions.items():
            assert sprite_id in all_loaded_entities, f"Entity {sprite_id} not found in loaded data"
            loaded_entity = all_loaded_entities[sprite_id]
            assert loaded_entity.position == expected_pos, f"Entity {sprite_id} position mismatch. Expected: {expected_pos}, Got: {loaded_entity.position}"
            logger.info(f"✓ {loaded_entity.name} position correct: {loaded_entity.position}")
        
        # Check entity properties
        logger.info("Verifying entity properties...")
        for sprite_id, loaded_entity in all_loaded_entities.items():
            # Check that entities have correct layers
            if "wall" in loaded_entity.name.lower() or "trap" in loaded_entity.name.lower():
                assert loaded_entity.layer == "obstacles", f"Obstacle entity {loaded_entity.name} should be on obstacles layer"
            logger.info(f"✓ {loaded_entity.name} on layer: {loaded_entity.layer}")
        
        # Check table properties
        logger.info("Verifying table properties...")
        assert loaded_battle_map.width == 50 and loaded_battle_map.height == 30
        assert loaded_town_square.width == 40 and loaded_town_square.height == 40  
        assert loaded_dungeon_l1.width == 60 and loaded_dungeon_l1.height == 35
        logger.info("✓ All table dimensions correct")
          # Check that obstacles layer exists
        for table in [loaded_battle_map, loaded_town_square, loaded_dungeon_l1]:
            assert "obstacles" in table.layers, f"Table {table.name} missing obstacles layer"
            assert "obstacles" in table.layer_visibility, f"Table {table.name} missing obstacles visibility"
        logger.info("✓ All tables have obstacles layer")
        
        logger.info("=== Persistence Test PASSED ===")
        logger.info(f"✓ Session: {loaded_service.session_code}")
        logger.info(f"✓ Tables: {len(loaded_tables)} loaded")
        logger.info(f"✓ Entities: {sum(len(t.entities) for t in [loaded_battle_map, loaded_town_square, loaded_dungeon_l1])} total")
        logger.info(f"✓ Positions: All {len(moved_positions)} entity positions verified")
        
        # Test passed - no return value needed for pytest

def run_test():
    """Run the persistence test"""
    test_instance = TestDatabasePersistence()
    test_instance.setup_class()
    
    try:
        result = test_instance.test_complete_persistence_workflow()
        logger.info("🎉 DATABASE PERSISTENCE TEST COMPLETED SUCCESSFULLY!")
        return result
    except Exception as e:
        logger.error(f"❌ TEST FAILED: {e}")
        raise
    finally:
        test_instance.teardown_class()

if __name__ == "__main__":
    # Run the test
    success = run_test()
    if success:
        print("\n" + "="*60)
        print("🎉 ALL TESTS PASSED!")
        print("✅ Database persistence system working correctly")
        print("✅ Tables saved and loaded successfully")
        print("✅ Entity positions preserved across save/load")
        print("✅ Obstacles layer included and working")
        print("="*60)
    else:
        print("\n❌ TESTS FAILED")
        exit(1)
