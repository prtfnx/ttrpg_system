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

logger = logging.getLogger(__name__)

router = APIRouter()

async def get_user_from_token(token: str, db: Session):
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
        # Authenticate user via token (from query parameter or header)
        if not token:
            # Try to get token from query parameters
            token = websocket.query_params.get("token")
        
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        
        # Verify session exists
        game_session = crud.get_game_session_by_code(db, session_code)
        if not game_session:
            await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
            return
        
        # Connect user to session
        await connection_manager.connect(websocket, session_code, user.id, user.username)
        
        # Send welcome message
        await connection_manager.send_personal_message({
            "type": "welcome",
            "data": {
                "session_name": game_session.name,
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