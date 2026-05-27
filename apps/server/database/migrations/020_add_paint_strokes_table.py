"""
Migration: Add paint_strokes table
Date: 2026-05-27
Description: Persistent freehand paint strokes per virtual table.
             Stroke data is an opaque JSON blob from WASM.
"""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='paint_strokes'")
        if cursor.fetchone():
            logger.info("paint_strokes table already exists, skipping")
            return

        cursor.execute("""
            CREATE TABLE paint_strokes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stroke_id VARCHAR(36) NOT NULL UNIQUE,
                table_id VARCHAR(36) NOT NULL REFERENCES virtual_tables(table_id) ON DELETE CASCADE,
                created_by INTEGER REFERENCES users(id),
                stroke_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_paint_strokes_stroke_id ON paint_strokes (stroke_id)")
        cursor.execute("CREATE INDEX ix_paint_strokes_table_id ON paint_strokes (table_id)")
        conn.commit()
        logger.info("[OK] Created paint_strokes table")

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
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS paint_strokes")
        conn.commit()
        logger.info("[OK] Dropped paint_strokes table")
    except Exception as e:
        logger.error(f"Downgrade failed: {e}")
        raise
    finally:
        if conn:
            conn.close()
