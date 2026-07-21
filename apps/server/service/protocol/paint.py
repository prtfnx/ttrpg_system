import json

from core_table.protocol import Message, MessageType
from database import crud, models
from database.database import SessionLocal
from utils.logger import setup_logger
from utils.roles import can_interact, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


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

        db = SessionLocal()
        try:
            table = db.query(models.VirtualTable).filter(
                models.VirtualTable.table_id == table_id,
                models.VirtualTable.session_id == session_id,
            ).first()
            if table is None:
                return Message(MessageType.ERROR, {'error': 'Table not found in this session'})

            existing = crud.get_paint_stroke(db, table_id, stroke_id)
            if existing is not None:
                if existing.created_by == user_id and existing.stroke_data == stroke_data_str:
                    return Message(MessageType.PAINT_STROKE_CREATE, {
                        'operation': 'create',
                        'stroke': existing.to_dict(),
                        'table_id': table_id,
                    })
                return Message(MessageType.ERROR, {'error': 'stroke_id already exists'})

            stroke = crud.create_paint_stroke(db, table_id, stroke_id, stroke_data_str, user_id)
            stroke_dict = stroke.to_dict()
        except Exception:
            logger.exception("Paint stroke creation failed")
            return Message(MessageType.ERROR, {"error": "Paint stroke creation failed"})
        finally:
            db.close()

        payload = {'operation': 'create', 'stroke': stroke_dict, 'table_id': table_id}
        await self.broadcast_to_session(Message(MessageType.PAINT_STROKE_CREATE, payload), client_id)
        return Message(MessageType.PAINT_STROKE_CREATE, payload)

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

        db = SessionLocal()
        try:
            table = db.query(models.VirtualTable).filter(
                models.VirtualTable.table_id == table_id,
                models.VirtualTable.session_id == session_id,
            ).first()
            if table is None:
                return Message(MessageType.ERROR, {'error': 'Table not found in this session'})
            deleted = crud.delete_paint_stroke(
                db,
                table_id,
                stroke_id,
                created_by=None if is_dm(role) else user_id,
            )
        except Exception:
            logger.exception("Paint stroke deletion failed")
            return Message(MessageType.ERROR, {"error": "Paint stroke deletion failed"})
        finally:
            db.close()

        if not deleted:
            return Message(MessageType.ERROR, {'error': 'Stroke not found'})

        payload = {'operation': 'delete', 'stroke_id': stroke_id, 'table_id': table_id}
        await self.broadcast_to_session(Message(MessageType.PAINT_STROKE_DELETE, payload), client_id)
        return Message(MessageType.PAINT_STROKE_DELETE, payload)

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

        db = SessionLocal()
        try:
            table = db.query(models.VirtualTable).filter(
                models.VirtualTable.table_id == table_id,
                models.VirtualTable.session_id == session_id,
            ).first()
            if table is None:
                return Message(MessageType.ERROR, {'error': 'Table not found in this session'})
            count = crud.clear_paint_strokes_for_table(db, table_id)
        except Exception:
            logger.exception("Paint layer clearing failed")
            return Message(MessageType.ERROR, {"error": "Paint layer clearing failed"})
        finally:
            db.close()

        payload = {'operation': 'clear', 'table_id': table_id, 'cleared': count}
        await self.broadcast_to_session(Message(MessageType.PAINT_STROKE_CLEAR, payload), client_id)
        return Message(MessageType.PAINT_STROKE_CLEAR, payload)
