import os
import time
import hashlib
from typing import Callable, Optional, Dict, Any
from .protocol import Message, MessageType, ProtocolHandler
import logging
import Actions
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
            
            # Add to chat if context available
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
    
    # def send(self, msg: str):
    #     """Send a message via the protocol"""
    #     raise NotImplementedError("This should be implemented by the network layer")