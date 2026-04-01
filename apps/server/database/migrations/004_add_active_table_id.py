"""
Migration: Add active_table_id column to game_players table
Date: 2026-02-05
Description: Adds active_table_id column to store user's currently active table per session
"""
import sqlite3
import os
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Add active_table_id column to game_players table"""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(game_players)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'active_table_id' not in columns:
            logger.info("Adding active_table_id column to game_players table")
            cursor.execute("""
                ALTER TABLE game_players 
                ADD COLUMN active_table_id VARCHAR(36)
            """)
            logger.info("✓ active_table_id column added")
        else:
            logger.info("⏭  active_table_id column already exists")
        
        conn.commit()
        conn.close()
        logger.info("✓ Migration 004_add_active_table_id completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"✗ Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise

def downgrade(db_path: str):
    """
    Remove active_table_id column from game_players table
    Note: SQLite doesn't support DROP COLUMN directly.
    This would require recreating the table.
    """
    logger.warning("Downgrade not implemented for SQLite (requires table recreation)")
    logger.info("To rollback, restore from backup or recreate the database")
    return False

if __name__ == "__main__":
    import sys
    import shutil
    import time
    
    # Add parent directory to path
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
    
    from server_host.database.database import DB_PATH
    
    print(f"Running migration on database: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f"✗ Database not found at {DB_PATH}")
        print("Run the server first to create the database, then run this migration.")
        sys.exit(1)
    
    # Backup database
    backup_path = f"{DB_PATH}.backup_{int(time.time())}"
    print(f"Creating backup: {backup_path}")
    shutil.copy2(DB_PATH, backup_path)
    
    # Run migration
    try:
        upgrade(DB_PATH)
        print("✓ Migration completed successfully!")
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        print(f"Backup available at: {backup_path}")
        sys.exit(1)