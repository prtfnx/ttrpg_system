"""Worker-owned database fallback for unloaded sprite control checks."""

import json

from database.database import SessionLocal
from database.models import CharacterPermission, Entity, SessionCharacter, VirtualTable


def controller_ids(value: object) -> set[int]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return set()
    if not isinstance(value, list):
        return set()
    return {int(item) for item in value
            if not isinstance(item, bool) and str(item).lstrip('-').isdigit()}


def can_control_persisted_sprite(session_id: int, sprite_id: str, user_id: int) -> bool:
    with SessionLocal() as db:
        entity = db.query(Entity).join(VirtualTable, Entity.table_id == VirtualTable.id).filter(
            Entity.sprite_id == sprite_id, VirtualTable.session_id == session_id,
        ).one_or_none()
        if entity is None:
            return False
        controllers = controller_ids(entity.controlled_by)
        if not controllers:  # Empty/malformed control metadata is DM-only.
            return False
        if user_id in controllers:
            return True
        if not entity.character_id:
            return False
        character = db.query(SessionCharacter).filter(
            SessionCharacter.character_id == entity.character_id,
            SessionCharacter.session_id == session_id,
            SessionCharacter.archived_at.is_(None),
        ).one_or_none()
        if character is None:
            return False
        if character.owner_user_id == user_id:
            return True
        return db.query(CharacterPermission.id).filter(
            CharacterPermission.character_id == character.character_id,
            CharacterPermission.session_id == session_id,
            CharacterPermission.user_id == user_id,
            CharacterPermission.can_control.is_(True),
        ).first() is not None
