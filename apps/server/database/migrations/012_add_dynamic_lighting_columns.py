"""
Migration: Add dynamic lighting columns to virtual_tables
Date: 2026-03-11
Description: Adds dynamic_lighting_enabled, fog_exploration_mode, and
             ambient_light_level columns required by the lighting system.
"""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(virtual_tables)")
        existing = {row[1] for row in cursor.fetchall()}

        added = []

        if 'dynamic_lighting_enabled' not in existing:
            cursor.execute("ALTER TABLE virtual_tables ADD COLUMN dynamic_lighting_enabled BOOLEAN DEFAULT 0")
            added.append('dynamic_lighting_enabled')

        if 'fog_exploration_mode' not in existing:
            cursor.execute("ALTER TABLE virtual_tables ADD COLUMN fog_exploration_mode VARCHAR(20) DEFAULT 'current_only'")
            added.append('fog_exploration_mode')

        if 'ambient_light_level' not in existing:
            cursor.execute("ALTER TABLE virtual_tables ADD COLUMN ambient_light_level FLOAT DEFAULT 1.0")
            added.append('ambient_light_level')

        if added:
            conn.commit()
            logger.info(f"[OK] Added columns to virtual_tables: {', '.join(added)}")
        else:
            logger.info("[SKIP]  All lighting columns already exist in virtual_tables")

    except Exception as e:
        logger.error(f"Migration 012 failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    # SQLite doesn't support DROP COLUMN in older versions; log a warning
    logger.warning("Downgrade not supported for SQLite column additions (012_add_dynamic_lighting_columns)")
