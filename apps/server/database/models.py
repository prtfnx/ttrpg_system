"""
Database models for TTRPG server
"""
import json
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)  # Allow NULL for unique constraint
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    password_set_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # NULL = OAuth-only user who never set a password
    session_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # Bump to invalidate all JWTs

    # Relationships
    game_sessions = relationship("GameSession", back_populates="owner")

class GameSession(Base):
    __tablename__ = "game_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    session_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    game_data: Mapped[Optional[str]] = mapped_column(Text)  # JSON data for game state
    ban_list: Mapped[Optional[str]] = mapped_column(Text, default='[]')  # JSON array of ban records (player_id, reason, etc.)
    session_rules_json: Mapped[Optional[str]] = mapped_column(Text, default='{}')  # JSON blob of SessionRules
    game_mode: Mapped[Optional[str]] = mapped_column(String(20), default='free_roam')

    # Relationships
    owner = relationship("User", back_populates="game_sessions")
    players = relationship("GamePlayer", back_populates="session")
    tables = relationship("VirtualTable", back_populates="session")
    invitations = relationship("SessionInvitation", back_populates="session")
    chat_messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    assets = relationship("SessionAsset", back_populates="session", cascade="all, delete-orphan")


class GamePlayer(Base):
    __tablename__ = "game_players"
    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_gameplayer_session_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    character_name: Mapped[Optional[str]] = mapped_column(String(100))
    role: Mapped[Optional[str]] = mapped_column(String(20), default="player")  # owner, co_dm, trusted_player, player, spectator
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    active_table_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # UUID of user's active table

    # Relationships
    session = relationship("GameSession", back_populates="players")
    user = relationship("User")

class VirtualTable(Base):
    __tablename__ = "virtual_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    table_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)  # UUID
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # display_name - keeping for backward compatibility
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False)

    # Table properties
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)
    scale_x: Mapped[float] = mapped_column(Float, default=1.0)
    scale_y: Mapped[float] = mapped_column(Float, default=1.0)

    # Layer visibility (JSON string)
    layer_visibility: Mapped[Optional[str]] = mapped_column(Text)  # JSON: {"map": true, "tokens": true, ...}
    # Per-layer settings (JSON string) — persistent opacity, tint, inactive_opacity per layer
    layer_settings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: {"tokens": {"opacity": 1.0, "tint_color": [...], ...}}

    # Dynamic lighting (per-table, DM-controlled)
    dynamic_lighting_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    fog_exploration_mode: Mapped[Optional[str]] = mapped_column(String(20), default='current_only')
    ambient_light_level: Mapped[float] = mapped_column(Float, default=1.0)

    # Grid & coordinate system
    grid_cell_px: Mapped[float] = mapped_column(Float, default=50.0)       # pixels per grid cell
    cell_distance: Mapped[float] = mapped_column(Float, default=5.0)       # game units per cell
    distance_unit: Mapped[Optional[str]] = mapped_column(String(10), default='ft') # "ft" or "m"
    grid_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    snap_to_grid: Mapped[bool] = mapped_column(Boolean, default=True)
    grid_color_hex: Mapped[Optional[str]] = mapped_column(String(9), default='#ffffff')
    background_color_hex: Mapped[Optional[str]] = mapped_column(String(9), default='#2a3441')
    difficult_terrain_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")
    cover_zones_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("GameSession", back_populates="tables")
    entities = relationship("Entity", back_populates="table", cascade="all, delete-orphan")
    walls = relationship("Wall", back_populates="table", cascade="all, delete-orphan", foreign_keys="Wall.table_id", primaryjoin="VirtualTable.table_id==Wall.table_id")
    paint_strokes = relationship("PaintStroke", back_populates="table", cascade="all, delete-orphan", foreign_keys="PaintStroke.table_id")

