"""Normalize character sharing into an authorization table."""

import json
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS character_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id VARCHAR(36) NOT NULL
                    REFERENCES session_characters(character_id) ON DELETE CASCADE,
                session_id INTEGER NOT NULL
                    REFERENCES game_sessions(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                can_view BOOLEAN NOT NULL DEFAULT 1,
                can_edit BOOLEAN NOT NULL DEFAULT 0,
                can_control BOOLEAN NOT NULL DEFAULT 0,
                granted_by INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_character_permission_user UNIQUE (character_id, user_id)
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_character_permissions_character_id "
            "ON character_permissions (character_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_character_permissions_session_id "
            "ON character_permissions (session_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_character_permissions_user_id "
            "ON character_permissions (user_id)"
        )

        rows = cursor.execute("""
            SELECT character_id, session_id, owner_user_id, character_data
            FROM session_characters
        """).fetchall()
        for character_id, session_id, owner_id, raw_character in rows:
            try:
                controlled_by = json.loads(raw_character or "{}").get("controlledBy", [])
            except (TypeError, json.JSONDecodeError):
                controlled_by = []
            if not isinstance(controlled_by, list):
                continue
            for raw_user_id in controlled_by:
                try:
                    user_id = int(raw_user_id)
                except (TypeError, ValueError):
                    continue
                if user_id == owner_id:
                    continue
                member = cursor.execute(
                    "SELECT 1 FROM game_players WHERE session_id = ? AND user_id = ?",
                    (session_id, user_id),
                ).fetchone()
                if member:
                    cursor.execute("""
                        INSERT OR IGNORE INTO character_permissions (
                            character_id, session_id, user_id,
                            can_view, can_edit, can_control, granted_by
                        ) VALUES (?, ?, ?, 1, 1, 1, ?)
                    """, (character_id, session_id, user_id, owner_id))
        conn.commit()
        logger.info("[OK] Normalized character sharing permissions")


def downgrade(db_path: str):
    logger.warning("Normalized character permissions are intentionally irreversible")
