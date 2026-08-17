import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from service.protocol.base import ServerProtocol


def _protocol(handlers):
    protocol = object.__new__(ServerProtocol)
    protocol.handlers = handlers
    protocol._mutation_lock = asyncio.Lock()
    protocol._transport_send = AsyncMock()
    return protocol


@pytest.mark.asyncio
async def test_session_mutations_are_dispatched_in_waiter_order():
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    events = []

    async def mutate(message, _client_id):
        label = message.data["label"]
        events.append(f"start:{label}")
        if label == "first":
            first_started.set()
            await release_first.wait()
        events.append(f"end:{label}")

    protocol = _protocol({
        MessageType.TABLE_UPDATE_REQUEST: mutate,
        MessageType.SPRITE_CREATE: mutate,
    })
    protocol.session_manager = SimpleNamespace(
        auto_save=lambda: events.append("autosave:first")
    )
    first = asyncio.create_task(protocol.handle_client(
        Message(MessageType.TABLE_UPDATE_REQUEST, {"label": "first"}),
        "client-1",
    ))
    await asyncio.wait_for(first_started.wait(), timeout=1)
    second = asyncio.create_task(protocol.handle_client(
        Message(MessageType.SPRITE_CREATE, {"label": "second"}),
        "client-2",
    ))
    await asyncio.sleep(0)

    assert events == ["start:first"]

    release_first.set()
    await asyncio.gather(first, second)
    assert events == [
        "start:first",
        "end:first",
        "autosave:first",
        "start:second",
        "end:second",
    ]


@pytest.mark.asyncio
async def test_read_only_message_does_not_wait_for_session_mutation():
    mutation_started = asyncio.Event()
    release_mutation = asyncio.Event()
    read_completed = asyncio.Event()

    async def mutate(_message, _client_id):
        mutation_started.set()
        await release_mutation.wait()

    async def read(_message, _client_id):
        read_completed.set()

    protocol = _protocol({
        MessageType.COMBAT_COMMAND: mutate,
        MessageType.PING: read,
    })
    mutation = asyncio.create_task(protocol.handle_client(
        Message(MessageType.COMBAT_COMMAND, {}),
        "client-1",
    ))
    await asyncio.wait_for(mutation_started.wait(), timeout=1)

    await asyncio.wait_for(
        protocol.handle_client(Message(MessageType.PING, {}), "client-2"),
        timeout=1,
    )
    assert read_completed.is_set()

    release_mutation.set()
    await mutation


@pytest.mark.asyncio
async def test_session_state_read_waits_for_mutation_rollback_boundary():
    mutation_started = asyncio.Event()
    release_mutation = asyncio.Event()
    read_started = asyncio.Event()

    async def mutate(_message, _client_id):
        mutation_started.set()
        await release_mutation.wait()

    async def read_state(_message, _client_id):
        read_started.set()

    protocol = _protocol({
        MessageType.COMBAT_COMMAND: mutate,
        MessageType.COMBAT_STATE_REQUEST: read_state,
    })
    mutation = asyncio.create_task(protocol.handle_client(
        Message(MessageType.COMBAT_COMMAND, {}),
        "client-1",
    ))
    await asyncio.wait_for(mutation_started.wait(), timeout=1)
    read = asyncio.create_task(protocol.handle_client(
        Message(MessageType.COMBAT_STATE_REQUEST, {}),
        "client-2",
    ))
    await asyncio.sleep(0)

    assert not read_started.is_set()

    release_mutation.set()
    await asyncio.gather(mutation, read)
    assert read_started.is_set()


@pytest.mark.asyncio
async def test_different_sessions_can_mutate_concurrently():
    first_started = asyncio.Event()
    second_started = asyncio.Event()
    release = asyncio.Event()

    async def first_handler(_message, _client_id):
        first_started.set()
        await release.wait()

    async def second_handler(_message, _client_id):
        second_started.set()
        await release.wait()

    first_protocol = _protocol({MessageType.COMBAT_COMMAND: first_handler})
    second_protocol = _protocol({MessageType.COMBAT_COMMAND: second_handler})
    first = asyncio.create_task(first_protocol.handle_client(
        Message(MessageType.COMBAT_COMMAND, {}),
        "client-1",
    ))
    second = asyncio.create_task(second_protocol.handle_client(
        Message(MessageType.COMBAT_COMMAND, {}),
        "client-2",
    ))

    await asyncio.wait_for(
        asyncio.gather(first_started.wait(), second_started.wait()),
        timeout=1,
    )
    release.set()
    await asyncio.gather(first, second)


@pytest.mark.asyncio
async def test_batch_request_cannot_bypass_session_mutation_lock():
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    handled = []

    async def mutate(message, _client_id):
        label = message.data["label"]
        handled.append(label)
        if label == "first":
            first_started.set()
            await release_first.wait()

    protocol = _protocol({MessageType.COMBAT_COMMAND: mutate})
    protocol.handlers[MessageType.BATCH_REQUEST] = protocol.handle_batch_request

    def batch(label):
        return Message(MessageType.BATCH_REQUEST, {
            "messages": [Message(
                MessageType.COMBAT_COMMAND,
                {"label": label},
            ).to_dict()],
        })

    first = asyncio.create_task(protocol.handle_client(batch("first"), "client-1"))
    await asyncio.wait_for(first_started.wait(), timeout=1)
    second = asyncio.create_task(protocol.handle_client(batch("second"), "client-2"))
    await asyncio.sleep(0)

    assert handled == ["first"]

    release_first.set()
    await asyncio.gather(first, second)
    assert handled == ["first", "second"]
