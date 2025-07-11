import os
import time
import hashlib
import asyncio
import threading
from typing import Callable, Optional, Dict, Any, List

from networkx import to_dict_of_dicts
from .protocol import Message, MessageType, ProtocolHandler
from logger import setup_logger
from Actions import Actions
from core_table.actions_protocol import Position
import requests
from .DownloadManager import DownloadManager

logger = setup_logger(__name__)

class ClientProtocol:
    def __init__(self, Actions: Actions, send_callback: Callable[[str], None]):
        self.Actions = Actions
        self.send = send_callback
        self.client_id = hashlib.md5(f"{time.time()}_{os.getpid()}".encode()).hexdigest()[:8]
        self.last_ping = time.time()
        self.handlers: Dict[MessageType, Callable[[Message], None]] = {}
        
        # User session information for message construction
        self.user_id: Optional[int] = None
        self.username: Optional[str] = None
        self.session_code: Optional[str] = None
        self.jwt_token: Optional[str] = None
        
        self.init_handlers()

    def init_handlers(self):
        """Initialize built-in message handlers"""
        self.register_handler(MessageType.WELCOME, self.handle_welcome)
        self.register_handler(MessageType.TABLE_REQUEST, self.handle_request_table)
        self.register_handler(MessageType.PING, self.handle_ping)
        self.register_handler(MessageType.PONG, self.handle_pong)
        self.register_handler(MessageType.SUCCESS, self.handle_success)
        self.register_handler(MessageType.NEW_TABLE_RESPONSE, self.handle_new_table_response)
        self.register_handler(MessageType.TABLE_RESPONSE, self.handle_table_response)
        self.register_handler(MessageType.TABLE_DATA, self.handle_table_data)
        self.register_handler(MessageType.FILE_DATA, self.file_data)
        self.register_handler(MessageType.TABLE_UPDATE, self.apply_table_update)
        self.register_handler(MessageType.SPRITE_UPDATE, self.apply_sprite_update)
        self.register_handler(MessageType.ERROR, self.error_handler)
        # Authentication handlers
        self.register_handler(MessageType.AUTH_TOKEN, self._handle_auth_token)
        self.register_handler(MessageType.AUTH_STATUS, self._handle_auth_status)
        # R2 Asset Management handlers
        self.register_handler(MessageType.ASSET_DOWNLOAD_RESPONSE, self.handle_asset_download_response)
        self.register_handler(MessageType.ASSET_LIST_RESPONSE, self.handle_asset_list_response)
        self.register_handler(MessageType.ASSET_UPLOAD_RESPONSE, self.handle_asset_upload_response)
        # Sprite operation handlers
        self.register_handler(MessageType.SPRITE_CREATE, self.handle_sprite_create)
        self.register_handler(MessageType.SPRITE_RESPONSE, self.handle_sprite_response)
        self.register_handler(MessageType.SPRITE_REMOVE, self.handle_sprite_remove)
        # Table operation handlers
        self.register_handler(MessageType.TABLE_LIST_RESPONSE, self.handle_table_list_response)
        # Player management handlers
        self.register_handler(MessageType.PLAYER_LIST_RESPONSE, self.handle_player_list_response)
        self.register_handler(MessageType.PLAYER_KICK_RESPONSE, self.handle_player_kick_response)
        self.register_handler(MessageType.PLAYER_BAN_RESPONSE, self.handle_player_ban_response)
        self.register_handler(MessageType.CONNECTION_STATUS_RESPONSE, self.handle_connection_status_response)
        self.register_handler(MessageType.PLAYER_JOINED, self.handle_player_joined)
        self.register_handler(MessageType.PLAYER_LEFT, self.handle_player_left)
        # Character management handlers
        self.register_handler(MessageType.CHARACTER_SAVE_RESPONSE, self.handle_character_save_response)
        self.register_handler(MessageType.CHARACTER_LOAD_RESPONSE, self.handle_character_load_response)
        self.register_handler(MessageType.CHARACTER_LIST_RESPONSE, self.handle_character_list_response)
        self.register_handler(MessageType.CHARACTER_DELETE_RESPONSE, self.handle_character_delete_response)


    def register_handler(self, msg_type: MessageType, handler: Callable[[Message], None]):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler
    
    def request_table(self, table_name: Optional[str] = None):
        msg = Message(MessageType.TABLE_REQUEST, {
            'name': table_name,
            'session_code': self.session_code,
            'user_id': self.user_id,
            'username': self.username
        }, self.client_id)
        self.send(msg.to_json())
    
    def send_update(self, update_type: str, data: Dict[str, Any]):
        msg = Message(MessageType.TABLE_UPDATE, {
            'type': update_type, 
            'data': data
        }, self.client_id)
        self.send(msg.to_json())

    def sprite_create(self, table_id: str, sprite_data: Dict[str, Any]):
        """Create a new sprite on the server"""
        logger.debug(f"Creating sprite on server on table {table_id} with data: {sprite_data}")
        if not sprite_data or 'texture_path' not in sprite_data:
            logger.error("Invalid sprite data for creation")
            return
        #TODO proper manage of texture_path
        if isinstance(sprite_data['texture_path'], bytes):
            sprite_data['texture_path'] = sprite_data['texture_path'].decode()
        msg = Message(MessageType.SPRITE_CREATE, {
            'table_id': table_id,
            'sprite_data': sprite_data,
            'session_code': self.session_code,
            'user_id': self.user_id,
            'username': self.username
        }, self.client_id)
        self.send(msg.to_json())

    def sprite_delete(self, table_id: str, sprite_id: str):
        """Delete a sprite on the server"""
        logger.debug(f"Deleting sprite {sprite_id} on server from table {table_id}")
        msg = Message(MessageType.SPRITE_REMOVE, {
            'table_id': table_id,
            'sprite_id': sprite_id,
            'session_code': self.session_code,
            'user_id': self.user_id,
            'username': self.username
        }, self.client_id)
        self.send(msg.to_json())

    def sprite_move(self, table_id: str, sprite_id: str, from_pos: Dict[str, float], to_pos: Dict[str, float]):
        """Move a sprite on the server"""
        logger.debug(f"Moving sprite {sprite_id} on server from {from_pos} to {to_pos}")
        msg = Message(MessageType.SPRITE_MOVE, {
            'table_id': table_id,
            'sprite_id': sprite_id,
            'from': from_pos,
            'to': to_pos,
            'session_code': self.session_code,
            'user_id': self.user_id,
            'username': self.username
        }, self.client_id)
        self.send(msg.to_json())

    def sprite_scale(self, table_id: str, sprite_id: str, scale_x: float, scale_y: float):
        """Scale a sprite on the server"""
        logger.debug(f"Scaling sprite {sprite_id} on server to ({scale_x}, {scale_y})")
        msg = Message(MessageType.SPRITE_SCALE, {
            'table_id': table_id,
            'sprite_id': sprite_id,
            'scale_x': scale_x,
            'scale_y': scale_y,
            'session_code': self.session_code,
            'user_id': self.user_id,
            'username': self.username
        }, self.client_id)
        self.send(msg.to_json())

    def sprite_rotate(self, table_id: str, sprite_id: str, rotation: float):
        """Rotate a sprite on the server"""
        logger.debug(f"Rotating sprite {sprite_id} on server to {rotation} degrees")
        msg = Message(MessageType.SPRITE_ROTATE, {
            'table_id': table_id,
            'sprite_id': sprite_id,
            'rotation': rotation,
            'session_code': self.session_code,
            'user_id': self.user_id,
            'username': self.username
        }, self.client_id)
        self.send(msg.to_json())

    def table_delete(self, table_id: str):
        """Delete a table on the server"""
        logger.debug(f"Deleting table {table_id} on server")
        msg = Message(MessageType.TABLE_DELETE, {
            'table_id': table_id
        }, self.client_id)
        self.send(msg.to_json())

    def request_table_list(self):
        """Request list of tables from server"""
        logger.debug("Requesting table list from server")
        msg = Message(MessageType.TABLE_LIST_REQUEST, {}, self.client_id)
        self.send(msg.to_json())

    def handle_message(self, message: str):
        try:
            msg = Message.from_json(message)
            msg_type = msg.type
            if msg_type in self.handlers:
                logger.info(f"Handling message of type: {msg_type} with data: {msg.data}")
                response =  self.handlers[msg.type](msg)
                
                if response:
                    self.send(response)
                return
            else:
                logger.warning(f"No handler registered for message type: {msg_type}")
                self.send(Message(MessageType.ERROR, {
                    'error': f"No handler for message type {msg_type}"
                }, self.client_id).to_json())
        
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            self.send(Message(MessageType.ERROR, {
                'error': f"Message handling error: {str(e)}"
            }, self.client_id).to_json())

    def handle_new_table_response(self, msg: Message):
        data = msg.data
        if not data or 'name' not in data:
            logger.error("Received empty new table response data")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty new table response data'
            }, self.client_id).to_json())
            return
        table_name = data['name']
        self.Actions.create_table_from_dict(data)
    
    def handle_table_response(self, msg: Message):
        data = msg.data
        logger.debug(f"Table response data: {data}")
        if not data or 'name' not in data:
            logger.error("Received empty new table response data")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty new table response data'
            }, self.client_id).to_json())
            return
        table_name = data['name']        
        logger.info(f"Creating new table: {table_name}")
        table_data = data.get('table_data', {})
        table_data['to_server'] = False
        
        self.Actions.process_creating_table(table_data)
        # Create table from data

    

    def _request_asset_download(self, asset_id: str):
        """Request asset download from server"""
        try:
            download_request = Message(
                MessageType.ASSET_DOWNLOAD_REQUEST,
                {
                    "asset_id": asset_id,
                    "session_code": self.session_code or 'unknown',
                    "user_id": self.user_id or 0,
                    "username": self.username or 'unknown'
                }
            )
            
            self.send(download_request.to_json())
            logger.info(f"Requested download for asset {asset_id}")
            
        except Exception as e:
            logger.error(f"Error requesting asset download for {asset_id}: {e}")
    
   
        
    def handle_request_table(self, msg: Message):
        """Handle table request from server - delegate to Actions"""
        data = msg.data
        if not data or 'name' not in data:
            logger.error("Invalid table request data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid table request data received'
            }, self.client_id).to_json())
            return
        
        table_name = data['name']
        logger.info(f"Requesting table: {table_name}")
        table_result = self.Actions.get_table(table_name=table_name)
        
        if not table_result.success:
            logger.error(f"Table {table_name} not found")
            self.send(Message(MessageType.ERROR, {
                'error': f"Table {table_name} not found"
            }, self.client_id).to_json())
            return
        
        self.send(Message(MessageType.TABLE_DATA, {
            'name': table_name,
            'client_id': self.client_id,
            'data': table_result.data
        }, self.client_id).to_json())

     
    def handle_table_data(self, msg: Message):
        """Handle table data received from server - delegate to Actions"""
        data = msg.data
        if not data or 'name' not in data or 'data' not in data:
            logger.error("Invalid table data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid table data received'
            }, self.client_id).to_json())
            return
        
        table_name = data['table_name']
        logger.info(f"Received table data for {table_name}")
        
        # Create table from data using Actions
        result = self.Actions.create_table_from_dict(data)
        if not result.success:
            logger.error(f"Failed to create table from data: {result.message}")
            return
            
        self.apply_table_update(msg)        
        # Add success message
        self.Actions.add_chat_message(f"Table {table_name} updated")
    
    def send_sprite_update(self, update_type: str, sprite_data: Dict[str, Any]):
        """Send sprite-specific updates"""
        
        msg = Message(MessageType.SPRITE_UPDATE, {
            'category': 'sprite',
            'type': update_type, 
            'data': sprite_data
        }, self.client_id)
        self.send(msg.to_json())

    def apply_table_update(self, msg: Message):
        """Apply table update from server - delegate to Actions"""
        data = msg.data
        if not data or 'type' not in data or 'data' not in data:
            logger.error("Invalid table update data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid table update data received'
            }, self.client_id).to_json())
            return
        
        category = data.get('category', 'table')
        update_type = data['type']
        update_data = data['data']
        
        if category == 'sprite':
            self.apply_sprite_update(msg)
        else:
            # Delegate table updates to Actions
            table_id = update_data.get('table_id')
            if table_id:
                result = self.Actions.update_table(table_id, to_server=False, **update_data)
                if not result.success:
                    logger.error(f"Failed to apply table update: {result.message}")
    
    def apply_sprite_update(self, message: Message):
        """Apply sprite updates from server"""
        data = message.data
        if not data or 'type' not in data or 'data' not in data:
            logger.error("Invalid sprite update data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid sprite update data received'
            }, self.client_id).to_json())
            return
        
        update_type = data.get('type', 'sprite')
        sprite_data = data.get('data', {})
        sprite_id = sprite_data.get('sprite_id')
        table_id = sprite_data.get('table_id', None)
        
        if not sprite_id or not table_id:
            logger.warning(f"Missing sprite_id or table_id in sprite update: {sprite_data}")
            return
        
        # Check if sprite exists by trying to get its info
        sprite_info_result = self.Actions.get_sprite_info(table_id, sprite_id)
        if not sprite_info_result.success:
            logger.warning(f"Sprite not found: {sprite_id} in table {table_id}")
            return
        
        if update_type == 'sprite_move':
            logger.info(f"Applying sprite move: {sprite_id}")
            to_pos = sprite_data.get('to', {})
            new_position = Position(x=to_pos.get('x', 0), y=to_pos.get('y', 0))
            
            # Use Actions to move the sprite (disable server sync to avoid infinite loop)
            move_result = self.Actions.move_sprite(table_id, sprite_id, new_position, to_server=False)
            if move_result.success:
                logger.info(f"Applied sprite move: {sprite_id} to {new_position}")
            else:
                logger.error(f"Failed to apply sprite move: {move_result.message}")
            
        elif update_type == 'position_correction':
            # Server rejected the move, revert to correct position
            correct_pos = sprite_data.get('position', {})
            new_position = Position(x=correct_pos.get('x', 0), y=correct_pos.get('y', 0))
            
            # Use Actions to move the sprite to the correct position
            move_result = self.Actions.move_sprite(table_id, sprite_id, new_position, to_server=False)
            
            # Show user feedback
            reason = sprite_data.get('reason', 'Unknown')
            logger.warning(f"Position corrected for sprite {sprite_id}: {reason}")
            
            # Add to chat if available
            self.Actions.add_chat_message(f"Move blocked: {reason}")
            
        elif update_type == 'sprite_scale':
            to_scale = sprite_data.get('to', {})
            scale_x = float(to_scale.get('x', 1.0))
            scale_y = float(to_scale.get('y', 1.0))
            
            # Use Actions to scale the sprite (disable server sync to avoid infinite loop)
            scale_result = self.Actions.scale_sprite(table_id, sprite_id, scale_x, scale_y, to_server=False)
            if scale_result.success:
                logger.info(f"Applied sprite scale: {sprite_id} to ({scale_x:.2f}, {scale_y:.2f})")
            else:
                logger.error(f"Failed to apply sprite scale: {scale_result.message}")
        
        elif update_type == 'sprite_rotate':
            rotation = float(sprite_data.get('rotation', 0.0))
            
            # Use Actions to rotate the sprite (disable server sync to avoid infinite loop)
            rotate_result = self.Actions.rotate_sprite(table_id, sprite_id, rotation, to_server=False)
            if rotate_result.success:
                logger.info(f"Applied sprite rotation: {sprite_id} to {rotation} degrees")
            else:
                logger.error(f"Failed to apply sprite rotation: {rotate_result.message}")
        
        else:
            logger.warning(f"Unknown sprite update type: {update_type}")
    
    # Compendium sprite methods - simplified to delegate to Actions
    def send_compendium_sprite_add(self, table_name: str, entity_data: Dict[str, Any], position: Dict[str, float], entity_type: str, layer: str = 'tokens'):
        """Send compendium sprite add request to server"""
        msg = Message(MessageType.COMPENDIUM_SPRITE_ADD, {
            'table_name': table_name,
            'entity_data': entity_data,
            'position': position,
            'entity_type': entity_type,
            'layer': layer,
            'scale_x': 1.0,
            'scale_y': 1.0,
            'rotation': 0.0
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent compendium sprite add request: {entity_data.get('name', 'Unknown')} to {table_name}")
    
    def send_compendium_sprite_update(self, sprite_id: str, table_name: str, updates: Dict[str, Any]):
        """Send compendium sprite update request to server"""
        msg = Message(MessageType.COMPENDIUM_SPRITE_UPDATE, {
            'sprite_id': sprite_id,
            'table_name': table_name,
            'updates': updates
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent compendium sprite update request: {sprite_id}")
    
    def send_compendium_sprite_remove(self, sprite_id: str, table_name: str):
        """Send compendium sprite remove request to server"""
        msg = Message(MessageType.COMPENDIUM_SPRITE_REMOVE, {
            'sprite_id': sprite_id,
            'table_name': table_name
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Sent compendium sprite remove request: {sprite_id}")
    
    def _handle_compendium_sprite_add(self, data: Dict[str, Any]):
        """Handle compendium sprite addition from server - simplified logging"""
        logger.info(f"Handling compendium sprite add: {data}")
        # For now, just log. Compendium support can be added to Actions later
        self.Actions.add_chat_message("Compendium sprite add received")
    
    def _handle_compendium_sprite_update(self, data: Dict[str, Any]):
        """Handle compendium sprite update from server - simplified logging"""
        logger.info(f"Handling compendium sprite update: {data}")
        # For now, just log. Compendium support can be added to Actions later
        self.Actions.add_chat_message("Compendium sprite update received")
    
    def _handle_compendium_sprite_remove(self, data: Dict[str, Any]):
        """Handle compendium sprite removal from server - simplified logging"""
        logger.info(f"Handling compendium sprite remove: {data}")
        # For now, just log. Compendium support can be added to Actions later
        self.Actions.add_chat_message("Compendium sprite remove received")

    def _handle_auth_token(self, msg: Message):
        """Handle authentication token response - delegate to Actions"""
        data = msg.data
        if not data:
            logger.error("Received empty authentication token data")
            self.Actions.add_chat_message("❌ Authentication failed - no data received")
            return
        try:
            access_token = data.get('access_token')
            token_type = data.get('token_type', 'bearer')
            
            if access_token:
                logger.info("Authentication successful - received JWT token")
                self.Actions.add_chat_message("✅ Authentication successful")
            else:
                logger.error("Authentication failed - no token received")
                self.Actions.add_chat_message("❌ Authentication failed")
                    
        except Exception as e:
            logger.error(f"Error handling auth token: {e}")

    def _handle_auth_status(self, msg: Message):
        """Handle authentication status response - delegate to Actions"""
        data = msg.data
        if not data:
            logger.error("Received empty authentication status data")
            self.Actions.add_chat_message("❌ Authentication status check failed - no data received")
            return
        try:
            is_authenticated = data.get('authenticated', False)
            username = data.get('username')
            
            logger.info(f"Authentication status: {'authenticated' if is_authenticated else 'not authenticated'}")
            
            status_msg = f"Auth status: {'✅ Authenticated' if is_authenticated else '❌ Not authenticated'}"
            if username:
                status_msg += f" as {username}"
            self.Actions.add_chat_message(status_msg)
                
        except Exception as e:
            logger.error(f"Error handling auth status: {e}")
    def file_data(self, msg: Message):
        """Handle file data received from server"""
        # TODO use storage system to save files
        if not msg or not msg.data:
            logger.error("Received empty file data message")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty file data message'
            }, self.client_id).to_json())
            return
        data = msg.data
        if not data or 'filename' not in data or 'data' not in data:
            logger.error("Invalid file data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid file data received'
            }, self.client_id).to_json())
            return
        
        filename = data['filename']
        file_data = bytes.fromhex(data['data'])
        
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, 'wb') as f:
            f.write(file_data)
        logger.info(f"File saved: {filename}")
    def error_handler(self, msg: Message):
        """Handle error messages from server"""
        if not msg or not msg.data:
            logger.error("Received empty error message")
            return
        error_data = msg.data
        error_message = error_data.get('error', 'Unknown error')
        logger.error(f"Server error: {error_message}")
        
        # Add to chat if available
        self.Actions.add_chat_message(f"Server error: {error_message}")

    def handle_ping(self, msg: Message):
        """Handle ping messages from server"""
        if not msg or not msg.data:
            logger.error("Received empty ping message")
            return
        # Respond with pong
        pong_msg = Message(MessageType.PONG, client_id=self.client_id)
        self.send(pong_msg.to_json())
        logger.debug("Responded to ping with pong")
    def handle_pong(self, msg: Message):
        """Handle pong messages from server"""
        if not msg or not msg.data:
            logger.error("Received empty pong message")
            return
        # Update last ping time
        self.last_ping = time.time()
        logger.debug("Received pong, updated last ping time")
    
    def handle_success(self, msg: Message):
        """Handle success messages from server"""
        if not msg or not msg.data:
            logger.error("Received empty success message")
            return
        success_data = msg.data
        logger.info(f"Success message received: {success_data}")
        # Add to chat if available
        self.Actions.add_chat_message(f"✅ Success: {success_data.get('message', 'Operation completed successfully')}")

    # Authentication methods
    def auth_register(self, username: str, password: str, email: Optional[str] = None, full_name: Optional[str] = None):
        """Send authentication registration request via protocol"""
        msg = Message(MessageType.AUTH_REGISTER, {
            'username': username,
            'password': password,
            'email': email,
            'full_name': full_name
        }, self.client_id)
        self.send(msg.to_json())
    
    def auth_login(self, username: str, password: str):
        """Send authentication login request via protocol"""
        msg = Message(MessageType.AUTH_LOGIN, {
            'username': username,
            'password': password
        }, self.client_id)
        self.send(msg.to_json())
    
    def auth_logout(self):
        """Send authentication logout request via protocol"""
        msg = Message(MessageType.AUTH_LOGOUT, client_id=self.client_id)
        self.send(msg.to_json())
    
    def request_auth_status(self):
        """Request current authentication status via protocol"""
        msg = Message(MessageType.AUTH_STATUS, client_id=self.client_id)
        self.send(msg.to_json())
    
    # R2 Asset Management methods
    
    def request_asset_download(self, asset_id: str, session_code: Optional[str] = None):
        """Request download URL for an asset from the server"""
        msg = Message(MessageType.ASSET_DOWNLOAD_REQUEST, {
            'asset_id': asset_id,
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested download for asset {asset_id}")

    def request_asset_upload(self, filename: str, file_size: int, file_hash: str, asset_id: str, content_type: Optional[str] = None, session_code: Optional[str] = None):
        """Request upload URL for an asset to the server"""
        if asset_id != file_hash[:16]:
            raise ValueError("asset_id must match first 16 chars of file_hash")
        msg = Message(MessageType.ASSET_UPLOAD_REQUEST, {
            'filename': filename,
            'file_size': file_size,
            'xxhash': file_hash,
            'asset_id': asset_id,
            'session_code': session_code or self.session_code or 'unknown',
            'content_type': self._get_content_type(filename),
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested upload for file {filename}")

    def request_asset_list(self, session_code: Optional[str] = None):
        """Request list of available assets for the session"""
        msg = Message(MessageType.ASSET_LIST_REQUEST, {
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info("Requested asset list")

    def confirm_asset_upload(self, asset_id: str, file_xxhash: str, upload_success: bool, error_message: Optional[str] = None):
        """Confirm completion of asset upload to server"""
        msg = Message(MessageType.ASSET_UPLOAD_CONFIRM, {
            'asset_id': asset_id,
            'success': upload_success,
            'error': error_message,
            'user_id': self.user_id or 0,
            'session_code': self.session_code or 'unknown',
            'xxhash': file_xxhash,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Confirmed upload for asset {asset_id}: {'success' if upload_success else 'failed'} (user_id: {self.user_id})")

    def handle_asset_download_response(self, msg: Message):
        """Handle asset download response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty asset download response received")
                return
                
            # Delegate to Actions instead of handling directly
            self.Actions.handle_asset_download_response(msg.data)
            
        except Exception as e:            
            logger.error(f"Error handling asset download response: {e}")

    def handle_asset_list_response(self, msg: Message):
        """Handle asset list response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty asset list response received")
                return
                
            # Delegate to Actions instead of handling directly
            self.Actions.handle_asset_list_response(msg.data)
            
        except Exception as e:
            logger.error(f"Error handling asset list response: {e}")

    def handle_asset_upload_response(self, msg: Message):
        """Handle asset upload response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty asset upload response received")
                return
            if msg.data.get('success') and not msg.data.get('upload_url'):
                logger.debug("Asset upload response indicates success but no upload URL provided")
                return    
            # Delegate to Actions instead of handling directly
            self.Actions.handle_asset_upload_response(msg.data)
            
        except Exception as e:
            logger.error(f"Error handling asset upload response: {e}")
   
   
    def _get_content_type(self, file_path: str) -> str:
        """Get the appropriate content type for a file"""
        try:
            _, ext = os.path.splitext(file_path.lower())
            content_types = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml'
            }
            return content_types.get(ext, 'application/octet-stream')
        except Exception:
            return 'application/octet-stream'

    def handle_welcome(self, msg: Message):
        """Handle welcome message from server and save user information"""
        try:
            if not msg.data:
                logger.warning("Empty welcome message received")
                return
                
            # Store user information in ClientProtocol for message construction
            self.user_id = msg.data.get('user_id', 0)
            if msg.data.get('username') is not None:
                self.username = msg.data.get('username', 'unknown')
            self.session_code = msg.data.get('session_code', 'unknown')
            
            # Update client ID from server if provided
            server_client_id = msg.data.get('client_id')
            if server_client_id:
                self.client_id = server_client_id
            
            logger.info(f"Welcome message received: user_id={self.user_id}, username={self.username}, session={self.session_code}")
            
            # Delegate welcome handling to Actions for any game logic
            if hasattr(self.Actions, 'handle_welcome_message'):
                self.Actions.handle_welcome_message(msg.data)
                
        except Exception as e:
            logger.error(f"Error handling welcome message: {e}")

    def handle_sprite_create(self, msg: Message):
        """Handle sprite creation request from server"""
        try:
            if not msg.data:
                logger.error("Empty sprite creation request received")
                return
            
            sprite_data = msg.data.get('sprite_data')
            table_id = msg.data.get('table_id')
            if not sprite_data:
                logger.error("Sprite creation request missing sprite_data")
                return
            coord_x= sprite_data.get('coord_x', 0)
            coord_y = sprite_data.get('coord_y', 0)
            position = Position(x=coord_x, y=coord_y)
            image_path = sprite_data.get('texture_path', '')

            self.Actions.create_sprite(table_id, position=position, image_path=image_path, **sprite_data, to_server=False)

            logger.info(f"Sprite created successfully with ID: {sprite_data.get('sprite_id')}")
            if hasattr(self.Actions, 'add_chat_message'):
                self.Actions.add_chat_message(f"Sprite created with ID: {sprite_data.get('sprite_id')}")
        except Exception as e:
            logger.error(f"Error handling sprite creation: {e}")
            if hasattr(self.Actions, 'add_chat_message'):
                self.Actions.add_chat_message(f"Error creating sprite: {str(e)}")

    def handle_sprite_remove(self, msg: Message):
        """Handle sprite removal request from server"""
        try:
            if not msg.data:
                logger.error("Empty sprite removal request received")
                return
            

            sprite_id = msg.data.get('sprite_id')
            table_id = msg.data.get('table_id')
            if not sprite_id or not table_id:
                logger.error("Sprite removal request missing sprite_id or table_id")
                return
            
            self.Actions.delete_sprite(table_id, sprite_id, to_server=False)
            logger.info(f"Sprite {sprite_id} removed successfully from table {table_id}")
            if hasattr(self.Actions, 'add_chat_message'):
                self.Actions.add_chat_message(f"Sprite {sprite_id} removed successfully")
                
        except Exception as e:
            logger.error(f"Error handling sprite removal: {e}")
            if hasattr(self.Actions, 'add_chat_message'):
                self.Actions.add_chat_message(f"Error removing sprite: {str(e)}")
    def handle_sprite_response(self, msg: Message):
        """Handle sprite operation response from server"""
        try:
            if not msg.data:
                logger.error("Empty sprite response received")
                return
            
            sprite_id = msg.data.get('sprite_id')
            operation = msg.data.get('operation', 'unknown')
            success = msg.data.get('success', True)
            
            if success:
                logger.info(f"Sprite operation '{operation}' successful for sprite {sprite_id}")
                if hasattr(self.Actions, 'add_chat_message'):
                    self.Actions.add_chat_message(f"✅ Sprite {operation} successful")
            else:
                error = msg.data.get('error', 'Unknown error')
                logger.error(f"Sprite operation '{operation}' failed for sprite {sprite_id}: {error}")
                if hasattr(self.Actions, 'add_chat_message'):
                    self.Actions.add_chat_message(f"❌ Sprite {operation} failed: {error}")
                    
        except Exception as e:
            logger.error(f"Error handling sprite response: {e}")

    def handle_table_list_response(self, msg: Message):
        """Handle table list response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty table list response received")
                return
            
            tables = msg.data.get('tables', [])
            logger.info(f"Received table list with {len(tables)} tables")
            
            # Simple logging of tables instead of trying to update non-existent method
            for table in tables:
                logger.info(f"Available table: {table}")
            
            self.Actions.add_chat_message(f"📋 Received {len(tables)} tables from server")
                
        except Exception as e:
            logger.error(f"Error handling table list response: {e}")
    
    # Network Management Methods
    
    def request_player_list(self, session_code: Optional[str] = None):
        """Request list of players in the current session"""
        msg = Message(MessageType.PLAYER_LIST_REQUEST, {
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested player list for session {session_code or self.session_code}")

    def kick_player(self, player_id: str, username: str, reason: str = "No reason provided", session_code: Optional[str] = None):
        """Request to kick a player from the session"""
        msg = Message(MessageType.PLAYER_KICK_REQUEST, {
            'player_id': player_id,
            'username': username,
            'reason': reason,
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested to kick player {username} (ID: {player_id}): {reason}")

    def ban_player(self, player_id: str, username: str, reason: str = "No reason provided", duration: str = "permanent", session_code: Optional[str] = None):
        """Request to ban a player from the session"""
        msg = Message(MessageType.PLAYER_BAN_REQUEST, {
            'player_id': player_id,
            'username': username,
            'reason': reason,
            'duration': duration,
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested to ban player {username} (ID: {player_id}) for {duration}: {reason}")

    def request_connection_status(self, session_code: Optional[str] = None):
        """Request current connection status"""
        msg = Message(MessageType.CONNECTION_STATUS_REQUEST, {
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested connection status for session {session_code or self.session_code}")

    # Network Management Response Handlers
    
    def handle_player_list_response(self, msg: Message):
        """Handle player list response from server"""
        try:
            if not msg.data:
                logger.warning("Player list response has no data")
                return
            
            players = msg.data.get('players', [])
            count = msg.data.get('count', 0)
            session_code = msg.data.get('session_code', 'unknown')
            
            logger.info(f"Received player list for session {session_code}: {count} players")
            
            # Delegate to Actions for state management
            self.Actions.handle_player_list(players)
            
        except Exception as e:
            logger.error(f"Error handling player list response: {e}")

    def handle_player_kick_response(self, msg: Message):
        """Handle player kick response from server"""
        try:
            if not msg.data:
                logger.warning("Player kick response has no data")
                return
            
            success = msg.data.get('success', False)
            kicked_player = msg.data.get('kicked_player', 'unknown')
            reason = msg.data.get('reason', 'No reason provided')
            kicked_by = msg.data.get('kicked_by', 'unknown')
            
            if success:
                logger.info(f"Player {kicked_player} was kicked by {kicked_by}: {reason}")
            else:
                logger.warning(f"Failed to kick player {kicked_player}")
            
            # Delegate to Actions for UI updates
            # self.Actions.handle_player_kick_result(success, kicked_player, reason)
            
        except Exception as e:
            logger.error(f"Error handling player kick response: {e}")

    def handle_player_ban_response(self, msg: Message):
        """Handle player ban response from server"""
        try:
            if not msg.data:
                logger.warning("Player ban response has no data")
                return
            
            success = msg.data.get('success', False)
            banned_player = msg.data.get('banned_player', 'unknown')
            reason = msg.data.get('reason', 'No reason provided')
            duration = msg.data.get('duration', 'permanent')
            banned_by = msg.data.get('banned_by', 'unknown')
            
            if success:
                logger.info(f"Player {banned_player} was banned by {banned_by} for {duration}: {reason}")
            else:
                logger.warning(f"Failed to ban player {banned_player}")
            
            # Delegate to Actions for UI updates
            # self.Actions.handle_player_ban_result(success, banned_player, reason, duration)
            
        except Exception as e:
            logger.error(f"Error handling player ban response: {e}")

    def handle_connection_status_response(self, msg: Message):
        """Handle connection status response from server"""
        try:
            if not msg.data:
                logger.warning("Connection status response has no data")
                return
            
            connected = msg.data.get('connected', False)
            session_code = msg.data.get('session_code', 'unknown')
            status = msg.data.get('status', {})
            
            logger.info(f"Connection status for session {session_code}: {'connected' if connected else 'disconnected'}")
            
            # Delegate to Actions for state management
            self.Actions.update_connection_status(status)
            
        except Exception as e:
            logger.error(f"Error handling connection status response: {e}")

    def handle_player_joined(self, msg: Message):
        """Handle player joined notification from server"""
        try:
            if not msg.data:
                logger.warning("Player joined message has no data")
                return
            
            username = msg.data.get('username', 'unknown')
            user_id = msg.data.get('user_id', 0)
            client_id = msg.data.get('client_id', 'unknown')
            timestamp = msg.data.get('timestamp', 'unknown')
            
            logger.info(f"Player {username} (ID: {user_id}) joined the session at {timestamp}")
            
            # Delegate to Actions for UI updates
            self.Actions.player_joined(user_id)
            
        except Exception as e:
            logger.error(f"Error handling player joined notification: {e}")

    def handle_player_left(self, msg: Message):
        """Handle player left notification from server"""
        try:
            if not msg.data:
                logger.warning("Player left message has no data")
                return
            
            username = msg.data.get('username', 'unknown')
            reason = msg.data.get('reason', 'Left the session')
            timestamp = msg.data.get('timestamp', 'unknown')
            kicked = msg.data.get('kicked', False)
            banned = msg.data.get('banned', False)
            
            if kicked:
                logger.info(f"Player {username} was kicked: {reason}")
            elif banned:
                logger.info(f"Player {username} was banned: {reason}")
            else:
                logger.info(f"Player {username} left the session at {timestamp}")
            
            # Delegate to Actions for UI updates
            self.Actions.player_left(username)
            
        except Exception as e:
            logger.error(f"Error handling player left notification: {e}")

    # =========================================================================
    # AUTHENTICATION & SESSION MANAGEMENT
    # =========================================================================
    
    def register_user(self, server_url: str, username: str, password: str) -> Dict[str, Any]:
        """Register a new user on the server"""
        try:
            import requests
            response = requests.post(
                f"{server_url}/users/register",
                data={
                    "username": username,
                    "password": password
                },
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"User {username} registered successfully")
                return {
                    'success': True,
                    'message': 'Registration successful! Please login.',
                    'data': response.json() if response.content else {}
                }
            else:
                error_msg = f"Registration failed: {response.text}"
                logger.error(error_msg)
                return {
                    'success': False,
                    'message': error_msg,
                    'status_code': response.status_code
                }
                
        except Exception as e:
            error_msg = f"Connection error during registration: {str(e)}"
            logger.error(error_msg)
            return {
                'success': False,
                'message': error_msg,
                'error': str(e)
            }

    def login_user(self, server_url: str, username: str, password: str) -> Dict[str, Any]:
        """Login user and get JWT token"""
        try:
            import requests
            response = requests.post(
                f"{server_url}/users/token",
                data={
                    "username": username,
                    "password": password
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                jwt_token = data.get("access_token", "")
                
                # Store authentication info
                self.username = username
                self.jwt_token = jwt_token
                
                logger.info(f"Successfully authenticated as {username}")
                return {
                    'success': True,
                    'message': 'Login successful',
                    'jwt_token': jwt_token,
                    'username': username,
                    'data': data
                }
            else:
                error_msg = f"Login failed: {response.text}"
                logger.error(error_msg)
                return {
                    'success': False,
                    'message': error_msg,
                    'status_code': response.status_code
                }
                
        except Exception as e:
            error_msg = f"Connection error during login: {str(e)}"
            logger.error(error_msg)
            return {
                'success': False,
                'message': error_msg,
                'error': str(e)
            }

    def logout_user(self) -> Dict[str, Any]:
        """Logout user and clear authentication data"""
        try:
            # Clear stored authentication info
            self.username = None
            self.user_id = None
            self.session_code = None
            self.jwt_token = None
            
            logger.info("User logged out")
            return {
                'success': True,
                'message': 'Logged out successfully'
            }
        except Exception as e:
            error_msg = f"Error during logout: {str(e)}"
            logger.error(error_msg)
            return {
                'success': False,
                'message': error_msg,
                'error': str(e)
            }

    def fetch_user_sessions(self, server_url: str, jwt_token: str) -> Dict[str, Any]:
        """Fetch user's available game sessions"""
        try:
            import requests
            response = requests.get(
                f"{server_url}/game/api/sessions",
                headers={"Authorization": f"Bearer {jwt_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                sessions = response.json()
                logger.info(f"Fetched {len(sessions)} sessions")
                return {
                    'success': True,
                    'message': f'Found {len(sessions)} sessions',
                    'sessions': sessions
                }
            else:
                error_msg = f"Failed to fetch sessions: {response.text}"
                logger.error(error_msg)
                return {
                    'success': False,
                    'message': error_msg,
                    'status_code': response.status_code
                }
                
        except Exception as e:
            error_msg = f"Error fetching sessions: {str(e)}"
            logger.error(error_msg)
            return {
                'success': False,
                'message': error_msg,
                'error': str(e)
            }

    def test_server_connection(self, server_url: str) -> Dict[str, Any]:
        """Test if the server URL is reachable"""
        try:
            import requests
            response = requests.get(f"{server_url}/health", timeout=5)
            success = response.status_code in [200, 404, 405]
            return {
                'success': success,
                'message': 'Server reachable' if success else f'Server returned {response.status_code}',
                'status_code': response.status_code,
                'reachable': success
            }
        except Exception as e:
            error_msg = f"Server connection test failed: {str(e)}"
            logger.debug(error_msg)
            return {
                'success': False,
                'message': error_msg,
                'reachable': False,
                'error': str(e)
            }

    def parse_server_url(self, server_url: str, fallback_port: str = "12345") -> Dict[str, str]:
        """Parse server URL to extract hostname and port"""
        try:
            from urllib.parse import urlparse
            
            # Handle URLs without scheme
            url_to_parse = server_url
            if not url_to_parse.startswith(('http://', 'https://')):
                url_to_parse = 'http://' + url_to_parse
            
            parsed = urlparse(url_to_parse)
            
            # Extract hostname (IP or domain)
            hostname = parsed.hostname or "127.0.0.1"
            
            # Use explicit port from URL, or default to fallback
            port = str(parsed.port) if parsed.port else fallback_port
            
            logger.info(f"Parsed server: {hostname}:{port}")
            return {
                'hostname': hostname,
                'port': port,
                'full_url': server_url
            }
            
        except Exception as e:
            error_msg = f"Error parsing server URL '{server_url}': {e}"
            logger.error(error_msg)
            return {
                'hostname': "127.0.0.1",
                'port': fallback_port,
                'full_url': server_url,
                'error': error_msg
            }

    def set_authentication_info(self, username: str, jwt_token: str, session_code: str = "", user_id: Optional[int] = None):
        """Set authentication information for this client"""
        self.username = username
        self.jwt_token = jwt_token
        self.session_code = session_code
        self.user_id = user_id
        logger.info(f"Authentication info set for user: {username}")

    def get_authentication_info(self) -> Dict[str, Any]:
        """Get current authentication information"""
        return {
            'username': self.username,
            'jwt_token': getattr(self, 'jwt_token', None),
            'session_code': self.session_code,
            'user_id': self.user_id,
            'is_authenticated': bool(getattr(self, 'jwt_token', None))
        }

    def is_authenticated(self) -> bool:
        """Check if user is authenticated"""
        return self.jwt_token is not None and self.username is not None

    # =========================================================================
    # CHARACTER MANAGEMENT
    # =========================================================================
    
    def character_save(self, character_data: Dict[str, Any], session_code: Optional[str] = None):
        """Save character to server"""
        msg = Message(MessageType.CHARACTER_SAVE_REQUEST, {
            'character_data': character_data,
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested character save: {character_data.get('name', 'Unknown')}")

    def character_load(self, character_id: str, session_code: Optional[str] = None):
        """Load character from server"""
        msg = Message(MessageType.CHARACTER_LOAD_REQUEST, {
            'character_id': character_id,
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested character load: {character_id}")

    def character_list(self, session_code: Optional[str] = None):
        """Request list of characters from server"""
        msg = Message(MessageType.CHARACTER_LIST_REQUEST, {
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info("Requested character list")

    def character_delete(self, character_id: str, session_code: Optional[str] = None):
        """Delete character from server"""
        msg = Message(MessageType.CHARACTER_DELETE_REQUEST, {
            'character_id': character_id,
            'session_code': session_code or self.session_code or 'unknown',
            'user_id': self.user_id or 0,
            'username': self.username or 'unknown'
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested character delete: {character_id}")

    def handle_character_save_response(self, msg: Message):
        """Handle character save response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty character save response received")
                return
            
            # Delegate to Actions
            if hasattr(self.Actions, 'handle_character_save_response'):
                self.Actions.handle_character_save_response(msg.data)
            else:
                # Fallback to chat message
                if msg.data.get('success'):
                    self.Actions.add_chat_message(f"✅ Character saved: {msg.data.get('character_name', 'Unknown')}")
                else:
                    self.Actions.add_chat_message(f"❌ Failed to save character: {msg.data.get('error', 'Unknown error')}")
            
        except Exception as e:
            logger.error(f"Error handling character save response: {e}")

    def handle_character_load_response(self, msg: Message):
        """Handle character load response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty character load response received")
                return
            
            # Delegate to Actions
            if hasattr(self.Actions, 'handle_character_load_response'):
                self.Actions.handle_character_load_response(msg.data)
            else:
                # Fallback to chat message
                if msg.data.get('success'):
                    self.Actions.add_chat_message(f"✅ Character loaded: {msg.data.get('character_name', 'Unknown')}")
                else:
                    self.Actions.add_chat_message(f"❌ Failed to load character: {msg.data.get('error', 'Unknown error')}")
            
        except Exception as e:
            logger.error(f"Error handling character load response: {e}")

    def handle_character_list_response(self, msg: Message):
        """Handle character list response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty character list response received")
                return
            
            # Delegate to Actions
            if hasattr(self.Actions, 'handle_character_list_response'):
                self.Actions.handle_character_list_response(msg.data)
            else:
                # Fallback to chat message
                characters = msg.data.get('characters', [])
                self.Actions.add_chat_message(f"📋 Server characters ({len(characters)}): {', '.join([c.get('name', 'Unknown') for c in characters])}")
            
        except Exception as e:
            logger.error(f"Error handling character list response: {e}")

    def handle_character_delete_response(self, msg: Message):
        """Handle character delete response from server - delegate to Actions"""
        try:
            if not msg.data:
                logger.error("Empty character delete response received")
                return
            
            # Delegate to Actions
            if hasattr(self.Actions, 'handle_character_delete_response'):
                self.Actions.handle_character_delete_response(msg.data)
            else:
                # Fallback to chat message
                if msg.data.get('success'):
                    self.Actions.add_chat_message(f"🗑️ Character deleted: {msg.data.get('character_name', 'Unknown')}")
                else:
                    self.Actions.add_chat_message(f"❌ Failed to delete character: {msg.data.get('error', 'Unknown error')}")
            
        except Exception as e:
            logger.error(f"Error handling character delete response: {e}")


