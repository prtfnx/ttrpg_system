import re
import uuid
from dataclasses import dataclass

from core_table.protocol import Message, MessageType
from database import crud, models, schemas
from database.database import SessionLocal
from utils.audit import audit_event
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import is_dm
from utils.time import utc_now

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)
_CLIENT_OPERATION_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_CHANNELS = {"public", "whisper"}


@dataclass(frozen=True)
class _ChatWriteResult:
    payload: dict | None = None
    created: bool = False
    error: str | None = None


@dataclass(frozen=True)
class _ChatModerationResult:
    payload: dict | None = None
    sender_user_id: int | None = None
    recipient_user_id: int | None = None
    channel: str | None = None
    error: str | None = None


def _persist_chat_message(
    *,
    session_id: int,
    user_id: int,
    username: str,
    channel: str,
    recipient_id: int | None,
    table_id,
    text: str,
    client_operation_id: str,
    server_message_id: str,
    saved_message_payload: dict,
    client_timestamp,
) -> _ChatWriteResult:
    """Persist one message with a worker-owned SQLAlchemy session."""
    db = SessionLocal()
    try:
        if recipient_id is not None:
            recipient = db.query(models.GamePlayer.id).filter(
                models.GamePlayer.session_id == session_id,
                models.GamePlayer.user_id == recipient_id,
            ).first()
            if recipient is None:
                return _ChatWriteResult(error="Whisper recipient is not in this session")

        existing = crud.get_chat_message_by_client_operation(
            db,
            session_id=session_id,
            user_id=user_id,
            client_operation_id=client_operation_id,
        )
        saved = existing or crud.create_chat_message(db, schemas.ChatMessageCreate(
            message_id=server_message_id,
            client_operation_id=client_operation_id,
            session_id=session_id,
            user_id=user_id,
            username=username,
            channel=channel,
            recipient_user_id=recipient_id,
            table_id=table_id,
            text=text,
            message_json=saved_message_payload,
            attachments=None,
            client_timestamp=float(client_timestamp) if client_timestamp is not None else None,
        ))
        return _ChatWriteResult(payload=saved.to_dict(), created=existing is None)
    except Exception:
        logger.exception("Chat persistence failed")
        return _ChatWriteResult(error="Chat message could not be persisted")
    finally:
        db.close()


def _load_chat_history(
    *,
    session_id: int,
    count: int,
    before_id: int | None,
    after_id: int | None,
    channel,
    requested_user_id,
    viewer_user_id: int | None,
    viewer_is_moderator: bool,
) -> tuple[list[dict], int | None] | None:
    """Load and serialize visible history inside one worker thread."""
    db = SessionLocal()
    try:
        messages = crud.get_session_chat_messages(
            db,
            session_id=session_id,
            limit=count,
            before_id=before_id,
            after_id=after_id,
            channel=channel,
            user_id=requested_user_id,
            visible_to_user_id=viewer_user_id,
            viewer_is_moderator=viewer_is_moderator,
        )
        payload = [message.to_dict() for message in messages]
        next_cursor = messages[0].id if len(messages) == count else None
        return payload, next_cursor
    except Exception:
        logger.exception("Chat history request failed")
        return None
    finally:
        db.close()


def _moderate_chat_message(
    *,
    session_id: int,
    session_code: str,
    actor_user_id: int,
    message_id: str,
    action: str,
    reason: str | None,
    moderator: bool,
) -> _ChatModerationResult:
    """Apply one moderation transaction with a worker-owned ORM session."""
    db = SessionLocal()
    try:
        chat_message = crud.get_session_chat_message(
            db,
            session_id=session_id,
            message_id=message_id,
        )
        if chat_message is None:
            return _ChatModerationResult(error="Chat message not found")
        owns_message = chat_message.user_id == actor_user_id
        if action == "delete" and not moderator:
            return _ChatModerationResult(error="Only a DM or co-DM can delete messages")
        if action == "redact" and not (moderator or owns_message):
            return _ChatModerationResult(error="You can only redact your own messages")
        if moderator and not owns_message and not str(reason or "").strip():
            return _ChatModerationResult(error="A reason is required to moderate another user")

        now = utc_now()
        if action == "delete":
            chat_message.deleted_at = chat_message.deleted_at or now
            chat_message.deleted_by_user_id = actor_user_id
        elif chat_message.deleted_at is None:
            chat_message.redacted_at = chat_message.redacted_at or now
            chat_message.redacted_by_user_id = actor_user_id
        else:
            return _ChatModerationResult(error="Deleted messages cannot be redacted")
        chat_message.moderation_reason = str(reason).strip() if reason else None
        db.add(audit_event(
            f"chat.{action}",
            session_code=session_code,
            user_id=actor_user_id,
            target_type="chat_message",
            target_id=chat_message.message_id,
            details={
                "message_owner_user_id": chat_message.user_id,
                "moderator": moderator,
            },
        ))
        db.commit()
        db.refresh(chat_message)
        return _ChatModerationResult(
            payload=chat_message.to_dict(),
            sender_user_id=chat_message.user_id,
            recipient_user_id=chat_message.recipient_user_id,
            channel=chat_message.channel,
        )
    except Exception:
        db.rollback()
        logger.exception("Chat moderation failed")
        return _ChatModerationResult(error="Chat message could not be moderated")
    finally:
        db.close()


