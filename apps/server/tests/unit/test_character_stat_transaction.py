"""Source documents and linked-token stat projections share one acceptance."""
import asyncio
import json
import threading
from types import SimpleNamespace

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud, models
from managers import character_manager
from service.combat_engine import CombatEngine
from service.protocol import characters
from service.protocol.base import ServerProtocol
from sqlalchemy.orm import Session, sessionmaker


def legacy_repair_source(linked):
    with linked.factory() as db:
        source = db.query(models.SessionCharacter).one()
        source.character_data = json.dumps({'character_id': linked.character_id, 'name': 'Hero',
                                           'hp': 7, 'max_hp': 20, 'ac': 12})
        db.commit()


async def reconcile(linked, options):
    request = Message(MessageType.CHARACTER_UPDATE,
        {'character_id': linked.character_id, 'stat_reconciliation': options})
    await linked.proto.handle_client(request, 'dm')
    return request, next(response for response in reversed(linked.responses) if response.causation_id == request.message_id)


@pytest.fixture
def linked(test_db, test_db_engine, test_game_session, monkeypatch):
    factory = sessionmaker(bind=test_db_engine, expire_on_commit=False)
    monkeypatch.setattr(character_manager, "SessionLocal", factory)
    monkeypatch.setattr(character_manager, "_server_character_manager", character_manager.ServerCharacterManager())
    manager = TableManager(test_db)
    character_id = "linked-hero"
    code, session_id, owner = test_game_session.session_code, test_game_session.id, test_game_session.owner_id
    test_db.add(models.SessionCharacter(
        character_id=character_id, session_id=session_id, owner_user_id=owner, character_name="Hero", version=1,
        character_data=json.dumps({"character_id": character_id, "name": "Hero", "schemaVersion": 1,
                                   "data": {"stats": {"hp": 20, "maxHp": 20, "ac": 12}}}),
    ))
    test_db.commit()
    tokens = []
    tables = []
    for index, layer in enumerate(("tokens", "dungeon_master", "tokens")):
        table = manager.create_table(f"Scene {index}", 1000, 1000)
        token = table.add_entity({"sprite_id": f"linked-{index}", "position": [100, 100], "layer": layer,
                                  "character_id": character_id, "hp": 20, "max_hp": 20, "ac": 12})
        crud.save_table_to_db(test_db, table, session_id)
        tokens.append(token)
        tables.append(table)
    manager.remove_table(str(tables[-1].table_id))
    events, responses = [], []

    async def send(message, _client):
        Message.from_json(message.to_json())  # Validate the actual outgoing contract, not only JSON encoding.
        responses.append(message)

    session = SimpleNamespace(session_code=code, game_session_db_id=session_id,
                              client_info={"dm": {"user_id": owner, "role": "owner"}})
    proto = ServerProtocol(manager, session_manager=session, transport_send=send)

    async def broadcast(message, layer, client_id):
        events.append((message, layer))

    proto.broadcast_filtered = broadcast

    def forbidden_write(*_args):
        raise AssertionError("Publication must not open a second token transaction")

    monkeypatch.setattr(characters, "persist_character_token_stats", forbidden_write)

    async def update(patch, version=1):
        request = Message(MessageType.CHARACTER_UPDATE,
            {"character_id": character_id, "updates": patch, "version": version})
        await proto.handle_client(request, "dm")
        return next(message for message in reversed(responses) if message.causation_id == request.message_id)

    try:
        yield SimpleNamespace(factory=factory, proto=proto, code=code, session_id=session_id,
            character_id=character_id, tokens=tokens, tables=tables, events=events, update=update,
            responses=responses, owner=owner)
    finally:
        CombatEngine._active.pop(code, None)


def saved_state(linked):
    with linked.factory() as db:
        character = db.query(models.SessionCharacter).filter_by(character_id=linked.character_id).one()
        return (character.version, json.loads(character.character_data),
                [(e.hp, e.max_hp, e.ac) for e in db.query(models.Entity).order_by(models.Entity.id)],
                db.query(models.CharacterLog).count())


async def test_character_version_logs_and_loaded_unloaded_token_stats_commit_together(linked):
    response = await linked.update({"data": {"stats": {"hp": 0, "maxHp": 30, "ac": 0}}})
    assert response.data["success"] and response.data["version"] == 2
    version, document, tokens, logs = saved_state(linked)
    assert version == 2 and document["data"]["stats"] == {"hp": 0, "maxHp": 30, "ac": 0}
    assert tokens == [(0, 30, 0)] * 3 and logs > 0
    assert [(token.hp, token.max_hp, token.ac) for token in linked.tokens[:2]] == [(0, 30, 0)] * 2
    assert [layer for _, layer in linked.events] == ["tokens", "dungeon_master", "tokens"]
    with linked.factory() as db:
        table, success = crud.load_table_from_db(db, str(linked.tables[-1].table_id))
        assert success and table is not None
        token = table.find_entity_by_sprite_id("linked-2")
        assert token is not None and token.hp == 0


