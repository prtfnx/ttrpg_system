"""
Migration: Add vision columns to entities table
Date: 2026-03-11
Description: Adds vision_radius, has_darkvision, and darkvision_radius columns
             required by the dynamic lighting / vision system.
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
        existing = {row[1] for row in cursor.fetchall()}

        added = []

        if 'vision_radius' not in existing:
            cursor.execute("ALTER TABLE entities ADD COLUMN vision_radius FLOAT")
            added.append('vision_radius')

        if 'has_darkvision' not in existing:
            cursor.execute("ALTER TABLE entities ADD COLUMN has_darkvision BOOLEAN DEFAULT 0")
            added.append('has_darkvision')

        if 'darkvision_radius' not in existing:
            cursor.execute("ALTER TABLE entities ADD COLUMN darkvision_radius FLOAT")
            added.append('darkvision_radius')

        if added:
            conn.commit()
            logger.info(f"✓ Added columns to entities: {', '.join(added)}")
        else:
            logger.info("⏭  All vision columns already exist in entities")

    except Exception as e:
        logger.error(f"Migration 013 failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    logger.warning("Downgrade not supported for SQLite column additions (013_add_entity_vision_columns)")
