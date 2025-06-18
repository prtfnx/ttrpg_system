"""
Database CRUD operations
"""
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from . import models, schemas
from datetime import datetime, timedelta
from sqlalchemy import func
from typing import Optional
import secrets
import string
import re
import json
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

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
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"
    
    if len(password) < 4:
        return False, "Password must be at least 4 characters long"
    
    if len(password) > 128:
        return False, "Password must be less than 128 characters"
    
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

def register_user(db: Session, username: str, password: str, email: str = None, full_name: str = None):
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
    # Use provided session_code parameter, or fall back to session.name

    
    # Check if session already exists
    existing_session = db.query(models.GameSession).filter(
        models.GameSession.session_code == session_code,
        models.GameSession.is_active == True
    ).first()
    
    if existing_session:
        # Return existing session instead of creating duplicate
        return existing_session
    
    # Create new session with the provided session code
    db_session = models.GameSession(
        name=session.name,
        session_code=session_code,
        owner_id=owner_id
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def get_game_session_by_code(db: Session, session_code: str):
    return db.query(models.GameSession).filter(
        models.GameSession.session_code == session_code,
        models.GameSession.is_active == True
    ).first()

def get_user_game_sessions(db: Session, user_id: int):
    return db.query(models.GameSession).filter(
        models.GameSession.owner_id == user_id,
        models.GameSession.is_active == True
    ).all()

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

# Game Player operations
def join_game_session(db: Session, session_code: str, user_id: int, character_name: str = None):
    session = get_game_session_by_code(db, session_code)
    if not session:
        return None
    
    # Check if user already joined
    existing_player = db.query(models.GamePlayer).filter(
        models.GamePlayer.session_id == session.id,
        models.GamePlayer.user_id == user_id
    ).first()
    
    if existing_player:
        existing_player.is_connected = True
        existing_player.character_name = character_name or existing_player.character_name
        db.commit()
        return existing_player
    
    # Create new player
    db_player = models.GamePlayer(
        session_id=session.id,
        user_id=user_id,
        character_name=character_name,
        is_connected=True
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
        layer_visibility=layer_visibility_json
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return db_table

def get_virtual_table_by_id(db: Session, table_id: str) -> models.VirtualTable:
    """Get virtual table by table_id (UUID)"""
    return db.query(models.VirtualTable).filter(models.VirtualTable.table_id == table_id).first()

def get_session_tables(db: Session, session_id: int) -> list[models.VirtualTable]:
    """Get all tables for a game session"""
    return db.query(models.VirtualTable).filter(models.VirtualTable.session_id == session_id).all()

def update_virtual_table(db: Session, table_id: str, table_update: schemas.VirtualTableUpdate) -> models.VirtualTable:
    """Update virtual table"""
    db_table = get_virtual_table_by_id(db, table_id)
    if not db_table:
        return None
    
    update_data = table_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        if field == 'layer_visibility' and value is not None:
            setattr(db_table, field, json.dumps(value))
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
        scale_x=entity_data.scale_x,
        scale_y=entity_data.scale_y,
        rotation=entity_data.rotation
    )
    db.add(db_entity)
    db.commit()
    db.refresh(db_entity)
    return db_entity

def get_entity_by_sprite_id(db: Session, sprite_id: str) -> models.Entity:
    """Get entity by sprite_id (UUID)"""
    return db.query(models.Entity).filter(models.Entity.sprite_id == sprite_id).first()

def get_table_entities(db: Session, table_db_id: int) -> list[models.Entity]:
    """Get all entities for a table"""
    return db.query(models.Entity).filter(models.Entity.table_id == table_db_id).all()

def update_entity(db: Session, sprite_id: str, entity_update: schemas.EntityUpdate) -> models.Entity:
    """Update entity"""
    db_entity = get_entity_by_sprite_id(db, sprite_id)
    if not db_entity:
        return None
    
    update_data = entity_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_entity, field, value)
    
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

def save_table_to_db(db: Session, virtual_table_obj, session_id: int) -> models.VirtualTable:
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
            name=virtual_table_obj.name,
            width=virtual_table_obj.width,
            height=virtual_table_obj.height,
            position_x=virtual_table_obj.position[0],
            position_y=virtual_table_obj.position[1],
            scale_x=virtual_table_obj.scale[0],
            scale_y=virtual_table_obj.scale[1],
            layer_visibility=virtual_table_obj.layer_visibility
        )
        db_table = update_virtual_table(db, table_id_str, table_update)
    else:
        # Create new table
        table_data = schemas.VirtualTableCreate(
            table_id=table_id_str,
            name=virtual_table_obj.name,
            width=virtual_table_obj.width,
            height=virtual_table_obj.height,
            session_id=session_id,
            position_x=virtual_table_obj.position[0],
            position_y=virtual_table_obj.position[1],
            scale_x=virtual_table_obj.scale[0],
            scale_y=virtual_table_obj.scale[1],
            layer_visibility=virtual_table_obj.layer_visibility
        )
        db_table = create_virtual_table(db, table_data)
    
    # Save entities
    for entity in virtual_table_obj.entities.values():
        save_entity_to_db(db, entity, db_table.id)
    
    return db_table

def save_entity_to_db(db: Session, entity_obj, table_db_id: int) -> models.Entity:
    """
    Save an Entity object from table.py to the database
    """
    # Check if entity already exists
    existing_entity = get_entity_by_sprite_id(db, entity_obj.sprite_id)
    
    if existing_entity:
        # Update existing entity
        entity_update = schemas.EntityUpdate(
            name=entity_obj.name,
            position_x=entity_obj.position[0],
            position_y=entity_obj.position[1],
            layer=entity_obj.layer,
            texture_path=entity_obj.texture_path,
            scale_x=entity_obj.scale_x,
            scale_y=entity_obj.scale_y,
            rotation=entity_obj.rotation
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
            scale_x=entity_obj.scale_x,
            scale_y=entity_obj.scale_y,
            rotation=entity_obj.rotation
        )
        db_entity = create_entity(db, entity_data, table_db_id)
    
    return db_entity

def load_table_from_db(db: Session, table_id: str):
    """
    Load a VirtualTable from database and return as VirtualTable object
    Returns tuple: (VirtualTable object, success boolean)
    """
    try:
        from core_table.table import VirtualTable, Entity
        
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
        
        # Load entities
        db_entities = get_table_entities(db, db_table.id)
        for db_entity in db_entities:
            entity = Entity(
                name=db_entity.name,
                position=(db_entity.position_x, db_entity.position_y),
                layer=db_entity.layer,
                path_to_texture=db_entity.texture_path,
                entity_id=db_entity.entity_id
            )
            entity.sprite_id = db_entity.sprite_id
            entity.scale_x = db_entity.scale_x
            entity.scale_y = db_entity.scale_y
            entity.rotation = db_entity.rotation
            
            # Add to virtual table
            virtual_table.entities[entity.entity_id] = entity
            virtual_table.sprite_to_entity[entity.sprite_id] = entity.entity_id
            
            # Update grid
            virtual_table.grid[entity.layer][entity.position[1]][entity.position[0]] = entity.entity_id
            
            # Update next entity ID
            if entity.entity_id >= virtual_table.next_entity_id:
                virtual_table.next_entity_id = entity.entity_id + 1
        
        return virtual_table, True
        
    except Exception as e:
        print(f"Error loading table from database: {e}")
        return None, False
