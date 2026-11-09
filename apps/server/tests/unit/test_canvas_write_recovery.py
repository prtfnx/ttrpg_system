"""Real canvas acceptance failures must not reject or overwrite a committed edit."""
import asyncio
import copy
import uuid
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from database import crud, models
from service import canvas_write_recovery
from service.protocol import canvas_outcomes
from sqlalchemy import event
from utils.time import utc_now

from .test_canvas_command_service import IDENTITY, PAINT, TABLE
from .test_canvas_command_service import scene as scene
from .test_canvas_protocol import dispatch
from .test_canvas_protocol import protocol as protocol


async def prepare(scene, protocol, mode):
    def sync():
        scene['table']['table'] = protocol.table_manager.get_table(TABLE)
    if mode in {'undo', 'redo'}:
        assert (await dispatch(protocol, scene['command']())).data['success']
        sync()
    if mode == 'redo':
        assert (await dispatch(protocol, scene['command']('undo'))).data['success']
        sync()
    if mode == 'paste':
        copied = await dispatch(protocol, scene['command']('copy'))
        return scene['command']('paste', clipboard_id=copied.data['clipboard_id'], transform={**IDENTITY, 'dx': 100},
            ids=[{'kind': member['kind'], 'source_id': member['id'], 'id': str(uuid.uuid4())} for member in scene['members']()])
    if mode == 'sprite_edit':
        return scene['command'](mode, members=scene['members']()[1:], edit={'width': 40, 'height': 20})
    if mode == 'restyle':
        return scene['command'](mode, members=scene['members']()[:1],
            style={'stroke_rgba': [0, 1, 0, 1], 'width': 4, 'fill_rgba': None})
    return scene['command'](mode)


def lose_commit(scene, *, committed):
    factory = scene['factory']
    def failing_factory():
        db = factory()
        def lost(_db):
            raise RuntimeError('Private commit acknowledgement failure')
        event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
        return db
    scene['service'].factory = failing_factory


def capture(protocol):
    for call in protocol._transport_send.call_args_list:
        Message.from_dict(call.args[0].to_dict())
    return protocol._transport_send.call_args.args[0]


@pytest.mark.parametrize('mode', ['transform', 'sprite_edit', 'restyle', 'delete', 'copy', 'cut', 'paste', 'undo', 'redo'])
@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
async def test_every_canvas_mode_settles_without_second_acceptance(scene, protocol, monkeypatch, mode, committed, outage):
    command = await prepare(scene, protocol, mode)
    before = copy.deepcopy(protocol.table_manager.get_table(TABLE).to_dict())
    with scene['factory']() as db:
        initial_count = db.query(models.CanvasCommandJournal).count()
    protocol._transport_send.reset_mock()
    protocol.session_manager.broadcast_to_session.reset_mock()
    protocol.session_manager.broadcast_filtered.reset_mock()
    resolver = canvas_outcomes.resolve_canvas_write
    unavailable = outage
    def lookup(attempt):
        if unavailable:
            raise OSError('Private settlement outage')
        return resolver(attempt)
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lookup)
    lose_commit(scene, committed=committed)
    response = await dispatch(protocol, command)
    if outage:
        assert response.data['code'] == 'outcome_unknown' and not response.data['success']
        assert protocol._has_pending_writes() and not protocol.table_manager.persistence_allowed()
        assert protocol.table_manager.get_table(TABLE).to_dict() == before
        read = Message(MessageType.CANVAS_HISTORY_REQUEST, {'table_id': TABLE})
        assert await protocol.handle_client(read, 'sender')
        blocked = capture(protocol)
        assert blocked.type == MessageType.ERROR and blocked.data['outcome'] == 'unknown'
        unavailable = False
        response = await dispatch(protocol, copy.deepcopy(command))
    capture(protocol)
    assert response.type == MessageType.CANVAS_COMMAND_RESULT
    assert response.data['success'] is committed and response.data['resync_required']
    assert 'Private' not in response.to_json()
    assert not protocol._has_pending_writes() and protocol.table_manager.persistence_allowed()
    if not committed:
        assert response.data['code'] == 'persistence_failed'
    with scene['factory']() as db:
        assert db.query(models.CanvasCommandJournal).count() == initial_count + int(committed)
        loaded, ok = crud.load_table_from_db(db, TABLE)
        assert ok and loaded is not None
        assert loaded.to_dict() == protocol.table_manager.get_table(TABLE).to_dict()
    protocol.session_manager.broadcast_filtered.assert_not_awaited()
    assert all(call.args[0].type == MessageType.SPRITE_RESPONSE
        for call in protocol.session_manager.broadcast_to_session.call_args_list)
    if committed:
        retry = await dispatch(protocol, copy.deepcopy(command))
        assert retry.data['success'] and retry.data['resync_required']
        with scene['factory']() as db:
            assert db.query(models.CanvasCommandJournal).count() == initial_count + 1


