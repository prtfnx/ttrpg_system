import os
import sys
import time
import json
import uuid
import xxhash
from typing import Dict, Set, Optional, Tuple, Any, Callable

from core_table.protocol import Message, MessageType, BatchMessage 
from core_table.actions_core import ActionsCore
from utils.logger import setup_logger
from utils.roles import is_dm, is_elevated, can_interact, get_visible_layers, get_sprite_limit
from .asset_manager import get_server_asset_manager, AssetRequest
from database.models import Asset, GameSession, GamePlayer
from database.database import SessionLocal
from service.movement_validator import MovementValidator, Combatant
from service.rules_engine import RulesEngine
from core_table.session_rules import SessionRules
from core_table.game_mode import GameMode
from database.crud import get_session_rules_json, get_game_mode

logger = setup_logger(__name__)

class ServerProtocol:
    def __init__(self, table_manager, session_manager=None):
        logger.info("Initializing ServerProtocol")
        self.table_manager = table_manager # for compatibility, tables manage actions protocol now
        self.session_manager = session_manager  # Reference to session manager for getting session_id
        self.clients: Dict[str, Any] = {}
        logger.debug(f"ServerProtocol initialized with table manager: {self.table_manager}")
        self.handlers: Dict[MessageType, Callable] = {}
        logger.debug("Registering built-in protocol handlers")
        self.init_handlers()
        self.actions = ActionsCore(self.table_manager)
        logger.debug("ActionsCore initialized")
        # insure that tables have id and names
        #TODO make proper name -> id mapping
        if not self.table_manager.tables_id:
            self.table_manager.tables_id = {str(table.table_id): table for table in self.table_manager.tables.values()}
            logger.debug(f"Initialized tables_id with {len(self.table_manager.tables_id)} tables id: {self.table_manager.tables_id}")
        # Track sprite positions for conflict resolution
        #self.sprite_positions: Dict[str, Dict[str, Tuple[float, float]]] = {}

    def register_handler(self, msg_type: MessageType, handler: Callable):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler    

    def init_handlers(self):
        """Initialize built-in protocol handlers"""
        # Register built-in handlers
        self.register_handler(MessageType.PING, self.handle_ping)
        self.register_handler(MessageType.PONG, self.handle_pong)
        self.register_handler(MessageType.TEST, self.handle_test)
        self.register_handler(MessageType.BATCH, self.handle_batch)
        
        # Authentication handlers
        self.register_handler(MessageType.AUTH_REGISTER, self.handle_auth_register)
        self.register_handler(MessageType.AUTH_LOGIN, self.handle_auth_login)
        self.register_handler(MessageType.AUTH_LOGOUT, self.handle_auth_logout)
        self.register_handler(MessageType.AUTH_TOKEN, self.handle_auth_token)
        self.register_handler(MessageType.AUTH_STATUS, self.handle_auth_status)
        
        # Table management
        self.register_handler(MessageType.NEW_TABLE_REQUEST, self.handle_new_table_request)
        self.register_handler(MessageType.TABLE_REQUEST, self.handle_table_request)
        self.register_handler(MessageType.TABLE_UPDATE, self.handle_table_update)
        self.register_handler(MessageType.TABLE_SCALE, self.handle_table_scale)
        self.register_handler(MessageType.TABLE_MOVE, self.handle_table_move)
        self.register_handler(MessageType.TABLE_DELETE, self.handle_delete_table)
        self.register_handler(MessageType.TABLE_LIST_REQUEST, self.handle_table_list_request)
        # Active table persistence
        self.register_handler(MessageType.TABLE_ACTIVE_REQUEST, self.handle_table_active_request)
        self.register_handler(MessageType.TABLE_ACTIVE_SET, self.handle_table_active_set)
        self.register_handler(MessageType.TABLE_ACTIVE_SET_ALL, self.handle_table_active_set_all)
        # Dynamic lighting settings (DM-only)
        self.register_handler(MessageType.TABLE_SETTINGS_UPDATE, self.handle_table_settings_update)
        
        # Player management
        self.register_handler(MessageType.PLAYER_ACTION, self.handle_player_action)
        self.register_handler(MessageType.PLAYER_READY, self.handle_player_ready)
        self.register_handler(MessageType.PLAYER_UNREADY, self.handle_player_unready)
        self.register_handler(MessageType.PLAYER_STATUS, self.handle_player_status)
        self.register_handler(MessageType.PLAYER_LIST_REQUEST, self.handle_player_list_request)
        self.register_handler(MessageType.PLAYER_KICK_REQUEST, self.handle_player_kick_request)
        self.register_handler(MessageType.PLAYER_BAN_REQUEST, self.handle_player_ban_request)
        self.register_handler(MessageType.CONNECTION_STATUS_REQUEST, self.handle_connection_status_request)
        
        # Sprite management
        self.register_handler(MessageType.SPRITE_REQUEST, self.handle_sprite_request)
        self.register_handler(MessageType.SPRITE_CREATE, self.handle_create_sprite)
        self.register_handler(MessageType.SPRITE_REMOVE, self.handle_delete_sprite)
        self.register_handler(MessageType.SPRITE_MOVE, self.handle_move_sprite)
        self.register_handler(MessageType.SPRITE_SCALE, self.handle_scale_sprite)
        self.register_handler(MessageType.SPRITE_ROTATE, self.handle_rotate_sprite)
        self.register_handler(MessageType.SPRITE_UPDATE, self.handle_sprite_update)
        # Live drag previews
        self.register_handler(MessageType.SPRITE_DRAG_PREVIEW, self.handle_sprite_drag_preview)
        self.register_handler(MessageType.SPRITE_RESIZE_PREVIEW, self.handle_sprite_resize_preview)
        self.register_handler(MessageType.SPRITE_ROTATE_PREVIEW, self.handle_sprite_rotate_preview)
        
        # File transfer
        self.register_handler(MessageType.FILE_REQUEST, self.handle_file_request)
        self.register_handler(MessageType.FILE_DATA, self.handle_file_data)
        
        # Asset management
        self.register_handler(MessageType.ASSET_UPLOAD_REQUEST, self.handle_asset_upload_request)
        self.register_handler(MessageType.ASSET_DOWNLOAD_REQUEST, self.handle_asset_download_request)
        self.register_handler(MessageType.ASSET_LIST_REQUEST, self.handle_asset_list_request)
        self.register_handler(MessageType.ASSET_UPLOAD_CONFIRM, self.handle_asset_upload_confirm)
        self.register_handler(MessageType.ASSET_DELETE_REQUEST, self.handle_asset_delete_request)
        self.register_handler(MessageType.ASSET_HASH_CHECK, self.handle_asset_hash_check)
        
        # Compendium operations
        self.register_handler(MessageType.COMPENDIUM_SPRITE_ADD, self.handle_compendium_sprite_add)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_UPDATE, self.handle_compendium_sprite_update)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_REMOVE, self.handle_compendium_sprite_remove)
        
        # Character management
        self.register_handler(MessageType.CHARACTER_SAVE_REQUEST, self.handle_character_save_request)
        self.register_handler(MessageType.CHARACTER_LOAD_REQUEST, self.handle_character_load_request)
        self.register_handler(MessageType.CHARACTER_LIST_REQUEST, self.handle_character_list_request)
        self.register_handler(MessageType.CHARACTER_DELETE_REQUEST, self.handle_character_delete_request)
        # Character update (delta updates)
        if hasattr(MessageType, 'CHARACTER_UPDATE'):
            self.register_handler(MessageType.CHARACTER_UPDATE, self.handle_character_update)
        if hasattr(MessageType, 'CHARACTER_LOG_REQUEST'):
            self.register_handler(MessageType.CHARACTER_LOG_REQUEST, self.handle_character_log_request)
        if hasattr(MessageType, 'CHARACTER_ROLL'):
            self.register_handler(MessageType.CHARACTER_ROLL, self.handle_character_roll)
        if hasattr(MessageType, 'XP_AWARD'):
            self.register_handler(MessageType.XP_AWARD, self.handle_xp_award)
        if hasattr(MessageType, 'MULTICLASS_REQUEST'):
            self.register_handler(MessageType.MULTICLASS_REQUEST, self.handle_multiclass_request)
        
        # Wall management (DM-only for create/update/remove; all for door_toggle)
        self.register_handler(MessageType.WALL_CREATE,       self.handle_wall_create)
        self.register_handler(MessageType.WALL_UPDATE,       self.handle_wall_update)
        self.register_handler(MessageType.WALL_REMOVE,       self.handle_wall_remove)
        self.register_handler(MessageType.WALL_BATCH_CREATE, self.handle_wall_batch_create)
        self.register_handler(MessageType.DOOR_TOGGLE,       self.handle_door_toggle)

        # Layer settings persistence (DM-only write, broadcast to all)
        self.register_handler(MessageType.LAYER_SETTINGS_UPDATE, self.handle_layer_settings_update)

        # Game mode & session rules (DM-only writes, broadcast to all)
        self.register_handler(MessageType.GAME_MODE_CHANGE,     self.handle_game_mode_change)
        self.register_handler(MessageType.SESSION_RULES_UPDATE, self.handle_session_rules_update)
        self.register_handler(MessageType.SESSION_RULES_REQUEST, self.handle_session_rules_request)

        # Combat (Phase 5-10)
        self.register_handler(MessageType.COMBAT_START,          self.handle_combat_start)
        self.register_handler(MessageType.COMBAT_END,            self.handle_combat_end)
        self.register_handler(MessageType.COMBAT_STATE_REQUEST,  self.handle_combat_state_request)
        self.register_handler(MessageType.INITIATIVE_ROLL,       self.handle_initiative_roll)
        self.register_handler(MessageType.INITIATIVE_SET,        self.handle_initiative_set)
        self.register_handler(MessageType.INITIATIVE_ADD,        self.handle_initiative_add)
        self.register_handler(MessageType.INITIATIVE_REMOVE,     self.handle_initiative_remove)
        self.register_handler(MessageType.TURN_END,              self.handle_turn_end)
        self.register_handler(MessageType.TURN_SKIP,             self.handle_turn_skip)
        self.register_handler(MessageType.CONDITION_ADD,         self.handle_condition_add)
        self.register_handler(MessageType.CONDITION_REMOVE,      self.handle_condition_remove)
        self.register_handler(MessageType.DM_SET_HP,             self.handle_dm_set_hp)
        self.register_handler(MessageType.DM_APPLY_DAMAGE,       self.handle_dm_apply_damage)
        self.register_handler(MessageType.DM_REVERT_ACTION,      self.handle_dm_revert_action)
        self.register_handler(MessageType.DM_ADD_ACTION,         self.handle_dm_add_action)
        self.register_handler(MessageType.DM_ADD_MOVEMENT,       self.handle_dm_add_movement)
        self.register_handler(MessageType.DM_TOGGLE_AI,          self.handle_dm_toggle_ai)
        self.register_handler(MessageType.AI_ACTION,             self.handle_ai_action)
        # Encounters (Phase 11)
        self.register_handler(MessageType.ENCOUNTER_START,       self.handle_encounter_start)
        self.register_handler(MessageType.ENCOUNTER_END,         self.handle_encounter_end)
        self.register_handler(MessageType.ENCOUNTER_CHOICE,      self.handle_encounter_choice)
        self.register_handler(MessageType.ENCOUNTER_ROLL,        self.handle_encounter_roll)

        # Planning commit (Phase 4)
        self.register_handler(MessageType.ACTION_COMMIT,         self.handle_action_commit)

        # Error handling
        self.register_handler(MessageType.ERROR, self.handle_error)
        self.register_handler(MessageType.SUCCESS, self.handle_success)
        self.register_handler(MessageType.PLAYER_KICK_REQUEST, self.handle_player_kick_request)
        self.register_handler(MessageType.PLAYER_BAN_REQUEST, self.handle_player_ban_request)
        self.register_handler(MessageType.CONNECTION_STATUS_REQUEST, self.handle_connection_status_request)

    async def handle_client(self, msg: Message, client_id: str) -> bool:
        """Handle client message"""

        logger.debug(f"msg received: {msg}")        
        # Check custom handlers first
        logger.debug(f"Handling message type: {msg.type} for client {client_id}")
        if msg.type in self.handlers:
            response = await self.handlers[msg.type](msg, client_id)
            if response:
                logger.debug(f"Sending response to client {client_id}: {response}")
                await self.send_to_client(response, client_id)
            return True
        else:
            logger.warning(f"No handler registered for message type: {msg.type}")
            return False    
    async def handle_ping(self, msg: Message, client_id: str) -> Message:
        """Handle ping message"""
        logger.info(f"PING received from client {client_id}")
        response = Message(MessageType.PONG, {'timestamp': time.time(), 'client_id': client_id})
        logger.info(f"Sending PONG back to client {client_id}")
        return response
    
    async def handle_success(self, msg: Message, client_id: str) -> Message:
        """Handle success message"""
        logger.debug(f"Received success message from {client_id}: {msg}")
        return Message(MessageType.SUCCESS, {'acknowledged': True})
    
    async def handle_pong(self, msg: Message, client_id: str) -> Message:
        """Handle pong message"""
        logger.debug(f"Received pong message from {client_id}: {msg}")
        return Message(MessageType.SUCCESS, {'pong_acknowledged': True})
    
    async def handle_batch(self, msg: Message, client_id: str) -> Message:
        """Handle batch message - process multiple messages at once"""
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in batch message'})
            
        logger.debug(f"Received batch message from {client_id} with {len(msg.data.get('messages', []))} messages")
        
        try:
            # Extract batch data
            messages_data = msg.data.get('messages', [])
            sequence_id = msg.data.get('seq', 0)
            
            # Process each message in the batch
            responses = []
            for msg_data in messages_data:
                try:
                    # Reconstruct Message object from the data
                    individual_msg = Message(
                        type=MessageType(msg_data.get('type')),
                        data=msg_data.get('data', {}),
                        client_id=msg_data.get('client_id'),
                        timestamp=msg_data.get('timestamp'),
                        version=msg_data.get('version', '0.1'),
                        priority=msg_data.get('priority', 5),
                        sequence_id=msg_data.get('sequence_id')
                    )
                    
                    # Process the individual message
                    # Get the handler for this message type and call it directly
                    handler = self.handlers.get(individual_msg.type)
                    if handler:
                        response = await handler(individual_msg, client_id)
                        if response and hasattr(response, 'to_json'):
                            responses.append(response)
                    else:
                        logger.warning(f"No handler found for message type: {individual_msg.type}")
                        
                except Exception as e:
                    logger.error(f"Error processing message in batch: {e}")
                    error_response = Message(MessageType.ERROR, {
                        'error': f'Batch message processing error: {str(e)}',
                        'original_message': msg_data
                    })
                    responses.append(error_response)
            
            # Return batch response if there are any responses
            if responses:
                return Message(MessageType.BATCH, {
                    'messages': [json.loads(resp.to_json()) for resp in responses],
                    'seq': sequence_id,
                    'processed_count': len(messages_data),
                    'response_count': len(responses)
                })
            else:
                # Return success message for batch processing
                return Message(MessageType.SUCCESS, {
                    'message': f'Batch processed successfully: {len(messages_data)} messages',
                    'seq': sequence_id,
                    'processed_count': len(messages_data)
                })
                
        except Exception as e:
            logger.error(f"Error handling batch message: {e}")
            return Message(MessageType.ERROR, {
                'error': f'Batch processing failed: {str(e)}',
                'seq': msg.data.get('seq', 0) if msg.data else 0
            })
        
    async def handle_error(self, msg: Message, client_id: str) -> Message:
        """Handle error message"""
        logger.warning(f"Error message received from {client_id}: {msg}")
        return Message(MessageType.SUCCESS, {'error_acknowledged': True})
    
    async def handle_create_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle create sprite request"""
        logger.debug(f"Create sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in create sprite request'})
        sprite_data = msg.data.get('sprite_data')
        if not sprite_data:
            return Message(MessageType.ERROR, {'error': 'No sprite data provided'})
        # Normalize sprite_data to a dict to satisfy static checks and ensure .get works
        if not isinstance(sprite_data, dict):
            try:
                if hasattr(sprite_data, 'to_dict'):
                    sprite_data = sprite_data.to_dict() or {}
                else:
                    sprite_data = dict(sprite_data)
            except Exception:
                sprite_data = {}
        table_id = msg.data.get('table_id', 'default')
        
        # Get session_id for database persistence
        session_id = self._get_session_id(msg)
        
        # Extract canonical character link and normalize controlled_by
        try:
            if isinstance(sprite_data, dict):
                # Enforce canonical `character_id` key (do not accept legacy `id`)
                char_id = msg.data.get('character_id') or sprite_data.get('character_id')
                if char_id:
                    sprite_data['character_id'] = str(char_id)

                # Normalize controlled_by if provided as list -> store as JSON string for DB
                cb = sprite_data.get('controlled_by')
                if isinstance(cb, (list, tuple)):
                    sprite_data['controlled_by'] = json.dumps(cb)
        except Exception:
            # ignore normalization errors but do not silently remap legacy keys
            pass

        # Role-based layer access check
        _dm_layers = {'dungeon_master', 'fog_of_war', 'light', 'height', 'obstacles', 'dm_notes'}
        role = self._get_client_role(client_id)
        layer = sprite_data.get('layer', 'tokens') if isinstance(sprite_data, dict) else 'tokens'
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Insufficient permissions to create sprites'})
        if layer in _dm_layers and not is_dm(role):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create sprites on this layer'})

        # Get user identity for ownership and limit enforcement
        user_id = self._get_user_id(msg, client_id)

        # Enforce per-role sprite creation limit for non-DM players
        if not is_dm(role):
            limit = get_sprite_limit(role)
            if user_id is not None and hasattr(self.table_manager, 'db_session') and self.table_manager.db_session:
                from database.models import Entity
                all_entities = self.table_manager.db_session.query(Entity).filter(Entity.controlled_by.isnot(None)).all()
                owned_count = sum(1 for e in all_entities if user_id in json.loads(e.controlled_by or '[]'))
                if owned_count >= limit:
                    return Message(MessageType.ERROR, {'error': f'Sprite limit of {limit} reached for your role'})

        # Set controlled_by based on who is creating the sprite
        if isinstance(sprite_data, dict):
            if is_dm(role):
                # DM sprites are DM-owned; players cannot control them
                sprite_data['controlled_by'] = json.dumps([])
            elif user_id is not None:
                # Player-placed sprite: creator is the only non-DM controller
                sprite_data['controlled_by'] = json.dumps([user_id])

        result = await self.actions.create_sprite(table_id=table_id, sprite_data=sprite_data, session_id=session_id)
        logger.debug(f"Create sprite result: {result}")
        # Safely extract result data
        result_data = result.data or {}
        if not result.success or not result_data or result_data.get('sprite_data') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to create sprite'})
        else:
            # Include both sprite_id and the full sprite_data for client WASM engine
            sprite_data = result_data.get('sprite_data') or {}
            if not isinstance(sprite_data, dict) and hasattr(sprite_data, 'to_dict'):
                try:
                    sprite_data = sprite_data.to_dict() or {}
                except Exception:
                    sprite_data = {}
            logger.debug(f"Sprite creation result - sprite_data: {sprite_data}")
            # Ensure table_id is embedded in sprite_data so the client can assign it
            # to WASM sprites (without it the sprite gets table_id='default_table' and is never rendered)
            if isinstance(sprite_data, dict):
                sprite_data['table_id'] = table_id
            response_data = {
                'sprite_id': sprite_data.get('sprite_id') if isinstance(sprite_data, dict) else None,
                'sprite_data': sprite_data
            }
            logger.debug(f"Sending sprite response: {response_data}")
            
            # Broadcast sprite creation only to clients who can see this layer
            update_message = Message(MessageType.SPRITE_UPDATE, {
                'sprite_id': sprite_data.get('sprite_id'),
                'operation': 'create',
                'sprite_data': sprite_data,
                'table_id': table_id
            })
            await self.broadcast_filtered(update_message, layer, client_id)
            
            return Message(MessageType.SPRITE_RESPONSE, response_data)

    async def handle_delete_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle delete sprite request"""
        logger.debug(f"Delete sprite request received: {msg}")
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can delete sprites'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in delete sprite request'})
        
        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        
        if not sprite_id:
            return Message(MessageType.ERROR, {'error': 'Sprite ID is required'})
        
        # Get session_id for database persistence
        session_id = self._get_session_id(msg)
        
        result = await self.actions.delete_sprite(table_id=table_id, sprite_id=sprite_id, session_id=session_id)
        if result.success:
            # Broadcast sprite deletion to all other clients in the session
            remove_message = Message(MessageType.SPRITE_REMOVE, {
                'sprite_id': sprite_id,
                'operation': 'remove',
                'table_id': table_id
            })
            await self.broadcast_to_session(remove_message, client_id)
            
            return Message(MessageType.SPRITE_RESPONSE, {
                'sprite_id': sprite_id,
                'operation': 'remove',
                'success': True
            })
        else:
            return Message(MessageType.ERROR, {'error': f'Failed to delete sprite: {result.message}'})

    async def handle_move_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle move sprite request"""
        logger.debug(f"Move sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in move sprite request'})
        
        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        from_pos = msg.data.get('from')
        to_pos = msg.data.get('to')
        action_id = msg.data.get('action_id')  # For confirmation tracking
        
        if not sprite_id or not from_pos or not to_pos:
            return Message(MessageType.ERROR, {'error': 'Sprite ID, from position, and to position are required'})

        # Role and ownership check
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot move sprites'})
        if not is_dm(role):
            user_id_check = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id_check):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})

        # Movement validation (server-authoritative)
        table = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
        if table is not None:
            try:
                from core_table.session_rules import SessionRules
                from database.crud import get_session_rules_json, get_game_mode
                session_code = self._get_session_code()
                rules = None
                game_mode = 'free_roam'
                if session_code:
                    db = SessionLocal()
                    try:
                        rules_json = get_session_rules_json(db, session_code)
                        game_mode = get_game_mode(db, session_code)
                        if rules_json and rules_json != '{}':
                            rules_data = json.loads(rules_json)
                            rules_data.setdefault('session_id', session_code)
                            rules = SessionRules.from_dict(rules_data)
                    finally:
                        db.close()

                if rules is None:
                    rules = SessionRules.defaults(session_code or 'default')

                # Normalise positions to pixel tuples
                def to_tuple(pos):
                    if isinstance(pos, dict):
                        return (float(pos.get('x', 0)), float(pos.get('y', 0)))
                    return (float(pos[0]), float(pos[1]))

                validator = MovementValidator(rules)
                # Do not use client-provided movement state for enforcement.
                # When server-authoritative turn/combat state tracks remaining movement,
                # construct a Combatant from that trusted value here.
                combatant = None

                mv_result = validator.validate(
                    entity_id=sprite_id,
                    from_pos=to_tuple(from_pos),
                    to_pos=to_tuple(to_pos),
                    table=table,
                    combatant=combatant,
                    client_path=msg.data.get('path'),
                )
                if not mv_result.valid:
                    reject = {'reason': mv_result.reason, 'sprite_id': sprite_id}
                    if action_id:
                        reject['action_id'] = action_id
                    return Message(MessageType.ACTION_REJECTED, reject)
            except Exception as e:
                logger.warning(f"Movement validation error (non-fatal): {e}")

        # Get session_id for database persistence
        session_id = self._get_session_id(msg)
        
        # Use the existing move_sprite method from actions
        result = await self.actions.move_sprite(
            table_id=table_id,  
            sprite_id=sprite_id,
            old_position=from_pos,
            new_position=to_pos,
            session_id=session_id
        )
        
        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'move',
                'to': to_pos,
                'success': True
            }
            # Include action_id for confirmation if provided
            if action_id:
                response_data['action_id'] = action_id
            
            # Broadcast sprite move to all other clients in the session
            move_message = Message(MessageType.SPRITE_MOVE, {
                'sprite_id': sprite_id,
                'x': to_pos.get('x') if isinstance(to_pos, dict) else to_pos[0],
                'y': to_pos.get('y') if isinstance(to_pos, dict) else to_pos[1],
                'table_id': table_id
            })
            await self.broadcast_to_session(move_message, client_id)
            
            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to move sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_scale_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle scale sprite request"""
        logger.debug(f"Scale sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in scale sprite request'})
        
        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        width = msg.data.get('width')
        height = msg.data.get('height')
        action_id = msg.data.get('action_id')

        if not sprite_id or width is None or height is None:
            return Message(MessageType.ERROR, {'error': 'Sprite ID, width, and height are required'})
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot modify sprites'})
        if not is_dm(role):
            if not await self._can_control_sprite(sprite_id, self._get_user_id(msg, client_id)):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})
        session_id = self._get_session_id(msg)
        result = await self.actions.update_sprite(table_id, sprite_id, session_id=session_id, width=width, height=height)

        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'resize',
                'width': width,
                'height': height,
                'success': True
            }
            if action_id:
                response_data['action_id'] = action_id

            await self.broadcast_to_session(
                Message(MessageType.SPRITE_SCALE, {'sprite_id': sprite_id, 'width': width, 'height': height, 'table_id': table_id}),
                client_id
            )
            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to resize sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_rotate_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle rotate sprite request"""
        logger.debug(f"Rotate sprite request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in rotate sprite request'})
        
        table_id = msg.data.get('table_id', 'default')
        sprite_id = msg.data.get('sprite_id')
        rotation = msg.data.get('rotation')
        action_id = msg.data.get('action_id')  # For confirmation tracking
        
        if not sprite_id or rotation is None:
            return Message(MessageType.ERROR, {'error': 'Sprite ID and rotation are required'})
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot modify sprites'})
        if not is_dm(role):
            if not await self._can_control_sprite(sprite_id, self._get_user_id(msg, client_id)):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})
        session_id = self._get_session_id(msg)
        result = await self.actions.rotate_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            angle=rotation,
            session_id=session_id
        )
        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'rotate',
                'rotation': rotation,
                'success': True
            }
            # Include action_id for confirmation if provided
            if action_id:
                response_data['action_id'] = action_id
            
            await self.broadcast_to_session(
                Message(MessageType.SPRITE_ROTATE, {
                    'sprite_id': sprite_id,
                    'rotation': rotation,
                    'table_id': table_id
                }),
                client_id
            )
            
            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to rotate sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_sprite_drag_preview(self, msg: Message, client_id: str) -> None:
        """Broadcast live drag position — no DB write, no confirmation."""
        data = msg.data
        if not data:
            return
        sprite_id = data.get('id') or data.get('sprite_id')
        x, y = data.get('x'), data.get('y')
        if not sprite_id or x is None or y is None:
            return
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id):
                return  # silently drop — player doesn't own this sprite
        await self.broadcast_to_session(
            Message(MessageType.SPRITE_DRAG_PREVIEW, {'id': sprite_id, 'x': x, 'y': y}),
            client_id
        )

    async def handle_sprite_resize_preview(self, msg: Message, client_id: str) -> None:
        """Broadcast live resize preview — no DB write, no confirmation."""
        data = msg.data
        if not data:
            return
        sprite_id = data.get('id') or data.get('sprite_id')
        width, height = data.get('width'), data.get('height')
        if not sprite_id or width is None or height is None:
            return
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id):
                return
        await self.broadcast_to_session(
            Message(MessageType.SPRITE_RESIZE_PREVIEW, {'id': sprite_id, 'width': width, 'height': height}),
            client_id
        )

    async def handle_sprite_rotate_preview(self, msg: Message, client_id: str) -> None:
        """Broadcast live rotate preview — no DB write, no confirmation."""
        data = msg.data
        if not data:
            return
        sprite_id = data.get('id') or data.get('sprite_id')
        rotation = data.get('rotation')
        if not sprite_id or rotation is None:
            return
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(sprite_id, user_id):
                return
        await self.broadcast_to_session(
            Message(MessageType.SPRITE_ROTATE_PREVIEW, {'id': sprite_id, 'rotation': rotation}),
            client_id
        )

    async def handle_delete_table(self, msg: Message, client_id: str) -> Message:
        """Handle delete table request"""
        logger.debug(f"Delete table request received: {msg}")
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can delete tables'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in delete table request'})
        
        table_id = msg.data.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'Table ID is required'})
        
        # Get session_id for database persistence
        session_id = self._get_session_id(msg)
        
        result = await self.actions.delete_table(table_id, session_id)
        if result.success:
            # Broadcast table deletion to all clients in the session
            update_message = Message(MessageType.TABLE_UPDATE, {
                'operation': 'delete',
                'table_id': table_id
            })
            await self.broadcast_to_session(update_message, client_id)
            
            return Message(MessageType.SUCCESS, {
                'table_id': table_id,
                'message': 'Table deleted successfully'
            })
        else:
            return Message(MessageType.ERROR, {'error': f'Failed to delete table: {result.message}'})

    async def handle_table_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle table list request"""
        logger.debug(f"Table list request received: {msg}")
        
        try:
            result = await self.actions.get_all_tables()
            if result.success:
                tables = result.data.get('tables', []) if result.data else []
                return Message(MessageType.TABLE_LIST_RESPONSE, {
                    'tables': tables,
                    'count': len(tables)
                })
            else:
                error_msg = getattr(result, 'message', 'Unknown error')
                return Message(MessageType.ERROR, {'error': f'Failed to get table list: {error_msg}'})
        except Exception as e:
            logger.error(f"Error handling table list request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_new_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle new table request"""
        logger.debug(f"New table request received: {msg}")
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create tables'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in new table request'})
        table_name = msg.data.get('table_name', 'default')
        local_table_id = msg.data.get('local_table_id')  # BEST PRACTICE: Preserve local ID for sync mapping
        logger.info(f"DEBUG: Extracted local_table_id = '{local_table_id}' (type: {type(local_table_id).__name__})")
        
        # BEST PRACTICE: Get session_id for database persistence
        session_id = self._get_session_id(msg)
        if session_id:
            logger.info(f"Creating table with session_id: {session_id}")
        else:
            logger.warning(f"No session_id available - table will not be persisted to database")
        
        result = await self.actions.create_table(table_name, msg.data.get('width', 100), msg.data.get('height', 100), session_id=session_id)        
        
        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to create new table'})
        else:
            # Get table data and ensure assets are in R2
            table_obj = (result.data or {}).get('table')
            to_dict_fn = getattr(table_obj, 'to_dict', None)
            if callable(to_dict_fn):
                try:
                    table_data = to_dict_fn() or {}
                except Exception:
                    table_data = {}
            elif isinstance(table_obj, dict):
                table_data = table_obj
            else:
                table_data = {}
            await self.ensure_assets_in_r2(table_data, msg.data.get('session_code', 'default'), self._get_user_id(msg, client_id) or 0)
            logger.info(f"Processing table {table_name} with {len(table_data.get('layers', {}))} layers")
            
            if local_table_id:
                logger.info(f"Sync completed: local table '{local_table_id}' → server table '{table_data.get('table_id')}'")
            
            # Broadcast new table creation to all clients in the session
            update_message = Message(MessageType.TABLE_UPDATE, {
                'operation': 'create',
                'table_id': table_data.get('id'),
                'table_name': table_name,
                'table_data': table_data
            })
            await self.broadcast_to_session(update_message, client_id)
            
            # BEST PRACTICE: Include local_table_id in response for client-side ID mapping
            response_data = {
                'name': table_name,
                'client_id': client_id,
                'table_data': table_data
            }
            if local_table_id:
                response_data['local_table_id'] = local_table_id
                logger.info(f"DEBUG: Added local_table_id to response: {local_table_id}")
            else:
                logger.warning(f"DEBUG: local_table_id is falsy, not adding to response")
            
            logger.info(f"DEBUG: Final response_data keys: {list(response_data.keys())}")
            return Message(MessageType.NEW_TABLE_RESPONSE, response_data)

    async def handle_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle table request"""
        logger.debug(f"Table request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in table request'})
        table_name = msg.data.get('table_name', 'default')
        table_id = msg.data.get('table_id', table_name)
        user_id = self._get_user_id(msg, client_id) or 0
        logger.info(f"Current tables: {self.table_manager.tables.items()}")
        result = await self.actions.get_table(table_id)
        
        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to get table'})
        else:
            # Get table data and add xxHash information
            table_obj = (result.data or {}).get('table')
            to_dict_fn = getattr(table_obj, 'to_dict', None)
            if callable(to_dict_fn):
                try:
                    table_data = to_dict_fn() or {}
                except Exception:
                    table_data = {}
            elif isinstance(table_obj, dict):
                table_data = table_obj
            else:
                table_data = {}
            table_data_with_hashes = await self.add_asset_hashes_to_table(table_data, session_code=msg.data.get('session_code', 'default'), user_id=user_id)

            role = self._get_client_role(client_id)
            if not is_dm(role):
                allowed_layers = set(get_visible_layers(role))
                layers = table_data_with_hashes.get('layers', {})
                table_data_with_hashes['layers'] = {k: v for k, v in layers.items() if k in allowed_layers}

            # Include walls for join-time sync
            table_obj2 = (result.data or {}).get('table')
            walls_list = []
            if table_obj2 and hasattr(table_obj2, 'walls'):
                walls_list = [w.to_dict() for w in table_obj2.walls.values()]

            # Fall back to DB if in-memory walls are empty (e.g. after server restart)
            if not walls_list and table_id:
                try:
                    from database.database import SessionLocal
                    from database.models import Wall as WallModel
                    _db = SessionLocal()
                    try:
                        db_walls = _db.query(WallModel).filter(WallModel.table_id == str(table_id)).all()
                        walls_list = [w.to_dict() for w in db_walls if hasattr(w, 'to_dict')]
                    finally:
                        _db.close()
                except Exception as _e:
                    logger.warning(f"Could not load walls from DB for table {table_id}: {_e}")

            # Include persisted layer settings for join-time sync
            layer_settings_data = {}
            if table_id:
                try:
                    from database.database import SessionLocal
                    from database import crud as _crud
                    import json as _json
                    _db = SessionLocal()
                    try:
                        _db_table = _crud.get_virtual_table_by_id(_db, str(table_id))
                        if _db_table and _db_table.layer_settings:
                            layer_settings_data = _json.loads(_db_table.layer_settings)
                    finally:
                        _db.close()
                except Exception as _e:
                    logger.warning(f"Could not load layer_settings from DB: {_e}")

            # return message that need send to client
            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data_with_hashes,
                                                            'walls': walls_list,
                                                            'layer_settings': layer_settings_data})

    async def handle_table_settings_update(self, msg: Message, client_id: str) -> Message:
        """Handle DM request to change dynamic lighting / fog exploration settings for a table."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change table lighting settings'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id is required'})

        VALID_FOG_MODES = {'current_only', 'persist_dimmed'}
        dynamic_lighting = msg.data.get('dynamic_lighting_enabled')
        fog_mode = msg.data.get('fog_exploration_mode')
        ambient = msg.data.get('ambient_light_level')
        grid_cell_px = msg.data.get('grid_cell_px')
        cell_distance = msg.data.get('cell_distance')
        distance_unit = msg.data.get('distance_unit')
        grid_enabled = msg.data.get('grid_enabled')
        snap_to_grid = msg.data.get('snap_to_grid')
        grid_color_hex = msg.data.get('grid_color_hex')
        background_color_hex = msg.data.get('background_color_hex')

        if fog_mode is not None and fog_mode not in VALID_FOG_MODES:
            return Message(MessageType.ERROR, {'error': f'fog_exploration_mode must be one of {VALID_FOG_MODES}'})
        if ambient is not None:
            try:
                ambient = float(ambient)
            except (ValueError, TypeError):
                return Message(MessageType.ERROR, {'error': 'ambient_light_level must be a number between 0.0 and 1.0'})
            if not (0.0 <= ambient <= 1.0):
                return Message(MessageType.ERROR, {'error': 'ambient_light_level must be between 0.0 and 1.0'})
        if grid_cell_px is not None:
            try:
                grid_cell_px = float(grid_cell_px)
            except (ValueError, TypeError):
                return Message(MessageType.ERROR, {'error': 'grid_cell_px must be a number between 10 and 500'})
            if not (10.0 <= grid_cell_px <= 500.0):
                return Message(MessageType.ERROR, {'error': 'grid_cell_px must be between 10 and 500'})
        if cell_distance is not None:
            try:
                cell_distance = float(cell_distance)
            except (ValueError, TypeError):
                return Message(MessageType.ERROR, {'error': 'cell_distance must be a positive number'})
            if cell_distance <= 0:
                return Message(MessageType.ERROR, {'error': 'cell_distance must be positive'})
        if distance_unit is not None and distance_unit not in ('ft', 'm'):
            return Message(MessageType.ERROR, {'error': 'distance_unit must be ft or m'})

        HEX_PATTERN = r'^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$'
        import re as _re
        if grid_color_hex is not None:
            if not isinstance(grid_color_hex, str) or not _re.match(HEX_PATTERN, grid_color_hex):
                return Message(MessageType.ERROR, {'error': 'grid_color_hex must be a valid hex color'})
        if background_color_hex is not None:
            if not isinstance(background_color_hex, str) or not _re.match(HEX_PATTERN, background_color_hex):
                return Message(MessageType.ERROR, {'error': 'background_color_hex must be a valid hex color'})

        # Apply to in-memory table
        table = self.table_manager.tables_id.get(table_id)
        if table is None:
            table = self.table_manager.tables.get(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})

        if dynamic_lighting is not None:
            # Strict bool parsing - JSON booleans from client are already bool,
            # but guard against truthy strings like 'false'/'0'
            if isinstance(dynamic_lighting, bool):
                table.dynamic_lighting_enabled = dynamic_lighting
            else:
                table.dynamic_lighting_enabled = bool(dynamic_lighting)
        if fog_mode is not None:
            table.fog_exploration_mode = fog_mode
        if ambient is not None:
            table.ambient_light_level = float(ambient)
        if grid_cell_px is not None:
            table.grid_cell_px = float(grid_cell_px)
        if cell_distance is not None:
            table.cell_distance = float(cell_distance)
        if distance_unit is not None:
            table.distance_unit = distance_unit
        if grid_enabled is not None:
            table.grid_enabled = bool(grid_enabled)
        if snap_to_grid is not None:
            table.snap_to_grid = bool(snap_to_grid)
        if grid_color_hex is not None:
            table.grid_color_hex = grid_color_hex
        if background_color_hex is not None:
            table.background_color_hex = background_color_hex

        # Persist to DB
        session_id = self._get_session_id(msg)
        if session_id:
            try:
                from database.database import SessionLocal
                from database import crud, schemas
                db = SessionLocal()
                try:
                    update = schemas.VirtualTableUpdate(
                        dynamic_lighting_enabled=table.dynamic_lighting_enabled,
                        fog_exploration_mode=table.fog_exploration_mode,
                        ambient_light_level=table.ambient_light_level,
                        grid_cell_px=table.grid_cell_px,
                        cell_distance=table.cell_distance,
                        distance_unit=table.distance_unit,
                        grid_enabled=table.grid_enabled,
                        snap_to_grid=table.snap_to_grid,
                        grid_color_hex=table.grid_color_hex,
                        background_color_hex=table.background_color_hex,
                    )
                    crud.update_virtual_table(db, str(table.table_id), update)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Failed to persist table lighting settings: {e}")

        # Broadcast to all clients in session
        broadcast_data = {
            'table_id': table_id,
            'dynamic_lighting_enabled': table.dynamic_lighting_enabled,
            'fog_exploration_mode': table.fog_exploration_mode,
            'ambient_light_level': table.ambient_light_level,
            'grid_cell_px': table.grid_cell_px,
            'cell_distance': table.cell_distance,
            'distance_unit': table.distance_unit,
            'grid_enabled': table.grid_enabled,
            'snap_to_grid': table.snap_to_grid,
            'grid_color_hex': table.grid_color_hex,
            'background_color_hex': table.background_color_hex,
        }
        await self.broadcast_to_session(
            Message(MessageType.TABLE_SETTINGS_CHANGED, broadcast_data), client_id
        )
        return Message(MessageType.TABLE_SETTINGS_CHANGED, broadcast_data)

    async def handle_table_update(self, msg: Message, client_id: str) -> Message:
        """Handle and broadcast table update with sprite movement support"""
        logger.debug(f"Handling table update from {client_id}: {msg}")
        try:
            if not msg.data:
                logger.error(f"No data provided in table update from {client_id}")
                return Message(MessageType.ERROR, {'error': 'No data provided in table update'})
            else:
                update_category = msg.data.get('category', 'table')
                update_type = msg.data.get('type')
                update_data = msg.data.get('data', {})
                table_id = update_data.get('table_id', 'default')
                
                # Validate required fields
                if update_type is None:
                    logger.error(f"Missing 'type' field in table update from {client_id}: {msg.data}")
                    return Message(MessageType.ERROR, {'error': 'Missing required field: type'})
                
                role = self._get_client_role(client_id)
                user_id = self._get_user_id(msg, client_id)

                response_error = None
                response = None
                if update_category == 'sprite':
                    update_type_enum = MessageType(update_type)
                    match update_type_enum:
                        case MessageType.SPRITE_MOVE | MessageType.SPRITE_SCALE | MessageType.SPRITE_ROTATE:
                            sprite_id = update_data.get('sprite_id')
                            if not is_dm(role) and not await self._can_control_sprite(sprite_id, user_id):
                                return Message(MessageType.ERROR, {'error': 'Permission denied'})
                            await self.actions.update_sprite(table_id, sprite_id, data=update_data)
                            response= Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': sprite_id,
                                'message': f'Sprite {update_type} successfully'
                            })
                        case MessageType.SPRITE_CREATE:
                            if not is_dm(role):
                                return Message(MessageType.ERROR, {'error': 'Only DMs can create sprites'})
                            await self.actions.create_sprite_from_data(data=update_data,)
                            return Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite added successfully'
                            })
                        case MessageType.SPRITE_REMOVE:
                            if not is_dm(role):
                                return Message(MessageType.ERROR, {'error': 'Only DMs can delete sprites'})
                            await self.actions.delete_sprite(table_id, update_data.get('sprite_id'))
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite removed successfully'
                            })
                        case _:
                            logger.error(f"Unknown sprite update type: {update_type} from {client_id}")
                            response_error= Message(MessageType.ERROR, {
                                'error': f"Unknown sprite update type"
                            })
                            
                elif update_category == 'table':
                    if not is_dm(role):
                        return Message(MessageType.ERROR, {'error': 'Only DMs can modify table settings'})
                    match update_type:
                        case  'table_move' | 'table_update':
                            await self.actions.update_table_from_data(update_data)
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'message': f'Table {update_type} successfully'
                            })
                        case 'fog_update':
                            session_id = self._get_session_id(msg)
                            hide_rectangles = update_data.get('hide_rectangles', [])
                            reveal_rectangles = update_data.get('reveal_rectangles', [])
                            
                            result = await self.actions.update_fog_rectangles(table_id, hide_rectangles, reveal_rectangles, session_id)
                            
                            if result.success:
                                fog_data = result.data.get('fog_rectangles') if result.data else {}
                                response = Message(MessageType.SUCCESS, {
                                    'table_id': table_id,
                                    'message': 'Fog updated successfully',
                                    'fog_rectangles': fog_data
                                })
                            else:
                                response_error = Message(MessageType.ERROR, {'error': result.message})
                        case _:
                            logger.error(f"Unknown table update type: {update_type} from {client_id}")
                            response_error = Message(MessageType.ERROR, {
                                'error': f"Unknown table update type: {update_type}"
                            })
                            
                if response_error:
                    await self.send_to_client(response_error, client_id)
                    return response_error
                elif response:
                    await self.send_to_client(response, client_id)
                    await self.broadcast_to_session(message=msg, client_id=client_id)
                    return response
                else:
                    raise ValueError("No response generated for table update")

        except Exception as e:
            logger.error(f"Error handling table update from {client_id}: {e}")
            await self._broadcast_error(client_id, "Update failed")
            return Message(MessageType.ERROR, {'error': "Update failed"})
    
    async def handle_sprite_update(self, msg: Message, client_id: str) -> Message:
        """Handle sprite update message with character binding and token stats support"""
        logger.info(f"Handling sprite update from {client_id}: {msg}")
        if not msg.data:
            logger.error(f"No data provided in sprite update from {client_id}")
            return Message(MessageType.ERROR, {'error': 'No data provided in sprite update'})
            
        # Client sends flat structure: { sprite_id, table_id, character_id, hp, ... }
        # Legacy support for nested structure: { type: 'sprite_move', data: { ... } }
        type = msg.data.get('type')
        update_data = msg.data.get('data', {}) if type else msg.data
        
        # Extract sprite_id and table_id for permission checks
        sprite_id = update_data.get('sprite_id') or msg.data.get('sprite_id')
        table_id = update_data.get('table_id') or update_data.get('table_name')
        
        if not sprite_id:
            return Message(MessageType.ERROR, {'error': 'Missing sprite_id'})
        
        # Permission validation — DMs can always update any sprite
        role = self._get_client_role(client_id)
        user_id = self._get_user_id(msg, client_id)
        if not is_dm(role) and not await self._can_control_sprite(sprite_id, user_id):
            logger.warning(f"User {user_id} attempted to update sprite {sprite_id} without permission")
            return Message(MessageType.ERROR, {'error': 'Permission denied: you cannot control this sprite'})
        
        # Handle legacy type-based updates
        if type:
            if not update_data or 'table_name' not in update_data or 'sprite_id' not in update_data:
                logger.error(f"Invalid sprite update data from {client_id}: {update_data}")
                return Message(MessageType.ERROR, {'error': 'Invalid sprite update data'})
            match type:
                case 'sprite_move':
                    if 'from' not in update_data or 'to' not in update_data:
                        logger.error(f"Missing 'from' or 'to' field in sprite move update from {client_id}: {update_data}")
                        return Message(MessageType.ERROR, {'error': 'Missing required fields: from, to'})
         
                    await self.actions.move_sprite(table_id=update_data['table_id'],
                                                   sprite_id=update_data['sprite_id'],
                                                   old_position=update_data['from'],
                                                   new_position=update_data['to'])
                case 'sprite_scale':
                    raise NotImplementedError(f"Sprite update type '{type}' not implemented")
                case 'sprite_rotate':
                    raise NotImplementedError(f"Sprite update type '{type}' not implemented")
        
        # Extract character binding updates
        updates = {}
        if 'character_id' in update_data:
            updates['character_id'] = update_data['character_id']
        if 'controlled_by' in update_data:
            if not is_dm(role):
                logger.warning(f"Non-DM user {user_id} tried to change controlled_by — ignored")
            else:
                cb = update_data['controlled_by']
                # Normalize to list of ints for the in-memory entity
                if isinstance(cb, str):
                    try:
                        cb = json.loads(cb)
                    except Exception:
                        cb = []
                updates['controlled_by'] = [int(x) for x in cb if str(x).lstrip('-').isdigit()]
        
        # Extract token stat updates
        if 'hp' in update_data:
            updates['hp'] = update_data['hp']
        if 'max_hp' in update_data:
            updates['max_hp'] = update_data['max_hp']
        if 'ac' in update_data:
            updates['ac'] = update_data['ac']
        if 'aura_radius' in update_data:
            updates['aura_radius'] = update_data['aura_radius']
        if 'aura_color' in update_data:
            updates['aura_color'] = update_data['aura_color']
        if 'aura_radius_units' in update_data:
            updates['aura_radius_units'] = update_data['aura_radius_units']
        # Vision fields (DM-settable per token)
        if 'vision_radius' in update_data and is_dm(role):
            updates['vision_radius'] = update_data['vision_radius']
        if 'has_darkvision' in update_data and is_dm(role):
            val = update_data['has_darkvision']
            updates['has_darkvision'] = val if isinstance(val, bool) else bool(val)
        if 'darkvision_radius' in update_data and is_dm(role):
            updates['darkvision_radius'] = update_data['darkvision_radius']
        if 'vision_radius_units' in update_data and is_dm(role):
            updates['vision_radius_units'] = update_data['vision_radius_units']
        if 'darkvision_radius_units' in update_data and is_dm(role):
            updates['darkvision_radius_units'] = update_data['darkvision_radius_units']
        
        # Apply updates via actions
        if updates:
            session_id = self._get_session_id(msg)
            result = await self.actions.update_sprite(table_id, sprite_id, session_id=session_id, **updates)
            if not result.success:
                return Message(MessageType.ERROR, {'error': f'Failed to update sprite: {result.message}'})

            # Reverse sync: propagate token HP/AC changes back to the linked character
            char_stat_updates = {}
            if 'hp' in updates:
                char_stat_updates['hp'] = updates['hp']
            if 'max_hp' in updates:
                char_stat_updates['maxHp'] = updates['max_hp']
            if 'ac' in updates:
                char_stat_updates['ac'] = updates['ac']

            if char_stat_updates:
                character_id = update_data.get('character_id')
                if not character_id:
                    # Look it up from the DB entity
                    try:
                        from database.models import Entity as DBEntity
                        db = SessionLocal()
                        try:
                            entity_row = db.query(DBEntity).filter_by(id=sprite_id).first()
                            if entity_row:
                                character_id = entity_row.character_id
                        finally:
                            db.close()
                    except Exception as _e:
                        logger.debug(f"Could not look up character_id for sprite {sprite_id}: {_e}")

                if character_id and session_id:
                    # Only DMs bypass ownership; players must own the character
                    char_result = await self.actions.update_character(
                        session_id, character_id,
                        {'data': {'stats': char_stat_updates}},
                        user_id or 0,
                        expected_version=None,
                        bypass_owner_check=is_dm(role)
                    )
                    if char_result.success:
                        await self.broadcast_to_session(
                            Message(MessageType.CHARACTER_UPDATE_RESPONSE, {
                                'character_id': character_id,
                                'updates': {'data': {'stats': char_stat_updates}},
                                'source': 'token_sync'
                            }), client_id
                        )
                    else:
                        logger.warning(f"Token→character sync failed for {character_id}: {char_result.message}")

        # Only broadcast if there were actual field changes
        if updates:
            broadcast_msg = Message(MessageType.SPRITE_UPDATE, {
                'sprite_id': sprite_id,
                'table_id': table_id,
                'updates': updates,
                'operation': 'update'
            })
            await self.broadcast_to_session(broadcast_msg, client_id)
        
        response = Message(MessageType.SUCCESS, {
            'table_id': table_id,
            'sprite_id': sprite_id,
            'message': f'Sprite updated successfully'
        })
        return response

    async def handle_file_request(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'File transfer not implemented yet'})  
    async def handle_compendium_sprite_add(self, msg: Message, client_id: str) -> Message:
        """Create character + sprite from compendium monster data.

        Expected msg.data: {
            'table_id': str,
            'sprite_data': { x, y, layer, name, client_temp_id, ... },
            'monster_data': { name, type, challenge_rating, raw: {...} },  # optional
            'session_code': str (optional),
            'user_id': int (optional)
        }
        """
        logger.debug(f"Compendium sprite add received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite add'})

        table_id = msg.data.get('table_id') or msg.data.get('table_name') or 'default'
        sprite_data = msg.data.get('sprite_data')
        monster_data = msg.data.get('monster_data')
        session_code = msg.data.get('session_code', msg.data.get('session', 'default'))
        user_id = self._get_user_id(msg, client_id) or 0

        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Insufficient permissions'})

        if not sprite_data:
            return Message(MessageType.ERROR, {'error': 'No sprite_data provided for compendium add'})

        layer = sprite_data.get('layer', 'tokens') if isinstance(sprite_data, dict) else 'tokens'
        if layer in _dm_layers and not is_dm(role):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create sprites on this layer'})

        # --- Step 1: resolve monster token asset ---
        asset_id = sprite_data.get('asset_id') or ''
        if monster_data and not asset_id:
            try:
                from core_table.compendiums.token_resolution_service import get_token_service
                token_service = get_token_service()
                monster_name = monster_data.get('name', '')
                monster_type = monster_data.get('type') or monster_data.get('monsterType', '')
                token_info = token_service.get_token_info(monster_name, monster_type)
                if token_info.get('asset_id'):
                    asset_id = token_info['asset_id']
                    logger.info(f"Resolved token for '{monster_name}': {asset_id}")
            except Exception as e:
                logger.warning(f"Token resolution failed: {e}")

        # --- Step 2: create NPC character from monster data ---
        character_id = sprite_data.get('character_id') or ''
        if monster_data and not character_id:
            try:
                session_id = self._get_session_id(msg)
                if session_id:
                    raw = monster_data.get('raw') or {}
                    char_data = {
                        'name': monster_data.get('name', 'Unknown'),
                        'type': 'npc',
                        'monster_type': monster_data.get('type') or monster_data.get('monsterType', ''),
                        'challenge_rating': monster_data.get('challenge_rating', ''),
                        'npc': True,
                        **raw  # merge all raw monster stats into character data
                    }
                    char_result = await self.actions.save_character(session_id, char_data, user_id)
                    if char_result.success:
                        character_id = char_result.data.get('character_id', '')
                        logger.info(f"Created NPC character '{char_data['name']}': {character_id}")
                    else:
                        logger.warning(f"Character creation failed: {char_result.message}")
            except Exception as e:
                logger.warning(f"Character creation error: {e}")

        # --- Step 3: build sprite and create it ---
        sprite_data_with_table = dict(sprite_data)
        sprite_data_with_table['table_id'] = table_id
        if asset_id:
            sprite_data_with_table['asset_id'] = asset_id
        if character_id:
            sprite_data_with_table['character_id'] = str(character_id)

        if is_dm(role):
            sprite_data_with_table['controlled_by'] = json.dumps([])
        elif user_id:
            sprite_data_with_table['controlled_by'] = json.dumps([user_id])

        try:
            result = await self.actions.create_sprite_from_data(sprite_data_with_table)
            if not result.success:
                logger.error(f"Failed to create compendium sprite: {result.message}")
                return Message(MessageType.ERROR, {'error': f'Failed to create sprite: {result.message}'})

            created_sprite = (result.data or {}).get('sprite_data') or sprite_data_with_table

            # Broadcast to all other clients
            broadcast_data = {
                'sprite_id': created_sprite.get('sprite_id', created_sprite.get('entity_id')),
                'table_id': table_id,
                'sprite_data': created_sprite,
                'operation': 'create',
                'client_temp_id': sprite_data.get('client_temp_id')
            }
            await self.broadcast_to_session(Message(MessageType.SPRITE_UPDATE, broadcast_data), client_id)

            return Message(MessageType.SPRITE_RESPONSE, {
                'sprite_id': created_sprite.get('sprite_id', created_sprite.get('entity_id')),
                'table_id': table_id,
                'sprite_data': created_sprite,
                'character_id': character_id or None,
                'client_temp_id': sprite_data.get('client_temp_id'),
                'operation': 'create'
            })

        except Exception as e:
            logger.error(f"Error processing compendium sprite add: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_compendium_sprite_update(self, msg: Message, client_id: str) -> Message:
        # Minimal implementation: delegate to generic sprite update flow where possible
        logger.debug(f"Compendium sprite update received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite update'})
        # For now, reuse existing update methods by wrapping into a table_update if appropriate
        try:
            # If caller provided full sprite data with table_id, use update_sprite
            sprite_data = msg.data.get('sprite_data')
            table_id = msg.data.get('table_id') or sprite_data.get('table_id') if sprite_data else 'default'
            sprite_id = (sprite_data or {}).get('sprite_id')
            if not sprite_id:
                return Message(MessageType.ERROR, {'error': 'sprite_id required for compendium sprite update'})
            result = await self.actions.update_sprite(table_id, sprite_id, data=sprite_data)
            if result.success:
                return Message(MessageType.SUCCESS, {'sprite_id': sprite_id})
            else:
                return Message(MessageType.ERROR, {'error': result.message})
        except Exception as e:
            logger.error(f"Error in compendium sprite update: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_compendium_sprite_remove(self, msg: Message, client_id: str) -> Message:
        logger.debug(f"Compendium sprite remove received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite remove'})
        table_id = msg.data.get('table_id') or 'default'
        sprite_id = msg.data.get('sprite_id')
        if not sprite_id:
            return Message(MessageType.ERROR, {'error': 'sprite_id required to remove compendium sprite'})
        try:
            result = await self.actions.delete_sprite(table_id, sprite_id)
            if result.success:
                # Broadcast sprite deletion to all clients in session
                broadcast_data = {
                    'sprite_id': sprite_id,
                    'table_id': table_id,
                    'operation': 'delete'
                }
                await self.broadcast_to_session(Message(MessageType.SPRITE_UPDATE, broadcast_data), client_id)
                
                return Message(MessageType.SPRITE_RESPONSE, {'sprite_id': sprite_id, 'operation': 'delete', 'success': True})
            else:
                return Message(MessageType.ERROR, {'error': result.message})
        except Exception as e:
            logger.error(f"Error removing compendium sprite: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
  
    # R2 Asset Management Handlers
    
    async def handle_asset_upload_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset upload request - generate presigned PUT URL with xxHash support"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset upload request'})
            
            # Get asset manager and client info
            asset_manager = get_server_asset_manager()
            
            # Extract request data - including xxHash
            filename = msg.data.get('filename')
            file_size = msg.data.get('file_size')
            content_type = msg.data.get('content_type')
            session_code = msg.data.get('session_code', 'default')
            user_id = self._get_user_id(msg, client_id) or 0
            username = msg.data.get('username', 'unknown')
            asset_id = msg.data.get('asset_id')  # Client-generated based on xxHash
            file_xxhash = msg.data.get('xxhash')  # xxHash from client
            
            if not filename or not file_xxhash:
                return Message(MessageType.ERROR, {'error': 'Filename and xxHash are required'})
            
            # Create asset request with xxHash
            request = AssetRequest(
                user_id=user_id,
                username=username,
                session_code=session_code,
                asset_id=asset_id,
                filename=filename,
                file_size=file_size,
                content_type=content_type,
                file_xxhash=file_xxhash
            )
            
            # Generate presigned URL with xxHash
            response = await asset_manager.request_upload_url_with_hash(request, file_xxhash)
            
            if response.success:
                return Message(MessageType.ASSET_UPLOAD_RESPONSE, {
                    'success': True,
                    'upload_url': response.url,
                    'asset_id': response.asset_id,
                    'expires_in': response.expires_in,
                    'instructions': response.instructions,
                    'required_xxhash': response.required_xxhash
                })
            else:
                return Message(MessageType.ASSET_UPLOAD_RESPONSE, {
                    'success': False,
                    'error': response.error,
                    'asset_id': response.asset_id,
                    'instructions': response.instructions
                })
                
        except Exception as e:
            logger.error(f"Error handling asset upload request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_asset_download_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset download request - generate presigned GET URL with xxHash info"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset download request'})
            
            # Get asset manager
            asset_manager = get_server_asset_manager()
            
            # Extract request data
            asset_id = msg.data.get('asset_id')
            session_code = msg.data.get('session_code', 'default')
            user_id = self._get_user_id(msg, client_id) or 0
            username = msg.data.get('username', 'unknown')
            
            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'Asset ID is required'})
            
            # Create asset request
            request = AssetRequest(
                user_id=user_id,
                username=username,
                session_code=session_code,
                asset_id=asset_id
            )
            
            # Generate presigned URL
            response = await asset_manager.request_download_url(request)
            
            if response.success:
                # Get asset xxHash from database
                asset_xxhash = await self._get_asset_xxhash(asset_id)
                
                return Message(MessageType.ASSET_DOWNLOAD_RESPONSE, {
                    'success': True,
                    'download_url': response.url,
                    'asset_id': response.asset_id,
                    'expires_in': response.expires_in,
                    'xxhash': asset_xxhash,  # Include xxHash for verification
                    'instructions': response.instructions
                })
            else:
                return Message(MessageType.ASSET_DOWNLOAD_RESPONSE, {
                    'success': False,
                    'instructions': "Please upload the asset first"
                })
                
        except Exception as e:
            logger.error(f"Error handling asset download request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_asset_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset list request - return list of assets in R2"""
        logger.debug(f"Handling asset list request from {client_id}: {msg}")
        try:
            # For now, return empty list - this can be implemented later
            return Message(MessageType.ASSET_LIST_RESPONSE, {
                'assets': [],
                'count': 0,
                'message': 'Asset listing not fully implemented yet'
            })
        except Exception as e:
            logger.error(f"Error handling asset list request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_asset_upload_confirm(self, msg: Message, client_id: str) -> Message:
        """Handle asset upload confirmation - verify and update database"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in asset upload confirmation'})
            
            # Extract data
            asset_id = msg.data.get('asset_id')
            upload_success = msg.data.get('success', True)
            error_message = msg.data.get('error')
            user_id = self._get_user_id(msg, client_id) or 0
            username = msg.data.get('username', 'unknown')
            
            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'Asset ID is required'})
            
            logger.info(f"Processing upload confirmation for asset {asset_id}: {'success' if upload_success else 'failed'}")
            
            # Get asset manager and confirm upload
            from .asset_manager import get_server_asset_manager
            asset_manager = get_server_asset_manager()
            
            confirmed = await asset_manager.confirm_upload(
                asset_id=asset_id,
                user_id=user_id,
                upload_success=upload_success,
                error_message=error_message
            )
            
            if confirmed:
                status_msg = "Upload confirmed successfully" if upload_success else f"Upload failure recorded: {error_message}"
                logger.info(f"Asset {asset_id} confirmation completed: {status_msg}")
                return Message(MessageType.SUCCESS, {
                    'message': status_msg,
                    'asset_id': asset_id,
                    'status': 'uploaded' if upload_success else 'failed'
                })
            else:
                error_msg = f"Failed to confirm upload for asset {asset_id}"
                logger.error(error_msg)
                return Message(MessageType.ERROR, {'error': error_msg})
                
        except Exception as e:
            error_msg = f"Error processing upload confirmation: {e}"
            logger.error(error_msg)
            return Message(MessageType.ERROR, {'error': error_msg})

    async def add_asset_hashes_to_table(self, table_data: dict, session_code: str, user_id: int) -> dict:    
        """Add xxHash information to all entity assets in table data"""
        try:
            # Get all layers data
            layers = table_data.get('layers', {})
            
            # Process each layer
            for layer_name, layer_entities in layers.items():
                if not isinstance(layer_entities, dict):
                    continue
                    
                # Process each entity in the layer
                for entity_id, entity_data in layer_entities.items():
                    if not isinstance(entity_data, dict):
                        continue
                    
                    texture_path = entity_data.get('texture_path')
                    if not texture_path:
                        continue
                    
                    logger.debug(f"Processing asset for entity {entity_id}: {texture_path}")
                    # Calculate or get xxHash for the asset
                    asset_xxhash = await self._get_asset_xxhash_by_path(texture_path)
                    logger.debug(f"xxHash for {texture_path}: {asset_xxhash}")
                    if asset_xxhash:
                        entity_data['asset_xxhash'] = asset_xxhash
                        # Generate asset_id from xxHash (same as client logic)
                        entity_data['asset_id'] = asset_xxhash[:16]
                        logger.debug(f"Added xxHash {asset_xxhash} to entity {entity_id}")
                    else:
                        logger.warning(f"Could not get xxHash for asset: {texture_path}")
            
            return table_data            
        except Exception as e:
            logger.error(f"Error adding asset hashes to table: {e}")
            return table_data

    async def _get_asset_xxhash(self, asset_id: str) -> Optional[str]:
            """Get xxHash for asset by asset_id"""
            try:
                db_session = SessionLocal()
                try:
                    asset = db_session.query(Asset).filter_by(r2_asset_id=asset_id).first()
                    val = getattr(asset, 'xxhash', None) if asset is not None else None
                    if isinstance(val, str) and val:
                        return val
                    return None
                finally:
                    db_session.close()
            except Exception as e:
                logger.error(f"Error getting asset xxHash for {asset_id}: {e}")
                return None
    
    
    async def _get_asset_xxhash_by_path(self, texture_path: str) -> Optional[str]:
        """Get xxHash for asset by texture path"""
        
        # If it's a local file, calculate xxHash
        logger.debug(f"Getting xxHash for texture path: {texture_path}")            
        file_path = None
        calculated_hash = None
        
        if os.path.exists(texture_path):
            file_path = texture_path
        #TODO: remove hardcoded path
        elif os.path.exists(''.join(['res/', texture_path.split('/')[-1]])):
            file_path = ''.join(['res/', texture_path.split('/')[-1]])
        
        if file_path:
            calculated_hash = self._calculate_file_xxhash(file_path)
            logger.debug(f"Calculated xxHash for {file_path}: {calculated_hash}")

        # Update db or try to find in database
        asset_name = os.path.basename(texture_path)
        asset_type = os.path.splitext(asset_name)[1].lower()  # Get file extension
        db_session = SessionLocal()
        try:
            if file_path and calculated_hash:
                # Check if asset already exists in database
                asset = db_session.query(Asset).filter_by(asset_name=asset_name).first()
                if asset:
                    try:
                        setattr(asset, 'xxhash', calculated_hash)
                    except Exception:
                        # Best effort: some SQLAlchemy models may use Column descriptors; ignore failures
                        pass
                    logger.debug(f"Updated existing asset {asset_name} with xxHash: {calculated_hash}")
                else:
                    # Use content-based asset_id (first 16 chars of xxhash)
                    asset_id = calculated_hash[:16]
                    new_asset = Asset(
                        asset_name=asset_name,
                        r2_asset_id=asset_id,  # Content-based, consistent with client                        
                        content_type=asset_type,  
                        file_size=os.path.getsize(file_path),
                        xxhash=calculated_hash,
                        uploaded_by=1,  
                        r2_key=f"local/{asset_name}",  
                        r2_bucket="local"  
                    )                    
                    db_session.add(new_asset)
                    logger.debug(f"Created new asset entry for {asset_name} with xxHash: {calculated_hash}")
                db_session.commit()
                return calculated_hash
            else:
                asset = db_session.query(Asset).filter_by(asset_name=asset_name).first()
                val = getattr(asset, 'xxhash', None) if asset is not None else None
                if isinstance(val, str) and val:
                    return val
                return None
        except Exception as e:
            logger.error(f"Error calculating xxHash for {texture_path}: {e}")
            db_session.rollback()
            return calculated_hash
        finally:
            db_session.close()

    
    def _calculate_file_xxhash(self, file_path: str) -> str:
        """Calculate xxHash for a file"""
        try:
            hasher = xxhash.xxh64()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating xxHash for {file_path}: {e}")
            return ""
        
    async def handle_asset_delete_request(self, msg: Message, client_id: str) -> Message:
        """Handle asset deletion request"""
        try:
            # Asset deletion not implemented yet - future feature
            return Message(MessageType.ERROR, {'error': 'Asset deletion not implemented yet'})
            
        except Exception as e:
            logger.error(f"Error handling asset delete request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def send_to_client(self, message: Message, client_id: str):
        """Send message to specific client"""
        # Overload this method in server implementation to use choosed transport
        raise NotImplementedError("Subclasses must implement send_to_client method")      
    
    async def broadcast_to_session(self, message: Message, client_id: str):
        """Send message to all clients in the session"""
        if self.session_manager and hasattr(self.session_manager, 'broadcast_to_session'):
            await self.session_manager.broadcast_to_session(message, exclude_client=client_id)
        else:
            for client in self.clients:
                if client != client_id:
                    await self.send_to_client(message, client)

    async def broadcast_filtered(self, message: Message, layer: str, client_id: str):
        """Broadcast only to clients who can see the given layer."""
        if self.session_manager and hasattr(self.session_manager, 'broadcast_filtered'):
            await self.session_manager.broadcast_filtered(message, layer, exclude_client=client_id)
        else:
            await self.broadcast_to_session(message, client_id)

    async def _broadcast_error(self, client_id: str, error_message: str):
        """Send error message to specific client"""
        if client_id in self.clients:
            error_msg = Message(MessageType.ERROR, {'error': error_message})
            await self.send_to_client(error_msg, self.clients[client_id])
    
    async def ensure_assets_in_r2(self, table_data: dict, session_code: str, user_id: int) -> dict:    
        """Ensure all entity assets are available in R2 and provide download URLs"""
        try:
            asset_manager = get_server_asset_manager()
            
            # Get all layers data
            layers = table_data.get('layers', {})
            
            # Process each layer
            for layer_name, layer_entities in layers.items():
                if not isinstance(layer_entities, dict):
                    continue
                    
                # Process each entity in the layer
                for entity_id, entity_data in layer_entities.items():
                    if not isinstance(entity_data, dict):
                        continue
                                       
                    if hasattr(entity_data, 'r2_asset_url'):
                        continue
                    texture_path = entity_data.get('texture_path')   
                
                    # Convert local path to asset name
                    if not texture_path:
                        logger.warning(f"No texture_path for entity {entity_id}, skipping asset processing.")
                        continue
                    asset_name = os.path.basename(texture_path)
                    logger.debug(f"Processing asset for entity {entity_id}: {asset_name}")
                    
                    # Check if asset exists in database
                    r2_url = await self._get_or_upload_asset(asset_name, texture_path, session_code, user_id)
                    
                    if r2_url:                      
                        
                        entity_data['r2_asset_url'] = r2_url  
                        logger.info(f"Updated entity {entity_id} with R2 URL: {r2_url}")
                    else:
                        logger.warning(f"Failed to get R2 URL for asset: {asset_name}")
            
            return table_data            
        except Exception as e:
            logger.error(f"Error ensuring assets in R2: {e}")
            return table_data  # Return original data if asset processing fails
    
    async def _get_or_upload_asset(self, asset_name: str, local_path: str, session_code: str, user_id: int) -> Optional[str]:
        """Get existing R2 URL or upload asset and return R2 URL"""
        try:
            # Check if asset already exists in database
            db_session = SessionLocal()
            try:
                existing_asset = db_session.query(Asset).filter_by(asset_name=asset_name).first()
                
                if existing_asset:
                    # Asset exists, generate download URL
                    logger.debug(f"Asset {asset_name} exists in database with R2 ID: {existing_asset.r2_asset_id}")
                    
                    asset_manager = get_server_asset_manager()
                    request = AssetRequest(
                        user_id=user_id,
                        username="server",
                        session_code=session_code,
                        asset_id=str(existing_asset.r2_asset_id)
                    )
                    
                    response = await asset_manager.request_download_url(request)
                    if response.success:
                        logger.info(f"Generated download URL for existing asset: {asset_name}")
                        return response.url
                    else:
                        logger.error(f"Failed to generate download URL for existing asset {asset_name}: {response.error}")
                        return None
                  # Asset doesn't exist - let the normal asset upload flow handle this
                logger.info(f"Asset {asset_name} not found in database, will be uploaded via normal client flow")
                # Return None so the client knows to upload this asset through the normal flow
                return None
                
            finally:
                db_session.close()                
        except Exception as e:
            logger.error(f"Error getting or uploading asset {asset_name}: {e}")
            return None

    def _get_session_code(self, msg: Message) -> Optional[str]:
        """Get session_code string from session manager or message data"""
        try:
            # Primary method: Get from session manager (most reliable)
            if self.session_manager and hasattr(self.session_manager, 'session_code'):
                return self.session_manager.session_code
            
            # Secondary method: Extract from message data
            if msg.data:
                return msg.data.get('session_code')
            
            logger.error("No valid session_code available")
            return None
        except Exception as e:
            logger.error(f"Error getting session_code: {e}")
            return None

    def _get_session_id(self, msg: Message) -> Optional[int]:
        """Get session_id for database persistence from message data or session manager"""
        try:
            # Primary method: Get from session manager (most reliable)
            logger.debug(f"DEBUG _get_session_id: session_manager={self.session_manager}")
            if self.session_manager:
                logger.debug(f"DEBUG _get_session_id: has game_session_db_id attr={hasattr(self.session_manager, 'game_session_db_id')}")
                if hasattr(self.session_manager, 'game_session_db_id'):
                    logger.debug(f"DEBUG _get_session_id: game_session_db_id={self.session_manager.game_session_db_id}")
                    if self.session_manager.game_session_db_id:
                        logger.info(f"Using session_id from session_manager: {self.session_manager.game_session_db_id}")
                        return self.session_manager.game_session_db_id
            
            # Secondary method: Extract from message data
            if msg.data:
                session_code = msg.data.get('session_code')
                if session_code:
                    # Convert session_code to session_id by looking it up in database
                    db_session = SessionLocal()
                    try:
                        game_session = db_session.query(GameSession).filter_by(session_code=session_code).first()
                        if game_session:
                            session_id = getattr(game_session, 'id')  # Safely get the id attribute
                            return session_id if session_id is not None else None
                        else:
                            logger.error(f"No game session found for session_code: {session_code}")
                            return None
                    finally:
                        db_session.close()
            
            # No valid session_id found - this is an error condition
            logger.error("No valid session_id available for persistence - request missing session context")
            return None
        except Exception as e:
            logger.error(f"Error getting session_id: {e}")
            return None
    
    def _get_user_id(self, msg: Message, client_id: Optional[str] = None) -> Optional[int]:
        """Return the authenticated user_id for the sending client.

        We intentionally read from server-side client_info (populated at
        WebSocket authentication time) rather than from msg.data so that
        a malicious client cannot impersonate another user by sending a
        fake user_id in the message payload.
        """
        # Prefer authoritative connection metadata
        if client_id is not None:
            uid = self._get_client_info(client_id).get('user_id')
            if uid is not None:
                return int(uid)
        # Fallback for call-sites that still pass msg only (legacy)
        if msg.data:
            uid = msg.data.get('user_id')
            if uid is not None:
                return int(uid)
        return None
    
    async def _can_control_sprite(self, sprite_id: str, user_id: Optional[int]) -> bool:
        """Check if user can control (move/resize/rotate) a sprite.

        Authoritative check order:
        1. If user_id is unknown (unauthenticated), deny immediately.
        2. Check the in-memory VirtualTable entity first — it is always
           up-to-date, even for sprites just created before the first DB flush.
        3. Fall back to the DB entity record.
        The function fails *closed*: any exception → deny.
        """
        if user_id is None:
            logger.warning(f'_can_control_sprite: no user_id for sprite {sprite_id} — denying')
            return False

        try:
            # ── 1. In-memory check (covers freshly created sprites) ──────────
            for table in (self.table_manager.tables.values()
                          if hasattr(self.table_manager, 'tables') else []):
                entity = table.find_entity_by_sprite_id(sprite_id)
                if entity is not None:
                    cb = entity.controlled_by
                    # Normalise: may be a JSON string if entity was updated via server_protocol
                    if isinstance(cb, str):
                        try:
                            cb = json.loads(cb)
                        except Exception:
                            cb = []
                    # controlled_by == [] means DM-only
                    if not cb:
                        return False
                    # Compare as ints to handle any str/int mismatch
                    if any(int(x) == user_id for x in cb if str(x).lstrip('-').isdigit()):
                        return True
                    # Entity exists in memory but user is not in controlled_by
                    return False

            # ── 2. DB fallback (for tables not in memory, e.g. persistence queries) ─
            if hasattr(self.table_manager, 'db_session') and self.table_manager.db_session:
                from database import crud
                entity_db = crud.get_entity_by_sprite_id(self.table_manager.db_session, sprite_id)
                if entity_db is None:
                    # Sprite unknown to DB — deny
                    return False

                # controlled_by stored as JSON string in DB
                try:
                    controlled_by = json.loads(entity_db.controlled_by or '[]')
                except Exception:
                    controlled_by = []

                if not controlled_by:
                    # Empty list → DM-only sprite
                    return False
                if user_id in controlled_by:
                    return True
                if any(int(x) == user_id for x in controlled_by if str(x).lstrip('-').isdigit()):
                    return True

                # Check character ownership if sprite is linked to a character
                if entity_db.character_id:
                    from database.models import SessionCharacter
                    character = self.table_manager.db_session.query(SessionCharacter).filter_by(
                        character_id=entity_db.character_id
                    ).first()
                    if character:
                        if character.owner_user_id == user_id:
                            return True
                        try:
                            char_cb = json.loads(character.controlled_by or '[]')
                            if user_id in char_cb:
                                return True
                        except Exception:
                            pass

                return False

            # No DB and sprite not found in memory → deny
            return False

        except Exception as e:
            logger.error(f'_can_control_sprite: unexpected error for sprite {sprite_id}, user {user_id}: {e}')
            return False  # Fail closed

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
                from database.models import Entity as DBEntity, VirtualTable as DBVirtualTable
                
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

    # Player Management Handlers
    
    async def handle_player_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle player list request"""
        logger.debug(f"Player list request received from {client_id}: {msg}")
        
        try:
            # Get session_code from message data
            session_code = msg.data.get('session_code') if msg.data else None
            
            # Get player list from session manager (this will be set by GameSessionProtocolService)
            if hasattr(self, 'session_manager') and self.session_manager:
                # GameSessionProtocolService.get_session_players() doesn't need session_code parameter
                # because it already knows which session it's managing
                players = self.session_manager.get_session_players()
                return Message(MessageType.PLAYER_LIST_RESPONSE, {
                    'players': players,
                    'count': len(players),
                    'session_code': session_code
                })
            else:
                # Fallback - return empty list if no session manager
                return Message(MessageType.PLAYER_LIST_RESPONSE, {
                    'players': [],
                    'count': 0,
                    'session_code': session_code,
                    'error': 'Session manager not available'
                })
        except Exception as e:
            logger.error(f"Error handling player list request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to get player list'})

    async def handle_player_kick_request(self, msg: Message, client_id: str) -> Message:
        """Handle player kick request"""
        logger.debug(f"Player kick request received from {client_id}: {msg}")
        
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in kick request'})
            
            target_player_id = msg.data.get('player_id')
            target_username = msg.data.get('username')
            reason = msg.data.get('reason', 'No reason provided')
            session_code = msg.data.get('session_code')
            
            if not target_player_id and not target_username:
                return Message(MessageType.ERROR, {'error': 'Player ID or username is required'})
            
            # Check if requesting client has kick permissions
            requesting_client_info = self._get_client_info(client_id)
            if not self._has_kick_permission(requesting_client_info):
                return Message(MessageType.ERROR, {'error': 'Insufficient permissions to kick players'})
            
            # Perform kick through session manager
            if hasattr(self, 'session_manager') and self.session_manager:
                success = await self.session_manager.kick_player(
                    session_code, target_player_id, target_username, reason, client_id
                )
                
                if success:
                    return Message(MessageType.PLAYER_KICK_RESPONSE, {
                        'success': True,
                        'kicked_player': target_username or target_player_id,
                        'reason': reason,
                        'kicked_by': requesting_client_info.get('username', 'unknown')
                    })
                else:
                    return Message(MessageType.ERROR, {'error': 'Failed to kick player'})
            else:
                return Message(MessageType.ERROR, {'error': 'Session manager not available'})
                
        except Exception as e:
            logger.error(f"Error handling player kick request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to kick player'})

    async def handle_player_ban_request(self, msg: Message, client_id: str) -> Message:
        """Handle player ban request"""
        logger.debug(f"Player ban request received from {client_id}: {msg}")
        
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided in ban request'})
            
            target_player_id = msg.data.get('player_id')
            target_username = msg.data.get('username')
            reason = msg.data.get('reason', 'No reason provided')
            session_code = msg.data.get('session_code')
            duration = msg.data.get('duration', 'permanent')  # Duration in minutes or 'permanent'
            
            if not target_player_id and not target_username:
                return Message(MessageType.ERROR, {'error': 'Player ID or username is required'})
            
            # Check if requesting client has ban permissions
            requesting_client_info = self._get_client_info(client_id)
            if not self._has_ban_permission(requesting_client_info):
                return Message(MessageType.ERROR, {'error': 'Insufficient permissions to ban players'})
            
            # Perform ban through session manager
            if hasattr(self, 'session_manager') and self.session_manager:
                success = await self.session_manager.ban_player(
                    session_code, target_player_id, target_username, reason, duration, client_id
                )
                
                if success:
                    return Message(MessageType.PLAYER_BAN_RESPONSE, {
                        'success': True,
                        'banned_player': target_username or target_player_id,
                        'reason': reason,
                        'duration': duration,
                        'banned_by': requesting_client_info.get('username', 'unknown')
                    })
                else:
                    return Message(MessageType.ERROR, {'error': 'Failed to ban player'})
            else:
                return Message(MessageType.ERROR, {'error': 'Session manager not available'})
                
        except Exception as e:
            logger.error(f"Error handling player ban request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to ban player'})

    async def handle_connection_status_request(self, msg: Message, client_id: str) -> Message:
        """Handle connection status request"""
        logger.debug(f"Connection status request received from {client_id}: {msg}")
        
        try:
            session_code = msg.data.get('session_code') if msg.data else None
            
            # Get connection status from session manager
            if hasattr(self, 'session_manager') and self.session_manager:
                status = self.session_manager.get_connection_status(session_code, client_id)
                return Message(MessageType.CONNECTION_STATUS_RESPONSE, {
                    'connected': True,
                    'session_code': session_code,
                    'client_id': client_id,
                    'status': status
                })
            else:
                return Message(MessageType.CONNECTION_STATUS_RESPONSE, {
                    'connected': False,
                    'session_code': session_code,
                    'client_id': client_id,
                    'error': 'Session manager not available'
                })
                
        except Exception as e:
            logger.error(f"Error handling connection status request: {e}")
            return Message(MessageType.ERROR, {'error': 'Failed to get connection status'})

    def _get_client_info(self, client_id: str) -> dict:
        """Get client info dict from session manager."""
        if self.session_manager and hasattr(self.session_manager, 'client_info'):
            return self.session_manager.client_info.get(client_id, {})
        return {}

    def _get_client_role(self, client_id: str) -> str:
        """Get the RBAC role for a connected client."""
        return self._get_client_info(client_id).get('role', 'player')

    def _has_kick_permission(self, client_info: dict) -> bool:
        return is_dm(client_info.get('role', 'player'))

    def _has_ban_permission(self, client_info: dict) -> bool:
        return is_dm(client_info.get('role', 'player'))

    # =========================================================================
    # CHARACTER MANAGEMENT HANDLERS
    # =========================================================================
    
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

        # D&D 5e XP thresholds for level-up detection TODO: take it from compendium
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

    # =========================================================================
    # MISSING MESSAGE HANDLERS IMPLEMENTATION
    # =========================================================================
    
    async def handle_test(self, msg: Message, client_id: str) -> Message:
        """Handle test message - echo back with server info"""
        return Message(MessageType.SUCCESS, {
            'message': 'Test message received',
            'server_time': time.time(),
            'echo_data': msg.data
        })
    
    # Authentication handlers
    async def handle_auth_register(self, msg: Message, client_id: str) -> Message:
        """Handle user registration request"""
        # TODO: Implement proper authentication
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Authentication not implemented yet'
        })
    
    async def handle_auth_login(self, msg: Message, client_id: str) -> Message:
        """Handle user login request"""
        # TODO: Implement proper authentication
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Authentication not implemented yet'
        })
    
    async def handle_auth_logout(self, msg: Message, client_id: str) -> Message:
        """Handle user logout request"""
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Logged out successfully'
        })
    
    async def handle_auth_token(self, msg: Message, client_id: str) -> Message:
        """Handle authentication token validation"""
        # TODO: Implement proper token validation
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Token validation not implemented yet'
        })
    
    async def handle_auth_status(self, msg: Message, client_id: str) -> Message:
        """Handle authentication status request"""
        return Message(MessageType.AUTH_STATUS, {
            'authenticated': False,
            'message': 'Not authenticated'
        })
    
    # Table manipulation handlers
    async def handle_table_scale(self, msg: Message, client_id: str) -> Message:
        """Handle table scale change"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
                
            table_id = msg.data.get('table_id')
            scale = msg.data.get('scale')
            session_id = self._get_session_id(msg)
            
            if not table_id or scale is None:
                return Message(MessageType.ERROR, {'error': 'table_id and scale are required'})
            
            # For now, just broadcast the update since ActionsCore doesn't have update_table_scale
            # TODO: Implement proper table scale update in ActionsCore
            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': table_id,
                'scale': scale,
                'type': 'scale_update'
            }), client_id)
            
            return Message(MessageType.SUCCESS, {'message': 'Table scale updated'})
                
        except Exception as e:
            logger.error(f"Error handling table scale: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_table_move(self, msg: Message, client_id: str) -> Message:
        """Handle table position change"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
                
            table_id = msg.data.get('table_id')
            x_moved = msg.data.get('x_moved')
            y_moved = msg.data.get('y_moved')
            session_id = self._get_session_id(msg)
            
            if not table_id or x_moved is None or y_moved is None:
                return Message(MessageType.ERROR, {'error': 'table_id, x_moved, and y_moved are required'})
            
            # For now, just broadcast the update since ActionsCore doesn't have update_table_position  
            # TODO: Implement proper table position update in ActionsCore
            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': table_id,
                'x_moved': x_moved,
                'y_moved': y_moved,
                'type': 'position_update'
            }), client_id)
            
            return Message(MessageType.SUCCESS, {'message': 'Table position updated'})
                
        except Exception as e:
            logger.error(f"Error handling table move: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    # Player action handlers
    async def handle_player_action(self, msg: Message, client_id: str) -> Message:
        """Handle generic player action"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
                
            action_type = msg.data.get('action_type')
            action_data = msg.data.get('action_data', {})
            
            # Broadcast player action to other clients
            await self.broadcast_to_session(Message(MessageType.PLAYER_ACTION_UPDATE, {
                'client_id': client_id,
                'action_type': action_type,
                'action_data': action_data,
                'timestamp': time.time()
            }), client_id)
            
            return Message(MessageType.PLAYER_ACTION_RESPONSE, {
                'success': True,
                'action_type': action_type
            })
            
        except Exception as e:
            logger.error(f"Error handling player action: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_player_ready(self, msg: Message, client_id: str) -> Message:
        """Handle player ready status"""
        try:
            # Update player ready status
            if client_id not in self.clients:
                self.clients[client_id] = {}
            
            self.clients[client_id]['ready'] = True
            self.clients[client_id]['last_action'] = time.time()
            
            # Broadcast to other clients
            await self.broadcast_to_session(Message(MessageType.PLAYER_STATUS, {
                'client_id': client_id,
                'status': 'ready',
                'timestamp': time.time()
            }), client_id)
            
            return Message(MessageType.SUCCESS, {'message': 'Player marked as ready'})
            
        except Exception as e:
            logger.error(f"Error handling player ready: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_player_unready(self, msg: Message, client_id: str) -> Message:
        """Handle player unready status"""
        try:
            # Update player ready status
            if client_id not in self.clients:
                self.clients[client_id] = {}
            
            self.clients[client_id]['ready'] = False
            self.clients[client_id]['last_action'] = time.time()
            
            # Broadcast to other clients
            await self.broadcast_to_session(Message(MessageType.PLAYER_STATUS, {
                'client_id': client_id,
                'status': 'unready',
                'timestamp': time.time()
            }), client_id)
            
            return Message(MessageType.SUCCESS, {'message': 'Player marked as unready'})
            
        except Exception as e:
            logger.error(f"Error handling player unready: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_player_status(self, msg: Message, client_id: str) -> Message:
        """Handle player status request"""
        try:
            if not msg.data:
                target_client = client_id
            else:
                target_client = msg.data.get('client_id', client_id)
            
            if target_client in self.clients:
                status = self.clients[target_client]
                return Message(MessageType.PLAYER_STATUS, {
                    'client_id': target_client,
                    'status': status
                })
            else:
                return Message(MessageType.ERROR, {'error': 'Client not found'})
                
        except Exception as e:
            logger.error(f"Error handling player status: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    # Sprite data handlers
    async def handle_sprite_request(self, msg: Message, client_id: str) -> Message:
        """Handle sprite data request"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
                
            sprite_id = msg.data.get('sprite_id')
            table_id = msg.data.get('table_id')
            
            if not sprite_id or not table_id:
                return Message(MessageType.ERROR, {'error': 'sprite_id and table_id are required'})
            
            # Get sprite data from table manager
            table_data = self.table_manager.get_table(table_id)
            if not table_data:
                return Message(MessageType.ERROR, {'error': 'Table not found'})
            
            # Find sprite in table layers
            sprite_data = None
            for layer_sprites in table_data.layers.values():
                for sprite in layer_sprites:
                    if sprite.sprite_id == sprite_id:
                        sprite_data = sprite.to_dict()
                        break
                if sprite_data:
                    break
            
            if sprite_data:
                return Message(MessageType.SPRITE_DATA, {
                    'sprite_id': sprite_id,
                    'table_id': table_id,
                    'sprite_data': sprite_data
                })
            else:
                return Message(MessageType.ERROR, {'error': 'Sprite not found'})
                
        except Exception as e:
            logger.error(f"Error handling sprite request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    # File transfer handlers
    async def handle_file_data(self, msg: Message, client_id: str) -> Message:
        """Handle file data transfer"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
                
            file_id = msg.data.get('file_id')
            chunk_data = msg.data.get('chunk_data')
            chunk_index = msg.data.get('chunk_index', 0)
            total_chunks = msg.data.get('total_chunks', 1)
            
            if not file_id or not chunk_data:
                return Message(MessageType.ERROR, {'error': 'file_id and chunk_data are required'})
            
            # TODO: Implement file chunk handling and storage
            logger.info(f"Received file chunk {chunk_index + 1}/{total_chunks} for file {file_id}")
            
            # For now, just acknowledge receipt
            return Message(MessageType.SUCCESS, {
                'message': f'File chunk {chunk_index + 1}/{total_chunks} received',
                'file_id': file_id
            })
            
        except Exception as e:
            logger.error(f"Error handling file data: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    # Asset hash check handler
    async def handle_asset_hash_check(self, msg: Message, client_id: str) -> Message:
        """Handle asset hash verification request"""
        try:
            if not msg.data:
                return Message(MessageType.ERROR, {'error': 'No data provided'})
                
            asset_id = msg.data.get('asset_id')
            client_hash = msg.data.get('hash')
            
            if not asset_id or not client_hash:
                return Message(MessageType.ERROR, {'error': 'asset_id and hash are required'})
            
            # Get server hash for asset
            server_hash = await self._get_asset_xxhash(asset_id)
            
            if server_hash:
                hash_match = server_hash == client_hash
                return Message(MessageType.ASSET_HASH_CHECK, {
                    'asset_id': asset_id,
                    'hash_match': hash_match,
                    'server_hash': server_hash,
                    'client_hash': client_hash
                })
            else:
                return Message(MessageType.ERROR, {'error': 'Asset not found or hash unavailable'})
                
        except Exception as e:
            logger.error(f"Error handling asset hash check: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    # Active table persistence handlers
    async def handle_table_active_request(self, msg: Message, client_id: str) -> Message:
        """Handle request for user's active table"""
        try:
            user_id = self._get_user_id(msg, client_id)
            session_code = self._get_session_code(msg)
            
            logger.info(f"Active table request from user {user_id} in session {session_code}")
            
            if not user_id or not session_code:
                logger.warning("Missing user_id or session_code for table active request")
                return Message(MessageType.TABLE_ACTIVE_RESPONSE, {
                    'table_id': None,
                    'success': False,
                    'error': 'Missing user_id or session_code'
                })
            
            # Get the user's active table from database
            active_table_id = await self._get_player_active_table(user_id, session_code)
            
            logger.info(f"Retrieved active table for user {user_id}: {active_table_id}")
            
            return Message(MessageType.TABLE_ACTIVE_RESPONSE, {
                'table_id': active_table_id,
                'success': active_table_id is not None
            })
            
        except Exception as e:
            logger.error(f"Error handling table active request: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})
    
    async def handle_table_active_set(self, msg: Message, client_id: str) -> Message:
        """Handle setting user's active table"""
        try:
            user_id = self._get_user_id(msg, client_id)
            session_code = self._get_session_code(msg)
            table_id = msg.data.get('table_id') if msg.data else None
            
            logger.info(f"Active table set request from user {user_id} in session {session_code} to table {table_id}")
            
            if not user_id or not session_code:
                logger.warning("Missing user_id or session_code for table active set")
                return Message(MessageType.ERROR, {'error': 'Missing user_id or session_code'})
            
            # Update the user's active table in database
            success = await self._set_player_active_table(user_id, session_code, table_id)
            
            if success:
                logger.info(f"Successfully updated active table for user {user_id} to {table_id}")
                return Message(MessageType.SUCCESS, {'message': 'Active table updated'})
            else:
                logger.error(f"Failed to update active table for user {user_id} to {table_id}")
                return Message(MessageType.ERROR, {'error': 'Failed to update active table'})
                
        except Exception as e:
            logger.error(f"Error handling table active set: {e}")
            return Message(MessageType.ERROR, {'error': 'Internal server error'})

    async def handle_table_active_set_all(self, msg: Message, client_id: str) -> Message:
        """DM-only: switch every connected player to a specific table."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can set the active table for all players'})
        table_id = msg.data.get('table_id') if msg.data else None
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id required'})

        # Validate table exists
        known = getattr(self.table_manager, 'tables_id', {})
        if known and str(table_id) not in known:
            return Message(MessageType.ERROR, {'error': f'Table {table_id} not found'})

        session_code = self._get_session_code(msg)

        table_obj = known.get(str(table_id))
        table_name = getattr(table_obj, 'display_name', str(table_id))

        # Broadcast before DB writes so clients switch immediately
        await self.broadcast_to_session(
            Message(MessageType.TABLE_ACTIVE_SET_ALL_RESPONSE, {'table_id': table_id, 'table_name': table_name}),
            client_id
        )

        # Persist active table for every connected non-DM player
        if session_code and self.session_manager and hasattr(self.session_manager, 'client_info'):
            for cid, info in self.session_manager.client_info.items():
                if is_dm(info.get('role', 'player')):
                    continue
                uid = info.get('user_id')
                if uid:
                    await self._set_player_active_table(int(uid), session_code, str(table_id))

        logger.info(f"DM {client_id} switched all players to table {table_id}")
        return Message(MessageType.SUCCESS, {'message': f'All players switched to table {table_id}'})

    async def _get_player_active_table(self, user_id: int, session_code: str) -> Optional[str]:
        """Get player's active table ID from database"""
        try:
            logger.debug(f"Looking up active table for user {user_id} in session {session_code}")
            db_session = SessionLocal()
            try:
                # Find the GamePlayer for this user in this session
                player = db_session.query(GamePlayer).join(GameSession).filter(
                    GamePlayer.user_id == user_id,
                    GameSession.session_code == session_code
                ).first()
                
                if player:
                    logger.debug(f"Found GamePlayer {player.id} with active_table_id: {player.active_table_id}")
                else:
                    logger.debug(f"No GamePlayer found for user {user_id} in session {session_code}")
                
                return player.active_table_id if player else None
                
            finally:
                db_session.close()
                
        except Exception as e:
            logger.error(f"Error getting player active table for user {user_id} in session {session_code}: {e}")
            return None

    async def _set_player_active_table(self, user_id: int, session_code: str, table_id: Optional[str]) -> bool:
        """Set player's active table ID in database"""
        try:
            logger.debug(f"Setting active table for user {user_id} in session {session_code} to {table_id}")
            db_session = SessionLocal()
            try:
                # Find the GamePlayer for this user in this session
                player = db_session.query(GamePlayer).join(GameSession).filter(
                    GamePlayer.user_id == user_id,
                    GameSession.session_code == session_code
                ).first()
                
                if player:
                    old_table_id = player.active_table_id
                    player.active_table_id = table_id
                    db_session.commit()
                    logger.info(f"Updated active table for user {user_id} in session {session_code}: {old_table_id} -> {table_id}")
                    return True
                else:
                    logger.warning(f"No GamePlayer found for user {user_id} in session {session_code}")
                    return False
                    
            finally:
                db_session.close()
                
        except Exception as e:
            logger.error(f"Error setting player active table for user {user_id} in session {session_code}: {e}")
            return False

    # =========================================================================
    # WALL MANAGEMENT HANDLERS
    # =========================================================================

    async def handle_wall_create(self, msg: Message, client_id: str) -> Message:
        """DM creates a single wall segment and persists it to the database."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_data = msg.data.get('wall_data', {})
        if not table_id or not wall_data:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_data are required'})

        user_id = self._get_user_id(msg, client_id)
        wall_data['table_id'] = table_id
        wall_data['created_by'] = user_id

        try:
            wall_dict = await self.actions.create_wall(table_id=table_id, wall_data=wall_data,
                                                       session_id=self._get_session_id(msg))
        except Exception as e:
            logger.error(f"handle_wall_create error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'create', 'wall': wall_dict, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'create', 'wall': wall_dict, 'table_id': table_id})

    async def handle_wall_update(self, msg: Message, client_id: str) -> Message:
        """DM modifies wall properties (type, blocking flags, door state, etc.)."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can update walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_id  = msg.data.get('wall_id')
        updates  = msg.data.get('updates', {})
        if not table_id or not wall_id:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_id are required'})

        try:
            wall_dict = await self.actions.update_wall(table_id=table_id, wall_id=wall_id, updates=updates,
                                                       session_id=self._get_session_id(msg))
        except Exception as e:
            logger.error(f"handle_wall_update error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id})

    async def handle_wall_remove(self, msg: Message, client_id: str) -> Message:
        """DM removes a wall segment permanently."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can remove walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_id  = msg.data.get('wall_id')
        if not table_id or not wall_id:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_id are required'})

        try:
            await self.actions.delete_wall(table_id=table_id, wall_id=wall_id,
                                           session_id=self._get_session_id(msg))
        except Exception as e:
            logger.error(f"handle_wall_remove error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'remove', 'wall_id': wall_id, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'remove', 'wall_id': wall_id, 'table_id': table_id})

    async def handle_wall_batch_create(self, msg: Message, client_id: str) -> Message:
        """DM imports many walls at once (e.g. after map import)."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can batch-create walls'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id   = msg.data.get('table_id')
        walls_data = msg.data.get('walls', [])
        if not table_id or not isinstance(walls_data, list):
            return Message(MessageType.ERROR, {'error': 'table_id and walls list are required'})

        user_id    = self._get_user_id(msg, client_id)
        session_id = self._get_session_id(msg)
        created    = []
        for wd in walls_data:
            try:
                wd['table_id']    = table_id
                wd['created_by']  = user_id
                wall_dict = await self.actions.create_wall(table_id=table_id, wall_data=wd, session_id=session_id)
                created.append(wall_dict)
            except Exception as e:
                logger.warning(f"Skipping wall in batch due to error: {e}")

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'batch_create', 'walls': created, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'batch_create', 'walls': created, 'table_id': table_id})

    async def handle_door_toggle(self, msg: Message, client_id: str) -> Message:
        """Toggle a door between open/closed.  Players can interact; locked doors require DM."""
        role = self._get_client_role(client_id)
        if not can_interact(role):
            return Message(MessageType.ERROR, {'error': 'Spectators cannot interact with doors'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        wall_id  = msg.data.get('wall_id')
        if not table_id or not wall_id:
            return Message(MessageType.ERROR, {'error': 'table_id and wall_id are required'})

        # Validate this is actually a door — load from in-memory table walls
        table = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})

        wall = table.get_wall(wall_id) if hasattr(table, 'get_wall') else None
        if wall is None:
            return Message(MessageType.ERROR, {'error': 'Wall not found'})
        if not wall.is_door:
            return Message(MessageType.ERROR, {'error': 'This wall is not a door'})
        if wall.door_state == 'locked' and not is_dm(role):
            return Message(MessageType.ERROR, {'error': 'Door is locked — only the DM can open it'})

        new_state = 'closed' if wall.door_state == 'open' else 'open'
        try:
            wall_dict = await self.actions.update_wall(
                table_id=table_id, wall_id=wall_id,
                updates={'door_state': new_state},
                session_id=self._get_session_id(msg),
            )
        except Exception as e:
            logger.error(f"handle_door_toggle error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

        await self.broadcast_to_session(
            Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id}),
            client_id,
        )
        return Message(MessageType.WALL_DATA, {'operation': 'update', 'wall': wall_dict, 'table_id': table_id})

    async def handle_layer_settings_update(self, msg: Message, client_id: str) -> Message:
        """DM updates per-layer settings (opacity, tint_color, inactive_opacity, visible).
        Saves to DB and broadcasts to all clients in the session."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change layer settings'})
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided'})

        table_id = msg.data.get('table_id')
        layer    = msg.data.get('layer')
        settings = msg.data.get('settings', {})
        if not table_id or not layer:
            return Message(MessageType.ERROR, {'error': 'table_id and layer are required'})

        session_id = self._get_session_id(msg)
        if session_id:
            try:
                from database.database import SessionLocal
                from database import crud, schemas
                import json as _json
                db = SessionLocal()
                try:
                    db_table = crud.get_virtual_table_by_id(db, table_id)
                    if db_table:
                        existing = _json.loads(db_table.layer_settings or '{}')
                        existing[layer] = settings
                        update = schemas.VirtualTableUpdate(layer_settings=existing)
                        crud.update_virtual_table(db, table_id, update)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"handle_layer_settings_update DB error: {e}")

        broadcast_payload = {'table_id': table_id, 'layer': layer, 'settings': settings}
        await self.broadcast_to_session(
            Message(MessageType.LAYER_SETTINGS_UPDATE, broadcast_payload),
            client_id,
        )
        return Message(MessageType.LAYER_SETTINGS_UPDATE, broadcast_payload)

    # ── Game Mode & Session Rules ────────────────────────────────────────────

    async def handle_game_mode_change(self, msg: Message, client_id: str) -> Message:
        """DM changes game mode.  Validates the value, persists, broadcasts."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change game mode'})

        target_mode = (msg.data or {}).get('game_mode')
        if not target_mode:
            return Message(MessageType.ERROR, {'error': 'game_mode is required'})

        try:
            from core_table.game_mode import GameMode, GameModeFSM
            # We don't keep FSM state in memory yet — just validate the value and persist
            GameMode(target_mode)  # raises ValueError if invalid
        except ValueError:
            return Message(MessageType.ERROR, {'error': f'Invalid game mode: {target_mode}'})

        session_code = self._get_session_code()
        if session_code:
            try:
                from database.database import SessionLocal
                from database.crud import update_game_mode
                db = SessionLocal()
                try:
                    update_game_mode(db, session_code, target_mode)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Failed to persist game mode: {e}")

        response = Message(MessageType.GAME_MODE_STATE, {'game_mode': target_mode})
        await self.broadcast_to_session(response, client_id)
        return response

    async def handle_session_rules_update(self, msg: Message, client_id: str) -> Message:
        """DM updates session rules.  Validates, persists, broadcasts."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can update session rules'})

        rules_data = (msg.data or {}).get('rules', {})
        if not rules_data:
            return Message(MessageType.ERROR, {'error': 'rules payload is required'})

        try:
            from core_table.session_rules import SessionRules
            import json
            session_code = self._get_session_code() or "unknown"
            rules_data['session_id'] = session_code
            rules = SessionRules.from_dict(rules_data)
            errors = rules.validate()
            if errors:
                return Message(MessageType.ERROR, {'error': '; '.join(errors)})

            rules_json = json.dumps(rules.to_dict())
            from database.database import SessionLocal
            from database.crud import update_session_rules_json
            db = SessionLocal()
            try:
                update_session_rules_json(db, session_code, rules_json)
            finally:
                db.close()

            response = Message(MessageType.SESSION_RULES_CHANGED, {'rules': rules.to_dict()})
            await self.broadcast_to_session(response, client_id)
            return response
        except Exception as e:
            logger.error(f"handle_session_rules_update error: {e}")
            return Message(MessageType.ERROR, {'error': str(e)})

    async def handle_session_rules_request(self, msg: Message, client_id: str) -> Message:
        """Client requests current session rules.  Sends directly back."""
        session_code = self._get_session_code()
        rules_json = '{}'
        if session_code:
            try:
                from database.database import SessionLocal
                from database.crud import get_session_rules_json, get_game_mode
                import json
                db = SessionLocal()
                try:
                    rules_json = get_session_rules_json(db, session_code)
                    game_mode = get_game_mode(db, session_code)
                finally:
                    db.close()
            except Exception as e:
                logger.error(f"Failed to load session rules: {e}")
                game_mode = 'free_roam'

        import json
        try:
            rules_dict = json.loads(rules_json)
        except Exception:
            rules_dict = {}

        response = Message(MessageType.SESSION_RULES_CHANGED, {
            'rules': rules_dict,
            'mode': game_mode,
        })
        # Send only to requesting client (exclude no one, but broadcast just to sender)
        await self.send_to_client(response, client_id)
        return response

    def _get_session_code(self) -> str | None:
        """Get the session code from the session manager."""
        if self.session_manager and hasattr(self.session_manager, 'session_code'):
            return self.session_manager.session_code
        return None

    # ── Combat ──────────────────────────────────────────────────────────────

    async def handle_combat_start(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can start combat'})
        d = msg.data or {}
        table_id = d.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id required'})

        from service.combat_engine import CombatEngine
        from core_table.combat import CombatSettings
        settings = CombatSettings.from_dict(d['settings']) if d.get('settings') else None
        session_code = self._get_session_code()
        state = CombatEngine.start_combat(
            session_id=session_code,
            table_id=table_id,
            entity_ids=d.get('entity_ids', []),
            settings=settings,
            names=d.get('names', {}),
        )
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict()})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_combat_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end combat'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.end_combat(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict(), 'ended': True})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_combat_state_request(self, msg: Message, client_id: str) -> Message:
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.COMBAT_STATE, {'combat': None})
        if is_dm(self._get_client_role(client_id)):
            return Message(MessageType.COMBAT_STATE, {'combat': state.to_dict()})
        return Message(MessageType.COMBAT_STATE, {
            'combat': state.to_dict_for_player(state.settings.show_npc_hp_to_players)
        })

    async def handle_initiative_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        value = CombatEngine.roll_initiative(session_code, combatant_id)
        if value is None:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        resp = Message(MessageType.INITIATIVE_ORDER, {'combatant_id': combatant_id, 'value': value, 'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_initiative_set(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can set initiative'})
        d = msg.data or {}
        combatant_id, value = d.get('combatant_id'), d.get('value')
        if not combatant_id or value is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and value required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not CombatEngine.set_initiative(session_code, combatant_id, float(value)):
            return Message(MessageType.ERROR, {'error': 'Failed — no active combat or combatant not found'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        resp = Message(MessageType.INITIATIVE_ORDER, {'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_initiative_add(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can add combatants'})
        d = msg.data or {}
        entity_id = d.get('entity_id')
        if not entity_id:
            return Message(MessageType.ERROR, {'error': 'entity_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        extra = {k: v for k, v in d.items() if k != 'entity_id'}
        combatant = CombatEngine.add_combatant(session_code, entity_id, **extra)
        if not combatant:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        resp = Message(MessageType.INITIATIVE_ORDER, {'combatant': combatant.to_dict(), 'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_initiative_remove(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can remove combatants'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        CombatEngine.remove_combatant(session_code, combatant_id)
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        resp = Message(MessageType.INITIATIVE_ORDER, {'removed': combatant_id, 'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_turn_end(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state = CombatEngine.get_state(session_code)
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        role = self._get_client_role(client_id)
        if not is_dm(role):
            current = state.get_current_combatant()
            if not current or current.combatant_id != combatant_id:
                return Message(MessageType.ERROR, {'error': 'Not your turn'})
            if not state.settings.allow_player_end_turn:
                return Message(MessageType.ERROR, {'error': 'Players cannot end their own turn'})
        if not CombatEngine.end_turn(session_code, combatant_id):
            return Message(MessageType.ERROR, {'error': 'Cannot end turn'})
        state = CombatEngine.get_state(session_code)
        current = state.get_current_combatant() if state else None
        resp = Message(MessageType.TURN_START, {
            'combat': state.to_dict() if state else None,
            'current_combatant': current.to_dict() if current else None,
            'round_number': state.round_number if state else 0,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_turn_skip(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can skip turns'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        result = CombatEngine.next_turn(session_code)
        if not result:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.TURN_START, {
            'combat': state.to_dict() if state else None,
            **result,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

    # ── Conditions ──────────────────────────────────────────────────────────

    async def handle_condition_add(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can add conditions'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        condition_str = d.get('condition')
        if not combatant_id or not condition_str:
            return Message(MessageType.ERROR, {'error': 'combatant_id and condition required'})
        from service.combat_engine import CombatEngine
        from core_table.conditions import ActiveCondition, ConditionType
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            try:
                ctype = ConditionType(condition_str)
            except ValueError:
                return Message(MessageType.ERROR, {'error': f'Unknown condition: {condition_str}'})
            if not any(x.condition_type == ctype for x in c.conditions):
                c.conditions.append(ActiveCondition(
                    condition_id=str(uuid.uuid4()),
                    condition_type=ctype,
                    source=d.get('source', 'dm'),
                    duration_type='rounds' if d.get('duration') else 'permanent',
                    duration_remaining=d.get('duration'),
                ))
            conditions = [x.to_dict() for x in c.conditions]
            resp = Message(MessageType.CONDITIONS_SYNC, {'combatant_id': combatant_id, 'conditions': conditions})
            await self.broadcast_to_session(resp, client_id)
            return resp
        return Message(MessageType.ERROR, {'error': 'Combatant not found'})

    async def handle_condition_remove(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can remove conditions'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        condition_str = d.get('condition')
        if not combatant_id or not condition_str:
            return Message(MessageType.ERROR, {'error': 'combatant_id and condition required'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            c.conditions = [x for x in c.conditions if x.condition_type.value != condition_str]
            conditions = [x.to_dict() for x in c.conditions]
            resp = Message(MessageType.CONDITIONS_SYNC, {'combatant_id': combatant_id, 'conditions': conditions})
            await self.broadcast_to_session(resp, client_id)
            return resp
        return Message(MessageType.ERROR, {'error': 'Combatant not found'})

    # ── DM Overrides ────────────────────────────────────────────────────────

    async def handle_dm_set_hp(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id, hp = d.get('combatant_id'), d.get('hp')
        if not combatant_id or hp is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and hp required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not CombatEngine.dm_set_hp(session_code, combatant_id, int(hp)):
            return Message(MessageType.ERROR, {'error': 'Failed'})
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_apply_damage(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id, amount = d.get('combatant_id'), d.get('amount')
        if not combatant_id or amount is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and amount required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        result = CombatEngine.apply_damage(session_code, combatant_id, int(amount),
                                           damage_type=d.get('damage_type', ''), is_dm=True)
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None, 'damage_result': result})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_revert_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not CombatEngine.dm_revert_last_action(session_code):
            return Message(MessageType.ERROR, {'error': 'Nothing to revert'})
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_add_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        resource = d.get('resource', 'action')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        CombatEngine.dm_grant_resource(session_code, combatant_id, resource)
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_add_movement(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        amount = float(d.get('amount', 5))
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        CombatEngine.dm_grant_resource(session_code, combatant_id, 'movement', amount)
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_toggle_ai(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                c.ai_enabled = d.get('enabled', not c.ai_enabled)
                if 'behavior' in d:
                    c.ai_behavior = d['behavior']
                resp = Message(MessageType.COMBAT_STATE, {
                    'combatant_id': combatant_id, 'ai_enabled': c.ai_enabled, 'ai_behavior': c.ai_behavior
                })
                await self.broadcast_to_session(resp, client_id)
                return resp
        return Message(MessageType.ERROR, {'error': 'Combatant not found'})

    async def handle_ai_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        from service.npc_ai import NPCAIEngine
        session_code = self._get_session_code()
        state = CombatEngine.get_state(session_code)
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        combatant = next((c for c in state.combatants if c.combatant_id == combatant_id), None)
        if not combatant:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        decision = NPCAIEngine.decide_action(combatant, state, combatant.ai_behavior)
        resp = Message(MessageType.AI_SUGGESTION, {'combatant_id': combatant_id, 'decision': {
            'action_type': decision.action_type, 'target_id': decision.target_id,
            'move_to': decision.move_to, 'reasoning': decision.reasoning,
        }})
        await self.broadcast_to_session(resp, client_id)
        return resp

    # ── Encounters ──────────────────────────────────────────────────────────

    async def handle_encounter_start(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can start encounters'})
        d = msg.data or {}
        title = d.get('title', 'Encounter')
        description = d.get('description', '')
        choices = d.get('choices', [])
        participants = d.get('participants', [])
        if not choices:
            return Message(MessageType.ERROR, {'error': 'choices required'})
        from service.encounter_engine import EncounterEngine
        session_code = self._get_session_code()
        enc = EncounterEngine.create(session_code, title, description, choices, participants,
                                     dm_notes=d.get('dm_notes', ''))
        resp = Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=False)})
        await self.broadcast_to_session(resp, client_id)
        return Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=True)})

    async def handle_encounter_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end encounters'})
        from service.encounter_engine import EncounterEngine
        enc = EncounterEngine.end_encounter(self._get_session_code())
        if not enc:
            return Message(MessageType.ERROR, {'error': 'No active encounter'})
        resp = Message(MessageType.ENCOUNTER_RESULT, {'encounter_id': enc.encounter_id, 'ended': True,
                                                      'player_choices': enc.player_choices})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_encounter_choice(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        choice_id = d.get('choice_id')
        if not choice_id:
            return Message(MessageType.ERROR, {'error': 'choice_id required'})
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        result = EncounterEngine.submit_choice(self._get_session_code(), player_id, choice_id)
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        return Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **result})

    async def handle_encounter_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        bonus = int(d.get('bonus', 0))
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        result = EncounterEngine.submit_roll(self._get_session_code(), player_id, bonus)
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        resp = Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **result})
        await self.broadcast_to_session(resp, client_id)
        return resp

    # ── Planning Commit (Phase 4) ────────────────────────────────────────────

    async def handle_action_commit(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        actions = d.get('actions', [])
        sequence_id = int(d.get('sequence_id', 0))

        if not actions:
            return Message(MessageType.ACTION_REJECTED, {
                'sequence_id': sequence_id, 'failed_index': 0, 'reason': 'No actions provided',
            })

        role = self._get_client_role(client_id)
        user_id = self._get_user_id(msg, client_id)
        is_dm_user = is_dm(role)
        session_code = self._get_session_code()

        # Load rules once for this commit batch
        rules = None
        mode = GameMode.FREE_ROAM
        if session_code and not is_dm_user:
            db = SessionLocal()
            try:
                rules_json = get_session_rules_json(db, session_code)
                mode_str = get_game_mode(db, session_code) or 'free_roam'
                if rules_json and rules_json != '{}':
                    rules_data = json.loads(rules_json)
                    rules_data.setdefault('session_id', session_code)
                    rules = SessionRules.from_dict(rules_data)
                try:
                    mode = GameMode(mode_str)
                except ValueError:
                    mode = GameMode.FREE_ROAM
            finally:
                db.close()
        rules = rules or SessionRules.defaults(session_code or 'default')
        engine = RulesEngine(rules)

        applied = []
        for idx, action in enumerate(actions):
            action_type = action.get('action_type', '')
            sprite_id = action.get('sprite_id') or action.get('target_id') or ''
            table_id = action.get('table_id', 'default')

            if not is_dm_user and not await self._can_control_sprite(sprite_id, user_id):
                return Message(MessageType.ACTION_REJECTED, {
                    'sequence_id': sequence_id, 'failed_index': idx,
                    'reason': 'You do not control this sprite',
                })

            if action_type == 'move':
                to_pos = {'x': float(action.get('target_x', 0)), 'y': float(action.get('target_y', 0))}
                from_pos = action.get('from') or to_pos

                if not is_dm_user:
                    vr = engine.validate_action(
                        action, mode,
                        movement_cost=action.get('cost_ft'),
                        available_speed=action.get('speed_ft'),
                    )
                    if not vr.ok:
                        return Message(MessageType.ACTION_REJECTED, {
                            'sequence_id': sequence_id, 'failed_index': idx, 'reason': vr.reason,
                        })

                result = await self.actions.move_sprite(
                    table_id=table_id, sprite_id=sprite_id,
                    old_position=from_pos, new_position=to_pos,
                    session_id=session_code,
                )
                if not result.success:
                    return Message(MessageType.ACTION_REJECTED, {
                        'sequence_id': sequence_id, 'failed_index': idx,
                        'reason': result.message or 'Move failed',
                    })
                applied.append({'sequence_index': action.get('sequence_index', idx), 'action_type': action_type,
                                'sprite_id': sprite_id, 'to': to_pos})

            else:
                # Non-move actions: validate permissions only; execution handled by future phases
                if not is_dm_user:
                    vr = engine.validate_action(action, mode, has_action_available=True)
                    if not vr.ok:
                        return Message(MessageType.ACTION_REJECTED, {
                            'sequence_id': sequence_id, 'failed_index': idx, 'reason': vr.reason,
                        })
                applied.append({'sequence_index': action.get('sequence_index', idx), 'action_type': action_type,
                                'sprite_id': sprite_id})

        resp = Message(MessageType.ACTION_RESULT, {'sequence_id': sequence_id, 'applied': applied})
        await self.broadcast_to_session(resp, client_id)
        return resp

