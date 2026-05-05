"""
Migration: Add aura_color column to entities table
Date: 2026-03-06
Description: Stores the hex color string for a token's aura light (e.g. '#ffaa00').
             Nullable — NULL means default warm-white light.
"""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(entities)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'aura_color' not in columns:
            logger.info("Adding aura_color column to entities table")
            cursor.execute("ALTER TABLE entities ADD COLUMN aura_color VARCHAR(7)")
            logger.info("[OK] aura_color column added")
        else:
            logger.info("[SKIP]  aura_color column already exists")

        conn.commit()
        logger.info("Migration 010_add_aura_color completed successfully")

    except Exception as e:
        logger.error(f"Migration 010_add_aura_color failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    # SQLite <3.35 has no DROP COLUMN; column is nullable so old code ignores it.
    logger.info("010_add_aura_color: downgrade is a no-op on SQLite")
