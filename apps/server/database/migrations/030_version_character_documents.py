"""Backfill and validate the versioned character-document envelope."""

import json
import sqlite3

from service.character_schema import validate_character_document
from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            "SELECT character_id, character_name, character_data FROM session_characters"
        ).fetchall()
        for character_id, character_name, raw_document in rows:
            try:
                document = json.loads(raw_document)
            except (TypeError, json.JSONDecodeError) as exc:
                raise ValueError(f"Character {character_id} contains invalid JSON") from exc
            if not isinstance(document, dict):
                raise ValueError(f"Character {character_id} must contain a JSON object")
            document.setdefault("character_id", character_id)
            document.setdefault("name", character_name or "Unnamed Character")
            migrated = validate_character_document(document)
            connection.execute(
                "UPDATE session_characters SET character_data = ? WHERE character_id = ?",
                (json.dumps(migrated, separators=(",", ":")), character_id),
            )
        connection.commit()
    logger.info("[OK] Versioned and validated character documents")


def downgrade(db_path: str):
    logger.warning("Character document schema versioning is intentionally irreversible")
