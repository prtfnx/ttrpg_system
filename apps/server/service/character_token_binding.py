"""Validate new character links and prepare projections inside a sprite transaction."""
import json

from database.models import SessionCharacter
from managers.character_manager import ServerCharacterManager
from service.character_schema import validate_character_document

STAT_FIELDS = {"hp": "hp", "max_hp": "maxHp", "ac": "ac"}


class CharacterBindingError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def prepare_character_bindings(db, changes, session_id: int, actor_id: int, *, bypass_owner_check: bool = False):
    """Mutate provisional deltas only; the caller owns commit and publication.

    Character stats are authoritative for linked tokens. Attaching a token copies
    current source stats without editing the source/version or other projections.
    Detaching leaves independent stats, and existing links may move normally.
    """
    projected = {}
    for change in changes:
        before, after = change["before"], change["after"]
        if change["kind"] != "sprite" or after is None:
            continue
        character_id = after.get("character_id")
        if character_id is None:
            continue
        if not isinstance(character_id, str) or not character_id.strip() or len(character_id) > 64:
            raise CharacterBindingError("invalid_payload", "Character identity must be nonempty text up to 64 characters")
        if before is not None and before.get("character_id") == character_id:
            if any(before.get(field) != after.get(field) for field in STAT_FIELDS):
                raise CharacterBindingError("conflict", "Linked stats must be edited with character_update")
            continue
        source = db.query(SessionCharacter).filter_by(session_id=session_id, character_id=character_id,
            archived_at=None).with_for_update().one_or_none()
        if source is None or not ServerCharacterManager._can_edit(db, source, actor_id, bypass_owner_check):
            raise CharacterBindingError("forbidden", "Character not found or edit permission denied")
        try:
            document = validate_character_document(json.loads(source.character_data))
        except (ValueError, TypeError) as exc:
            raise CharacterBindingError("invalid_payload", "Linked character data is invalid") from exc
        stats = document.get("data", {}).get("stats") or {}
        legacy_locations = [document, document.get("stats") or {}, document.get("data") or {}]
        if any(name not in stats and any(isinstance(location, dict) and (name in location or field in location)
               for location in legacy_locations) for field, name in STAT_FIELDS.items()):
            raise CharacterBindingError("conflict", "Migrate legacy character stats to data.stats before binding")
        values = {field: stats.get(name) for field, name in STAT_FIELDS.items()}
        after.update(values)
        projected[change["id"]] = values
    return projected
