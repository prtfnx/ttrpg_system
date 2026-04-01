"""
Migration: Add obstacle metadata columns to entities table
Date: 2025-10-16
Description: Adds obstacle_type and obstacle_data columns to support shape-aware lighting
"""
import sqlite3
import os
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Add obstacle metadata columns to entities table"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(entities)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'obstacle_type' not in columns:
            logger.info("Adding obstacle_type column to entities table")
            cursor.execute("""
                ALTER TABLE entities 
                ADD COLUMN obstacle_type VARCHAR(20)
            """)
            logger.info(" obstacle_type column added")
        else:
            logger.info("⏭  obstacle_type column already exists")
        
        if 'obstacle_data' not in columns:
            logger.info("Adding obstacle_data column to entities table")
            cursor.execute("""
                ALTER TABLE entities 
                ADD COLUMN obstacle_data TEXT
            """)
            logger.info(" obstacle_data column added")
        else:
            logger.info("  obstacle_data column already exists")
        
        conn.commit()
        conn.close()
        logger.info(" Migration 001_add_obstacle_metadata completed successfully")
        return True
        
    except Exception as e:
        logger.error(f" Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise

def downgrade(db_path: str):
    """
    Remove obstacle metadata columns from entities table
    Note: SQLite doesn't support DROP COLUMN directly.
    This would require recreating the table.
    """
    logger.warning("Downgrade not implemented for SQLite (requires table recreation)")
    logger.info("To rollback, restore from backup or recreate the database")
    return False

if __name__ == "__main__":
    # Get database path
    import os
    import sys
    
    # Add parent directory to path
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
    
    from server_host.database.database import DB_PATH
    
    print(f"Running migration on database: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f" Database not found at {DB_PATH}")
        print("Run the server first to create the database, then run this migration.")
        sys.exit(1)
    
    # Backup database
    backup_path = f"{DB_PATH}.backup_{int(__import__('time').time())}"
    print(f"Creating backup: {backup_path}")
    __import__('shutil').copy2(DB_PATH, backup_path)
    
    # Run migration
    try:
        upgrade(DB_PATH)
        print(" Migration completed successfully!")
    except Exception as e:
        print(f" Migration failed: {e}")
        print(f"Backup available at: {backup_path}")
        sys.exit(1)
