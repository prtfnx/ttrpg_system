"""
Migration: Add password reset and user settings support
Date: 2026-02-25
Description:
- Adds password_set_at column to users table (NULL = OAuth-only user)
- Adds session_version column to users table (bump to invalidate all JWTs)
- Creates password_reset_tokens table (stores SHA-256 hash, not raw token)
- Creates pending_email_changes table
"""
import sqlite3
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # ── users table new columns ───────────────────────────────────────────
        cursor.execute("PRAGMA table_info(users)")
        cols = [r[1] for r in cursor.fetchall()]

        if "password_set_at" not in cols:
            cursor.execute("ALTER TABLE users ADD COLUMN password_set_at DATETIME")
            logger.info("✓ users.password_set_at added")
        else:
            logger.info("⏭  users.password_set_at already exists")

        if "session_version" not in cols:
            cursor.execute("ALTER TABLE users ADD COLUMN session_version INTEGER DEFAULT 0 NOT NULL")
            logger.info("✓ users.session_version added")
        else:
            logger.info("⏭  users.session_version already exists")

        # ── password_reset_tokens ─────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash VARCHAR(64) UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT 0 NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash)
        """)
        logger.info("✓ password_reset_tokens table ready")

        # ── pending_email_changes ─────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_email_changes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                new_email VARCHAR(100) NOT NULL,
                token_hash VARCHAR(64) UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT 0 NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_pec_user_id ON pending_email_changes(user_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_pec_token_hash ON pending_email_changes(token_hash)
        """)
        logger.info("✓ pending_email_changes table ready")

        conn.commit()
        logger.info("✅ Migration 007 upgrade completed")
        return True

    except sqlite3.Error as e:
        logger.error(f"❌ Migration 007 upgrade failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("DROP TABLE IF EXISTS pending_email_changes")
        logger.info("✓ pending_email_changes dropped")

        cursor.execute("DROP TABLE IF EXISTS password_reset_tokens")
        logger.info("✓ password_reset_tokens dropped")

        # SQLite doesn't support DROP COLUMN — columns remain but can be ignored
        logger.info("Note: password_set_at and session_version columns remain (SQLite limitation)")

        conn.commit()
        logger.info("✅ Migration 007 downgrade completed")
        return True

    except sqlite3.Error as e:
        logger.error(f"❌ Migration 007 downgrade failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
