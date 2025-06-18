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
        logger.info(f"Adding client {client_id} to protocol service for session {session_code}")
        
        # Setup R2 asset permissions for this user (default to player role)
        # TODO: Get actual role from user database or session settings
        user_role = "player"  # This should come from your user management system
        if username.lower().startswith("dm") or username.lower().startswith("gm"):
            user_role = "dm"  # Simple heuristic, replace with proper role management
        
        asset_manager = get_server_asset_manager()
        asset_manager.setup_session_permissions(session_code, user_id, username, user_role)
        logger.info(f"Setup R2 asset permissions for {username} as {user_role} in session {session_code}")
        
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
            
            # Check if this is a protocol message (contains MessageType fields)
            if self._is_protocol_message(message_data):
                # Handle as protocol message
                protocol_service = self.sessions_protocols.get(session_code)

                # Convert to protocol message format
                try:
                    protocol_message_str = json.dumps(message_data)
                    await protocol_service.handle_protocol_message(websocket, protocol_message_str)
                    return
                except Exception as e:
                    logger.error(f"Error handling protocol message: {e}")
                    # Fall through to regular message handling
            
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
        # Protocol messages have 'type' and 'data' fields       
        if 'type' in message_data and 'data' in message_data:
            message_type = message_data.get('type')
            # Check if the message type is a valid MessageType enum value
            try:
                MessageType(message_type)
                return True
            except ValueError:
                return False
        else:
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

# Dependency function to get connection manager
_connection_manager = None

def get_connection_manager() -> ConnectionManager:
    """Dependency to get connection manager instance"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = ConnectionManager()
    return _connection_manager
