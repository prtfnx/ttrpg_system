"""
Migration: Add token_asset_id FK to session_characters table
Date: 2025-12-29
Description: Links characters directly to Asset table instead of pattern matching
"""
import sqlite3
import os
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Add token_asset_id column to session_characters table"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(session_characters)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'token_asset_id' not in columns:
            logger.info("Adding token_asset_id column to session_characters table")
            cursor.execute("""
                ALTER TABLE session_characters 
                ADD COLUMN token_asset_id VARCHAR(100)
            """)
            logger.info("✅ token_asset_id column added")
            
            # Try to populate existing characters with token assets
            # Match pattern: MM_{character_name}.webp
            logger.info("Populating token_asset_id for existing characters...")
            cursor.execute("""
                UPDATE session_characters
                SET token_asset_id = (
                    SELECT assets.r2_asset_id
                    FROM assets
                    WHERE assets.asset_name = 'MM_' || session_characters.character_name || '.webp'
                    LIMIT 1
                )
                WHERE token_asset_id IS NULL
                AND EXISTS (
                    SELECT 1 FROM assets
                    WHERE assets.asset_name = 'MM_' || session_characters.character_name || '.webp'
                )
            """)
            
            populated = cursor.rowcount
            if populated > 0:
                logger.info(f"✅ Populated token_asset_id for {populated} characters")
            else:
                logger.info("ℹ️  No existing characters to populate")
        else:
            logger.info("⏭️  token_asset_id column already exists")
        
        conn.commit()
        conn.close()
        logger.info("✅ Migration 004_add_token_asset_fk completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise

def downgrade(db_path: str):
    """
    Remove token_asset_id column from session_characters table
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
        print(f"❌ Database not found at {DB_PATH}")
        print("Run the server first to create the database, then run this migration.")
        sys.exit(1)
    
    # Backup database
    backup_path = f"{DB_PATH}.backup_{int(__import__('time').time())}"
    print(f"Creating backup: {backup_path}")
    __import__('shutil').copy2(DB_PATH, backup_path)
    
    # Run migration
    try:
        upgrade(DB_PATH)
        print("✅ Migration completed successfully!")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print(f"Backup available at: {backup_path}")
        sys.exit(1)
