import json
import enum
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Any, Optional
import time

class MessageType(enum.Enum):    # Core messages
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    TEST = "test"  
    SUCCESS = "success"
    WELCOME = "welcome"

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
    TABLE_LIST_REQUEST = "table_list_request"
    TABLE_LIST_RESPONSE = "table_list_response"
    TABLE_DELETE = "table_delete"
    
 
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
    PLAYER_LIST_REQUEST = "player_list_request"
    PLAYER_LIST_RESPONSE = "player_list_response"
    PLAYER_KICK_REQUEST = "player_kick_request"
    PLAYER_BAN_REQUEST = "player_ban_request"
    PLAYER_KICK_RESPONSE = "player_kick_response"
    PLAYER_BAN_RESPONSE = "player_ban_response"
    CONNECTION_STATUS_REQUEST = "connection_status_request"
    CONNECTION_STATUS_RESPONSE = "connection_status_response"
    

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
    
    # R2 Asset Management
    ASSET_UPLOAD_REQUEST = "asset_upload_request"
    ASSET_UPLOAD_RESPONSE = "asset_upload_response"
    ASSET_DOWNLOAD_REQUEST = "asset_download_request"
    ASSET_DOWNLOAD_RESPONSE = "asset_download_response"
    ASSET_LIST_REQUEST = "asset_list_request"
    ASSET_LIST_RESPONSE = "asset_list_response"
    ASSET_UPLOAD_CONFIRM = "asset_upload_confirm"
    ASSET_DELETE_REQUEST = "asset_delete_request"
    ASSET_DELETE_RESPONSE = "asset_delete_response"
    ASSET_HASH_CHECK = "asset_hash_check"

    # Compendium operations
    COMPENDIUM_SPRITE_ADD = "compendium_sprite_add"
    COMPENDIUM_SPRITE_UPDATE = "compendium_sprite_update"
    COMPENDIUM_SPRITE_REMOVE = "compendium_sprite_remove"
    
    # Compendium data
    COMPENDIUM_SEARCH = "compendium_search"
    COMPENDIUM_SEARCH_RESPONSE = "compendium_search_response"
    COMPENDIUM_GET_SPELL = "compendium_get_spell"
    COMPENDIUM_GET_SPELL_RESPONSE = "compendium_get_spell_response"
    COMPENDIUM_GET_CLASS = "compendium_get_class"
    COMPENDIUM_GET_CLASS_RESPONSE = "compendium_get_class_response"
    COMPENDIUM_GET_SUBCLASSES = "compendium_get_subclasses"
    COMPENDIUM_GET_SUBCLASSES_RESPONSE = "compendium_get_subclasses_response"
    COMPENDIUM_GET_CLASS_FEATURES = "compendium_get_class_features"
    COMPENDIUM_GET_CLASS_FEATURES_RESPONSE = "compendium_get_class_features_response"
    COMPENDIUM_GET_EQUIPMENT = "compendium_get_equipment"
    COMPENDIUM_GET_EQUIPMENT_RESPONSE = "compendium_get_equipment_response"
    COMPENDIUM_SEARCH_EQUIPMENT = "compendium_search_equipment"
    COMPENDIUM_SEARCH_EQUIPMENT_RESPONSE = "compendium_search_equipment_response"
    COMPENDIUM_GET_MONSTER = "compendium_get_monster"
    COMPENDIUM_GET_MONSTER_RESPONSE = "compendium_get_monster_response"
    COMPENDIUM_GET_STATS = "compendium_get_stats"
    COMPENDIUM_GET_STATS_RESPONSE = "compendium_get_stats_response"
    COMPENDIUM_GET_CHARACTER_DATA = "compendium_get_character_data"
    COMPENDIUM_GET_CHARACTER_DATA_RESPONSE = "compendium_get_character_data_response"
    COMPENDIUM_GENERATE_TREASURE = "compendium_generate_treasure"
    COMPENDIUM_GENERATE_TREASURE_RESPONSE = "compendium_generate_treasure_response"
    
    # Character management
    CHARACTER_SAVE_REQUEST = "character_save_request"
    CHARACTER_SAVE_RESPONSE = "character_save_response"
    CHARACTER_LOAD_REQUEST = "character_load_request"
    CHARACTER_LOAD_RESPONSE = "character_load_response"
    CHARACTER_LIST_REQUEST = "character_list_request"
    CHARACTER_LIST_RESPONSE = "character_list_response"
    CHARACTER_DELETE_REQUEST = "character_delete_request"
    CHARACTER_DELETE_RESPONSE = "character_delete_response"
    # Delta/real-time character update
    CHARACTER_UPDATE = "character_update"
    CHARACTER_UPDATE_RESPONSE = "character_update_response"
      
    
    # Batch messaging for performance
    BATCH = "batch"
    
    # Extension point for new message types
    CUSTOM = "custom"

@dataclass
class BatchMessage:
    """Container for batch message processing"""
    messages: List['Message']
    sequence_id: int
    timestamp: float = field(default_factory=time.time)
    
    def to_json(self) -> str:
        return json.dumps({
            'type': 'batch',
            'messages': [json.loads(msg.to_json()) for msg in self.messages],
            'seq': self.sequence_id,
            'timestamp': self.timestamp
        })
    
    @classmethod
    def from_json(cls, json_str: str) -> 'BatchMessage':
        data = json.loads(json_str)
        messages = [Message.from_json(json.dumps(msg_data)) for msg_data in data.get('messages', [])]
        return cls(
            messages=messages,
            sequence_id=data.get('seq', 0),
            timestamp=data.get('timestamp', time.time())
        )

@dataclass
class Message:
    type: MessageType
    data: Optional[Dict[str, Any]] = None
    client_id: Optional[str] = None
    timestamp: Optional[float] = None    
    version: str = "0.1"  
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