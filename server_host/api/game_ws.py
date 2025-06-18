"""
WebSocket endpoints for game sessions
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlalchemy.orm import Session
import json
import logging
import jwt

from ..database.database import get_db
from ..database import crud
from ..service.game_session import ConnectionManager, get_connection_manager
from ..routers.users import SECRET_KEY, ALGORITHM
from ..utils.logger import setup_logger
logger = setup_logger(__name__)

router = APIRouter()

def get_user_from_token(token: str, db: Session):
    """Get user from JWT token for WebSocket authentication"""
    try:
        logger.info(f"Validating JWT token: {token[:20]}...")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            logger.error("No username in JWT payload")
            return None
        user = crud.get_user_by_username(db, username=username)
        if user:
            logger.info(f"User {username} validated successfully")
        else:
            logger.error(f"User {username} not found in database")
        return user
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        return None

@router.websocket("/")
async def websocket_general_endpoint(
    websocket: WebSocket,
    connection_manager: ConnectionManager = Depends(get_connection_manager)
):
    """General WebSocket endpoint that redirects based on headers"""
    logger.info("General WebSocket connection attempt")
    
   
    try:
        # Extract session_code and token from headers
        logger.info(f"WebSocket headers: {websocket.headers}")
        headers = dict(websocket.headers)
        session_code = headers.get("session_code") 
                
        token = (            
            headers.get("authorization", "").replace("Bearer ", "") or
            headers.get("Authorization", "").replace("Bearer ", "") or
            websocket.query_params.get("token")
        )
        if not session_code:
            logger.error("No session_code provided in headers")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        if not token:
            logger.error("No token provided in headers or query params")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        
        logger.info(f"Redirecting to game session: {session_code}")
        
        # Call the game endpoint directly
        await websocket_game_endpoint(websocket, session_code, token, connection_manager)
        
    except Exception as e:
        logger.error(f"Error in general WebSocket endpoint: {e}")
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)



@router.websocket("/ws/game/{session_code}")
async def websocket_game_endpoint(
    websocket: WebSocket, 
    session_code: str,
    token: str = None,
    connection_manager: ConnectionManager = Depends(get_connection_manager)
):
    """WebSocket endpoint for game sessions"""
    # Get database session
    db = next(get_db())
    
    try:
        # Authenticate user via token (from query parameter or passed directly)
        if not token:
            # Try to get token from query parameters
            token = websocket.query_params.get("token")
        if not token:
            # Try to get from Authorization header
            auth_header = dict(websocket.headers).get("Authorization")
            if auth_header:
                token = auth_header.replace("Bearer ", "")
        if not token:
            logger.error("No token provided")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        
        user = get_user_from_token(token, db)
        if not user:
            logger.error("Invalid token")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return        # Check if session exists in database
        logger.info(f"User {user.username} connecting to session {session_code}")
        
        # Verify session exists in database
        db_game_session = crud.get_game_session_by_code(db, session_code)
        if not db_game_session:
            logger.error(f"Game session {session_code} not found in database")
            await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
            return
        
        logger.info(f"Game session found: {db_game_session.name}")       
        user_id = int(user.id)
        username = str(user.username)
        logger.debug(f"User ID: {user_id}, Username: {username}, user {user}, user id {user.id}")
        logger.info(f"Connecting user {username} with ID {user_id} to session {session_code}")
        await connection_manager.connect(websocket, session_code, user_id, username)
        
        logger.info(f"User {user.username} connected to session {session_code}")
        
        # Send welcome message
        await connection_manager.send_personal_message({
            "type": "welcome",
            
            "username": username,
            "data": {
                "user_id": user_id,
                "session_name": db_game_session.name,
                "session_code": session_code,
                "players": connection_manager.get_session_players(session_code)
            }
        }, websocket)
        
        # Listen for messages
        while True:
            try:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                await connection_manager.handle_message(websocket, message_data)
            except json.JSONDecodeError:
                await connection_manager.send_personal_message({
                    "type": "error",
                    "data": {"message": "Invalid JSON format"}
                }, websocket)
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected: {websocket.client}")
                await connection_manager.disconnect(websocket)
                break
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                break
                
    except WebSocketDisconnect:
        await connection_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await connection_manager.disconnect(websocket)
    finally:
        db.close()