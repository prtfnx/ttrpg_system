import asyncio
import copy
import json
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud, models
from service.protocol.base import ServerProtocol
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def placement(test_db, test_db_engine, test_game_session, monkeypatch):
    factory = sessionmaker(bind=test_db_engine, expire_on_commit=False)
    monkeypatch.setattr('service.protocol.base.SessionLocal', factory)
    monkeypatch.setattr('service.protocol.canvas.SessionLocal', factory)
    manager = TableManager(test_db)
    table = manager.create_table('NPC', 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    session = SimpleNamespace(game_session_db_id=test_game_session.id, session_code=test_game_session.session_code,
        client_info={'dm': {'user_id': test_game_session.owner_id, 'role': 'owner'}})
    proto = ServerProtocol(manager, session_manager=session)
    proto.send_to_client = AsyncMock()
    proto.broadcast_filtered = AsyncMock()
    request = Message(MessageType.COMPENDIUM_SPRITE_ADD, {'table_id': str(table.table_id),
        'sprite_data': {'sprite_id': 'npc', 'asset_id': 'already-resolved', 'x': 100, 'y': 100, 'hp': 999},
        'monster_data': {'name': 'Goblin', 'raw': {'hit_points': '7 (2d6)', 'armor_class': 15,
            'stats': {'DEX': 14}, 'actions': [{'name': 'Scimitar'}]}}})

    async def send(message, target=None):
        target = target or proto
        await target.handle_client(message, 'dm')
        sender = target.send_to_client
        assert isinstance(sender, AsyncMock)
        return Message.from_json(sender.call_args.args[0].to_json())
    return SimpleNamespace(factory=factory, proto=proto, table=table, request=request, send=send)


async def test_npc_source_token_and_receipt_commit_together_and_replay_after_restart(placement):
    p = placement
    retry = copy.deepcopy(p.request)
    result = await p.send(p.request)
    assert result.type == MessageType.SPRITE_RESPONSE
    assert (result.data['sprite_data']['hp'], result.data['sprite_data']['max_hp'], result.data['sprite_data']['ac']) == (7, 7, 15)
    with p.factory() as db:
        source = db.query(models.SessionCharacter).one()
        assert source.version == 1 and json.loads(source.character_data)['data']['stats']['hp'] == 7
        assert db.query(models.Entity).one().character_id == source.character_id
        assert db.query(models.CanvasCommandJournal).count() == 1
    restarted = ServerProtocol(p.proto.table_manager, session_manager=p.proto.session_manager)
    restarted.send_to_client = AsyncMock()
    restarted.broadcast_filtered = AsyncMock()
    replay = await p.send(retry, restarted)
    assert replay.data['resync_required'] and 'sprite_data' not in replay.data
    assert p.proto.broadcast_filtered.await_count == 1
    restarted.broadcast_filtered.assert_not_awaited()
    with p.factory() as db:
        assert db.query(models.SessionCharacter).count() == db.query(models.Entity).count() == 1


async def test_failed_token_flush_leaves_no_orphan_source_or_receipt(placement, monkeypatch):
    from service import sprite_editor_commands
    stage = sprite_editor_commands.stage_sprite_delta

    def fail(*args, **kwargs):
        stage(*args, **kwargs)
        raise RuntimeError('Failed after token flush')
    monkeypatch.setattr(sprite_editor_commands, 'stage_sprite_delta', fail)
    assert (await placement.send(placement.request)).type == MessageType.ERROR
    assert placement.table.find_entity_by_sprite_id('npc') is None
    placement.proto.broadcast_filtered.assert_not_awaited()
    with placement.factory() as db:
        assert db.query(models.SessionCharacter).count() == db.query(models.Entity).count() == db.query(models.CanvasCommandJournal).count() == 0


async def test_invalid_monster_does_not_fall_back_to_an_unlinked_token(placement):
    placement.request.data['monster_data']['raw']['hit_points'] = 'unknown'
    assert (await placement.send(placement.request)).type == MessageType.ERROR
    assert placement.table.find_entity_by_sprite_id('npc') is None


@pytest.mark.parametrize('cancel', [False, True])
async def test_token_resolution_initialization_and_sql_are_worker_owned(placement, monkeypatch, cancel):
    from core_table.compendiums import token_resolution_service
    entered, release = threading.Event(), threading.Event()
    loop_thread = threading.get_ident()
    lookups = []

    class Resolver:
        def get_token_info(self, name, monster_type):
            assert threading.get_ident() != loop_thread
            lookups.append((name, monster_type))
            entered.set()
            assert release.wait(5)
            # The real resolver likewise creates and closes its own session.
            with placement.factory() as db:
                assert db.query(models.GameSession).count() == 1
            return {'asset_id': 'worker-resolved'}

    def initialize():
        assert threading.get_ident() != loop_thread
        return Resolver()

    monkeypatch.setattr(token_resolution_service, 'get_token_service', initialize)
    placement.request.data['sprite_data'].pop('asset_id')
    retry = copy.deepcopy(placement.request)
    task = asyncio.create_task(placement.send(placement.request))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        assert placement.proto._mutation_lock.locked()
        ping = await placement.send(Message(MessageType.PING, {}))
        assert ping.type == MessageType.PONG
        if cancel:
            for _ in range(2):
                task.cancel()
                await asyncio.sleep(0)
            assert not task.done()
    finally:
        release.set()
    if cancel:
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        assert (await task).type == MessageType.SPRITE_RESPONSE
    assert placement.table.find_entity_by_sprite_id('npc').asset_id == 'worker-resolved'
    assert (await placement.send(retry)).data['resync_required']
    assert lookups == [('Goblin', '')]
    with placement.factory() as db:
        assert db.query(models.SessionCharacter).count() == db.query(models.Entity).count() == 1


async def test_cancelled_npc_creation_holds_session_ownership_through_installation(placement, monkeypatch):
    from service import sprite_editor_commands
    stage = sprite_editor_commands.stage_compendium_npc
    started, release = threading.Event(), threading.Event()

    def delayed(*args, **kwargs):
        stage(*args, **kwargs)
        started.set()
        assert release.wait(5)
    monkeypatch.setattr(sprite_editor_commands, 'stage_compendium_npc', delayed)
    task = asyncio.create_task(placement.send(placement.request))
    assert await asyncio.to_thread(started.wait, 2)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    assert placement.proto._mutation_lock.locked()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert placement.table.find_entity_by_sprite_id('npc').hp == 7
