"""
Game session Pydantic models
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class GameSessionCreate(BaseModel):
    name: str

class GameSessionJoin(BaseModel):
    session_code: str
    character_name: Optional[str] = None

class GameSession(BaseModel):
    id: int
    name: str
    session_code: str
    owner_id: int
    is_active: bool
    created_at: datetime
    game_data: Optional[str] = None
    
    class Config:
        from_attributes = True

class GamePlayer(BaseModel):
    id: int
    session_id: int
    user_id: int
    character_name: Optional[str] = None
    joined_at: datetime
    is_connected: bool
    
    class Config:
        from_attributes = True

class GameSessionWithPlayers(GameSession):
    players: List[GamePlayer] = []

# WebSocket message models
class WebSocketMessage(BaseModel):
    type: str
    data: Dict[str, Any]
    client_id: Optional[str] = None
    timestamp: Optional[float] = None

class GameAction(BaseModel):
    action_type: str
    player_id: str
    data: Dict[str, Any]
