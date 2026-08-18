import json
from dataclasses import dataclass

from core_table.protocol import Message, MessageType
from database import crud, models
from database.database import SessionLocal
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import can_interact, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


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
