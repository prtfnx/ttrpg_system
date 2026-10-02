import json
import math
import time
import uuid

from config import Settings
from core_table.paint import PaintValidationError, validate_paint_object_input
from core_table.protocol import Message, MessageType
from database import models
from database.database import SessionLocal
from service.paint_object_service import (
    PaintCommandError,
    PaintCommandResult,
    PaintObjectService,
    PaintSnapshot,
)
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import can_interact

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)
SNAPSHOT_FRAME_RESERVE_BYTES = 1024
PAINT_PREVIEW_MAX_BYTES = 16 * 1024
PAINT_PREVIEW_AUTH_TTL_SECONDS = 5.0


def _create_paint_object(**kwargs) -> PaintCommandResult:
    return PaintObjectService(SessionLocal).create(**kwargs)


def _update_paint_object(**kwargs) -> PaintCommandResult:
    return PaintObjectService(SessionLocal).update(**kwargs)


def _delete_paint_object(**kwargs) -> PaintCommandResult:
    return PaintObjectService(SessionLocal).delete(**kwargs)


def _paint_snapshot(**kwargs) -> PaintSnapshot | PaintCommandError:
    return PaintObjectService(SessionLocal).snapshot(**kwargs)


def _authorize_paint_preview(
    *,
    session_id: int,
    actor_id: int,
    table_id: str,
) -> bool:
    db = SessionLocal()
    try:
        row = (
            db.query(models.GameSession.owner_id)
            .join(
                models.VirtualTable,
                models.VirtualTable.session_id == models.GameSession.id,
            )
            .filter(
                models.VirtualTable.table_id == table_id,
                models.VirtualTable.session_id == session_id,
            )
            .one_or_none()
        )
        if row is None:
            return False
        if row[0] == actor_id:
            return True
        role = (
            db.query(models.GamePlayer.role)
            .filter(
                models.GamePlayer.session_id == session_id,
                models.GamePlayer.user_id == actor_id,
            )
            .scalar()
        )
        return can_interact(role)
    except Exception:
        logger.exception("Paint preview authorization failed")
        return False
    finally:
        db.close()


def _snapshot_chunks(
    snapshot: PaintSnapshot,
    *,
    max_bytes: int,
) -> list[dict]:
    snapshot_id = str(uuid.uuid4())

    def payload(objects, index=0, count=999999, complete=False):
        return {
            "snapshot_id": snapshot_id,
            "table_id": snapshot.table_id,
            "revision": snapshot.revision,
            "chunk_index": index,
            "chunk_count": count,
            "complete": complete,
            "objects": objects,
        }

    groups: list[list[dict]] = []
    current: list[dict] = []
    for paint_object in snapshot.objects:
        trial = [*current, paint_object]
        size = len(json.dumps(payload(trial), separators=(",", ":")).encode("utf-8"))
        if size <= max_bytes:
            current = trial
            continue
        if not current:
            raise ValueError("A paint object is too large for a snapshot frame")
        groups.append(current)
        current = [paint_object]
        if len(json.dumps(payload(current), separators=(",", ":")).encode("utf-8")) > max_bytes:
            raise ValueError("A paint object is too large for a snapshot frame")
    if current or not groups:
        groups.append(current)

    count = len(groups)
    chunks = [
        payload(group, index=index, count=count, complete=index == count - 1) for index, group in enumerate(groups)
    ]
    if any(len(json.dumps(chunk, separators=(",", ":")).encode("utf-8")) > max_bytes for chunk in chunks):
        raise ValueError("Paint snapshot metadata exceeded the frame budget")
    return chunks


