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
    TEST = "test"  # Add test message type
    
    # Authentication messages
    AUTH_REGISTER = "auth_register"
    AUTH_LOGIN = "auth_login"
    AUTH_LOGOUT = "auth_logout"
    AUTH_TOKEN = "auth_token"
    AUTH_STATUS = "auth_status"
    
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
    # Enhanced fields for production games
    version: str = "1.0"  # Protocol version for backward compatibility
    priority: int = 0     # Message priority (0=normal, 1=high, 2=critical)
    sequence_id: Optional[int] = None  # For message ordering and deduplication
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()
    
    def to_json(self) -> str:
        return json.dumps({
            'type': self.type.value,
            'data': self.data or {},
            'client_id': self.client_id,
            'timestamp': self.timestamp,
            'version': self.version,
            'priority': self.priority,
            'sequence_id': self.sequence_id
        })
    
    @classmethod
    def from_json(cls, json_str: str) -> 'Message':
        data = json.loads(json_str)
        return cls(
            type=MessageType(data['type']),
            data=data.get('data', {}),
            client_id=data.get('client_id'),
            timestamp=data.get('timestamp'),
            version=data.get('version', '1.0'),
            priority=data.get('priority', 0),
            sequence_id=data.get('sequence_id')
        )

# Protocol handlers interface for extension
class ProtocolHandler:
    async def handle_message(self, message: Message, sender=None) -> Optional[Message]:
        """Override this method to handle custom message types"""
        pass