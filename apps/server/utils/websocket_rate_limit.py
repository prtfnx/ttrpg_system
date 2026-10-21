"""Bound transport work while giving disposable drag previews their own budget."""
from collections import deque

from service.command_policy import READ_ONLY_MESSAGE_TYPES


class _TokenBucket:
    def __init__(self, per_minute, burst):
        self.rate = per_minute / 60
        self.capacity = min(per_minute, burst)
        self.tokens = float(self.capacity)
        self.updated = None

    def refill(self, now):
        if self.updated is not None:
            self.tokens = min(self.capacity, self.tokens + max(0, now - self.updated) * self.rate)
        self.updated = now


class WebSocketRateExceeded(Exception):
    pass


class WebSocketMessageLimiter:
    PREVIEW_TYPES = frozenset({
        "sprite_drag_preview",
        "sprite_resize_preview",
        "sprite_rotate_preview",
        "paint_preview",
        "paint_preview_cancel",
    })

    QUERY_TYPES = frozenset(kind.value for kind in READ_ONLY_MESSAGE_TYPES)

    def __init__(self, commands_per_minute: int, previews_per_minute: int):
        self.command_limit = commands_per_minute
        self.preview_limit = previews_per_minute
        self.frames: deque[float] = deque()
        self.commands = _TokenBucket(commands_per_minute, 60)
        self.queries = _TokenBucket(120, 30)
        self.control = _TokenBucket(60, 10)
        self.previews: deque[float] = deque()

    @staticmethod
    def _expire(timestamps: deque[float], now: float) -> None:
        while timestamps and now - timestamps[0] >= 60:
            timestamps.popleft()

    def allow_frame(self, now: float) -> bool:
        self._expire(self.frames, now)
        if len(self.frames) >= self.command_limit + self.preview_limit + 180:
            return False
        self.frames.append(now)
        return True

    def filter_message(self, message: dict, now: float) -> dict | None:
        for bucket in (self.commands, self.queries, self.control):
            bucket.refill(now)
        self._expire(self.previews, now)
        batched = message.get("type") == "batch_request"
        if batched:
            data = message.get("data")
            items = data.get("messages") if isinstance(data, dict) else None
            if not isinstance(items, list) or not 1 <= len(items) <= 50:
                raise ValueError("Batch must contain between 1 and 50 messages")
            if any(not isinstance(item, dict) or item.get("type") == "batch_request" for item in items):
                raise ValueError("Nested or malformed batches are not allowed")
        else:
            items = [message]

        preview_count = sum(item.get("type") in self.PREVIEW_TYPES for item in items)
        query_count = sum(item.get("type") in self.QUERY_TYPES for item in items)
        control_count = sum(item.get("type") == "ping" for item in items)
        command_count = len(items) - preview_count - query_count - control_count
        counts = ((self.commands, command_count), (self.queries, query_count), (self.control, control_count))
        if any(count > bucket.tokens + 1e-9 for bucket, count in counts):
            raise WebSocketRateExceeded
        for bucket, count in counts:
            bucket.tokens -= count

        if len(self.previews) + preview_count > self.preview_limit:
            # Previews are disposable; preserve durable commands and batch sequence.
            items = [item for item in items if item.get("type") not in self.PREVIEW_TYPES]
            if not items:
                return None
            return {**message, "data": {**message["data"], "messages": items}}
        self.previews.extend([now] * preview_count)
        return message
