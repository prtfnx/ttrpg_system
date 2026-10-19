"""Bounded FIFO delivery; a slow peer never owns the session mutation lock."""
import asyncio
from collections import deque


class WebSocketOutbox:
    def __init__(self, send, failed, *, max_messages=256, max_bytes=4 * 1024 * 1024):
        self.send, self.failed = send, failed
        self.max_messages, self.max_bytes = max_messages, max_bytes
        self.queue = deque()
        self.bytes = 0
        self.task = None
        self.closed = False

    def enqueue(self, payload, *, disposable=False):
        if self.closed:
            return False
        size = len(payload.encode("utf-8"))
        if len(self.queue) >= self.max_messages or self.bytes + size > self.max_bytes:
            if disposable:
                return False
            self.close()
            self.task = asyncio.create_task(self.failed())
            return False
        self.queue.append((payload, size))
        self.bytes += size
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._deliver())
        return True

    async def _deliver(self):
        try:
            while self.queue and not self.closed:
                payload, size = self.queue.popleft()
                # Count the in-flight frame against the byte budget as well.
                await self.send(payload)
                self.bytes -= size
        except asyncio.CancelledError:
            raise
        except Exception:
            self.close()
            await self.failed()

    async def drain(self):
        task = self.task
        if task is not None and task is not asyncio.current_task():
            await task

    def close(self):
        self.closed = True
        self.queue.clear()
        self.bytes = 0
        if self.task is not None and self.task is not asyncio.current_task():
            self.task.cancel()
