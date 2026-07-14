import importlib
import sqlite3

import pytest


migration = importlib.import_module("database.migrations.027_scope_chat_idempotency")


def _create_legacy_database(db_path):
    with sqlite3.connect(db_path) as conn:
        conn.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY);
            CREATE TABLE game_sessions (id INTEGER PRIMARY KEY);
            CREATE TABLE chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id VARCHAR(64) NOT NULL UNIQUE,
                session_id INTEGER NOT NULL REFERENCES game_sessions(id),
                user_id INTEGER REFERENCES users(id),
                username VARCHAR(100),
                channel VARCHAR(20) NOT NULL DEFAULT 'public',
                recipient_user_id INTEGER REFERENCES users(id),
                table_id VARCHAR(36),
                text TEXT NOT NULL,
                message_json TEXT NOT NULL,
                attachments_json TEXT,
                client_timestamp FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO users (id) VALUES (1), (2);
            INSERT INTO game_sessions (id) VALUES (10), (20);
            INSERT INTO chat_messages (
                message_id, session_id, user_id, username, text, message_json
            ) VALUES (
                'legacy-message', 10, 1, 'Alice', 'Hello', '{"id":"legacy-message"}'
            );
        """)


def test_upgrade_preserves_history_and_scopes_client_operation(tmp_path):
    db_path = tmp_path / "legacy-chat.db"
    _create_legacy_database(db_path)

    migration.upgrade(str(db_path))
    migration.upgrade(str(db_path))

    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info('chat_messages')")}
        assert "client_operation_id" in columns
        assert conn.execute(
            "SELECT message_id, client_operation_id FROM chat_messages"
        ).fetchone() == ("legacy-message", "legacy-message")

        conn.execute("""
            INSERT INTO chat_messages (
                message_id, client_operation_id, session_id, user_id,
                username, text, message_json
            ) VALUES ('server-2', 'legacy-message', 10, 2, 'Bob', 'Hi', '{}')
        """)
        conn.execute("""
            INSERT INTO chat_messages (
                message_id, client_operation_id, session_id, user_id,
                username, text, message_json
            ) VALUES ('server-3', 'legacy-message', 20, 1, 'Alice', 'Hi', '{}')
        """)
        conn.commit()

        assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 3
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("""
                INSERT INTO chat_messages (
                    message_id, client_operation_id, session_id, user_id,
                    username, text, message_json
                ) VALUES ('server-4', 'legacy-message', 10, 1, 'Alice', 'Again', '{}')
            """)