class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)  # Entity ID within the table
    sprite_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)  # UUID
    table_id: Mapped[int] = mapped_column(Integer, ForeignKey("virtual_tables.id"), nullable=False)

    # Entity properties
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    position_x: Mapped[int] = mapped_column(Integer, nullable=False)
    position_y: Mapped[int] = mapped_column(Integer, nullable=False)
    layer: Mapped[str] = mapped_column(String(50), nullable=False)
    texture_path: Mapped[Optional[str]] = mapped_column(String(500))
    asset_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # R2/CDN asset hash used as texture identifier
    width: Mapped[float] = mapped_column(Float, default=0.0)
    height: Mapped[float] = mapped_column(Float, default=0.0)
    # Link to persistent character (nullable)
    character_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("session_characters.character_id"), nullable=True)
    # JSON array of user ids who can control this token (nullable)
    controlled_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Transform properties
    scale_x: Mapped[float] = mapped_column(Float, default=1.0)
    scale_y: Mapped[float] = mapped_column(Float, default=1.0)
    rotation: Mapped[float] = mapped_column(Float, default=0.0)

    # Obstacle metadata (for client-side lighting/collision)
    obstacle_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "rectangle", "circle", "polygon", "line", None
    obstacle_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: shape-specific data

    # Generic metadata (JSON string — used by lights and other special entities, opaque to server)
    entity_metadata: Mapped[Optional[str]] = mapped_column('metadata', Text, nullable=True)

    # Token stats (for gameplay)
    hp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_hp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ac: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    aura_radius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    aura_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # hex color e.g. '#ffaa00'

    # Vision fields (for dynamic lighting, client-enforced)
    vision_radius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # pixels (legacy)
    has_darkvision: Mapped[bool] = mapped_column(Boolean, default=False)
    darkvision_radius: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # pixels (legacy)
    aura_radius_units: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # game units (ft/m)
    vision_radius_units: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # game units (ft/m)
    darkvision_radius_units: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # game units (ft/m)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    table = relationship("VirtualTable", back_populates="entities")
    # Backref to SessionCharacter (nullable)
    character = relationship("SessionCharacter", back_populates="tokens", primaryjoin="Entity.character_id==SessionCharacter.character_id")

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)  # Stored/display filename
    r2_asset_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)  # R2 asset ID
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)  # MIME type
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)  # Size in bytes
    xxhash: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)     # xxHash for fast verification

    # Metadata
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # Timestamps
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)

    # R2 specific metadata
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)  # R2 object key
    r2_bucket: Mapped[str] = mapped_column(String(100), nullable=False)  # R2 bucket name

    # Relationships
    uploader = relationship("User")
    session_links = relationship("SessionAsset", back_populates="asset", cascade="all, delete-orphan")


class SessionAsset(Base):
    """Session-visible asset link.

    The binary object remains globally identified by content hash/R2 key, while
    this table controls which sessions can list or download it.
    """
    __tablename__ = "session_assets"
    __table_args__ = (
        UniqueConstraint("session_id", "asset_id", name="uq_session_asset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    added_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    last_accessed: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("GameSession", back_populates="assets")
    asset = relationship("Asset", back_populates="session_links")
    added_by_user = relationship("User", foreign_keys=[added_by])


class AssetUploadIntent(Base):
    """Durable upload transaction created before a presigned R2 PUT is issued."""
    __tablename__ = "asset_upload_intents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)
    session_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=True, index=True)
    session_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    xxhash: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="awaiting_upload", index=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    uploader = relationship("User", foreign_keys=[uploaded_by])
    session = relationship("GameSession")

class SessionCharacter(Base):
    __tablename__ = "session_characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)  # UUID
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    character_name: Mapped[str] = mapped_column(String(255), nullable=False)
    character_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON blob of character data
    owner_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # Timestamps
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Versioning for optimistic concurrency
    version: Mapped[int] = mapped_column(Integer, default=1)
    last_modified_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    session = relationship("GameSession")
    owner = relationship("User", foreign_keys=[owner_user_id])
    # Tokens (entities) that reference this character
    tokens = relationship("Entity", back_populates="character")

    # Explicit relationship for last modifier to avoid FK ambiguity
    last_modified_by_user = relationship("User", foreign_keys=[last_modified_by])

class SessionInvitation(Base):
    __tablename__ = "session_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    pre_assigned_role: Mapped[str] = mapped_column(String(20), nullable=False, default="player")
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    uses_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)  # SHA-256 hex
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class PendingEmailChange(Base):
    """Pending email change verification tokens"""
    __tablename__ = "pending_email_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    new_email: Mapped[str] = mapped_column(String(100), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)  # SHA-256 hex
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class CombatEncounter(Base):
    """Persisted combat state snapshot — written on start/end and key turns."""
    __tablename__ = "combat_encounters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    encounter_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)  # UUID
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    table_id: Mapped[str] = mapped_column(String(36), nullable=False)
    phase: Mapped[Optional[str]] = mapped_column(String(20), default="inactive")          # CombatPhase value
    round_number: Mapped[int] = mapped_column(Integer, default=0)
    current_turn_index: Mapped[int] = mapped_column(Integer, default=0)
    state_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    combatants_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")            # serialised list[Combatant]
    settings_json: Mapped[Optional[str]] = mapped_column(Text, default="{}")              # CombatSettings
    action_log_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")            # list[CombatAction]
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("GameSession")


