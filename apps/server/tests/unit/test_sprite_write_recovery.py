"""Real SQL/protocol acceptance after lost sprite commit acknowledgements."""
import asyncio
import copy
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud, models
from service.protocol.base import ServerProtocol
from service.sprite_editor_commands import SpriteEditorCommandService
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def scene(test_db, test_db_engine, test_game_session, test_user, monkeypatch):
    factory = sessionmaker(bind=test_db_engine)
    monkeypatch.setattr('service.protocol.base.SessionLocal', factory)
    monkeypatch.setattr('service.protocol.canvas.SessionLocal', factory)
    monkeypatch.setattr('service.canvas_persistence_service.SessionLocal', factory)
    manager = TableManager(test_db)
    table = manager.create_table('Settlement', 1000, 1000)
    table.add_entity({'sprite_id': 'token', 'x': 10, 'y': 20, 'layer': 'tokens', 'hp': 10})
    table.add_entity({'sprite_id': 'unrelated', 'x': 200, 'y': 200, 'layer': 'tokens'})
    assert crud.save_table_to_db(test_db, table, test_game_session.id)
    session = SimpleNamespace(game_session_db_id=test_game_session.id,
        client_info={'client': {'user_id': test_user.id}})
    proto = ServerProtocol(manager, session)
    monkeypatch.setattr(proto, '_get_session_id', lambda _msg: test_game_session.id)
    monkeypatch.setattr(proto, '_get_user_id', lambda _msg, _client: test_user.id)
    monkeypatch.setattr(proto, '_get_client_role', lambda _client: 'owner')
    monkeypatch.setattr(proto, '_get_session_code', lambda *_args: test_game_session.session_code)
    proto.send_to_client = AsyncMock()
    proto.broadcast_filtered = AsyncMock()
    proto.broadcast_to_session = AsyncMock()
    return proto, table, factory


def request(table, kind='rotate', angle=30):
    data = {'table_id': str(table.table_id), 'sprite_id': 'token'}
    if kind == 'create':
        return Message(MessageType.SPRITE_CREATE, {'table_id': str(table.table_id), 'sprite_data': {
            'sprite_id': 'new', 'x': 50, 'y': 60, 'layer': 'tokens'}})
    if kind == 'delete':
        return Message(MessageType.SPRITE_REMOVE, data)
    return Message(MessageType.SPRITE_ROTATE, {**data, 'rotation': angle, 'action_id': f'rotate-{angle}'})


async def send(proto, message):
    assert await proto.handle_client(message, 'client')
    for call in proto.send_to_client.call_args_list:
        Message.from_dict(call.args[0].to_dict())
    return proto.send_to_client.call_args.args[0]


def lose_commit(monkeypatch, *, committed):
    original = SpriteEditorCommandService.persist_many

    def persist(service, commands):
        factory = service.factory

        def failing_factory():
            db = factory()

            def lost(_db):
                raise RuntimeError('Private commit response failure')

            event.listen(db, 'after_commit' if committed else 'before_commit', lost, once=True)
            return db

        service.factory = failing_factory
        return original(service, commands)

    monkeypatch.setattr(SpriteEditorCommandService, 'persist_many', persist)


@pytest.mark.parametrize('kind', ['create', 'delete', 'rotate'])
@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('outage', [False, True])
async def test_lost_commit_settles_original_and_current_cache_without_reapplying(
    scene, monkeypatch, kind, committed, outage,
):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    original = request(table, kind)
    retry = copy.deepcopy(original)
    resolver = sprite_outcomes.resolve_sprite_write
    unavailable = outage

    def lookup(attempt):
        if unavailable:
            raise OSError('Private lookup outage')
        return resolver(attempt)

    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lookup)
    lose_commit(monkeypatch, committed=committed)
    response = await send(proto, original)
    if outage:
        assert response.type == MessageType.ERROR and response.data['outcome'] == 'unknown'
        assert proto._has_pending_writes() and not proto.table_manager.persistence_allowed()
        assert not await proto.table_manager.save_table_async(str(table.table_id), proto._get_session_id(original))
        assert table.find_entity_by_sprite_id('new') is None
        assert table.find_entity_by_sprite_id('token').rotation == 0
        read = await send(proto, Message(MessageType.TABLE_LIST_REQUEST))
        assert read.type == MessageType.ERROR and read.data['outcome'] == 'unknown'
        unavailable = False
        response = await send(proto, retry)
    assert not proto._has_pending_writes() and proto.table_manager.persistence_allowed()
    assert 'Private' not in str(response.data)
    assert response.causation_id == original.message_id
    if committed:
        assert response.type == MessageType.SPRITE_RESPONSE and response.data['success']
        assert response.data['resync_required'] and 'sprite_data' not in response.data
    else:
        assert response.type == MessageType.ERROR and response.data['not_accepted']
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == int(committed)
        loaded, success = crud.load_table_from_db(db, str(table.table_id))
        assert success and loaded is not None and loaded.to_dict() == table.to_dict()
    proto.broadcast_filtered.assert_not_awaited()
    if committed:
        # Original timestamp/body survive handler normalization. A duplicate
        # resolves the retained journal instead of accepting another gesture.
        response = await send(proto, retry)
        assert response.data['success'] and response.data['resync_required']
        with factory() as db:
            assert db.query(models.CanvasCommandJournal).count() == 1


