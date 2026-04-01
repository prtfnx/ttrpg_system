# Database Migrations

This directory contains database migration scripts for the TTRPG system.

## Running Migrations

### Method 1: Run all pending migrations
```powershell
cd server_host\database\migrations
python run_migrations.py
```

### Method 2: Run a specific migration
```powershell
cd server_host\database\migrations
python 001_add_obstacle_metadata.py
```

## Migration Files

### 001_add_obstacle_metadata.py
**Date:** 2025-10-16  
**Description:** Adds obstacle shape metadata to entities table for client-side lighting calculations

**Changes:**
- Adds `obstacle_type` VARCHAR(20) column (nullable)
- Adds `obstacle_data` TEXT column (nullable) for JSON shape data

**Supported obstacle types:**
- `rectangle` - Standard rectangular obstacles
- `circle` - Circular obstacles (columns, etc.)
- `polygon` - Custom polygon shapes
- `line` - Line segment obstacles (walls)

### 002_add_character_sprite_linking.py
**Date:** 2025-11-17  
**Description:** Adds character sprite linking to entities table

**Changes:**
- Adds `character_id` VARCHAR(36) column (nullable) 
- Adds `controlled_by` TEXT column (nullable) for JSON user ID array

### 003_add_token_stats.py
**Date:** 2025-11-18  
**Description:** Adds token statistics columns to entities table

**Changes:**
- Adds `hp` INTEGER column (nullable)
- Adds `max_hp` INTEGER column (nullable) 
- Adds `ac` INTEGER column (nullable)
- Adds `aura_radius` REAL column (nullable)

### 004_add_active_table_id.py
**Date:** 2026-02-05  
**Description:** Adds active table persistence to game_players table

**Changes:**
- Adds `active_table_id` VARCHAR(36) column (nullable) to store user's currently active table per session

## Creating New Migrations

1. Create a new file: `NNN_description.py` (e.g., `002_add_fog_of_war.py`)
2. Implement `upgrade(db_path: str)` function
3. Optionally implement `downgrade(db_path: str)` function
4. Add main block for standalone execution

Example template:
```python
"""
Migration: Brief description
Date: YYYY-MM-DD
Description: Detailed description
"""
import sqlite3
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Apply migration"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Your migration SQL here
    cursor.execute("ALTER TABLE ...")
    
    conn.commit()
    conn.close()
    logger.info("✅ Migration completed")
    return True

def downgrade(db_path: str):
    """Rollback migration"""
    # Implement rollback if possible
    pass

if __name__ == "__main__":
    # Standalone execution code
    pass
```

## Notes

- Migrations automatically create backups before running
- SQLite doesn't support DROP COLUMN, so downgrades may require table recreation
- The `schema_migrations` table tracks which migrations have been applied
- Migrations run in alphanumeric order based on filename
