"""
Pydantic schemas for API models
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Tuple
from datetime import datetime

# User schemas
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None

class User(UserBase):
    id: int
    disabled: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserInDB(User):
    hashed_password: str

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Entity schemas
class EntityBase(BaseModel):
    entity_id: int
    sprite_id: str
    name: str
    position_x: int
    position_y: int
    layer: str
    texture_path: Optional[str] = None
    scale_x: float = 1.0
    scale_y: float = 1.0
    rotation: float = 0.0
    obstacle_type: Optional[str] = None
    obstacle_data: Optional[str] = None  # JSON string
    # Character binding
    character_id: Optional[str] = None
    controlled_by: Optional[str] = None  # JSON array as string
    # Token stats
    hp: Optional[int] = None
    max_hp: Optional[int] = None
    ac: Optional[int] = None
    aura_radius: Optional[float] = None

class EntityCreate(EntityBase):
    pass

class EntityUpdate(BaseModel):
    name: Optional[str] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    layer: Optional[str] = None
    texture_path: Optional[str] = None
    scale_x: Optional[float] = None
    scale_y: Optional[float] = None
    rotation: Optional[float] = None
    obstacle_type: Optional[str] = None
    obstacle_data: Optional[str] = None  # JSON string
    # Character binding
    character_id: Optional[str] = None
    controlled_by: Optional[str] = None  # JSON array as string
    # Token stats
    hp: Optional[int] = None
    max_hp: Optional[int] = None
    ac: Optional[int] = None
    aura_radius: Optional[float] = None

class Entity(EntityBase):
    id: int
    table_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Virtual Table schemas
class VirtualTableBase(BaseModel):
    table_id: str
    name: str
    width: int
    height: int
    position_x: float = 0.0
    position_y: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0
    layer_visibility: Optional[Dict[str, bool]] = None

class VirtualTableCreate(VirtualTableBase):
    session_id: int

class VirtualTableUpdate(BaseModel):
    name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    scale_x: Optional[float] = None
    scale_y: Optional[float] = None
    layer_visibility: Optional[Dict[str, bool]] = None

class VirtualTable(VirtualTableBase):
    id: int
    session_id: int
    created_at: datetime
    updated_at: datetime
    entities: List[Entity] = []
    
    class Config:
        from_attributes = True

# Game Session schemas
class GameSessionBase(BaseModel):
    name: str

class GameSessionCreate(GameSessionBase):
    pass

class GameSessionUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    game_data: Optional[str] = None

class GameSession(GameSessionBase):
    id: int
    session_code: str
    owner_id: int
    is_active: bool
    created_at: datetime
    game_data: Optional[str] = None
    
    class Config:
        from_attributes = True

class GameSessionWithData(GameSession):
    owner: User
    players: List["GamePlayer"] = []
    tables: List[VirtualTable] = []

# Game Player schemas
class GamePlayerBase(BaseModel):
    character_name: Optional[str] = None

class GamePlayerCreate(GamePlayerBase):
    session_code: str

class GamePlayer(GamePlayerBase):
    id: int
    session_id: int
    user_id: int
    joined_at: datetime
    is_connected: bool
    user: User
    
    class Config:
        from_attributes = True
