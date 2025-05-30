import json
import enum
from dataclasses import dataclass, asdict
from typing import Dict, List, Any, Optional
import time

class MessageType(enum.Enum):
    # Core messages
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    
    # Table sync
    NEW_TABLE_REQUEST = "new_table_request"
    NEW_TABLE_RESPONSE = "new_table_response"
    TABLE_REQUEST = "table_request"
    TABLE_RESPONSE = "table_response"
    TABLE_DATA = "table_data"
    TABLE_UPDATE = "table_update"
    
    # Sprite sync
    SPRITE_REQUEST = "sprite_request"
    SPRITE_RESPONSE = "sprite_response"
    SPRITE_DATA = "sprite_data"
    SPRITE_UPDATE = "sprite_update"
    SPRITE_REMOVE = "sprite_remove"
    
    # File transfer
    FILE_REQUEST = "file_request"
    FILE_DATA = "file_data"
    
    
    # Compendium operations
    COMPENDIUM_SPRITE_ADD = "compendium_sprite_add"
    COMPENDIUM_SPRITE_UPDATE = "compendium_sprite_update"
    COMPENDIUM_SPRITE_REMOVE = "compendium_sprite_remove"
    
    # Extension point for new message types
    CUSTOM = "custom"

@dataclass
class Message:
    type: MessageType
    data: Optional[Dict[str, Any]] = None
    client_id: Optional[str] = None
    timestamp: Optional[float] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()
    
    def to_json(self) -> str:
        return json.dumps({
            'type': self.type.value,
            'data': self.data or {},
            'client_id': self.client_id,
            'timestamp': self.timestamp
        })
    
    @classmethod
    def from_json(cls, json_str: str) -> 'Message':
        data = json.loads(json_str)
        return cls(
            type=MessageType(data['type']),
            data=data.get('data', {}),
            client_id=data.get('client_id'),
            timestamp=data.get('timestamp')
        )

# Protocol handlers interface for extension
class ProtocolHandler:
    async def handle_message(self, message: Message, sender=None) -> Optional[Message]:
        """Override this method to handle custom message types"""
        pass