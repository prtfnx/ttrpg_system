import os
import sys
import time
from typing import Dict, Set, Optional, Tuple, Any
import logging

# Add parent directory to path to import protocol
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType, ProtocolHandler

logger = logging.getLogger(__name__)

class ServerProtocol:
    def __init__(self, table_manager):
        self.table_manager = table_manager
        self.clients: Dict[str, Any] = {}
        self.files = self._scan_files()
        self.handlers: Dict[MessageType, ProtocolHandler] = {}
        
        # Track sprite positions for conflict resolution
        self.sprite_positions: Dict[str, Dict[str, Tuple[float, float]]] = {}
        
    def register_handler(self, msg_type: MessageType, handler: ProtocolHandler):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler
    
    def _scan_files(self) -> Set[str]:
        """Scan for resource files"""
        files = set()
        # Look for resources in parent directory
        resources_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "resources")
        if os.path.exists(resources_path):
            for root, _, filenames in os.walk(resources_path):
                for filename in filenames:
                    if filename.lower().endswith(('.png', '.jpg', '.gif', '.bmp')):
                        files.add(os.path.join(root, filename))
        return files
    
    async def handle_client(self, client_id: str, writer, message_str: str):
        """Handle client message"""
        try:
            msg = Message.from_json(message_str)
            self.clients[client_id] = writer
            logger.info(f"msg received: {msg} from {client_id}")
            #logger.info(f"data: {msg.data} from {client_id}")
            
            # Check custom handlers first
            if msg.type in self.handlers:
                response = await self.handlers[msg.type].handle_message(msg, client_id)
                if response:
                    await self._send(writer, response)
                return            
            # Built-in handlers
            if msg.type == MessageType.PING:
                await self._send(writer, Message(MessageType.PONG))
            elif msg.type == MessageType.NEW_TABLE_REQUEST:
                table_name = msg.data.get('table_name', 'default') if msg.data else 'default'
                logger.info(f"New table request received, name: {table_name}")
                await self._send_new_table(writer, table_name)
            elif msg.type == MessageType.TABLE_REQUEST:
                table_name = msg.data.get('table_name', 'default') if msg.data else 'default'
                logger.info(f"Table request received, name: {table_name}")
                await self._send_table(writer, table_name)
            elif msg.type == MessageType.FILE_REQUEST:
                if msg.data and 'filename' in msg.data:
                    await self._send_file(writer, msg.data['filename'])
                else:
                    await self._send(writer, Message(MessageType.ERROR, {'error': 'Missing filename in file request'}))
            elif msg.type == MessageType.TABLE_UPDATE:
                if msg.data:
                    await self._handle_table_update(client_id, msg.data)
                else:
                    await self._send(writer, Message(MessageType.ERROR, {'error': 'Missing data in table update'}))
            elif msg.type == MessageType.COMPENDIUM_SPRITE_ADD:
                if msg.data:
                    await self._handle_compendium_sprite_add(client_id, msg.data)
                else:
                    await self._send(writer, Message(MessageType.ERROR, {'error': 'Missing data in compendium sprite add'}))
            elif msg.type == MessageType.COMPENDIUM_SPRITE_UPDATE:
                if msg.data:
                    await self._handle_compendium_sprite_update(client_id, msg.data)
                else:
                    await self._send(writer, Message(MessageType.ERROR, {'error': 'Missing data in compendium sprite update'}))
            elif msg.type == MessageType.COMPENDIUM_SPRITE_REMOVE:
                if msg.data:
                    await self._handle_compendium_sprite_remove(client_id, msg.data)
                else:
                    await self._send(writer, Message(MessageType.ERROR, {'error': 'Missing data in compendium sprite remove'}))
                
        except Exception as e:
            logger.error(f"Error handling message from {client_id}: {e}")
            await self._send(writer, Message(MessageType.ERROR, {'error': str(e)}))
    
    async def _send_table(self, writer, table_name: Optional[str] = None):
        """Send table data to client with size optimization"""
        try:
            table = self.table_manager.get_table(table_name)
            if not table:
                error_msg = Message(MessageType.ERROR, {'error': f'Table {table_name} not found'})
                await self._send(writer, error_msg)
                return
            #print(table.table_to_layered_dict())
            # Create table data
            table_data = {
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'scale': 1.0,
                'x_moved': 0.0,
                'y_moved': 0.0,
                'show_grid': True,
                'layers': table.table_to_layered_dict()
            }
            
            # Only include files that exist and limit the list
            files = []
            for file_path in self.files:
                if os.path.exists(file_path) and len(files) < 50:  # Limit file list
                    files.append(file_path)
            
            table_data['files'] = files
            
            # Check message size
            msg = Message(MessageType.TABLE_DATA, table_data)
            json_str = msg.to_json()
            logger.info(f"table json str: {json_str} ")
            # If message is too large, send in chunks or reduce data
            if len(json_str) > 4096:  # 4KB limit
                logger.warning(f"Large table message ({len(json_str)} bytes), reducing file list")
                # Reduce file list for large messages
                table_data['files'] = files[:10]  # Only first 10 files
                msg = Message(MessageType.TABLE_DATA, table_data)
            
            await self._send(writer, msg)
            logger.info(f"Sent table '{table.name}' to client (size: {len(msg.to_json())} bytes)")
            
        except Exception as e:
            logger.error(f"Error sending table: {e}")
            error_msg = Message(MessageType.ERROR, {'error': f'Failed to send table: {e}'})
            await self._send(writer, error_msg)

    async def _send_new_table(self, writer, table_name: Optional[str] = None):
        """Send new table data to client with size optimization"""
        try:
            table = self.table_manager.get_table(table_name)
            if not table:
                error_msg = Message(MessageType.ERROR, {'error': f'Table {table_name} not found'})
                await self._send(writer, error_msg)
                return
            #print(table.table_to_layered_dict())
            # Create table data 
            # TODO Change logic for uniformity for all app.
            
            table_data = {
                'name': table.name,
                'width': table.width,
                'height': table.height,
                'scale': 1.0,
                'x_moved': 0.0,
                'y_moved': 0.0,
                'show_grid': True,
                'layers': table.table_to_layered_dict()
            }
            
            # Only include files that exist and limit the list
            files = []
            for file_path in self.files:
                if os.path.exists(file_path) and len(files) < 50:  # Limit file list
                    files.append(file_path)
            
            table_data['files'] = files
            
            # Check message size
            msg = Message(MessageType.NEW_TABLE_RESPONSE, table_data)
            json_str = msg.to_json()
            logger.info(f"table json str: {json_str} ")
            # If message is too large, send in chunks or reduce data
            if len(json_str) > 4096:  # 4KB limit
                logger.warning(f"Large table message ({len(json_str)} bytes), reducing file list")
                # Reduce file list for large messages
                table_data['files'] = files[:10]  # Only first 10 files                
                msg = Message(MessageType.NEW_TABLE_RESPONSE, table_data)

            await self._send(writer, msg)
            logger.info(f"Sent table '{table.name}' to client (size: {len(msg.to_json())} bytes)")
            
        except Exception as e:
            logger.error(f"Error sending table: {e}")
            error_msg = Message(MessageType.ERROR, {'error': f'Failed to send table: {e}'})
            await self._send(writer, error_msg)

    async def _send_file(self, writer, filename: str):
        """Send file to client"""
        if filename in self.files and os.path.exists(filename):
            with open(filename, 'rb') as f:
                data = {'filename': filename, 'data': f.read().hex()}
            await self._send(writer, Message(MessageType.FILE_DATA, data))
        else:
            await self._send(writer, Message(MessageType.ERROR, {'error': f'File not found: {filename}'}))
    
    async def _handle_table_update(self, client_id: str, data: Dict):
        """Handle and broadcast table update with sprite movement support"""
        logger.info(f"Handling table update from {client_id}: {data}")
        try:
            update_category = data.get('category', 'table')
            update_type = data.get('type')
            update_data = data.get('data', {})
            
            if update_category == 'sprite':
                if update_type:
                    await self._handle_sprite_update(client_id, update_type, update_data)
                else:
                    logger.error(f"Missing update_type in sprite update from {client_id}")
                    await self._broadcast_error(client_id, "Missing update_type in sprite update")
            else:
                # Handle general table updates
                await self._handle_general_update(client_id, data)
                
        except Exception as e:
            logger.error(f"Error handling table update from {client_id}: {e}")
            await self._broadcast_error(client_id, f"Update failed: {e}")
    
    async def _handle_sprite_update(self, client_id: str, update_type: str, data: Dict):
        """Handle sprite-specific updates"""
        logger.info(f"Handling sprite update from {client_id}: {data}")
        sprite_id = data.get('sprite_id')
        table_id = data.get('table_id', 'default')
        
        if not sprite_id:
            logger.error(f"No sprite_id in update from {client_id}")
            return
        
        # Get the table
        table = self.table_manager.get_table(table_id)
        if not table:
            logger.error(f"Table not found: {table_id}")
            return
        logger.info(f"Handling sprite update for {sprite_id} in table {table.name}")
        if update_type == 'sprite_move':
            await self._handle_sprite_movement(client_id, table, sprite_id, data)
        elif update_type == 'sprite_scale':
            await self._handle_sprite_scaling(client_id, table, sprite_id, data)
        elif update_type == 'sprite_rotate':
            await self._handle_sprite_rotation(client_id, table, sprite_id, data)
        else:
            logger.warning(f"Unknown sprite update type: {update_type}")
    
    async def _handle_sprite_movement(self, client_id: str, table, sprite_id: str, data: Dict):
        """Handle sprite movement with validation and conflict resolution"""
        logger.info(f"Handling sprite movement for {sprite_id} from {client_id}")
        try:
            from_pos = data.get('from', {})
            to_pos = data.get('to', {})
            timestamp = data.get('timestamp', time.time())
            
            # Validate position data
            if not self._validate_position(to_pos):
                logger.error(f"Invalid position data from {client_id}: {to_pos}")
                return
            
            # Check if sprite exists in table
            entity_id = self._find_entity_by_sprite_id(table, sprite_id)
            if entity_id is None:
                logger.warning(f"Sprite {sprite_id} not found in table {table.name}")
                return
            
            # Validate move is legal
            new_position = (int(to_pos['x']), int(to_pos['y']))
            if not table.is_valid_position(new_position):
                logger.error(f"Invalid move to {new_position} from {client_id}")
                await self._send_position_correction(client_id, sprite_id, from_pos)
                return
            
            # Check for conflicts with other entities
            if self._check_movement_conflict(table, entity_id, new_position):
                logger.warning(f"Movement conflict at {new_position} from {client_id}")
                await self._send_position_correction(client_id, sprite_id, from_pos)
                return
            
            # Apply the movement
            try:
                table.move_entity(entity_id, new_position)
                logger.info(f"Moved sprite {sprite_id} to {new_position} in table {table.name}")
                
                # Broadcast to all other clients - pass the correct client_id
                await self._broadcast_sprite_update(client_id, {  # Fixed: use client_id parameter
                    'category': 'sprite',
                    'type': 'sprite_move',
                    'data': {
                        'sprite_id': sprite_id,
                        'from': from_pos,
                        'to': to_pos,
                        'table_id': table.name,
                        'timestamp': timestamp,
                        'server_timestamp': time.time()
                    }
                })
                
            except ValueError as e:
                logger.error(f"Failed to move entity {entity_id}: {e}")
                await self._send_position_correction(client_id, sprite_id, from_pos)
                
        except Exception as e:
            logger.error(f"Error handling sprite movement: {e}")
            await self._broadcast_error(client_id, f"Movement failed: {e}")
    
    async def _handle_sprite_scaling(self, client_id: str, table, sprite_id: str, data: Dict):
        """Handle sprite scaling updates"""
        try:
            from_scale = data.get('from', {})
            to_scale = data.get('to', {})
            timestamp = data.get('timestamp', time.time())
            
            # Validate scale data
            if not self._validate_scale(to_scale):
                logger.error(f"Invalid scale data from {client_id}: {to_scale}")
                return
            
            # Find entity
            entity_id = self._find_entity_by_sprite_id(table, sprite_id)
            if entity_id is None:
                logger.warning(f"Sprite {sprite_id} not found in table {table.name}")
                return
            
            # Apply scaling (if supported by table)
            entity = table.entities.get(entity_id)
            if entity:
                entity.scale_x = to_scale.get('x', 1.0)
                entity.scale_y = to_scale.get('y', 1.0)
                logger.info(f"Scaled sprite {sprite_id} to ({entity.scale_x:.2f}, {entity.scale_y:.2f})")
                
                # Broadcast to all other clients
                await self._broadcast_sprite_update(client_id, {
                    'category': 'sprite',
                    'type': 'sprite_scale',
                    'data': {
                        'sprite_id': sprite_id,
                        'from': from_scale,
                        'to': to_scale,
                        'table_id': table.name,
                        'timestamp': timestamp,
                        'server_timestamp': time.time()
                    }
                })
                
        except Exception as e:
            logger.error(f"Error handling sprite scaling: {e}")
    
    async def _handle_sprite_rotation(self, client_id: str, table, sprite_id: str, data: Dict):
        """Handle sprite rotation updates"""
        try:
            from_rotation = data.get('from', 0.0)
            to_rotation = data.get('to', 0.0)
            timestamp = data.get('timestamp', time.time())
            
            # Find entity
            entity_id = self._find_entity_by_sprite_id(table, sprite_id)
            if entity_id is None:
                logger.warning(f"Sprite {sprite_id} not found in table {table.name}")
                return
            
            # Apply rotation (if supported by table)
            entity = table.entities.get(entity_id)
            if entity:
                # Add rotation attribute if it doesn't exist
                if not hasattr(entity, 'rotation'):
                    entity.rotation = 0.0
                
                entity.rotation = float(to_rotation) % 360.0  # Keep within 0-360 degrees
                logger.info(f"Rotated sprite {sprite_id} to {entity.rotation:.1f} degrees")
                
                # Broadcast to all other clients
                await self._broadcast_sprite_update(client_id, {
                    'category': 'sprite',
                    'type': 'sprite_rotate',
                    'data': {
                        'sprite_id': sprite_id,
                        'from': from_rotation,
                        'to': to_rotation,
                        'table_id': table.name,
                        'timestamp': timestamp,
                        'server_timestamp': time.time()
                    }
                })
                
        except Exception as e:
            logger.error(f"Error handling sprite rotation: {e}")
    
    def _validate_position(self, pos: Dict) -> bool:
        """Validate position data"""
        try:
            x = float(pos.get('x', 0))
            y = float(pos.get('y', 0))
            return x >= 0 and y >= 0 and x < 10000 and y < 10000  # Reasonable bounds
        except (ValueError, TypeError):
            return False
    
    def _validate_scale(self, scale: Dict) -> bool:
        """Validate scale data"""
        try:
            x = float(scale.get('x', 1.0))
            y = float(scale.get('y', 1.0))
            return 0.1 <= x <= 10.0 and 0.1 <= y <= 10.0  # Reasonable scale bounds
        except (ValueError, TypeError):
            return False
    
    def _find_entity_by_sprite_id(self, table, sprite_id: str) -> Optional[int]:
        """Find entity ID by sprite ID"""
        # Use the sprite_to_entity mapping for efficiency
        return table.sprite_to_entity.get(sprite_id)
    
    def _check_movement_conflict(self, table, entity_id: int, new_position: Tuple[int, int]) -> bool:
        """Check if movement would conflict with another entity"""
        try:
            # Check if position is already occupied
            x, y = new_position
            for layer in table.layers:
                if table.grid[layer][y][x] is not None and table.grid[layer][y][x] != entity_id:
                    return True
            return False
        except (IndexError, KeyError):
            return True  # Out of bounds or invalid position
    
    async def _send_position_correction(self, client_id: str, sprite_id: str, correct_pos: Dict):
        """Send position correction to client"""
        if client_id in self.clients:
            correction_msg = Message(MessageType.TABLE_UPDATE, {
                'category': 'sprite',
                'type': 'position_correction',
                'data': {
                    'sprite_id': sprite_id,
                    'position': correct_pos,
                    'reason': 'Invalid move or conflict'
                }
            })
            await self._send(self.clients[client_id], correction_msg)
    
    async def _broadcast_sprite_update(self, sender_client_id: str, update_data: Dict):
        """Broadcast sprite update to all clients except sender"""
        logger.info(f"Broadcasting sprite update from {sender_client_id}: {update_data}")
        logger.info(f"Available clients: {list(self.clients.keys())}")  # Debug log
        
        update_msg = Message(MessageType.TABLE_UPDATE, update_data)
        disconnected_clients = []
        
        broadcast_count = 0
        for client_id, writer in self.clients.items():
            logger.debug(f"Checking client {client_id} vs sender {sender_client_id}")  # Debug log
            if client_id != sender_client_id:
                try:
                    await self._send(writer, update_msg)
                    broadcast_count += 1
                    logger.info(f"Broadcasted update to client {client_id}")
                except Exception as e:
                    logger.error(f"Failed to send update to {client_id}: {e}")
                    disconnected_clients.append(client_id)
            else:
                logger.debug(f"Skipping sender client {client_id}")
        
        logger.info(f"Broadcasted to {broadcast_count} clients (excluding sender {sender_client_id})")
        
        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect_client(client_id)
    
    async def _broadcast_error(self, client_id: str, error_message: str):
        """Send error message to specific client"""
        if client_id in self.clients:
            error_msg = Message(MessageType.ERROR, {'error': error_message})
            await self._send(self.clients[client_id], error_msg)
    
    async def _handle_general_update(self, client_id: str, data: Dict):
        """Handle general table updates (existing functionality)"""
        # Apply to server table
        self.table_manager.apply_update(data)
        
        # Broadcast to other clients
        update_msg = Message(MessageType.TABLE_UPDATE, data)
        for cid, writer in self.clients.items():
            if cid != client_id:
                try:
                    await self._send(writer, update_msg)
                except:
                    del self.clients[cid]  # Remove disconnected client
    
    def _serialize_entities(self, table) -> Dict:
        """Convert table entities to transferable format"""
        entities = {}
        for layer in table.layers:
            entities[layer] = []
            for entity in getattr(table, 'entities', {}).values():
                if getattr(entity, 'layer', '') == layer:
                    entities[layer].append({
                        'id': entity.id,
                        'name': entity.name,
                        'position': entity.position,
                        'texture_path': getattr(entity, 'texture_path', ''),
                        'scale_x': getattr(entity, 'scale_x', 1.0),
                        'scale_y': getattr(entity, 'scale_y', 1.0)
                    })
        return entities
    
    async def _send(self, writer, message: Message):
        """Send message to client"""
        writer.write(message.to_json().encode() + b'\n')
        await writer.drain()
    
    async def _handle_compendium_sprite_add(self, client_id: str, data: Dict):
        """Handle adding a compendium sprite to the table"""
        try:
            logger.info(f"Handling compendium sprite add from {client_id}: {data}")
            
            # Extract required data
            table_name = data.get('table_name', 'default')
            entity_data = data.get('entity_data', {})
            position = data.get('position', {'x': 0, 'y': 0})
            entity_type = data.get('entity_type', 'unknown')
            
            # Get the table
            table = self.table_manager.get_table(table_name)
            if not table:
                await self._send_error_to_client(client_id, f"Table {table_name} not found")
                return
            
            # Validate the entity data has required fields
            if not entity_data.get('name'):
                await self._send_error_to_client(client_id, "Entity data missing required 'name' field")
                return
            
            # Create sprite data for the table
            sprite_data = {
                'name': entity_data['name'],
                'entity_type': entity_type,
                'compendium_data': entity_data,
                'position': position,
                'layer': data.get('layer', 'tokens'),
                'scale_x': data.get('scale_x', 1.0),
                'scale_y': data.get('scale_y', 1.0),
                'rotation': data.get('rotation', 0.0),
                'client_id': client_id,
                'timestamp': time.time()
            }
            
            # Add sprite to table (this will depend on your table implementation)
            # For now, we'll broadcast the addition to all clients
            
            logger.info(f"Added compendium sprite {entity_data['name']} to table {table_name}")
            
            # Broadcast to all clients
            await self._broadcast_compendium_update(client_id, {
                'type': 'compendium_sprite_add',
                'table_name': table_name,
                'sprite_data': sprite_data
            })
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite add: {e}")
            await self._send_error_to_client(client_id, f"Failed to add compendium sprite: {e}")
    
    async def _handle_compendium_sprite_update(self, client_id: str, data: Dict):
        """Handle updating a compendium sprite"""
        try:
            logger.info(f"Handling compendium sprite update from {client_id}: {data}")
            
            sprite_id = data.get('sprite_id')
            table_name = data.get('table_name', 'default')
            updates = data.get('updates', {})
            
            if not sprite_id:
                await self._send_error_to_client(client_id, "Missing sprite_id in update")
                return
            
            # Get the table
            table = self.table_manager.get_table(table_name)
            if not table:
                await self._send_error_to_client(client_id, f"Table {table_name} not found")
                return
            
            # Validate and apply updates
            update_data = {
                'sprite_id': sprite_id,
                'table_name': table_name,
                'updates': updates,
                'client_id': client_id,
                'timestamp': time.time()
            }
            
            logger.info(f"Updated compendium sprite {sprite_id} in table {table_name}")
            
            # Broadcast to all clients
            await self._broadcast_compendium_update(client_id, {
                'type': 'compendium_sprite_update',
                **update_data
            })
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite update: {e}")
            await self._send_error_to_client(client_id, f"Failed to update compendium sprite: {e}")
    
    async def _handle_compendium_sprite_remove(self, client_id: str, data: Dict):
        """Handle removing a compendium sprite from the table"""
        try:
            logger.info(f"Handling compendium sprite remove from {client_id}: {data}")
            
            sprite_id = data.get('sprite_id')
            table_name = data.get('table_name', 'default')
            
            if not sprite_id:
                await self._send_error_to_client(client_id, "Missing sprite_id in remove request")
                return
            
            # Get the table
            table = self.table_manager.get_table(table_name)
            if not table:
                await self._send_error_to_client(client_id, f"Table {table_name} not found")
                return
            
            # Create removal data
            removal_data = {
                'sprite_id': sprite_id,
                'table_name': table_name,
                'client_id': client_id,
                'timestamp': time.time()
            }
            
            logger.info(f"Removed compendium sprite {sprite_id} from table {table_name}")
            
            # Broadcast to all clients
            await self._broadcast_compendium_update(client_id, {
                'type': 'compendium_sprite_remove',
                **removal_data
            })
            
        except Exception as e:
            logger.error(f"Error handling compendium sprite remove: {e}")
            await self._send_error_to_client(client_id, f"Failed to remove compendium sprite: {e}")
    
    async def _broadcast_compendium_update(self, sender_client_id: str, update_data: Dict):
        """Broadcast compendium update to all clients except sender"""
        try:
            # Determine message type based on update type
            update_type = update_data.get('type', 'compendium_sprite_update')
            message_type_map = {
                'compendium_sprite_add': MessageType.COMPENDIUM_SPRITE_ADD,
                'compendium_sprite_update': MessageType.COMPENDIUM_SPRITE_UPDATE,
                'compendium_sprite_remove': MessageType.COMPENDIUM_SPRITE_REMOVE
            }
            
            msg_type = message_type_map.get(update_type, MessageType.COMPENDIUM_SPRITE_UPDATE)
            msg = Message(msg_type, update_data)
            
            broadcast_count = 0
            disconnected_clients = []
            
            for client_id, writer in self.clients.items():
                if client_id != sender_client_id:
                    try:
                        await self._send(writer, msg)
                        broadcast_count += 1
                        logger.debug(f"Sent compendium update to client {client_id}")
                    except Exception as e:
                        logger.error(f"Failed to send to client {client_id}: {e}")
                        disconnected_clients.append(client_id)
                else:
                    logger.debug(f"Skipping sender client {client_id}")
            
            logger.info(f"Broadcasted compendium update to {broadcast_count} clients (excluding sender {sender_client_id})")
            
            # Clean up disconnected clients
            for client_id in disconnected_clients:
                self.disconnect_client(client_id)
                
        except Exception as e:
            logger.error(f"Error broadcasting compendium update: {e}")
    
    async def _send_error_to_client(self, client_id: str, error_message: str):
        """Send error message to specific client"""
        if client_id in self.clients:
            try:
                error_msg = Message(MessageType.ERROR, {'error': error_message})
                await self._send(self.clients[client_id], error_msg)
            except Exception as e:
                logger.error(f"Failed to send error to client {client_id}: {e}")
    
    def disconnect_client(self, client_id: str):
        """Remove a disconnected client"""
        if client_id in self.clients:
            del self.clients[client_id]
            logger.info(f"Disconnected client {client_id}")