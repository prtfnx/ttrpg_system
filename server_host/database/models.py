"""
Database models for TTRPG server
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)  # Allow NULL for unique constraint
    full_name = Column(String(100), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    disabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    game_sessions = relationship("GameSession", back_populates="owner")

class GameSession(Base):
    __tablename__ = "game_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    session_code = Column(String(20), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    game_data = Column(Text)  # JSON data for game state
    
    # Relationships
    owner = relationship("User", back_populates="game_sessions")
    players = relationship("GamePlayer", back_populates="session")
    tables = relationship("VirtualTable", back_populates="session")

class GamePlayer(Base):
    __tablename__ = "game_players"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    character_name = Column(String(100))
    joined_at = Column(DateTime, default=datetime.utcnow)
    is_connected = Column(Boolean, default=False)
    
    # Relationships
    session = relationship("GameSession", back_populates="players")
    user = relationship("User")

class VirtualTable(Base):
    __tablename__ = "virtual_tables"
    
    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(String(36), unique=True, index=True, nullable=False)  # UUID
    name = Column(String(100), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    
    # Table properties
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    scale_x = Column(Float, default=1.0)
    scale_y = Column(Float, default=1.0)
    
    # Layer visibility (JSON string)
    layer_visibility = Column(Text)  # JSON: {"map": true, "tokens": true, ...}
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    session = relationship("GameSession", back_populates="tables")
    entities = relationship("Entity", back_populates="table", cascade="all, delete-orphan")

class Entity(Base):
    __tablename__ = "entities"
    
    id = Column(Integer, primary_key=True, index=True)
    entity_id = Column(Integer, nullable=False)  # Entity ID within the table
    sprite_id = Column(String(36), unique=True, index=True, nullable=False)  # UUID
    table_id = Column(Integer, ForeignKey("virtual_tables.id"), nullable=False)
    
    # Entity properties
    name = Column(String(100), nullable=False)
    position_x = Column(Integer, nullable=False)
    position_y = Column(Integer, nullable=False)
    layer = Column(String(50), nullable=False)
    texture_path = Column(String(500))
    
    # Transform properties
    scale_x = Column(Float, default=1.0)
    scale_y = Column(Float, default=1.0)
    rotation = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    table = relationship("VirtualTable", back_populates="entities")
