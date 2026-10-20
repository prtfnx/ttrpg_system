"""Bounded FIFO dispatch, merging only already-queued compatible sprite frames."""
import asyncio
import time
from collections import deque

from core_table.action_batches import _finish_before_cancellation
from core_table.protocol import Message, MessageType
from service.sprite_command_batch import can_buffer
from utils.logger import setup_logger
from utils.websocket_rate_limit import WebSocketMessageLimiter

logger = setup_logger(__name__)


def _sprite_members(request):
    try:
        message = Message.from_dict(request)
        members = [Message.from_dict(item) for item in message.data["messages"]] if message.type == MessageType.BATCH_REQUEST else [message]
        return members if members and all(can_buffer(item) for item in members) else None
    except (ValueError, KeyError, TypeError):
        return None


class WebSocketInbox:
    def __init__(self, dispatch, *, max_messages=64, max_bytes=2 * 1024 * 1024):
        self.dispatch = dispatch
        self.max_messages, self.max_bytes = max_messages, max_bytes
        self.queue = deque()
        self.bytes = 0
        self.ready = asyncio.Event()
        self.closed = False
        self.busy = False
        self.failure_reason = None
        self.task = asyncio.create_task(self._run())

    async def submit(self, request, size):
        if self.busy or self.queue:
            previews = WebSocketMessageLimiter.PREVIEW_TYPES
            if request.get("type") in previews:
                return True  # Disposable samples cannot grow a durable backlog.
            data = request.get("data")
            if request.get("type") == "batch_request" and isinstance(data, dict) and isinstance(data.get("messages"), list):
                members = [item for item in data["messages"] if item.get("type") not in previews]
                if not members:
                    return True
                request = {**request, "data": {**data, "messages": members}}
        if self.closed or len(self.queue) >= self.max_messages or self.bytes + size > self.max_bytes:
            return False
        self.queue.append((request, size, time.perf_counter()))
        self.bytes += size
        self.ready.set()
        # Fairness also permits control traffic and the dispatcher to run when
        # receive_text resolves immediately from an already-buffered socket.
        await asyncio.sleep(0)
        return True

    def _pop(self):
        request, size, queued = self.queue.popleft()
        self.bytes -= size
        return request, queued

    async def _run(self):
        while not self.closed:
            await self.ready.wait()
            if not self.queue:
                self.ready.clear()
                continue
            request, queued = self._pop()
            members = _sprite_members(request)
            merged = 1
            if members:
                while self.queue:
                    following = _sprite_members(self.queue[0][0])
                    if not following or len(members) + len(following) > 50:
                        break
                    self._pop()
                    members.extend(following)
                    merged += 1
                if merged > 1:
                    request = Message(MessageType.BATCH_REQUEST, {"messages": [member.to_dict() for member in members]}).to_dict()
            waited = time.perf_counter() - queued
            if waited >= 0.25 or merged > 1:
                logger.info("Queued protocol work dispatched", extra={"event_name": "websocket.inbox.dispatched",
                    "message_id": request.get("message_id"), "message_type": request.get("type"),
                    "inbox_wait_ms": round(waited * 1000, 2), "merged_frames": merged,
                    "member_count": len(members or []), "queued_frames": len(self.queue), "queued_bytes": self.bytes})
            self.busy = True
            try:
                await self.dispatch(request)
            except Exception:
                self.failure_reason = "dispatch_failed"
                self.closed = True
                self.queue.clear()
                self.bytes = 0
                logger.exception("Inbound dispatcher failed", extra={"event_name": "websocket.inbox.failed",
                    "message_id": request.get("message_id")})
            finally:
                self.busy = False
            if not self.queue:
                self.ready.clear()

    async def close(self):
        # Finish the in-flight command before lifecycle cleanup. Discard queued
        # work that never began; reconnect snapshots resolve those unknowns.
        self.closed = True
        self.queue.clear()
        self.bytes = 0
        self.ready.set()
        await _finish_before_cancellation(self.task)
