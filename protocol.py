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
    TABLE_REQUEST = "table_request"
    TABLE_DATA = "table_data"
    TABLE_UPDATE = "table_update"
    
    # File transfer
    FILE_REQUEST = "file_request"
    FILE_DATA = "file_data"
    
    # Extension point for new message types
    CUSTOM = "custom"

@dataclass
class Message:
    type: MessageType
    data: Dict[str, Any] = None
    client_id: str = None
    timestamp: float = None
    
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