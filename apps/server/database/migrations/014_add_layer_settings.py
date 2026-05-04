"""
Migration: Add layer_settings column to virtual_tables
Date: 2026-03-12
Description: Stores per-layer opacity/visibility settings as JSON,
             persisted per table and restored when clients join.
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

        if 'layer_settings' not in existing:
            cursor.execute("ALTER TABLE virtual_tables ADD COLUMN layer_settings TEXT")
            conn.commit()
            logger.info("[OK] Added column layer_settings to virtual_tables")
        else:
            logger.info("[SKIP]  layer_settings already exists in virtual_tables")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    # SQLite does not support DROP COLUMN on older versions; no-op
    logger.warning("[WARN]  Downgrade not supported for this migration (SQLite limitation)")