async def test_reconciliation_previews_then_repairs_loaded_unloaded_projections_and_is_idempotent(linked):
    legacy_repair_source(linked)
    before = saved_state(linked)
    _, preview = await reconcile(linked, {'mode': 'dry_run'})
    report = preview.data['report']
    assert report['status'] == 'repairable' and report['token_mismatch_count'] == 3
    assert '_updates' not in report and saved_state(linked) == before and not linked.events
    _, response = await reconcile(linked, {'mode': 'apply', 'expected_digest': report['expected_digest']})
    assert response.data['success'] and response.data['version'] == 2
    assert saved_state(linked)[2] == [(7, 20, 12)] * 3
    assert [token.hp for token in linked.tokens[:2]] == [7, 7]
    assert [layer for _, layer in linked.events] == ['tokens', 'dungeon_master', 'tokens']
    after = saved_state(linked)
    _, clean = await reconcile(linked, {'mode': 'dry_run'})
    assert clean.data['report']['status'] == 'clean'
    _, response = await reconcile(linked, {'mode': 'apply', 'expected_digest': clean.data['report']['expected_digest']})
    assert response.data['success'] and saved_state(linked) == after


async def test_reconciliation_rejects_stale_plans_and_non_dm_requests(linked):
    legacy_repair_source(linked)
    _, preview = await reconcile(linked, {'mode': 'dry_run'})
    with linked.factory() as db:
        db.query(models.Entity).first().hp = 2
        db.commit()
    _, rejected = await reconcile(linked, {'mode': 'apply', 'expected_digest': preview.data['report']['expected_digest']})
    assert not rejected.data['success'] and 'fresh dry run' in rejected.data['error']
    assert saved_state(linked)[0] == 1 and not linked.events
    linked.proto.session_manager.client_info['dm']['role'] = 'player'
    _, rejected = await reconcile(linked, {'mode': 'dry_run'})
    assert not rejected.data['success'] and 'report' not in rejected.data


@pytest.mark.parametrize('committed', [False, True])
async def test_repair_recovery_retains_original_digest_and_never_applies_the_patch_twice(linked, monkeypatch, committed):
    legacy_repair_source(linked)
    _, preview = await reconcile(linked, {'mode': 'dry_run'})
    recovery, lookup = lose_character_commit_response(linked, monkeypatch, committed, unavailable=True)
    request, uncertain = await reconcile(linked, {'mode': 'apply', 'expected_digest': preview.data['report']['expected_digest']})
    assert uncertain.type == MessageType.ERROR and uncertain.data['code'] == 'character_outcome_unknown'
    assert not await linked.proto.table_manager.save_to_database_async(linked.session_id)
    monkeypatch.setattr(recovery, '_lookup', lookup)
    await linked.proto.handle_client(request, 'dm')
    receipts = [response for response in linked.responses if response.type == MessageType.CHARACTER_UPDATE_RESPONSE
                and response.causation_id == request.message_id]
    assert len(receipts) == 1 and receipts[0].data['success'] is committed
    assert saved_state(linked)[0] == (2 if committed else 1)
    assert [token.hp for token in linked.tokens[:2]] == [7 if committed else 20] * 2


async def test_projection_failure_rolls_back_document_version_logs_and_all_token_writes(linked, monkeypatch):
    before = saved_state(linked)
    stage = character_manager.stage_character_token_stats

    def failed(db, session_id, character_id, stats):
        result = stage(db, session_id, character_id, stats)
        assert len(result) == 3
        assert db.query(models.SessionCharacter.version).scalar() == 2
        assert db.query(models.Entity.hp).all() == [(5,), (5,), (5,)]
        raise RuntimeError("Failure after source and linked rows were flushed")

    monkeypatch.setattr(character_manager, "stage_character_token_stats", failed)
    response = await linked.update({"data": {"stats": {"hp": 5}}})
    assert not response.data["success"]
    assert saved_state(linked) == before
    assert not linked.events and [token.hp for token in linked.tokens[:2]] == [20, 20]


@pytest.mark.parametrize("patch,version", [({"data": {"stats": {"hp": -1}}}, 1),
                                         ({"data": {"stats": {"hp": 5}}}, 99),
                                         ({"hp": 5}, 1),
                                         ({"hp": 9, "data": {"stats": {"hp": 5}}}, 1)])
