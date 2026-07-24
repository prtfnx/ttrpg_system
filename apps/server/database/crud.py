"""
Database CRUD operations
"""
import json
import re
import secrets
import string
import uuid
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from utils.logger import setup_logger

from . import models, schemas

logger = setup_logger(__name__)

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if hashed_password is None:
        return False
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

def generate_session_code() -> str:
    """Generate a unique session code"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

def validate_username(username: str) -> tuple[bool, str]:
    """
    Validate username format and length.

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not username:
        return False, "Username is required"

    if len(username) < 4:
        return False, "Username must be at least 4 characters long"

    if len(username) > 50:
        return False, "Username must be less than 50 characters"

    # Check for valid characters (alphanumeric and underscore)
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return False, "Username can only contain letters, numbers, and underscores"

    return True, ""

def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password format and length.

    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"

    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if len(password) > 128:
        return False, "Password must be less than 128 characters"

    if not any(c.isupper() for c in password):
        return False, "Password must include at least one uppercase letter"

    if not any(c.islower() for c in password):
        return False, "Password must include at least one lowercase letter"

    if not any(c.isdigit() for c in password):
        return False, "Password must include at least one number"

    return True, ""

def check_registration_flood_protection(db: Session, time_window_minutes: int = 10, max_registrations: int = 10) -> tuple[bool, str]:
    """
    Check if too many users have been registered recently (flood protection).

    Args:
        db: Database session
        time_window_minutes: Time window to check
        max_registrations: Maximum registrations allowed in time window

    Returns:
        Tuple of (is_allowed, error_message)
    """
    cutoff_time = datetime.utcnow() - timedelta(minutes=time_window_minutes)

    recent_registrations = db.query(func.count(models.User.id)).filter(
        models.User.created_at >= cutoff_time
    ).scalar()

    if recent_registrations >= max_registrations:
        return False, f"Too many registrations in the last {time_window_minutes} minutes. Please try again later."

    return True, ""

# User operations
def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def register_user(db: Session, username: str, password: str, email: Optional[str] = None, full_name: Optional[str] = None):
    """Register a new user - simplified version with validation and flood protection"""

    # Validate input
    username_valid, username_error = validate_username(username)
    if not username_valid:
        return None, username_error

    password_valid, password_error = validate_password(password)
    if not password_valid:
        return None, password_error

    # Check flood protection
    flood_allowed, flood_error = check_registration_flood_protection(db)
    if not flood_allowed:
        return None, flood_error

    # Check if user already exists
    if get_user_by_username(db, username):
        return None, "Username already exists"

    # Check email uniqueness if provided
    if email and email.strip() and get_user_by_email(db, email.strip()):
        return None, "Email already registered"

    # Handle empty email - set to None instead of empty string to avoid unique constraint issues
    email_value = email if email and email.strip() else None
    full_name_value = full_name if full_name and full_name.strip() else None

    try:
        user_data = schemas.UserCreate(
            username=username,
            password=password,
            email=email_value,
            full_name=full_name_value
        )
        user = create_user(db, user_data)
        return user, "User registered successfully"
    except Exception as e:
        return None, f"Error creating user: {str(e)}"

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

# Game Session operations
def create_game_session(db: Session, session: schemas.GameSessionCreate, owner_id: int, session_code: Optional[str] = None):
    existing_session = db.query(models.GameSession).filter(
        models.GameSession.session_code == session_code,
        models.GameSession.is_active
    ).first()
    if existing_session:
        return existing_session

    db_session = models.GameSession(
        name=session.name,
        session_code=session_code,
        owner_id=owner_id
    )
    db.add(db_session)
    db.flush()  # get db_session.id before commit

    # Owner always gets an explicit GamePlayer record with role="owner"
    owner_player = models.GamePlayer(
        session_id=db_session.id,
        user_id=owner_id,
        role="owner",
        is_connected=False,
    )
    db.add(owner_player)
    db.commit()
    db.refresh(db_session)
    return db_session


def append_ban_to_session(db: Session, session_id: int, ban_entry: dict) -> bool:
    """Add a ban entry to a game's ban_list JSON column."""
    try:
        sess = db.get(models.GameSession, session_id)
        if not sess:
            return False
        existing = json.loads(sess.ban_list) if sess.ban_list else []
        existing.append(ban_entry)
        sess.ban_list = json.dumps(existing)
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error appending ban entry: {e}")
        return False

def get_game_session_by_code(db: Session, session_code: str):
    return db.query(models.GameSession).filter(
        models.GameSession.session_code == session_code,
        models.GameSession.is_active
    ).first()

def list_game_sessions(db: Session):
    """Return a list of (session_code, name, is_active) tuples for debugging."""
    sessions = db.query(models.GameSession).all()
    return [(s.session_code, s.name, bool(s.is_active)) for s in sessions]

def get_user_game_sessions(db: Session, user_id: int):
    """Get all game sessions where user is a player, with their role"""
    return (
        db.query(models.GameSession, models.GamePlayer.role)
        .join(models.GamePlayer, models.GameSession.id == models.GamePlayer.session_id)
        .filter(
            models.GamePlayer.user_id == user_id,
            models.GameSession.is_active
        )
        .all()
    )

def get_game_session(db: Session, session_id: int):
    return db.query(models.GameSession).filter(models.GameSession.id == session_id).first()

