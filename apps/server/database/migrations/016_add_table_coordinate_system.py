"""
Migration: Add table coordinate system
Date: 2026-03-17
Description:
  - Adds grid_cell_px, cell_distance, distance_unit to virtual_tables
  - Adds aura_radius_units, vision_radius_units, darkvision_radius_units to entities
"""
import sqlite3
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(virtual_tables)")
        vt_cols = {row[1] for row in cursor.fetchall()}
        for col, definition in [
            ("grid_cell_px",  "FLOAT DEFAULT 50.0"),
            ("cell_distance", "FLOAT DEFAULT 5.0"),
            ("distance_unit", "VARCHAR(10) DEFAULT 'ft'"),
        ]:
            if col not in vt_cols:
                cursor.execute(f"ALTER TABLE virtual_tables ADD COLUMN {col} {definition}")
                logger.info(f"  + virtual_tables.{col}")

        cursor.execute("PRAGMA table_info(entities)")
        e_cols = {row[1] for row in cursor.fetchall()}
        if "aura_radius_units" not in e_cols:
            cursor.execute("ALTER TABLE entities ADD COLUMN aura_radius_units FLOAT")
            logger.info("  + entities.aura_radius_units")
        if "vision_radius_units" not in e_cols:
            cursor.execute("ALTER TABLE entities ADD COLUMN vision_radius_units FLOAT")
            logger.info("  + entities.vision_radius_units")
        if "darkvision_radius_units" not in e_cols:
            cursor.execute("ALTER TABLE entities ADD COLUMN darkvision_radius_units FLOAT")
            logger.info("  + entities.darkvision_radius_units")

        conn.commit()
        logger.info("✓ Migration 016 complete")
    except Exception as e:
        logger.error(f"✗ Migration 016 failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    logger.warning("Downgrade not supported for migration 016 (SQLite limitation)")
