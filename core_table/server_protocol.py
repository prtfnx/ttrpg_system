import os
import sys
import time
import json
import xxhash  # Add xxhash import
from typing import Dict, Set, Optional, Tuple, Any, Callable
import time



# Add parent directory to path to import protocol
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType, BatchMessage 
from core_table.actions_core import ActionsCore
from server_host.utils.logger import setup_logger
from server_host.service.asset_manager import get_server_asset_manager, AssetRequest
from server_host.database.models import Asset, GameSession
from server_host.database.database import SessionLocal

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
        # New message type allows clients to send partial updates with version checks
        if hasattr(MessageType, 'CHARACTER_UPDATE'):
            self.register_handler(MessageType.CHARACTER_UPDATE, self.handle_character_update)
        
        # Error handling
        self.register_handler(MessageType.ERROR, self.handle_error)
        self.register_handler(MessageType.SUCCESS, self.handle_success)
        self.register_handler(MessageType.PLAYER_KICK_REQUEST, self.handle_player_kick_request)
        self.register_handler(MessageType.PLAYER_BAN_REQUEST, self.handle_player_ban_request)
        self.register_handler(MessageType.CONNECTION_STATUS_REQUEST, self.handle_connection_status_request)
        
        # Character management handlers
        self.register_handler(MessageType.CHARACTER_SAVE_REQUEST, self.handle_character_save_request)
        self.register_handler(MessageType.CHARACTER_LOAD_REQUEST, self.handle_character_load_request)
        self.register_handler(MessageType.CHARACTER_LIST_REQUEST, self.handle_character_list_request)
        self.register_handler(MessageType.CHARACTER_DELETE_REQUEST, self.handle_character_delete_request)

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
        logger.debug("Received ping message")
        response = Message(MessageType.PONG, {'timestamp': time.time(), 'client_id': client_id})
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
            response_data = {
                'sprite_id': sprite_data.get('sprite_id'),
                'sprite_data': sprite_data
            }
            logger.debug(f"Sending sprite response: {response_data}")
            
            # Broadcast sprite creation to all other clients in the session
            update_message = Message(MessageType.SPRITE_UPDATE, {
                'sprite_id': sprite_data.get('sprite_id'),
                'operation': 'create',
                'sprite_data': sprite_data,
                'table_id': table_id
            })
            await self.broadcast_to_session(update_message, client_id)
            
            return Message(MessageType.SPRITE_RESPONSE, response_data)

    async def handle_delete_sprite(self, msg: Message, client_id: str) -> Message:
        """Handle delete sprite request"""
        logger.debug(f"Delete sprite request received: {msg}")
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
        
        # Get session_id for database persistence
        session_id = self._get_session_id(msg)
        
        # Use the existing move_sprite method from actions
        result = await self.actions.move_sprite(
            table_name=table_id,  # Note: this might need to be table_name instead
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
        scale_x = msg.data.get('scale_x')
        scale_y = msg.data.get('scale_y')
        action_id = msg.data.get('action_id')  # For confirmation tracking
        
        if not sprite_id or scale_x is None or scale_y is None:
            return Message(MessageType.ERROR, {'error': 'Sprite ID, scale_x, and scale_y are required'})
        
        # Note: Sprite updates are frequent and typically batched, not immediately persisted
        # Session manager will handle periodic persistence
        
        # Update sprite scale using the actions interface
        update_data = {
            'sprite_id': sprite_id,
            'scale_x': scale_x,
            'scale_y': scale_y
        }
        
        result = await self.actions.update_sprite(table_id, sprite_id, data=update_data)
        if result.success:
            response_data = {
                'sprite_id': sprite_id,
                'operation': 'scale',
                'scale_x': scale_x,
                'scale_y': scale_y,
                'success': True
            }
            # Include action_id for confirmation if provided
            if action_id:
                response_data['action_id'] = action_id
            
            # Broadcast sprite scale to all other clients in the session
            scale_message = Message(MessageType.SPRITE_SCALE, {
                'sprite_id': sprite_id,
                'scale_x': scale_x,
                'scale_y': scale_y,
                'table_id': table_id
            })
            await self.broadcast_to_session(scale_message, client_id)
            
            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to scale sprite: {result.message}'}
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
        
        # Note: Sprite updates are frequent and typically batched, not immediately persisted
        # Session manager will handle periodic persistence
        
        # Update sprite rotation using the actions interface
        update_data = {
            'sprite_id': sprite_id,
            'rotation': rotation
        }
        
        result = await self.actions.update_sprite(table_id, sprite_id, data=update_data)
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
            
            # Broadcast sprite update to all other clients in the session
            update_message = Message(MessageType.SPRITE_UPDATE, {
                'sprite_id': sprite_id,
                'operation': 'rotate',
                'rotation': rotation,
                'table_id': table_id
            })
            await self.broadcast_to_session(update_message, client_id)
            
            return Message(MessageType.SPRITE_RESPONSE, response_data)
        else:
            error_data = {'error': f'Failed to rotate sprite: {result.message}'}
            if action_id:
                error_data['action_id'] = action_id
            return Message(MessageType.ERROR, error_data)

    async def handle_delete_table(self, msg: Message, client_id: str) -> Message:
        """Handle delete table request"""
        logger.debug(f"Delete table request received: {msg}")
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
            await self.ensure_assets_in_r2(table_data, msg.data.get('session_code', 'default'), msg.data.get('user_id', 0))
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
        user_id = msg.data.get('user_id', 0)
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

            # return message that need send to client
            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': table_data_with_hashes})

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
                
                response_error = None
                response = None
                if update_category == 'sprite':
                    update_type_enum = MessageType(update_type)
                    match update_type_enum:
                        #TODO different types of updates handle differently
                        case MessageType.SPRITE_MOVE | MessageType.SPRITE_SCALE | MessageType.SPRITE_ROTATE:
                            await self.actions.update_sprite(table_id, update_data.get('sprite_id'), data=update_data)
                            response= Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': f'Sprite {update_type} successfully'
                            })
                        case MessageType.SPRITE_CREATE:
                            await self.actions.create_sprite_from_data(data=update_data,)
                            return Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite added successfully'
                            })
                        case MessageType.SPRITE_REMOVE:
                            await self.actions.delete_sprite(table_id, update_data.get('sprite_id'))
                            response = Message(MessageType.SUCCESS, {
                                'table_id': table_id,
                                'sprite_id': update_data.get('sprite_id'),
                                'message': 'Sprite removed successfully'
                            })
                        case _:
                            logger.error(f"Unknown sprite update type: {update_type} from {client_id}")
                            response_error= Message(MessageType.ERROR, {
                                'error': f"Unknown sprite update type: {update_type}"
                            })
                            
                elif update_category == 'table':
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
            await self._broadcast_error(client_id, f"Update failed: {e}")
            return Message(MessageType.ERROR, {'error': f"Update failed: {e}"})
    
    async def handle_sprite_update(self, msg: Message, client_id: str) -> Message:
        """Handle sprite update message"""
        logger.info(f"Handling sprite update from {client_id}: {msg}")
        if not msg.data:
            logger.error(f"No data provided in sprite update from {client_id}")
            return Message(MessageType.ERROR, {'error': 'No data provided in sprite update'})
            
        type = msg.data.get('type')
        if not type:
            logger.error(f"Missing 'type' field in sprite update from {client_id}: {msg.data}")
            return Message(MessageType.ERROR, {'error': 'Missing required field: type'})
        update_data = msg.data.get('data', {})

        if not update_data or 'table_name' not in update_data or 'sprite_id' not in update_data:
            logger.error(f"Invalid sprite update data from {client_id}: {update_data}")
            return Message(MessageType.ERROR, {'error': 'Invalid sprite update data'})
        match type:
            case 'sprite_move':
                # Handle sprite movement
                
                if 'from' not in update_data or 'to' not in update_data:
                    logger.error(f"Missing 'from' or 'to' field in sprite move update from {client_id}: {update_data}")
                    return Message(MessageType.ERROR, {'error': 'Missing required fields: from, to'})
     
                await self.actions.move_sprite(table_name=update_data['table_name'],
                                               sprite_id=update_data['sprite_id'],
                                               old_position=update_data['from'],
                                               new_position=update_data['to'])

                # Here you can add logic to check for conflicts with other sprites
                # For now, we just assume the move is valid
            case 'sprite_scale':
                raise NotImplementedError(f"Sprite update type '{type}' not implemented")
            case 'sprite_rotate':
                raise NotImplementedError(f"Sprite update type '{type}' not implemented")
        table_id = update_data.get('table_id')
        await self.actions.update_sprite(table_id, update_data.get('sprite_id'), data=update_data)
        response = Message(MessageType.SUCCESS, {
            'table_id': table_id,
            'sprite_id': update_data.get('sprite_id'),
            'message': f'Sprite updated successfully'
        })
        return response

    async def handle_file_request(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'File transfer not implemented yet'})  
    async def handle_compendium_sprite_add(self, msg: Message, client_id: str) -> Message:
        """Create a sprite from compendium data and ensure asset URLs are provided.

        Expected msg.data: {
            'table_id': str,
            'sprite_data': { ... entity fields ... },
            'session_code': str (optional),
            'user_id': int (optional)
        }
        """
        logger.debug(f"Compendium sprite add received from {client_id}: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in compendium sprite add'})

        table_id = msg.data.get('table_id') or msg.data.get('table_name') or 'default'
        sprite_data = msg.data.get('sprite_data')
        session_code = msg.data.get('session_code', msg.data.get('session', 'default'))
        user_id = msg.data.get('user_id', 0)

        if not sprite_data:
            return Message(MessageType.ERROR, {'error': 'No sprite_data provided for compendium add'})

        # Ensure the data includes table_id for actions.create_sprite_from_data
        sprite_data_with_table = dict(sprite_data)
        sprite_data_with_table['table_id'] = table_id

        try:
            # Create sprite via actions API
            result = await self.actions.create_sprite_from_data(sprite_data_with_table)
            if not result.success:
                logger.error(f"Failed to create compendium sprite: {result.message}")
                return Message(MessageType.ERROR, {'error': f'Failed to create sprite: {result.message}'})

            # Prepare a minimal table structure containing the new entity so we can ensure assets in R2
            # Ensure created_sprite is defined even if nested blocks fail
            created_sprite = sprite_data
            try:
                # The created sprite data may be returned in result.data or be identical to input
                # Build table_data structure compatible with ensure_assets_in_r2
                table_data = {'layers': {created_sprite.get('layer', 'tokens'): {created_sprite.get('sprite_id', created_sprite.get('entity_id', 'new')): created_sprite}}}
                table_data_enriched = await self.ensure_assets_in_r2(table_data, session_code=session_code, user_id=user_id)
                # Extract asset info back to sprite
                layer = created_sprite.get('layer', 'tokens')
                entity_map = table_data_enriched.get('layers', {}).get(layer, {})
                entity_key = next(iter(entity_map.keys())) if entity_map else None
                enriched_entity = entity_map.get(entity_key, created_sprite) if entity_key else created_sprite
            except Exception as e:
                logger.warning(f"Failed to enrich created sprite with asset URLs: {e}")
                enriched_entity = created_sprite

            # Broadcast sprite creation to all clients in session
            broadcast_data = {
                'sprite_id': enriched_entity.get('sprite_id', enriched_entity.get('entity_id', None)),
                'table_id': table_id,
                'sprite_data': enriched_entity,
                'operation': 'create'
            }
            
            # Broadcast to other clients in session
            await self.broadcast_to_session(Message(MessageType.SPRITE_UPDATE, broadcast_data), client_id)

            # Return the sprite id and any asset download url/xxhash if present
            response_payload = {
                'sprite_id': enriched_entity.get('sprite_id', enriched_entity.get('entity_id', None)),
                'table_id': table_id,
                'r2_asset_url': enriched_entity.get('r2_asset_url'),
                'asset_xxhash': enriched_entity.get('asset_xxhash')
            }

            return Message(MessageType.SPRITE_RESPONSE, response_payload)

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
            user_id = msg.data.get('user_id', 0)
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
            user_id = msg.data.get('user_id', 0)
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
            user_id = msg.data.get('user_id', 0)
            username = msg.data.get('username', 'unknown')
            
            if not asset_id:
                return Message(MessageType.ERROR, {'error': 'Asset ID is required'})
            
            logger.info(f"Processing upload confirmation for asset {asset_id}: {'success' if upload_success else 'failed'}")
            
            # Get asset manager and confirm upload
            from server_host.service.asset_manager import get_server_asset_manager
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
            # Delegate to the session manager's broadcast method
            await self.session_manager.broadcast_to_session(message, exclude_client=client_id)
        else:
            # Fallback implementation (should not be used in production)
            logger.warning("No session manager available for broadcasting, using fallback")
            for client in self.clients:
                if client != client_id:
                    await self.send_to_client(message, client)

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
            # This should be enhanced with proper permission system
            requesting_client_info = getattr(self, 'client_info', {}).get(client_id, {})
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
            requesting_client_info = getattr(self, 'client_info', {}).get(client_id, {})
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

    def _has_kick_permission(self, client_info: dict) -> bool:
        """Check if client has permission to kick players"""
        # Simple permission check - in production this should be more sophisticated
        username = client_info.get('username', '').lower()
        user_role = client_info.get('role', 'player')
        
        # DM/GM or admin can kick
        return (user_role in ['dm', 'gm', 'admin'] or 
                username.startswith('dm') or 
                username.startswith('gm') or
                username.startswith('admin'))

    def _has_ban_permission(self, client_info: dict) -> bool:
        """Check if client has permission to ban players"""
        # Ban permissions are more restrictive than kick
        username = client_info.get('username', '').lower()
        user_role = client_info.get('role', 'player')
        
        # Only DM/GM or admin can ban
        return (user_role in ['dm', 'gm', 'admin'] or 
                username.startswith('dm') or 
                username.startswith('gm') or
                username.startswith('admin'))

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
        user_id = msg.data.get('user_id', 0)
        
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
            # Broadcast character save to other clients in session
            resdata = result.data or {}
            broadcast_data = {
                'character_id': resdata.get('character_id'),
                'session_code': session_code,
                'operation': 'character_save',
                'user_id': user_id
            }
            await self.broadcast_to_session(Message(MessageType.PLAYER_STATUS, broadcast_data), client_id)
            
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': True,
                'character_id': resdata.get('character_id'),
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
        user_id = msg.data.get('user_id', 0)
        
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
        user_id = msg.data.get('user_id', 0)
        
        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })
        
        result = await self.actions.list_characters(session_id, user_id)

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
        user_id = msg.data.get('user_id', 0)
        
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
            # Broadcast character deletion to other clients in session
            broadcast_data = {
                'character_id': character_id,
                'session_code': session_code,
                'operation': 'character_delete',
                'user_id': user_id
            }
            await self.broadcast_to_session(Message(MessageType.PLAYER_STATUS, broadcast_data), client_id)
            
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
        user_id = msg.data.get('user_id', 0)
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

