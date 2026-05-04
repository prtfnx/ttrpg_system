import os
import sys
import time
import json
import uuid
import xxhash
from typing import Dict, Set, Optional, Tuple, Any, Callable, TYPE_CHECKING

from core_table.protocol import Message, MessageType, BatchMessage
from core_table.actions_core import ActionsCore
from utils.logger import setup_logger
from utils.roles import is_dm, is_elevated, can_interact, get_visible_layers, get_sprite_limit
from database.models import Asset, GameSession, GamePlayer
from database.database import SessionLocal
from service.movement_validator import MovementValidator, Combatant
from service.rules_engine import RulesEngine
from core_table.session_rules import SessionRules
from core_table.game_mode import GameMode
from database.crud import get_session_rules_json, get_game_mode

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)


class _AuthMixin:
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
        """Handle authentication status request"""
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Not authenticated'
        })
