"""Choice transition acceptance and fresh settlement behind the session barrier."""
import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from database.models import ChoiceEncounter, GamePlayer, User, VirtualTable
from service.encounter_engine import EncounterEngine
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    bounded_json,
    find_receipt,
    lock_operation_session,
    stage_receipt,
)
from utils.roles import is_dm

KINDS = {'encounter_start': 'EncounterStarted', 'encounter_end': 'EncounterEnded',
         'encounter_choice': 'ChoiceSelected', 'encounter_roll': 'RollResolved'}


class ChoiceOperationRejected(OperationRejected):
    def __init__(self, message, code='invalid_payload', *, not_accepted=False):
        super().__init__(message, code)
        self.not_accepted = not_accepted


def _text(value, limit, *, required=False):
    if not isinstance(value, str) or len(value) > limit or required and not value.strip():
        raise OperationRejected('Invalid bounded encounter text or identity')
    return value


@dataclass(frozen=True)
class ChoiceIntent:
    identity: OperationIdentity
    kind: str
    payload: dict

    @classmethod
    def create(cls, session_id, actor_id, request_id, kind, payload):
        if kind not in KINDS or not isinstance(payload, dict):
            raise OperationRejected('Invalid choice transition')
        allowed = ({'title', 'description', 'choices', 'participants', 'dm_notes', 'table_id'} if kind == 'encounter_start'
                   else {'encounter_id', 'choice_id', 'bonus'} if kind == 'encounter_roll'
                   else {'encounter_id', 'choice_id'} if kind == 'encounter_choice' else {'encounter_id'})
        if not payload.keys() <= allowed:
            raise OperationRejected('Unexpected choice transition fields')
        data = deepcopy(payload)
        if kind == 'encounter_start':
            for key, default, limit in (('title', 'Encounter', 255), ('description', '', 16000),
                                       ('dm_notes', '', 16000), ('table_id', '', 36)):
                data[key] = _text(data.get(key, default), limit, required=key == 'title')
            choices, participants = data.get('choices'), data.get('participants', [])
            if not isinstance(choices, list) or not 1 <= len(choices) <= 64:
                raise OperationRejected('choices required (1 to 64)')
            ids = set()
            for choice in choices:
                if (not isinstance(choice, dict) or not choice.keys() <=
                        {'choice_id', 'text', 'requires_roll', 'roll_ability', 'roll_skill', 'roll_dc'}):
                    raise OperationRejected('Invalid encounter choice fields')
                _text(choice.get('text'), 4000, required=True)
                if 'choice_id' in choice:
                    choice_id = _text(choice['choice_id'], 64, required=True)
                    if choice_id in ids:
                        raise OperationRejected('Choice identities must be unique')
                    ids.add(choice_id)
                if not isinstance(choice.get('requires_roll', False), bool):
                    raise OperationRejected('requires_roll must be boolean')
                for key in ('roll_ability', 'roll_skill'):
                    if choice.get(key) is not None:
                        _text(choice[key], 64)
                dc = choice.get('roll_dc')
                if dc is not None and (isinstance(dc, bool) or not isinstance(dc, int) or not 1 <= dc <= 100):
                    raise OperationRejected('Roll DC must be an integer from 1 to 100')
                if choice.get('requires_roll') and dc is None:
                    raise OperationRejected('A required roll needs a DC')
            if not isinstance(participants, list) or len(participants) > 100:
                raise OperationRejected('Participants must be a bounded list')
            data['participants'] = [_text(item, 128, required=True) for item in participants]
        else:
            _text(data.get('encounter_id'), 36, required=True)
            if kind == 'encounter_choice':
                _text(data.get('choice_id'), 64, required=True)
            if kind == 'encounter_roll':
                if 'choice_id' in data:
                    _text(data['choice_id'], 64, required=True)
                bonus = data.setdefault('bonus', 0)
                if isinstance(bonus, bool) or not isinstance(bonus, int) or not -1000 <= bonus <= 1000:
                    raise OperationRejected('bonus must be an integer from -1000 to 1000')
        digest = hashlib.sha256(bounded_json({'kind': kind, 'payload': data}, 65536).encode()).hexdigest()
        identity = OperationIdentity.create(session_id, actor_id, 'choice_encounter', request_id, {'intent_digest': digest})
        return cls(identity, kind, data)


@dataclass(frozen=True)
class ChoiceOutcome:
    receipt: dict | None
    current: dict | None
    session_code: str
    role: str | None
    replayed: bool = True


