"""Real protocol/SQLite regressions for durable choice outcomes and cache fencing."""
import asyncio
import json
import threading
from types import SimpleNamespace

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import models
from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService
from service.choice_operation_service import ChoiceOperationService
from service.encounter_engine import EncounterEngine
from service.protocol.base import ServerProtocol
from service.session_operation_receipts import OperationOutcomeUnknown
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

pytestmark = pytest.mark.asyncio


@pytest.fixture
def game(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'choice-protocol.db'}", connect_args={'check_same_thread': False})
    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'protocol-choice-{i}', hashed_password='unused') for i in (1, 2, 3, 4)])
        db.flush()
        db.add(models.GameSession(id=1, session_code='CHOICE', name='Protocol', owner_id=1))
        db.flush()
        db.add_all([models.GamePlayer(session_id=1, user_id=i, role=role)
                    for i, role in ((2, 'co_dm'), (3, 'player'), (4, 'spectator'))])
        db.commit()
    store = ChoiceEncounterPersistenceService(factory)
    clients = {'dm': {'user_id': 1, 'role': 'owner'}, 'codm': {'user_id': 2, 'role': 'co_dm'},
               'player': {'user_id': 3, 'role': 'player'}, 'spectator': {'user_id': 4, 'role': 'spectator'}}
    session = SimpleNamespace(session_code='CHOICE', game_session_db_id=1, client_info=clients)
    frames = []

    async def transport(message, client):
        Message.from_json(message.to_json())
        frames.append((message, client))

    proto = ServerProtocol(TableManager(), session_manager=session, transport_send=transport)
    proto.clients.update(dict.fromkeys(clients))
    monkeypatch.setattr(proto, '_encounter_store', lambda: store)

    async def send(kind, data=None, client='dm', original=None):
        request = original or Message(kind, data or {})
        await proto.handle_client(request, client)
        response = next(frame for frame, recipient in reversed(frames)
                        if recipient == client and frame.causation_id == request.message_id)
        return request, response

    async def start(client='dm'):
        return await send(MessageType.ENCOUNTER_START, {'title': 'Crossroads', 'dm_notes': 'Private secret',
            'choices': [{'choice_id': 'go', 'text': 'Go', 'requires_roll': True, 'roll_dc': 10}], 'participants': ['3']}, client)

    async def prepare(kind, client='dm'):
        if kind == MessageType.ENCOUNTER_START:
            return {'choices': [{'text': 'Go'}]}, client
        _, started = await start(client)
        target = started.data['encounter_id']
        if kind == MessageType.ENCOUNTER_ROLL:
            await send(MessageType.ENCOUNTER_CHOICE, {'encounter_id': target, 'choice_id': 'go'}, 'player')
        return {'encounter_id': target, **({'choice_id': 'go'} if kind != MessageType.ENCOUNTER_END else {})}, (
            client if kind == MessageType.ENCOUNTER_END else 'player')

    yield SimpleNamespace(factory=factory, engine=engine, store=store, frames=frames, proto=proto,
                          send=send, start=start, prepare=prepare, clients=clients)
    EncounterEngine._active.pop('CHOICE', None)
    engine.dispose()


async def test_start_uses_current_db_authority_and_only_actor_dm_view_has_private_notes(game):
    _, response = await game.start()
    assert response.type == MessageType.ENCOUNTER_STATE and response.data['accepted']
    assert response.data['encounter']['dm_notes'] == 'Private secret'
    peers = [frame for frame, client in game.frames if client != 'dm']
    assert peers and all(frame.data['encounter']['dm_notes'] == '' for frame in peers)
    with game.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1


@pytest.mark.parametrize('client', ['player', 'spectator'])
async def test_non_dm_cannot_start_even_if_client_role_claims_owner(game, client):
    game.clients[client]['role'] = 'owner'
    _, response = await game.start(client)
    assert response.type == MessageType.ERROR and response.data['code'] == 'forbidden'


