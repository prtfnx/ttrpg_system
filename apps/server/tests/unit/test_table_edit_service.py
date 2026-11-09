"""Real SQL acceptance and replay of isolated table metadata/transform edits."""
from types import SimpleNamespace

import pytest
from core_table.server import TableManager
from database import crud, models
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_edit_service import PendingTableEdit, TableEditIntent, TableEditService
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def table_scene(test_db, test_db_engine, test_game_session, test_user):
    manager = TableManager(test_db)
    table = manager.create_table('Original', 1000, 1000)
    table.add_entity({'sprite_id': 'untouched', 'x': 10, 'y': 20})
    crud.save_table_to_db(test_db, table, test_game_session.id)
    scope = SimpleNamespace(manager=manager, table=table, table_id=str(table.table_id),
        session_id=test_game_session.id, actor_id=test_user.id, factory=sessionmaker(bind=test_db_engine))
    scope.service = TableEditService(scope.factory)
    def intent(kind='table_move', request_id='original', **values):
        data = {'table_id': scope.table_id, **({'x_moved': 15, 'y_moved': 30} if kind == 'table_move'
            else {'scale': 2} if kind == 'table_scale' else {'table_name': 'Changed', 'width': 1500}), **values}
        if kind == 'table_update_request':
            data = {'category': 'table', 'type': 'table_update', 'data': data}
        return TableEditIntent.create(scope.session_id, scope.actor_id, request_id, kind, data)
    scope.intent = intent
    return scope


@pytest.mark.parametrize('kind', ['table_move', 'table_scale', 'table_update_request'])
@pytest.mark.parametrize('committed', [False, True])
def test_original_receipt_and_fields_accept_or_roll_back_together(table_scene, kind, committed):
    s = table_scene
    intent = s.intent(kind)
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit error')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    with pytest.raises(OSError):
        TableEditService(factory).execute(intent)
    outcome = s.service.resolve(PendingTableEdit(intent))
    assert outcome.committed is committed
    with s.factory() as db:
        row = db.query(models.VirtualTable).one()
        assert db.query(models.SessionOperationReceipt).count() == int(committed)
        assert row.position_x == (15 if committed and kind == 'table_move' else 0)
        assert row.scale_x == (2 if committed and kind == 'table_scale' else 1)
        assert row.name == ('Changed' if committed and kind == 'table_update_request' else 'Original')
        assert db.query(models.Entity).one().position_x == 10


@pytest.mark.parametrize('kind', ['table_move', 'table_scale', 'table_update_request'])
def test_duplicate_returns_only_current_affected_fields_without_restoring_old_values(table_scene, kind):
    s = table_scene
    intent = s.intent(kind)
    s.service.execute(intent)
    with s.factory() as db, db.begin():
        row = db.query(models.VirtualTable).one()
        row.position_x, row.scale_x, row.name, row.width = 99, 4, 'Later', 1800
    replay = s.service.execute(intent)
    assert replay.replayed
    assert replay.current == ({'position_x': 99, 'position_y': 30} if kind == 'table_move' else
        {'scale_x': 4, 'scale_y': 2} if kind == 'table_scale' else {'name': 'Later', 'width': 1800})
    assert set(replay.receipt) == {'success', 'domain', 'operation_id', 'table_id'}


def test_legacy_grid_patch_increments_settings_revision_once(table_scene):
    s = table_scene
    intent = s.intent('table_update_request', grid_size=70, grid_enabled=False)
    accepted = s.service.execute(intent)
    assert accepted.current['settings_revision'] == 1
    assert s.service.execute(intent).current['settings_revision'] == 1
    with s.factory() as db:
        assert db.query(models.VirtualTable).one().grid_cell_px == 70


def test_identity_binds_full_original_kind_and_payload(table_scene):
    s = table_scene
    s.service.execute(s.intent())
    for intent in [s.intent(x_moved=99), s.intent('table_scale')]:
        with pytest.raises(OperationRejected, match='different input'):
            s.service.execute(intent)


def test_later_table_deletion_does_not_recreate_it(table_scene):
    from service.table_deletion_service import TableDeleteIntent, TableDeletionService
    s = table_scene
    intent = s.intent()
    s.service.execute(intent)
    TableDeletionService(s.factory).execute(TableDeleteIntent.create(s.session_id, s.actor_id,
        'delete', {'table_id': s.table_id}))
    replay = s.service.execute(intent)
    assert replay.committed and replay.current is None
    assert s.service.resolve(PendingTableEdit(intent)).current is None


def test_missing_known_accepted_receipt_never_proves_rollback(table_scene):
    s = table_scene
    intent = s.intent()
    s.service.execute(intent)
    with s.factory() as db, db.begin():
        db.query(models.SessionOperationReceipt).delete()
    with pytest.raises(OperationOutcomeUnknown):
        s.service.resolve(PendingTableEdit(intent, accepted=True))


@pytest.mark.parametrize('kind,values', [
    ('table_move', {'x_moved': True}), ('table_move', {'y_moved': float('inf')}),
    ('table_scale', {'scale': 0}), ('table_scale', {'scale': 101}),
    ('table_update_request', {'table_name': ' '}), ('table_update_request', {'width': 499}),
    ('table_update_request', {'height': 1000.5}), ('table_update_request', {'width': True}),
    ('table_update_request', {'grid_size': 201}), ('table_update_request', {'grid_enabled': 0}),
    ('table_update_request', {'position_x': 99}),
])
def test_invalid_fields_leave_no_accepted_effect_or_receipt(table_scene, kind, values):
    s = table_scene
    with pytest.raises(OperationRejected):
        s.service.execute(s.intent(kind, **values))
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 0
        assert db.query(models.VirtualTable).one().name == 'Original'


def test_retained_dirty_target_is_rejected_before_mutation(table_scene):
    with pytest.raises(OperationRejected, match='retained'):
        table_scene.service.execute(table_scene.intent(), target_dirty=True)
