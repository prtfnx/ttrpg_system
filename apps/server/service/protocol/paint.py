import json
import math
import time
import uuid
from dataclasses import dataclass

from config import Settings
from core_table.paint import PaintValidationError, validate_paint_object_input
from core_table.protocol import Message, MessageType
from database import crud, models
from database.database import SessionLocal
from service.paint_object_service import (
    PaintCommandError,
    PaintCommandResult,
    PaintObjectService,
    PaintSnapshot,
)
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import can_interact, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)
SNAPSHOT_FRAME_RESERVE_BYTES = 1024
PAINT_PREVIEW_MAX_BYTES = 16 * 1024
PAINT_PREVIEW_AUTH_TTL_SECONDS = 5.0


@dataclass(frozen=True)
class _PaintResult:
    payload: dict | None = None
    error: str | None = None
    broadcast: bool = False


def _table_in_session(db, table_id: str, session_id: int) -> bool:
    return db.query(models.VirtualTable.id).filter(
        models.VirtualTable.table_id == table_id,
        models.VirtualTable.session_id == session_id,
    ).first() is not None


def _create_paint_stroke(
    *,
    table_id: str,
    session_id: int,
    stroke_id: str,
    stroke_data: str,
    user_id: int,
) -> _PaintResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _PaintResult(error="Table not found in this session")
        existing = crud.get_paint_stroke(db, table_id, stroke_id)
        if existing is not None:
            if existing.created_by == user_id and existing.stroke_data == stroke_data:
                return _PaintResult(payload={
                    "operation": "create",
                    "stroke": existing.to_dict(),
                    "table_id": table_id,
                })
            return _PaintResult(error="stroke_id already exists")
        stroke = crud.create_paint_stroke(db, table_id, stroke_id, stroke_data, user_id)
        return _PaintResult(
            payload={
                "operation": "create",
                "stroke": stroke.to_dict(),
                "table_id": table_id,
            },
            broadcast=True,
        )
    except Exception:
        logger.exception("Paint stroke creation failed")
        return _PaintResult(error="Paint stroke creation failed")
    finally:
        db.close()


def _delete_paint_stroke(
    *,
    table_id: str,
    session_id: int,
    stroke_id: str,
    created_by: int | None,
) -> _PaintResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _PaintResult(error="Table not found in this session")
        deleted = crud.delete_paint_stroke(
            db,
            table_id,
            stroke_id,
            created_by=created_by,
        )
        if not deleted:
            return _PaintResult(error="Stroke not found")
        return _PaintResult(
            payload={"operation": "delete", "stroke_id": stroke_id, "table_id": table_id},
            broadcast=True,
        )
    except Exception:
        logger.exception("Paint stroke deletion failed")
        return _PaintResult(error="Paint stroke deletion failed")
    finally:
        db.close()


def _clear_paint_strokes(*, table_id: str, session_id: int) -> _PaintResult:
    db = SessionLocal()
    try:
        if not _table_in_session(db, table_id, session_id):
            return _PaintResult(error="Table not found in this session")
        count = crud.clear_paint_strokes_for_table(db, table_id)
        return _PaintResult(
            payload={"operation": "clear", "table_id": table_id, "cleared": count},
            broadcast=True,
        )
    except Exception:
        logger.exception("Paint layer clearing failed")
        return _PaintResult(error="Paint layer clearing failed")
    finally:
        db.close()


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
        size = len(
            json.dumps(payload(trial), separators=(",", ":")).encode("utf-8")
        )
        if size <= max_bytes:
            current = trial
            continue
        if not current:
            raise ValueError("A paint object is too large for a snapshot frame")
        groups.append(current)
        current = [paint_object]
        if (
            len(
                json.dumps(payload(current), separators=(",", ":")).encode("utf-8")
            )
            > max_bytes
        ):
            raise ValueError("A paint object is too large for a snapshot frame")
    if current or not groups:
        groups.append(current)

    count = len(groups)
    chunks = [
        payload(group, index=index, count=count, complete=index == count - 1)
        for index, group in enumerate(groups)
    ]
    if any(
        len(json.dumps(chunk, separators=(",", ":")).encode("utf-8")) > max_bytes
        for chunk in chunks
    ):
        raise ValueError("Paint snapshot metadata exceeded the frame budget")
    return chunks


