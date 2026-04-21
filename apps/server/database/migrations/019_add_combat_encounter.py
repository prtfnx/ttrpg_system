"""Add combat_encounters table."""
import sqlalchemy as sa
from database.database import engine
import logging

logger = logging.getLogger(__name__)


def upgrade(db_path: str):
    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        if "combat_encounters" not in inspector.get_table_names():
            conn.execute(sa.text("""
                CREATE TABLE combat_encounters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    encounter_id VARCHAR(36) UNIQUE NOT NULL,
                    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
                    table_id VARCHAR(36) NOT NULL,
                    phase VARCHAR(20) DEFAULT 'inactive',
                    round_number INTEGER DEFAULT 0,
                    current_turn_index INTEGER DEFAULT 0,
                    combatants_json TEXT DEFAULT '[]',
                    settings_json TEXT DEFAULT '{}',
                    action_log_json TEXT DEFAULT '[]',
                    started_at DATETIME,
                    ended_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Created combat_encounters table")
        conn.commit()


def downgrade():
    with engine.connect() as conn:
        conn.execute(sa.text("DROP TABLE IF EXISTS combat_encounters"))
        conn.commit()


if __name__ == "__main__":
    import sys
    upgrade(sys.argv[1] if len(sys.argv) > 1 else "ttrpg.db")
