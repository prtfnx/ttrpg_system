"""
Add session_rules_json and game_mode columns to game_sessions table.
"""
import logging

import sqlalchemy as sa
from database.database import engine

logger = logging.getLogger(__name__)


def upgrade(db_path: str):
    with engine.connect() as conn:
        inspector = sa.inspect(conn)
        existing = [c["name"] for c in inspector.get_columns("game_sessions")]

        if "session_rules_json" not in existing:
            conn.execute(sa.text(
                "ALTER TABLE game_sessions ADD COLUMN session_rules_json TEXT DEFAULT '{}'"
            ))
            logger.info("Added session_rules_json column")

        if "game_mode" not in existing:
            conn.execute(sa.text(
                "ALTER TABLE game_sessions ADD COLUMN game_mode VARCHAR(20) DEFAULT 'free_roam'"
            ))
            logger.info("Added game_mode column")

        conn.commit()


def downgrade():
    # SQLite doesn't support DROP COLUMN — would need table rebuild
    logger.warning("Downgrade not supported for SQLite; columns remain.")


if __name__ == "__main__":
    import sys
    upgrade(sys.argv[1] if len(sys.argv) > 1 else "ttrpg.db")