class _PaintMixin(_ProtocolBase):
    """Handler methods for paint stroke sync domain."""

    async def handle_paint_stroke_create(self, msg: Message, client_id: str) -> Message:
        """Persist a completed stroke and broadcast to other clients in the session."""
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Not permitted to paint'})

        table_id = msg.data.get('table_id')
        stroke_data = msg.data.get('stroke_data')
        stroke_id = msg.data.get('stroke_id')
        if not table_id or not stroke_id or not stroke_data:
            return Message(MessageType.ERROR, {'error': 'table_id, stroke_id, and stroke_data are required'})
        if not isinstance(stroke_id, str) or len(stroke_id) > 36:
            return Message(MessageType.ERROR, {'error': 'Invalid stroke_id'})

        try:
            parsed_stroke = json.loads(stroke_data) if isinstance(stroke_data, str) else stroke_data
        except (TypeError, json.JSONDecodeError):
            return Message(MessageType.ERROR, {'error': 'stroke_data must be valid JSON'})
        if not isinstance(parsed_stroke, dict) or parsed_stroke.get('id') != stroke_id:
            return Message(MessageType.ERROR, {'error': 'stroke_data id must match stroke_id'})

        stroke_data_str = json.dumps(parsed_stroke, separators=(',', ':'), sort_keys=True)
        user_id = self._get_user_id(msg, client_id)
        session_id = self._get_session_id(msg)
        if user_id is None or session_id is None:
            return Message(MessageType.ERROR, {'error': 'Authenticated session context is required'})

        result = await run_blocking(
            _create_paint_stroke,
            table_id=table_id,
            session_id=session_id,
            stroke_id=stroke_id,
            stroke_data=stroke_data_str,
            user_id=user_id,
        )
        if result.error or result.payload is None:
            return Message(MessageType.ERROR, {'error': result.error or 'Paint stroke creation failed'})
        if result.broadcast:
            await self.broadcast_to_session(
                Message(MessageType.PAINT_STROKE_CREATE, result.payload),
                client_id,
            )
        return Message(MessageType.PAINT_STROKE_CREATE, result.payload)

    async def handle_paint_stroke_delete(self, msg: Message, client_id: str) -> Message:
        """A creator removes their own stroke; a DM can remove any session stroke."""
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Not permitted to delete paint strokes'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        stroke_id = msg.data.get('stroke_id')
        table_id = msg.data.get('table_id')
        if not stroke_id or not table_id:
            return Message(MessageType.ERROR, {'error': 'stroke_id and table_id are required'})

        user_id = self._get_user_id(msg, client_id)
        session_id = self._get_session_id(msg)
        if user_id is None or session_id is None:
            return Message(MessageType.ERROR, {'error': 'Authenticated session context is required'})

        result = await run_blocking(
            _delete_paint_stroke,
            table_id=table_id,
            session_id=session_id,
            stroke_id=stroke_id,
            created_by=None if is_dm(role) else user_id,
        )
        if result.error or result.payload is None:
            return Message(MessageType.ERROR, {'error': result.error or 'Paint stroke deletion failed'})
        await self.broadcast_to_session(
            Message(MessageType.PAINT_STROKE_DELETE, result.payload),
            client_id,
        )
        return Message(MessageType.PAINT_STROKE_DELETE, result.payload)

    async def handle_paint_stroke_clear(self, msg: Message, client_id: str) -> Message:
        """DM wipes all strokes for a table."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can clear the paint layer'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id is required'})

        session_id = self._get_session_id(msg)
        if session_id is None:
            return Message(MessageType.ERROR, {'error': 'Authenticated session context is required'})

        result = await run_blocking(
            _clear_paint_strokes,
            table_id=table_id,
            session_id=session_id,
        )
        if result.error or result.payload is None:
            return Message(MessageType.ERROR, {'error': result.error or 'Paint layer clearing failed'})
        await self.broadcast_to_session(
            Message(MessageType.PAINT_STROKE_CLEAR, result.payload),
            client_id,
        )
        return Message(MessageType.PAINT_STROKE_CLEAR, result.payload)

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
                result.error or PaintCommandError(
                    "invalid_payload", "Paint command failed"
                ),
                operation_id,
            )
        event = Message(MessageType.PAINT_OBJECT_EVENT, result.event)
        if result.broadcast:
            await self.broadcast_to_session(event, client_id)
        return event

    async def handle_paint_object_create(
        self, msg: Message, client_id: str
    ) -> Message:
        data = msg.data or {}
        operation_id = data.get("operation_id")
        table_id = data.get("table_id")
        editable = data.get("object")
        if not isinstance(operation_id, str) or not isinstance(table_id, str):
            return Message(MessageType.ERROR, {"error": "Invalid paint create envelope"})
        if not isinstance(editable, dict):
            return Message(MessageType.ERROR, {
                "error": "Paint object is required",
                "operation_id": operation_id,
                "code": "invalid_payload",
            })
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(MessageType.ERROR, {
                "error": "Authenticated session context is required",
                "operation_id": operation_id,
                "code": "forbidden",
            })
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

    async def handle_paint_object_update(
        self, msg: Message, client_id: str
    ) -> Message:
        data = msg.data or {}
        operation_id = data.get("operation_id")
        table_id = data.get("table_id")
        object_id = data.get("id")
        expected_version = data.get("expected_version")
        editable = data.get("object")
        if not all(isinstance(value, str) for value in (operation_id, table_id, object_id)):
            return Message(MessageType.ERROR, {"error": "Invalid paint update envelope"})
        if not isinstance(expected_version, int) or isinstance(expected_version, bool):
            return Message(MessageType.ERROR, {
                "error": "expected_version is required",
                "operation_id": operation_id,
                "code": "invalid_payload",
            })
        if not isinstance(editable, dict):
            return Message(MessageType.ERROR, {
                "error": "Paint object is required",
                "operation_id": operation_id,
                "code": "invalid_payload",
            })
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(MessageType.ERROR, {
                "error": "Authenticated session context is required",
                "operation_id": operation_id,
                "code": "forbidden",
            })
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

    async def handle_paint_object_delete(
        self, msg: Message, client_id: str
    ) -> Message:
        data = msg.data or {}
        operation_id = data.get("operation_id")
        table_id = data.get("table_id")
        object_id = data.get("id")
        expected_version = data.get("expected_version")
        if not all(isinstance(value, str) for value in (operation_id, table_id, object_id)):
            return Message(MessageType.ERROR, {"error": "Invalid paint delete envelope"})
        if not isinstance(expected_version, int) or isinstance(expected_version, bool):
            return Message(MessageType.ERROR, {
                "error": "expected_version is required",
                "operation_id": operation_id,
                "code": "invalid_payload",
            })
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(MessageType.ERROR, {
                "error": "Authenticated session context is required",
                "operation_id": operation_id,
                "code": "forbidden",
            })
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

    async def handle_paint_snapshot_request(
        self, msg: Message, client_id: str
    ) -> Message:
        data = msg.data or {}
        table_id = data.get("table_id")
        if not isinstance(table_id, str):
            return Message(MessageType.ERROR, {"error": "table_id is required"})
        context = self._paint_context(msg, client_id)
        if context is None:
            return Message(MessageType.ERROR, {
                "error": "Authenticated session context is required",
                "code": "forbidden",
            })
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
                cache_key: value
                for cache_key, value in cache.items()
                if value[0] > now
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
            Message(MessageType.PAINT_PREVIEW_CANCEL, {
                "table_id": table_id,
                "temporary_id": temporary_id,
                "sequence": sequence,
                "actor_id": actor_id,
            }),
            client_id,
        )
