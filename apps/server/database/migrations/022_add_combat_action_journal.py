"""Add durable combat action journal and snapshot versions."""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        encounter_columns = {
            row[1] for row in cursor.execute("PRAGMA table_info(combat_encounters)")
        }
        if "state_version" not in encounter_columns:
            cursor.execute(
                "ALTER TABLE combat_encounters "
                "ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0"
            )

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS combat_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                encounter_id VARCHAR(36) NOT NULL
                    REFERENCES combat_encounters(encounter_id),
                requester_key VARCHAR(128) NOT NULL,
                sequence_id BIGINT NOT NULL,
                actor_id VARCHAR(36),
                command_type VARCHAR(50) NOT NULL,
                command_payload_json TEXT NOT NULL,
                result_payload_json TEXT NOT NULL,
                state_before_json TEXT NOT NULL,
                state_after_hash VARCHAR(64) NOT NULL,
                state_version INTEGER NOT NULL,
                created_by INTEGER REFERENCES users(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_combat_action_request
                    UNIQUE (encounter_id, requester_key, sequence_id)
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_combat_actions_encounter_id "
            "ON combat_actions (encounter_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_combat_actions_created_at "
            "ON combat_actions (created_at)"
        )
        conn.commit()
        logger.info("[OK] Added combat action journal")


def downgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        conn.execute("DROP TABLE IF EXISTS combat_actions")
        conn.commit()
        logger.info("[OK] Dropped combat action journal")
