"""Production dispatch and SQLite barriers for choice/join worker ownership."""

import asyncio
import copy
import json
import threading
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database.models import Base, ChoiceEncounter, GameSession, User
from service.choice_encounter_persistence_service import (
    ChoiceEncounterPersistenceError,
    ChoiceEncounterPersistenceService,
)
from service.encounter_engine import EncounterEngine
from service.game_session_protocol import GameSessionProtocolService
from service.server_protocol import ServerProtocol
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.asyncio


@pytest.fixture
def game(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'choice.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add(User(id=1, username='owner', email='owner@example.com', hashed_password='unused'))
        db.flush()
        db.add(GameSession(id=1, session_code='WORK', name='Workers', owner_id=1, is_active=True))
        db.commit()
    loop_thread = threading.get_ident()
    sessions = []

    @contextmanager
    def worker_factory():
        assert threading.get_ident() != loop_thread
        with factory() as db:
            sessions.append(threading.get_ident())
            yield db

    monkeypatch.setattr('service.session_join_hydration.SessionLocal', worker_factory)
    store = ChoiceEncounterPersistenceService(worker_factory)
    svc = GameSessionProtocolService.__new__(GameSessionProtocolService)
    svc.session_code, svc.game_session_db_id, svc.db_session = 'WORK', 1, True
    svc.clients, svc.websocket_to_client, svc._outboxes = {}, {}, {}
    svc.client_info = {'dm': {'user_id': 1, 'role': 'owner'}}
    svc.table_manager = TableManager()
    proto = ServerProtocol(svc.table_manager, session_manager=svc, transport_send=AsyncMock())
    svc.server_protocol = proto
    monkeypatch.setattr(proto, '_encounter_store', lambda: store)
    responses = []

    async def send(kind, data=None, client='dm'):
        async def capture(response, _client):
            responses.append(response)
        proto._transport_send = capture
        await proto.handle_client(Message(kind, data or {}), client)
        return responses[-1]

    yield SimpleNamespace(svc=svc, proto=proto, store=store, factory=factory, send=send,
                          sessions=sessions, responses=responses)
    EncounterEngine._active.pop('WORK', None)
    engine.dispose()


async def start(game, *, roll=False):
    response = await game.send(MessageType.ENCOUNTER_START, {
        'title': 'Crossroads', 'choices': [{'choice_id': 'go', 'text': 'Go',
            'requires_roll': roll, 'roll_ability': 'dexterity', 'roll_dc': 10}],
        'participants': ['1'], 'dm_notes': 'Secret',
    })
    assert response.type == MessageType.ENCOUNTER_STATE
    return response.data['encounter']['encounter_id']


@pytest.mark.parametrize('kind', [MessageType.ENCOUNTER_START, MessageType.ENCOUNTER_END,
                                MessageType.ENCOUNTER_CHOICE, MessageType.ENCOUNTER_ROLL])
async def test_repeated_cancellation_keeps_mutation_until_worker_and_publication(game, monkeypatch, kind):
    if kind != MessageType.ENCOUNTER_START:
        await start(game, roll=kind == MessageType.ENCOUNTER_ROLL)
    if kind == MessageType.ENCOUNTER_ROLL:
        await game.send(MessageType.ENCOUNTER_CHOICE, {'choice_id': 'go'})
    entered, release = threading.Event(), threading.Event()
    save = game.store.save_snapshot

    def delayed(**kwargs):
        entered.set()
        assert release.wait(5)
        save(**kwargs)

    monkeypatch.setattr(game.store, 'save_snapshot', delayed)
    publication = AsyncMock()
    monkeypatch.setattr(game.svc, 'broadcast_to_session', publication)
    data = {'choices': [{'choice_id': 'go', 'text': 'Go'}]} if kind == MessageType.ENCOUNTER_START else {'choice_id': 'go'}
    task = asyncio.create_task(game.send(kind, data))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert game.proto._mutation_lock.locked() and not task.done()
        # Heartbeats bypass session mutation ownership while SQL is blocked.
        assert (await game.send(MessageType.PING)).type == MessageType.PONG
    finally:
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    publication.assert_awaited_once()
    assert not game.proto._mutation_lock.locked()
    with game.factory() as db:
        row = db.query(ChoiceEncounter).one()
        assert row.ended_at is not None if kind == MessageType.ENCOUNTER_END else row.ended_at is None
    assert game.sessions


async def test_join_read_orders_welcome_before_completion_and_restart_cannot_restore_ended(game, monkeypatch):
    encounter_id = await start(game)
    EncounterEngine._active.pop('WORK')  # Simulate cold process hydration.
    entered, release = threading.Event(), threading.Event()
    load = game.store.load_active

    def delayed(*args):
        snapshot = load(*args)
        entered.set()
        assert release.wait(5)
        return snapshot

    monkeypatch.setattr(game.store, 'load_active', delayed)
    ws = AsyncMock()
    join = asyncio.create_task(game.svc.add_client(ws, 'join', {'user_id': 2, 'role': 'player'}))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        end = asyncio.create_task(game.send(MessageType.ENCOUNTER_END, {'encounter_id': encounter_id}))
        await asyncio.sleep(0)
        assert not end.done() and 'join' not in game.svc.clients
        assert (await game.send(MessageType.PING)).type == MessageType.PONG
    finally:
        release.set()
    await asyncio.gather(join, end)
    await game.svc.drain_outbound()
    frames = [json.loads(call.args[0]) for call in ws.send_text.call_args_list]
    assert [frame['type'] for frame in frames] == ['welcome', 'encounter_result']
    assert frames[0]['data']['choice_encounter']['dm_notes'] == ''
    assert EncounterEngine.get('WORK') is None
    restarted = AsyncMock()
    await game.svc.add_client(restarted, 'restart', {'user_id': 3, 'role': 'player'})
    assert json.loads(restarted.send_text.call_args.args[0])['data']['choice_encounter'] is None


async def test_cancelled_join_discards_late_snapshot_without_registration_or_resurrection(game, monkeypatch):
    encounter_id = await start(game)
    EncounterEngine._active.pop('WORK')
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    load = game.store.load_active

    def delayed(*args):
        snapshot = load(*args)
        entered.set()
        assert release.wait(5)
        finished.set()
        return snapshot

    monkeypatch.setattr(game.store, 'load_active', delayed)
    ws = AsyncMock()
    join = asyncio.create_task(game.svc.add_client(ws, 'cancelled', {'user_id': 2, 'role': 'player'}))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        join.cancel()
        with pytest.raises(asyncio.CancelledError):
            await join
        monkeypatch.setattr(game.store, 'load_active', load)
        await game.send(MessageType.ENCOUNTER_END, {'encounter_id': encounter_id})
    finally:
        release.set()
    assert await asyncio.to_thread(finished.wait, 2)
    await asyncio.sleep(0)
    assert EncounterEngine.get('WORK') is None
    assert 'cancelled' not in game.svc.clients
    ws.send_text.assert_not_awaited()


async def test_failed_selection_restores_detached_before_state(game, monkeypatch):
    await start(game)
    active = EncounterEngine.get('WORK')
    assert active is not None
    before = copy.deepcopy(active.to_dict(dm=True))

    def fail(**kwargs):
        raise ChoiceEncounterPersistenceError('SQL unavailable')

    monkeypatch.setattr(game.store, 'save_snapshot', fail)
    publication = AsyncMock()
    monkeypatch.setattr(game.svc, 'broadcast_to_session', publication)
    assert (await game.send(MessageType.ENCOUNTER_CHOICE, {'choice_id': 'go'})).type == MessageType.ERROR
    restored = EncounterEngine.get('WORK')
    assert restored is not None and restored.to_dict(dm=True) == before
    publication.assert_not_awaited()


async def test_failed_hydration_registers_no_client_and_closes_worker_session(game, monkeypatch):
    def fail(*args):
        raise ChoiceEncounterPersistenceError('SQL unavailable')
    monkeypatch.setattr(game.store, 'load_active', fail)
    with pytest.raises(ChoiceEncounterPersistenceError):
        await game.svc.add_client(AsyncMock(), 'failed', {'user_id': 2, 'role': 'player'})
    assert 'failed' not in game.svc.clients and not game.proto._mutation_lock.locked()


async def test_join_ban_and_rules_are_read_on_worker(game):
    with game.factory() as db:
        session = db.get(GameSession, 1)
        session.ban_list = json.dumps([{'player_id': '2', 'reason': 'blocked'}])
        session.session_rules_json = json.dumps({'turns': 'strict'})
        session.game_mode = 'turn_based'
        db.commit()
    with pytest.raises(PermissionError, match='Banned: blocked'):
        await game.svc.add_client(AsyncMock(), 'banned', {'user_id': 2, 'role': 'player'})
    assert 'banned' not in game.svc.clients
    ws = AsyncMock()
    await game.svc.add_client(ws, 'allowed', {'user_id': 3, 'role': 'player'})
    data = json.loads(ws.send_text.call_args.args[0])['data']
    assert data['game_mode'] == 'turn_based'
    assert data['session_rules'] == {'turns': 'strict', 'session_id': 'WORK'}