@pytest.mark.parametrize('kind,data', [(MessageType.ENCOUNTER_START, {}),
    (MessageType.ENCOUNTER_CHOICE, {'choice_id': 'go'}), (MessageType.ENCOUNTER_END, {}),
    (MessageType.ENCOUNTER_ROLL, {'encounter_id': 'target', 'bonus': True})])
async def test_invalid_direct_handler_payloads_fail_before_admission(game, kind, data):
    _, response = await game.send(kind, data)
    assert response.type == MessageType.ERROR and response.data['code'] == 'invalid_payload'
    with game.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 0


async def test_choice_and_roll_progress_once_then_end_removes_live_prompt(game):
    original, started = await game.start()
    target = started.data['encounter_id']
    choice, response = await game.send(MessageType.ENCOUNTER_CHOICE, {'encounter_id': target, 'choice_id': 'go'}, 'player')
    assert response.data['status'] == 'roll_required'
    _, rolled = await game.send(MessageType.ENCOUNTER_ROLL, {'encounter_id': target, 'choice_id': 'go'}, 'player')
    assert rolled.data['accepted'] and len(rolled.data['encounter']['roll_results']) == 1
    _, duplicate = await game.send(choice.type, client='player', original=choice)
    assert duplicate.data['replayed'] and len(duplicate.data['encounter']['roll_results']) == 1
    end, ended = await game.send(MessageType.ENCOUNTER_END, {'encounter_id': target})
    assert ended.data['ended'] and ended.data['encounter'] is None and EncounterEngine.get('CHOICE') is None
    for request in (original, end):
        _, replay = await game.send(request.type, original=request)
        assert replay.data['replayed'] and replay.data['encounter'] is None
    with game.factory() as db:
        assert db.query(models.ChoiceEncounterEvent).count() == 4


async def test_replayed_old_end_does_not_clear_new_prompt_or_publish_again(game):
    _, started = await game.start()
    end, _ = await game.send(MessageType.ENCOUNTER_END, {'encounter_id': started.data['encounter_id']})
    _, newer = await game.start()
    before = len(game.frames)
    _, replay = await game.send(end.type, original=end)
    assert replay.data['encounter']['encounter_id'] == newer.data['encounter_id']
    active = EncounterEngine.get('CHOICE')
    assert active is not None and active.encounter_id == newer.data['encounter_id']
    assert len(game.frames) == before + 1


def lose_response(game, monkeypatch, committed):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise OSError('Commit response lost')

    monkeypatch.setattr(game.store, '_session_factory', sessionmaker(bind=game.engine, class_=LostResponse))


@pytest.mark.parametrize('kind', [MessageType.ENCOUNTER_START, MessageType.ENCOUNTER_END,
                                MessageType.ENCOUNTER_CHOICE, MessageType.ENCOUNTER_ROLL])
@pytest.mark.parametrize('committed', [False, True])
async def test_unknown_choice_fences_snapshots_then_settles_exact_original(game, monkeypatch, kind, committed):
    data, client = await game.prepare(kind)
    before = EncounterEngine.get('CHOICE')
    before = json.loads(json.dumps(before.to_dict(dm=True))) if before else None
    lose_response(game, monkeypatch, committed)
    lookup = ChoiceOperationService.lookup

    def offline(*_args, **_kwargs):
        raise OperationOutcomeUnknown('Lookup unavailable')

    monkeypatch.setattr(ChoiceOperationService, 'lookup', offline)
    request, unknown = await game.send(kind, data, client)
    assert unknown.data['outcome'] == 'unknown' and 'not_accepted' not in unknown.data
    assert game.proto._has_pending_writes() and not game.proto.table_manager.persistence_allowed()
    active = EncounterEngine.get('CHOICE')
    assert (active.to_dict(dm=True) if active else None) == before
    assert (await game.send(MessageType.PING))[1].type == MessageType.PONG
    _, blocked = await game.send(MessageType.ENCOUNTER_START, {'choices': [{'text': 'Later'}]})
    assert blocked.data['outcome'] == 'unknown'
    monkeypatch.setattr(ChoiceOperationService, 'lookup', lookup)
    _, settled = await game.send(kind, client=client, original=request)
    assert (settled.type != MessageType.ERROR) is committed
    assert not game.proto._has_pending_writes() and game.proto.table_manager.persistence_allowed()
    if committed:
        assert settled.data['replayed'] and settled.data['accepted']
    else:
        assert settled.data['not_accepted']


