"""Acceptance, replay and current-state recovery use real owned SQL sessions."""
import copy
from types import SimpleNamespace

import pytest
from core_table.server import TableManager
from database import crud, models
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.wall_command_service import PendingWallCommand, WallCommandIntent, WallCommandService
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def wall_scene(test_db, test_db_engine, test_game_session, test_user):
    manager = TableManager(test_db)
    table = manager.create_table('Walls', 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    scope = SimpleNamespace(manager=manager, table=table, table_id=str(table.table_id),
        session_id=test_game_session.id, actor_id=test_user.id, factory=sessionmaker(bind=test_db_engine))
    scope.service = WallCommandService(scope.factory)
    scope.intent = lambda kind='wall_create', request_id='original', **data: WallCommandIntent.create(
        scope.session_id, scope.actor_id, request_id, kind, {'table_id': scope.table_id, **(
            {'wall_data': {'x1': 0, 'y1': 0, 'x2': 50, 'y2': 60, 'is_door': True}}
            if kind == 'wall_create' else {}), **data})
    return scope


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('kind', ['wall_create', 'wall_update', 'wall_remove', 'door_toggle'])
def test_lost_commit_response_settles_from_receipt_and_current_rows(wall_scene, committed, kind):
    s = wall_scene
    wall_id = s.service.execute(s.intent(request_id='seed')).receipt['wall_id']
    data = {} if kind == 'wall_create' else {'wall_id': wall_id}
    if kind == 'wall_update':
        data['updates'] = {'x2': 80}
    intent = s.intent(kind, **data)

    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit response error')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db

    with pytest.raises(OSError):
        WallCommandService(factory).execute(intent)
    outcome = s.service.resolve(PendingWallCommand(intent))
    assert outcome.committed is committed
    if kind == 'wall_create':
        assert (outcome.wall is not None) is committed
    elif kind == 'wall_remove':
        assert (outcome.wall is None) is committed
    elif kind == 'wall_update':
        assert outcome.wall['x2'] == (80 if committed else 50)
    else:
        assert outcome.wall['door_state'] == ('open' if committed else 'closed')
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1 + int(committed)


def test_repeated_toggle_and_create_do_not_repeat_effects_or_return_old_rows(wall_scene):
    s = wall_scene
    create = s.intent()
    first = s.service.execute(create)
    wall_id = first.receipt['wall_id']
    toggle = s.intent('door_toggle', 'toggle', wall_id=wall_id)
    assert s.service.execute(toggle).wall['door_state'] == 'open'
    assert s.service.execute(toggle).wall['door_state'] == 'open'
    s.service.execute(s.intent('wall_update', 'later', wall_id=wall_id, updates={'x2': 150}))
    replay = s.service.execute(create)
    assert replay.replayed and replay.wall['x2'] == 150
    assert 'wall' not in replay.receipt and 'door_state' not in replay.receipt
    s.service.execute(s.intent('wall_remove', 'remove', wall_id=wall_id))
    assert s.service.execute(create).wall is None
    assert s.service.execute(toggle).wall is None
    with s.factory() as db:
        assert db.query(models.Wall).count() == 0


def test_complete_input_and_message_kind_are_bound_to_original_identity(wall_scene):
    s = wall_scene
    original = s.intent()
    s.service.execute(original)
    changed = copy.deepcopy(original.patch)
    changed['x2'] = 90
    with pytest.raises(OperationRejected, match='different input'):
        s.service.execute(s.intent(wall_data=changed))
    with pytest.raises(OperationRejected, match='different input'):
        s.service.execute(s.intent('door_toggle', wall_id=original.wall_id))


def test_worker_authorizes_current_membership_and_locked_door_from_sql(wall_scene):
    s = wall_scene
    wall_id = s.service.execute(s.intent(wall_data={
        'x1': 0, 'y1': 0, 'x2': 50, 'y2': 60, 'is_door': True, 'door_state': 'locked'})).receipt['wall_id']
    with s.factory() as db, db.begin():
        owner = models.User(username='newowner', email='newowner@example.com', hashed_password='test')
        db.add(owner)
        db.flush()
        db.get(models.GameSession, s.session_id).owner_id = owner.id
        db.query(models.GamePlayer).filter_by(session_id=s.session_id, user_id=s.actor_id).one().role = 'player'
    intent = s.intent('door_toggle', 'player-toggle', wall_id=wall_id)
    with pytest.raises(OperationRejected, match='locked'):
        s.service.execute(intent)
    with s.factory() as db, db.begin():
        db.query(models.Wall).filter_by(wall_id=wall_id).one().door_state = 'closed'
    assert s.service.execute(intent).wall['door_state'] == 'open'
    with s.factory() as db, db.begin():
        db.query(models.GamePlayer).filter_by(user_id=s.actor_id).one().role = 'spectator'
    assert not s.service.resolve(PendingWallCommand(intent, accepted=True)).authorized
    with pytest.raises(OperationRejected, match='authority'):
        s.service.execute(intent)


def test_missing_known_accepted_receipt_remains_unknown(wall_scene):
    s = wall_scene
    intent = s.intent()
    s.service.execute(intent)
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).delete()
    with pytest.raises(OperationOutcomeUnknown):
        s.service.resolve(PendingWallCommand(intent, accepted=True))


@pytest.mark.parametrize('patch', [
    {'x2': float('nan')}, {'x2': True}, {'x2': -1}, {'x2': 1001}, {'direction': 'invalid'},
    {'is_door': 1}, {'created_by': 20}, {'wall_type': []}, {},
])
def test_invalid_or_out_of_bounds_updates_leave_no_receipt(wall_scene, patch):
    s = wall_scene
    wall_id = s.service.execute(s.intent()).receipt['wall_id']
    with pytest.raises(OperationRejected):
        intent = s.intent('wall_update', 'invalid', wall_id=wall_id, updates=patch)
        s.service.execute(intent)
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1
        assert db.query(models.Wall).one().x2 == 50


def test_dirty_target_does_not_overwrite_retained_edits(wall_scene):
    s = wall_scene
    with pytest.raises(OperationRejected, match='retained'):
        s.service.execute(s.intent(), target_dirty=True)
    with s.factory() as db:
        assert db.query(models.Wall).count() == 0
        assert db.query(models.SessionOperationReceipt).count() == 0