def update_game_session(db: Session, session_id: int, session_update: schemas.GameSessionUpdate):
    db_session = get_game_session(db, session_id)
    if not db_session:
        return None

    update_data = session_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_session, field, value)

    db.commit()
    db.refresh(db_session)
    return db_session


def get_session_rules_json(db: Session, session_code: str) -> str:
    """Return the raw JSON rules blob for a session (empty dict string if missing)."""
    session = get_game_session_by_code(db, session_code)
    if not session:
        return "{}"
    return session.session_rules_json or "{}"


def update_session_rules_json(db: Session, session_code: str, rules_json: str) -> bool:
    session = get_game_session_by_code(db, session_code)
    if not session:
        return False
    session.session_rules_json = rules_json
    db.commit()
    return True


def update_game_mode(db: Session, session_code: str, mode: str) -> bool:
    session = get_game_session_by_code(db, session_code)
    if not session:
        return False
    session.game_mode = mode
    db.commit()
    return True


def get_game_mode(db: Session, session_code: str) -> str:
    session = get_game_session_by_code(db, session_code)
    if not session:
        return "free_roam"
    return session.game_mode or "free_roam"


# Game Player operations
def join_game_session(
    db: Session,
    session_code: str,
    user_id: int,
    character_name: Optional[str] = None,
    *,
    create_if_missing: bool = False,
):
    session = get_game_session_by_code(db, session_code)
    if not session:
        return None

    existing_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == user_id
    ).first()

    if existing_player:
        existing_player.is_connected = True
        existing_player.character_name = character_name or existing_player.character_name
        db.commit()
        return existing_player

    if not create_if_missing:
        return None

    # Explicit creation is only for trusted callers such as migrations or
    # invite acceptance flows. Public session-code entry must not create access.
    role = "owner" if user_id == session.owner_id else "player"
    db_player = models.GamePlayer(
        session_id=session.id,
        user_id=user_id,
        character_name=character_name,
        role=role,
        is_connected=True,
    )
    db.add(db_player)
    db.commit()
    db.refresh(db_player)
    return db_player

def disconnect_player(db: Session, session_id: int, user_id: int):
    player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session_id,
        models.GamePlayer.user_id == user_id
    ).first()
    if player:
        player.is_connected = False
        db.commit()
    return None

def get_session_players(db: Session, session_id: int):
    return db.query(models.GamePlayer).filter(models.GamePlayer.session_id == session_id).all()


# Chat operations
def create_chat_message(db: Session, chat_data: schemas.ChatMessageCreate) -> models.ChatMessage:
    """Persist a chat message for a game session."""
    attachments_json = json.dumps(chat_data.attachments) if chat_data.attachments is not None else None
    db_message = models.ChatMessage(
        message_id=chat_data.message_id,
        client_operation_id=chat_data.client_operation_id,
        session_id=chat_data.session_id,
        user_id=chat_data.user_id,
        username=chat_data.username,
        channel=chat_data.channel,
        recipient_user_id=chat_data.recipient_user_id,
        table_id=chat_data.table_id,
        text=chat_data.text,
        message_json=json.dumps(chat_data.message_json),
        attachments_json=attachments_json,
        client_timestamp=chat_data.client_timestamp,
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message


def get_chat_message_by_client_operation(
    db: Session,
    *,
    session_id: int,
    user_id: int,
    client_operation_id: str,
) -> Optional[models.ChatMessage]:
    """Resolve an idempotent send only within its authenticated tenant/sender."""
    return db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == session_id,
        models.ChatMessage.user_id == user_id,
        models.ChatMessage.client_operation_id == client_operation_id,
    ).first()


def get_session_chat_message(
    db: Session,
    *,
    session_id: int,
    message_id: str,
) -> Optional[models.ChatMessage]:
    """Resolve a chat message only inside its owning session."""
    return db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == session_id,
        models.ChatMessage.message_id == message_id,
    ).first()


def get_session_chat_messages(
    db: Session,
    session_id: int,
    limit: Optional[int] = 30,
    before_id: Optional[int] = None,
    after_id: Optional[int] = None,
    channel: Optional[str] = None,
    user_id: Optional[int] = None,
    visible_to_user_id: Optional[int] = None,
    viewer_is_moderator: bool = False,
) -> list[models.ChatMessage]:
    """Load chat messages newest-window first, returned in chronological order."""
    query = db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id)

    if before_id is not None:
        query = query.filter(models.ChatMessage.id < before_id)
    if after_id is not None:
        query = query.filter(models.ChatMessage.id > after_id)
    if channel:
        query = query.filter(models.ChatMessage.channel == channel)
    if user_id is not None:
        query = query.filter(models.ChatMessage.user_id == user_id)
    if viewer_is_moderator:
        pass
    elif visible_to_user_id is not None:
        query = query.filter(or_(
            models.ChatMessage.channel != "whisper",
            models.ChatMessage.user_id == visible_to_user_id,
            models.ChatMessage.recipient_user_id == visible_to_user_id,
        ))
    else:
        query = query.filter(models.ChatMessage.channel != "whisper")

    query = query.order_by(models.ChatMessage.id.desc())
    safe_limit = max(1, min(int(limit or 30), 100))
    query = query.limit(safe_limit)

    messages = query.all()
    return list(reversed(messages))


def delete_expired_chat_messages(db: Session, cutoff: datetime) -> int:
    """Permanently remove chat records after the configured retention window."""
    deleted = db.query(models.ChatMessage).filter(
        models.ChatMessage.created_at < cutoff
    ).delete(synchronize_session=False)
    db.commit()
    return int(deleted)

