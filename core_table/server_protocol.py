import os
import sys
import time
from typing import Dict, Set, Optional, Tuple, Any, Callable
import logging


# Add parent directory to path to import protocol
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from net.protocol import Message, MessageType 
from core_table.actions_core import ActionsCore
logger = logging.getLogger(__name__)

class ServerProtocol:
    def __init__(self, table_manager):
        logger.info("Initializing ServerProtocol")
        self.table_manager = table_manager # for compatibility, tables manage actions protocol now
        self.clients: Dict[str, Any] = {}
        logger.debug(f"ServerProtocol initialized with table manager: {self.table_manager}")
        self.handlers: Dict[MessageType, Callable] = {}
        logger.debug("Registering built-in protocol handlers")
        self.init_handlers()
        self.actions = ActionsCore(self.table_manager)
        logger.debug("ActionsCore initialized")
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
        self.register_handler(MessageType.NEW_TABLE_REQUEST, self.handle_new_table_request)
        self.register_handler(MessageType.TABLE_REQUEST, self.handle_table_request)
        self.register_handler(MessageType.FILE_REQUEST, self.handle_file_request)
        self.register_handler(MessageType.TABLE_UPDATE, self.handle_table_update)
        self.register_handler(MessageType.SPRITE_UPDATE, self.handle_sprite_update)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_ADD, self.handle_compendium_sprite_add)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_UPDATE, self.handle_compendium_sprite_update)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_REMOVE, self.handle_compendium_sprite_remove)
        self.register_handler(MessageType.ERROR, self.handle_error)
        self.register_handler(MessageType.SUCCESS, self.handle_success)

    async def handle_client(self, msg: Message, client_id: str) -> bool:
        """Handle client message"""

        logger.debug(f"msg received: {msg}")        
        # Check custom handlers first
        if msg.type in self.handlers:
            response = await self.handlers[msg.type](msg, client_id)
            if response:
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

        #return Message(MessageType.SUCCESS, {'message': 'success received', 'client_id': client_id})
    async def handle_pong(self, msg: Message, client_id: str) -> Message:
        """Handle pong message"""
        logger.debug(f"Received pong message from {client_id}: {msg}")
        
        #return Message(MessageType.SUCCESS, {'message': 'Pong received', 'client_id': client_id})
    async def handle_error(self, msg: Message, client_id: str) -> Message:
        """Handle error message"""
        logger.warning(f"Error message received from {client_id}: {msg}")
        
        #return Message(MessageType.ERROR, {'error': 'An error occurred', 'client_id': client_id})
    async def handle_new_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle new table request"""
        logger.debug(f"New table request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in new table request'})
        table_name = msg.data.get('table_name', 'default')
        result = await self.actions.create_table(table_name, msg.data.get('width', 100), msg.data.get('height', 100))        
        
        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to create new table'})
        else:      
            # return message that need send to client
            return Message(MessageType.NEW_TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': result.data.get('table').to_dict()})

   
    async def handle_table_request(self, msg: Message, client_id: str) -> Message:
        """Handle  table request"""
        logger.debug(f"Table request received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in table request'})
        table_name = msg.data.get('table_name', 'default')
        table_id = msg.data.get('table_id', table_name)

        result = await self.actions.get_table(table_id)

        if not result.success or not result.data or result.data.get('table') is None:
            return Message(MessageType.ERROR, {'error': 'Failed to get table'})
        else:
            # return message that need send to client
            return Message(MessageType.TABLE_RESPONSE, {'name': table_name, 'client_id': client_id,
                                                            'table_data': result.data.get('table').to_dict()})

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
        type = msg.data.get('type')
        if not type:
            logger.error(f"Missing 'type' field in sprite update from {client_id}: {msg.data}")
            return Message(MessageType.ERROR, {'error': 'Missing required field: type'})
        update_data = msg.data.get('data', {})
        if not update_data or 'table_id' not in update_data or 'sprite_id' not in update_data:
            logger.error(f"Invalid sprite update data from {client_id}: {update_data}")
            return Message(MessageType.ERROR, {'error': 'Invalid sprite update data'})
        match type:
            case 'sprite_move':
                # Handle sprite movement
                if 'from' not in update_data or 'to' not in update_data:
                    logger.error(f"Missing 'from' or 'to' field in sprite move update from {client_id}: {update_data}")
                    return Message(MessageType.ERROR, {'error': 'Missing required fields: from, to'})
                await self.actions.move_sprite(table_id=update_data['table_id'],
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
        return Message(MessageType.ERROR, {'error': 'Compendium sprite add not implemented yet'})
    async def handle_compendium_sprite_update(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'Compendium sprite update not implemented yet'})
    async def handle_compendium_sprite_remove(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.ERROR, {'error': 'Compendium sprite remove not implemented yet'})
  
    async def send_to_client(self, message: Message, client_id: str):
        """Send message to specific client"""
        # Overload this method in server implementation to use choosed transport
        raise NotImplementedError("Subclasses must implement send_to_client method")      
    
    async def broadcast_to_session(self, message: Message, client_id: str):
        """Send message to all clients in the session"""
        for client in self.clients:
            if client != client_id:
                await self.send_to_client(message, client)

    async def _broadcast_error(self, client_id: str, error_message: str):
        """Send error message to specific client"""
        if client_id in self.clients:
            error_msg = Message(MessageType.ERROR, {'error': error_message})
            await self.send_to_client(error_msg, self.clients[client_id])

if __name__ == "__main__":
    # Example usage
    class MockTableManager:
        pass  # Replace with actual table manager implementation

    protocol = ServerProtocol(MockTableManager())
    print("ServerProtocol initialized successfully")
    
    