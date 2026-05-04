"""
Migration: Add ban_list column to game_sessions table
Date: 2026-03-02
Description: Stores a JSON array of ban records (player_id, username, reason, duration,
             banned_by, timestamp) for each session. Defaults to empty array.
"""
import sqlite3
from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(game_sessions)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'ban_list' not in columns:
            logger.info("Adding ban_list column to game_sessions table")
            cursor.execute("ALTER TABLE game_sessions ADD COLUMN ban_list TEXT DEFAULT '[]'")
            logger.info("[OK] ban_list column added")
        else:
            logger.info("[SKIP]  ban_list column already exists")

        conn.commit()
        logger.info("Migration 009_add_ban_list completed successfully")

    except Exception as e:
        logger.error(f"Migration 009_add_ban_list failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    # SQLite <3.35 has no DROP COLUMN; ban_list is nullable so old code ignores it.
    logger.info("009_add_ban_list: downgrade is a no-op on SQLite")
