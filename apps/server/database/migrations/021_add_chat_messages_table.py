"""
Migration: Add chat_messages table
Date: 2026-06-08
Description: Persist session chat history, including message payloads and optional attachments.
"""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'")
        if cursor.fetchone():
            logger.info("chat_messages table already exists, skipping")
            return

        cursor.execute("""
            CREATE TABLE chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id VARCHAR(64) NOT NULL UNIQUE,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX ix_chat_messages_message_id ON chat_messages (message_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_session_id ON chat_messages (session_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_user_id ON chat_messages (user_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_recipient_user_id ON chat_messages (recipient_user_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_table_id ON chat_messages (table_id)")
        cursor.execute("CREATE INDEX ix_chat_messages_created_at ON chat_messages (created_at)")
        cursor.execute("CREATE INDEX ix_chat_messages_session_created_at ON chat_messages (session_id, created_at)")
        conn.commit()
        logger.info("[OK] Created chat_messages table")

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
        cursor.execute("DROP TABLE IF EXISTS chat_messages")
        conn.commit()
        logger.info("[OK] Dropped chat_messages table")
    except Exception as e:
        logger.error(f"Downgrade failed: {e}")
        raise
    finally:
        if conn:
            conn.close()
