"""Fog replacement accepts all rows and its original receipt or neither."""
import copy

import pytest
from database import crud, models
from service.fog_edit_service import FogEditIntent, FogEditService
from service.session_operation_receipts import OperationRejected
from service.table_edit_service import PendingTableEdit
from sqlalchemy import event

from .test_table_edit_service import table_scene as table_scene


@pytest.fixture
def fog_scene(table_scene):
    s = table_scene
    s.service = FogEditService(s.factory)
    def request(hide=None, reveal=None):
        return {'category': 'table', 'type': 'fog_update', 'data': {
            'table_id': s.table_id, 'hide_rectangles': [[[10, 20], [50, 60]]] if hide is None else hide,
            'reveal_rectangles': [] if reveal is None else reveal}}
    s.request_data = request
    s.fog_intent = lambda request_id='original', **kwargs: FogEditIntent.create(s.session_id,
        s.actor_id, request_id, 'table_update_request', request(**kwargs))
    return s


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('clearing', [False, True])
def test_commit_failure_cannot_partially_replace_fog_or_lose_receipt(fog_scene, committed, clearing):
    s = fog_scene
    s.service.execute(s.fog_intent('seed', hide=[[[1, 2], [8, 9]]]))
    intent = s.fog_intent(hide=[] if clearing else None, reveal=[] if clearing else [[[15, 25], [20, 30]]])
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit error')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    with pytest.raises(OSError):
        FogEditService(factory).execute(intent)
    result = s.service.resolve(PendingTableEdit(intent))
    assert result.committed is committed
    expected = [] if clearing and committed else [(10, 20), (15, 25)] if committed else [(1, 2)]
    assert [entity.position for entity in result.current['fog_entities']] == expected
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1 + int(committed)
        assert db.query(models.Entity).filter_by(layer='tokens').one().sprite_id == 'untouched'


def test_duplicate_never_replaces_later_fog_and_empty_clear_stays_empty(fog_scene):
    s = fog_scene
    first = s.fog_intent()
    s.service.execute(first)
    s.service.execute(s.fog_intent('later', hide=[[[100, 200], [120, 240]]]))
    replay = s.service.execute(first)
    assert replay.replayed and replay.current['fog_entities'][0].position == (100, 200)
    assert set(replay.receipt) == {'success', 'domain', 'operation_id', 'table_id'}
    s.service.execute(s.fog_intent('clear', hide=[], reveal=[]))
    assert not s.service.execute(first).current['fog_entities']


def test_loader_rebuilds_canonical_view_and_normalizes_reversed_pixel_anchors(fog_scene):
    s = fog_scene
    s.service.execute(s.fog_intent(hide=[[[50.5, 60.5], [10.25, 20.25]]], reveal=[[[1, 2], [3, 4]]]))
    with s.factory() as db:
        restored, success = crud.load_table_from_db(db, s.table_id)
        assert success and restored is not None
        assert restored.fog_rectangles == {'hide': [((10, 20), (50.25, 60.25))], 'reveal': [((1, 2), (3, 4))]}
        token = restored.find_entity_by_sprite_id('untouched')
        assert token is not None and token.position == (10, 20)


def test_complete_original_input_is_bound_including_subpixel_differences(fog_scene):
    s = fog_scene
    s.service.execute(s.fog_intent())
    with pytest.raises(OperationRejected, match='different input'):
        s.service.execute(s.fog_intent(hide=[[[10.1, 20], [50.1, 60]]]))


def test_legacy_marker_rows_reconstruct_without_receipt_backfill(fog_scene):
    s = fog_scene
    with s.factory() as db, db.begin():
        table = db.query(models.VirtualTable).one()
        db.add(models.Entity(entity_id=20, sprite_id='legacy-fog', table_id=table.id, name='Old',
            layer='fog_of_war', texture_path='__FOG_HIDE__', position_x=2, position_y=3, scale_x=40, scale_y=50))
    with s.factory() as db:
        table, success = crud.load_table_from_db(db, s.table_id)
        assert success and table is not None and table.fog_rectangles == {'hide': [((2, 3), (42, 53))], 'reveal': []}
        assert not db.query(models.SessionOperationReceipt).count()


def test_payload_above_old_identity_limit_is_accepted_with_bounded_receipt(fog_scene):
    s = fog_scene
    rectangles = [[[index, index], [index + 10, index + 20]] for index in range(400)]
    result = s.service.execute(s.fog_intent(hide=rectangles))
    assert len(result.current['fog_entities']) == 400
    assert len(str(result.receipt)) < 300


@pytest.mark.parametrize('rectangles', [None, [1], [[[0], [1, 2]]], [[[False, 0], [1, 2]]], [[[0, 0], [0, 2]]],
    [[[float('nan'), 0], [1, 2]]], [[[2147483648, 0], [2147483649, 2]]], 'not-rectangles'])
def test_invalid_replacement_rejects_whole_command(fog_scene, rectangles):
    s = fog_scene
    data = copy.deepcopy(s.request_data())
    data['data']['hide_rectangles'] = rectangles
    with pytest.raises(OperationRejected):
        intent = FogEditIntent.create(s.session_id, s.actor_id, 'invalid', 'table_update_request', data)
        s.service.execute(intent)
    with s.factory() as db:
        assert not db.query(models.Entity).filter_by(layer='fog_of_war').count()
        assert not db.query(models.SessionOperationReceipt).count()


def test_retained_dirty_target_is_rejected_without_deleting_fog(fog_scene):
    s = fog_scene
    s.service.execute(s.fog_intent('seed'))
    with pytest.raises(OperationRejected, match='retained'):
        s.service.execute(s.fog_intent(hide=[]), target_dirty=True)
    assert len(s.service.resolve(PendingTableEdit(s.fog_intent('seed'))).current['fog_entities']) == 1
