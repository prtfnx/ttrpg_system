from core_table.protocol import Message, MessageType
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _AuthMixin(_ProtocolBase):
    """Handler methods for auth domain."""

    async def handle_auth_register(self, msg: Message, client_id: str) -> Message:
        """Handle user registration via WebSocket — not supported, use HTTP /auth/register"""
        logger.warning(f"WS auth_register attempt from {client_id} — redirecting to HTTP endpoint")
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Use HTTP POST /auth/register for registration'
        })

    async def handle_auth_login(self, msg: Message, client_id: str) -> Message:
        """Handle user login via WebSocket — not supported, use HTTP /auth/login"""
        logger.warning(f"WS auth_login attempt from {client_id} — redirecting to HTTP endpoint")
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Use HTTP POST /auth/login for authentication'
        })

    async def handle_auth_logout(self, msg: Message, client_id: str) -> Message:
        """Handle user logout request"""
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Logged out successfully'
        })

    async def handle_auth_token(self, msg: Message, client_id: str) -> Message:
        """Handle authentication token validation via WebSocket — not supported, use HTTP /auth/verify"""
        logger.warning(f"WS auth_token attempt from {client_id} — redirecting to HTTP endpoint")
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Use HTTP POST /auth/verify for token validation'
        })

    async def handle_auth_status(self, msg: Message, client_id: str) -> Message:
        """Return current auth status for the connected client."""
        info = self._get_client_info(client_id)
        user_id = info.get('user_id')
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': user_id is not None,
            'user_id': user_id,
            'username': info.get('username'),
            'role': info.get('role', 'player'),
        })
