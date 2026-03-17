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

def _run_migrations():
    """Add new columns to existing tables that may predate schema additions."""
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE entities ADD COLUMN asset_id VARCHAR(100)",
        "ALTER TABLE entities ADD COLUMN width FLOAT DEFAULT 0.0",
        "ALTER TABLE entities ADD COLUMN height FLOAT DEFAULT 0.0",
        # Coordinate system (016)
        "ALTER TABLE virtual_tables ADD COLUMN grid_cell_px FLOAT DEFAULT 50.0",
        "ALTER TABLE virtual_tables ADD COLUMN cell_distance FLOAT DEFAULT 5.0",
        "ALTER TABLE virtual_tables ADD COLUMN distance_unit VARCHAR(10) DEFAULT 'ft'",
        "ALTER TABLE entities ADD COLUMN aura_radius_units FLOAT",
        "ALTER TABLE entities ADD COLUMN vision_radius_units FLOAT",
        "ALTER TABLE entities ADD COLUMN darkvision_radius_units FLOAT",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists


def create_tables():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)
    _run_migrations()

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
