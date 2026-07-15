import importlib
import sqlite3


migration = importlib.import_module("database.migrations.029_add_character_permissions")


def test_migration_backfills_only_session_members(tmp_path):
    db_path = tmp_path / "characters.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY);
            CREATE TABLE game_sessions (id INTEGER PRIMARY KEY);
            CREATE TABLE game_players (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL
            );
            CREATE TABLE session_characters (
                character_id VARCHAR(36) PRIMARY KEY,
                session_id INTEGER NOT NULL,
                owner_user_id INTEGER NOT NULL,
                character_data TEXT NOT NULL
            );
            INSERT INTO users (id) VALUES (1), (2), (3);
            INSERT INTO game_sessions (id) VALUES (10);
            INSERT INTO game_players (id, session_id, user_id) VALUES (1, 10, 1), (2, 10, 2);
            INSERT INTO session_characters (
                character_id, session_id, owner_user_id, character_data
            ) VALUES ('char-1', 10, 1, '{"controlledBy":[1,2,3,"bad"]}');
        """)

    migration.upgrade(str(db_path))
    migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as conn:
        assert conn.execute("""
            SELECT character_id, session_id, user_id, can_view, can_edit, can_control, granted_by
            FROM character_permissions
        """).fetchall() == [("char-1", 10, 2, 1, 1, 1, 1)]
