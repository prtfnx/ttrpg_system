#!/usr/bin/env python3
"""
Test script to verify sprite deletion functionality works correctly.
"""

import os
import sys
import json
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Import required modules
from server_host.database.database import SessionLocal
from server_host.database import crud
from core_table.table import VirtualTable, Entity

def test_deletion_persistence():
    """Test that deleted sprites are actually removed from the database."""
    print("Testing sprite deletion persistence...")
    
    # Get database session
    db = SessionLocal()
    
    try:
        # First, let's get the current count of entities in the test_table
        test_table_uuid = "0a577ca2-7f6a-400d-9758-26f232003cc5"
        
        # Load the table from database
        virtual_table, success = crud.load_table_from_db(db, test_table_uuid)
        if not success or not virtual_table:
            print("ERROR: Could not load test_table from database")
            return False
            
        print(f"Loaded table '{virtual_table.name}' with {len(virtual_table.entities)} entities")
        
        # Print current entities
        print("Current entities:")
        for entity_id, entity in virtual_table.entities.items():
            print(f"  - {entity.name} (ID: {entity_id}, Sprite: {entity.sprite_id[:8]}...)")
        
        # Save original count
        original_count = len(virtual_table.entities)
        
        if original_count == 0:
            print("No entities to delete, skipping test")
            return False
            
        # Remove one entity (the first one)
        entity_to_remove = list(virtual_table.entities.values())[0]
        entity_id_to_remove = list(virtual_table.entities.keys())[0]
        
        print(f"Removing entity: {entity_to_remove.name} (ID: {entity_id_to_remove})")
        
        # Delete the entity from the in-memory table
        del virtual_table.entities[entity_id_to_remove]
        
        print(f"After deletion, table has {len(virtual_table.entities)} entities")
        
        # Save the table back to the database (this should trigger the deletion logic)
        print("Saving table to database...")
        # For the test table, we know it's in session 1 (from our database dump)
        crud.save_table_to_db(db, virtual_table, session_id=1)
        
        # Now reload the table from database to verify the deletion persisted
        print("Reloading table from database...")
        reloaded_table, reload_success = crud.load_table_from_db(db, test_table_uuid)
        
        if not reload_success or not reloaded_table:
            print("ERROR: Could not reload table from database")
            return False
            
        print(f"Reloaded table has {len(reloaded_table.entities)} entities")
        
        # Check if the deletion persisted
        if len(reloaded_table.entities) == original_count - 1:
            print("✅ SUCCESS: Deletion persisted correctly!")
            
            # Verify the specific entity is gone
            found_deleted_entity = False
            for entity in reloaded_table.entities.values():
                if entity.sprite_id == entity_to_remove.sprite_id:
                    found_deleted_entity = True
                    break
                    
            if not found_deleted_entity:
                print("✅ SUCCESS: Deleted entity is not in reloaded table!")
                return True
            else:
                print("❌ FAILURE: Deleted entity still exists in reloaded table!")
                return False
        else:
            print(f"❌ FAILURE: Expected {original_count - 1} entities, but got {len(reloaded_table.entities)}")
            return False
            
    except Exception as e:
        print(f"ERROR during test: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("TTRPG Sprite Deletion Test")
    print("=" * 50)
    
    success = test_deletion_persistence()
    
    if success:
        print("\n✅ All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Test failed!")
        sys.exit(1)