class _ChatMixin(_ProtocolBase):
    """Handler methods for chat-related messages"""

    async def handle_chat(self, msg: Message, client_id: str) -> Message:
        """Persist a chat message and broadcast it to other visible clients."""
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
        username = client_info.get('username') or 'Unknown'
        text = message_payload.get('text') or msg.data.get('text')
        if not isinstance(text, str) or not text.strip():
            return Message(MessageType.ERROR, {'error': 'Chat message text is required'})
        if len(text) > 500:
            return Message(MessageType.ERROR, {'error': 'Chat message too long'})

        if user_id is None:
            return Message(MessageType.ERROR, {'error': 'Authenticated user is required'})

        client_operation_id = str(
            message_payload.get('client_operation_id')
            or message_payload.get('id')
            or msg.data.get('client_operation_id')
            or msg.data.get('message_id')
            or ''
        )
        if not _CLIENT_OPERATION_ID.fullmatch(client_operation_id):
            return Message(MessageType.ERROR, {'error': 'Invalid chat client operation id'})

        channel = str(msg.data.get('channel') or message_payload.get('channel') or 'public')
        if channel not in _CHANNELS:
            return Message(MessageType.ERROR, {'error': 'Invalid chat channel'})
        recipient_user_id = msg.data.get('recipient_user_id') or message_payload.get('recipient_user_id')
        table_id = msg.data.get('table_id') or message_payload.get('table_id')
        attachments = msg.data.get('attachments') or message_payload.get('attachments')
        client_timestamp = message_payload.get('timestamp') or msg.data.get('timestamp')
        if attachments not in (None, []):
            return Message(MessageType.ERROR, {'error': 'Chat attachments are not supported'})
        attachments = None

        recipient_id: int | None = None
        if channel == 'whisper':
            if recipient_user_id is None:
                return Message(MessageType.ERROR, {'error': 'Whisper recipient is required'})
            try:
                recipient_id = int(recipient_user_id)
            except (TypeError, ValueError):
                return Message(MessageType.ERROR, {'error': 'Whisper recipient is required'})
            if recipient_id == int(user_id):
                return Message(MessageType.ERROR, {'error': 'Whisper recipient must be another user'})
        elif recipient_user_id is not None:
            return Message(MessageType.ERROR, {'error': 'Public chat cannot specify a recipient'})

        server_message_id = str(uuid.uuid4())

        saved_message_payload = {
            **message_payload,
            'id': server_message_id,
            'client_operation_id': client_operation_id,
            'user': username,
            'user_id': user_id,
            'text': text.strip(),
            'timestamp': client_timestamp or int((msg.timestamp or 0) * 1000),
        }
        if attachments is not None:
            saved_message_payload['attachments'] = attachments
        if channel:
            saved_message_payload['channel'] = channel
        if recipient_id is not None:
            saved_message_payload['recipient_user_id'] = recipient_id
        if table_id:
            saved_message_payload['table_id'] = table_id

        persistence = await run_blocking(
            _persist_chat_message,
            session_id=session_id,
            user_id=int(user_id),
            username=username,
            channel=channel,
            recipient_id=recipient_id,
            table_id=table_id,
            text=text.strip(),
            client_operation_id=client_operation_id,
            server_message_id=server_message_id,
            saved_message_payload=saved_message_payload,
            client_timestamp=client_timestamp,
        )
        if persistence.error:
            return Message(MessageType.ERROR, {'error': persistence.error})
        if persistence.payload is None:
            return Message(MessageType.ERROR, {'error': 'Chat message could not be persisted'})
        persisted_message = persistence.payload

        if persistence.created:
            outbound = Message(MessageType.CHAT, {'message': persisted_message})
            if channel == 'whisper':
                if recipient_id is None:
                    return Message(MessageType.ERROR, {'error': 'Whisper recipient is required'})
                await self._send_whisper_to_visible_clients(
                    outbound,
                    sender_user_id=user_id,
                    recipient_user_id=recipient_id,
                    exclude_client=client_id,
                )
            else:
                await self.broadcast_to_session(outbound, client_id)

        return Message(MessageType.CHAT_CONFIRMATION, {
            'message': 'Chat message received successfully',
            'chat_message': persisted_message,
            'client_operation_id': client_operation_id,
            'persisted': True,
        })


    async def handle_chat_request(self, msg: Message, client_id: str) -> Message:
        """Handle chat history request"""
        session_id = self._get_session_id(msg)
        if session_id is None:
            return Message(MessageType.ERROR, {'error': 'No session available for chat history'})

        data = msg.data or {}
        user_id = self._get_user_id(msg, client_id)
        requested_count = data.get('count', data.get('limit', 30))
        if data.get('all') or requested_count == 'all':
            return Message(MessageType.ERROR, {'error': 'Unbounded chat history is not supported'})
        try:
            count = max(1, min(int(requested_count or 30), 100))
            before_id = int(data['before_id']) if data.get('before_id') is not None else None
            after_id = int(data['after_id']) if data.get('after_id') is not None else None
        except (TypeError, ValueError):
            return Message(MessageType.ERROR, {'error': 'Invalid chat history cursor or count'})

        history = await run_blocking(
            _load_chat_history,
            session_id=session_id,
            count=count,
            before_id=before_id,
            after_id=after_id,
            channel=data.get('channel'),
            requested_user_id=data.get('user_id'),
            viewer_user_id=user_id,
            viewer_is_moderator=is_dm(self._get_client_role(client_id)),
        )
        if history is None:
            return Message(MessageType.ERROR, {'error': 'Chat history could not be loaded'})
        payload, next_cursor = history

        return Message(MessageType.CHAT, {
            'messages': payload,
            'count': len(payload),
            'requested_count': count,
            'next_cursor': next_cursor,
            'session_id': self._get_session_code(msg),
        })

    async def handle_chat_moderate(
        self,
        msg: Message,
        client_id: str,
    ) -> Message:
        """Redact an own message or let a DM/co-DM moderate any session message."""
        data = msg.data or {}
        session_id = self._get_session_id(msg)
        actor_user_id = self._get_user_id(msg, client_id)
        message_id = data.get('message_id')
        action = data.get('action')
        reason = data.get('reason')
        if session_id is None or actor_user_id is None:
            return Message(MessageType.ERROR, {'error': 'Authenticated session is required'})
        if not isinstance(message_id, str) or not message_id:
            return Message(MessageType.ERROR, {'error': 'message_id is required'})
        if action not in {'redact', 'delete'}:
            return Message(MessageType.ERROR, {'error': 'action must be redact or delete'})
        if reason is not None and (not isinstance(reason, str) or len(reason.strip()) > 500):
            return Message(MessageType.ERROR, {'error': 'Moderation reason is invalid'})

        moderator = is_dm(self._get_client_role(client_id))
        moderation = await run_blocking(
            _moderate_chat_message,
            session_id=session_id,
            session_code=self._get_session_code(msg),
            actor_user_id=actor_user_id,
            message_id=message_id,
            action=action,
            reason=reason,
            moderator=moderator,
        )
        if moderation.error:
            return Message(MessageType.ERROR, {'error': moderation.error})
        if moderation.payload is None:
            return Message(MessageType.ERROR, {'error': 'Chat message could not be moderated'})

        outbound = Message(MessageType.CHAT_MODERATION, {
            'action': action,
            'message': moderation.payload,
        })
        if (
            moderation.channel == 'whisper'
            and moderation.sender_user_id is not None
            and moderation.recipient_user_id is not None
        ):
            await self._send_whisper_to_visible_clients(
                outbound,
                sender_user_id=moderation.sender_user_id,
                recipient_user_id=moderation.recipient_user_id,
                exclude_client=client_id,
            )
        else:
            await self.broadcast_to_session(outbound, client_id)
        return outbound

    async def _send_whisper_to_visible_clients(
        self,
        message: Message,
        *,
        sender_user_id: int,
        recipient_user_id: int,
        exclude_client: str | None = None,
    ) -> None:
        if not self.session_manager or not hasattr(self.session_manager, 'client_info'):
            return
        for target_client_id, info in self.session_manager.client_info.items():
            if target_client_id == exclude_client:
                continue
            target_user_id = int(info.get('user_id') or 0)
            target_role = info.get('role')
            if (
                target_user_id in {sender_user_id, recipient_user_id}
                or is_dm(str(target_role or ''))
            ):
                await self.send_to_client(message, target_client_id)