class CombatActionJournal(Base):
    """Durable accepted combat command and its resulting state version."""
    __tablename__ = "combat_actions"
    __table_args__ = (
        UniqueConstraint(
            "encounter_id",
            "requester_key",
            "sequence_id",
            name="uq_combat_action_request",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    encounter_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("combat_encounters.encounter_id"),
        nullable=False,
        index=True,
    )
    requester_key: Mapped[str] = mapped_column(String(128), nullable=False)
    sequence_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    command_type: Mapped[str] = mapped_column(String(50), nullable=False)
    command_payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    result_payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    state_before_json: Mapped[str] = mapped_column(Text, nullable=False)
    state_after_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)


class ChoiceEncounter(Base):
    """Durable snapshot for the lightweight choice encounter workflow."""
    __tablename__ = "choice_encounters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    encounter_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False, index=True)
    session_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    table_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)
    participants_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    choices_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    dm_notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ChoiceEncounterEvent(Base):
    """Append-only event emitted by an accepted choice encounter transition."""
    __tablename__ = "choice_encounter_events"
    __table_args__ = (
        UniqueConstraint(
            "encounter_id",
            "sequence",
            name="uq_choice_encounter_event_sequence",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    encounter_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("choice_encounters.encounter_id"),
        nullable=False,
        index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Wall(Base):
    """Persistent wall segment — feeds directly into lighting and vision pipeline."""
    __tablename__ = "walls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    wall_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)   # UUID
    table_id: Mapped[str] = mapped_column(String(36), ForeignKey("virtual_tables.table_id"), nullable=False, index=True)

    x1: Mapped[float] = mapped_column(Float, nullable=False)
    y1: Mapped[float] = mapped_column(Float, nullable=False)
    x2: Mapped[float] = mapped_column(Float, nullable=False)
    y2: Mapped[float] = mapped_column(Float, nullable=False)

    wall_type: Mapped[str] = mapped_column(String(20), nullable=False, default='normal')
    blocks_movement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    blocks_light: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    blocks_sight: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    blocks_sound: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    is_door: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    door_state: Mapped[str] = mapped_column(String(10), nullable=False, default='closed')  # closed|open|locked
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default='both')   # both|left|right
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    table = relationship("VirtualTable", back_populates="walls", foreign_keys=[table_id], primaryjoin="Wall.table_id==VirtualTable.table_id")
    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self) -> dict:
        return {
            "wall_id": self.wall_id,
            "table_id": self.table_id,
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
            "wall_type": self.wall_type,
            "blocks_movement": self.blocks_movement,
            "blocks_light": self.blocks_light,
            "blocks_sight": self.blocks_sight,
            "blocks_sound": self.blocks_sound,
            "is_door": self.is_door,
            "door_state": self.door_state,
            "is_secret": self.is_secret,
            "direction": self.direction,
            "created_by": self.created_by,
        }


class AuditLog(Base):
    """Comprehensive audit logging for security events"""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    session_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # IPv6 support
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON details
    timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationship
    user = relationship("User")


class CharacterLog(Base):
    """Per-character action log: HP changes, spell casts, skill rolls, etc."""
    __tablename__ = "character_logs"

    id = mapped_column(Integer, primary_key=True, index=True)
    character_id: Mapped[str] = mapped_column(String(36), ForeignKey("session_characters.character_id"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # E.g. 'hp_change', 'spell_cast', 'slot_recovered', 'long_rest', 'skill_roll', 'item_change'
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ChatMessage(Base):
    """Persisted session chat message."""
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("game_sessions.id"), nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    recipient_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    table_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    message_json: Mapped[str] = mapped_column(Text, nullable=False)
    attachments_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    client_timestamp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    session = relationship("GameSession", back_populates="chat_messages")
    user = relationship("User", foreign_keys=[user_id])
    recipient = relationship("User", foreign_keys=[recipient_user_id])

    def to_dict(self) -> dict:
        try:
            message = json.loads(self.message_json)
        except Exception:
            message = {
                "id": self.message_id,
                "user": self.username or "Unknown",
                "text": self.text,
                "timestamp": self.client_timestamp,
            }
        if self.created_at and "created_at" not in message:
            message["created_at"] = self.created_at.isoformat()
        if self.attachments_json and "attachments" not in message:
            try:
                message["attachments"] = json.loads(self.attachments_json)
            except Exception:
                pass
        return message


class PaintStroke(Base):
    """Persistent paint stroke — per-table freehand drawing layer."""
    __tablename__ = "paint_strokes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    stroke_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)  # UUID
    table_id: Mapped[str] = mapped_column(String(36), ForeignKey("virtual_tables.table_id"), nullable=False, index=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    stroke_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON blob from WASM
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)

    table = relationship("VirtualTable", back_populates="paint_strokes", foreign_keys=[table_id])
    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self) -> dict:
        return {
            'stroke_id': self.stroke_id,
            'table_id': self.table_id,
            'created_by': self.created_by,
            'stroke_data': self.stroke_data,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
