#!/usr/bin/env python3
"""
Test script to demonstrate the persistence optimization.
This script will test sprite deletion performance with the new batched saves.
"""
import asyncio
import time
import sys
import os

# Add parent directory to path to import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core_table.actions_core import ActionsCore
from core_table.server import TableManager
from core_table.table import VirtualTable, Entity
from logger import setup_logger

logger = setup_logger(__name__)

class MockTableManager(TableManager):
    """Mock table manager for testing"""
    
    def __init__(self):
        super().__init__()
        self.save_count = 0
        self.save_calls = []
        # Simulate database session availability
        self.db_session = True  # Mock non-None db_session
        
    def save_table(self, table_name: str, session_id=None):
        """Mock save method that tracks calls"""
        self.save_count += 1
        self.save_calls.append((table_name, session_id, time.time()))
        logger.info(f"Mock saved table '{table_name}' (save #{self.save_count})")
        # Simulate database save time
        time.sleep(0.1)  # Much faster than real database for testing
        return True

async def test_sprite_deletion_performance():
    """Test sprite deletion with the new persistence optimization"""
    logger.info("Testing sprite deletion performance with persistence optimization")
    
    # Create mock table manager and actions core
    table_manager = MockTableManager()
    actions = ActionsCore(table_manager)
    
    # Create a test table with multiple sprites
    table = VirtualTable("test_table", 100, 100)
    table_manager.tables["test_table"] = table
    table_manager.tables_id[str(table.table_id)] = table
    
    # Add test sprites using proper table method
    sprite_ids = []
    entities = []
    for i in range(10):
        # Use the table's add_entity method to properly register sprites
        sprite_data = {
            'name': f"Test Sprite {i}",
            'position': (10 + i * 5, 10),
            'layer': "tokens",
            'texture_path': f"test_sprite_{i}.png"
        }
        entity = table.add_entity(sprite_data)
        if entity:
            sprite_ids.append(entity.sprite_id)  # Use the actual generated sprite ID
            entities.append(entity)
        else:
            logger.error(f"Failed to add entity {i}")
    
    logger.info(f"Created test table with {len(sprite_ids)} sprites")
    logger.info(f"First 5 sprite IDs: {sprite_ids[:5]}")
    
    # Test deletion with batched saves
    start_time = time.time()
    session_id = 12345
    
    # Delete half the sprites
    for i, sprite_id in enumerate(sprite_ids[:5]):
        logger.info(f"Deleting sprite {sprite_id} (#{i+1}/5)")
        result = await actions.delete_sprite("test_table", sprite_id, session_id=session_id)
        if not result.success:
            logger.error(f"Failed to delete sprite {sprite_id}: {result.message}")
    
    logger.info("Waiting for batched saves to complete...")
    # Wait a bit longer than the save delay to ensure all saves complete
    await asyncio.sleep(actions._save_delay + 1.0)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Results
    logger.info(f"=== PERFORMANCE TEST RESULTS ===")
    logger.info(f"Total sprites deleted: 5")
    logger.info(f"Total time: {total_time:.2f} seconds")
    logger.info(f"Average time per deletion: {total_time/5:.2f} seconds")
    logger.info(f"Total database saves: {table_manager.save_count}")
    logger.info(f"Saves per deletion: {table_manager.save_count/5:.2f}")
    
    # Analyze save calls
    if table_manager.save_calls:
        first_save_time = table_manager.save_calls[0][2]
        last_save_time = table_manager.save_calls[-1][2]
        save_timespan = last_save_time - first_save_time
        logger.info(f"Save timespan: {save_timespan:.2f} seconds")
        
        for i, (table_id, session_id, timestamp) in enumerate(table_manager.save_calls):
            relative_time = timestamp - start_time
            logger.info(f"Save #{i+1}: table_id={table_id}, session_id={session_id}, time=+{relative_time:.2f}s")
    
    # Verify table state
    remaining_entities = len(table.entities)
    logger.info(f"Remaining entities in table: {remaining_entities}")
    
    # Test flush all pending saves
    logger.info("Testing flush_all_pending_saves...")
    await actions.flush_all_pending_saves()
    logger.info(f"After flush - Total database saves: {table_manager.save_count}")
    
    # Expected results with optimization:
    # - Should have only 1 save call (batched) instead of 5 (one per deletion)
    # - Total time should be much less than 5 * 1.5 seconds = 7.5 seconds
    if table_manager.save_count == 1:
        logger.info("✅ OPTIMIZATION SUCCESS: Only 1 database save for 5 deletions!")
    else:
        logger.warning(f"⚠️  Expected 1 save, got {table_manager.save_count}")
    
    if total_time < 3.0:  # Much faster than old method
        logger.info("✅ PERFORMANCE SUCCESS: Deletion time significantly improved!")
    else:
        logger.warning(f"⚠️  Expected fast deletion, took {total_time:.2f}s")

async def test_immediate_save_operations():
    """Test that critical operations still save immediately"""
    logger.info("\nTesting immediate save operations...")
    
    table_manager = MockTableManager()
    actions = ActionsCore(table_manager)
    
    # Test table creation (should force immediate save)
    logger.info("Testing table creation...")
    result = await actions.create_table("critical_table", 50, 50, session_id=99999)
    
    if result.success:
        logger.info("✅ Table created successfully")
        # Should have immediate save
        if table_manager.save_count == 1:
            logger.info("✅ IMMEDIATE SAVE SUCCESS: Table creation triggered immediate save")
        else:
            logger.warning(f"⚠️  Expected immediate save, got {table_manager.save_count} saves")
    else:
        logger.error(f"❌ Table creation failed: {result.message}")

if __name__ == "__main__":
    async def main():
        try:
            await test_sprite_deletion_performance()
            await test_immediate_save_operations()
        except Exception as e:
            logger.error(f"Test failed: {e}")
            import traceback
            traceback.print_exc()
    
    asyncio.run(main())
