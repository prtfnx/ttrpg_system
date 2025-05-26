import os
import time
from typing import Dict, Set, Optional
from protocol import Message, MessageType, ProtocolHandler
import logging

logger = logging.getLogger(__name__)

class ServerProtocol:
    def __init__(self, table_manager):
        self.table_manager = table_manager
        self.clients: Dict[str, any] = {}
        self.files = self._scan_files()
        self.handlers: Dict[MessageType, ProtocolHandler] = {}
    
    def register_handler(self, msg_type: MessageType, handler: ProtocolHandler):
        """Extension point for custom message handlers"""
        self.handlers[msg_type] = handler
    
    def _scan_files(self) -> Set[str]:
        """Scan for resource files"""
        files = set()
        for root, _, filenames in os.walk("resources"):
            for filename in filenames:
                if filename.lower().endswith(('.png', '.jpg', '.gif', '.bmp')):
                    files.add(os.path.join(root, filename))
        return files
    
    async def handle_client(self, client_id: str, writer, message_str: str):
        """Handle client message"""
        try:
            msg = Message.from_json(message_str)
            self.clients[client_id] = writer
            
            # Check custom handlers first
            if msg.type in self.handlers:
                response = await self.handlers[msg.type].handle_message(msg, client_id)
                if response:
                    await self._send(writer, response)
                return
            
            # Built-in handlers
            if msg.type == MessageType.PING:
                await self._send(writer, Message(MessageType.PONG))
            elif msg.type == MessageType.TABLE_REQUEST:
                await self._send_table(writer, msg.data.get('name'))
            elif msg.type == MessageType.FILE_REQUEST:
                await self._send_file(writer, msg.data['filename'])
            elif msg.type == MessageType.TABLE_UPDATE:
                await self._handle_update(msg.client_id, msg.data)
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self._send(writer, Message(MessageType.ERROR, {'error': str(e)}))
    
    async def _send_table(self, writer, table_name: str = None):
        """Send table data to client"""
        table = self.table_manager.get_table(table_name)
        data = {
            'name': table.name,
            'width': table.width,
            'height': table.height,
            'scale': 1.0,
            'x_moved': 0.0,
            'y_moved': 0.0,
            'show_grid': True,
            'entities': self._serialize_entities(table),
            'files': list(self.files)
        }
        await self._send(writer, Message(MessageType.TABLE_DATA, data))
    
    async def _send_file(self, writer, filename: str):
        """Send file to client"""
        if filename in self.files and os.path.exists(filename):
            with open(filename, 'rb') as f:
                data = {'filename': filename, 'data': f.read().hex()}
            await self._send(writer, Message(MessageType.FILE_DATA, data))
        else:
            await self._send(writer, Message(MessageType.ERROR, {'error': f'File not found: {filename}'}))
    
    async def _handle_update(self, client_id: str, data: Dict):
        """Handle and broadcast table update"""
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
    
    def disconnect_client(self, client_id: str):
        """Handle client disconnection"""
        self.clients.pop(client_id, None)