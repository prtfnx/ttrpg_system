import os
import time
import hashlib
from typing import Callable, Optional, Dict, Any
from protocol import Message, MessageType, ProtocolHandler
import logging

logger = logging.getLogger(__name__)

class ClientProtocol:
    def __init__(self, context, send_callback: Callable[[str], None]):
        self.context = context
        self.send = send_callback
        self.client_id = hashlib.md5(f"{time.time()}_{os.getpid()}".encode()).hexdigest()[:8]
        self.last_ping = time.time()
        self.handlers: Dict[MessageType, ProtocolHandler] = {}
    
    def register_handler(self, msg_type: MessageType, handler: ProtocolHandler):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler
    
    def request_table(self, table_name: str = None):
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
    
    async def handle_message(self, message_str: str):
        try:
            msg = Message.from_json(message_str)
            
            # Check for custom handlers first
            if msg.type in self.handlers:
                response = await self.handlers[msg.type].handle_message(msg)
                if response:
                    self.send(response.to_json())
                return
            
            # Built-in handlers
            if msg.type == MessageType.PONG:
                logger.debug("Pong received")
            elif msg.type == MessageType.TABLE_DATA:
                self._update_table(msg.data)
            elif msg.type == MessageType.FILE_DATA:
                self._save_file(msg.data)
            elif msg.type == MessageType.TABLE_UPDATE:
                self._apply_update(msg.data)
            elif msg.type == MessageType.ERROR:
                logger.error(f"Server error: {msg.data}")
                
        except Exception as e:
            logger.error(f"Message handling error: {e}")
    
    def _update_table(self, data: Dict):
        """Update local table from server data"""
        if not self.context.current_table:
            self.context.add_table(data['name'], data['width'], data['height'])
        
        table = self.context.current_table
        table.scale = data.get('scale', 1.0)
        table.x_moved = data.get('x_moved', 0.0)
        table.y_moved = data.get('y_moved', 0.0)
        table.show_grid = data.get('show_grid', True)
        
        # Load entities
        for layer, entities in data.get('entities', {}).items():
            table.dict_of_sprites_list[layer].clear()
            for entity in entities:
                self.context.add_sprite(
                    texture_path=entity['texture_path'].encode(),
                    scale_x=entity.get('scale_x', 1.0),
                    scale_y=entity.get('scale_y', 1.0),
                    layer=layer
                )
        
        # Request missing files
        for filename in data.get('files', []):
            if not os.path.exists(filename):
                self.request_file(filename)
    
    def _save_file(self, data: Dict):
        """Save downloaded file"""
        filename = data['filename']
        file_data = bytes.fromhex(data['data'])
        
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, 'wb') as f:
            f.write(file_data)
        logger.info(f"File saved: {filename}")
    
    def _apply_update(self, data: Dict):
        """Apply table update from server"""
        update_type = data['type']
        update_data = data['data']
        
        if not self.context.current_table:
            return
            
        table = self.context.current_table
        if update_type == 'scale':
            table.scale = update_data['scale']
        elif update_type == 'move':
            table.x_moved = update_data['x_moved']
            table.y_moved = update_data['y_moved']
        elif update_type == 'grid':
            table.show_grid = update_data['show_grid']