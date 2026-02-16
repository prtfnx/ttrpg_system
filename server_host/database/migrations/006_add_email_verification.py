"""
Migration: Add authentication and demo features
Date: 2026-02-16
Description: Adds email verification, Google OAuth support, and demo session tracking
- Adds is_verified and google_id columns to users table
- Creates email_verification_tokens table
- Adds is_demo column to game_sessions table
"""
import sqlite3
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Add email verification, OAuth, and demo session features"""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Add is_verified column to users table
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'is_verified' not in columns:
            logger.info("Adding is_verified column to users table")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN is_verified BOOLEAN DEFAULT 0
            """)
            logger.info("✓ is_verified column added")
        else:
            logger.info("⏭  is_verified column already exists")
        
        # Add google_id column to users table
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'google_id' not in columns:
            logger.info("Adding google_id column to users table")
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN google_id VARCHAR(255)
            """)
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id 
                ON users(google_id)
            """)
            logger.info("✓ google_id column and index added")
        else:
            logger.info("⏭  google_id column already exists")
        
        # Create email_verification_tokens table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_verification_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token VARCHAR(255) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        logger.info("✓ email_verification_tokens table created")
        
        # Create index for faster token lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_email_tokens_token 
            ON email_verification_tokens(token)
        """)
        logger.info("✓ Token index created")
        
        # Create index for user_id lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id 
            ON email_verification_tokens(user_id)
        """)
        logger.info("✓ User ID index created")
        
        # Add is_demo column to game_sessions table
        cursor.execute("PRAGMA table_info(game_sessions)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'is_demo' not in columns:
            logger.info("Adding is_demo column to game_sessions table")
            cursor.execute("""
                ALTER TABLE game_sessions 
                ADD COLUMN is_demo BOOLEAN DEFAULT 0
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_game_sessions_is_demo 
                ON game_sessions(is_demo)
            """)
            logger.info("✓ is_demo column and index added")
        else:
            logger.info("⏭  is_demo column already exists")
        
        conn.commit()
        logger.info("✅ Migration 006 upgrade completed")
        return True
        
    except sqlite3.Error as e:
        logger.error(f"❌ Migration 006 upgrade failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

def downgrade(db_path: str):
    """Remove email verification columns and tables"""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        logger.info("Dropping email_verification_tokens table")
        cursor.execute("DROP TABLE IF EXISTS email_verification_tokens")
        
        # SQLite doesn't support DROP COLUMN directly, need to recreate table
        logger.info("Note: Cannot remove is_verified column from users table in SQLite")
        logger.info("      Column will remain but can be ignored")
        
        conn.commit()
        logger.info("✅ Migration 006 downgrade completed")
        return True
        
    except sqlite3.Error as e:
        logger.error(f"❌ Migration 006 downgrade failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
