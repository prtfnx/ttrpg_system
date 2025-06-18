import os
import time
import hashlib
import asyncio
import threading
from typing import Callable, Optional, Dict, Any
from .protocol import Message, MessageType, ProtocolHandler
import logging
import Actions
import requests
logger = logging.getLogger(__name__)

class ClientProtocol:
    def __init__(self, context, send_callback: Callable[[str], None]):
        self.context = context
        self.send = send_callback
        self.client_id = hashlib.md5(f"{time.time()}_{os.getpid()}".encode()).hexdigest()[:8]
        self.last_ping = time.time()
        self.handlers: Dict[MessageType, Callable[[Message], None]] = {}
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


    def register_handler(self, msg_type: MessageType, handler: Callable[[Message], None]):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler
    
    def request_table(self, table_name: Optional[str] = None):
        msg = Message(MessageType.TABLE_REQUEST, {'name': table_name}, self.client_id)
        self.send(msg.to_json())
    
    def request_file(self, filename: str):
        msg = Message(MessageType.FILE_REQUEST, {'filename': filename}, self.client_id)
        self.send(msg.to_json())

    def send_update(self, update_type: str, data: Dict[str, Any]):
        msg = Message(MessageType.TABLE_UPDATE, {
            'type': update_type, 
            'data': data
        }, self.client_id)
        self.send(msg.to_json())

    def ping(self):
        if time.time() - self.last_ping > 30:  # 30 second intervals
            msg = Message(MessageType.PING, client_id=self.client_id)
            self.send(msg.to_json())
            self.last_ping = time.time()
    

    
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
        data= msg.data
        if not data or 'name' not in data:
            logger.error("Received empty new table response data")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty new table response data'
            }, self.client_id).to_json())
            return
        table_name = data['name']
        self.context.actions.create_table_from_dict(data)
    
    def handle_table_response(self, msg: Message):
        data = msg.data
        logger.info(f"Handling table response with data: {data}")
        logger.debug(f"Table response data: {data}")
        if not data or 'name' not in data:
            logger.error("Received empty new table response data")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty new table response data'
            }, self.client_id).to_json())
            return
        table_name = data['name']
        if table_name in self.context.list_of_tables:
            logger.info(f"Table {table_name} already exists, updating it")
            self.table_update(msg)
        else:
            logger.info(f"Creating new table: {table_name}")
            self.context.actions.create_table_from_dict(data.get('table_data', {}))
            # Create table from data


    def table_update(self, msg: Message):
        """Update local table from server data"""
        data = msg.data
        if data is None:
            logger.error("Received empty table update data")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty table update data'
            }, self.client_id).to_json()) 
            return
        
        if not self.context.current_table:
            self.context.add_table(data['name'], data['width'], data['height'])
        
        table = self.context.current_table
        table.scale = data.get('scale', 1.0)
        table.x_moved = data.get('x_moved', 0.0)
        table.y_moved = data.get('y_moved', 0.0)
        table.show_grid = data.get('show_grid', True)
        logger.debug(f"Updating table: {table.name} with scale {table.scale}, moved ({table.x_moved}, {table.y_moved}), grid {table.show_grid}")
        # Load entities
        for layer, entities in data.get('entities', {}).items():
            #table.dict_of_sprites_list[layer].clear()
            for entity in entities:
                logger.debug(f"proccess {entity} from: {layer}")
                self.context.add_sprite(
                    texture_path=entity['texture_path'].encode(),
                    scale_x=entity.get('scale_x', 1.0),
                    scale_y=entity.get('scale_y', 1.0),
                    layer=layer,
                    sprite_id=entity.get('sprite_id', None),
                )
        
        # Request missing files
        for filename in data.get('files', []):
            if not os.path.exists(filename):
                self.request_file(filename)
    
    def create_table(self, message: Message):
        """Create a new table from the provided data"""
        data = message.data
        if data is None:
            logger.error("Received empty table creation data")
            self.send(Message(MessageType.ERROR, {
                'error': 'Received empty table creation data'
            }, self.client_id).to_json())
            return

        self.context.create_table_from_json(data)
        
        
    def handle_request_table(self, msg: Message):
        """Handle table request from server"""
        data = msg.data
        if not data or 'name' not in data:
            logger.error("Invalid table request data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid table request data received'
            }, self.client_id).to_json())
            return
        
        table_name = data['name']
        logger.info(f"Requesting table: {table_name}")
        table = self.context.get_table_by_name(table_name)
        
        if not table:
            logger.error(f"Table {table_name} not found in context")
            self.send(Message(MessageType.ERROR, {
                'error': f"Table {table_name} not found"
            }, self.client_id).to_json())
            return
        self.send(Message(MessageType.TABLE_DATA, {
            'name': table_name,
            'client_id': self.client_id,
            'data': table.to_dict()
        }, self.client_id).to_json())

     
    def handle_table_data(self, msg: Message):
        """Handle table data received from server"""
        data = msg.data
        if not data or 'name' not in data or 'data' not in data:
            logger.error("Invalid table data received")
            self.send(Message(MessageType.ERROR, {
                'error': 'Invalid table data received'
            }, self.client_id).to_json())
            return
        
        table_name = data['table_name']
       

        logger.info(f"Received table data for {table_name}")
        if not self.context.current_table or self.context.current_table.name != table_name:
            # If current table is not set or does not match, create a new one
            self.context.create_table_from_json(data)
        self.apply_table_update(msg)        
        # Notify GUI if available
        if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
            self.context.gui_system.gui_state.chat_messages.append(f"Table {table_name} updated")
    def save_file(self, msg: Message):
        """Save downloaded file"""
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
    
    def send_sprite_update(self, update_type: str, sprite_data: Dict[str, Any]):
        """Send sprite-specific updates"""
        
        msg = Message(MessageType.SPRITE_UPDATE, {
            'category': 'sprite',
            'type': update_type, 
            'data': sprite_data
        }, self.client_id)
        self.send(msg.to_json())

    def apply_table_update(self, msg: Message):
        """Apply table update from server"""
        #TODO make it thriught actions
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
        
        if not self.context.current_table:
            return
        
        if category == 'sprite':
            self.apply_sprite_update(msg)
        else:
            # Handle table updates (existing code)
            table = self.context.current_table
            if update_type == 'scale':
                table.scale = update_data['scale']
            elif update_type == 'move':
                table.x_moved = update_data['x_moved']
                table.y_moved = update_data['y_moved']
            elif update_type == 'grid':
                table.show_grid = update_data['show_grid']
    
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
        if not sprite_id:
            return
       
        sprite = self.context.find_sprite_by_id(sprite_id, table_id=table_id)
        if not sprite:
            logger.warning(f"Sprite not found: {sprite_id}")
            return
        
        if update_type == 'sprite_move':
            logger.info(f"Applying sprite move: {sprite_id}")
            to_pos = sprite_data.get('to', {})
            sprite.coord_x.value = float(to_pos.get('x', sprite.coord_x.value))
            sprite.coord_y.value = float(to_pos.get('y', sprite.coord_y.value))
            
            # Update network tracking
            sprite._last_network_x = sprite.coord_x.value
            sprite._last_network_y = sprite.coord_y.value
            
            logger.info(f"Applied sprite move: {sprite_id} to ({sprite.coord_x.value:.1f}, {sprite.coord_y.value:.1f})")
            
        elif update_type == 'position_correction':
            # Server rejected the move, revert to correct position
            correct_pos = data.get('position', {})
            sprite.coord_x.value = float(correct_pos.get('x', sprite.coord_x.value))
            sprite.coord_y.value = float(correct_pos.get('y', sprite.coord_y.value))
            
            sprite._last_network_x = sprite.coord_x.value
            sprite._last_network_y = sprite.coord_y.value
            
            # Show user feedback
            reason = data.get('reason', 'Unknown')
            logger.warning(f"Position corrected for sprite {sprite_id}: {reason}")
            
            # Add to chat if available
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                self.context.gui_system.gui_state.chat_messages.append(f"Move blocked: {reason}")
            
        elif update_type == 'sprite_scale':
            to_scale = data.get('to', {})
            sprite.scale_x = float(to_scale.get('x', sprite.scale_x))
            sprite.scale_y = float(to_scale.get('y', sprite.scale_y))
            
            logger.info(f"Applied sprite scale: {sprite_id} to ({sprite.scale_x:.2f}, {sprite.scale_y:.2f})")
    
    # Compendium sprite methods
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
        """Handle compendium sprite addition from server"""
        try:
            logger.info(f"Handling compendium sprite add: {data}")
            
            sprite_data = data.get('sprite_data', {})
            table_name = data.get('table_name', 'default')
            
            if not sprite_data:
                logger.error("No sprite data in compendium sprite add")
                return
            
            # Get the table or use current table
            table = self.context.get_table_by_name(table_name) if hasattr(self.context, 'get_table_by_name') else self.context.current_table
            if not table:
                logger.error(f"Table {table_name} not found for compendium sprite add")
                return
            
            # Extract sprite information
            name = sprite_data.get('name', 'Unknown Entity')
            entity_type = sprite_data.get('entity_type', 'unknown')
            position = sprite_data.get('position', {'x': 0, 'y': 0})
            layer = sprite_data.get('layer', 'tokens')
            scale_x = sprite_data.get('scale_x', 1.0)
            scale_y = sprite_data.get('scale_y', 1.0)
            compendium_data = sprite_data.get('compendium_data', {})
            
            # Import compendium_sprites to create the sprite
            try:
                from compendium_sprites import create_compendium_sprite
                  # Create the sprite using the compendium helper
                sprite = create_compendium_sprite(
                    entity=compendium_data,
                    entity_type=entity_type,
                    position=(position['x'], position['y']),
                    context=self.context
                )
                
                if sprite:
                    # Add sprite to the table
                    if hasattr(table, 'add_sprite'):
                        table.add_sprite(sprite, layer)
                    else:
                        # Fallback to context method
                        self.context.add_sprite_to_table(sprite, layer, table_name)
                    
                    logger.info(f"Added compendium sprite {name} to table {table_name}")
                    
                    # Add to chat if available
                    if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                        self.context.gui_system.gui_state.chat_messages.append(f"Added {entity_type}: {name}")
                else:
                    logger.error(f"Failed to create compendium sprite for {name}")
                    
            except ImportError as e:
                logger.error(f"Could not import compendium_sprites: {e}")
            except Exception as e:
                logger.error(f"Error creating compendium sprite: {e}")
                
        except Exception as e:
            logger.error(f"Error handling compendium sprite add: {e}")
    
    def _handle_compendium_sprite_update(self, data: Dict[str, Any]):
        """Handle compendium sprite update from server"""
        try:
            logger.info(f"Handling compendium sprite update: {data}")
            
            sprite_id = data.get('sprite_id')
            table_name = data.get('table_name', 'default')
            updates = data.get('updates', {})
            
            if not sprite_id:
                logger.error("No sprite_id in compendium sprite update")
                return
            
            # Find the sprite
            sprite = self.context.find_sprite_by_id(sprite_id, table_name=table_name)
            if not sprite:
                logger.warning(f"Compendium sprite not found: {sprite_id}")
                return
            
            # Apply updates
            for key, value in updates.items():
                if key == 'position':
                    sprite.coord_x.value = float(value.get('x', sprite.coord_x.value))
                    sprite.coord_y.value = float(value.get('y', sprite.coord_y.value))
                elif key == 'scale':
                    sprite.scale_x = float(value.get('x', sprite.scale_x))
                    sprite.scale_y = float(value.get('y', sprite.scale_y))
                elif key == 'rotation':
                    if hasattr(sprite, 'rotation'):
                        sprite.rotation = float(value)
                elif hasattr(sprite, key):
                    setattr(sprite, key, value)
            
            logger.info(f"Updated compendium sprite: {sprite_id}")
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite update: {e}")
    
    def _handle_compendium_sprite_remove(self, data: Dict[str, Any]):
        """Handle compendium sprite removal from server"""
        try:
            logger.info(f"Handling compendium sprite remove: {data}")
            
            sprite_id = data.get('sprite_id')
            table_name = data.get('table_name', 'default')
            
            if not sprite_id:
                logger.error("No sprite_id in compendium sprite remove")
                return
            
            # Find and remove the sprite
            sprite = self.context.find_sprite_by_id(sprite_id, table_name=table_name)
            if not sprite:
                logger.warning(f"Compendium sprite not found for removal: {sprite_id}")
                return
            
            # Remove sprite from table
            table = self.context.get_table_by_name(table_name) if hasattr(self.context, 'get_table_by_name') else self.context.current_table
            if table and hasattr(table, 'remove_sprite'):
                table.remove_sprite(sprite)
            else:
                # Fallback to context removal
                self.context.remove_sprite_from_table(sprite, table_name)
            
            logger.info(f"Removed compendium sprite: {sprite_id}")
            
            # Add to chat if available
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                sprite_name = getattr(sprite, 'name', sprite_id)
                self.context.gui_system.gui_state.chat_messages.append(f"Removed sprite: {sprite_name}")
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite remove: {e}")

    def _handle_auth_token(self, msg: Message):
        """Handle authentication token response"""
        data= msg.data
        if not data:
            logger.error("Received empty authentication token data")
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                self.context.gui_system.gui_state.chat_messages.append("❌ Authentication failed - no data received")
            return
        try:
            access_token = data.get('access_token')
            token_type = data.get('token_type', 'bearer')
            
            if access_token:
                logger.info("Authentication successful - received JWT token")
                # Store token in context if available
                if hasattr(self.context, 'auth_token'):
                    self.context.auth_token = access_token
                if hasattr(self.context, 'is_authenticated'):
                    self.context.is_authenticated = True
                    
                # Add to chat if available
                if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                    self.context.gui_system.gui_state.chat_messages.append("✅ Authentication successful")
            else:
                logger.error("Authentication failed - no token received")
                if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                    self.context.gui_system.gui_state.chat_messages.append("❌ Authentication failed")
                    
        except Exception as e:
            logger.error(f"Error handling auth token: {e}")

    def _handle_auth_status(self, msg: Message):
        """Handle authentication status response"""
        data = msg.data
        if not data:
            logger.error("Received empty authentication status data")
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                self.context.gui_system.gui_state.chat_messages.append("❌ Authentication status check failed - no data received")
            return
        try:
            is_authenticated = data.get('authenticated', False)
            username = data.get('username')
            
            logger.info(f"Authentication status: {'authenticated' if is_authenticated else 'not authenticated'}")
            
            # Update context if available
            if hasattr(self.context, 'is_authenticated'):
                self.context.is_authenticated = is_authenticated
            if hasattr(self.context, 'username') and username:
                self.context.username = username
                
            # Add to chat if available
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                status_msg = f"Auth status: {'✅ Authenticated' if is_authenticated else '❌ Not authenticated'}"
                if username:
                    status_msg += f" as {username}"
                self.context.gui_system.gui_state.chat_messages.append(status_msg)
                
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
        if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
            self.context.gui_system.gui_state.chat_messages.append(f"❌ Server error: {error_message}")
    
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
        if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
            self.context.gui_system.gui_state.chat_messages.append(f"✅ Success: {success_data.get('message', '')}")

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
            'session_code': session_code or getattr(self.context, 'session_code', 'unknown'),
            'user_id': getattr(self.context, 'user_id', 0),
            'username': getattr(self.context, 'username', 'unknown')
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested download for asset {asset_id}")

    def request_asset_upload(self, filename: str, file_size: int, file_hash: str, session_code: Optional[str] = None):
        """Request upload URL for an asset to the server"""
        msg = Message(MessageType.ASSET_UPLOAD_REQUEST, {
            'filename': filename,
            'file_size': file_size,
            'file_hash': file_hash,
            'session_code': session_code or getattr(self.context, 'session_code', 'unknown'),
            'user_id': getattr(self.context, 'user_id', 0),
            'username': getattr(self.context, 'username', 'unknown')
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Requested upload for file {filename}")

    def request_asset_list(self, session_code: Optional[str] = None):
        """Request list of available assets for the session"""
        msg = Message(MessageType.ASSET_LIST_REQUEST, {
            'session_code': session_code or getattr(self.context, 'session_code', 'unknown'),
            'user_id': getattr(self.context, 'user_id', 0),
            'username': getattr(self.context, 'username', 'unknown')
        }, self.client_id)
        self.send(msg.to_json())
        logger.info("Requested asset list")

    def confirm_asset_upload(self, asset_id: str, upload_success: bool, error_message: Optional[str] = None):
        """Confirm completion of asset upload to server"""
        msg = Message(MessageType.ASSET_UPLOAD_CONFIRM, {
            'asset_id': asset_id,
            'success': upload_success,
            'error': error_message,
            'user_id': self.context.user_id,
            'username': getattr(self.context, 'username', 'unknown')
        }, self.client_id)
        self.send(msg.to_json())
        logger.info(f"Confirmed upload for asset {asset_id}: {'success' if upload_success else 'failed'} (user_id: {getattr(self.context, 'user_id', 0)})")

    def handle_asset_download_response(self, msg: Message):
        """Handle asset download response from server"""
        try:
            if not msg.data:
                logger.error("Empty asset download response received")
                return

            asset_id = msg.data.get('asset_id')
            download_url = msg.data.get('download_url')
            
            if not asset_id or not download_url:
                logger.error("Invalid asset download response: missing asset_id or download_url")
                return

            # Forward to asset manager
            from client_asset_manager import get_client_asset_manager
            asset_manager = get_client_asset_manager()
            success = asset_manager.handle_download_response(msg.data)
            
            if success:
                logger.info(f"Asset download queued: {asset_id}")
                # Trigger sprite texture reload if needed
                self._trigger_sprite_reload_for_asset(asset_id)
            else:
                logger.error(f"Failed to queue asset download: {asset_id}")
                
        except Exception as e:
            logger.error(f"Error handling asset download response: {e}")

    def handle_asset_list_response(self, msg: Message):
        """Handle asset list response from server"""
        try:
            if not msg.data:
                logger.error("Empty asset list response received")
                return

            assets = msg.data.get('assets', [])
            session_code = msg.data.get('session_code', 'unknown')
            
            logger.info(f"Received asset list for session {session_code}: {len(assets)} assets")
            
            # Forward to asset manager
            from client_asset_manager import get_client_asset_manager
            asset_manager = get_client_asset_manager()
            asset_manager.update_session_assets(assets)            
            # Trigger download of any missing assets for current sprites
            self._check_and_download_missing_assets()
            
        except Exception as e:
            logger.error(f"Error handling asset list response: {e}")

    def handle_asset_upload_response(self, msg: Message):
        """Handle asset upload response from server"""
        try:
            if not msg.data:
                logger.error("Empty asset upload response received")
                return

            # Accept both 'upload_url' and 'url' fields for compatibility
            upload_url = msg.data.get('upload_url') or msg.data.get('url')
            asset_id = msg.data.get('asset_id')
            filename = msg.data.get('filename')
            
            if not upload_url or not asset_id:
                logger.error("Invalid asset upload response: missing upload_url/url or asset_id")
                logger.error(f"Received data: {msg.data}")
                return            logger.info(f"Received upload URL for asset {asset_id}: {upload_url}")
            logger.debug(f"Upload response filename: {filename}")
            
            # Store upload info for reference
            if not hasattr(self.context, 'pending_uploads'):
                self.context.pending_uploads = {}
            # Normalize to use 'upload_url' internally
            normalized_data = dict(msg.data)
            normalized_data['upload_url'] = upload_url
            self.context.pending_uploads[asset_id] = normalized_data
            
            # Debug: Check what files we have tracked
            if hasattr(self.context, 'pending_upload_files'):
                logger.debug(f"Currently tracked upload files: {self.context.pending_upload_files}")
            else:
                logger.warning("No pending_upload_files attribute found in context")
            
            # Find the original file to upload
            original_file_path = self._find_original_file_for_asset(asset_id, filename)
            if original_file_path and os.path.exists(original_file_path):
                # Perform the actual upload in a background thread
                self._perform_background_upload(asset_id, upload_url, original_file_path)
            else:
                logger.error(f"Could not find original file for asset {asset_id} (filename: {filename})")
                self.confirm_asset_upload(asset_id, False, "Original file not found")
            
            # Notify GUI if available
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                self.context.gui_system.gui_state.chat_messages.append(f"📤 Uploading {filename}...")                
        except Exception as e:
            logger.error(f"Error handling asset upload response: {e}")

    def _find_original_file_for_asset(self, asset_id: str, filename: Optional[str]) -> Optional[str]:
        """Find the original file path for an asset being uploaded"""
        try:
            # Debug: Log what we're looking for
            logger.debug(f"Looking for original file for asset {asset_id}, filename: {filename}")
            
            # Check if we have the file tracked in pending_upload_files
            if hasattr(self.context, 'pending_upload_files'):
                logger.debug(f"Current pending_upload_files: {self.context.pending_upload_files}")
                file_path = self.context.pending_upload_files.get(asset_id)
                if file_path and os.path.exists(file_path):
                    logger.debug(f"Found file path in pending_upload_files: {file_path}")
                    return file_path
                else:
                    logger.debug(f"Asset {asset_id} not found in pending_upload_files or file doesn't exist")
                    
                    # Try to find by filename in pending_upload_files (in case asset IDs don't match)
                    if filename:
                        for stored_asset_id, file_path in self.context.pending_upload_files.items():
                            if file_path and os.path.exists(file_path) and os.path.basename(file_path) == filename:
                                logger.debug(f"Found file by filename match: {file_path} (stored under asset {stored_asset_id})")
                                return file_path
            
            # If filename is provided, check common locations
            if filename:
                logger.debug(f"Checking common locations for filename: {filename}")
                
                # Check if file exists in current directory
                if os.path.exists(filename):
                    logger.debug(f"Found file in current directory: {filename}")
                    return filename
                
                # Check common download/desktop paths (Windows specific)
                common_paths = [
                    os.path.join(os.path.expanduser("~"), "Downloads", filename),
                    os.path.join(os.path.expanduser("~"), "Desktop", filename),
                    os.path.join(os.getcwd(), filename),
                    os.path.join(os.getcwd(), "resources", filename)  # Check resources folder
                ]
                
                for path in common_paths:
                    if os.path.exists(path):
                        logger.debug(f"Found file at: {path}")
                        return path
                    else:
                        logger.debug(f"File not found at: {path}")
            
            logger.warning(f"Could not locate original file for asset {asset_id}, filename: {filename}")
            return None
            
        except Exception as e:
            logger.error(f"Error finding original file for asset {asset_id}: {e}")
            return None

    def _perform_background_upload(self, asset_id: str, upload_url: str, file_path: str):
        """Perform the actual file upload to R2 in a background thread"""
        def upload_worker():
            try:
                logger.info(f"Starting background upload of {file_path} to R2...")
                
                # Read the file content
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                
                # Determine content type based on file extension
                import mimetypes
                content_type, _ = mimetypes.guess_type(file_path)
                if not content_type:
                    content_type = 'application/octet-stream'
                  # Perform the HTTP PUT request to the presigned URL
                response = requests.put(
                    upload_url,
                    data=file_content,
                    headers={
                        'Content-Type': content_type
                    },
                    timeout=30  # 30 second timeout
                )
                
                if response.status_code == 200:
                    logger.info(f"Successfully uploaded {file_path} to R2")
                    
                    # Cache the uploaded file locally
                    try:
                        from client_asset_manager import get_client_asset_manager
                        asset_manager = get_client_asset_manager()
                        filename = os.path.basename(file_path)
                        
                        # Register the asset in local cache
                        asset_manager.register_uploaded_asset(asset_id, file_path, filename)
                        logger.info(f"Cached uploaded asset {asset_id} locally")
                    except Exception as cache_error:
                        logger.warning(f"Failed to cache uploaded asset {asset_id}: {cache_error}")
                    
                    # Confirm successful upload to server
                    self.confirm_asset_upload(asset_id, True)
                    
                    # Update GUI if available
                    if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                        filename = os.path.basename(file_path)
                        self.context.gui_system.gui_state.chat_messages.append(f"✅ Upload completed: {filename}")
                        
                else:
                    error_msg = f"Upload failed with status {response.status_code}: {response.text}"
                    logger.error(error_msg)
                    self.confirm_asset_upload(asset_id, False, error_msg)
                    
                    # Update GUI if available
                    if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                        filename = os.path.basename(file_path)
                        self.context.gui_system.gui_state.chat_messages.append(f"❌ Upload failed: {filename}")
                
            except Exception as e:
                error_msg = f"Upload error: {str(e)}"
                logger.error(f"Error uploading {file_path} to R2: {e}")
                self.confirm_asset_upload(asset_id, False, error_msg)
                
                # Update GUI if available
                if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                    filename = os.path.basename(file_path)
                    self.context.gui_system.gui_state.chat_messages.append(f"❌ Upload error: {filename}")
        
        # Start the upload in a background thread
        upload_thread = threading.Thread(target=upload_worker, daemon=True)
        upload_thread.start()

    def _trigger_sprite_reload_for_asset(self, asset_id: str):
        """Trigger texture reload for sprites using the given asset"""
        try:
            if not self.context.current_table:
                return
                
            # Check all sprites in all layers
            for layer_name, sprites in self.context.current_table.dict_of_sprites_list.items():
                for sprite in sprites:
                    if hasattr(sprite, 'asset_id') and sprite.asset_id == asset_id:
                        logger.info(f"Triggering texture reload for sprite {sprite.sprite_id}")
                        # Reload texture asynchronously
                        sprite.set_texture(sprite.texture_path)
        except Exception as e:
            logger.error(f"Error triggering sprite reload for asset {asset_id}: {e}")

    def _check_and_download_missing_assets(self):
        """Check current sprites and download any missing R2 assets"""
        try:
            if not self.context.current_table:
                return
                
            from client_asset_manager import get_client_asset_manager
            asset_manager = get_client_asset_manager()
            
            # Check all sprites in all layers
            for layer_name, sprites in self.context.current_table.dict_of_sprites_list.items():
                for sprite in sprites:
                    if hasattr(sprite, 'asset_id') and sprite.asset_id:
                        if not asset_manager.is_asset_cached(sprite.asset_id):
                            logger.info(f"Requesting missing asset {sprite.asset_id} for sprite {sprite.sprite_id}")
                            self.request_asset_download(sprite.asset_id)
        except Exception as e:
            logger.error(f"Error checking for missing assets: {e}")

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
                
            # Extract user information from welcome message
            user_id = msg.data.get('user_id', 0)
            username = msg.data.get('username', 'unknown')
            session_code = msg.data.get('session_code', 'unknown')
            client_id = msg.data.get('client_id', self.client_id)
            
            # Save user information to context
            self.context.user_id = user_id
            self.context.username = username
            self.context.session_code = session_code
            self.client_id = client_id  # Update client ID from server
            
            logger.info(f"Welcome message received: user_id={user_id}, username={username}, session={session_code}")
            
            # Notify GUI if available
            if hasattr(self.context, 'gui_system') and hasattr(self.context.gui_system, 'gui_state'):
                welcome_msg = msg.data.get('message', f'Welcome to session {session_code}')
                self.context.gui_system.gui_state.chat_messages.append(f"🎮 {welcome_msg}")
                
        except Exception as e:
            logger.error(f"Error handling welcome message: {e}")