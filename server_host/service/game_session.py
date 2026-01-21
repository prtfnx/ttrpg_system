"""
WebSocket-based game session manager with integrated table protocol
"""
from typing import Dict, List, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio
import logging
import hashlib
import time
from datetime import datetime
from net.protocol import Message, MessageType, ProtocolHandler
from .game_session_protocol import GameSessionProtocolService
from server_host.database import models
from server_host.utils.logger import setup_logger
# Database imports
from server_host.database.database import SessionLocal
from server_host.database.session_utils import create_game_session_with_persistence, load_game_session_protocol_from_db, save_game_session_state
from server_host.service.asset_manager import get_server_asset_manager

logger = setup_logger(__name__)

class ConnectionManager:
    """Manages WebSocket connections for game sessions with protocol support"""
    
    def __init__(self):
        # session_code -> list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}        # websocket -> user_info
        self.connection_info: Dict[WebSocket, dict] = {}
        self.sessions_protocols: Dict[str, GameSessionProtocolService] = {}
        # Database sessions for persistence
        self.db_sessions: Dict[str, Any] = {}  # session_code -> db_session
        self.game_session_db_ids: Dict[str, int] = {}  # session_code -> game_session_db_id

    def _generate_client_id(self, user_id: int, username: str) -> str:
        """Generate unique client ID for protocol"""
        return hashlib.md5(f"{user_id}_{username}_{time.time()}".encode()).hexdigest()[:8]

    async def connect(self, websocket: WebSocket, session_code: str, 
                      user_id: int, username: str):
        """Connect a user to a game session with protocol support"""
        
        await websocket.accept()
        logger.info(f"WebSocket connection accepted for user {username} in session {session_code}")
        if session_code not in self.active_connections:
            self.active_connections[session_code] = []
    
        self.active_connections[session_code].append(websocket)
        self.connection_info[websocket] = {
            "session_code": session_code,
            "user_id": user_id,
            "username": username,
            "connected_at": datetime.now()
        }
        client_id = self._generate_client_id(user_id, username)
        
        # Add to protocol service
        logger.debug(f"Initializing protocol service for session {session_code} with client_id {client_id}")
        
        # Try to load from database first
        db_session = None
        game_session_db_id = None
        logger.debug(f"Checking if session {session_code} exists in active protocols {self.sessions_protocols.keys()}")
        if session_code not in self.sessions_protocols:
            logger.debug(f"Session {session_code} not found in active protocols, initializing new one")
            try:                # Create database session
                db_session = SessionLocal()
                self.db_sessions[session_code] = db_session
                
                # Try to load existing session or create new one
                protocol_service, error = load_game_session_protocol_from_db(
                    db_session, session_code
                )
                logger.debug(f"Loaded protocol service: {protocol_service}, error: {error}")
                if protocol_service:
                    logger.info(f"Loaded existing session {session_code} from database")
                    self.game_session_db_ids[session_code] = protocol_service.game_session_db_id
                else:
                    # Create new session with database persistence
                    logger.info(f"Creating new session {session_code} with database persistence")
                    protocol_service, error = create_game_session_with_persistence(
                        db_session, session_code, user_id
                    )
                    if protocol_service:
                        self.game_session_db_ids[session_code] = protocol_service.game_session_db_id
                    else:
                        logger.warning(f"Failed to create persistent session: {error}")
                        # Fallback to non-persistent session
                        protocol_service = GameSessionProtocolService(session_code)
                
                self.sessions_protocols[session_code] = protocol_service
                
            except Exception as e:
                logger.error(f"Database session initialization failed: {e}")
                # Fallback to non-persistent session
                protocol_service = GameSessionProtocolService(session_code)
                self.sessions_protocols[session_code] = protocol_service
        else:
            protocol_service = self.sessions_protocols[session_code]
            # Get existing db_session or create new one if needed
            db_session = self.db_sessions.get(session_code)
            if not db_session:
                db_session = SessionLocal()
                self.db_sessions[session_code] = db_session
                
        logger.info(f"Adding client {client_id} to protocol service for session {session_code}")
        
        # Setup R2 asset permissions for this user (default to player role)
        # TODO: Get actual role from user database or session settings
        user_role = "player"  # This should come from your user management system
        if username.lower().startswith("dm") or username.lower().startswith("gm"):
            user_role = "dm"  # Simple heuristic, replace with proper role management
        
        asset_manager = get_server_asset_manager()
        asset_manager.setup_session_permissions(session_code, user_id, username, user_role)
        logger.info(f"Setup R2 asset permissions for {username} as {user_role} in session {session_code}")
        
        # Validate player exists in session (prevent kicked players from reconnecting)
        try:
            
            player = db_session.query(models.GamePlayer).filter(
                models.GamePlayer.user_id == user_id,
                models.GamePlayer.session_id == self.game_session_db_ids.get(session_code)
            ).first()
            
            if not player:
                logger.warning(f"User {username} (ID: {user_id}) attempted to connect to session {session_code} but is not a member")
                await websocket.close(code=1008, reason="Not a member of this session")
                return
            
            # Update connection status
            player.is_connected = True
            db_session.commit()
            logger.info(f"Updated connection status for player {username} to online")
        except Exception as e:
            logger.error(f"Failed to validate/update player connection status: {e}")
            await websocket.close(code=1011, reason="Database error")
            return
        
        await protocol_service.add_client(websocket, client_id, {
            "user_id": user_id,
            "username": username,
            "session_code": session_code
        })
        logger.info(f"Protocol service initialized for session {session_code} with client_id {client_id}")
        logger.info(f"User {username} connected to session {session_code} with client_id {client_id}")
        
        message = Message(
            MessageType.PLAYER_JOINED,{
            "username": username,
            "user_id": user_id,
            "client_id": client_id,
            "timestamp": datetime.now().isoformat()
            }
        )
        # Notify other players
        logger.info(f"Broadcasting player join message for user {username} in session {session_code}")
        await self.broadcast_to_session(session_code, message,exclude_websocket=websocket)

    async def disconnect(self, websocket: WebSocket):
        """Disconnect a user from their game session with protocol cleanup"""
        if websocket not in self.connection_info:
            return
        
        info = self.connection_info[websocket]
        session_code = info["session_code"]
        username = info["username"]
        user_id = info["user_id"]
        
        # Update database player connection status
        try:
            from server_host.database import models
            db_session = self.db_sessions.get(session_code)
            # If session's db connection is closed, create a new one
            if not db_session:
                db_session = SessionLocal()
                close_after = True
            else:
                close_after = False
                
            player = db_session.query(models.GamePlayer).filter(
                models.GamePlayer.user_id == user_id,
                models.GamePlayer.session_id == self.game_session_db_ids.get(session_code)
            ).first()
            if player:
                player.is_connected = False
                db_session.commit()
                logger.info(f"Updated connection status for player {username} to offline")
            
            if close_after:
                db_session.close()
        except Exception as e:
            logger.error(f"Failed to update player disconnection status: {e}")
        
        # Remove from protocol service first
        protocol_service = self.sessions_protocols.get(session_code)
        await protocol_service.remove_client(websocket)
          # Remove from connections
        if session_code in self.active_connections:
            if websocket in self.active_connections[session_code]:
                self.active_connections[session_code].remove(websocket)
            if not self.active_connections[session_code]:
                del self.active_connections[session_code]
                # Clean up empty session
                protocol_service = self.sessions_protocols.get(session_code)
                if protocol_service:
                    # Save to database before cleanup
                    try:
                        protocol_service.save_to_database()
                        logger.info(f"Session {session_code} data saved to database before cleanup")
                    except Exception as e:
                        logger.error(f"Error saving session {session_code} to database: {e}")
                    
                    protocol_service.cleanup()
                    del self.sessions_protocols[session_code]
                    
                    # Clean up database session
                    if session_code in self.db_sessions:
                        try:
                            self.db_sessions[session_code].close()
                            del self.db_sessions[session_code]
                        except Exception as e:
                            logger.error(f"Error closing database session: {e}")
                    
                    # Clean up R2 asset session data
                    asset_manager = get_server_asset_manager()
                    asset_manager.cleanup_session(session_code)
                    logger.info(f"Cleaned up R2 assets for session {session_code}")
                    
                    if session_code in self.game_session_db_ids:
                        del self.game_session_db_ids[session_code]

        del self.connection_info[websocket]
        
        logger.info(f"User {username} disconnected from session {session_code}")       
        # Notify other players
        # TODO: Handle all messages throught protocol
        await self.broadcast_to_session(session_code, 
        Message(
            MessageType.PLAYER_LEFT,
            {               
                    "username": username,
                    "timestamp": datetime.now().isoformat()
            }
        ))

    async def disconnect_user(self, session_code: str, user_id: int):
        """Force disconnect a specific user from a session (e.g., when kicked)"""
        logger.info(f"disconnect_user called: session={session_code}, user_id={user_id}")
        logger.info(f"Active sessions: {list(self.active_connections.keys())}")
        logger.info(f"All connection info: {[(ws, info) for ws, info in self.connection_info.items()]}")
        
        if session_code not in self.active_connections:
            logger.warning(f"Session {session_code} not in active_connections")
            logger.warning(f"Available sessions: {list(self.active_connections.keys())}")
            # Try case-insensitive match
            for active_session in self.active_connections.keys():
                if active_session.upper() == session_code.upper():
                    logger.info(f"Found case-insensitive match: {active_session}")
                    session_code = active_session
                    break
            else:
                return
        
        # Find and close all websockets for this user in this session
        websockets_to_close = []
        for websocket in self.active_connections[session_code]:
            if websocket in self.connection_info:
                info = self.connection_info[websocket]
                if info.get("user_id") == user_id:
                    websockets_to_close.append(websocket)
                    logger.info(f"Found websocket to close for user {user_id}: {info}")
        
        logger.info(f"Found {len(websockets_to_close)} websockets to close for user {user_id}")
        
        # Close the websockets - this will trigger disconnect via WebSocketDisconnect exception
        for websocket in websockets_to_close:
            try:
                logger.info(f"Closing WebSocket for user {user_id}")
                await websocket.close(code=1008, reason="Kicked from session")
                logger.info(f"WebSocket closed successfully for user {user_id}")
            except Exception as e:
                logger.error(f"Error closing websocket for user {user_id}: {e}")
                # Try manual cleanup if close failed
                try:
                    await self.disconnect(websocket)
                except Exception as e2:
                    logger.error(f"Error in manual disconnect cleanup: {e2}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to specific websocket"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")

    async def broadcast_to_session(self, session_code: str, message: Message, exclude_websocket: Optional[WebSocket] = None):
        """Broadcast message to all users in a session"""
        if session_code not in self.active_connections:
            return
        message_text = message.to_json()
        disconnected_websockets = []
        for websocket in self.active_connections[session_code]:
            if websocket == exclude_websocket:
                continue
                
            try:
                await websocket.send_text(message_text)
            except Exception as e:
                logger.error(f"Error broadcasting to websocket: {e}")
                disconnected_websockets.append(websocket)
        
        # Clean up disconnected websockets
        for ws in disconnected_websockets:
            await self.disconnect(ws)

    async def handle_message(self, websocket: WebSocket, message_data: dict):
        """Handle incoming message from a websocket with protocol support"""
        try:
            message_type = message_data.get("type")
            data = message_data.get("data", {})
            
            if websocket not in self.connection_info:
                await self.send_personal_message({
                    "type": "error",
                    "data": {"message": "Not connected to a session"}
                }, websocket)
                return
            
            info = self.connection_info[websocket]
            session_code = info["session_code"]
            username = info["username"]
            
            logger.debug(f"Received message: {message_data}")
            
            # Check if this is a protocol message (contains MessageType fields)
            if self._is_protocol_message(message_data):
                logger.debug(f"Processing as protocol message: {message_data.get('type')}")
                # Handle as protocol message
                protocol_service = self.sessions_protocols.get(session_code)

                if protocol_service:
                    # Convert to protocol message format
                    try:
                        protocol_message_str = json.dumps(message_data)
                        await protocol_service.handle_protocol_message(websocket, protocol_message_str)
                        return
                    except Exception as e:
                        logger.error(f"Error handling protocol message: {e}")
                        # Fall through to regular message handling
                else:
                    logger.error(f"No protocol service found for session: {session_code}")
            else:
                logger.debug(f"Processing as regular message: {message_data.get('type')}")
            
            # Handle regular game session messages
            # Add sender info
         
            response_message = Message(
                message_type,{                
                "data": data,
                "sender": username,
                "timestamp": datetime.now().isoformat()
            })
            
            if message_type == "chat_message":
                # Broadcast chat message to all session members
                await self.broadcast_to_session(session_code, response_message)
                
            elif message_type == "game_action":
                # Handle game actions (dice rolls, token moves, etc.)
                response_message["type"] = "game_action_result"
                await self.broadcast_to_session(session_code, response_message)
                
            elif message_type == "ping":
                # Respond to ping
                await self.send_personal_message({
                    "type": "pong",
                    "data": {"timestamp": datetime.now().isoformat()}
                }, websocket)
                
            else:
                logger.warning(f"Unknown message type: {message_type}")
                await self.send_personal_message({
                    "type": "error",
                    "data": {"message": f"Unknown message type: {message_type}"}
                }, websocket)
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")            
            await self.send_personal_message({
                "type": "error",
                "data": {"message": "Error processing message"}
            }, websocket)

    def _is_protocol_message(self, message_data: dict) -> bool:
        """Check if message is a protocol message"""
        # Protocol messages have 'type' field
        if 'type' in message_data:
            message_type = message_data.get('type')
            # Check if the message type is a valid MessageType enum value
            try:
                MessageType(message_type)
                logger.debug(f"Valid protocol message type: {message_type}")
                return True
            except ValueError:
                logger.debug(f"Invalid protocol message type: {message_type}")
                return False
        else:
            logger.debug(f"Message missing 'type' field: {message_data}")
            return False
          
               

    def get_session_players(self, session_code: str) -> List[dict]:
        """Get list of connected players in a session"""
        if session_code not in self.active_connections:
            return []
        
        players = []
        for websocket in self.active_connections[session_code]:
            if websocket in self.connection_info:
                info = self.connection_info[websocket]
                players.append({
                    "username": info["username"],
                    "user_id": info["user_id"],
                    "connected_at": info["connected_at"].isoformat()
                })
        return players

    async def kick_player(self, session_code: str, target_player_id: str, target_username: str, reason: str, kicked_by_client_id: str) -> bool:
        """Kick a player from a session"""
        if session_code in self.sessions_protocols:
            protocol_service = self.sessions_protocols[session_code]
            return await protocol_service.kick_player(target_player_id, target_username, reason, kicked_by_client_id)
        return False

    async def ban_player(self, session_code: str, target_player_id: str, target_username: str, reason: str, duration: str, banned_by_client_id: str) -> bool:
        """Ban a player from a session"""
        if session_code in self.sessions_protocols:
            protocol_service = self.sessions_protocols[session_code]
            return await protocol_service.ban_player(target_player_id, target_username, reason, duration, banned_by_client_id)
        return False

    def get_connection_status(self, session_code: str, client_id: str) -> dict:
        """Get connection status for a client in a session"""
        if session_code in self.sessions_protocols:
            protocol_service = self.sessions_protocols[session_code]
            return protocol_service.get_connection_status(client_id)
        return {'connected': False, 'error': 'Session not found'}

# Dependency function to get connection manager
_connection_manager = None

def get_connection_manager() -> ConnectionManager:
    """Dependency to get connection manager instance"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = ConnectionManager()
    return _connection_manager
