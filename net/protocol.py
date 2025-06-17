import json
import enum
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Any, Optional
import time

class MessageType(enum.Enum):
    # Core messages
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    TEST = "test"  
    SUCCESS = "success"

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
    TABLE_SCALE = "table_scale"
    TABLE_MOVE = "table_move"
    
 
    # Player actions
    PLAYER_ACTION = "player_action"
    PLAYER_ACTION_RESPONSE = "player_action_response"
    PLAYER_ACTION_UPDATE = "player_action_update"
    PLAYER_ACTION_REMOVE = "player_action_remove"
    PLAYER_LEFT = "player_left"
    PLAYER_JOINED = "player_joined"
    PLAYER_READY = "player_ready"
    PLAYER_UNREADY = "player_unready"
    PLAYER_STATUS = "player_status"
    

    # Sprite sync
    SPRITE_REQUEST = "sprite_request"
    SPRITE_RESPONSE = "sprite_response"
    SPRITE_DATA = "sprite_data"
    SPRITE_UPDATE = "sprite_update"
    SPRITE_REMOVE = "sprite_remove"
    SPRITE_CREATE = "sprite_create"
    SPRITE_MOVE = "sprite_move"
    SPRITE_SCALE = "sprite_scale"
    SPRITE_ROTATE = "sprite_rotate"
    
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
    version: str = "0.1"  # Protocol version for backward compatibility
    priority: int = 5     # Message priority (5=normal, 2=high, 0=critical)
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
            priority=data.get('priority', 5),
            sequence_id=data.get('sequence_id')
        )

# Protocol handlers interface for extension
class ProtocolHandler:
    async def handle_message(self, message: Message, sender=None) -> Optional[Message]:
        """Override this method to handle custom message types"""
        pass

@dataclass(order=True)
class PrioritizedItem:
    priority: int
    item: Any=field(compare=False)