# Virtual Table operations
def create_virtual_table(db: Session, table_data: schemas.VirtualTableCreate) -> models.VirtualTable:
    """Create a new virtual table in the database"""
    layer_visibility_json = json.dumps(table_data.layer_visibility) if table_data.layer_visibility else json.dumps({
        'map': True, 'tokens': True, 'dungeon_master': True, 'light': True, 'height': True, 'obstacles': True
    })

    db_table = models.VirtualTable(
        table_id=table_data.table_id,
        name=table_data.name,
        width=table_data.width,
        height=table_data.height,
        session_id=table_data.session_id,
        position_x=table_data.position_x,
        position_y=table_data.position_y,
        scale_x=table_data.scale_x,
        scale_y=table_data.scale_y,
        layer_visibility=layer_visibility_json,
        dynamic_lighting_enabled=table_data.dynamic_lighting_enabled,
        fog_exploration_mode=table_data.fog_exploration_mode,
        ambient_light_level=table_data.ambient_light_level,
        grid_cell_px=table_data.grid_cell_px,
        cell_distance=table_data.cell_distance,
        distance_unit=table_data.distance_unit,
        difficult_terrain_json=json.dumps(table_data.difficult_terrain or []),
        cover_zones_json=json.dumps(table_data.cover_zones or []),
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return db_table

def get_virtual_table_by_id(
    db: Session, table_id: str
) -> Optional[models.VirtualTable]:
    """Get virtual table by table_id (UUID)"""
    return db.query(models.VirtualTable).filter(models.VirtualTable.table_id == table_id).first()

def get_session_tables(db: Session, session_id: int) -> list[models.VirtualTable]:
    """Get all tables for a game session"""
    return db.query(models.VirtualTable).filter(models.VirtualTable.session_id == session_id).all()

def update_virtual_table(db: Session, table_id: str, table_update: schemas.VirtualTableUpdate) -> Optional[models.VirtualTable]:
    """Update virtual table"""
    db_table = get_virtual_table_by_id(db, table_id)
    if not db_table:
        return None

    update_data = table_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ('layer_visibility', 'layer_settings') and value is not None:
            setattr(db_table, field, json.dumps(value))
        elif field == 'difficult_terrain':
            db_table.difficult_terrain_json = json.dumps(value or [])
        elif field == 'cover_zones':
            db_table.cover_zones_json = json.dumps(value or [])
        else:
            setattr(db_table, field, value)

    db_table.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_table)
    return db_table

def delete_virtual_table(db: Session, table_id: str) -> bool:
    """Delete virtual table and all its entities"""
    db_table = get_virtual_table_by_id(db, table_id)
    if not db_table:
        return False

    db.delete(db_table)
    db.commit()
    return True

# Entity operations
def create_entity(db: Session, entity_data: schemas.EntityCreate, table_db_id: int) -> models.Entity:
    """Create a new entity in the database"""
    db_entity = models.Entity(
        entity_id=entity_data.entity_id,
        sprite_id=entity_data.sprite_id,
        table_id=table_db_id,
        name=entity_data.name,
        position_x=entity_data.position_x,
        position_y=entity_data.position_y,
        layer=entity_data.layer,
        texture_path=entity_data.texture_path,
        asset_id=entity_data.asset_id,
        width=entity_data.width or 0.0,
        height=entity_data.height or 0.0,
        scale_x=entity_data.scale_x,
        scale_y=entity_data.scale_y,
        rotation=entity_data.rotation,
        obstacle_type=entity_data.obstacle_type,
        obstacle_data=entity_data.obstacle_data,
        entity_metadata=entity_data.metadata,
        # Character binding
        character_id=entity_data.character_id,
        controlled_by=entity_data.controlled_by,
        # Token stats
        hp=entity_data.hp,
        max_hp=entity_data.max_hp,
        ac=entity_data.ac,
        aura_radius=entity_data.aura_radius,
        aura_color=getattr(entity_data, 'aura_color', None),
        aura_radius_units=getattr(entity_data, 'aura_radius_units', None),
        # Vision
        vision_radius=getattr(entity_data, 'vision_radius', None),
        has_darkvision=getattr(entity_data, 'has_darkvision', False),
        darkvision_radius=getattr(entity_data, 'darkvision_radius', None),
        vision_radius_units=getattr(entity_data, 'vision_radius_units', None),
        darkvision_radius_units=getattr(entity_data, 'darkvision_radius_units', None),
    )
    db.add(db_entity)
    db.commit()
    db.refresh(db_entity)
    return db_entity

def get_entity_by_sprite_id(
    db: Session, sprite_id: str
) -> Optional[models.Entity]:
    """Get entity by sprite_id (UUID)"""
    return db.query(models.Entity).filter(models.Entity.sprite_id == sprite_id).first()

def get_table_entities(db: Session, table_db_id: int) -> list[models.Entity]:
    """Get all entities for a table"""
    return db.query(models.Entity).filter(models.Entity.table_id == table_db_id).all()

def update_entity(db: Session, sprite_id: str, entity_update: schemas.EntityUpdate) -> Optional[models.Entity]:
    """Update entity"""
    db_entity = get_entity_by_sprite_id(db, sprite_id)
    if not db_entity:
        return None

    update_data = entity_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # schema field 'metadata' maps to SQLAlchemy attribute 'entity_metadata'
        attr = 'entity_metadata' if field == 'metadata' else field
        setattr(db_entity, attr, value)

    db_entity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_entity)
    return db_entity

