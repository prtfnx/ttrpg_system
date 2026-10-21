"""Bounded FIFO delivery; a slow peer never owns the session mutation lock."""
import asyncio
import time
from collections import deque

from utils.logger import setup_logger

logger = setup_logger(__name__)


class WebSocketOutbox:
    def __init__(self, send, failed, *, max_messages=256, max_bytes=4 * 1024 * 1024,
                 max_snapshots=2, max_snapshot_frames=2048, max_snapshot_bytes=128 * 1024 * 1024):
        self.send, self.failed = send, failed
        self.max_messages, self.max_bytes = max_messages, max_bytes
        self.queue = deque()
        self.bytes = 0
        # Recovery already owns a validated domain snapshot. Retain at most a
        # table and a paint snapshot, and serialize their frames lazily. Charging
        # all chunks to the ordinary event budget would reject healthy resyncs.
        self.max_snapshots = max_snapshots
        self.max_snapshot_frames = max_snapshot_frames
        self.max_snapshot_bytes = max_snapshot_bytes
        self.snapshots = 0
        self.task = None
        self.closed = False
        self.failure_details = {}

    def enqueue(self, payload, *, disposable=False):
        if self.closed:
            return False
        size = len(payload.encode("utf-8"))
        if len(self.queue) >= self.max_messages or self.bytes + size > self.max_bytes:
            if disposable:
                return False
            self._failure("queue_overflow")
            self.close()
            self.task = asyncio.create_task(self.failed())
            return False
        self.queue.append((payload, size, time.monotonic()))
        self.bytes += size
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._deliver())
        return True

    def enqueue_snapshot(self, frames):
        if self.closed:
            return False
        if self.snapshots >= self.max_snapshots or len(self.queue) >= self.max_messages:
            self._failure("snapshot_queue_overflow")
            self.close()
            self.task = asyncio.create_task(self.failed())
            return False
        self.snapshots += 1
        self.queue.append((iter(frames), None, time.monotonic()))
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._deliver())
        return True

    async def _deliver(self):
        try:
            while self.queue and not self.closed:
                payload, size, queued_at = self.queue.popleft()
                if size is None:
                    snapshot_bytes = 0
                    for index, frame in enumerate(payload):
                        snapshot_bytes += len(frame.encode("utf-8"))
                        if index >= self.max_snapshot_frames or snapshot_bytes > self.max_snapshot_bytes:
                            self._failure("snapshot_budget_exceeded")
                            raise ValueError("Recovery snapshot exceeds delivery budget")
                        await self._send_frame(frame, queued_at)
                    self.snapshots -= 1
                    continue
                # Count the in-flight frame against the byte budget as well.
                await self._send_frame(payload, queued_at)
                self.bytes -= size
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if not self.failure_details:
                self._failure("send_timeout" if isinstance(exc, TimeoutError) else "send_failed", error_type=type(exc).__name__)
            self.close()
            await self.failed()

    def _failure(self, reason, **fields):
        self.failure_details = {"reason": reason, "queued_messages": len(self.queue),
            "queued_bytes": self.bytes, "snapshot_streams": self.snapshots, **fields}

    async def _send_frame(self, payload, queued_at):
        started = time.monotonic()
        try:
            await self.send(payload)
        except Exception as exc:
            self._failure("send_timeout" if isinstance(exc, TimeoutError) else "send_failed",
                error_type=type(exc).__name__, send_ms=round((time.monotonic() - started) * 1000, 2),
                queue_ms=round((started - queued_at) * 1000, 2))
            raise
        elapsed = time.monotonic() - started
        waited = started - queued_at
        if elapsed >= 0.25 or waited >= 0.5:
            logger.info("WebSocket delivery delayed", extra={"event_name": "websocket.delivery.delayed",
                "send_ms": round(elapsed * 1000, 2), "queue_ms": round(waited * 1000, 2),
                "queued_messages": len(self.queue), "queued_bytes": self.bytes, "snapshot_streams": self.snapshots})

    async def drain(self):
        task = self.task
        if task is not None and task is not asyncio.current_task():
            await task

    def close(self):
        self.closed = True
        self.queue.clear()
        self.bytes = 0
        self.snapshots = 0
        if self.task is not None and self.task is not asyncio.current_task():
            self.task.cancel()
