"""
FastAPI WebSocket router for TTRPG protocol integrated with game sessions
Provides WebSocket endpoints for game session communication with table protocol support
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from typing import Optional
import logging
import json
import jwt

from ..service.game_session import get_connection_manager, ConnectionManager
from ..service.game_session_protocol import get_session_protocol_manager, SessionProtocolManager
from ..database.database import get_db
from ..database import crud
from ..routers.users import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

async def get_user_from_token(token: str, db):
    """Get user from JWT token for WebSocket authentication"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            return None
        user = crud.get_user_by_username(db, username=username)
        return user
    except:
        return None

@router.websocket("/game/{session_code}")
async def websocket_game_session_endpoint(
    websocket: WebSocket,
    session_code: str,
    token: str = None,
    connection_manager: ConnectionManager = Depends(get_connection_manager)
):
    """WebSocket endpoint for game session with table protocol support"""
    logger.info(f"WebSocket connection request for game session: {session_code} by {username}")
    
    try:
        # Connect to game session
        await connection_manager.connect(websocket, session_code, user_id, username)
        
        # Handle messages
        while True:
            data = await websocket.receive_text()
            try:
                message_data = json.loads(data)
                await connection_manager.handle_message(websocket, message_data)
            except json.JSONDecodeError:
                await connection_manager.send_personal_message({
                    "type": "error",
                    "data": {"message": "Invalid JSON format"}
                }, websocket)
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                await connection_manager.send_personal_message({
                    "type": "error", 
                    "data": {"message": "Error processing message"}
                }, websocket)
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {username} disconnected from session {session_code}")
    except Exception as e:
        logger.error(f"WebSocket error for {username} in session {session_code}: {e}")
    finally:
        await connection_manager.disconnect(websocket)


# Legacy endpoints for backward compatibility
@router.websocket("/table/{table_name}")
async def websocket_table_endpoint(
    websocket: WebSocket,
    table_name: str,
    session_code: Optional[str] = "default",
    user_id: Optional[int] = 0,
    username: Optional[str] = "guest",
    connection_manager: ConnectionManager = Depends(get_connection_manager)
):
    """Legacy WebSocket endpoint for direct table access"""
    logger.info(f"Legacy WebSocket connection for table: {table_name}")
    
    # Redirect to game session endpoint
    await websocket_game_session_endpoint(
        websocket, session_code or "default", user_id or 0, username or "guest", connection_manager
    )


@router.websocket("/table")
async def websocket_default_table_endpoint(
    websocket: WebSocket,
    session_code: Optional[str] = "default",
    user_id: Optional[int] = 0,
    username: Optional[str] = "guest",
    connection_manager: ConnectionManager = Depends(get_connection_manager)
):
    """Legacy WebSocket endpoint for default table"""
    logger.info("Legacy WebSocket connection for default table")
    
    # Redirect to game session endpoint
    await websocket_game_session_endpoint(
        websocket, session_code or "default", user_id or 0, username or "guest", connection_manager
    )


@router.websocket("/")
async def websocket_general_endpoint(
    websocket: WebSocket,
    session_code: Optional[str] = "default",
    user_id: Optional[int] = 0,
    username: Optional[str] = "guest",
    connection_manager: ConnectionManager = Depends(get_connection_manager)
):
    """General WebSocket endpoint"""
    logger.info("General WebSocket connection")
    
    # Redirect to game session endpoint
    await websocket_game_session_endpoint(
        websocket, session_code or "default", user_id or 0, username or "guest", connection_manager
    )

# REST API endpoints for WebSocket management

@router.get("/stats")
async def get_websocket_stats(
    protocol_manager: SessionProtocolManager = Depends(get_session_protocol_manager)
):
    """Get WebSocket service statistics for all sessions"""
    try:
        stats = protocol_manager.get_all_sessions_stats()
        return JSONResponse(content={
            "status": "success",
            "data": {
                "total_sessions": len(stats),
                "sessions": stats
            }
        })
    except Exception as e:
        logger.error(f"Error getting WebSocket stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get WebSocket statistics")


@router.get("/stats/{session_code}")
async def get_session_stats(
    session_code: str,
    protocol_manager: SessionProtocolManager = Depends(get_session_protocol_manager)
):
    """Get WebSocket statistics for a specific session"""
    try:
        if session_code not in protocol_manager.sessions:
            raise HTTPException(status_code=404, detail=f"Session {session_code} not found")
        
        session_service = protocol_manager.get_session_service(session_code)
        stats = session_service.get_session_stats()
        
        return JSONResponse(content={
            "status": "success",
            "data": stats
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get session statistics")


@router.post("/broadcast/{session_code}")
async def broadcast_to_session(
    session_code: str,
    message_type: str,
    data: dict,
    exclude_client: Optional[str] = None,
    protocol_manager: SessionProtocolManager = Depends(get_session_protocol_manager)
):
    """Broadcast message to all clients in a specific session"""
    try:
        if session_code not in protocol_manager.sessions:
            raise HTTPException(status_code=404, detail=f"Session {session_code} not found")
        
        session_service = protocol_manager.get_session_service(session_code)
        
        # Import here to avoid circular dependency
        from net.protocol import Message, MessageType
        
        # Validate message type
        try:
            msg_type = MessageType(message_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid message type: {message_type}")
        
        message = Message(msg_type, data)
        await session_service.broadcast_to_session(message, exclude_client)
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Broadcasted {message_type} to session {session_code}"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error broadcasting to session: {e}")
        raise HTTPException(status_code=500, detail="Failed to broadcast message")


@router.post("/send/{session_code}/{client_id}")
async def send_message_to_client(
    session_code: str,
    client_id: str,
    message_type: str,
    data: dict,
    protocol_manager: SessionProtocolManager = Depends(get_session_protocol_manager)
):
    """Send message to specific client in a session"""
    try:
        if session_code not in protocol_manager.sessions:
            raise HTTPException(status_code=404, detail=f"Session {session_code} not found")
        
        session_service = protocol_manager.get_session_service(session_code)
        
        # Import here to avoid circular dependency
        from net.protocol import Message, MessageType
        
        # Validate message type
        try:
            msg_type = MessageType(message_type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid message type: {message_type}")
        
        message = Message(msg_type, data)
        await session_service.send_to_client(client_id, message)
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Sent {message_type} to client {client_id} in session {session_code}"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending message to client: {e}")
        raise HTTPException(status_code=500, detail="Failed to send message")


@router.delete("/sessions/{session_code}")
async def cleanup_session(
    session_code: str,
    protocol_manager: SessionProtocolManager = Depends(get_session_protocol_manager)
):
    """Manually cleanup a session (admin endpoint)"""
    try:
        if session_code not in protocol_manager.sessions:
            raise HTTPException(status_code=404, detail=f"Session {session_code} not found")
        
        protocol_manager.remove_session(session_code)
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Session {session_code} cleaned up"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up session: {e}")
        raise HTTPException(status_code=500, detail="Failed to cleanup session")


# Health check endpoint
@router.get("/health")
async def websocket_health_check():
    """WebSocket service health check"""
    return JSONResponse(content={
        "status": "healthy",
        "service": "game_session_websocket",
        "version": "2.0.0",
        "features": ["game_sessions", "table_protocol", "real_time_messaging"]
    })
