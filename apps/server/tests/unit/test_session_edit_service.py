"""Real SQL session settings acceptance and original-intent recovery."""
import json

import pytest
from database import models
from service.session_edit_service import PendingSessionEdit, SessionEditIntent, SessionEditService
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from sqlalchemy import event

from .test_table_edit_service import table_scene as table_scene


@pytest.fixture
def session_scene(table_scene):
    s = table_scene
    s.service = SessionEditService(s.factory)
    s.make_intent = lambda kind='game_mode_change', request_id='original', data=None: SessionEditIntent.create(
        s.session_id, s.actor_id, request_id, kind, ({'game_mode': 'explore'} if kind == 'game_mode_change'
            else {'rules': {'movement_mode': 'free', 'default_movement_speed': 45}}) if data is None else data)
    return s


@pytest.mark.parametrize('kind', ['game_mode_change', 'session_rules_update'])
@pytest.mark.parametrize('committed', [False, True])
def test_lost_reply_resolves_receipt_and_effect_together(session_scene, kind, committed):
    s = session_scene
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit response failure')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    intent = s.make_intent(kind)
    with pytest.raises(OSError):
        SessionEditService(factory).execute(intent)
    outcome = s.service.resolve(PendingSessionEdit(intent))
    assert outcome.committed is committed
    assert outcome.current['mode'] == ('explore' if committed and kind == 'game_mode_change' else 'free_roam')
    assert outcome.current['rules']['default_movement_speed'] == (45 if committed and kind == 'session_rules_update' else 30)
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == int(committed)
        assert db.query(models.Entity).one().position_x == 10


@pytest.mark.parametrize('kind', ['game_mode_change', 'session_rules_update'])
def test_replay_returns_current_policy_without_restoring_old_settings(session_scene, kind):
    s = session_scene
    intent = s.make_intent(kind)
    s.service.execute(intent)
    with s.factory() as db, db.begin():
        game = db.get(models.GameSession, s.session_id)
        game.game_mode = 'custom'
        game.session_rules_json = json.dumps({'default_movement_speed': 60})
    replay = s.service.execute(intent)
    assert replay.replayed and replay.current['mode'] == 'custom'
    assert replay.current['rules']['default_movement_speed'] == 60
    assert set(replay.receipt) == {'success', 'domain', 'operation_id', 'setting'}
    assert not replay.current['rules']['session_id'] == 'validated'


def test_trusted_session_code_and_complete_original_bind_replacement(session_scene):
    s = session_scene
    intent = s.make_intent('session_rules_update', data={'rules': {'session_id': 'forged', 'movement_mode': 'free'}})
    accepted = s.service.execute(intent)
    assert accepted.current['rules']['session_id'] == accepted.current['session_code'] != 'forged'
    assert accepted.current['rules']['default_movement_speed'] == 30
    with pytest.raises(OperationRejected, match='different input'):
        s.service.execute(s.make_intent('session_rules_update', data={'rules': {
            'session_id': accepted.current['session_code'], 'movement_mode': 'free'}}))
    with pytest.raises(OperationRejected, match='different input'):
        s.service.execute(s.make_intent())


@pytest.mark.parametrize('kind,data', [
    ('game_mode_change', {}), ('game_mode_change', {'game_mode': 'invalid'}),
    ('game_mode_change', {'game_mode': True}), ('game_mode_change', {'game_mode': 'fight', 'user_id': 1}),
    ('session_rules_update', {'rules': {}}), ('session_rules_update', {'rules': []}),
    ('session_rules_update', {'rules': {'unknown': True}}),
    *[('session_rules_update', {'rules': values}) for values in [
        {'walls_block_movement': 1}, {'default_movement_speed': '30'}, {'default_movement_speed': 0},
        {'default_movement_speed': float('nan')}, {'actions_per_turn': True}, {'actions_per_turn': 1.5},
        {'reactions_per_turn': -1}, {'explore_round_timer': False}, {'explore_round_timer': 0},
        {'movement_mode': 'invalid'}, {'custom_rules': []}, {'server_validation_tier': 'trust_client'},
        {'critical_hit_rule': 'invalid'}, {'custom_rules': {'large': 'x' * 9000}},
    ]],
])
def test_invalid_settings_do_not_create_effect_or_receipt(session_scene, kind, data):
    s = session_scene
    with pytest.raises(OperationRejected):
        s.service.execute(s.make_intent(kind, data=data))
    with s.factory() as db:
        assert not db.query(models.SessionOperationReceipt).count()
        assert db.get(models.GameSession, s.session_id).game_mode == 'free_roam'


def test_missing_known_receipt_remains_unknown_and_reads_fail_closed(session_scene):
    s = session_scene
    intent = s.make_intent()
    s.service.execute(intent)
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).delete()
    with pytest.raises(OperationOutcomeUnknown):
        s.service.resolve(PendingSessionEdit(intent, accepted=True))
    with s.factory() as db, db.begin():
        db.get(models.GameSession, s.session_id).session_rules_json = '{broken'
    with pytest.raises(OperationOutcomeUnknown):
        s.service.load(s.session_id, s.actor_id)


def test_current_database_authority_and_legacy_policy_reads(session_scene, player_user):
    s = session_scene
    intent = s.make_intent()
    s.service.execute(intent)
    with s.factory() as db, db.begin():
        game = db.get(models.GameSession, s.session_id)
        game.owner_id = player_user.id
        db.query(models.GamePlayer).filter_by(session_id=s.session_id, user_id=s.actor_id).delete()
        game.session_rules_json = json.dumps({'server_validation_tier': 'trust_client', 'old_metadata': True})
    outcome = s.service.resolve(PendingSessionEdit(intent))
    assert not outcome.authorized and outcome.current['rules']['server_validation_tier'] == 'lightweight'
    with pytest.raises(OperationRejected, match='DM authority'):
        s.service.execute(s.make_intent(request_id='new'))
    with pytest.raises(OperationRejected, match='membership'):
        s.service.load(s.session_id, s.actor_id)
