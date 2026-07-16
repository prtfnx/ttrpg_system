"""Create server-authoritative resumable character drafts."""

import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS character_drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                draft_id VARCHAR(36) NOT NULL UNIQUE,
                session_id INTEGER NOT NULL
                    REFERENCES game_sessions(id) ON DELETE CASCADE,
                owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                draft_data TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 1,
                current_step INTEGER NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                converted_character_id VARCHAR(36)
                    REFERENCES session_characters(character_id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_by INTEGER REFERENCES users(id) ON DELETE SET NULL
            )
        """)
        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_character_drafts_draft_id ON character_drafts (draft_id)",
            "CREATE INDEX IF NOT EXISTS ix_character_drafts_session_id ON character_drafts (session_id)",
            "CREATE INDEX IF NOT EXISTS ix_character_drafts_owner_user_id ON character_drafts (owner_user_id)",
            "CREATE INDEX IF NOT EXISTS ix_character_drafts_status ON character_drafts (status)",
            "CREATE INDEX IF NOT EXISTS ix_character_drafts_updated_at ON character_drafts (updated_at)",
        ):
            connection.execute(statement)
        connection.commit()
    logger.info("[OK] Added resumable character drafts")


def downgrade(db_path: str):
    logger.warning("Character draft persistence is intentionally irreversible")
