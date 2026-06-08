"""
Database configuration and setup
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .models import Base

# Use SQLite for development, can be changed to PostgreSQL for production
# Ensure we use the correct database file location
current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # apps/server directory
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
        "ALTER TABLE virtual_tables ADD COLUMN grid_enabled BOOLEAN DEFAULT 1",
        "ALTER TABLE virtual_tables ADD COLUMN snap_to_grid BOOLEAN DEFAULT 1",
        "ALTER TABLE virtual_tables ADD COLUMN grid_color_hex VARCHAR(9) DEFAULT '#ffffff'",
        "ALTER TABLE virtual_tables ADD COLUMN background_color_hex VARCHAR(9) DEFAULT '#2a3441'",
    ]
    table_migrations = [
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id VARCHAR(64) NOT NULL UNIQUE,
            session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            username VARCHAR(100),
            channel VARCHAR(20) NOT NULL DEFAULT 'public',
            recipient_user_id INTEGER REFERENCES users(id),
            table_id VARCHAR(36),
            text TEXT NOT NULL,
            message_json TEXT NOT NULL,
            attachments_json TEXT,
            client_timestamp FLOAT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_message_id ON chat_messages (message_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_session_id ON chat_messages (session_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_user_id ON chat_messages (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_recipient_user_id ON chat_messages (recipient_user_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_table_id ON chat_messages (table_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_created_at ON chat_messages (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_session_created_at ON chat_messages (session_id, created_at)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists
        for sql in table_migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass


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
        from .crud import create_user, get_user_by_username
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
