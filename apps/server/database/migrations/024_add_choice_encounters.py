"""Add durable choice encounter snapshots and event log."""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS choice_encounters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                encounter_id VARCHAR(36) NOT NULL UNIQUE,
                session_id INTEGER NOT NULL REFERENCES game_sessions(id),
                session_code VARCHAR(20) NOT NULL,
                table_id VARCHAR(36),
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                phase VARCHAR(30) NOT NULL,
                state_json TEXT NOT NULL,
                participants_json TEXT NOT NULL DEFAULT '[]',
                choices_json TEXT NOT NULL DEFAULT '[]',
                dm_notes TEXT NOT NULL DEFAULT '',
                created_by INTEGER REFERENCES users(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                version INTEGER NOT NULL DEFAULT 0
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_choice_encounters_session_active "
            "ON choice_encounters (session_id, ended_at, id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_choice_encounters_session_code "
            "ON choice_encounters (session_code)"
        )
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS choice_encounter_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                encounter_id VARCHAR(36) NOT NULL,
                sequence INTEGER NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                actor_id VARCHAR(128),
                payload_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_choice_encounter_event_sequence
                    UNIQUE (encounter_id, sequence)
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_choice_encounter_events_encounter_id "
            "ON choice_encounter_events (encounter_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_choice_encounter_events_created_at "
            "ON choice_encounter_events (created_at)"
        )
        conn.commit()
        logger.info("[OK] Added choice encounter persistence")


def downgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        conn.execute("DROP TABLE IF EXISTS choice_encounter_events")
        conn.execute("DROP TABLE IF EXISTS choice_encounters")
        conn.commit()
        logger.info("[OK] Dropped choice encounter persistence")