def delete_entity(db: Session, sprite_id: str) -> bool:
    """Delete entity by sprite_id"""
    db_entity = get_entity_by_sprite_id(db, sprite_id)
    if not db_entity:
        return False

    db.delete(db_entity)
    db.commit()
    return True

def save_table_to_db(db: Session, virtual_table_obj, session_id: int) -> Optional[models.VirtualTable]:
    """
    Save a VirtualTable object from table.py to the database
    """
    # Convert UUID to string if needed
    table_id_str = str(virtual_table_obj.table_id) if virtual_table_obj.table_id else str(uuid.uuid4())

    # Check if table already exists
    existing_table = get_virtual_table_by_id(db, table_id_str)

    if existing_table:
        # Update existing table
        table_update = schemas.VirtualTableUpdate(
            name=virtual_table_obj.display_name,
            width=virtual_table_obj.width,
            height=virtual_table_obj.height,
            position_x=virtual_table_obj.position[0],
            position_y=virtual_table_obj.position[1],
            scale_x=virtual_table_obj.scale[0],
            scale_y=virtual_table_obj.scale[1],
            layer_visibility=virtual_table_obj.layer_visibility,
            dynamic_lighting_enabled=virtual_table_obj.dynamic_lighting_enabled,
            fog_exploration_mode=virtual_table_obj.fog_exploration_mode,
            ambient_light_level=virtual_table_obj.ambient_light_level,
            grid_cell_px=getattr(virtual_table_obj, 'grid_cell_px', 50.0),
            cell_distance=getattr(virtual_table_obj, 'cell_distance', 5.0),
            distance_unit=getattr(virtual_table_obj, 'distance_unit', 'ft'),
            difficult_terrain=_serialize_difficult_terrain(virtual_table_obj),
            cover_zones=_serialize_cover_zones(virtual_table_obj),
        )
        db_table = update_virtual_table(db, table_id_str, table_update)
    else:
        # Create new table
        table_data = schemas.VirtualTableCreate(
            table_id=table_id_str,
            name=virtual_table_obj.display_name,
            width=virtual_table_obj.width,
            height=virtual_table_obj.height,
            session_id=session_id,
            position_x=virtual_table_obj.position[0],
            position_y=virtual_table_obj.position[1],
            scale_x=virtual_table_obj.scale[0],
            scale_y=virtual_table_obj.scale[1],
            layer_visibility=virtual_table_obj.layer_visibility,
            dynamic_lighting_enabled=virtual_table_obj.dynamic_lighting_enabled,
            fog_exploration_mode=virtual_table_obj.fog_exploration_mode,
            ambient_light_level=virtual_table_obj.ambient_light_level,
            grid_cell_px=getattr(virtual_table_obj, 'grid_cell_px', 50.0),
            cell_distance=getattr(virtual_table_obj, 'cell_distance', 5.0),
            distance_unit=getattr(virtual_table_obj, 'distance_unit', 'ft'),
            difficult_terrain=_serialize_difficult_terrain(virtual_table_obj),
            cover_zones=_serialize_cover_zones(virtual_table_obj),
        )
        db_table = create_virtual_table(db, table_data)

    if db_table is None:
        logger.error(f"Failed to create/update virtual table {table_id_str}")
        return None

    # Synchronize entities: First get current entities in database for this table
    current_db_entities = db.query(models.Entity).filter(models.Entity.table_id == db_table.id).all()
    current_db_sprite_ids = {entity.sprite_id for entity in current_db_entities}

    # Get current in-memory sprite IDs
    current_memory_sprite_ids = {entity.sprite_id for entity in virtual_table_obj.entities.values()}

    # Delete entities that are in database but not in memory (these were deleted)
    entities_to_delete = current_db_sprite_ids - current_memory_sprite_ids
    if entities_to_delete:
        logger.info(f"Deleting {len(entities_to_delete)} entities from database that were removed from memory")
        for sprite_id in entities_to_delete:
            entity_to_delete = db.query(models.Entity).filter(models.Entity.sprite_id == sprite_id).first()
            if entity_to_delete:
                db.delete(entity_to_delete)
                logger.debug(f"Deleted entity from database: {sprite_id}")

    # Save/update entities that are in memory
    for entity in virtual_table_obj.entities.values():
        save_entity_to_db(db, entity, db_table.id)

    # Synchronize wall segments for lighting, movement validation, and doors.
    memory_walls = getattr(virtual_table_obj, 'walls', {})
    current_db_walls = get_table_walls(db, table_id_str)
    current_db_wall_ids = {wall.wall_id for wall in current_db_walls}
    current_memory_wall_ids = set(memory_walls.keys())

    walls_to_delete = current_db_wall_ids - current_memory_wall_ids
    for wall_id in walls_to_delete:
        delete_wall(db, wall_id)
        logger.debug(f"Deleted wall from database: {wall_id}")

    for wall in memory_walls.values():
        wall_data = {**wall.to_dict(), 'table_id': table_id_str}
        if wall.wall_id in current_db_wall_ids:
            update_wall(db, wall.wall_id, wall_data)
        else:
            create_wall(db, wall_data)

    # Commit all changes
    db.commit()
    logger.info(
        f"Synchronized table {virtual_table_obj.display_name}: "
        f"{len(entities_to_delete)} entities deleted, {len(virtual_table_obj.entities)} entities saved/updated, "
        f"{len(walls_to_delete)} walls deleted, {len(memory_walls)} walls saved/updated"
    )

    return db_table


