"""
Pydantic models for the TTRPG server
"""
from .auth import LoginRequest, RegisterRequest, Token, TokenData
from .game import (
    GameAction,
    GamePlayer,
    GameSession,
    GameSessionCreate,
    GameSessionJoin,
    GameSessionWithPlayers,
    WebSocketMessage,
)

__all__ = [
    "Token",
    "TokenData",
    "LoginRequest",
    "RegisterRequest",
    "GameSessionCreate",
    "GameSessionJoin",
    "GameSession",
    "GamePlayer",
    "GameSessionWithPlayers",
    "WebSocketMessage",
    "GameAction"
]
