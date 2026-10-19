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


async def test_large_recovery_serializes_lazily_and_preserves_event_order():
    started, release = asyncio.Event(), asyncio.Event()
    delivered, serialized = [], []

    def snapshot():
        for index in range(4):
            serialized.append(index)
            yield str(index) * 32  # Each frame exceeds the ordinary event budget.

    async def send(payload):
        started.set()
        await release.wait()
        delivered.append(payload)

    failed = AsyncMock()
    box = WebSocketOutbox(send, failed, max_bytes=16)
    assert box.enqueue_snapshot(snapshot())
    assert not serialized  # No large serialized copy is retained in the queue.
    assert box.enqueue("receipt")
    await started.wait()
    assert serialized == [0] and box.bytes == len("receipt")
    release.set()
    await box.drain()
    assert delivered == [str(index) * 32 for index in range(4)] + ["receipt"]
    assert not box.snapshots and not box.bytes
    failed.assert_not_awaited()


async def test_recovery_has_separate_bounded_stream_and_byte_budgets():
    failed = AsyncMock()
    box = WebSocketOutbox(AsyncMock(), failed, max_snapshots=1)
    assert box.enqueue_snapshot(iter(["snapshot"]))
    assert not box.enqueue_snapshot(iter(["another snapshot"]))
    await box.drain()
    failed.assert_awaited_once()
    assert box.closed and not box.snapshots

    failed = AsyncMock()
    box = WebSocketOutbox(AsyncMock(), failed, max_snapshot_bytes=4)
    assert box.enqueue_snapshot(iter(["too large"]))
    await box.drain()
    failed.assert_awaited_once()
    assert box.closed and not box.snapshots