def _serialize_difficult_terrain(virtual_table_obj) -> list[list[int]]:
    cells: set[tuple[int, int]] = (
        getattr(virtual_table_obj, 'difficult_terrain_cells', set()) or set()
    )
    return [[int(col), int(row)] for col, row in sorted(cells)]


def _serialize_cover_zones(virtual_table_obj) -> list[dict]:
    zones = getattr(virtual_table_obj, 'cover_zones', []) or []
    return [zone.to_dict() if hasattr(zone, 'to_dict') else dict(zone) for zone in zones]


def save_entity_to_db(db: Session, entity_obj, table_db_id: int) -> models.Entity:
    """
    Save an Entity object from table.py to the database
    """
    # Check if entity already exists
    existing_entity = get_entity_by_sprite_id(db, entity_obj.sprite_id)

    # Prepare controlled_by as JSON string
    controlled_by_json = None
    if hasattr(entity_obj, 'controlled_by') and entity_obj.controlled_by:
        controlled_by_json = json.dumps(entity_obj.controlled_by) if isinstance(entity_obj.controlled_by, list) else entity_obj.controlled_by

    if existing_entity:
        # Update existing entity
        entity_update = schemas.EntityUpdate(
            name=entity_obj.name,
            position_x=entity_obj.position[0],
            position_y=entity_obj.position[1],
            layer=entity_obj.layer,
            texture_path=entity_obj.texture_path,
            asset_id=getattr(entity_obj, 'asset_id', None),
            width=entity_obj.width,
            height=entity_obj.height,
            scale_x=entity_obj.scale_x,
            scale_y=entity_obj.scale_y,
            rotation=entity_obj.rotation,
            obstacle_type=entity_obj.obstacle_type,
            obstacle_data=json.dumps(entity_obj.obstacle_data) if entity_obj.obstacle_data else None,
            metadata=getattr(entity_obj, 'metadata', None),
            # Character binding
            character_id=getattr(entity_obj, 'character_id', None),
            controlled_by=controlled_by_json,
            # Token stats
            hp=getattr(entity_obj, 'hp', None),
            max_hp=getattr(entity_obj, 'max_hp', None),
            ac=getattr(entity_obj, 'ac', None),
            aura_radius=getattr(entity_obj, 'aura_radius', None),
            aura_color=getattr(entity_obj, 'aura_color', None),
            aura_radius_units=getattr(entity_obj, 'aura_radius_units', None),
            # Vision
            vision_radius=getattr(entity_obj, 'vision_radius', None),
            has_darkvision=getattr(entity_obj, 'has_darkvision', False),
            darkvision_radius=getattr(entity_obj, 'darkvision_radius', None),
            vision_radius_units=getattr(entity_obj, 'vision_radius_units', None),
            darkvision_radius_units=getattr(entity_obj, 'darkvision_radius_units', None),
        )
        db_entity = update_entity(db, entity_obj.sprite_id, entity_update)
    else:
        # Create new entity
        entity_data = schemas.EntityCreate(
            entity_id=entity_obj.entity_id,
            sprite_id=entity_obj.sprite_id,
            name=entity_obj.name,
            position_x=entity_obj.position[0],
            position_y=entity_obj.position[1],
            layer=entity_obj.layer,
            texture_path=entity_obj.texture_path,
            asset_id=getattr(entity_obj, 'asset_id', None),
            width=entity_obj.width,
            height=entity_obj.height,
            scale_x=entity_obj.scale_x,
            scale_y=entity_obj.scale_y,
            rotation=entity_obj.rotation,
            obstacle_type=entity_obj.obstacle_type,
            obstacle_data=json.dumps(entity_obj.obstacle_data) if entity_obj.obstacle_data else None,
            metadata=getattr(entity_obj, 'metadata', None),
            # Character binding
            character_id=getattr(entity_obj, 'character_id', None),
            controlled_by=controlled_by_json,
            # Token stats
            hp=getattr(entity_obj, 'hp', None),
            max_hp=getattr(entity_obj, 'max_hp', None),
            ac=getattr(entity_obj, 'ac', None),
            aura_radius=getattr(entity_obj, 'aura_radius', None),
            aura_color=getattr(entity_obj, 'aura_color', None),
            aura_radius_units=getattr(entity_obj, 'aura_radius_units', None),
            # Vision
            vision_radius=getattr(entity_obj, 'vision_radius', None),
            has_darkvision=getattr(entity_obj, 'has_darkvision', False),
            darkvision_radius=getattr(entity_obj, 'darkvision_radius', None),
            vision_radius_units=getattr(entity_obj, 'vision_radius_units', None),
            darkvision_radius_units=getattr(entity_obj, 'darkvision_radius_units', None),
        )
        db_entity = create_entity(db, entity_data, table_db_id)

    if db_entity is None:
        raise RuntimeError(
            f"Entity {entity_obj.sprite_id} disappeared while it was being updated"
        )
    return db_entity