class ChoiceOperationService:
    def __init__(self, store):
        self.store = store

    @staticmethod
    def _role(db, game, intent):
        if not game.is_active:
            return None
        role = ('owner' if game.owner_id == intent.identity.actor_id else
                db.query(GamePlayer.role).filter_by(session_id=game.id, user_id=intent.identity.actor_id).scalar())
        if role not in ('owner', 'co_dm', 'trusted_player', 'player'):
            return None
        return role if intent.kind not in ('encounter_start', 'encounter_end') or is_dm(role) else None

    @staticmethod
    def _current(db, game):
        rows = db.query(ChoiceEncounter).filter_by(session_id=game.id, ended_at=None).with_for_update().all()
        if len(rows) > 1:
            raise OperationOutcomeUnknown('Multiple active choice sources require reconciliation')
        if not rows:
            return None
        snapshot = json.loads(rows[0].state_json)
        bounded_json(snapshot, 256 * 1024)
        if snapshot.get('session_id') != game.session_code or snapshot.get('encounter_id') != rows[0].encounter_id:
            raise OperationOutcomeUnknown('Choice source identity does not match its session')
        return snapshot

    def lookup(self, intent: ChoiceIntent, *, internal=False) -> ChoiceOutcome:
        try:
            with self.store._session_factory() as db:
                game = lock_operation_session(db, intent.identity, require_dm=False)
                role = self._role(db, game, intent)
                if role is None and not internal:
                    raise ChoiceOperationRejected('Current encounter authority is required', 'forbidden')
                receipt = find_receipt(db, intent.identity)
                if receipt is None and db.get(User, intent.identity.actor_id) is None:
                    raise OperationOutcomeUnknown('Actor receipt history disappeared')
                return ChoiceOutcome(receipt, self._current(db, game), game.session_code, role)
        except ChoiceOperationRejected:
            raise
        except Exception as exc:
            raise OperationOutcomeUnknown('Choice outcome lookup is unavailable') from exc

    def execute(self, intent: ChoiceIntent) -> ChoiceOutcome:
        commit_started, lookup_complete = False, False
        try:
            with self.store._session_factory() as db:
                game = lock_operation_session(db, intent.identity, require_dm=False)
                role = self._role(db, game, intent)
                if role is None:
                    raise OperationRejected('Current encounter authority is required', 'forbidden')
                receipt = find_receipt(db, intent.identity)
                if receipt is not None:
                    return ChoiceOutcome(receipt, self._current(db, game), game.session_code, role)
                lookup_complete = True
                current = self._current(db, game)
                draft = EncounterEngine.detached(current)
                payload, code, actor = intent.payload, game.session_code, str(intent.identity.actor_id)
                if intent.kind == 'encounter_start':
                    if current is not None:
                        raise OperationRejected('An active encounter already exists', 'conflict')
                    if payload['table_id'] and not db.query(VirtualTable.id).filter_by(
                            session_id=game.id, table_id=payload['table_id']).first():
                        raise OperationRejected('Table not found in this session', 'forbidden')
                    encounter = draft.create(code, payload['title'], payload['description'], payload['choices'],
                        payload['participants'], dm_notes=payload['dm_notes'], table_id=payload['table_id'])
                    result: dict[str, Any] = {}
                elif intent.kind == 'encounter_end':
                    encounter = draft.end_encounter(code, payload['encounter_id'])
                    result = {'ended': True}
                else:
                    if intent.kind == 'encounter_roll':
                        expected_choice = (current or {}).get('pending_rolls', {}).get(actor, {}).get('choice_id')
                        if 'choice_id' in payload and payload['choice_id'] != expected_choice:
                            raise OperationRejected('Stale roll choice', 'conflict')
                        result = draft.submit_roll(code, actor, payload['bonus'], payload['encounter_id'])
                    else:
                        result = draft.submit_choice(code, actor, payload['choice_id'], payload['encounter_id'])
                    if 'error' in result:
                        raise OperationRejected(result['error'], 'conflict')
                    encounter = draft.get(code)
                    result = {key: value for key, value in result.items() if key != 'encounter'}
                    result['player_id'] = actor
                if encounter is None:
                    raise OperationRejected('No matching active encounter', 'conflict')
                snapshot = deepcopy(encounter.to_dict(dm=True))
                bounded_json(snapshot, 256 * 1024)
                receipt = {**result, 'operation_id': intent.identity.operation_id, 'encounter_id': encounter.encounter_id,
                    'accepted_version': encounter.version, 'kind': intent.kind, 'accepted': True}
                self.store.stage_snapshot(db, session_code=code, encounter=snapshot,
                    event_type=KINDS[intent.kind], actor_id=actor, payload=receipt, created_by=intent.identity.actor_id)
                stage_receipt(db, intent.identity, receipt)
                outcome = ChoiceOutcome(receipt, None if result.get('ended') else snapshot, code, role, replayed=False)
                commit_started = True
                db.commit()
                return outcome
        except OperationRejected as exc:
            if not commit_started:
                raise ChoiceOperationRejected(str(exc), exc.code, not_accepted=lookup_complete) from exc
        except Exception as exc:
            if not commit_started and lookup_complete and not isinstance(exc, OperationOutcomeUnknown):
                raise ChoiceOperationRejected('Encounter could not be saved', 'persistence_failed', not_accepted=True) from exc
        # The caller retains original identity/cache ownership until fresh lookup
        # proves receipt presence/absence behind the original transaction barrier.
        raise OperationOutcomeUnknown('Choice acceptance needs fresh settlement')
