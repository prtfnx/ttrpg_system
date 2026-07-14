"""Scope chat idempotency to the authenticated session and sender."""

import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def _has_client_operation_id(cursor: sqlite3.Cursor) -> bool:
    return any(
        row[1] == "client_operation_id"
        for row in cursor.execute("PRAGMA table_info('chat_messages')")
    )


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        if _has_client_operation_id(cursor):
            logger.info("[SKIP] Chat idempotency is already tenant-scoped")
            return

        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute("""
            CREATE TABLE chat_messages_scoped (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id VARCHAR(64) NOT NULL UNIQUE,
                client_operation_id VARCHAR(64) NOT NULL,
                session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id),
                username VARCHAR(100),
                channel VARCHAR(20) NOT NULL DEFAULT 'public',
                recipient_user_id INTEGER REFERENCES users(id),
                table_id VARCHAR(36),
                text TEXT NOT NULL,
                message_json TEXT NOT NULL,
                attachments_json TEXT,
                client_timestamp FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_chat_sender_operation
                    UNIQUE (session_id, user_id, client_operation_id)
            )
        """)
        cursor.execute("""
            INSERT INTO chat_messages_scoped (
                id, message_id, client_operation_id, session_id, user_id,
                username, channel, recipient_user_id, table_id, text,
                message_json, attachments_json, client_timestamp, created_at
            )
            SELECT
                id, message_id, message_id, session_id, user_id,
                username, channel, recipient_user_id, table_id, text,
                message_json, attachments_json, client_timestamp, created_at
            FROM chat_messages
        """)
        cursor.execute("DROP TABLE chat_messages")
        cursor.execute("ALTER TABLE chat_messages_scoped RENAME TO chat_messages")
        cursor.execute("CREATE UNIQUE INDEX ix_chat_messages_message_id ON chat_messages (message_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_session_id ON chat_messages (session_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_user_id ON chat_messages (user_id)")
        cursor.execute(
            "CREATE INDEX ix_chat_messages_recipient_user_id ON chat_messages (recipient_user_id)"
        )
        cursor.execute("CREATE INDEX ix_chat_messages_table_id ON chat_messages (table_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_created_at ON chat_messages (created_at)")
        cursor.execute(
            "CREATE INDEX ix_chat_messages_session_created_at "
            "ON chat_messages (session_id, created_at)"
        )
        conn.commit()
        cursor.execute("PRAGMA foreign_keys = ON")
        logger.info("[OK] Scoped chat idempotency to session and sender")


def downgrade(db_path: str):
    logger.warning("Tenant-scoped chat idempotency is intentionally irreversible")