def load_table_from_db(db: Session, table_id: str):
    """
    Load a VirtualTable from database and return as VirtualTable object
    Returns tuple: (VirtualTable object, success boolean)
    """
    try:
        from core_table.entities import Wall
        from core_table.table import CoverZone, Entity, VirtualTable

        db_table = get_virtual_table_by_id(db, table_id)
        if not db_table:
            return None, False

        # Create VirtualTable object
        virtual_table = VirtualTable(
            name=db_table.name,
            width=db_table.width,
            height=db_table.height,
            table_id=db_table.table_id
        )

        # Set additional properties
        virtual_table.position = (db_table.position_x, db_table.position_y)
        virtual_table.scale = (db_table.scale_x, db_table.scale_y)

        # Parse layer visibility
        if db_table.layer_visibility:
            virtual_table.layer_visibility = json.loads(db_table.layer_visibility)

        # Dynamic lighting settings
        virtual_table.dynamic_lighting_enabled = bool(db_table.dynamic_lighting_enabled or False)
        virtual_table.fog_exploration_mode = db_table.fog_exploration_mode or 'current_only'
        ambient = db_table.ambient_light_level
        virtual_table.ambient_light_level = float(ambient if ambient is not None else 1.0)
        virtual_table.grid_cell_px = float(db_table.grid_cell_px or 50.0)
        virtual_table.cell_distance = float(db_table.cell_distance or 5.0)
        virtual_table.distance_unit = db_table.distance_unit or 'ft'
        if db_table.difficult_terrain_json:
            cells = json.loads(db_table.difficult_terrain_json)
            virtual_table.difficult_terrain_cells = {
                (int(cell[0]), int(cell[1]))
                for cell in cells
                if isinstance(cell, list) and len(cell) >= 2
            }
        if db_table.cover_zones_json:
            zones = json.loads(db_table.cover_zones_json)
            virtual_table.cover_zones = [
                CoverZone.from_dict(zone)
                for zone in zones
                if isinstance(zone, dict)
            ]

        # Load entities
        db_entities = get_table_entities(db, db_table.id)
        for db_entity in db_entities:
            # Parse controlled_by JSON if present
            controlled_by = []
            if db_entity.controlled_by:
                try:
                    controlled_by = json.loads(db_entity.controlled_by) if isinstance(db_entity.controlled_by, str) else db_entity.controlled_by
                except json.JSONDecodeError:
                    controlled_by = []

            entity = Entity(
                name=db_entity.name,
                position=(db_entity.position_x, db_entity.position_y),
                layer=db_entity.layer,
                path_to_texture=db_entity.texture_path,
                entity_id=db_entity.entity_id,
                obstacle_type=db_entity.obstacle_type,
                obstacle_data=json.loads(db_entity.obstacle_data) if db_entity.obstacle_data else None,
                metadata=db_entity.entity_metadata,
                # Character binding
                character_id=db_entity.character_id,
                controlled_by=controlled_by,
                # Token stats
                hp=db_entity.hp,
                max_hp=db_entity.max_hp,
                ac=db_entity.ac,
                aura_radius=db_entity.aura_radius,
                aura_color=getattr(db_entity, 'aura_color', None),
                asset_id=getattr(db_entity, 'asset_id', None),
                width=float(getattr(db_entity, 'width', None) or 0.0),
                height=float(getattr(db_entity, 'height', None) or 0.0),
                vision_radius=getattr(db_entity, 'vision_radius', None),
                has_darkvision=bool(getattr(db_entity, 'has_darkvision', False)),
                darkvision_radius=getattr(db_entity, 'darkvision_radius', None),
                aura_radius_units=getattr(db_entity, 'aura_radius_units', None),
                vision_radius_units=getattr(db_entity, 'vision_radius_units', None),
                darkvision_radius_units=getattr(db_entity, 'darkvision_radius_units', None),
            )
            entity.sprite_id = db_entity.sprite_id
            entity.scale_x = db_entity.scale_x
            entity.scale_y = db_entity.scale_y
            entity.rotation = db_entity.rotation

            # Add to virtual table
            if entity.entity_id is not None:
                virtual_table.entities[entity.entity_id] = entity
                virtual_table.sprite_to_entity[entity.sprite_id] = entity.entity_id

            # Update grid (skip if position is out of bounds or layer doesn't exist)
            if (entity.layer in virtual_table.grid and
                0 <= entity.position[1] < len(virtual_table.grid[entity.layer]) and
                0 <= entity.position[0] < len(virtual_table.grid[entity.layer][0])):
                virtual_table.grid[entity.layer][entity.position[1]][entity.position[0]] = entity.entity_id

            # Update next entity ID
            if entity.entity_id is not None and entity.entity_id >= virtual_table.next_entity_id:
                virtual_table.next_entity_id = entity.entity_id + 1

        # Load wall segments into the in-memory wall registry used by lighting,
        # movement validation, and door operations.
        for db_wall in get_table_walls(db, db_table.table_id):
            virtual_table.add_wall(Wall.from_dict(db_wall.to_dict()))

        return virtual_table, True

    except Exception as e:
        print(f"Error loading table from database: {e}")
        return None, False


# ---------------------------------------------------------------------------
# Wall CRUD
# ---------------------------------------------------------------------------