async def test_recovery_installs_current_targets_and_preserves_unrelated_live_changes(scene, protocol, monkeypatch):
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    command = scene['command']()
    lose_commit(scene, committed=True)
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    table = protocol.table_manager.get_table(TABLE)
    table.width = 900
    table.add_entity({'sprite_id': 'unrelated', 'x': 400, 'y': 400, 'name': 'Retained'})
    unrelated = table.find_entity_by_sprite_id('unrelated')
    with scene['factory']() as db:
        token = db.query(models.Entity).filter_by(sprite_id='sprite').one()
        token.rotation, token.hp, token.layer = 90, 3, 'map'
        db.get(models.PaintObject, PAINT).transform = {'x': 300, 'y': 400, 'scale_x': 1, 'scale_y': 1}
        db.commit()
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    receipt = await dispatch(protocol, copy.deepcopy(command))
    assert receipt.data['success']
    token = table.find_entity_by_sprite_id('sprite')
    assert (token.rotation, token.hp, token.layer) == (90, 3, 'map')
    assert table.width == 900 and table.find_entity_by_sprite_id('unrelated') is unrelated
    assert 'sprite_data' not in receipt.data and 'events' not in receipt.data
    with scene['factory']() as db:
        assert db.get(models.PaintObject, PAINT).transform['x'] == 300


async def test_known_commit_cache_failure_retains_owner_and_repairs_aliases(scene, protocol, monkeypatch):
    resolver = canvas_outcomes.resolve_canvas_write
    install = protocol.table_manager.add_table
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    def broken(table):
        protocol.table_manager.tables[TABLE] = table
        raise RuntimeError('Partial cache installation')
    monkeypatch.setattr(protocol.table_manager, 'add_table', broken)
    command = scene['command']()
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    assert protocol._pending_canvas_write.accepted and protocol._has_pending_writes()
    monkeypatch.setattr(protocol.table_manager, 'add_table', install)
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    assert (await dispatch(protocol, command)).data['success']
    assert protocol.table_manager.tables[TABLE] is protocol.table_manager.tables_id[TABLE]
    assert not protocol._has_pending_writes()


async def test_revocation_does_not_disclose_history_but_repairs_current_cache(scene, protocol, monkeypatch, player_user):
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(scene, committed=True)
    command = scene['command']()
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    with scene['factory']() as db:
        db.get(models.GameSession, scene['session']).owner_id = player_user.id
        db.query(models.GamePlayer).filter_by(session_id=scene['session'], user_id=scene['actor']).delete()
        db.commit()
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    response = await dispatch(protocol, command)
    assert response.data['code'] == 'forbidden' and response.data['resync_required']
    assert not {'selection', 'can_undo', 'can_redo', 'clipboard_id'} & response.data.keys()
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id('sprite').position == (20, 40)
    assert not protocol._has_pending_writes()


async def test_changed_input_cannot_claim_pending_receipt(scene, protocol, monkeypatch):
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(scene, committed=True)
    command = scene['command']()
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    changed = copy.deepcopy(command)
    changed['transform']['dx'] = 200
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    response = await dispatch(protocol, changed)
    assert response.data['code'] == 'operation_id_conflict'
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id('sprite').position == (20, 40)
    with scene['factory']() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1


async def test_repeated_cancellation_keeps_owned_recovery_through_publication(scene, protocol):
    lose_commit(scene, committed=True)
    entered, release = asyncio.Event(), asyncio.Event()
    async def publish(*_args, **_kwargs):
        entered.set()
        await release.wait()
    protocol.session_manager.broadcast_to_session.side_effect = publish
    task = asyncio.create_task(dispatch(protocol, scene['command']()))
    await asyncio.wait_for(entered.wait(), 3)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and protocol._mutation_lock.locked()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not protocol._has_pending_writes() and not protocol._mutation_lock.locked()


async def test_missing_accepted_history_never_proves_nonacceptance(scene, protocol, monkeypatch):
    install = protocol.table_manager.add_table
    monkeypatch.setattr(protocol.table_manager, 'add_table', lambda _: (_ for _ in ()).throw(RuntimeError('cache')))
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    command = scene['command']()
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    with scene['factory']() as db:
        db.query(models.CanvasCommandJournal).delete()
        db.commit()
    monkeypatch.setattr(protocol.table_manager, 'add_table', install)
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    assert protocol._has_pending_writes()


