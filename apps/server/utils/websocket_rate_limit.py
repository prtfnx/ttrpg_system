"""Bound transport work while giving disposable drag previews their own budget."""
from collections import deque


class WebSocketRateExceeded(Exception):
    pass


class WebSocketMessageLimiter:
    PREVIEW_TYPES = frozenset({
        "sprite_drag_preview", "sprite_resize_preview", "sprite_rotate_preview",
    })

    def __init__(self, commands_per_minute: int, previews_per_minute: int):
        self.command_limit = commands_per_minute
        self.preview_limit = previews_per_minute
        self.frames: deque[float] = deque()
        self.commands: deque[float] = deque()
        self.previews: deque[float] = deque()

    @staticmethod
    def _expire(timestamps: deque[float], now: float) -> None:
        while timestamps and now - timestamps[0] >= 60:
            timestamps.popleft()

    def allow_frame(self, now: float) -> bool:
        self._expire(self.frames, now)
        if len(self.frames) >= self.command_limit + self.preview_limit:
            return False
        self.frames.append(now)
        return True

    def filter_message(self, message: dict, now: float) -> dict | None:
        self._expire(self.commands, now)
        self._expire(self.previews, now)
        batched = message.get("type") == "batch_request"
        if batched:
            data = message.get("data")
            items = data.get("messages") if isinstance(data, dict) else None
            if not isinstance(items, list) or not 1 <= len(items) <= 100:
                raise ValueError("Batch must contain between 1 and 100 messages")
            if any(not isinstance(item, dict) or item.get("type") == "batch_request" for item in items):
                raise ValueError("Nested or malformed batches are not allowed")
        else:
            items = [message]

        preview_count = sum(item.get("type") in self.PREVIEW_TYPES for item in items)
        command_count = len(items) - preview_count
        if len(self.commands) + command_count > self.command_limit:
            raise WebSocketRateExceeded
        self.commands.extend([now] * command_count)

        if len(self.previews) + preview_count > self.preview_limit:
            # Previews are disposable; preserve durable commands and batch sequence.
            items = [item for item in items if item.get("type") not in self.PREVIEW_TYPES]
            if not items:
                return None
            return {**message, "data": {**message["data"], "messages": items}}
        self.previews.extend([now] * preview_count)
        return message