async def test_invalid_or_conflicting_source_never_changes_linked_tokens(linked, patch, version):
    before = saved_state(linked)
    response = await linked.update(patch, version)
    assert not response.data["success"]
    assert saved_state(linked) == before and not linked.events


async def test_removing_stats_clears_projections_and_name_edits_do_not_rewrite_them(linked):
    response = await linked.update({"data": {"stats": None}})
    assert response.data["success"]
    assert saved_state(linked)[2] == [(None, None, None)] * 3
    linked.events.clear()
    response = await linked.update({"name": "Renamed"}, version=2)
    assert response.data["success"] and not linked.events
    assert saved_state(linked)[2] == [(None, None, None)] * 3


async def test_transport_failure_does_not_skip_other_live_projections(linked):
    calls = []

    async def failed(message, layer, client):
        assert [token.hp for token in linked.tokens[:2]] == [5, 5]
        calls.append(layer)
        if len(calls) == 1:
            raise ConnectionError("Peer failed during projection publication")

    linked.proto.broadcast_filtered = failed
    response = await linked.update({"data": {"stats": {"hp": 5}}})
    assert response.data["success"] and response.data["resync_required"] and len(calls) == 3
    assert saved_state(linked)[2] == [(5, 20, 12)] * 3


async def test_character_notification_failure_cannot_reject_an_accepted_update(linked):
    async def failed(*_args):
        raise ConnectionError("Character recipient disconnected")

    linked.proto._broadcast_character_event = failed
    response = await linked.update({"data": {"stats": {"hp": 5}}})
    assert response.data["success"] and response.data["resync_required"]
    assert saved_state(linked)[0] == 2 and saved_state(linked)[2] == [(5, 20, 12)] * 3


async def test_sheet_update_does_not_overwrite_active_encounter_resources(linked):
    state = CombatEngine.start_combat(linked.code, str(linked.tables[0].table_id), [], combatants=[
        {"entity_id": "linked-0", "character_id": linked.character_id, "hp": 20, "max_hp": 20},
    ])
    response = await linked.update({"data": {"stats": {"hp": 5}}})
    assert response.data["success"] and saved_state(linked)[2] == [(5, 20, 12)] * 3
    assert state.combatants[0].hp == 20


async def test_cancelled_character_update_retains_ownership_through_cache_installation(linked, monkeypatch):
    stage = character_manager.stage_character_token_stats
    started, release = threading.Event(), threading.Event()

    def delayed(*args):
        result = stage(*args)
        started.set()
        assert release.wait(5)
        return result

    monkeypatch.setattr(character_manager, "stage_character_token_stats", delayed)
    task = asyncio.create_task(linked.update({"data": {"stats": {"hp": 5}}}))
    saver = None

    async def admitted():
        while not started.is_set():
            await asyncio.sleep(.001)

    try:
        await asyncio.wait_for(admitted(), 2)
        table_id = str(linked.tables[0].table_id)
        saver = asyncio.create_task(linked.proto.table_manager.save_table_async(table_id, linked.session_id))
        await asyncio.sleep(0)
        assert not saver.done() and linked.proto.table_manager.table_write_lock(table_id).locked()
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done() and linked.proto._mutation_lock.locked()
        assert [token.hp for token in linked.tokens[:2]] == [20, 20]
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 2)
        assert [token.hp for token in linked.tokens[:2]] == [5, 5]
        assert await saver
        assert saved_state(linked)[0] == 2
        assert saved_state(linked)[2] == [(5, 20, 12)] * 3
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
        if saver is not None:
            await asyncio.gather(saver, return_exceptions=True)


def lose_character_commit_response(linked, monkeypatch, committed, unavailable=False):
    original_factory = character_manager.SessionLocal
    first = True

    class LostResponseSession(Session):
        def commit(self):
            nonlocal first
            if first:
                first = False
                if committed:
                    super().commit()
                else:
                    super().rollback()
                raise OSError('Lost character commit response')
            return super().commit()

    monkeypatch.setattr(character_manager, 'SessionLocal', sessionmaker(
        bind=original_factory.kw['bind'], class_=LostResponseSession, expire_on_commit=False,
    ))
    recovery = character_manager.get_server_character_manager().update_recovery
    lookup = recovery._lookup
    if unavailable:
        def offline(_attempt):
            raise OSError('Character outcome database unavailable')
        monkeypatch.setattr(recovery, '_lookup', offline)
    return recovery, lookup