def create_wall(db: Session, wall_data: dict) -> models.Wall:
    db_wall = models.Wall(
        wall_id=wall_data['wall_id'],
        table_id=wall_data['table_id'],
        x1=wall_data['x1'], y1=wall_data['y1'],
        x2=wall_data['x2'], y2=wall_data['y2'],
        wall_type=wall_data.get('wall_type', 'normal'),
        blocks_movement=wall_data.get('blocks_movement', True),
        blocks_light=wall_data.get('blocks_light', True),
        blocks_sight=wall_data.get('blocks_sight', True),
        blocks_sound=wall_data.get('blocks_sound', True),
        is_door=wall_data.get('is_door', False),
        door_state=wall_data.get('door_state', 'closed'),
        is_secret=wall_data.get('is_secret', False),
        direction=wall_data.get('direction', 'both'),
        created_by=wall_data.get('created_by'),
    )
    db.add(db_wall)
    db.commit()
    db.refresh(db_wall)
    return db_wall


def get_wall(db: Session, wall_id: str) -> models.Wall | None:
    return db.query(models.Wall).filter(models.Wall.wall_id == wall_id).first()


def get_table_walls(db: Session, table_id: str) -> list[models.Wall]:
    return db.query(models.Wall).filter(models.Wall.table_id == table_id).all()


def update_wall(db: Session, wall_id: str, updates: dict) -> models.Wall | None:
    _allowed = {
        'x1', 'y1', 'x2', 'y2', 'wall_type',
        'blocks_movement', 'blocks_light', 'blocks_sight', 'blocks_sound',
        'is_door', 'door_state', 'is_secret', 'direction',
    }
    db_wall = get_wall(db, wall_id)
    if not db_wall:
        return None
    for key, value in updates.items():
        if key in _allowed:
            setattr(db_wall, key, value)
    db_wall.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_wall)
    return db_wall


def delete_wall(db: Session, wall_id: str) -> bool:
    db_wall = get_wall(db, wall_id)
    if not db_wall:
        return False
    db.delete(db_wall)
    db.commit()
    return True


def delete_table_walls(db: Session, table_id: str) -> int:
    """Delete all walls for a table. Returns count deleted."""
    count = db.query(models.Wall).filter(models.Wall.table_id == table_id).delete()
    db.commit()
    return count


# -- Paint Strokes -------------------------------------------------------------

def create_paint_stroke(db: Session, table_id: str, stroke_id: str, stroke_data: str, created_by: Optional[int] = None) -> models.PaintStroke:
    stroke = models.PaintStroke(
        stroke_id=stroke_id,
        table_id=table_id,
        created_by=created_by,
        stroke_data=stroke_data,
    )
    db.add(stroke)
    db.commit()
    db.refresh(stroke)
    return stroke


def get_paint_strokes_for_table(db: Session, table_id: str) -> list[models.PaintStroke]:
    return db.query(models.PaintStroke).filter(models.PaintStroke.table_id == table_id).order_by(models.PaintStroke.created_at).all()


def get_paint_stroke(db: Session, table_id: str, stroke_id: str) -> Optional[models.PaintStroke]:
    return db.query(models.PaintStroke).filter(
        models.PaintStroke.table_id == table_id,
        models.PaintStroke.stroke_id == stroke_id,
    ).first()


def delete_paint_stroke(
    db: Session,
    table_id: str,
    stroke_id: str,
    *,
    created_by: Optional[int] = None,
) -> bool:
    query = db.query(models.PaintStroke).filter(
        models.PaintStroke.table_id == table_id,
        models.PaintStroke.stroke_id == stroke_id,
    )
    if created_by is not None:
        query = query.filter(models.PaintStroke.created_by == created_by)
    stroke = query.first()
    if not stroke:
        return False
    db.delete(stroke)
    db.commit()
    return True


def clear_paint_strokes_for_table(db: Session, table_id: str) -> int:
    count = db.query(models.PaintStroke).filter(models.PaintStroke.table_id == table_id).delete()
    db.commit()
    return count


def get_shared_measurements(
    db: Session, table_id: str
) -> list[models.SharedMeasurement]:
    return (
        db.query(models.SharedMeasurement)
        .filter(models.SharedMeasurement.table_id == table_id)
        .order_by(models.SharedMeasurement.created_at, models.SharedMeasurement.id)
        .all()
    )


def get_shared_measurement(
    db: Session,
    table_id: str,
    measurement_id: str,
) -> Optional[models.SharedMeasurement]:
    return db.query(models.SharedMeasurement).filter(
        models.SharedMeasurement.table_id == table_id,
        models.SharedMeasurement.measurement_id == measurement_id,
    ).first()


def upsert_shared_measurement(
    db: Session,
    *,
    table_id: str,
    measurement_id: str,
    created_by: int,
    kind: str,
    measurement_data: str,
) -> models.SharedMeasurement:
    measurement = get_shared_measurement(db, table_id, measurement_id)
    if measurement is None:
        measurement = models.SharedMeasurement(
            table_id=table_id,
            measurement_id=measurement_id,
            created_by=created_by,
            kind=kind,
            measurement_data=measurement_data,
        )
        db.add(measurement)
    else:
        if measurement.created_by != created_by:
            raise PermissionError("Only the creator can update a measurement")
        measurement.kind = kind
        measurement.measurement_data = measurement_data
        measurement.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(measurement)
    return measurement


def delete_shared_measurement(
    db: Session,
    table_id: str,
    measurement_id: str,
    *,
    created_by: Optional[int] = None,
) -> bool:
    query = db.query(models.SharedMeasurement).filter(
        models.SharedMeasurement.table_id == table_id,
        models.SharedMeasurement.measurement_id == measurement_id,
    )
    if created_by is not None:
        query = query.filter(models.SharedMeasurement.created_by == created_by)
    measurement = query.first()
    if measurement is None:
        return False
    db.delete(measurement)
    db.commit()
    return True


