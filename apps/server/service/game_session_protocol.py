"""
Game Session Protocol Service for TTRPG Web Server

This class wraps the core_table ServerProtocol to provide persistent
storage, ban handling, and client management for a multiplayer session.
"""
import asyncio
import copy
import json
import time
from typing import Dict, List, Optional

from config import Settings
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import models as db_models
from database.crud import append_ban_to_session
from fastapi import WebSocket
from utils.blocking import run_blocking
from utils.logger import log_context, setup_logger
from utils.roles import can_modify_role, get_permissions, get_visible_layers
from utils.roles import is_dm as _is_dm
from utils.time import utc_now

from .asset_manager import get_server_asset_manager
from .server_protocol import ServerProtocol
from .session_join_hydration import load_join_metadata
from .websocket_outbox import WebSocketOutbox

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

        self.server_protocol = ServerProtocol(
            self.table_manager,
            session_manager=self,
            transport_send=self.send_to_client,
            snapshot_send=self.send_snapshot,
        )
        logger.info(f"ServerProtocol initialized for session {session_code}")

        # Client connections within this game session
        logger.info(f"Initializing GameSessionProtocolService for session {session_code}")
        self.clients: Dict[str, WebSocket] = {}  # client_id -> websocket
        self.client_info: Dict[str, dict] = {}   # client_id -> user info
        self.websocket_to_client: Dict[WebSocket, str] = {}  # websocket -> client_id
        self._outboxes: dict[WebSocket, WebSocketOutbox] = {}

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
                    "table_count": len(self.table_manager.tables),
                },
            )
        except Exception:
            logger.exception(
                "Durable game-session state load failed",
                extra={"event_name": "game_session.storage.load_failed", "outcome": "error"},
            )
            raise

    def _release_db_session(self) -> None:
        """Release the current task's scoped session when the registry owns it."""
        remove = getattr(self.db_session, "remove", None)
        if callable(remove):
            remove()

    def save_to_database(self) -> bool:
        """Save current state to database - delegates to to_db()"""
        return self.to_db()

    async def save_to_database_async(self, *, dirty_only: bool = False) -> bool:
        if not self.db_session or self.game_session_db_id is None:
            return False
        if not self.table_manager.persistence_allowed():
            # Even an empty dirty queue must retain this session for recovery.
            return False
        if dirty_only:
            return await self.server_protocol.actions.flush_all_pending_saves()
        return await self.table_manager.save_to_database_async(self.game_session_db_id)

    async def stop_persistence(self) -> None:
        await self.server_protocol.actions.stop_persistence()

    async def auto_save(self):
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

            success = await self.save_to_database_async(dirty_only=True)
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
        game_mode = 'free_roam'
        rules_dict: dict = {}
        # External lifecycle entry point: hold the same session lock through
        # metadata read, encounter restore, registration and welcome enqueue.
        # Already serialized handlers must not acquire this lock recursively.
        async with self.server_protocol._mutation_lock:
            if self.db_session and self.game_session_db_id:
                game_mode, rules_dict = await run_blocking(
                    load_join_metadata, self.game_session_db_id, self.session_code,
                    str(user_info.get('user_id', '')), user_info.get('username', ''),
                )
            await self._register_client(websocket, client_id, user_info, game_mode, rules_dict)
        await self._outboxes[websocket].drain()

    async def _register_client(self, websocket, client_id, user_info, game_mode, rules_dict):
        role = user_info.get('role', 'player')
        active_encounter = await self.server_protocol._load_active_choice_encounter(self.session_code)
        choice_encounter = active_encounter.to_dict(dm=_is_dm(role)) if active_encounter else None

        self.clients[client_id] = websocket
        self.client_info[client_id] = {
            **user_info,
            "connected_at": time.time(),
            "last_ping": time.time()
        }
        self.websocket_to_client[websocket] = client_id

        logger.info(f"Client {client_id} ({user_info.get('username', 'unknown')}) added to session {self.session_code}")
        self._enqueue_message(websocket, Message(
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
            },
            version="0.2",
        ))

    async def remove_client(self, websocket: WebSocket):
        """Remove a client from this game session"""
        outbox = getattr(self, "_outboxes", {}).pop(websocket, None)
        if outbox is not None:
            outbox.close()
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

    def update_user_role(self, user_id: int, role: str) -> int:
        """Refresh authorization context for every client owned by one user."""
        updated_clients = 0
        for info in self.client_info.values():
            if info.get("user_id") != user_id:
                continue
            info["role"] = role
            updated_clients += 1
        return updated_clients

    async def wait_for_mutations(self) -> None:
        """Wait for serialized session mutations before final persistence."""
        await self.server_protocol.wait_for_mutations()

    async def handle_protocol_message(self, websocket: WebSocket, message_str: str):
        """Handle incoming protocol message from a client"""
        request = None
        message = None
        try:
            request = json.loads(message_str)
            message = Message.from_dict(request)
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
            await self._reject_protocol_request(websocket, "Invalid JSON format" if message is None else "Command outcome is uncertain",
                request=request, uncertain=message is not None)
        except Exception:
            logger.exception(
                "WebSocket protocol handler failed",
                extra={"event_name": "websocket.message.failed", "outcome": "error"},
            )
            await self._reject_protocol_request(websocket, "Internal server error", request=request, uncertain=message is not None)
        finally:
            self._release_db_session()

    async def broadcast_to_session(self, message: Message, exclude_client: Optional[str] = None):
        """Broadcast message to all clients in this game session"""
        disconnected_clients = []
        broadcast_count = 0

        for client_id, websocket in list(self.clients.items()):
            if self.clients.get(client_id) is not websocket:
                continue
            if client_id != exclude_client:
                try:
                    self._enqueue_message(websocket, message)
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
        for cid, ws in list(self.clients.items()):
            if self.clients.get(cid) is not ws:
                continue
            if cid == exclude_client:
                continue
            role = self.client_info.get(cid, {}).get('role', 'player')
            if not _is_dm(role) and layer not in get_visible_layers(role):
                continue
            try:
                self._enqueue_message(ws, message)
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
                self._enqueue_message(websocket, message)
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

    def _enqueue_message(self, websocket: WebSocket, message: Message):
        if message.type in {MessageType.TABLE_RESPONSE, MessageType.TABLE_DATA}:
            snapshot = copy.deepcopy(message)
            return self._outbox(websocket).enqueue_snapshot(frame.to_json() for frame in (snapshot,))
        disposable = message.type in {MessageType.SPRITE_DRAG_PREVIEW, MessageType.SPRITE_RESIZE_PREVIEW,
            MessageType.SPRITE_ROTATE_PREVIEW, MessageType.PAINT_PREVIEW, MessageType.PAINT_PREVIEW_CANCEL}
        self.enqueue_wire(websocket, message.to_json(), disposable=disposable)

    def enqueue_wire(self, websocket: WebSocket, payload: str, *, disposable=False):
        """One writer for both protocol and connection-manager messages."""
        return self._outbox(websocket).enqueue(payload, disposable=disposable)

    async def send_snapshot(self, messages: list[Message], client_id: str):
        """Queue one immutable recovery stream without waiting under a state lock."""
        websocket = self.clients.get(client_id)
        if websocket is not None:
            self._outbox(websocket).enqueue_snapshot(message.to_json() for message in messages)

    def _outbox(self, websocket: WebSocket):
        if not hasattr(self, "_outboxes"):
            self._outboxes = {}
        outbox = self._outboxes.get(websocket)
        if outbox is None:
            async def send(payload):
                await asyncio.wait_for(websocket.send_text(payload), timeout=settings.WS_SEND_TIMEOUT_SECONDS)

            async def failed():
                logger.warning("Slow or disconnected WebSocket requires fresh synchronization", extra={
                    "event_name": "websocket.delivery.failed", **created_outbox.failure_details})
                await self.remove_client(websocket)
                try:
                    await asyncio.wait_for(websocket.close(code=1013, reason="Resynchronize session"), timeout=1)
                except Exception:
                    logger.debug("WebSocket already closed")

            created_outbox = WebSocketOutbox(send, failed)
            self._outboxes[websocket] = created_outbox
            return created_outbox
        return outbox

    async def drain_outbound(self):
        """Lifecycle/test boundary; mutation handlers must only enqueue."""
        for outbox in list(getattr(self, "_outboxes", {}).values()):
            await outbox.drain()

    async def _send_message(self, websocket: WebSocket, message: Message):
        """Lifecycle delivery joins the same writer as queued mutation events."""
        if websocket in self.websocket_to_client:
            self._enqueue_message(websocket, message)
            await self._outboxes[websocket].drain()
            return
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
        request: dict | None = None,
        uncertain: bool = False,
    ):
        """Send error message to WebSocket"""
        data: dict[str, object] = {
            "error": error_message,
            "session_code": self.session_code
        }
        if isinstance(request, dict):
            def identity(value):
                return value if isinstance(value, str) and 0 < len(value) <= 128 else None
            causation_id = identity(request.get("message_id"))
            correlation_id = identity(request.get("correlation_id")) or causation_id
            payload = request.get("data")
            if isinstance(payload, dict):
                for key in ("action_id", "operation_id", "table_id", "sprite_id"):
                    value = identity(payload.get(key))
                    if value is not None:
                        data[key] = value
            data["code"] = "outcome_unknown" if uncertain else "invalid_payload"
            if uncertain:
                data["resync_required"] = True
        error_msg = Message(MessageType.ERROR, data, causation_id=causation_id, correlation_id=correlation_id)
        await self._send_message(websocket, error_msg)

    async def _reject_protocol_request(self, websocket, error, *, request, uncertain=False):
        # Schema validation rejects the whole envelope before dispatch. Each
        # member owns client intent; an outer error alone cannot release it.
        if isinstance(request, dict) and request.get("type") == MessageType.BATCH_REQUEST.value:
            payload = request.get("data")
            members = payload.get("messages") if isinstance(payload, dict) else None
            if isinstance(members, list) and len(members) <= 50:
                for member in members:
                    if isinstance(member, dict):
                        await self._send_error(websocket, error, request=member, uncertain=uncertain)
        await self._send_error(websocket, error, request=request, uncertain=uncertain)

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
        for outbox in getattr(self, "_outboxes", {}).values():
            outbox.close()
        getattr(self, "_outboxes", {}).clear()
        self.clients.clear()
        self.client_info.clear()
        self.websocket_to_client.clear()
        self.table_manager.clear_tables()

    def to_db(self) -> bool:
        """Save GameSessionProtocolService state to database"""
        try:
            if not self.db_session or not self.game_session_db_id or not self.table_manager.persistence_allowed():
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
        finally:
            self._release_db_session()

    async def kick_player(
        self,
        target_player_id: str | int | None,
        target_username: str | None,
        reason: str,
        kicked_by_client_id: str,
    ) -> bool:
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

            target_info = self.client_info[target_client_id]
            actor_info = self.client_info.get(kicked_by_client_id)
            if not actor_info:
                logger.warning(
                    "Player moderation denied: requesting client not found",
                    extra={"event_name": "player.moderation.denied", "reason": "actor_not_found"},
                )
                return False
            if target_client_id == kicked_by_client_id:
                logger.warning(
                    "Player moderation denied: self-targeting is not allowed",
                    extra={"event_name": "player.moderation.denied", "reason": "self_target"},
                )
                return False
            if not can_modify_role(
                actor_info.get('role', 'player'),
                target_info.get('role', 'player'),
            ):
                logger.warning(
                    "Player moderation denied by role hierarchy",
                    extra={"event_name": "player.moderation.denied", "reason": "role_hierarchy"},
                )
                return False

            kicked_username = target_info.get('username', 'unknown')
            kicker_username = actor_info.get('username', 'unknown')

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
                'timestamp': utc_now().isoformat(),
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

    async def ban_player(
        self,
        target_player_id: str | int | None,
        target_username: str | None,
        reason: str,
        duration: str,
        banned_by_client_id: str,
    ) -> bool:
        """Ban a player from the session"""
        try:
            # First kick the player
            kick_success = await self.kick_player(target_player_id, target_username, f"Banned: {reason}", banned_by_client_id)

            if kick_success:
                # Persist ban in the database if available
                banner_username = self.client_info.get(banned_by_client_id, {}).get('username', 'unknown')
                if self.db_session and self.game_session_db_id:
                    try:
                        append_ban_to_session(self.db_session, self.game_session_db_id, {
                            "player_id": target_player_id,
                            "username": target_username,
                            "reason": reason,
                            "duration": duration,
                            "banned_by": banner_username,
                            "timestamp": utc_now().isoformat()
                        })
                    finally:
                        self._release_db_session()
                logger.info(f"Player {target_username} banned by {banner_username} for {duration}: {reason}")

                # Broadcast ban notification
                ban_notification = Message(MessageType.PLAYER_LEFT, {
                    'username': target_username,
                    'reason': f'Banned by {banner_username} for {duration}: {reason}',
                    'timestamp': utc_now().isoformat(),
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

    def get_session_players(self) -> List[dict]:
        """Get list of connected players in this session"""
        players = []
        for client_id, info in self.client_info.items():
            players.append({
                'client_id': client_id,
                'username': info.get('username', 'unknown'),
                'user_id': info.get('user_id', 0),
                'role': info.get('role', 'player'),
                'ready': bool(info.get('ready', False)),
                'connected_at': info.get('connected_at', 0),
                'last_ping': info.get('last_ping', 0)
            })
        return players



