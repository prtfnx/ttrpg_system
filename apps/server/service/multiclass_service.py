"""Original-intent multiclass acceptance using the shared character transaction."""
import json
from copy import deepcopy
from dataclasses import dataclass

from database.models import CharacterLog
from service.character_rules import multiclass_prerequisites
from service.character_schema import validate_character_document
from service.character_update_service import (
    CharacterUpdateIntent,
    CharacterUpdateService,
    StagedCharacterUpdateRejected,
    validate_character_target,
)
from service.session_operation_receipts import OperationIdentity, OperationRejected


@dataclass(frozen=True)
class MulticlassIntent(CharacterUpdateIntent):
    new_class: str = ''

    @classmethod
    def from_request(cls, session_id, actor_id, request_id, data):
        if not isinstance(data, dict) or not data.keys() <= {'character_id', 'new_class', 'version'}:
            raise OperationRejected('Invalid multiclass request fields')
        character_id, expected = data.get('character_id'), data.get('version')
        validate_character_target(character_id, expected)
        assert isinstance(character_id, str)
        new_class = data.get('new_class')
        if not isinstance(new_class, str) or not 1 <= len(new_class) <= 32:
            raise OperationRejected('new_class is required (up to 32 characters)')
        new_class = new_class.strip().lower()
        if multiclass_prerequisites(new_class) is None:
            raise OperationRejected('Unknown multiclass target')
        payload = dict(character_id=character_id, new_class=new_class, version=expected)
        identity = OperationIdentity.create(session_id, actor_id, 'character_multiclass', request_id, payload)
        return cls(identity, character_id, {}, expected, new_class=new_class)


def prepare_multiclass_update(raw, new_class, validate):
    """Preserve pinned prerequisites/legacy primary levels; never guess a split."""
    document = validate_character_document(raw)
    data = document['data']
    migrated, removals = {}, {}
    if not data.get('classes') and not data.get('class') and (raw.get('classes') or raw.get('class')):
        for key in ('class', 'classes', 'level', 'abilityScores', 'ability_scores'):
            if key in raw:
                if key in data and data[key] != raw[key]:
                    raise ValueError('Legacy advancement fields disagree; normalize them before multiclassing')
                migrated[key] = data[key] = deepcopy(raw[key])
                removals[key] = None
    classes = data.get('classes') or []
    if not isinstance(classes, list):
        raise ValueError('Stored classes must be a list')
    if not classes:
        names = [name.strip().lower() for name in str(data.get('class') or '').split('/') if name.strip()]
        if len(names) != 1:
            raise ValueError('Legacy multiclass data must be normalized before adding another class')
        classes = [{'name': names[0], 'level': data.get('level', 1)}]
    names, total = set(), 0
    for entry in classes:
        if not isinstance(entry, dict) or not isinstance(entry.get('name'), str) or not entry['name'].strip():
            raise ValueError('Stored class names must be explicit')
        name, level = entry['name'].strip().lower(), entry.get('level')
        if name in names or isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= 20:
            raise ValueError('Stored class levels or names require normalization')
        names.add(name)
        entry['name'] = name
        total += level
    declared = data.get('level', total)
    if isinstance(declared, bool) or not isinstance(declared, int) or declared != total:
        raise ValueError('Class levels disagree with total level; resolve pending advancement before multiclassing')
    data['classes'] = classes
    valid, error = validate(document, new_class)
    if not valid:
        raise ValueError(error)
    classes.append({'name': new_class, 'level': 1})
    return {**removals, 'data': {**migrated, 'classes': classes, 'level': total + 1}}


class MulticlassService(CharacterUpdateService):
    def __init__(self, session_factory, stage, recovery, validate):
        super().__init__(session_factory, stage, recovery)
        self._validate = validate

    def _stage_intent(self, db, source, intent, dm):
        if not isinstance(intent, MulticlassIntent):
            raise OperationRejected('A multiclass intent is required')
        try:
            patch = prepare_multiclass_update(json.loads(source.character_data), intent.new_class, self._validate)
        except (ValueError, TypeError) as exc:
            raise StagedCharacterUpdateRejected({'success': False, 'error': str(exc), 'code': 'invalid_payload'}) from exc
        result = self._stage(db, intent.identity.session_id, intent.character_id, patch, intent.identity.actor_id,
            expected_version=intent.expected_version if intent.expected_version is not None else source.version,
            bypass_owner_check=dm, allow_advancement_updates=True)
        inner = result['character_data'].get('data', result['character_data'])
        accepted_level = patch.get('data', patch)['level']
        db.add(CharacterLog(character_id=intent.character_id, session_id=intent.identity.session_id,
            user_id=intent.identity.actor_id, action_type='multiclass', description=f'Added {intent.new_class} level 1'))
        return {**result, 'new_class': intent.new_class, 'accepted_level': accepted_level,
                'applied_updates': patch, 'classes': deepcopy(inner.get('classes', patch.get('classes', [])))}

    def _receipt(self, intent, result):
        return {**super()._receipt(intent, result), 'new_class': result['new_class'],
                'accepted_level': result['accepted_level']}
