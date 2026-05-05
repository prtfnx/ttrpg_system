from typing import TYPE_CHECKING

from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from utils.logger import setup_logger
from utils.roles import is_dm

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)


class _CharactersMixin:
    """Handler methods for characters domain."""

    async def handle_character_save_request(self, msg: Message, client_id: str) -> Message:
        """Handle character save request"""
        logger.debug(f"Character save request received: {msg}")
        if not msg.data:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': 'No character data provided'
            })

        character_data = msg.data.get('character_data')
        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_data:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': 'Character data is required'
            })

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        result = await self.actions.save_character(session_id, character_data, user_id)

        if result.success:
            resdata = result.data or {}
            character_id_saved = resdata.get('character_id')
            version_saved = resdata.get('version', 1)
            # Broadcast full character data so other clients can update their state
            char_for_broadcast = dict(character_data)
            char_for_broadcast['character_id'] = character_id_saved
            await self.broadcast_to_session(Message(MessageType.CHARACTER_UPDATE, {
                'operation': 'save',
                'character_id': character_id_saved,
                'character_data': char_for_broadcast,
                'version': version_saved,
            }), client_id)

            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': True,
                'character_id': character_id_saved,
                'version': version_saved,
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_load_request(self, msg: Message, client_id: str) -> Message:
        """Handle character load request"""
        logger.debug(f"Character load request received: {msg}")
        if not msg.data:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': 'No character ID provided'
            })

        character_id = msg.data.get('character_id')
        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': 'Character ID is required'
            })

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        result = await self.actions.load_character(session_id, character_id, user_id)

        if result.success:
            resdata = result.data or {}
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': True,
                'character_data': resdata.get('character_data'),
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle character list request"""
        logger.debug(f"Character list request received: {msg}")
        if not msg.data:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': 'No session data provided'
            })

        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        role = self._get_client_role(client_id)
        user_id_for_filter = 0 if is_dm(role) else user_id
        result = await self.actions.list_characters(session_id, user_id_for_filter)

        if result.success:
            resdata = result.data or {}
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': True,
                'characters': resdata.get('characters', []),
                'session_code': session_code,
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_delete_request(self, msg: Message, client_id: str) -> Message:
        """Handle character delete request"""
        logger.debug(f"Character delete request received: {msg}")
        if not msg.data:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': 'No character ID provided'
            })

        character_id = msg.data.get('character_id')
        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': 'Character ID is required'
            })

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        result = await self.actions.delete_character(session_id, character_id, user_id)

        if result.success:
            await self.broadcast_to_session(Message(MessageType.CHARACTER_UPDATE, {
                'operation': 'delete',
                'character_id': character_id,
            }), client_id)

            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': True,
                'character_id': character_id,
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_update(self, msg: Message, client_id: str) -> Message:
        """Handle partial character updates (delta) with optimistic version checking"""
        logger.debug(f"Character update request received: {msg}")
        if not msg.data:
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'No data provided'})

        character_id = msg.data.get('character_id')
        updates = msg.data.get('updates') or msg.data.get('character_data')
        version = msg.data.get('version')
        user_id = self._get_user_id(msg, client_id) or 0
        session_id = self._get_session_id(msg)

        if not character_id or not updates:
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'character_id and updates are required'})

        if not session_id:
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'Session not found'})

        # Require specialized update method in ActionsCore (no fallback)
        try:
            if not hasattr(self.actions, 'update_character'):
                return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'Server does not support character delta updates'})

            result = await self.actions.update_character(session_id=session_id, character_id=character_id, updates=updates, user_id=user_id, expected_version=version)

            if result.success:
                # Sync character stats to linked tokens
                await self._sync_character_stats_to_tokens(session_id, character_id, updates)

                # Broadcast to session that character updated
                returned_version = None
                if isinstance(result.data, dict):
                    returned_version = result.data.get('version')

                broadcast = Message(MessageType.CHARACTER_UPDATE, {
                    'character_id': character_id,
                    'updates': updates,
                    'version': returned_version if returned_version is not None else version
                })
                await self.broadcast_to_session(broadcast, client_id)

                return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': True, 'character_id': character_id, 'message': result.message if hasattr(result, 'message') else 'updated', 'version': returned_version})
            else:
                return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': result.message})

        except Exception as e:
            logger.error(f"Error handling character update: {e}")
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': str(e)})

    async def handle_character_log_request(self, msg: Message, client_id: str) -> Message:
        """Return character action log entries."""
        if not msg.data:
            return Message(MessageType.CHARACTER_LOG_RESPONSE, {'success': False, 'error': 'No data'})
        character_id = msg.data.get('character_id')
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id) or 0
        limit = int(msg.data.get('limit', 50))
        if not character_id or not session_id:
            return Message(MessageType.CHARACTER_LOG_RESPONSE, {'success': False, 'error': 'character_id and session required'})
        result = await self.actions.get_character_log(session_id, character_id, user_id, limit)
        if result.success:
            return Message(MessageType.CHARACTER_LOG_RESPONSE, {
                'success': True, 'character_id': character_id,
                'logs': result.data.get('logs', [])
            })
        return Message(MessageType.CHARACTER_LOG_RESPONSE, {'success': False, 'error': result.message})

    async def handle_character_roll(self, msg: Message, client_id: str) -> Message:
        """Roll d20 server-side and broadcast result to session."""
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data'})
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.ERROR, {'error': 'No active session'})
        user_id = self._get_user_id(msg, client_id) or 0
        d = msg.data
        # Server computes roll — only accept intent (skill, modifier, advantage) from client
        result = await self.actions.character_roll(
            session_id=session_id, user_id=user_id,
            character_id=d.get('character_id', ''),
            roll_type=d.get('roll_type', 'skill_check'),
            skill=d.get('skill', ''),
            modifier=int(d.get('modifier', 0)),
            advantage=bool(d.get('advantage', False)),
            disadvantage=bool(d.get('disadvantage', False)),
        )
        if not result.success:
            return Message(MessageType.ERROR, {'error': result.message})
        await self.broadcast_to_session(Message(MessageType.CHARACTER_ROLL_RESULT, result.data), client_id)
        return Message(MessageType.SUCCESS, {'message': 'Roll completed'})

    async def handle_xp_award(self, msg: Message, client_id: str) -> Message:
        """DM awards XP to a character. Checks for level-up automatically."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'Only DMs can award XP'})
        if not msg.data:
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'No data provided'})

        character_id = msg.data.get('character_id')
        amount = int(msg.data.get('amount', 0))
        source = msg.data.get('source', 'other')
        description = msg.data.get('description', '')
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id or amount <= 0:
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'character_id and positive amount required'})
        if not session_id:
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'Session not found'})

        from managers.character_manager import get_server_character_manager
        char_mgr = get_server_character_manager()

        load_result = char_mgr.load_character(session_id, character_id, user_id=0)
        if not load_result.get('success'):
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': load_result.get('error', 'Character not found')})

        char_data = load_result['character_data']
        inner = char_data.get('data', char_data)
        current_xp = int(inner.get('experience', inner.get('currentXP', 0)) or 0)
        new_xp = current_xp + amount

        # D&D 5e XP thresholds (PHB, p.15). Compendium doesn't expose advancement tables yet.
        _XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
                     85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
        old_level = next((i for i in range(19, -1, -1) if current_xp >= _XP_TABLE[i]), 0) + 1
        new_level = next((i for i in range(19, -1, -1) if new_xp >= _XP_TABLE[i]), 0) + 1
        leveled_up = new_level > old_level

        updates: dict = {}
        if 'data' in char_data:
            updates = {'data': {**inner, 'experience': new_xp}}
            if leveled_up:
                updates['data']['level'] = new_level
                updates['data']['pending_level_up'] = True
        else:
            updates = {**char_data, 'experience': new_xp}
            if leveled_up:
                updates['level'] = new_level
                updates['pending_level_up'] = True

        save_result = char_mgr.update_character(session_id, character_id, updates, user_id=0, bypass_owner_check=True)
        if not save_result.get('success'):
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': save_result.get('error', 'Save failed')})

        # Log the award
        from database.database import SessionLocal
        from database.models import CharacterLog
        try:
            with SessionLocal() as db:
                db.add(CharacterLog(
                    character_id=character_id, session_id=session_id,
                    action_type='xp_award',
                    description=f"+{amount} XP from {source}" + (f": {description}" if description else ""),
                    user_id=user_id,
                ))
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to log XP award: {e}")

        resp_data = {
            'success': True, 'character_id': character_id,
            'amount': amount, 'new_xp': new_xp,
            'leveled_up': leveled_up, 'new_level': new_level if leveled_up else old_level,
        }
        await self.broadcast_to_session(Message(MessageType.XP_AWARD_RESPONSE, resp_data), client_id)
        return Message(MessageType.XP_AWARD_RESPONSE, resp_data)

    async def handle_multiclass_request(self, msg: Message, client_id: str) -> Message:
        """Player or DM requests adding a new class (multiclassing)."""
        if not msg.data:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': 'No data provided'})

        character_id = msg.data.get('character_id')
        new_class = msg.data.get('new_class', '')
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id or not new_class:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': 'character_id and new_class required'})
        if not session_id:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': 'Session not found'})

        from managers.character_manager import get_server_character_manager
        char_mgr = get_server_character_manager()

        is_dm_client = is_dm(self._get_client_role(client_id))
        load_result = char_mgr.load_character(session_id, character_id, user_id=user_id if not is_dm_client else 0)
        if not load_result.get('success'):
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': load_result.get('error', 'Character not found')})

        char_data = load_result['character_data']
        valid, error = char_mgr.validate_multiclass(char_data, new_class)
        if not valid:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': error})

        inner = char_data.get('data', char_data)
        classes = list(inner.get('classes', []))
        classes.append({'name': new_class.lower(), 'level': 1})

        updates: dict = {}
        if 'data' in char_data:
            updates = {'data': {**inner, 'classes': classes}}
        else:
            updates = {**char_data, 'classes': classes}

        save_result = char_mgr.update_character(session_id, character_id, updates, user_id=user_id, bypass_owner_check=is_dm_client)
        if not save_result.get('success'):
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': save_result.get('error', 'Save failed')})

        resp_data = {'success': True, 'character_id': character_id, 'new_class': new_class, 'classes': classes}
        await self.broadcast_to_session(Message(MessageType.MULTICLASS_RESPONSE, resp_data), client_id)
        return Message(MessageType.MULTICLASS_RESPONSE, resp_data)

    async def _sync_character_stats_to_tokens(self, session_id: int, character_id: str, updates: dict):
        """
        Sync character stat changes (HP, max HP, AC) to all tokens linked to this character.
        Called after character updates to keep token stats in sync.
        """
        try:
            # Only sync if HP, max_hp, or AC were updated
            stat_fields = {'hp', 'max_hp', 'ac'}
            updated_stats = {k: v for k, v in updates.items() if k in stat_fields}

            if not updated_stats:
                return  # No stats to sync

            logger.debug(f"Syncing character {character_id} stats to linked tokens: {updated_stats}")

            # Get all entities linked to this character
            db = SessionLocal()
            try:
                from database.models import Entity as DBEntity
                from database.models import VirtualTable as DBVirtualTable

                # Find the table_id for this session
                table_record = db.query(DBVirtualTable).filter(
                    DBVirtualTable.session_id == session_id
                ).first()

                if not table_record:
                    logger.debug(f"No table found for session {session_id}")
                    return

                # Find all entities with this character_id in the table
                linked_entities = db.query(DBEntity).filter(
                    DBEntity.table_id == table_record.id,
                    DBEntity.character_id == character_id
                ).all()

                if not linked_entities:
                    logger.debug(f"No tokens linked to character {character_id}")
                    return

                # Update each linked entity
                for entity in linked_entities:
                    # Update database entity
                    for field, value in updated_stats.items():
                        setattr(entity, field, value)

                    # Update in-memory entity if it exists
                    table = self.table_manager.get_table_by_session_id(session_id)
                    if table:
                        in_memory_entity = table.entities.get(entity.id)
                        if in_memory_entity:
                            for field, value in updated_stats.items():
                                setattr(in_memory_entity, field, value)

                db.commit()
                logger.info(f"Synced stats from character {character_id} to {len(linked_entities)} token(s)")

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error syncing character stats to tokens: {e}")
