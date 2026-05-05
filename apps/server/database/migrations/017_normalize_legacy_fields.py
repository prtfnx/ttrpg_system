"""
Migration: Normalize legacy fields
Date: 2025-01-30
Description:
  - session_characters.character_data: promote flat ability scores to abilityScores dict
  - session_characters.character_data: ensure character_id key exists (copy from row PK if missing)
  - session_characters.character_data: normalize legacy `id` key to `character_id` when absent
  - entities.controlled_by: ensure value is always a JSON array string (not plain string/int)
"""
import json
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)

_ABILITY_KEYS = ("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma")


def _normalize_character(row_id: str, data: dict) -> tuple[dict, list[str]]:
    """Return (updated_data, list_of_changes). Does not mutate input."""
    changes: list[str] = []
    d = dict(data)

    # Promote legacy `id` to `character_id` if character_id absent but `id` exists
    if "character_id" not in d and "id" in d:
        d["character_id"] = d["id"]
        changes.append("promoted id -> character_id")

    # Add character_id from row PK if still missing
    if "character_id" not in d:
        d["character_id"] = row_id
        changes.append("added character_id from row PK")

    # Normalize flat ability scores to nested abilityScores dict
    has_flat = any(isinstance(d.get(k), int) for k in _ABILITY_KEYS)
    if has_flat and "abilityScores" not in d:
        d["abilityScores"] = {k: d.pop(k) for k in _ABILITY_KEYS if k in d}
        changes.append("promoted flat ability scores -> abilityScores")
    elif has_flat and "abilityScores" in d:
        # abilityScores already exists; just remove the redundant top-level keys
        for k in _ABILITY_KEYS:
            d.pop(k, None)
        changes.append("removed duplicate flat ability score keys")

    return d, changes


def _normalize_controlled_by(value: str | None) -> tuple[str | None, bool]:
    """Return (normalized_json_string, changed). None stays None."""
    if value is None:
        return None, False

    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return value, False  # already correct format
        # Wrap non-list JSON value in an array
        return json.dumps([str(parsed)]), True
    except (json.JSONDecodeError, TypeError):
        # Plain non-JSON string — wrap as single-element array
        stripped = value.strip()
        if stripped == "":
            return "[]", stripped != value
        return json.dumps([stripped]), True


def upgrade(db_path: str):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # --- session_characters ---
        rows = cursor.execute("SELECT character_id, character_data FROM session_characters").fetchall()
        char_updated = 0
        for row_id, cdata in rows:
            try:
                d = json.loads(cdata)
                updated, changes = _normalize_character(row_id, d)
                if changes:
                    cursor.execute(
                        "UPDATE session_characters SET character_data = ? WHERE character_id = ?",
                        (json.dumps(updated), row_id),
                    )
                    char_updated += 1
                    logger.info(f"  char {row_id}: {', '.join(changes)}")
            except Exception as e:
                logger.warning(f"  skip char {row_id}: {e}")

        # --- entities.controlled_by ---
        rows = cursor.execute("SELECT entity_id, controlled_by FROM entities").fetchall()
        ent_updated = 0
        for eid, cb in rows:
            normalized, changed = _normalize_controlled_by(cb)
            if changed:
                cursor.execute(
                    "UPDATE entities SET controlled_by = ? WHERE entity_id = ?",
                    (normalized, eid),
                )
                ent_updated += 1
                logger.info(f"  entity {eid}: controlled_by {cb!r} -> {normalized!r}")

        conn.commit()
        logger.info(f"[OK] Migration 017 complete: {char_updated} chars, {ent_updated} entities updated")
    except Exception as e:
        logger.error(f"[FAIL] Migration 017 failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def downgrade(db_path: str):
    logger.warning("Downgrade not supported for migration 017 (data normalization is irreversible)")


if __name__ == "__main__":
    import sys
    upgrade(sys.argv[1] if len(sys.argv) > 1 else "ttrpg.db")
