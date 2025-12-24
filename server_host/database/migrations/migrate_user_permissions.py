"""
Database migration script for adding user permissions
Adds role and tier columns to users table
"""

import sys
import os
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from server_host.database.database import engine
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

MIGRATION_SQL = """
-- Add role column (default: player)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'player';

-- Add tier column (default: free)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free';

-- Update existing users to have default values
UPDATE users 
SET role = 'player' 
WHERE role IS NULL;

UPDATE users 
SET tier = 'free' 
WHERE tier IS NULL;
"""

# SQLite doesn't support CREATE INDEX IF NOT EXISTS in ALTER TABLE context
INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
"""

def run_migration():
    """Execute the migration"""
    logger.info("Starting user permissions migration...")
    
    try:
        with engine.begin() as conn:
            # Check if we're using SQLite
            is_sqlite = "sqlite" in str(engine.url)
            
            if is_sqlite:
                # SQLite: Add columns one at a time
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'player'"))
                    logger.info("✅ Added 'role' column")
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        logger.info("ℹ️  'role' column already exists")
                    else:
                        raise
                
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN tier VARCHAR(20) DEFAULT 'free'"))
                    logger.info("✅ Added 'tier' column")
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        logger.info("ℹ️  'tier' column already exists")
                    else:
                        raise
                
                # Update existing rows
                conn.execute(text("UPDATE users SET role = 'player' WHERE role IS NULL"))
                conn.execute(text("UPDATE users SET tier = 'free' WHERE tier IS NULL"))
                logger.info("✅ Updated existing user records")
                
                # Create indexes
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier)"))
                logger.info("✅ Created indexes")
                
            else:
                # PostgreSQL: Can use more advanced syntax
                for statement in MIGRATION_SQL.strip().split(';'):
                    statement = statement.strip()
                    if statement:
                        conn.execute(text(statement))
                
                for statement in INDEX_SQL.strip().split(';'):
                    statement = statement.strip()
                    if statement:
                        conn.execute(text(statement))
            
            logger.info("✅ Migration completed successfully")
            
            # Verify migration
            result = conn.execute(text("PRAGMA table_info(users)" if is_sqlite else 
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'users' AND column_name IN ('role', 'tier')"))
            
            if is_sqlite:
                columns = [row[1] for row in result]
            else:
                columns = [row[0] for row in result]
            
            if 'role' in columns and 'tier' in columns:
                logger.info("✅ Verified: role and tier columns exist")
            else:
                logger.warning(f"⚠️  Warning: Expected columns not found. Found: {columns}")
                
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        raise

def rollback_migration():
    """Rollback the migration (remove columns)"""
    logger.warning("Rolling back user permissions migration...")
    
    try:
        with engine.begin() as conn:
            is_sqlite = "sqlite" in str(engine.url)
            
            if is_sqlite:
                # SQLite doesn't support DROP COLUMN easily, need to recreate table
                logger.warning("⚠️  SQLite doesn't support DROP COLUMN. Manual rollback required.")
                logger.warning("   To rollback: backup data, drop table, recreate without role/tier columns")
            else:
                # PostgreSQL supports DROP COLUMN
                conn.execute(text("DROP INDEX IF EXISTS idx_users_role"))
                conn.execute(text("DROP INDEX IF EXISTS idx_users_tier"))
                conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS role"))
                conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS tier"))
                logger.info("✅ Rollback completed successfully")
    except Exception as e:
        logger.error(f"❌ Rollback failed: {e}")
        raise

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback_migration()
    else:
        run_migration()
