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

from ..database.database import SessionLocal
from ..database.models import CharacterLog, GameSession, SessionCharacter
from ..utils.logger import setup_logger

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
                
                # Generate or use existing character ID (canonical key: 'character_id')
                # Do NOT accept legacy 'id' fallback - callers must use `character_id`.
                character_id = character_data.get('character_id') or str(uuid.uuid4())
                character_name = character_data.get('name', 'Unnamed Character')
                
                # Serialize character data
                character_json = json.dumps(character_data)
                
                # Check if character already exists
                existing = db.query(SessionCharacter).filter(
                    SessionCharacter.character_id == character_id
                ).first()
                
                # ensure new_version defined for return value
                new_version = 1
                if existing:
                    # Update existing character (only if owned by user)
                    if str(getattr(existing, 'owner_user_id', '')) != str(user_id):  # type: ignore
                        return {
                            'success': False,
                            'error': f'Permission denied: Character belongs to user {existing.owner_user_id}'
                        }
                    # Update the fields with version increment and audit
                    try:
                        current_version = int(getattr(existing, 'version', 1) or 1)
                    except Exception:
                        current_version = 1
                    new_version = current_version + 1
                    db.query(SessionCharacter).filter(
                        SessionCharacter.character_id == character_id
                    ).update({
                        SessionCharacter.character_name: character_name,
                        SessionCharacter.character_data: character_json,
                        SessionCharacter.updated_at: datetime.utcnow(),
                        SessionCharacter.version: new_version,
                        SessionCharacter.last_modified_by: user_id
                    })
                    logger.info(f"Updated character {character_name} (ID: {character_id}) to version {new_version}")
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
                    'message': f'Character {character_name} saved successfully',
                    'version': new_version
                }
                
        except Exception as e:
            logger.error(f"Error saving character: {e}")
            return {
                'success': False,
                'error': f'Database error: {str(e)}'
            }

    def _validate_spell_slots(self, current_json: dict, updates: dict) -> Optional[str]:
        """Return error string if spell slot usage exceeds total, else None."""
        new_data = updates.get('data', {})
        if not new_data:
            return None
        used_map = new_data.get('spellSlotsUsed')
        if not used_map:
            return None
        slot_totals = (current_json.get('data') or {}).get('spellSlots') or {}
        for level_str, used in used_map.items():
            total_entry = slot_totals.get(str(level_str)) or {}
            total = total_entry.get('total', 0) if isinstance(total_entry, dict) else 0
            # Treat missing/zero totals as a hard cap of 0 — you cannot use slots you don't have
            if int(used) > total:
                return f'Cannot use more spell slots than available at level {level_str} (max {total})'
        return None

    def update_character(self, session_id: int, character_id: str, updates: Dict[str, Any], user_id: int, expected_version: Optional[int] = None, bypass_owner_check: bool = False) -> Dict[str, Any]:
        """Perform a versioned update of a character's JSON data in a single DB transaction.
        Merges JSON if appropriate and enforces optimistic concurrency if expected_version provided.
        bypass_owner_check=True allows DM-initiated updates (e.g. token HP sync).
        """
        try:
            with SessionLocal() as db:
                # Validate session and character presence
                session = db.query(GameSession).filter(GameSession.id == session_id).first()
                if not session:
                    return {'success': False, 'error': f'Session {session_id} not found'}

                existing = db.query(SessionCharacter).filter(
                    SessionCharacter.character_id == character_id,
                    SessionCharacter.session_id == session_id
                ).with_for_update().first()

                if not existing:
                    return {'success': False, 'error': 'Character not found'}

                if not bypass_owner_check and str(getattr(existing, 'owner_user_id', '')) != str(user_id):
                    return {'success': False, 'error': 'Permission denied'}

                # Version check
                current_version = getattr(existing, 'version', 1) or 1
                if expected_version is not None and int(expected_version) != int(current_version):
                    return {'success': False, 'error': 'Version conflict', 'current_version': current_version}

                # Merge JSON
                try:
                    char_payload = getattr(existing, 'character_data', None) or '{}'
                    current_json = json.loads(str(char_payload)) if char_payload else {}
                except Exception:
                    current_json = {}

                if isinstance(current_json, dict) and isinstance(updates, dict):
                    merged = {**current_json, **updates}
                else:
                    merged = updates

                # Spell slot validation
                slot_error = self._validate_spell_slots(current_json, updates)
                if slot_error:
                    return {'success': False, 'error': slot_error}

                new_version = int(current_version) + 1

                db.query(SessionCharacter).filter(SessionCharacter.character_id == character_id).update({
                    SessionCharacter.character_data: json.dumps(merged),
                    SessionCharacter.updated_at: datetime.utcnow(),
                    SessionCharacter.version: new_version,
                    SessionCharacter.last_modified_by: user_id
                })

                # Auto-log key character changes
                self._detect_and_log(db, character_id, session_id, user_id, current_json, updates)

                db.commit()

                return {'success': True, 'character_id': character_id, 'version': new_version}

        except Exception as e:
            logger.error(f"Error updating character: {e}")
            return {'success': False, 'error': f'Database error: {str(e)}'}
    
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
        """List characters for a session. DMs (user_id=0) get all characters."""
        try:
            with SessionLocal() as db:
                query = db.query(SessionCharacter).filter(
                    SessionCharacter.session_id == session_id
                )
                if user_id:  # user_id=0 means DM — return all
                    query = query.filter(SessionCharacter.owner_user_id == user_id)
                characters = query.order_by(SessionCharacter.updated_at.desc()).all()
                
                character_list = []
                for char in characters:
                    character_list.append({
                        'character_id': char.character_id,
                        'character_name': char.character_name,
                        'owner_user_id': char.owner_user_id,
                        'character_data': json.loads(char.character_data) if char.character_data else {},
                        'version': char.version,
                        'created_at': char.created_at.isoformat(),
                        'updated_at': char.updated_at.isoformat()
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
    
    # ------------------------------------------------------------------
    # Character log helpers
    # ------------------------------------------------------------------

    def _log(self, db: Any, character_id: str, session_id: int, user_id: int, action_type: str, description: str) -> None:
        """Write a log entry within an existing db session (no commit)."""
        try:
            entry = CharacterLog(
                character_id=character_id,
                session_id=session_id,
                user_id=user_id,
                action_type=action_type,
                description=description,
            )
            db.add(entry)
        except Exception as e:
            logger.error(f"Failed to write character log entry: {e}")

    def log_event(self, character_id: str, session_id: int, user_id: int, action_type: str, description: str) -> None:
        """Public helper for logging outside an existing transaction."""
        try:
            with SessionLocal() as db:
                self._log(db, character_id, session_id, user_id, action_type, description)
                db.commit()
        except Exception as e:
            logger.error(f"log_event failed: {e}")

    def _detect_and_log(self, db: Any, character_id: str, session_id: int, user_id: int,
                        old_json: dict, updates: dict) -> None:
        """Detect what changed in updates vs old_json and write log entries."""
        new_char = updates.get('data', {})
        old_char = old_json.get('data', {})

        # HP change
        new_hp = new_char.get('stats', {}).get('hp')
        old_hp = old_char.get('stats', {}).get('hp')
        if new_hp is not None and old_hp is not None and new_hp != old_hp:
            delta = new_hp - old_hp
            sign = '+' if delta > 0 else ''
            self._log(db, character_id, session_id, user_id, 'hp_change',
                      f"HP: {old_hp} \u2192 {new_hp} ({sign}{delta})")

        # Spell slot usage
        new_slots = new_char.get('spellSlotsUsed')
        old_slots = old_char.get('spellSlotsUsed', {})
        if new_slots is not None and new_slots != old_slots:
            if not any(new_slots.values()):
                self._log(db, character_id, session_id, user_id, 'long_rest', 'Long rest — spell slots restored')
            else:
                for level, count in new_slots.items():
                    old_count = old_slots.get(str(level), old_slots.get(level, 0))
                    if count > old_count:
                        self._log(db, character_id, session_id, user_id, 'spell_cast',
                                  f"Level {level} slot used ({old_count}\u2192{count})")
                    elif count < old_count:
                        self._log(db, character_id, session_id, user_id, 'slot_recovered',
                                  f"Level {level} slot recovered ({old_count}\u2192{count})")

        # Inventory change (item count differs)
        new_items = new_char.get('equipment', {}).get('items')
        old_items = old_char.get('equipment', {}).get('items')
        if new_items is not None and old_items is not None:
            if len(new_items) > len(old_items):
                added = [i['equipment']['name'] for i in new_items[len(old_items):]]
                self._log(db, character_id, session_id, user_id, 'item_change',
                          f"Added: {', '.join(added)}")
            elif len(new_items) < len(old_items):
                self._log(db, character_id, session_id, user_id, 'item_change',
                          f"Removed {len(old_items) - len(new_items)} item(s)")

    def get_character_logs(self, character_id: str, session_id: int, limit: int = 50) -> Dict[str, Any]:
        """Return recent log entries for a character."""
        try:
            with SessionLocal() as db:
                entries = (
                    db.query(CharacterLog)
                    .filter(CharacterLog.character_id == character_id,
                            CharacterLog.session_id == session_id)
                    .order_by(CharacterLog.created_at.desc())
                    .limit(limit)
                    .all()
                )
                return {
                    'success': True,
                    'logs': [
                        {
                            'id': e.id,
                            'action_type': e.action_type,
                            'description': e.description,
                            'created_at': e.created_at.isoformat(),
                        }
                        for e in entries
                    ],
                }
        except Exception as e:
            logger.error(f"get_character_logs failed: {e}")
            return {'success': False, 'error': str(e)}

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
