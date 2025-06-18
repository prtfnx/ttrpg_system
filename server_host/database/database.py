"""
Database configuration and setup
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .models import Base
import os

# Use SQLite for development, can be changed to PostgreSQL for production
# Ensure we use the correct database file location
import os
current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # server_host directory
DB_PATH = os.path.join(current_dir, "ttrpg.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_tables():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database with test data"""
    create_tables()
    
    # Create a test user
    db = SessionLocal()
    try:
        from .crud import get_user_by_username, create_user
        from .schemas import UserCreate
        
        # Create test user if doesn't exist
        if not get_user_by_username(db, "johndoe"):
            user_data = UserCreate(
                username="johndoe",
                email="johndoe@example.com",
                full_name="John Doe",
                password="secret"
            )
            create_user(db, user_data)
            print("Created test user: johndoe/secret")
    finally:
        db.close()