@pytest.mark.parametrize('committed', [False, True])
async def test_burst_settlement_repairs_final_rows_and_streams_each_original(scene, monkeypatch, committed):
    proto, table, factory = scene
    first, second = request(table, angle=30), request(table, angle=60)
    lose_commit(monkeypatch, committed=committed)
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {'messages': [first.to_dict(), second.to_dict()]}))
    assert response.type == MessageType.BATCH_RESPONSE
    assert response.data['failed_count'] == (0 if committed else 2)
    receipts = [call.args[0] for call in proto.send_to_client.call_args_list[:-1]]
    assert [receipt.causation_id for receipt in receipts] == [first.message_id, second.message_id]
    assert all(receipt.data['resync_required'] for receipt in receipts)
    assert table.find_entity_by_sprite_id('token').rotation == (60 if committed else 0)
    proto.broadcast_filtered.assert_not_awaited()
    assert not proto._has_pending_writes()
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == (2 if committed else 0)
        assert db.query(models.Entity).filter_by(sprite_id='token').one().rotation == (60 if committed else 0)


async def test_recovery_uses_current_rows_and_preserves_unrelated_live_state(scene, monkeypatch):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=True)
    original = request(table)
    assert (await send(proto, original)).data['outcome'] == 'unknown'
    with factory() as db:
        current = db.query(models.Entity).filter_by(sprite_id='token').one()
        current.rotation, current.hp, current.layer = 90, 3, 'map'
        db.commit()
    # A detached recovery must not overwrite unrelated retained table edits.
    table.width = 900
    unrelated = table.find_entity_by_sprite_id('unrelated')
    unrelated.name = 'Unsaved unrelated name'
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    response = await send(proto, Message(MessageType.TABLE_LIST_REQUEST))
    assert response.type == MessageType.TABLE_LIST_RESPONSE
    token = table.find_entity_by_sprite_id('token')
    assert (token.rotation, token.hp, token.layer) == (90, 3, 'map')
    assert table.width == 900 and table.find_entity_by_sprite_id('unrelated') is unrelated
    assert unrelated.name == 'Unsaved unrelated name'
    recovered = [call.args[0] for call in proto.send_to_client.call_args_list if call.args[0].causation_id == original.message_id]
    assert recovered[-1].type == MessageType.SPRITE_RESPONSE and 'updates' not in recovered[-1].data
    assert all('sprite_data' not in call.args[0].data for call in proto.broadcast_to_session.call_args_list)


async def test_failed_current_installation_retains_quarantine_even_after_known_commit(scene, monkeypatch):
    proto, table, factory = scene
    install = proto._install_sprite_resolution
    monkeypatch.setattr(proto, '_install_sprite_resolution', lambda _: (_ for _ in ()).throw(RuntimeError('cache failure')))
    lose_commit(monkeypatch, committed=True)
    original = request(table)
    response = await send(proto, original)
    assert response.data['outcome'] == 'unknown' and proto._has_pending_writes()
    assert table.find_entity_by_sprite_id('token').rotation == 0
    monkeypatch.setattr(proto, '_install_sprite_resolution', install)
    response = await send(proto, copy.deepcopy(original))
    assert response.data['success'] and table.find_entity_by_sprite_id('token').rotation == 30
    assert not proto._has_pending_writes()
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1


async def test_revocation_repairs_cache_without_disclosing_private_history(scene, monkeypatch, player_user):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=True)
    original = request(table)
    assert (await send(proto, original)).data['outcome'] == 'unknown'
    attempt = proto._pending_sprite_write
    with factory() as db:
        game = db.get(models.GameSession, attempt.scopes[0].session_id)
        game.owner_id = player_user.id
        db.query(models.GamePlayer).filter_by(session_id=game.id, user_id=attempt.scopes[0].actor_id).delete()
        db.commit()
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    response = await send(proto, copy.deepcopy(original))
    assert response.type == MessageType.ERROR and response.data['code'] == 'forbidden'
    assert 'can_undo' not in response.data and 'success' not in response.data
    assert table.find_entity_by_sprite_id('token').rotation == 30 and not proto._has_pending_writes()


