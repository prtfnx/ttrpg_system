#!/usr/bin/env python3
"""
Server Character Manager - Session-scoped character storage
Handles character persistence in the database for game sessions
"""

import json
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_

from server_host.database.database import SessionLocal
from server_host.database.models import GameSession, SessionCharacter
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)


class ServerCharacterManager:
    """Server-side character management with database persistence"""
    
    def __init__(self):
        logger.info("ServerCharacterManager initialized")
        # No need to manually create table - SQLAlchemy migrations handle this
    
    def save_character(self, session_id: int, character_data: Dict[str, Any], 
                      user_id: int) -> Dict[str, Any]:
        """Save a character to the database"""
        try:
            with SessionLocal() as db:
                # Validate session exists
                session = db.query(GameSession).filter(GameSession.id == session_id).first()
                if not session:
                    return {
                        'success': False,
                        'error': f'Session {session_id} not found'
                    }
                
                # Generate or use existing character ID
                character_id = character_data.get('id', str(uuid.uuid4()))
                character_name = character_data.get('name', 'Unnamed Character')
                
                # Serialize character data
                character_json = json.dumps(character_data)
                
                # Check if character already exists
                existing = db.query(SessionCharacter).filter(
                    SessionCharacter.character_id == character_id
                ).first()
                
                if existing:
                    # Update existing character (only if owned by user)
                    if existing.owner_user_id != user_id:  # type: ignore
                        return {
                            'success': False,
                            'error': f'Permission denied: Character belongs to user {existing.owner_user_id}'
                        }
                    
                    # Update the fields
                    db.query(SessionCharacter).filter(
                        SessionCharacter.character_id == character_id
                    ).update({
                        SessionCharacter.character_name: character_name,
                        SessionCharacter.character_data: character_json,
                        SessionCharacter.updated_at: datetime.utcnow()
                    })
                    logger.info(f"Updated character {character_name} (ID: {character_id})")
                else:
                    # Insert new character
                    new_character = SessionCharacter(
                        session_id=session_id,
                        character_id=character_id,
                        character_name=character_name,
                        character_data=character_json,
                        owner_user_id=user_id
                    )
                    db.add(new_character)
                    logger.info(f"Created character {character_name} (ID: {character_id})")
                
                db.commit()
                
                return {
                    'success': True,
                    'character_id': character_id,
                    'message': f'Character {character_name} saved successfully'
                }
                
        except Exception as e:
            logger.error(f"Error saving character: {e}")
            return {
                'success': False,
                'error': f'Database error: {str(e)}'
            }
    
    def load_character(self, session_id: int, character_id: str, 
                      user_id: int) -> Dict[str, Any]:
        """Load a character from the database"""
        try:
            with SessionLocal() as db:
                # Query character
                character = db.query(SessionCharacter).filter(
                    and_(
                        SessionCharacter.character_id == character_id,
                        SessionCharacter.session_id == session_id,
                        SessionCharacter.owner_user_id == user_id
                    )
                ).first()
                
                if not character:
                    return {
                        'success': False,
                        'error': f'Character {character_id} not found or access denied'
                    }
                
                # Deserialize character data
                try:
                    character_data = json.loads(character.character_data)  # type: ignore
                except (json.JSONDecodeError, AttributeError) as e:
                    logger.error(f"Error deserializing character data: {e}")
                    return {
                        'success': False,
                        'error': 'Character data corrupted'
                    }
                
                logger.info(f"Loaded character {character_data.get('name', 'unnamed')} (ID: {character_id})")
                
                return {
                    'success': True,
                    'character_data': character_data
                }
                
        except Exception as e:
            logger.error(f"Error loading character: {e}")
            return {
                'success': False,
                'error': f'Database error: {str(e)}'
            }
    
    def list_characters(self, session_id: int, user_id: int) -> Dict[str, Any]:
        """List characters for a session and user"""
        try:
            with SessionLocal() as db:
                # Query characters
                characters = db.query(SessionCharacter).filter(
                    and_(
                        SessionCharacter.session_id == session_id,
                        SessionCharacter.owner_user_id == user_id
                    )
                ).order_by(SessionCharacter.updated_at.desc()).all()
                
                character_list = []
                for char in characters:
                    character_list.append({
                        'character_id': char.character_id,
                        'character_name': char.character_name,
                        'created_at': char.created_at,
                        'updated_at': char.updated_at
                    })
                
                logger.info(f"Listed {len(character_list)} characters for session {session_id}, user {user_id}")
                
                return {
                    'success': True,
                    'characters': character_list
                }
                
        except Exception as e:
            logger.error(f"Error listing characters: {e}")
            return {
                'success': False,
                'error': f'Database error: {str(e)}'
            }
    
    def delete_character(self, session_id: int, character_id: str, 
                        user_id: int) -> Dict[str, Any]:
        """Delete a character from the database"""
        try:
            with SessionLocal() as db:
                # Find and delete character (only if owned by user)
                character = db.query(SessionCharacter).filter(
                    and_(
                        SessionCharacter.character_id == character_id,
                        SessionCharacter.session_id == session_id,
                        SessionCharacter.owner_user_id == user_id
                    )
                ).first()
                
                if not character:
                    return {
                        'success': False,
                        'error': f'Character {character_id} not found or access denied'
                    }
                
                character_name = character.character_name
                db.delete(character)
                db.commit()
                
                logger.info(f"Deleted character {character_name} (ID: {character_id}) for user {user_id}")
                
                return {
                    'success': True,
                    'message': f'Character {character_name} deleted successfully'
                }
                
        except Exception as e:
            logger.error(f"Error deleting character: {e}")
            return {
                'success': False,
                'error': f'Database error: {str(e)}'
            }
    
    def get_session_id_from_code(self, session_code: str) -> Optional[int]:
        """Get session ID from session code"""
        try:
            with SessionLocal() as db:
                session = db.query(GameSession).filter(
                    GameSession.session_code == session_code
                ).first()
                
                if session:
                    return session.id  # type: ignore
                return None
                
        except Exception as e:
            logger.error(f"Error getting session ID: {e}")
            return None


# Global instance
_server_character_manager = None

def get_server_character_manager() -> ServerCharacterManager:
    """Get the global server character manager instance"""
    global _server_character_manager
    if _server_character_manager is None:
        _server_character_manager = ServerCharacterManager()
    return _server_character_manager
