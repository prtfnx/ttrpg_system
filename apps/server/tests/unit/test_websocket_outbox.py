import asyncio
from unittest.mock import AsyncMock

from service.websocket_outbox import WebSocketOutbox


async def test_fifo_delivery_does_not_wait_for_a_slow_peer():
    started, release = asyncio.Event(), asyncio.Event()
    delivered = []

    async def slow(payload):
        started.set()
        await release.wait()
        delivered.append(payload)

    failed = AsyncMock()
    box = WebSocketOutbox(slow, failed)
    assert box.enqueue("event") and box.enqueue("receipt")
    await started.wait()
    fast = AsyncMock()
    other = WebSocketOutbox(fast, failed)
    other.enqueue("other client receipt")
    await other.drain()
    fast.assert_awaited_once()
    assert not delivered
    release.set()
    await box.drain()
    assert delivered == ["event", "receipt"]
    failed.assert_not_awaited()


async def test_overflow_drops_previews_but_disconnects_for_durable_delivery():
    failed = AsyncMock()
    box = WebSocketOutbox(AsyncMock(), failed, max_messages=1, max_bytes=16)
    assert box.enqueue("first")
    assert not box.enqueue("preview", disposable=True)
    assert not box.closed
    assert not box.enqueue("receipt")
    await box.drain()
    assert box.closed and box.bytes == 0
    failed.assert_awaited_once()


async def test_send_failure_closes_queue_and_requests_resynchronization():
    failed = AsyncMock()
    box = WebSocketOutbox(AsyncMock(side_effect=OSError("offline")), failed)
    box.enqueue("event")
    box.enqueue("receipt")
    await box.drain()
    assert box.closed and not box.queue
    failed.assert_awaited_once()
