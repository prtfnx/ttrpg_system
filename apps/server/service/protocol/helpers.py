import json
import time
from typing import Optional

from core_table.protocol import Message, MessageType
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _HelpersMixin(_ProtocolBase):
    """Handler methods for helpers domain."""

    async def send_to_client(self, message: Message, client_id: str):
        """Send message to specific client"""
        if self._transport_send is None:
            raise RuntimeError("No client transport is configured")
        await self._transport_send(message, client_id)

    async def broadcast_to_session(self, message: Message, client_id: Optional[str] = None):
        """Send message to all clients in the session. Excludes client_id if provided."""
        if self.session_manager and hasattr(self.session_manager, 'broadcast_to_session'):
            await self.session_manager.broadcast_to_session(message, exclude_client=client_id)
        else:
            for client in self.clients:
                if client != client_id:
                    await self.send_to_client(message, client)

    async def broadcast_filtered(self, message: Message, layer: str, client_id: str):
        """Broadcast only to clients who can see the given layer."""
        if self.session_manager and hasattr(self.session_manager, 'broadcast_filtered'):
            await self.session_manager.broadcast_filtered(message, layer, exclude_client=client_id)
        else:
            await self.broadcast_to_session(message, client_id)

    async def _broadcast_error(self, client_id: str, error_message: str):
        """Send error message to specific client"""
        if client_id in self.clients:
            error_msg = Message(MessageType.ERROR, {'error': error_message})
            await self.send_to_client(error_msg, self.clients[client_id])

    def _get_session_code(self, msg: Optional[Message] = None) -> str:
        """Return the session bound to the authenticated WebSocket connection.

        ``msg`` remains in the signature for compatibility with existing
        handlers, but message payloads are never an identity source.
        """
        try:
            if self.session_manager and hasattr(self.session_manager, 'session_code'):
                code = self.session_manager.session_code
                if code:
                    return code
            logger.error("Authenticated connection has no session_code")
            return ""
        except Exception as e:
            logger.error(f"Error getting session_code: {e}")
            return ""

    def _get_session_id(self, msg: Message) -> Optional[int]:
        """Return the database session ID bound to the WebSocket connection."""
        try:
            if self.session_manager and hasattr(self.session_manager, 'game_session_db_id'):
                session_id = self.session_manager.game_session_db_id
                if session_id is not None:
                    return int(session_id)
            logger.error("Authenticated connection has no database session ID")
            return None
        except Exception as e:
            logger.error(f"Error getting session_id: {e}")
            return None

    def _get_user_id(self, msg: Message, client_id: Optional[str] = None) -> Optional[int]:
        """Return the authenticated user_id for the sending client.

        We intentionally read from server-side client_info (populated at
        WebSocket authentication time) rather than from msg.data so that
        a malicious client cannot impersonate another user by sending a
        fake user_id in the message payload.
        """
        if client_id is not None:
            uid = self._get_client_info(client_id).get('user_id')
            if uid is not None:
                return int(uid)
        return None

    async def _can_control_sprite(self, sprite_id: str, user_id: Optional[int]) -> bool:
        """Check if user can control (move/resize/rotate) a sprite.

        Authoritative check order:
        1. If user_id is unknown (unauthenticated), deny immediately.
        2. Check the in-memory VirtualTable entity first — it is always
           up-to-date, even for sprites just created before the first DB flush.
        3. Fall back to the DB entity record.
        The function fails *closed*: any exception → deny.
        """
        if user_id is None:
            logger.warning(f'_can_control_sprite: no user_id for sprite {sprite_id} — denying')
            return False

        try:
            # ── 1. In-memory check (covers freshly created sprites) ──────────
            for table in (self.table_manager.tables.values()
                          if hasattr(self.table_manager, 'tables') else []):
                entity = table.find_entity_by_sprite_id(sprite_id)
                if entity is not None:
                    cb = entity.controlled_by
                    # Normalise: may be a JSON string if entity was updated via server_protocol
                    if isinstance(cb, str):
                        try:
                            cb = json.loads(cb)
                        except Exception:
                            cb = []
                    # controlled_by == [] means DM-only
                    if not cb:
                        return False
                    # Compare as ints to handle any str/int mismatch
                    if any(int(x) == user_id for x in cb if str(x).lstrip('-').isdigit()):
                        return True
                    # Entity exists in memory but user is not in controlled_by
                    return False

            # ── 2. DB fallback (for tables not in memory, e.g. persistence queries) ─
            if hasattr(self.table_manager, 'db_session') and self.table_manager.db_session:
                from database import crud
                entity_db = crud.get_entity_by_sprite_id(self.table_manager.db_session, sprite_id)
                if entity_db is None:
                    # Sprite unknown to DB — deny
                    return False

                # controlled_by stored as JSON string in DB
                try:
                    controlled_by = json.loads(entity_db.controlled_by or '[]')
                except Exception:
                    controlled_by = []

                if not controlled_by:
                    # Empty list → DM-only sprite
                    return False
                if user_id in controlled_by:
                    return True
                if any(int(x) == user_id for x in controlled_by if str(x).lstrip('-').isdigit()):
                    return True

                # Check character ownership if sprite is linked to a character
                if entity_db.character_id:
                    from database.models import SessionCharacter
                    character = self.table_manager.db_session.query(SessionCharacter).filter_by(
                        character_id=entity_db.character_id
                    ).first()
                    if character:
                        if character.owner_user_id == user_id:
                            return True
                        try:
                            char_cb = json.loads(character.controlled_by or '[]')
                            if user_id in char_cb:
                                return True
                        except Exception:
                            pass

                return False

            # No DB and sprite not found in memory → deny
            return False

        except Exception as e:
            logger.error(f'_can_control_sprite: unexpected error for sprite {sprite_id}, user {user_id}: {e}')
            return False  # Fail closed

    async def handle_test(self, msg: Message, client_id: str) -> Message:
        """Handle test message - echo back with server info"""
        return Message(MessageType.SUCCESS, {
            'message': 'Test message received',
            'server_time': time.time(),
            'echo_data': msg.data
        })