async def test_reused_pending_identity_rejects_changed_payload_after_repair(scene, monkeypatch):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=True)
    original = request(table)
    assert (await send(proto, original)).data['outcome'] == 'unknown'
    changed = copy.deepcopy(original)
    changed.data['rotation'] = 60
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    response = await send(proto, changed)
    assert response.data['code'] == 'operation_id_conflict'
    assert table.find_entity_by_sprite_id('token').rotation == 30
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1


async def test_missing_accepted_history_cannot_prove_rollback(scene, monkeypatch):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    # A known accepted write whose live installation fails must not be mistaken
    # for rollback when external history/timeline changes remove its receipt.
    install = table.__dict__
    attempt_request = request(table)
    original_persist = SpriteEditorCommandService.persist

    def accepted_then_fail(service, **kwargs):
        original_persist(service, **kwargs)
        proto._pending_sprite_write.accepted = True
        raise RuntimeError('Known commit, lost installation')

    monkeypatch.setattr(SpriteEditorCommandService, 'persist', accepted_then_fail)
    assert (await send(proto, attempt_request)).data['outcome'] == 'unknown'
    with factory() as db:
        db.query(models.CanvasCommandJournal).delete()
        db.commit()
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    assert (await send(proto, copy.deepcopy(attempt_request))).data['outcome'] == 'unknown'
    assert proto._has_pending_writes() and table.__dict__ is install


async def test_repeated_cancellation_waits_for_settlement_installation_and_publication(scene, monkeypatch):
    proto, table, factory = scene
    lose_commit(monkeypatch, committed=True)
    started, release = asyncio.Event(), asyncio.Event()

    async def publish(*_args):
        started.set()
        await release.wait()

    proto.broadcast_to_session.side_effect = publish
    task = asyncio.create_task(proto.handle_client(request(table), 'client'))
    await asyncio.wait_for(started.wait(), 3)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and proto._mutation_lock.locked()
    assert table.find_entity_by_sprite_id('token').rotation == 30
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not proto._mutation_lock.locked() and not proto._has_pending_writes()


async def test_unrecorded_expired_intent_remains_unknown_instead_of_claiming_rollback(scene, monkeypatch):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=False)
    original = request(table)
    assert (await send(proto, original)).data['outcome'] == 'unknown'
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    from utils.time import utc_now
    monkeypatch.setattr('service.sprite_write_recovery.SpriteEditorCommandService', lambda factory: SpriteEditorCommandService(
        factory, now=lambda: utc_now() + timedelta(days=2)))
    assert (await send(proto, copy.deepcopy(original))).data['outcome'] == 'unknown'
    assert proto._has_pending_writes()


@pytest.mark.parametrize('available', [False, True])
async def test_join_settles_after_socket_removal_before_publishing_welcome(scene, monkeypatch, available):
    from service.game_session_protocol import GameSessionProtocolService
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=True)
    assert (await send(proto, request(table))).data['outcome'] == 'unknown'
    attempt = proto._pending_sprite_write
    svc = GameSessionProtocolService.__new__(GameSessionProtocolService)
    svc.server_protocol, svc.table_manager = proto, proto.table_manager
    svc.session_code, svc.game_session_db_id = proto._get_session_code(), attempt.scopes[0].session_id
    svc.db_session = proto.table_manager.db_session
    svc.clients, svc.client_info, svc.websocket_to_client, svc._outboxes = {}, {}, {}, {}
    proto.session_manager = svc
    proto._load_active_choice_encounter = AsyncMock(return_value=None)
    assert not await svc.save_to_database_async(), 'An empty dirty queue cannot discard unresolved sprite ownership'
    if available:
        monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    ws = AsyncMock()
    ws.scope = {'query_string': b''}
    async with proto._mutation_lock:
        if not available:
            with pytest.raises(RuntimeError, match='settle'):
                await svc._register_client(ws, 'replacement', {'user_id': attempt.scopes[0].actor_id}, 'free_roam', {})
            ws.send_text.assert_not_awaited()
            assert not svc.clients and proto._has_pending_writes()
            return
        await svc._register_client(ws, 'replacement', {'user_id': attempt.scopes[0].actor_id}, 'free_roam', {})
    await svc.drain_outbound()
    assert not proto._has_pending_writes() and table.find_entity_by_sprite_id('token').rotation == 30
    ws.send_text.assert_awaited_once()


