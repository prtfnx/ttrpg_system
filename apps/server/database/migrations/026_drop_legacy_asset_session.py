"""Remove assets.session_id from databases that already ran migration 025."""

import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def _has_legacy_session_id(cursor: sqlite3.Cursor) -> bool:
    return any(row[1] == "session_id" for row in cursor.execute("PRAGMA table_info('assets')"))


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        if not _has_legacy_session_id(cursor):
            logger.info("[SKIP] Legacy asset session ownership is already removed")
            return

        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute("""
            CREATE TABLE assets_without_session (
                id INTEGER NOT NULL PRIMARY KEY,
                asset_name VARCHAR(255) NOT NULL,
                r2_asset_id VARCHAR(100) NOT NULL,
                content_type VARCHAR(100) NOT NULL,
                file_size INTEGER NOT NULL,
                xxhash VARCHAR(32),
                uploaded_by INTEGER NOT NULL REFERENCES users(id),
                created_at DATETIME,
                updated_at DATETIME,
                last_accessed DATETIME,
                r2_key VARCHAR(500) NOT NULL,
                r2_bucket VARCHAR(100) NOT NULL
            )
        """)
        cursor.execute("""
            INSERT INTO assets_without_session (
                id, asset_name, r2_asset_id, content_type, file_size, xxhash,
                uploaded_by, created_at, updated_at, last_accessed, r2_key, r2_bucket
            )
            SELECT
                id, asset_name, r2_asset_id, content_type, file_size, xxhash,
                uploaded_by, created_at, updated_at, last_accessed, r2_key, r2_bucket
            FROM assets
        """)
        cursor.execute("DROP TABLE assets")
        cursor.execute("ALTER TABLE assets_without_session RENAME TO assets")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_assets_id ON assets (id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_assets_asset_name ON assets (asset_name)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_assets_r2_asset_id ON assets (r2_asset_id)")
        conn.commit()
        cursor.execute("PRAGMA foreign_keys = ON")
        logger.info("[OK] Removed legacy asset session ownership")


def downgrade(db_path: str):
    logger.warning("Legacy asset session ownership removal is intentionally irreversible")
