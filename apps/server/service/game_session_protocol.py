"""
Game Session Protocol Service for TTRPG Web Server

This class wraps the core_table ServerProtocol to provide persistent
storage, ban handling, and client management for a multiplayer session.
"""
import asyncio
import json
import time
from datetime import datetime
from typing import Dict, List, Optional

from config import Settings
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import models as db_models
from database.crud import append_ban_to_session
from fastapi import WebSocket
from utils.logger import log_context, setup_logger
from utils.roles import get_permissions, get_visible_layers
from utils.roles import is_dm as _is_dm

from .asset_manager import get_server_asset_manager
from .server_protocol import ServerProtocol

logger = setup_logger(__name__)
settings = Settings()



class GameSessionProtocolService:
    """Manages table protocol within a game session with database persistence"""
    def __init__(self, session_code: str, db_session=None, game_session_db_id: int | None = None):
        logger.info(f"Creating GameSessionProtocolService for session {session_code}")
        self.session_code = session_code
        self.db_session = db_session
        self.game_session_db_id = game_session_db_id

        self.table_manager = TableManager(db_session)
        logger.info(f"TableManager initialized for session {session_code}")

        self.server_protocol = ServerProtocol(self.table_manager, session_manager=self)
        logger.info(f"ServerProtocol initialized for session {session_code}")
        self.server_protocol.send_to_client = self.send_to_client  # For compatibility with server protocol

        # Client connections within this game session
        logger.info(f"Initializing GameSessionProtocolService for session {session_code}")
        self.clients: Dict[str, WebSocket] = {}  # client_id -> websocket
        self.client_info: Dict[str, dict] = {}   # client_id -> user info
        self.websocket_to_client: Dict[WebSocket, str] = {}  # websocket -> client_id

        if not db_session or not game_session_db_id:
            raise ValueError("A durable database session is required")
        self._load_tables_from_database()


        self.asset_manager = get_server_asset_manager()

        logger.info(f"GameSessionProtocolService created for session {session_code}")

    def _load_tables_from_database(self):
        """Load tables from database for this game session"""
        try:
            if self.game_session_db_id is None:
                raise RuntimeError("Game session database ID is missing")
            if not self.table_manager.load_from_database(self.game_session_db_id):
                raise RuntimeError("Persisted table state could not be loaded")
            logger.info(
                "Durable game-session state loaded",
                extra={
                    "event_name": "game_session.storage.loaded",
                    "table_count": max(len(self.table_manager.tables) - 1, 0),
                },
            )
        except Exception:
            logger.exception(
                "Durable game-session state load failed",
                extra={"event_name": "game_session.storage.load_failed", "outcome": "error"},
            )
            raise

    def save_to_database(self) -> bool:
        """Save current state to database - delegates to to_db()"""
        return self.to_db()

    def auto_save(self):
        """Auto-save session data (call this periodically or on important events)"""
        try:
            # Check if enough time has passed since last save to avoid excessive database writes
            current_time = time.time()
            if not hasattr(self, '_last_save_time'):
                self._last_save_time = 0

            # Allow saving if it's been at least 5 seconds since last save, or force save on important events
            time_since_last_save = current_time - self._last_save_time
            if time_since_last_save < 5.0:
                logger.debug(f"Session {self.session_code} - Skipping auto-save, only {time_since_last_save:.1f}s since last save")
                return

            success = self.save_to_database()
            if success:
                self._last_save_time = current_time
                logger.info(f"Session {self.session_code} - Auto-save successful")
            else:
                logger.warning(f"Session {self.session_code} - Auto-save failed")
        except Exception as e:
            logger.error(f"Session {self.session_code} - Auto-save failed: {e}")

    def force_save(self):
        """Force immediate save to database regardless of timing"""
        try:
            success = self.save_to_database()
            if success:
                self._last_save_time = time.time()
                logger.info(f"Session {self.session_code} - Force save successful")
            return success
        except Exception as e:
            logger.error(f"Session {self.session_code} - Force save failed: {e}")
            return False

    async def add_client(self, websocket: WebSocket, client_id: str, user_info: dict):
        """Add a client to this game session. Raises PermissionError if the player is banned."""
        if self.db_session and self.game_session_db_id:
            sess = self.db_session.get(db_models.GameSession, self.game_session_db_id)
            if sess and sess.ban_list:
                ban_list = json.loads(sess.ban_list)
                user_id = str(user_info.get('user_id', ''))
                username = user_info.get('username', '')
                for ban in ban_list:
                    if ban.get('player_id') == user_id or ban.get('username') == username:
                        raise PermissionError(f"Banned: {ban.get('reason', 'no reason given')}")

        self.clients[client_id] = websocket
        self.client_info[client_id] = {
            **user_info,
            "connected_at": time.time(),
            "last_ping": time.time()
        }
        self.websocket_to_client[websocket] = client_id

        logger.info(f"Client {client_id} ({user_info.get('username', 'unknown')}) added to session {self.session_code}")
          # Send welcome message with protocol support
        role = user_info.get('role', 'player')

        # Load game mode and rules for this session
        game_mode = 'free_roam'
        rules_dict: dict = {}
        choice_encounter = None
        if self.db_session and self.game_session_db_id:
            try:
                sess = self.db_session.get(db_models.GameSession, self.game_session_db_id)
                if sess:
                    game_mode = sess.game_mode or 'free_roam'
                    import json as _json
                    rules_dict = _json.loads(sess.session_rules_json or '{}')
                    rules_dict.setdefault('session_id', self.session_code)
            except Exception:
                pass

        try:
            active_encounter = self.server_protocol._load_active_choice_encounter(
                self.session_code
            )
            if active_encounter:
                choice_encounter = active_encounter.to_dict(dm=_is_dm(role))
        except Exception:
            logger.exception("Failed to restore active choice encounter for welcome")

        await self._send_message(websocket, Message(
            MessageType.WELCOME,
            {
                "message": f"Welcome to game session {self.session_code}",
                "client_id": client_id,
                "user_id": user_info.get('user_id', 0),
                "username": user_info.get('username', 'unknown'),
                "session_code": self.session_code,
                "connection_id": user_info.get("connection_id"),
                "tables": list(self.table_manager.tables.keys()),
                "role": role,
                "permissions": get_permissions(role),
                "visible_layers": get_visible_layers(role),
                "game_mode": game_mode,
                "session_rules": rules_dict,
                "choice_encounter": choice_encounter,
            }
        ))

    async def remove_client(self, websocket: WebSocket):
        """Remove a client from this game session"""
        if websocket not in self.websocket_to_client:
            return

        client_id = self.websocket_to_client[websocket]
        username = self.client_info.get(client_id, {}).get('username', 'unknown')

        # Clean up
        del self.clients[client_id]
        del self.client_info[client_id]
        del self.websocket_to_client[websocket]
        # Notify server protocol
        #self.server_protocol.disconnect_client(client_id)

        logger.info(f"Client {client_id} ({username}) removed from session {self.session_code}")

    async def handle_protocol_message(self, websocket: WebSocket, message_str: str):
        """Handle incoming protocol message from a client"""
        try:
            message = Message.from_json(message_str)
            client_id = self.websocket_to_client.get(websocket)
            if not client_id:
                await self._send_error(
                    websocket,
                    "Client not registered in session",
                    causation_id=message.message_id,
                    correlation_id=message.correlation_id or message.message_id,
                )
                return
            with log_context(
                client_id=client_id,
                message_id=message.message_id,
                correlation_id=message.correlation_id or message.message_id,
                message_type=message.type.value,
            ):
                if client_id in self.client_info:
                    self.client_info[client_id]["last_ping"] = time.time()
                if message.type in self.server_protocol.handlers:
                    await self.server_protocol.handle_client(message, client_id)
                    if message.type in [MessageType.SPRITE_UPDATE, MessageType.TABLE_UPDATE]:
                        self.auto_save()
                else:
                    logger.warning(
                        "Unsupported WebSocket protocol message",
                        extra={"event_name": "websocket.message.unsupported", "outcome": "rejected"},
                    )
                    await self._send_error(
                        websocket,
                        "Unsupported message type",
                        causation_id=message.message_id,
                        correlation_id=message.correlation_id or message.message_id,
                    )
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            logger.warning(
                "Invalid WebSocket protocol envelope",
                extra={"event_name": "websocket.message.invalid", "outcome": "rejected"},
            )
            await self._send_error(websocket, "Invalid JSON format")
        except Exception:
            logger.exception(
                "WebSocket protocol handler failed",
                extra={"event_name": "websocket.message.failed", "outcome": "error"},
            )
            await self._send_error(websocket, "Internal server error")

    async def broadcast_to_session(self, message: Message, exclude_client: Optional[str] = None):
        """Broadcast message to all clients in this game session"""
        disconnected_clients = []
        broadcast_count = 0

        for client_id, websocket in self.clients.items():
            if client_id != exclude_client:
                try:
                    await self._send_message(websocket, message)
                    broadcast_count += 1
                except Exception:
                    logger.exception(
                        "WebSocket broadcast send failed",
                        extra={"event_name": "websocket.broadcast.failed", "outcome": "error"},
                    )
                    disconnected_clients.append(websocket)
        logger.debug(
            "WebSocket broadcast completed",
            extra={
                "event_name": "websocket.broadcast.completed",
                "message_type": message.type.value,
                "recipient_count": broadcast_count,
            },
        )

        # Clean up disconnected clients
        for websocket in disconnected_clients:
            await self.remove_client(websocket)

    async def broadcast_filtered(self, message: Message, layer: str, exclude_client: Optional[str] = None):
        """Broadcast to clients who can see the given layer."""
        disconnected = []
        for cid, ws in self.clients.items():
            if cid == exclude_client:
                continue
            role = self.client_info.get(cid, {}).get('role', 'player')
            if not _is_dm(role) and layer not in get_visible_layers(role):
                continue
            try:
                await self._send_message(ws, message)
            except Exception as e:
                logger.error(f"BROADCAST: Failed to send to {cid}: {e}")
                disconnected.append(ws)
        for ws in disconnected:
            await self.remove_client(ws)

    async def send_to_client(self, message: Message, client_id: str):
        """Send message to specific client"""
        if message.type == MessageType.PONG:
            logger.info(f"PONG: Sending to client {client_id} in session {self.session_code}")

        if client_id in self.clients:
            websocket = self.clients[client_id]
            try:
                await self._send_message(websocket, message)
                if message.type == MessageType.PONG:
                    logger.info(f"PONG: Successfully sent to client {client_id}")
            except Exception as e:
                logger.error(f"Failed to send to {client_id}: {e}")
                if message.type == MessageType.PONG:
                    logger.error(f"PONG: FAILED to send to client {client_id}: {e}")
                await self.remove_client(websocket)
        else:
            logger.warning(f"Client {client_id} not found in session {self.session_code}")
            if message.type == MessageType.PONG:
                logger.warning(f"PONG: Client {client_id} NOT FOUND in session {self.session_code}")

    # Protocol Message Handlers


    # Utility Methods

    async def _send_message(self, websocket: WebSocket, message: Message):
        """Send one message without allowing a slow peer to stall fan-out."""
        await asyncio.wait_for(
            websocket.send_text(message.to_json()),
            timeout=settings.WS_SEND_TIMEOUT_SECONDS,
        )

    async def _send_error(
        self,
        websocket: WebSocket,
        error_message: str,
        *,
        causation_id: str | None = None,
        correlation_id: str | None = None,
    ):
        """Send error message to WebSocket"""
        error_msg = Message(MessageType.ERROR, {
            "error": error_message,
            "session_code": self.session_code
        }, causation_id=causation_id, correlation_id=correlation_id)
        await self._send_message(websocket, error_msg)

    def get_session_stats(self) -> dict:
        """Get session statistics"""
        return {
            "session_code": self.session_code,
            "connected_clients": len(self.clients),
            "client_ids": list(self.clients.keys()),
            "tables": list(self.table_manager.tables.keys()),
            "clients": [
                {
                    "client_id": client_id,
                    "username": info.get('username', 'unknown'),
                    "connected_at": info.get('connected_at', 0),
                    "last_ping": info.get('last_ping', 0)
                }                for client_id, info in self.client_info.items()
            ]
        }

    def has_clients(self) -> bool:
        """Check if session has any connected clients"""
        return len(self.clients) > 0

    def cleanup(self):
        """Cleanup resources when session is closed"""
        logger.info(f"Cleaning up GameSessionProtocolService for session {self.session_code}")
          # Save to database before clearing data
        if self.db_session and self.game_session_db_id:
            try:
                success = self.force_save()
                if success:
                    logger.info(f"Session {self.session_code} - Data saved to database before cleanup")
                else:
                    logger.warning(f"Session {self.session_code} - Failed to save data before cleanup")
            except Exception as e:
                logger.error(f"Session {self.session_code} - Error saving to database during cleanup: {e}")
        else:
            logger.warning(f"Session {self.session_code} - No database session available for saving during cleanup")
        self.clients.clear()
        self.client_info.clear()
        self.websocket_to_client.clear()
        self.table_manager.clear_tables()

    def to_db(self) -> bool:
        """Save GameSessionProtocolService state to database"""
        try:
            if not self.db_session or not self.game_session_db_id:
                logger.warning(f"No database session for {self.session_code}")
                return False

            # Update GameSession metadata
            game_session = self.db_session.query(db_models.GameSession).filter_by(id=self.game_session_db_id).first()
            if game_session:
                game_session.game_data = json.dumps({
                    'client_count': len(self.clients),
                    'table_count': len(self.table_manager.tables)
                })

            # Save all tables using table_manager's existing method
            success = self.table_manager.save_to_database(self.game_session_db_id)
            if success:
                self.db_session.commit()
                logger.info(f"Saved session {self.session_code} to database")

            return success
        except Exception as e:
            logger.error(f"Error saving to database: {e}")
            if self.db_session:
                self.db_session.rollback()
            return False

    async def kick_player(self, target_player_id: str, target_username: str, reason: str, kicked_by_client_id: str) -> bool:
        """Kick a player from the session"""
        try:
            target_client_id = None
            target_websocket = None

            # Find target client by player_id or username
            for client_id, info in self.client_info.items():
                if (str(info.get('user_id')) == str(target_player_id) or
                    info.get('username') == target_username):
                    target_client_id = client_id
                    target_websocket = self.clients.get(client_id)
                    break

            if not target_client_id or not target_websocket:
                logger.warning(f"Player not found for kick: {target_username}/{target_player_id}")
                return False

            kicked_username = self.client_info[target_client_id].get('username', 'unknown')
            kicker_username = self.client_info.get(kicked_by_client_id, {}).get('username', 'unknown')

            # Notify the kicked player
            kick_message = Message(MessageType.ERROR, {
                'error': 'You have been kicked from the session',
                'reason': reason,
                'kicked_by': kicker_username
            })
            await self._send_message(target_websocket, kick_message)

            # Broadcast kick notification to other players
            kick_notification = Message(MessageType.PLAYER_LEFT, {
                'username': kicked_username,
                'reason': f'Kicked by {kicker_username}: {reason}',
                'timestamp': datetime.now().isoformat(),
                'kicked': True
            })
            await self.broadcast_to_session(kick_notification, exclude_client=target_client_id)

            # Remove the player
            await self.remove_client(target_websocket)

            # Close the WebSocket connection
            try:
                await target_websocket.close()
            except Exception as e:
                logger.error(f"Error closing WebSocket for kicked player: {e}")

            logger.info(f"Player {kicked_username} kicked by {kicker_username}: {reason}")
            return True

        except Exception as e:
            logger.error(f"Error kicking player: {e}")
            return False

    async def ban_player(self, target_player_id: str, target_username: str, reason: str, duration: str, banned_by_client_id: str) -> bool:
        """Ban a player from the session"""
        try:
            # First kick the player
            kick_success = await self.kick_player(target_player_id, target_username, f"Banned: {reason}", banned_by_client_id)

            if kick_success:
                # Persist ban in the database if available
                banner_username = self.client_info.get(banned_by_client_id, {}).get('username', 'unknown')
                if self.db_session and self.game_session_db_id:
                    append_ban_to_session(self.db_session, self.game_session_db_id, {
                        "player_id": target_player_id,
                        "username": target_username,
                        "reason": reason,
                        "duration": duration,
                        "banned_by": banner_username,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                logger.info(f"Player {target_username} banned by {banner_username} for {duration}: {reason}")

                # Broadcast ban notification
                ban_notification = Message(MessageType.PLAYER_LEFT, {
                    'username': target_username,
                    'reason': f'Banned by {banner_username} for {duration}: {reason}',
                    'timestamp': datetime.now().isoformat(),
                    'banned': True,
                    'duration': duration
                })
                await self.broadcast_to_session(ban_notification)

                return True
            else:
                return False

        except Exception as e:
            logger.error(f"Error banning player: {e}")
            return False

    def get_connection_status(self, client_id: str) -> dict:
        """Get connection status for a client"""
        if client_id in self.client_info:
            info = self.client_info[client_id]
            return {
                'connected': True,
                'username': info.get('username', 'unknown'),
                'connected_at': info.get('connected_at', 0),
                'last_ping': info.get('last_ping', 0),
                'session_code': self.session_code
            }
        else:
            return {
                'connected': False,
                'session_code': self.session_code
            }

    def get_session_players(self) -> List[dict]:
        """Get list of connected players in this session"""
        players = []
        for client_id, info in self.client_info.items():
            players.append({
                'client_id': client_id,
                'username': info.get('username', 'unknown'),
                'user_id': info.get('user_id', 0),
                'connected_at': info.get('connected_at', 0),
                'last_ping': info.get('last_ping', 0)
            })
        return players



