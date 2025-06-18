"""
Database utility functions for game session management
"""
import logging
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from server_host.database import crud, models, schemas
from server_host.service.game_session_protocol import GameSessionProtocolService

logger = logging.getLogger(__name__)

def create_game_session_with_persistence(
    db: Session, 
    session_code: str, 
    owner_id: int
) -> Tuple[Optional[GameSessionProtocolService], Optional[str]]:
    """
    Create a new game session with database persistence
    
    Returns:
        Tuple of (GameSessionProtocolService, error_message)
    """
    try:
        # Create database session with the actual session_code
        session_create = schemas.GameSessionCreate(name=session_code)
        db_session = crud.create_game_session(db, session_create, owner_id, session_code)
        
        if not db_session:
            return None, "Failed to create database session"
        
        # Create protocol service with database integration
        protocol_service = GameSessionProtocolService(
            session_code=db_session.session_code,
            db_session=db,
            game_session_db_id=db_session.id
        )
        
        # Save initial state
        protocol_service.save_to_database()
        
        logger.info(f"Created persistent game session {db_session.session_code} for user {owner_id}")
        return protocol_service, None
        
    except Exception as e:
        logger.error(f"Error creating persistent game session: {e}")
        return None, str(e)

def load_game_session_with_persistence(
    db: Session, 
    session_code: str
) -> Tuple[Optional[GameSessionProtocolService], Optional[str]]:
    """
    Load an existing game session with database persistence
    
    Returns:
        Tuple of (GameSessionProtocolService, error_message)
    """
    try:
        # Get database session
        db_session = crud.get_game_session_by_code(db, session_code)
        
        if not db_session:
            return None, f"Game session {session_code} not found"
        
        # Create protocol service with database integration
        protocol_service = GameSessionProtocolService(
            session_code=session_code,
            db_session=db,
            game_session_db_id=db_session.id
        )
        
        logger.info(f"Loaded persistent game session {session_code}")
        return protocol_service, None
        
    except Exception as e:
        logger.error(f"Error loading persistent game session {session_code}: {e}")
        return None, str(e)

def load_game_session_protocol_from_db(
    db: Session, 
    session_code: str
) -> Tuple[Optional[GameSessionProtocolService], Optional[str]]:
    """
    Load GameSessionProtocolService from database with all tables reconstructed
    
    Returns:
        Tuple of (GameSessionProtocolService, error_message)
    """
    try:
        # Find GameSession
        db_session = crud.get_game_session_by_code(db, session_code)
        if not db_session:
            return None, f"Session {session_code} not found"        # Create GameSessionProtocolService with database integration
        protocol_service = GameSessionProtocolService(
            session_code=session_code,
            db_session=db,
            game_session_db_id=db_session.id
        )
        
        # Tables are automatically loaded in GameSessionProtocolService._load_tables_from_database()
        # through table_manager.load_from_database()
        
        logger.info(f"Reconstructed session {session_code} from database")
        return protocol_service, None
        
    except Exception as e:
        logger.error(f"Error reconstructing session {session_code}: {e}")
        return None, str(e)

def save_game_session_state(
    protocol_service: GameSessionProtocolService,
    additional_data: Optional[dict] = None
) -> bool:
    """
    Save the current state of a game session
    
    Args:
        protocol_service: The game session protocol service
        additional_data: Additional game data to save as JSON
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Save tables and entities
        tables_saved = protocol_service.save_to_database()
        
        # Save additional game data if provided
        if additional_data and protocol_service.db_session and protocol_service.game_session_db_id:
            import json
            session_update = schemas.GameSessionUpdate(
                game_data=json.dumps(additional_data)
            )
            crud.update_game_session(
                protocol_service.db_session, 
                protocol_service.game_session_db_id, 
                session_update
            )
        
        logger.info(f"Saved game session state for {protocol_service.session_code}")
        return tables_saved
        
    except Exception as e:
        logger.error(f"Error saving game session state: {e}")
        return False

def get_user_persistent_sessions(db: Session, user_id: int) -> list:
    """
    Get all persistent game sessions for a user
    
    Returns:
        List of game session data
    """
    try:
        sessions = crud.get_user_game_sessions(db, user_id)
        return [
            {
                "id": session.id,
                "name": session.name,
                "session_code": session.session_code,
                "created_at": session.created_at,
                "is_active": session.is_active,
            }
            for session in sessions
        ]
    except Exception as e:
        logger.error(f"Error getting user sessions: {e}")
        return []

def cleanup_inactive_sessions(db: Session) -> int:
    """
    Clean up inactive game sessions (optional maintenance function)
    
    Returns:
        Number of sessions cleaned up
    """
    try:
        # This could be implemented to clean up very old inactive sessions
        # For now, just return 0
        return 0
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        return 0