def clear_shared_measurements(
    db: Session,
    table_id: str,
    *,
    created_by: Optional[int] = None,
) -> int:
    query = db.query(models.SharedMeasurement).filter(
        models.SharedMeasurement.table_id == table_id
    )
    if created_by is not None:
        query = query.filter(models.SharedMeasurement.created_by == created_by)
    count = query.delete(synchronize_session=False)
    db.commit()
    return int(count)


def get_paint_templates(
    db: Session, session_id: int
) -> list[models.PaintTemplate]:
    return (
        db.query(models.PaintTemplate)
        .filter(models.PaintTemplate.session_id == session_id)
        .order_by(models.PaintTemplate.created_at, models.PaintTemplate.id)
        .all()
    )


def get_paint_template(
    db: Session,
    session_id: int,
    template_id: str,
) -> Optional[models.PaintTemplate]:
    return db.query(models.PaintTemplate).filter(
        models.PaintTemplate.session_id == session_id,
        models.PaintTemplate.template_id == template_id,
    ).first()


def create_paint_template(
    db: Session,
    *,
    session_id: int,
    template_id: str,
    created_by: int,
    name: str,
    description: Optional[str],
    strokes_json: str,
    thumbnail: Optional[str],
) -> models.PaintTemplate:
    template = models.PaintTemplate(
        session_id=session_id,
        template_id=template_id,
        created_by=created_by,
        name=name,
        description=description,
        strokes_json=strokes_json,
        thumbnail=thumbnail,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def upsert_paint_template(
    db: Session,
    *,
    session_id: int,
    template_id: str,
    created_by: int,
    name: str,
    description: Optional[str],
    strokes_json: str,
    thumbnail: Optional[str],
) -> models.PaintTemplate:
    template = get_paint_template(db, session_id, template_id)
    if template is None:
        return create_paint_template(
            db,
            session_id=session_id,
            template_id=template_id,
            created_by=created_by,
            name=name,
            description=description,
            strokes_json=strokes_json,
            thumbnail=thumbnail,
        )
    if template.created_by != created_by:
        raise PermissionError("Paint templates can only be updated by their creator")

    template.name = name
    template.description = description
    template.strokes_json = strokes_json
    template.thumbnail = thumbnail
    db.commit()
    db.refresh(template)
    return template


def delete_paint_template(
    db: Session,
    session_id: int,
    template_id: str,
    *,
    created_by: Optional[int] = None,
) -> bool:
    query = db.query(models.PaintTemplate).filter(
        models.PaintTemplate.session_id == session_id,
        models.PaintTemplate.template_id == template_id,
    )
    if created_by is not None:
        query = query.filter(models.PaintTemplate.created_by == created_by)
    template = query.first()
    if template is None:
        return False
    db.delete(template)
    db.commit()
    return True


# ── CombatEncounter persistence ───────────────────────────────────────────────

def upsert_combat_encounter(db: Session, session_code: str, state_dict: dict) -> None:
    """Create or update the persisted CombatEncounter for a session."""
    game_session = get_game_session_by_code(db, session_code)
    if not game_session:
        return

    enc = db.query(models.CombatEncounter).filter(
        models.CombatEncounter.encounter_id == state_dict['combat_id']
    ).first()

    if enc is None:
        enc = models.CombatEncounter(
            encounter_id=state_dict['combat_id'],
            session_id=game_session.id,
            table_id=state_dict.get('table_id', ''),
        )
        db.add(enc)

    enc.phase = state_dict.get('phase', 'active')
    enc.round_number = state_dict.get('round_number', 1)
    enc.current_turn_index = state_dict.get('current_turn_index', 0)
    enc.combatants_json = json.dumps(state_dict.get('combatants', []))
    enc.settings_json = json.dumps(state_dict.get('settings', {}))
    enc.action_log_json = json.dumps(state_dict.get('action_log', []))
    db.commit()


def load_active_combat_encounter(db: Session, session_code: str) -> dict | None:
    """Load the most recent non-ended CombatEncounter for a session."""
    game_session = get_game_session_by_code(db, session_code)
    if not game_session:
        return None

    enc = (
        db.query(models.CombatEncounter)
        .filter(
            models.CombatEncounter.session_id == game_session.id,
            models.CombatEncounter.ended_at.is_(None),
            models.CombatEncounter.phase != 'ended',
        )
        .order_by(models.CombatEncounter.id.desc())
        .first()
    )
    if enc is None:
        return None

    return {
        'combat_id': enc.encounter_id,
        'session_id': session_code,
        'table_id': enc.table_id,
        'phase': enc.phase,
        'round_number': enc.round_number,
        'current_turn_index': enc.current_turn_index,
        'combatants': json.loads(enc.combatants_json or '[]'),
        'settings': json.loads(enc.settings_json or '{}'),
        'action_log': json.loads(enc.action_log_json or '[]'),
        'state_version': enc.state_version,
    }


def mark_combat_encounter_ended(db: Session, combat_id: str) -> None:
    from datetime import datetime
    enc = db.query(models.CombatEncounter).filter(
        models.CombatEncounter.encounter_id == combat_id
    ).first()
    if enc:
        enc.phase = 'ended'
        enc.ended_at = datetime.utcnow()
        db.commit()
