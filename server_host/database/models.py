"""
Database models for TTRPG server
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import declarative_base, relationship
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
    is_verified = Column(Boolean, default=False, index=True)
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    password_set_at = Column(DateTime, nullable=True)  # NULL = OAuth-only user who never set a password
    session_version = Column(Integer, default=0, nullable=False)  # Bump to invalidate all JWTs
    
    # Relationships
    game_sessions = relationship("GameSession", back_populates="owner")

class GameSession(Base):
    __tablename__ = "game_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    session_code = Column(String(20), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    is_demo = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    game_data = Column(Text)  # JSON data for game state
    
    # Relationships
    owner = relationship("User", back_populates="game_sessions")
    players = relationship("GamePlayer", back_populates="session")
    tables = relationship("VirtualTable", back_populates="session")
    invitations = relationship("SessionInvitation", back_populates="session")


class GamePlayer(Base):
    __tablename__ = "game_players"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    character_name = Column(String(100))
    role = Column(String(20), default="player")  # owner, co_dm, trusted_player, player, spectator
    joined_at = Column(DateTime, default=datetime.utcnow)
    is_connected = Column(Boolean, default=False)
    active_table_id = Column(String(36), nullable=True)  # UUID of user's active table
    
    # Relationships
    session = relationship("GameSession", back_populates="players")
    user = relationship("User")

class VirtualTable(Base):
    __tablename__ = "virtual_tables"
    
    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(String(36), unique=True, index=True, nullable=False)  # UUID
    name = Column(String(100), nullable=False)  # display_name - keeping for backward compatibility
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
    # Link to persistent character (nullable)
    character_id = Column(String(36), ForeignKey("session_characters.character_id"), nullable=True)
    # JSON array of user ids who can control this token (nullable)
    controlled_by = Column(Text, nullable=True)
    
    # Transform properties
    scale_x = Column(Float, default=1.0)
    scale_y = Column(Float, default=1.0)
    rotation = Column(Float, default=0.0)
    
    # Obstacle metadata (for client-side lighting/collision)
    obstacle_type = Column(String(20), nullable=True)  # "rectangle", "circle", "polygon", "line", None
    obstacle_data = Column(Text, nullable=True)  # JSON: shape-specific data
    
    # Generic metadata (JSON string — used by lights and other special entities, opaque to server)
    entity_metadata = Column('metadata', Text, nullable=True)
    
    # Token stats (for gameplay)
    hp = Column(Integer, nullable=True)
    max_hp = Column(Integer, nullable=True)
    ac = Column(Integer, nullable=True)
    aura_radius = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    table = relationship("VirtualTable", back_populates="entities")
    # Backref to SessionCharacter (nullable)
    character = relationship("SessionCharacter", back_populates="tokens", primaryjoin="Entity.character_id==SessionCharacter.character_id")

class Asset(Base):
    __tablename__ = "assets"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_name = Column(String(255), unique=True, index=True, nullable=False)  # Original filename
    r2_asset_id = Column(String(100), unique=True, index=True, nullable=False)  # R2 asset ID
    content_type = Column(String(100), nullable=False)  # MIME type
    file_size = Column(Integer, nullable=False)  # Size in bytes
    xxhash = Column(String(32), nullable=True)     # xxHash for fast verification
    
    # Metadata
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=True)  # Optional session association
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed = Column(DateTime, default=datetime.utcnow)
    
    # R2 specific metadata
    r2_key = Column(String(500), nullable=False)  # R2 object key
    r2_bucket = Column(String(100), nullable=False)  # R2 bucket name
    
    # Relationships
    uploader = relationship("User")
    session = relationship("GameSession")

class SessionCharacter(Base):
    __tablename__ = "session_characters"
    
    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(String(36), unique=True, index=True, nullable=False)  # UUID
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    character_name = Column(String(255), nullable=False)
    character_data = Column(Text, nullable=False)  # JSON blob of character data
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Versioning for optimistic concurrency
    version = Column(Integer, default=1)
    last_modified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    session = relationship("GameSession")
    owner = relationship("User", foreign_keys=[owner_user_id])
    # Tokens (entities) that reference this character
    tokens = relationship("Entity", back_populates="character")

    # Explicit relationship for last modifier to avoid FK ambiguity
    last_modified_by_user = relationship("User", foreign_keys=[last_modified_by])

class SessionInvitation(Base):
    __tablename__ = "session_invitations"
    
    id = Column(Integer, primary_key=True, index=True)
    invite_code = Column(String(32), unique=True, index=True, nullable=False)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    pre_assigned_role = Column(String(20), nullable=False, default="player")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    max_uses = Column(Integer, default=1)
    uses_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    session = relationship("GameSession", back_populates="invitations")
    creator = relationship("User")
    
    def is_valid(self) -> bool:
        """Validate invitation security state"""
        # Check if invitation is active
        if not getattr(self, 'is_active', True):
            return False
        # Check usage limits
        max_uses = getattr(self, 'max_uses', 0)
        uses_count = getattr(self, 'uses_count', 0)
        if max_uses > 0 and uses_count >= max_uses:
            return False
        # Check expiration
        expires_at = getattr(self, 'expires_at', None)
        if expires_at and datetime.utcnow() > expires_at:
            return False
        return True

class EmailVerificationToken(Base):
    """Email verification tokens for new user signups"""
    __tablename__ = "email_verification_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    
    # Relationship
    user = relationship("User")
    
    def is_valid(self) -> bool:
        """Check if token is still valid"""
        if self.used_at is not None:
            return False
        if datetime.utcnow() > self.expires_at:
            return False
        return True

class PasswordResetToken(Base):
    """Password reset tokens — stores SHA-256 hash only, never the raw token"""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA-256 hex
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class PendingEmailChange(Base):
    """Pending email change verification tokens"""
    __tablename__ = "pending_email_changes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    new_email = Column(String(100), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA-256 hex
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class AuditLog(Base):
    """Comprehensive audit logging for security events"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    session_code = Column(String(20), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(Text, nullable=True)
    details = Column(Text, nullable=True)  # JSON details
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationship
    user = relationship("User")
