import uuid

from core_table.protocol import Message, MessageType
from database import crud, schemas
from database.database import SessionLocal
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _ChatMixin(_ProtocolBase):
    """Handler methods for chat-related messages"""

    async def handle_chat(self, msg: Message, client_id: str) -> Message:
        """Persist a chat message and broadcast it to other visible clients."""
        logger.debug(f"Chat message received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in chat message'})

        session_id = self._get_session_id(msg)
        if session_id is None:
            return Message(MessageType.ERROR, {'error': 'No session available for chat persistence'})

        message_payload = msg.data.get('message') or {}
        if not isinstance(message_payload, dict):
            return Message(MessageType.ERROR, {'error': 'chat message must be an object'})

        client_info = self._get_client_info(client_id)
        user_id = self._get_user_id(msg, client_id)
        username = client_info.get('username') or message_payload.get('user') or 'Unknown'
        text = message_payload.get('text') or msg.data.get('text')
        if not isinstance(text, str) or not text.strip():
            return Message(MessageType.ERROR, {'error': 'Chat message text is required'})
        if len(text) > 500:
            return Message(MessageType.ERROR, {'error': 'Chat message too long'})

        message_id = str(message_payload.get('id') or msg.data.get('message_id') or uuid.uuid4())
        channel = str(msg.data.get('channel') or message_payload.get('channel') or 'public')
        recipient_user_id = msg.data.get('recipient_user_id') or message_payload.get('recipient_user_id')
        table_id = msg.data.get('table_id') or message_payload.get('table_id')
        attachments = msg.data.get('attachments') or message_payload.get('attachments')
        client_timestamp = message_payload.get('timestamp') or msg.data.get('timestamp')

        saved_message_payload = {
            **message_payload,
            'id': message_id,
            'user': username,
            'text': text.strip(),
            'timestamp': client_timestamp or int((msg.timestamp or 0) * 1000),
        }
        if attachments is not None:
            saved_message_payload['attachments'] = attachments
        if channel:
            saved_message_payload['channel'] = channel
        if recipient_user_id is not None:
            saved_message_payload['recipient_user_id'] = recipient_user_id
        if table_id:
            saved_message_payload['table_id'] = table_id

        db = SessionLocal()
        try:
            existing = crud.get_chat_message_by_message_id(db, message_id)
            if existing:
                saved = existing
            else:
                saved = crud.create_chat_message(db, schemas.ChatMessageCreate(
                    message_id=message_id,
                    session_id=session_id,
                    user_id=user_id,
                    username=username,
                    channel=channel,
                    recipient_user_id=int(recipient_user_id) if recipient_user_id is not None else None,
                    table_id=table_id,
                    text=text.strip(),
                    message_json=saved_message_payload,
                    attachments=attachments if isinstance(attachments, list) else None,
                    client_timestamp=float(client_timestamp) if client_timestamp is not None else None,
                ))
            persisted_message = saved.to_dict()
        except Exception as e:
            logger.error(f"handle_chat persistence error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})
        finally:
            db.close()

        outbound = Message(MessageType.CHAT, {'message': persisted_message})
        if channel == 'whisper' and recipient_user_id is not None:
            await self._send_chat_to_user(outbound, int(recipient_user_id), exclude_client=client_id)
        else:
            await self.broadcast_to_session(outbound, client_id)

        return Message(MessageType.CHAT_CONFIRMATION, {
            'message': 'Chat message received successfully',
            'chat_message': persisted_message,
            'persisted': True,
        })


    async def handle_chat_request(self, msg: Message, client_id: str) -> Message:
        """Handle chat history request"""
        logger.debug(f"Chat history request received: {msg}")
        session_id = self._get_session_id(msg)
        if session_id is None:
            return Message(MessageType.ERROR, {'error': 'No session available for chat history'})

        data = msg.data or {}
        user_id = self._get_user_id(msg, client_id)
        requested_count = data.get('count', data.get('limit', 30))
        all_messages = bool(data.get('all')) or requested_count == 'all'
        count = 30 if all_messages else int(requested_count or 30)

        db = SessionLocal()
        try:
            messages = crud.get_session_chat_messages(
                db,
                session_id=session_id,
                limit=None if all_messages else count,
                before_id=data.get('before_id'),
                after_id=data.get('after_id'),
                channel=data.get('channel'),
                user_id=data.get('user_id'),
                visible_to_user_id=user_id,
                all_messages=all_messages,
            )
            payload = [message.to_dict() for message in messages]
        except Exception as e:
            logger.error(f"handle_chat_request error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})
        finally:
            db.close()

        return Message(MessageType.CHAT, {
            'messages': payload,
            'count': len(payload),
            'requested_count': 'all' if all_messages else count,
            'session_id': self._get_session_code(msg),
        })

    async def _send_chat_to_user(self, message: Message, user_id: int, exclude_client: str | None = None) -> None:
        if not self.session_manager or not hasattr(self.session_manager, 'client_info'):
            return
        for target_client_id, info in self.session_manager.client_info.items():
            if target_client_id == exclude_client:
                continue
            if int(info.get('user_id') or 0) == user_id:
                await self.send_to_client(message, target_client_id)