@pytest.mark.parametrize('committed', [False, True])
async def test_character_commit_error_resolves_before_success_or_rejection(linked, monkeypatch, committed):
    lose_character_commit_response(linked, monkeypatch, committed)
    response = await linked.update({'data': {'stats': {'hp': 5}}})
    assert response.data['success'] is committed
    assert saved_state(linked)[0] == (2 if committed else 1)
    assert saved_state(linked)[2] == [(5 if committed else 20, 20, 12)] * 3
    assert [token.hp for token in linked.tokens[:2]] == [5 if committed else 20] * 2
    assert not linked.proto._has_pending_writes()


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('replay', [False, True])
async def test_character_lookup_outage_fences_snapshots_then_recovers_the_original_request(
    linked, monkeypatch, committed, replay,
):
    recovery, lookup = lose_character_commit_response(linked, monkeypatch, committed, unavailable=True)
    patch = {'data': {'stats': {'hp': 5}}}
    uncertain = await linked.update(patch)
    original_id = uncertain.causation_id
    assert uncertain.type == MessageType.ERROR and uncertain.data['outcome'] == 'unknown'
    assert 'success' not in uncertain.data
    assert linked.proto._has_pending_writes()
    assert [token.hp for token in linked.tokens[:2]] == [20, 20]
    assert not await linked.proto.table_manager.save_to_database_async(linked.session_id)
    denied = await linked.update({'data': {'stats': {'hp': 10}}})
    assert denied.type == MessageType.ERROR and denied.data['outcome'] == 'unknown'
    await linked.proto.handle_client(Message(MessageType.PING, {}), 'dm')
    assert linked.responses[-1].type == MessageType.PONG
    assert saved_state(linked)[0] == (2 if committed else 1)
    monkeypatch.setattr(recovery, '_lookup', lookup)
    if replay:
        request = Message(MessageType.CHARACTER_UPDATE,
            {'character_id': linked.character_id, 'updates': patch, 'version': 1}, message_id=original_id)
    else:
        request = Message(MessageType.TABLE_REQUEST, {'table_id': str(linked.tables[0].table_id)})
    await linked.proto.handle_client(request, 'dm')
    receipts = [message for message in linked.responses if message.type == MessageType.CHARACTER_UPDATE_RESPONSE
                and message.causation_id == original_id]
    assert len(receipts) == 1 and receipts[0].data['success'] is committed
    assert not linked.proto._has_pending_writes()
    assert [token.hp for token in linked.tokens[:2]] == [5 if committed else 20] * 2
    # Replaying the original request during recovery must not increment again.
    assert saved_state(linked)[0] == (2 if committed else 1)
    assert await linked.proto.table_manager.save_to_database_async(linked.session_id)
    assert saved_state(linked)[2] == [(5 if committed else 20, 20, 12)] * 3


async def test_cancelled_character_recovery_waits_for_installation(linked, monkeypatch):
    recovery, lookup = lose_character_commit_response(linked, monkeypatch, True, unavailable=True)
    assert (await linked.update({'data': {'stats': {'hp': 5}}})).type == MessageType.ERROR
    started, release = threading.Event(), threading.Event()

    def delayed(attempt):
        started.set()
        assert release.wait(5)
        return lookup(attempt)

    monkeypatch.setattr(recovery, '_lookup', delayed)
    task = asyncio.create_task(linked.proto.handle_client(
        Message(MessageType.TABLE_REQUEST, {'table_id': str(linked.tables[0].table_id)}), 'dm'))

    async def admitted():
        while not started.is_set():
            await asyncio.sleep(.001)

    try:
        await asyncio.wait_for(admitted(), 2)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert not task.done() and linked.proto._mutation_lock.locked()
        assert not linked.proto.table_manager.persistence_allowed()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 2)
        assert [token.hp for token in linked.tokens[:2]] == [5, 5]
        assert not linked.proto._has_pending_writes()
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


async def test_recovery_cannot_reuse_original_identity_for_different_updates(linked, monkeypatch):
    recovery, lookup = lose_character_commit_response(linked, monkeypatch, True, unavailable=True)
    uncertain = await linked.update({'data': {'stats': {'hp': 5}}})
    monkeypatch.setattr(recovery, '_lookup', lookup)
    request = Message(MessageType.CHARACTER_UPDATE,
        {'character_id': linked.character_id, 'updates': {'data': {'stats': {'hp': 9}}}, 'version': 1},
        message_id=uncertain.causation_id)
    await linked.proto.handle_client(request, 'dm')
    response = linked.responses[-1]
    assert response.type == MessageType.ERROR and response.data['code'] == 'operation_id_conflict'
    assert saved_state(linked)[0] == 2 and saved_state(linked)[2] == [(5, 20, 12)] * 3