async def test_cache_failure_after_socket_removal_retains_admitted_actor_until_join_recovery(game, monkeypatch):
    install = game.proto._install_choice

    def broken(_outcome):
        game.clients.clear()
        raise RuntimeError('Cache install failed after socket removal')

    monkeypatch.setattr(game.proto, '_install_choice', broken)
    request, unknown = await game.start()
    assert unknown.data['code'] == 'choice_outcome_unknown' and game.proto._has_pending_writes()
    assert game.proto._pending_choice.identity.actor_id == 1
    monkeypatch.setattr(game.proto, '_install_choice', install)
    async with game.proto._mutation_lock:
        current = await game.proto._load_active_choice_encounter('CHOICE')
    assert current is not None and not game.proto._has_pending_writes()
    with game.factory() as db:
        assert db.query(models.SessionOperationReceipt).one().operation_id == request.message_id


async def test_revoked_actor_recovery_repairs_cache_without_private_outcome(game, monkeypatch):
    lose_response(game, monkeypatch, True)
    lookup = ChoiceOperationService.lookup

    def offline(*_args, **_kwargs):
        raise OperationOutcomeUnknown('Unavailable')

    monkeypatch.setattr(ChoiceOperationService, 'lookup', offline)
    request, _ = await game.start('codm')
    with game.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).one().role = 'player'
        db.commit()
    monkeypatch.setattr(ChoiceOperationService, 'lookup', lookup)
    _, response = await game.send(request.type, client='codm', original=request)
    assert response.type == MessageType.ERROR and response.data['code'] == 'forbidden'
    assert 'encounter' not in response.data and 'accepted_version' not in response.data
    assert EncounterEngine.get('CHOICE') is not None and not game.proto._has_pending_writes()


async def test_changed_original_payload_cannot_take_pending_receipt(game, monkeypatch):
    install = game.proto._install_choice
    monkeypatch.setattr(game.proto, '_install_choice', lambda _: (_ for _ in ()).throw(RuntimeError('Install failed')))
    request, _ = await game.start()
    monkeypatch.setattr(game.proto, '_install_choice', install)
    changed = Message(request.type, {**request.data, 'title': 'Changed'}, message_id=request.message_id)
    _, response = await game.send(changed.type, original=changed)
    assert response.data['code'] == 'operation_id_conflict'
    with game.factory() as db:
        assert db.query(models.ChoiceEncounterEvent).count() == 1


async def test_recovery_cancellation_retains_ownership_until_current_installation(game, monkeypatch):
    install = game.proto._install_choice
    monkeypatch.setattr(game.proto, '_install_choice', lambda _: (_ for _ in ()).throw(RuntimeError('Install failed')))
    await game.start()
    monkeypatch.setattr(game.proto, '_install_choice', install)
    lookup = ChoiceOperationService.lookup
    entered, release = threading.Event(), threading.Event()

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return lookup(*args, **kwargs)

    monkeypatch.setattr(ChoiceOperationService, 'lookup', delayed)
    task = asyncio.create_task(game.send(MessageType.TABLE_LIST_REQUEST))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert not task.done() and game.proto._mutation_lock.locked()
        assert not game.proto.table_manager.persistence_allowed()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert EncounterEngine.get('CHOICE') is not None and not game.proto._has_pending_writes()
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


async def test_publication_failure_cannot_reject_an_accepted_transition(game, monkeypatch):
    async def fail(*_args, **_kwargs):
        raise OSError('Peer unavailable')

    monkeypatch.setattr(game.proto, 'broadcast_to_session', fail)
    _, response = await game.start()
    assert response.data['accepted'] and response.data['resync_required']
    assert EncounterEngine.get('CHOICE') is not None and not game.proto._has_pending_writes()
    with game.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == 1
