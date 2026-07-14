"""Backfill session asset links and remove legacy global filename uniqueness."""

import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def _asset_name_has_unique_index(cursor: sqlite3.Cursor) -> bool:
    for index_row in cursor.execute("PRAGMA index_list('assets')").fetchall():
        index_name = index_row[1]
        is_unique = bool(index_row[2])
        if not is_unique:
            continue
        columns = [row[2] for row in cursor.execute(f"PRAGMA index_info('{index_name}')").fetchall()]
        if columns == ["asset_name"]:
            return True
    return False


def _asset_has_session_id(cursor: sqlite3.Cursor) -> bool:
    return any(row[1] == "session_id" for row in cursor.execute("PRAGMA table_info('assets')"))


def _rebuild_assets_without_legacy_ownership(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE assets_normalized (
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
        INSERT INTO assets_normalized (
            id, asset_name, r2_asset_id, content_type, file_size, xxhash,
            uploaded_by, created_at, updated_at, last_accessed,
            r2_key, r2_bucket
        )
        SELECT
            id, asset_name, r2_asset_id, content_type, file_size, xxhash,
            uploaded_by, created_at, updated_at, last_accessed,
            r2_key, r2_bucket
        FROM assets
    """)
    cursor.execute("DROP TABLE assets")
    cursor.execute("ALTER TABLE assets_normalized RENAME TO assets")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_assets_id ON assets (id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_assets_asset_name ON assets (asset_name)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_assets_r2_asset_id ON assets (r2_asset_id)")


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")
        has_legacy_session_id = _asset_has_session_id(cursor)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS session_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
                asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                display_name VARCHAR(255) NOT NULL,
                added_by INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_session_asset UNIQUE (session_id, asset_id)
            )
        """)
        if has_legacy_session_id:
            cursor.execute("""
                INSERT OR IGNORE INTO session_assets (
                    session_id, asset_id, display_name, added_by, created_at, last_accessed
                )
                SELECT
                    session_id,
                    id,
                    asset_name,
                    uploaded_by,
                    COALESCE(created_at, CURRENT_TIMESTAMP),
                    COALESCE(last_accessed, created_at, CURRENT_TIMESTAMP)
                FROM assets
                WHERE session_id IS NOT NULL
            """)

        if has_legacy_session_id or _asset_name_has_unique_index(cursor):
            _rebuild_assets_without_legacy_ownership(cursor)

        cursor.execute("CREATE INDEX IF NOT EXISTS ix_session_assets_session_id ON session_assets (session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_session_assets_asset_id ON session_assets (asset_id)")
        conn.commit()
        cursor.execute("PRAGMA foreign_keys = ON")
        logger.info("[OK] Normalized legacy asset session ownership")


def downgrade(db_path: str):
    logger.warning("Asset session normalization is intentionally irreversible")
