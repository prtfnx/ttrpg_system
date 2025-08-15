"""
WebSocket endpoints for game sessions
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Request
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import json
import logging
import jwt
import time

from ..database.database import get_db
from ..database import crud
from ..service.game_session import ConnectionManager, get_connection_manager
from ..routers.users import SECRET_KEY, ALGORITHM
from ..utils.logger import setup_logger
logger = setup_logger(__name__)

router = APIRouter()
templates = Jinja2Templates(directory="templates")

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
        # Authenticate user via token (multiple sources)
        user = None
        token_value = None
        
        # Method 1: Query parameter token
        if not token:
            token_value = websocket.query_params.get("token")
        else:
            token_value = token
        
        # Method 2: Authorization header
        if not token_value:
            auth_header = dict(websocket.headers).get("authorization")
            if auth_header:
                token_value = auth_header.replace("Bearer ", "")
        
        # Method 3: HTTP-only cookie (most secure)
        if not token_value:
            # Extract token from Cookie header
            cookie_header = dict(websocket.headers).get("cookie")
            if cookie_header:
                # Parse cookies from header
                cookies = {}
                for cookie in cookie_header.split(';'):
                    if '=' in cookie:
                        key, value = cookie.strip().split('=', 1)
                        cookies[key] = value
                token_value = cookies.get('token')
        
        if token_value:
            user = get_user_from_token(token_value, db)
            
        if not user:
            logger.error("Authentication failed - no valid token or cookie")
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
        user_id = user.id
        username = user.username
        logger.debug(f"User ID: {user_id}, Username: {username}")
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

@router.get("/test")
async def websocket_test_page(request: Request):
    """WebSocket test page using template"""
    return templates.TemplateResponse("websocket_test.html", {"request": request})

@router.get("/client")
async def game_client_page(request: Request):
    """Integrated game client with React UI + WASM rendering"""
    # Read vite_assets.html for asset injection
    try:
        with open("templates/vite_assets.html", "r", encoding="utf-8") as f:
            vite_assets = f.read()
    except Exception:
        vite_assets = ""
    return templates.TemplateResponse(
        "game_client.html",
        {"request": request, "vite_assets": vite_assets}
    )

@router.websocket("/ws")
async def websocket_test_endpoint(websocket: WebSocket):
    """Simple WebSocket endpoint for testing without authentication"""
    await websocket.accept()
    logger.info(f"Test WebSocket connection accepted from {websocket.client}")
    
    # Send welcome message
    welcome_msg = {
        "type": "welcome",
        "data": {"session_id": "test_session_123"},
        "timestamp": time.time()
    }
    await websocket.send_text(json.dumps(welcome_msg))
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                logger.info(f"Received test message: {message}")
                
                # Echo the message back or handle specific types
                if message.get("type") == "ping":
                    response = {
                        "type": "pong",
                        "timestamp": time.time()
                    }
                elif message.get("type") == "sprite_create":
                    # Echo sprite creation with an ID
                    sprite_data = message.get("data", {})
                    sprite_data["id"] = f"sprite_{int(time.time() * 1000)}"
                    response = {
                        "type": "sprite_create",
                        "data": sprite_data,
                        "timestamp": time.time()
                    }
                elif message.get("type") == "table_request":
                    # Send back some test sprites
                    response = {
                        "type": "table_data",
                        "data": {
                            "sprites": [
                                {
                                    "id": "test_1", 
                                    "name": "Test Hero", 
                                    "x": 100, 
                                    "y": 100, 
                                    "width": 40, 
                                    "height": 40, 
                                    "layer": "tokens",
                                    "scale_x": 1.0,
                                    "scale_y": 1.0,
                                    "rotation": 0.0,
                                    "texture_path": "hero.png",
                                    "visible": True,
                                    "color": "#00CC33"
                                },
                                {
                                    "id": "test_2", 
                                    "name": "Test Enemy", 
                                    "x": 200, 
                                    "y": 150, 
                                    "width": 35, 
                                    "height": 35, 
                                    "layer": "tokens",
                                    "scale_x": 1.0,
                                    "scale_y": 1.0,
                                    "rotation": 0.0,
                                    "texture_path": "enemy.png",
                                    "visible": True,
                                    "color": "#CC3300"
                                }
                            ]
                        },
                        "timestamp": time.time()
                    }
                else:
                    # Echo back the message
                    response = message.copy()
                    response["timestamp"] = time.time()
                
                await websocket.send_text(json.dumps(response))
                
            except json.JSONDecodeError:
                error_msg = {
                    "type": "error",
                    "data": {"message": "Invalid JSON format"},
                    "timestamp": time.time()
                }
                await websocket.send_text(json.dumps(error_msg))
                
    except WebSocketDisconnect:
        logger.info(f"Test WebSocket disconnected: {websocket.client}")
    except Exception as e:
        logger.error(f"Test WebSocket error: {e}")
        await websocket.close()