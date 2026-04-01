"""
Migration: Add metadata column to entities table
Date: 2026-02-26
Description: Stores opaque JSON metadata for special entity types (lights, fog, etc.)
"""
import sqlite3
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(entities)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'metadata' not in columns:
            logger.info("Adding metadata column to entities table")
            cursor.execute("ALTER TABLE entities ADD COLUMN metadata TEXT")
            logger.info("✓ metadata column added")
        else:
            logger.info("⏭  metadata column already exists")

        conn.commit()
        logger.info("Migration 008_add_entity_metadata completed successfully")

    except Exception as e:
        logger.error(f"Migration 008_add_entity_metadata failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    # SQLite does not support DROP COLUMN before version 3.35.
    # Since metadata is nullable, downgrade is a no-op — old code ignores unknown columns.
    logger.info("008_add_entity_metadata: downgrade is a no-op on SQLite")
