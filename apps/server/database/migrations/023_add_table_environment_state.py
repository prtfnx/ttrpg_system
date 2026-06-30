"""Persist table terrain and cover-zone state."""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        columns = {
            row[1] for row in cursor.execute("PRAGMA table_info(virtual_tables)")
        }
        if "difficult_terrain_json" not in columns:
            cursor.execute(
                "ALTER TABLE virtual_tables "
                "ADD COLUMN difficult_terrain_json TEXT DEFAULT '[]'"
            )
        if "cover_zones_json" not in columns:
            cursor.execute(
                "ALTER TABLE virtual_tables "
                "ADD COLUMN cover_zones_json TEXT DEFAULT '[]'"
            )
        conn.commit()
        logger.info("[OK] Added table environment state columns")


def downgrade(db_path: str):
    logger.info(
        "SQLite downgrade for virtual_tables terrain/cover columns is a no-op"
    )
