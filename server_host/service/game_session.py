"""
WebSocket-based game session manager with integrated table protocol
"""
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio
import logging
import hashlib
import time
from datetime import datetime

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages WebSocket connections for game sessions with protocol support"""
    
    def __init__(self):
        # session_code -> list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # websocket -> user_info
        self.connection_info: Dict[WebSocket, dict] = {}
        # Import here to avoid circular dependency
        from .game_session_protocol import get_session_protocol_manager, SessionProtocolManager
        self.protocol_manager: SessionProtocolManager = get_session_protocol_manager()

    def _generate_client_id(self, user_id: int, username: str) -> str:
        """Generate unique client ID for protocol"""
        return hashlib.md5(f"{user_id}_{username}_{time.time()}".encode()).hexdigest()[:8]

    async def connect(self, websocket: WebSocket, session_code: str, user_id: int, username: str):
        """Connect a user to a game session with protocol support"""
        await websocket.accept()
        
        if session_code not in self.active_connections:
            self.active_connections[session_code] = []
        
        self.active_connections[session_code].append(websocket)
        self.connection_info[websocket] = {
            "session_code": session_code,
            "user_id": user_id,
            "username": username,
            "connected_at": datetime.now()
        }
        
        # Generate client ID for protocol
        client_id = self._generate_client_id(user_id, username)
        
        # Add to protocol service
        protocol_service = self.protocol_manager.get_session_service(session_code)
        await protocol_service.add_client(websocket, client_id, {
            "user_id": user_id,
            "username": username,
            "session_code": session_code
        })
        
        logger.info(f"User {username} connected to session {session_code} with client_id {client_id}")
        
        # Notify other players
        await self.broadcast_to_session(session_code, {
            "type": "player_joined",
            "data": {
                "username": username,
                "user_id": user_id,
                "client_id": client_id,
                "timestamp": datetime.now().isoformat()
            }
        }, exclude_websocket=websocket)

    async def disconnect(self, websocket: WebSocket):
        """Disconnect a user from their game session with protocol cleanup"""
        if websocket not in self.connection_info:
            return
        
        info = self.connection_info[websocket]
        session_code = info["session_code"]
        username = info["username"]
        
        # Remove from protocol service first
        protocol_service = self.protocol_manager.get_session_service(session_code)
        await protocol_service.remove_client(websocket)
        
        # Remove from connections
        if session_code in self.active_connections:
            if websocket in self.active_connections[session_code]:
                self.active_connections[session_code].remove(websocket)
            if not self.active_connections[session_code]:
                del self.active_connections[session_code]
                # Clean up empty session
                self.protocol_manager.remove_session(session_code)
        
        del self.connection_info[websocket]
        
        logger.info(f"User {username} disconnected from session {session_code}")
        
        # Notify other players
        await self.broadcast_to_session(session_code, {
            "type": "player_left", 
            "data": {
                "username": username,
                "timestamp": datetime.now().isoformat()
            }
        })

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to specific websocket"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")

    async def broadcast_to_session(self, session_code: str, message: dict, exclude_websocket: Optional[WebSocket] = None):
        """Broadcast message to all users in a session"""
        if session_code not in self.active_connections:
            return
        
        message_text = json.dumps(message)
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
                protocol_service = self.protocol_manager.get_session_service(session_code)
                
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
            response_message = {
                "type": message_type,
                "data": data,
                "sender": username,
                "timestamp": datetime.now().isoformat()
            }
            
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
        # Protocol messages have 'message_type' and 'data' fields
        return 'message_type' in message_data or ('type' in message_data and 'data' in message_data and 
                message_data.get('type') in ['ping', 'pong', 'table_request', 'table_data', 'new_table_request', 
                                            'new_table_response', 'table_update', 'sprite_update', 'file_request', 
                                            'file_data', 'compendium_sprite_add', 'compendium_sprite_update', 
                                            'compendium_sprite_remove', 'error'])

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
