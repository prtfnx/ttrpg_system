import importlib
import sqlite3


migration = importlib.import_module("database.migrations.025_normalize_asset_sessions")
cleanup_migration = importlib.import_module("database.migrations.026_drop_legacy_asset_session")


def _create_legacy_database(db_path):
    with sqlite3.connect(db_path) as conn:
        conn.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY);
            CREATE TABLE game_sessions (id INTEGER PRIMARY KEY);
            CREATE TABLE assets (
                id INTEGER PRIMARY KEY,
                asset_name VARCHAR(255) NOT NULL UNIQUE,
                r2_asset_id VARCHAR(100) NOT NULL UNIQUE,
                content_type VARCHAR(100) NOT NULL,
                file_size INTEGER NOT NULL,
                xxhash VARCHAR(32),
                uploaded_by INTEGER NOT NULL REFERENCES users(id),
                session_id INTEGER REFERENCES game_sessions(id),
                created_at DATETIME,
                updated_at DATETIME,
                last_accessed DATETIME,
                r2_key VARCHAR(500) NOT NULL,
                r2_bucket VARCHAR(100) NOT NULL
            );
            INSERT INTO users (id) VALUES (1);
            INSERT INTO game_sessions (id) VALUES (10), (20);
            INSERT INTO assets (
                id, asset_name, r2_asset_id, content_type, file_size, xxhash,
                uploaded_by, session_id, r2_key, r2_bucket
            ) VALUES (
                100, 'map.png', 'asset-a', 'image/png', 10, 'hash-a',
                1, 10, 'sessions/A/assets/a.png', 'assets'
            );
        """)


def test_upgrade_backfills_link_and_removes_filename_uniqueness(tmp_path):
    db_path = tmp_path / "legacy.db"
    _create_legacy_database(db_path)

    migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as conn:
        link = conn.execute(
            "SELECT session_id, asset_id, display_name, added_by FROM session_assets"
        ).fetchone()
        assert link == (10, 100, "map.png", 1)
        columns = {row[1] for row in conn.execute("PRAGMA table_info('assets')")}
        assert "session_id" not in columns

        conn.execute("""
            INSERT INTO assets (
                id, asset_name, r2_asset_id, content_type, file_size, uploaded_by,
                r2_key, r2_bucket
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (101, "map.png", "asset-b", "image/png", 20, 1, "b.png", "assets"))
        conn.execute("""
            INSERT INTO session_assets (session_id, asset_id, display_name, added_by)
            VALUES (20, 101, 'map.png', 1)
        """)
        conn.commit()

    migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM assets WHERE asset_name = 'map.png'").fetchone()[0] == 2
        assert conn.execute("SELECT COUNT(*) FROM session_assets").fetchone()[0] == 2


def test_cleanup_migration_removes_session_column_from_already_normalized_database(tmp_path):
    db_path = tmp_path / "normalized.db"
    _create_legacy_database(db_path)
    migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as conn:
        conn.execute("ALTER TABLE assets ADD COLUMN session_id INTEGER REFERENCES game_sessions(id)")
        conn.execute("UPDATE assets SET session_id = 10")
        conn.commit()

    cleanup_migration.upgrade(str(db_path))
    cleanup_migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info('assets')")}
        assert "session_id" not in columns
        assert conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM session_assets").fetchone()[0] == 1
