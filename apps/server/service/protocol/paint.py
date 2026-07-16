import json
import uuid

from core_table.protocol import Message, MessageType
from database import crud
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
        stroke_id = msg.data.get('stroke_id') or str(uuid.uuid4())
        if not table_id or not stroke_data:
            return Message(MessageType.ERROR, {'error': 'table_id and stroke_data are required'})

        stroke_data_str = stroke_data if isinstance(stroke_data, str) else json.dumps(stroke_data)
        user_id = self._get_user_id(msg, client_id)

        db = SessionLocal()
        try:
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
        """DM removes a single stroke by stroke_id."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can delete paint strokes'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        stroke_id = msg.data.get('stroke_id')
        table_id = msg.data.get('table_id')
        if not stroke_id or not table_id:
            return Message(MessageType.ERROR, {'error': 'stroke_id and table_id are required'})

        db = SessionLocal()
        try:
            deleted = crud.delete_paint_stroke(db, stroke_id)
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

        db = SessionLocal()
        try:
            count = crud.clear_paint_strokes_for_table(db, table_id)
        except Exception:
            logger.exception("Paint layer clearing failed")
            return Message(MessageType.ERROR, {"error": "Paint layer clearing failed"})
        finally:
            db.close()

        payload = {'operation': 'clear', 'table_id': table_id, 'cleared': count}
        await self.broadcast_to_session(Message(MessageType.PAINT_STROKE_CLEAR, payload), client_id)
        return Message(MessageType.PAINT_STROKE_CLEAR, payload)
