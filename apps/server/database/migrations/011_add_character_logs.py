"""
Migration: Add character_logs table
Date: 2026-03-10
Description: Stores per-character action history (HP changes, spell casts,
             skill rolls, rest events, item changes). Used by ActivityTab.
"""
import sqlite3
from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='character_logs'")
        if cursor.fetchone():
            logger.info("⏭  character_logs table already exists")
            return

        logger.info("Creating character_logs table")
        cursor.execute("""
            CREATE TABLE character_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT    NOT NULL REFERENCES session_characters(character_id) ON DELETE CASCADE,
                session_id  INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
                user_id     INTEGER NOT NULL,
                action_type TEXT    NOT NULL,
                description TEXT    NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX idx_char_logs_char ON character_logs(character_id, created_at DESC)")
        cursor.execute("CREATE INDEX idx_char_logs_session ON character_logs(session_id, created_at DESC)")

        conn.commit()
        logger.info("✓ character_logs table created")

    except Exception as e:
        logger.error(f"Migration 011_add_character_logs failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