class _PaintMixin(_ProtocolBase):
    """Handler methods for the authoritative paint-object domain."""

    @staticmethod
    def _paint_error(
        error: PaintCommandError,
        operation_id: str | None = None,
    ) -> Message:
        data = {"error": error.message, "code": error.code}
        if operation_id:
            data["operation_id"] = operation_id
        if error.current_object is not None:
            data["current_object"] = error.current_object
        if error.current_version is not None:
            data["current_version"] = error.current_version
        return Message(MessageType.ERROR, data)

    def _paint_context(self, msg: Message, client_id: str) -> tuple[int, int] | None:
        session_id = self._get_session_id(msg)
        actor_id = self._get_user_id(msg, client_id)
        if session_id is None or actor_id is None:
            return None
        return session_id, actor_id

    async def _paint_command_response(
        self,
        result: PaintCommandResult,
        *,
        operation_id: str,
        client_id: str,
    ) -> Message:
        if result.error is not None or result.event is None:
            return self._paint_error(
                result.error or PaintCommandError("invalid_payload", "Paint command failed"),
                operation_id,
            )
        event = Message(MessageType.PAINT_OBJECT_EVENT, result.event)
        if result.broadcast:
            await self.broadcast_to_session(event, client_id)
        return event

    async def handle_paint_object_create(self, msg: Message, client_id: str) -> Message:
        data = msg.data or {}
        operation_id = data.get("operation_id")
        table_id = data.get("table_id")
        editable = data.get("object")
        if not isinstance(operation_id, str) or not isinstance(table_id, str):
            return Message(MessageType.ERROR, {"error": "Invalid paint create envelope"})
        if not isinstance(editable, dict):
            return Message(
                MessageType.ERROR,
                {
                    "error": "Paint object is required",
                    "operation_id": operation_id,
                    "code": "invalid_payload",
                },
            )
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(
                MessageType.ERROR,
                {
                    "error": "Authenticated session context is required",
                    "operation_id": operation_id,
                    "code": "forbidden",
                },
            )
        session_id, actor_id = context
        result = await run_blocking(
            _create_paint_object,
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
            operation_id=operation_id,
            editable=editable,
        )
        return await self._paint_command_response(
            result,
            operation_id=operation_id,
            client_id=client_id,
        )

    async def handle_paint_object_update(self, msg: Message, client_id: str) -> Message:
        data = msg.data or {}
        operation_id = data.get("operation_id")
        table_id = data.get("table_id")
        object_id = data.get("id")
        expected_version = data.get("expected_version")
        editable = data.get("object")
        if not all(isinstance(value, str) for value in (operation_id, table_id, object_id)):
            return Message(MessageType.ERROR, {"error": "Invalid paint update envelope"})
        if not isinstance(expected_version, int) or isinstance(expected_version, bool):
            return Message(
                MessageType.ERROR,
                {
                    "error": "expected_version is required",
                    "operation_id": operation_id,
                    "code": "invalid_payload",
                },
            )
        if not isinstance(editable, dict):
            return Message(
                MessageType.ERROR,
                {
                    "error": "Paint object is required",
                    "operation_id": operation_id,
                    "code": "invalid_payload",
                },
            )
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(
                MessageType.ERROR,
                {
                    "error": "Authenticated session context is required",
                    "operation_id": operation_id,
                    "code": "forbidden",
                },
            )
        session_id, actor_id = context
        result = await run_blocking(
            _update_paint_object,
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
            operation_id=operation_id,
            object_id=object_id,
            expected_version=expected_version,
            editable=editable,
        )
        return await self._paint_command_response(
            result,
            operation_id=operation_id,
            client_id=client_id,
        )

    async def handle_paint_object_delete(self, msg: Message, client_id: str) -> Message:
        data = msg.data or {}
        operation_id = data.get("operation_id")
        table_id = data.get("table_id")
        object_id = data.get("id")
        expected_version = data.get("expected_version")
        if not all(isinstance(value, str) for value in (operation_id, table_id, object_id)):
            return Message(MessageType.ERROR, {"error": "Invalid paint delete envelope"})
        if not isinstance(expected_version, int) or isinstance(expected_version, bool):
            return Message(
                MessageType.ERROR,
                {
                    "error": "expected_version is required",
                    "operation_id": operation_id,
                    "code": "invalid_payload",
                },
            )
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(
                MessageType.ERROR,
                {
                    "error": "Authenticated session context is required",
                    "operation_id": operation_id,
                    "code": "forbidden",
                },
            )
        session_id, actor_id = context
        result = await run_blocking(
            _delete_paint_object,
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
            operation_id=operation_id,
            object_id=object_id,
            expected_version=expected_version,
        )
        return await self._paint_command_response(
            result,
            operation_id=operation_id,
            client_id=client_id,
        )

    async def handle_paint_snapshot_request(self, msg: Message, client_id: str) -> Message:
        data = msg.data or {}
        table_id = data.get("table_id")
        if not isinstance(table_id, str):
            return Message(MessageType.ERROR, {"error": "table_id is required"})
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(
                MessageType.ERROR,
                {
                    "error": "Authenticated session context is required",
                    "code": "forbidden",
                },
            )
        session_id, actor_id = context
        snapshot = await run_blocking(
            _paint_snapshot,
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
        )
        if isinstance(snapshot, PaintCommandError):
            return self._paint_error(snapshot)
        max_bytes = Settings().WS_MAX_MESSAGE_BYTES - SNAPSHOT_FRAME_RESERVE_BYTES
        try:
            chunks = _snapshot_chunks(snapshot, max_bytes=max_bytes)
        except ValueError as exc:
            return self._paint_error(PaintCommandError("limit_exceeded", str(exc)))
        for chunk in chunks[:-1]:
            response = Message(MessageType.PAINT_SNAPSHOT_CHUNK, chunk)
            response.correlation_id = msg.correlation_id or msg.message_id
            response.causation_id = msg.message_id
            await self.send_to_client(response, client_id)
        return Message(MessageType.PAINT_SNAPSHOT_CHUNK, chunks[-1])

    async def _paint_preview_allowed(
        self,
        *,
        session_id: int,
        actor_id: int,
        table_id: str,
    ) -> bool:
        key = (session_id, actor_id, table_id)
        now = time.monotonic()
        cache = getattr(self, "_paint_preview_authorizations", None)
        if cache is None:
            cache = {}
            self._paint_preview_authorizations = cache
        cached = cache.get(key)
        if cached is not None and cached[0] > now:
            return cached[1]
        allowed = await run_blocking(
            _authorize_paint_preview,
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
        )
        cache[key] = (now + PAINT_PREVIEW_AUTH_TTL_SECONDS, allowed)
        if len(cache) > 256:
            self._paint_preview_authorizations = {
                cache_key: value for cache_key, value in cache.items() if value[0] > now
            }
        return allowed

    async def handle_paint_preview(self, msg: Message, client_id: str) -> None:
        if not can_interact(self._get_client_role(client_id)):
            return
        data = msg.data or {}
        table_id = data.get("table_id")
        temporary_id = data.get("temporary_id")
        sequence = data.get("sequence")
        expires_at = data.get("expires_at")
        draft = data.get("draft")
        if not isinstance(table_id, str) or not isinstance(temporary_id, str):
            return
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
            return
        if (
            not isinstance(expires_at, (int, float))
            or isinstance(expires_at, bool)
            or not math.isfinite(expires_at)
            or expires_at <= 0
            or not isinstance(draft, dict)
            or draft.get("id") != temporary_id
        ):
            return
        try:
            validate_paint_object_input(draft)
        except PaintValidationError:
            return
        context = self._paint_context(msg, client_id)
        if context is None:
            return
        session_id, actor_id = context
        relay = {
            "table_id": table_id,
            "temporary_id": temporary_id,
            "sequence": sequence,
            "expires_at": expires_at,
            "draft": draft,
            "actor_id": actor_id,
        }
        try:
            relay_bytes = len(
                json.dumps(
                    relay,
                    allow_nan=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            )
        except (TypeError, ValueError):
            return
        if relay_bytes > PAINT_PREVIEW_MAX_BYTES:
            return
        if not await self._paint_preview_allowed(
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
        ):
            return
        await self.broadcast_to_session(
            Message(MessageType.PAINT_PREVIEW, relay),
            client_id,
        )

    async def handle_paint_preview_cancel(
        self,
        msg: Message,
        client_id: str,
    ) -> None:
        if not can_interact(self._get_client_role(client_id)):
            return
        data = msg.data or {}
        table_id = data.get("table_id")
        temporary_id = data.get("temporary_id")
        sequence = data.get("sequence")
        if not isinstance(table_id, str) or not isinstance(temporary_id, str):
            return
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
            return
        context = self._paint_context(msg, client_id)
        if context is None:
            return
        session_id, actor_id = context
        if not await self._paint_preview_allowed(
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_id,
        ):
            return
        await self.broadcast_to_session(
            Message(
                MessageType.PAINT_PREVIEW_CANCEL,
                {
                    "table_id": table_id,
                    "temporary_id": temporary_id,
                    "sequence": sequence,
                    "actor_id": actor_id,
                },
            ),
            client_id,
        )
