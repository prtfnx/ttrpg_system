"""
Pydantic schemas for API models
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List
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

# Game Session schemas
class GameSessionBase(BaseModel):
    name: str

class GameSessionCreate(GameSessionBase):
    pass

class GameSession(GameSessionBase):
    id: int
    session_code: str
    owner_id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class GameSessionWithPlayers(GameSession):
    owner: User
    players: List["GamePlayer"] = []

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
