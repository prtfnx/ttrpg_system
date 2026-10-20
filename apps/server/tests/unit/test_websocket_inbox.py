import asyncio
from unittest.mock import AsyncMock

from core_table.protocol import Message, MessageType
from service.websocket_inbox import WebSocketInbox

TABLE = "550e8400-e29b-41d4-a716-446655440000"


def rotate(angle):
    return Message(MessageType.SPRITE_ROTATE, {"table_id": TABLE, "sprite_id": "s", "rotation": angle}).to_dict()


async def test_merges_already_buffered_frames_and_preserves_read_barriers():
    release, done = asyncio.Event(), asyncio.Event()
    dispatched = []

    async def dispatch(request):
        dispatched.append(request)
        if len(dispatched) == 1:
            await release.wait()
        if len(dispatched) == 4:
            done.set()

    inbox = WebSocketInbox(dispatch)
    requests = [rotate(index) for index in range(4)]
    try:
        await inbox.submit(requests[0], 100)
        await inbox.submit(requests[1], 100)
        await inbox.submit(requests[2], 100)
        await inbox.submit(Message(MessageType.TABLE_REQUEST, {"table_id": TABLE}).to_dict(), 100)
        await inbox.submit(requests[3], 100)
        release.set()
        await asyncio.wait_for(done.wait(), 1)
        assert [item["type"] for item in dispatched] == ["sprite_rotate", "batch_request", "table_request", "sprite_rotate"]
        assert [item["message_id"] for item in dispatched[1]["data"]["messages"]] == [item["message_id"] for item in requests[1:3]]
        assert inbox.bytes == 0
    finally:
        release.set()
        await inbox.close()


async def test_bounds_durable_admission_and_drops_disposable_backlog():
    release = asyncio.Event()
    inbox = WebSocketInbox(lambda _request: release.wait(), max_messages=1, max_bytes=200)
    try:
        await inbox.submit(rotate(0), 100)
        for _ in range(100):
            assert await inbox.submit({"type": "sprite_drag_preview", "data": {}}, 100)
        assert not inbox.queue
        assert await inbox.submit(rotate(1), 100)
        assert not await inbox.submit(rotate(2), 100)
        assert len(inbox.queue) == 1 and inbox.bytes == 100
    finally:
        release.set()
        await inbox.close()


async def test_disconnect_waits_for_inflight_work_and_discards_unstarted_work():
    release = asyncio.Event()
    dispatch = AsyncMock(side_effect=lambda _request: None)

    async def blocked(request):
        await release.wait()
        await dispatch(request)

    inbox = WebSocketInbox(blocked)
    await inbox.submit(rotate(0), 100)
    await inbox.submit(rotate(1), 100)
    closing = asyncio.create_task(inbox.close())
    await asyncio.sleep(0)
    assert not closing.done()
    release.set()
    await closing
    dispatch.assert_awaited_once()
