"""Stage an NPC source alongside its token and sprite receipt."""
import json

from database.models import SessionCharacter
from service.character_schema import validate_character_document


def stage_compendium_npc(db, session_id: int, actor_id: int, document: dict, changes: list[dict]) -> None:
    source = validate_character_document(document)
    character_id = source["character_id"]
    if len(changes) != 1 or changes[0]["before"] is not None or changes[0]["after"].get("character_id") != character_id:
        raise ValueError("NPC creation requires exactly one new linked token")
    if db.query(SessionCharacter.id).filter_by(character_id=character_id).first() is not None:
        raise ValueError("NPC identity already exists; reload before retrying")
    db.add(SessionCharacter(character_id=character_id, session_id=session_id, owner_user_id=actor_id,
        character_name=source["name"], character_data=json.dumps(source, ensure_ascii=False, allow_nan=False),
        version=1, last_modified_by=actor_id))
    db.flush()
