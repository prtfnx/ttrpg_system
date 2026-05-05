"""
Migration: Add walls table
Date: 2026-03-13
Description: Persistent wall segments for lighting and vision pipeline.
             Walls are first-class entities, not sprites.
"""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='walls'")
        if cursor.fetchone():
            logger.info("walls table already exists, skipping")
            return

        cursor.execute("""
            CREATE TABLE walls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wall_id VARCHAR(36) NOT NULL UNIQUE,
                table_id VARCHAR(36) NOT NULL REFERENCES virtual_tables(table_id),
                x1 REAL NOT NULL,
                y1 REAL NOT NULL,
                x2 REAL NOT NULL,
                y2 REAL NOT NULL,
                wall_type VARCHAR(20) NOT NULL DEFAULT 'normal',
                blocks_movement BOOLEAN NOT NULL DEFAULT 1,
                blocks_light BOOLEAN NOT NULL DEFAULT 1,
                blocks_sight BOOLEAN NOT NULL DEFAULT 1,
                blocks_sound BOOLEAN NOT NULL DEFAULT 1,
                is_door BOOLEAN NOT NULL DEFAULT 0,
                door_state VARCHAR(10) NOT NULL DEFAULT 'closed',
                is_secret BOOLEAN NOT NULL DEFAULT 0,
                direction VARCHAR(10) NOT NULL DEFAULT 'both',
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_walls_wall_id ON walls (wall_id)")
        cursor.execute("CREATE INDEX ix_walls_table_id ON walls (table_id)")
        conn.commit()
        logger.info("[OK] Created walls table")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("DROP TABLE IF EXISTS walls")
        conn.commit()
        logger.info("[OK] Dropped walls table")
    finally:
        if conn:
            conn.close()
