"""Current encounter membership fences legacy token identity/stat mutations."""
import json

from database.models import CombatEncounter
from sqlalchemy import or_

COMBAT_TOKEN_FIELDS = frozenset({'character_id', 'controlled_by', 'hp', 'max_hp', 'ac'})


class CombatTokenConflict(ValueError):
    pass


def active_combat_sprite_ids(db, session_id, table_id):
    """Caller owns the stable session barrier; include legacy unknown phases."""
    encounters = db.query(CombatEncounter).filter_by(session_id=session_id, table_id=table_id,
        ended_at=None).filter(or_(CombatEncounter.phase != 'inactive', CombatEncounter.phase.is_(None))).all()
    return {str(member['entity_id']) for encounter in encounters
        for member in json.loads(encounter.combatants_json or '[]')}


def guard_combat_token_changes(changes, combat_ids):
    for change in changes:
        if change['kind'] != 'sprite' or change['id'] not in combat_ids or change['before'] is None:
            continue
        before, after = change['before'], change['after']
        if after is None or any(before.get(field) != after.get(field) for field in COMBAT_TOKEN_FIELDS):
            raise CombatTokenConflict(
                'Active combat tokens must keep their character link, controllers and saved stats. '
                'Use combat commands for encounter stats and remove the combatant before deleting or rebinding its token.')
