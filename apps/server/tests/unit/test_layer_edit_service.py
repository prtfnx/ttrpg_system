"""Real SQL layer patches retain other properties and original outcomes."""
import json

import pytest
from database import crud, models
from service.layer_edit_service import LayerEditIntent, LayerEditService
from service.session_operation_receipts import OperationRejected
from service.table_edit_service import PendingTableEdit
from sqlalchemy import event

from .test_table_edit_service import table_scene as table_scene


@pytest.fixture
def layer_scene(table_scene):
    s = table_scene
    s.service = LayerEditService(s.factory)
    s.layer_intent = lambda request='original', layer='tokens', settings=None: LayerEditIntent.create(
        s.session_id, s.actor_id, request, 'layer_settings_update', {'table_id': s.table_id,
            'layer': layer, 'settings': {'opacity': 0.5} if settings is None else settings})
    return s


@pytest.mark.parametrize('committed', [False, True])
def test_lost_commit_response_resolves_effect_and_receipt_together(layer_scene, committed):
    s = layer_scene
    s.service.execute(s.layer_intent('seed', settings={'visible': False}))
    def factory():
        db = s.factory()
        def lost(_db):
            raise OSError('Private commit error')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    intent = s.layer_intent()
    with pytest.raises(OSError):
        LayerEditService(factory).execute(intent)
    outcome = s.service.resolve(PendingTableEdit(intent))
    assert outcome.committed is committed
    assert outcome.current['layer_settings']['tokens'] == ({'visible': False, 'opacity': 0.5} if committed else {'visible': False})
    with s.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1 + int(committed)


def test_partial_edits_preserve_visibility_other_layers_and_legacy_metadata(layer_scene):
    s = layer_scene
    with s.factory() as db, db.begin():
        db.query(models.VirtualTable).one().layer_settings = json.dumps({
            'tokens': {'visible': False, 'legacy_tag': 'retained'}, 'map': {'opacity': 0.8}})
    accepted = s.service.execute(s.layer_intent())
    assert accepted.current == {'layer_settings': {'tokens': {'visible': False, 'opacity': 0.5}}}
    with s.factory() as db:
        settings = json.loads(db.query(models.VirtualTable).one().layer_settings)
        assert settings == {'tokens': {'visible': False, 'opacity': 0.5, 'legacy_tag': 'retained'}, 'map': {'opacity': 0.8}}
        assert db.query(models.Entity).one().sprite_id == 'untouched'


def test_replay_returns_current_style_without_reverting_later_changes(layer_scene):
    s = layer_scene
    intent = s.layer_intent()
    s.service.execute(intent)
    s.service.execute(s.layer_intent('later', settings={'opacity': 0.9, 'visible': False}))
    replay = s.service.execute(intent)
    assert replay.replayed and replay.current['layer_settings']['tokens'] == {'opacity': 0.9, 'visible': False}
    assert set(replay.receipt) == {'success', 'domain', 'operation_id', 'table_id'}


def test_legacy_dual_color_aliases_do_not_block_new_patches(layer_scene):
    s = layer_scene
    with s.factory() as db, db.begin():
        db.query(models.VirtualTable).one().layer_settings = json.dumps({'tokens': {
            'color': [1, 0, 0, 1], 'tint_color': [0, 1, 0], 'inactive_opacity': 0.3}})
    result = s.service.execute(s.layer_intent())
    assert result.current['layer_settings']['tokens'] == {'tint_color': [0, 1, 0], 'opacity': 0.5}
    with s.factory() as db:
        stored = json.loads(db.query(models.VirtualTable).one().layer_settings)['tokens']
        assert 'color' not in stored and stored['inactive_opacity'] == 0.3


def test_changed_identity_payload_conflicts_even_if_color_normalizes_the_same(layer_scene):
    s = layer_scene
    s.service.execute(s.layer_intent(settings={'color': [0.1, 0.2, 0.3, 1]}))
    with pytest.raises(OperationRejected, match='different input'):
        s.service.execute(s.layer_intent(settings={'tint_color': [0.1, 0.2, 0.3]}))
    result = s.service.execute(s.layer_intent('canonical', settings={'tint_color': [0.4, 0.5, 0.6], 'blend_mode': 'multiply'}))
    assert result.current['layer_settings']['tokens']['tint_color'] == [0.4, 0.5, 0.6]
    with s.factory() as db:
        assert 'color' not in json.loads(db.query(models.VirtualTable).one().layer_settings)['tokens']


@pytest.mark.parametrize('settings', [{}, {'visible': 0}, {'opacity': True}, {'opacity': -1}, {'opacity': 1.1},
    {'opacity': float('nan')}, {'tint_color': [1, 2, 3]}, {'color': [0, 0]}, {'blend_mode': 'invalid'},
    {'color': [1, 1, 1], 'tint_color': [0, 0, 0]}, {'unknown': 'no'}, {'inactive_opacity': 0.5}])
def test_invalid_or_unsupported_patch_has_no_effect(layer_scene, settings):
    s = layer_scene
    with pytest.raises(OperationRejected):
        s.service.execute(s.layer_intent(settings=settings))
    with s.factory() as db:
        assert db.query(models.VirtualTable).one().layer_settings is None
        assert not db.query(models.SessionOperationReceipt).count()


def test_old_full_scene_save_cannot_erase_layer_patch(layer_scene):
    s = layer_scene
    s.service.execute(s.layer_intent(settings={'visible': False, 'opacity': 0.4}))
    assert crud.save_table_to_db(s.manager.db_session, s.table, s.session_id)
    replay = s.service.execute(s.layer_intent(settings={'visible': False, 'opacity': 0.4}))
    assert replay.current['layer_settings']['tokens'] == {'visible': False, 'opacity': 0.4}


def test_dirty_target_and_unknown_layer_reject_before_acceptance(layer_scene):
    s = layer_scene
    with pytest.raises(OperationRejected, match='retained'):
        s.service.execute(s.layer_intent(), target_dirty=True)
    with pytest.raises(OperationRejected, match='canonical layer'):
        s.service.execute(s.layer_intent(layer='ground'))
