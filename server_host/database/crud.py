"""
Database CRUD operations
"""
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from . import models, schemas
import secrets
import string
import re
from datetime import datetime, timedelta
from sqlalchemy import func

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
        return False, "Username must be less than 50 characters long"
    
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
        return False, "Password must be less than 128 characters long"
    
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
        return False, f"Too many registrations recently. Please try again in {time_window_minutes} minutes."
    
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
        return user, "Registration successful"
    except Exception as e:
        return None, f"Registration failed: {str(e)}"

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

# Game Session operations
def create_game_session(db: Session, session: schemas.GameSessionCreate, owner_id: int):
    session_code = generate_session_code()
    # Ensure unique session code
    while db.query(models.GameSession).filter(models.GameSession.session_code == session_code).first():
        session_code = generate_session_code()
    
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
        return player
    return None

def get_session_players(db: Session, session_id: int):
    return db.query(models.GamePlayer).filter(models.GamePlayer.session_id == session_id).all()
