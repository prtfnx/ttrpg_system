"""Atomic session mode/rules replacement with original-intent settlement."""
import json
import math
from copy import deepcopy
from dataclasses import dataclass

from core_table.game_mode import GameMode
from core_table.session_rules import SessionRules
from database import models
from database.database import SessionLocal
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    find_receipt,
    lock_operation_session,
    session_actor_is_dm,
    stage_receipt,
)


def validated_rules(data, session_code, *, legacy=False):
    if not isinstance(data, dict):
        raise OperationRejected('Session rules must be an object')
    defaults = SessionRules.defaults(session_code).to_dict()
    if not legacy and (not data or set(data) - defaults.keys()):
        raise OperationRejected('A nonempty closed session rules replacement is required')
    values = {key: value for key, value in data.items() if key in defaults}
    if legacy and values.get('server_validation_tier') == 'trust_client':
        values['server_validation_tier'] = 'lightweight'
    tier = values.get('server_validation_tier', 'lightweight')
    if not isinstance(tier, str) or tier not in {'lightweight', 'full'}:
        raise OperationRejected('Unsupported server_validation_tier')
    for key, value in values.items():
        default = defaults[key]
        valid = True
        if isinstance(default, bool):
            valid = isinstance(value, bool)
        elif isinstance(default, str):
            valid = isinstance(value, str) and len(value) <= 128
        elif isinstance(default, (int, float)):
            valid = (not isinstance(value, bool) and isinstance(value, (int, float))
                and 0 <= value <= 1000000 and math.isfinite(value)
                and (not isinstance(default, int) or isinstance(value, int)))
        elif key == 'explore_round_timer':
            valid = value is None or type(value) is int and 1 <= value <= 1000000
        elif key == 'custom_rules':
            valid = isinstance(value, dict)
        if not valid:
            raise OperationRejected(f'Invalid session rule: {key}')
    rules = SessionRules.from_dict({**values, 'session_id': session_code})
    errors = rules.validate()
    if rules.critical_hit_rule not in {'double_dice', 'max_dice', 'double_total'}:
        errors.append('Unsupported critical_hit_rule')
    if errors:
        raise OperationRejected('; '.join(errors))
    return rules.to_dict()


@dataclass(frozen=True)
class SessionEditIntent:
    identity: OperationIdentity
    kind: str
    data: dict

    @classmethod
    def create(cls, session_id, actor_id, request_id, kind, data):
        identity = OperationIdentity.create(session_id, actor_id, 'session_settings', request_id,
            {'kind': kind, 'data': data})
        if kind == 'game_mode_change' and isinstance(data, dict) and set(data) == {'game_mode'}:
            if not isinstance(data['game_mode'], str):
                raise OperationRejected('A valid game_mode is required')
            try:
                GameMode(data['game_mode'])
            except ValueError as exc:
                raise OperationRejected('A valid game_mode is required') from exc
        elif kind == 'session_rules_update' and isinstance(data, dict) and set(data) == {'rules'}:
            validated_rules(data['rules'], 'validated')
        else:
            raise OperationRejected('A complete scoped session setting is required')
        return cls(identity, kind, deepcopy(data))


@dataclass(frozen=True)
class SessionEditResolution:
    committed: bool
    receipt: dict
    current: dict
    authorized: bool
    replayed: bool = True


@dataclass
class PendingSessionEdit:
    intent: SessionEditIntent
    accepted: bool = False


class SessionEditService:
    def __init__(self, factory=None):
        self.factory = factory or SessionLocal

    @staticmethod
    def _current(game):
        try:
            rules = validated_rules(json.loads(game.session_rules_json or '{}'), game.session_code, legacy=True)
            mode = GameMode(game.game_mode or 'free_roam').value
        except (ValueError, TypeError) as exc:
            raise OperationOutcomeUnknown('Stored session settings require repair') from exc
        return {'session_code': game.session_code, 'rules': rules, 'mode': mode}

    def execute(self, intent):
        with self.factory() as db, db.begin():
            game = lock_operation_session(db, intent.identity)
            receipt = find_receipt(db, intent.identity)
            if receipt is not None:
                return SessionEditResolution(True, receipt, self._current(game), True)
            if intent.kind == 'game_mode_change':
                game.game_mode = intent.data['game_mode']
            else:
                game.session_rules_json = json.dumps(validated_rules(intent.data['rules'], game.session_code))
            receipt = {'success': True, 'domain': 'session_settings',
                'operation_id': intent.identity.operation_id, 'setting': intent.kind}
            stage_receipt(db, intent.identity, receipt)
            return SessionEditResolution(True, receipt, self._current(game), True, False)

    def resolve(self, attempt):
        intent = attempt.intent
        with self.factory() as db:
            game = lock_operation_session(db, intent.identity, require_dm=False)
            receipt = find_receipt(db, intent.identity)
            if receipt is None and (attempt.accepted or db.get(models.User, intent.identity.actor_id) is None):
                raise OperationOutcomeUnknown('Missing receipt cannot prove session edit rollback')
            authorized = bool(game.is_active and session_actor_is_dm(db, game, intent.identity.actor_id))
            return SessionEditResolution(receipt is not None, receipt or {}, self._current(game), authorized)

    def load(self, session_id, actor_id):
        identity = OperationIdentity.create(session_id, actor_id, 'session_settings', 'read', {})
        with self.factory() as db:
            game = lock_operation_session(db, identity, require_dm=False)
            member = game.owner_id == actor_id or db.query(models.GamePlayer.id).filter_by(
                session_id=session_id, user_id=actor_id).first() is not None
            if not game.is_active or not member:
                raise OperationRejected('Current session membership is required', 'forbidden')
            return self._current(game)
