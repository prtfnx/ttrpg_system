"""Cancellation must preserve combat settlement and its session read barrier."""
import asyncio
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from service.combat_command_service import CombatCommandContext, CombatCommandService
from service.combat_engine import CombatEngine
from service.combat_persistence_service import PersistedCombatCommand
from service.protocol.base import ServerProtocol


@pytest.fixture
def combat():
    code = "CANCELLATION"
    state = CombatEngine.start_combat(code, "table", [], combatants=[{
        "entity_id": "token", "name": "Actor", "controlled_by": ["1"],
    }])
    state.current_turn_index = 0
    started, release = threading.Event(), threading.Event()
    persistence = MagicMock()
    persistence.requester_key.return_value = "user:1"
    persistence.find_result.return_value = None
    context = CombatCommandContext(session_code=code, client_id="dm", role="owner", user_id=1)
    payload = {"sequence_id": 5, "commands": [{"type": "dash", "actor_id": state.combatants[0].combatant_id}]}
    try:
        yield state, started, release, persistence, context, payload
    finally:
        release.set()
        CombatEngine._active.pop(code, None)


async def wait_for_thread(event):
    async def poll():
        while not event.is_set():
            await asyncio.sleep(.001)
    await asyncio.wait_for(poll(), 2)


@pytest.mark.parametrize("failure", [False, True])
async def test_cancelled_combat_caller_waits_for_commit_or_rollback(combat, failure):
    state, started, release, persistence, context, payload = combat

    def commit(**kwargs):
        started.set()
        assert release.wait(3)
        if failure:
            raise RuntimeError("Injected commit failure")
        return PersistedCombatCommand(result=kwargs["result_payload"], state_version=1)

    persistence.persist_accepted.side_effect = commit
    service = CombatCommandService(persistence=persistence)
    task = asyncio.create_task(service.apply_async(service.parse_envelope(payload), context))
    try:
        await wait_for_thread(started)
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert not task.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 2)
        current = CombatEngine.get_state(context.session_code)
        assert current is not None
        assert current.state_version == (0 if failure else 1)
        assert current.combatants[0].has_action is failure
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.parametrize("failure", [False, True])
async def test_cancelled_dispatch_holds_session_lock_through_publication(combat, failure):
    state, started, release, persistence, context, payload = combat
    publication_started, publication_release = asyncio.Event(), asyncio.Event()
    read_started = asyncio.Event()
    delivered = []

    def commit(**kwargs):
        started.set()
        assert release.wait(3)
        if failure:
            raise RuntimeError("Injected commit failure")
        return PersistedCombatCommand(result=kwargs["result_payload"], state_version=1)

    async def send(message, client):
        if message.type == MessageType.ACTION_RESULT and client == "peer":
            publication_started.set()
            await publication_release.wait()
        delivered.append((message.type, client))

    persistence.persist_accepted.side_effect = commit
    session = SimpleNamespace(session_code=context.session_code, game_session_db_id=1,
                              client_info={"dm": {"role": "owner", "user_id": 1},
                                           "peer": {"role": "co_dm", "user_id": 2}})
    proto = ServerProtocol(TableManager(), session_manager=session, transport_send=send)
    proto.combat_persistence_service = persistence

    async def read(message, client):
        read_started.set()
        return await proto.handle_combat_state_request(message, client)

    proto.register_handler(MessageType.COMBAT_STATE_REQUEST, read)
    task = asyncio.create_task(proto.handle_client(Message(MessageType.COMBAT_COMMAND, payload), "dm"))
    read_task = None
    try:
        await wait_for_thread(started)
        task.cancel()
        await asyncio.sleep(0)
        read_task = asyncio.create_task(proto.handle_client(Message(MessageType.COMBAT_STATE_REQUEST, {}), "peer"))
        await asyncio.sleep(0)
        assert proto._mutation_lock.locked() and not read_started.is_set()
        release.set()
        if not failure:
            await asyncio.wait_for(publication_started.wait(), 2)
            task.cancel()
            await asyncio.sleep(0)
            assert proto._mutation_lock.locked() and not read_started.is_set()
            assert state.state_version == 1
        publication_release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 2)
        await asyncio.wait_for(read_task, 2)
        assert read_started.is_set()
        assert ((MessageType.ACTION_RESULT, "peer") in delivered) is not failure
        current = CombatEngine.get_state(context.session_code)
        assert current is not None
        assert current.state_version == (0 if failure else 1)
        assert current.combatants[0].has_action is failure
    finally:
        release.set()
        publication_release.set()
        await asyncio.gather(task, *([read_task] if read_task else []), return_exceptions=True)


async def test_cancellation_before_session_ownership_does_not_apply_command(combat):
    _, _, _, persistence, _, payload = combat
    proto = ServerProtocol(TableManager(), transport_send=AsyncMock())
    handler = AsyncMock()
    proto.register_handler(MessageType.COMBAT_COMMAND, handler)
    async with proto._mutation_lock:
        task = asyncio.create_task(proto.handle_client(Message(MessageType.COMBAT_COMMAND, payload), "dm"))
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    handler.assert_not_awaited()
    persistence.persist_accepted.assert_not_called()
