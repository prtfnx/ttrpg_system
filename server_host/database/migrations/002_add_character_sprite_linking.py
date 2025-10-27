"""
Migration: Add character <-> sprite linking and character versioning
Date: 2025-10-27
Description: Adds `character_id` and `controlled_by` columns to `entities` and
`version` and `last_modified_by` columns to `session_characters` to support
linking tokens to characters and optimistic versioning/audit.

Notes:
- SQLite cannot add FOREIGN KEY constraints to an existing table via ALTER TABLE,
  so this migration only adds the new columns. If you need an enforced FK, you
  must recreate the table and copy data.
"""
import sqlite3
import os
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    """Apply the migration: add columns if they don't already exist."""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # --- ENTITIES table ---
        cursor.execute("PRAGMA table_info(entities)")
        existing_cols = [row[1] for row in cursor.fetchall()]

        if 'character_id' not in existing_cols:
            logger.info("Adding character_id column to entities table")
            cursor.execute('''
                ALTER TABLE entities
                ADD COLUMN character_id VARCHAR(36)
            ''')
            logger.info(" character_id column added")
        else:
            logger.info("⏭  entities.character_id already exists")

        if 'controlled_by' not in existing_cols:
            logger.info("Adding controlled_by column to entities table")
            cursor.execute('''
                ALTER TABLE entities
                ADD COLUMN controlled_by TEXT
            ''')
            logger.info(" controlled_by column added")
        else:
            logger.info("⏭  entities.controlled_by already exists")

        # --- SESSION_CHARACTERS table ---
        cursor.execute("PRAGMA table_info(session_characters)")
        sc_cols = [row[1] for row in cursor.fetchall()]

        if 'version' not in sc_cols:
            logger.info("Adding version column to session_characters table")
            cursor.execute('''
                ALTER TABLE session_characters
                ADD COLUMN version INTEGER DEFAULT 1
            ''')
            # Initialize existing rows to version 1 explicitly
            cursor.execute("UPDATE session_characters SET version = 1 WHERE version IS NULL")
            logger.info(" version column added and initialized")
        else:
            logger.info("⏭  session_characters.version already exists")

        if 'last_modified_by' not in sc_cols:
            logger.info("Adding last_modified_by column to session_characters table")
            cursor.execute('''
                ALTER TABLE session_characters
                ADD COLUMN last_modified_by INTEGER
            ''')
            logger.info(" last_modified_by column added")
        else:
            logger.info("⏭  session_characters.last_modified_by already exists")

        conn.commit()
        conn.close()
        logger.info(" Migration 002_add_character_sprite_linking completed successfully")
        return True

    except Exception as e:
        logger.error(f" Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise


def downgrade(db_path: str):
    """
    Downgrade is not implemented for SQLite (requires table recreation to drop columns).
    Please restore from backup if you need to rollback.
    """
    logger.warning("Downgrade not implemented for SQLite (requires table recreation)")
    logger.info("To rollback, restore from backup or recreate the database")
    return False


if __name__ == '__main__':
    import sys
    import shutil
    import time

    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))
    from server_host.database.database import DB_PATH

    print(f"Running migration on database: {DB_PATH}")

    if not os.path.exists(DB_PATH):
        print(f" Database not found at {DB_PATH}")
        print("Run the server first to create the database.")
        sys.exit(1)

    backup_path = f"{DB_PATH}.backup_{int(time.time())}"
    print(f"Creating backup: {backup_path}")
    shutil.copy2(DB_PATH, backup_path)

    try:
        upgrade(DB_PATH)
        print(" Migration completed successfully!")
    except Exception as e:
        print(f" Migration failed: {e}")
        print(f"Backup available at: {backup_path}")
        sys.exit(1)
