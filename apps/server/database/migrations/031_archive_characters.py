"""Add durable character archival metadata."""

import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def _column_names(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[1])
        for row in connection.execute("PRAGMA table_info(session_characters)").fetchall()
    }


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as connection:
        columns = _column_names(connection)
        if "archived_at" not in columns:
            connection.execute(
                "ALTER TABLE session_characters ADD COLUMN archived_at TIMESTAMP NULL"
            )
        if "archived_by" not in columns:
            connection.execute(
                """
                ALTER TABLE session_characters
                ADD COLUMN archived_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
                """
            )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_session_characters_archived_at
            ON session_characters (archived_at)
            """
        )
        connection.commit()
    logger.info("[OK] Added character archival metadata")


def downgrade(db_path: str):
    logger.warning("Character archival metadata is intentionally irreversible")
