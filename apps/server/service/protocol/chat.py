from core_table.protocol import Message, MessageType
from utils.logger import setup_logger
from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _ChatMixin(_ProtocolBase):
    """Handler methods for chat-related messages"""

    async def handle_chat(self, msg: Message, client_id: str) -> Message:
        """Handle chat message"""
        logger.debug(f"Chat message received: {msg}")
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in chat message'}) 
        
        # TODO: add database save
        await self.broadcast_to_session(msg, client_id)

        return Message(MessageType.CHAT_CONFIRMATION, {                
                'message': 'Chat message received successfully'
            })


    async def handle_chat_request(self, msg: Message, client_id: str) -> Message:
        """Handle chat history request"""
        logger.debug(f"Chat history request received: {msg}")
        #TODO - implement chat history retrieval from database
        pass

   