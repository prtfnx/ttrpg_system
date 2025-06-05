"""
Webhook-adapted server protocol handler
Adapts the original ServerProtocol for webhook communication
"""
import asyncio
import logging
import json
import os
import sys
from typing import Dict, Set, Optional, Tuple, Any, Callable

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType, ProtocolHandler
from core_table.table import VirtualTable

logger = logging.getLogger(__name__)

class WebhookServerProtocol:
    """Webhook-adapted server protocol"""
    
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
            for root, dirs, filenames in os.walk(resources_path):
                for filename in filenames:
                    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
                        full_path = os.path.join(root, filename)
                        files.add(full_path)
        return files
    async def handle_client(self, client_id: str, writer, message_str: str, send_callback: Callable):
        """Handle client message - adapted for webhook communication"""
        try:
            message = Message.from_json(message_str)
            logger.debug(f"Handling message from {client_id}: {message.type}")
            
            # Store send callback for this client
            self.clients[client_id] = {
                'send_callback': send_callback,
                'last_message': message_str
            }
            
            # Handle different message types
            if message.type == MessageType.TABLE_REQUEST:
                await self._send_table(client_id, send_callback, message.data.get('name'))
            elif message.type == MessageType.NEW_TABLE_REQUEST:
                await self._send_new_table(client_id, send_callback, message.data.get('name'))
            elif message.type == MessageType.FILE_REQUEST:
                await self._send_file(client_id, send_callback, message.data.get('filename'))
            elif message.type == MessageType.TABLE_UPDATE:
                await self._handle_table_update(client_id, message.data, send_callback)
            elif message.type == MessageType.SPRITE_UPDATE:
                await self._handle_sprite_update(client_id, message.data.get('update_type'), message.data, send_callback)
            elif message.type == MessageType.COMPENDIUM_SPRITE_ADD:
                await self._handle_compendium_sprite_add(client_id, message.data, send_callback)
            elif message.type == MessageType.COMPENDIUM_SPRITE_UPDATE:
                await self._handle_compendium_sprite_update(client_id, message.data, send_callback)
            elif message.type == MessageType.COMPENDIUM_SPRITE_REMOVE:
                await self._handle_compendium_sprite_remove(client_id, message.data, send_callback)
            elif message.type == MessageType.PING:
                # Respond to ping
                pong_msg = Message(MessageType.PONG, {"message": "pong"})
                await send_callback(client_id, pong_msg)
            elif message.type == MessageType.TEST:
                # Handle test messages
                logger.debug(f"Test message received from {client_id}")
            else:
                logger.warning(f"Unknown message type from {client_id}: {message.type}")
                
        except Exception as e:
            logger.error(f"Error handling message from {client_id}: {e}")
            error_msg = Message(MessageType.ERROR, {"error": str(e)})
            await send_callback(client_id, error_msg)
    
    async def _send_table(self, client_id: str, send_callback: Callable, table_name: Optional[str] = None):
        """Send table data to client with size optimization"""
        try:
            table = self.table_manager.get_table(table_name)
            if not table:
                logger.warning(f"Table not found: {table_name}")
                return
                
            # Prepare table data
            table_data = {
                "name": table.name,
                "width": table.width,
                "height": table.height,
                "scale": getattr(table, 'scale', 1.0),
                "x_moved": getattr(table, 'x_moved', 0.0),
                "y_moved": getattr(table, 'y_moved', 0.0),
                "show_grid": getattr(table, 'show_grid', True),
                "layers": {layer: {} for layer in table.layers.keys()},
                "files": list(self.files)
            }
            
            # Add entities data
            entities_data = self._serialize_entities(table)
            if entities_data:
                table_data["entities"] = entities_data
            
            message = Message(MessageType.TABLE_DATA, table_data)
            await send_callback(client_id, message)
            
        except Exception as e:
            logger.error(f"Error sending table to {client_id}: {e}")

    async def _send_new_table(self, client_id: str, send_callback: Callable, table_name: Optional[str] = None):
        """Send new table data to client"""
        try:
            # Create new table if it doesn't exist
            if table_name and table_name not in self.table_manager.tables:
                table = self.table_manager.create_table(table_name, 100, 100)
            else:
                table = self.table_manager.get_table(table_name)
            
            await self._send_table(client_id, send_callback, table.name)
            
        except Exception as e:
            logger.error(f"Error sending new table to {client_id}: {e}")

    async def _send_file(self, client_id: str, send_callback: Callable, filename: str):
        """Send file to client"""
        if filename in self.files and os.path.exists(filename):
            try:
                with open(filename, 'rb') as f:
                    file_data = f.read()
                
                message = Message(MessageType.FILE_DATA, {
                    "filename": filename,
                    "data": file_data.hex(),  # Send as hex string
                    "size": len(file_data)
                })
                await send_callback(client_id, message)
                
            except Exception as e:
                logger.error(f"Error sending file {filename} to {client_id}: {e}")
        else:
            logger.warning(f"File not found: {filename}")
    
    async def _handle_table_update(self, client_id: str, data: Dict, send_callback: Callable):
        """Handle and broadcast table update"""
        logger.info(f"Handling table update from {client_id}: {data}")
        try:
            table_name = data.get('table_name', 'default')
            table = self.table_manager.get_table(table_name)
            
            if not table:
                logger.warning(f"Table not found for update: {table_name}")
                return
            
            # Apply table-level updates
            if 'scale' in data:
                table.scale = data['scale']
            if 'x_moved' in data:
                table.x_moved = data['x_moved']
            if 'y_moved' in data:
                table.y_moved = data['y_moved']
            if 'show_grid' in data:
                table.show_grid = data['show_grid']
            
            # Broadcast update to other clients
            update_msg = Message(MessageType.TABLE_UPDATE, data)
            await self._broadcast_to_others(client_id, update_msg, send_callback)
            
        except Exception as e:
            logger.error(f"Error handling table update from {client_id}: {e}")
    
    async def _handle_sprite_update(self, client_id: str, update_type: str, data: Dict, send_callback: Callable):
        """Handle sprite-specific updates"""
        logger.info(f"Handling sprite update from {client_id}: {data}")
        sprite_id = data.get('sprite_id')
        table_id = data.get('table_id', 'default')
        
        if not sprite_id:
            logger.warning("Sprite update missing sprite_id")
            return
        
        # Get the table
        table = self.table_manager.get_table(table_id)
        if not table:
            logger.warning(f"Table not found: {table_id}")
            return
            
        logger.info(f"Handling sprite update for {sprite_id} in table {table.name}")
        
        if update_type == 'sprite_move':
            await self._handle_sprite_movement(client_id, table, sprite_id, data, send_callback)
        elif update_type == 'sprite_scale':
            await self._handle_sprite_scaling(client_id, table, sprite_id, data, send_callback)
        elif update_type == 'sprite_rotate':
            await self._handle_sprite_rotation(client_id, table, sprite_id, data, send_callback)
        else:
            logger.warning(f"Unknown sprite update type: {update_type}")
    
    async def _handle_sprite_movement(self, client_id: str, table, sprite_id: str, data: Dict, send_callback: Callable):
        """Handle sprite movement with validation"""
        logger.info(f"Handling sprite movement for {sprite_id} from {client_id}")
        try:
            position = data.get('position', {})
            if not self._validate_position(position):
                logger.warning(f"Invalid position data from {client_id}")
                return
            
            entity_id = self._find_entity_by_sprite_id(table, sprite_id)
            if entity_id is not None:
                # Update entity position
                entity = table.entities[entity_id]
                entity.position = (position['x'], position['y'])
                
                # Broadcast the update
                await self._broadcast_sprite_update(client_id, data, send_callback)
                
        except Exception as e:
            logger.error(f"Error handling sprite movement: {e}")
    
    async def _handle_sprite_scaling(self, client_id: str, table, sprite_id: str, data: Dict, send_callback: Callable):
        """Handle sprite scaling updates"""
        try:
            scale = data.get('scale', {})
            if not self._validate_scale(scale):
                logger.warning(f"Invalid scale data from {client_id}")
                return
            
            entity_id = self._find_entity_by_sprite_id(table, sprite_id)
            if entity_id is not None:
                entity = table.entities[entity_id]
                entity.scale_x = scale.get('x', 1.0)
                entity.scale_y = scale.get('y', 1.0)
                
                # Broadcast the update
                await self._broadcast_sprite_update(client_id, data, send_callback)
                
        except Exception as e:
            logger.error(f"Error handling sprite scaling: {e}")
    
    async def _handle_sprite_rotation(self, client_id: str, table, sprite_id: str, data: Dict, send_callback: Callable):
        """Handle sprite rotation updates"""
        try:
            rotation = data.get('rotation', 0.0)
            
            entity_id = self._find_entity_by_sprite_id(table, sprite_id)
            if entity_id is not None:
                entity = table.entities[entity_id]
                entity.rotation = rotation
                
                # Broadcast the update
                await self._broadcast_sprite_update(client_id, data, send_callback)
                
        except Exception as e:
            logger.error(f"Error handling sprite rotation: {e}")
    
    def _validate_position(self, pos: Dict) -> bool:
        """Validate position data"""
        try:
            return isinstance(pos.get('x'), (int, float)) and isinstance(pos.get('y'), (int, float))
        except (ValueError, TypeError):
            return False
    
    def _validate_scale(self, scale: Dict) -> bool:
        """Validate scale data"""
        try:
            return isinstance(scale.get('x'), (int, float)) and isinstance(scale.get('y'), (int, float))
        except (ValueError, TypeError):
            return False
    
    def _find_entity_by_sprite_id(self, table, sprite_id: str) -> Optional[int]:
        """Find entity by sprite ID"""
        for entity_id, entity in table.entities.items():
            if hasattr(entity, 'sprite_id') and entity.sprite_id == sprite_id:
                return entity_id
        return None
    
    async def _broadcast_sprite_update(self, sender_client_id: str, update_data: Dict, send_callback: Callable):
        """Broadcast sprite update to other clients"""
        message = Message(MessageType.SPRITE_UPDATE, update_data)
        await self._broadcast_to_others(sender_client_id, message, send_callback)
    
    async def _broadcast_to_others(self, sender_client_id: str, message: Message, send_callback: Callable):
        """Broadcast message to all clients except sender"""
        for client_id in self.clients.keys():
            if client_id != sender_client_id:
                try:
                    await send_callback(client_id, message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {client_id}: {e}")
    
    def _serialize_entities(self, table) -> Dict:
        """Serialize table entities for transmission"""
        entities_data = {}
        for entity_id, entity in table.entities.items():
            entities_data[str(entity_id)] = {
                "name": entity.name,
                "position": entity.position,
                "layer": entity.layer,
                "path_to_texture": getattr(entity, 'path_to_texture', ''),
                "sprite_id": getattr(entity, 'sprite_id', ''),
                "scale_x": getattr(entity, 'scale_x', 1.0),
                "scale_y": getattr(entity, 'scale_y', 1.0),
                "rotation": getattr(entity, 'rotation', 0.0),
                "visible": getattr(entity, 'visible', True)
            }
        return entities_data
    
    async def _handle_compendium_sprite_add(self, client_id: str, data: Dict, send_callback: Callable):
        """Handle compendium sprite addition"""
        # Broadcast to other clients
        message = Message(MessageType.COMPENDIUM_SPRITE_ADD, data)
        await self._broadcast_to_others(client_id, message, send_callback)
    
    async def _handle_compendium_sprite_update(self, client_id: str, data: Dict, send_callback: Callable):
        """Handle compendium sprite update"""
        # Broadcast to other clients
        message = Message(MessageType.COMPENDIUM_SPRITE_UPDATE, data)
        await self._broadcast_to_others(client_id, message, send_callback)
    
    async def _handle_compendium_sprite_remove(self, client_id: str, data: Dict, send_callback: Callable):
        """Handle compendium sprite removal"""
        # Broadcast to other clients
        message = Message(MessageType.COMPENDIUM_SPRITE_REMOVE, data)
        await self._broadcast_to_others(client_id, message, send_callback)
    
    def disconnect_client(self, client_id: str):
        """Handle client disconnection"""
        if client_id in self.clients:
            del self.clients[client_id]
            logger.info(f"Client {client_id} disconnected from protocol")
