"""
Migration: Add token stats columns to entities table
Date: 2025-11-18
Description: Adds hp, max_hp, ac, aura_radius columns to support token statistics
"""
import sqlite3
import os
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Add token stats columns to entities table"""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(entities)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'hp' not in columns:
            logger.info("Adding hp column to entities table")
            cursor.execute("""
                ALTER TABLE entities 
                ADD COLUMN hp INTEGER
            """)
            logger.info("✓ hp column added")
        else:
            logger.info("⏭  hp column already exists")
        
        if 'max_hp' not in columns:
            logger.info("Adding max_hp column to entities table")
            cursor.execute("""
                ALTER TABLE entities 
                ADD COLUMN max_hp INTEGER
            """)
            logger.info("✓ max_hp column added")
        else:
            logger.info("⏭  max_hp column already exists")
        
        if 'ac' not in columns:
            logger.info("Adding ac column to entities table")
            cursor.execute("""
                ALTER TABLE entities 
                ADD COLUMN ac INTEGER
            """)
            logger.info("✓ ac column added")
        else:
            logger.info("⏭  ac column already exists")
        
        if 'aura_radius' not in columns:
            logger.info("Adding aura_radius column to entities table")
            cursor.execute("""
                ALTER TABLE entities 
                ADD COLUMN aura_radius REAL
            """)
            logger.info("✓ aura_radius column added")
        else:
            logger.info("⏭  aura_radius column already exists")
        
        conn.commit()
        conn.close()
        logger.info("✓ Migration 003_add_token_stats completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"✗ Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise

def downgrade(db_path: str):
    """
    Remove token stats columns from entities table
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
