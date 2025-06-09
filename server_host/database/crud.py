"""
Database CRUD operations
"""
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from . import models, schemas
import secrets
import string

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def generate_session_code() -> str:
    """Generate a unique session code"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

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
    """Register a new user - simplified version"""
    # Check if user already exists
    if get_user_by_username(db, username):
        return None
    
    # Handle empty email - set to None instead of empty string to avoid unique constraint issues
    email_value = email if email and email.strip() else None
    full_name_value = full_name if full_name and full_name.strip() else None
    
    user_data = schemas.UserCreate(
        username=username,
        password=password,
        email=email_value,
        full_name=full_name_value
    )
    return create_user(db, user_data)

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