@pytest.mark.parametrize('available', [False, True])
async def test_join_after_socket_removal_cannot_publish_stale_canvas_state(scene, protocol, monkeypatch, available):
    from service.game_session_protocol import GameSessionProtocolService
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(scene, committed=True)
    command = scene['command']()
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    svc = GameSessionProtocolService.__new__(GameSessionProtocolService)
    svc.server_protocol, svc.table_manager = protocol, protocol.table_manager
    svc.session_code, svc.game_session_db_id, svc.db_session = 'CANVAS', scene['session'], None
    svc.clients, svc.client_info, svc.websocket_to_client, svc._outboxes = {}, {}, {}, {}
    protocol.session_manager = svc
    protocol._load_active_choice_encounter = AsyncMock(return_value=None)
    assert not await svc.save_to_database_async()
    if available:
        monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    socket = AsyncMock()
    socket.scope = {'query_string': b''}
    async with protocol._mutation_lock:
        if not available:
            with pytest.raises(RuntimeError, match='settle'):
                await svc._register_client(socket, 'replacement', {'user_id': scene['actor']}, 'free_roam', {})
            socket.send_text.assert_not_awaited()
            assert not svc.clients and protocol._has_pending_writes()
            return
        await svc._register_client(socket, 'replacement', {'user_id': scene['actor']}, 'free_roam', {})
    await svc.drain_outbound()
    socket.send_text.assert_awaited_once()
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id('sprite').position == (20, 40)
    assert not protocol._has_pending_writes()


async def test_later_deleted_sprite_is_not_resurrected_or_selected_by_old_receipt(scene, protocol, monkeypatch):
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(scene, committed=True)
    command = scene['command']()
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    with scene['factory']() as db:
        db.query(models.Entity).filter_by(sprite_id='sprite').delete()
        db.delete(db.get(models.PaintObject, PAINT))
        db.commit()
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    receipt = await dispatch(protocol, command)
    assert receipt.data['success'] and receipt.data['selection'] == []
    assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id('sprite') is None
    assert not protocol._has_pending_writes()


async def test_missing_unrecorded_expired_outcome_stays_unknown(scene, protocol, monkeypatch):
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    command = scene['command']()
    lose_commit(scene, committed=False)
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    from service.canvas_command_service import CanvasCommandService
    monkeypatch.setattr(canvas_write_recovery, 'CanvasCommandService', lambda factory: CanvasCommandService(
        factory, now=lambda: utc_now() + timedelta(days=2)))
    assert (await dispatch(protocol, command)).data['code'] == 'outcome_unknown'
    assert protocol._has_pending_writes()


@pytest.mark.parametrize('committed', [False, True])
async def test_unadmitted_pipeline_follower_keeps_its_own_identity_until_original_settles(scene, protocol, monkeypatch, committed):
    resolver = canvas_outcomes.resolve_canvas_write
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    original = scene['command']()
    follower = copy.deepcopy(original)
    follower['operation_id'] = str(uuid.uuid4())
    follower['transform']['dx'], follower['transform']['dy'] = 5, 0
    for member in follower['members']:
        member['after_operation_id'] = original['operation_id']
    lose_commit(scene, committed=committed)
    request = Message(MessageType.BATCH_REQUEST, {'messages': [
        Message(MessageType.CANVAS_COMMAND, command).to_dict() for command in [original, follower]]})
    assert await protocol.handle_client(request, 'sender')
    receipts = [call.args[0] for call in protocol._transport_send.call_args_list
        if call.args[0].type == MessageType.CANVAS_COMMAND_RESULT]
    assert [receipt.data['operation_id'] for receipt in receipts] == [original['operation_id'], follower['operation_id']]
    assert all(receipt.data['code'] == 'outcome_unknown' for receipt in receipts)
    assert protocol._pending_canvas_write.intent.operation_id == original['operation_id']
    with scene['factory']() as db:
        assert db.query(models.CanvasCommandJournal).count() == int(committed)
    monkeypatch.setattr(canvas_outcomes, 'resolve_canvas_write', resolver)
    response = await dispatch(protocol, follower)
    if committed:
        assert response.data['success']
        assert protocol.table_manager.get_table(TABLE).find_entity_by_sprite_id('sprite').position == (25, 40)
    else:
        assert response.data['code'] == 'dependency_failed'
    with scene['factory']() as db:
        assert db.query(models.CanvasCommandJournal).count() == (2 if committed else 0)