async def test_recovery_cannot_replace_an_unrelated_live_entity_with_a_colliding_id(scene, monkeypatch):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=True)
    original = request(table)
    assert (await send(proto, original)).data['outcome'] == 'unknown'
    unrelated = table.find_entity_by_sprite_id('unrelated')
    with factory() as db:
        db.query(models.Entity).filter_by(sprite_id='token').one().entity_id = unrelated.entity_id
        db.commit()
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    assert (await send(proto, copy.deepcopy(original))).data['outcome'] == 'unknown'
    assert proto._has_pending_writes() and table.find_entity_by_sprite_id('unrelated') is unrelated
    assert table.find_entity_by_sprite_id('token').rotation == 0


async def test_pending_rotation_cannot_resurrect_a_later_deleted_sprite(scene, monkeypatch):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=True)
    original = request(table)
    assert (await send(proto, original)).data['outcome'] == 'unknown'
    with factory() as db:
        db.query(models.Entity).filter_by(sprite_id='token').delete()
        db.commit()
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    response = await send(proto, copy.deepcopy(original))
    assert response.data['success'] and table.find_entity_by_sprite_id('token') is None
    assert not proto._has_pending_writes()


@pytest.mark.parametrize('committed', [False, True])
async def test_unknown_burst_keeps_every_original_until_later_read_settlement(scene, monkeypatch, committed):
    from service.protocol import sprite_outcomes
    proto, table, factory = scene
    resolver = sprite_outcomes.resolve_sprite_write
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', lambda _: (_ for _ in ()).throw(OSError('outage')))
    lose_commit(monkeypatch, committed=committed)
    originals = [request(table, angle=angle) for angle in [30, 60]]
    summary = await send(proto, Message(MessageType.BATCH_REQUEST, {'messages': [msg.to_dict() for msg in originals]}))
    assert summary.type == MessageType.BATCH_RESPONSE and proto._has_pending_writes()
    assert len(proto._pending_sprite_write.scopes) == 2
    assert all(call.args[0].data['outcome'] == 'unknown' for call in proto.send_to_client.call_args_list[:-1])
    monkeypatch.setattr(sprite_outcomes, 'resolve_sprite_write', resolver)
    proto.send_to_client.reset_mock()
    read = await send(proto, Message(MessageType.TABLE_LIST_REQUEST))
    assert read.type == MessageType.TABLE_LIST_RESPONSE and not proto._has_pending_writes()
    receipts = [call.args[0] for call in proto.send_to_client.call_args_list[:-1]]
    assert [receipt.causation_id for receipt in receipts] == [msg.message_id for msg in originals]
    assert all(receipt.type == (MessageType.SPRITE_RESPONSE if committed else MessageType.ERROR) for receipt in receipts)
    assert table.find_entity_by_sprite_id('token').rotation == (60 if committed else 0)


async def test_missing_table_validation_is_a_barrier_without_discarding_other_members(scene):
    proto, table, factory = scene
    invalid = Message(MessageType.SPRITE_ROTATE, {'sprite_id': 'token', 'rotation': 40})
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {'messages': [
        request(table, angle=30).to_dict(), invalid.to_dict(), request(table, angle=60).to_dict()]}))
    assert response.data['failed_count'] == 1
    assert table.find_entity_by_sprite_id('token').rotation == 60 and not proto._has_pending_writes()
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 2


async def test_whitespace_table_alias_never_exposes_provisional_sprite_state(scene, monkeypatch):
    proto, table, factory = scene
    persist = SpriteEditorCommandService.persist_many

    def save(service, commands):
        # Every committed command must see the earlier live state until its
        # own SQL acceptance, even when the wire uses a whitespace table alias.
        assert len(commands) == 1
        assert table.find_entity_by_sprite_id('token').rotation == commands[0]['before_snapshot']['sprites']['token']['rotation']
        return persist(service, commands)

    monkeypatch.setattr(SpriteEditorCommandService, 'persist_many', save)
    messages = [request(table, angle=angle) for angle in [30, 60]]
    for message in messages:
        message.data['table_id'] = f' {table.table_id} '
    response = await send(proto, Message(MessageType.BATCH_REQUEST, {'messages': [message.to_dict() for message in messages]}))
    assert response.data['failed_count'] == 0 and table.find_entity_by_sprite_id('token').rotation == 60
