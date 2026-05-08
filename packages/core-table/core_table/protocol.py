import enum
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


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
    TABLE_ACTIVE_REQUEST = "table_active_request"
    TABLE_ACTIVE_RESPONSE = "table_active_response"
    TABLE_ACTIVE_SET = "table_active_set"
    TABLE_ACTIVE_SET_ALL = "table_active_set_all"
    TABLE_ACTIVE_SET_ALL_RESPONSE = "table_active_set_all_response"


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
    PLAYER_ROLE_CHANGED = "player_role_changed"
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
    # Live drag previews — broadcast only, never persisted
    SPRITE_DRAG_PREVIEW = "sprite_drag_preview"
    SPRITE_RESIZE_PREVIEW = "sprite_resize_preview"
    SPRITE_ROTATE_PREVIEW = "sprite_rotate_preview"

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

    # Character management
    CHARACTER_SAVE_REQUEST = "character_save_request"
    CHARACTER_SAVE_RESPONSE = "character_save_response"

    # ── Game Mode ──
    GAME_MODE_CHANGE = "game_mode_change"
    GAME_MODE_STATE = "game_mode_state"

    # ── Session Rules ──
    SESSION_RULES_UPDATE = "session_rules_update"
    SESSION_RULES_CHANGED = "session_rules_changed"
    SESSION_RULES_REQUEST = "session_rules_request"

    # ── Planning / Preview ──
    PLAN_START = "plan_start"
    PLAN_ACK = "plan_ack"
    ACTION_COMMIT = "action_commit"
    ACTION_RESULT = "action_result"
    ACTION_REJECTED = "action_rejected"

    # ── State Sync ──
    STATE_SYNC_REQUEST = "state_sync_request"
    STATE_SYNC_RESPONSE = "state_sync_response"

    # ── Combat ──
    COMBAT_START = "combat_start"
    COMBAT_END = "combat_end"
    COMBAT_STATE = "combat_state"
    COMBAT_STATE_REQUEST = "combat_state_request"

    # ── Initiative ──
    INITIATIVE_ROLL = "initiative_roll"
    INITIATIVE_ROLL_RESULT = "initiative_roll_result"
    INITIATIVE_SET = "initiative_set"
    INITIATIVE_ADD = "initiative_add"
    INITIATIVE_REMOVE = "initiative_remove"
    INITIATIVE_ORDER = "initiative_order"

    # ── Turn Management ──
    TURN_START = "turn_start"
    TURN_END = "turn_end"
    TURN_SKIP = "turn_skip"
    ROUND_START = "round_start"
    ROUND_END = "round_end"

    # ── Explore Mode ──
    EXPLORE_SUBMIT = "explore_submit"
    EXPLORE_ROUND_RESOLVE = "explore_round_resolve"
    EXPLORE_ROUND_RESULT = "explore_round_result"

    # ── Conditions ──
    CONDITION_ADD = "condition_add"
    CONDITION_REMOVE = "condition_remove"
    CONDITION_UPDATE = "condition_update"
    CONDITIONS_SYNC = "conditions_sync"

    # ── DM Controls ──
    DM_OVERRIDE = "dm_override"
    DM_MODIFY_ROLL = "dm_modify_roll"
    DM_SET_HP = "dm_set_hp"
    DM_APPLY_DAMAGE = "dm_apply_damage"
    DM_SET_TEMP_HP = "dm_set_temp_hp"
    DM_SET_RESISTANCES = "dm_set_resistances"
    DM_SET_SURPRISED = "dm_set_surprised"
    DM_SET_TERRAIN = "dm_set_terrain"
    DM_ADD_ACTION = "dm_add_action"
    DM_ADD_MOVEMENT = "dm_add_movement"
    DM_REVERT_ACTION = "dm_revert_action"
    DM_TOGGLE_AI = "dm_toggle_ai"

    # ── NPC AI ──
    AI_ACTION = "ai_action"
    AI_SUGGESTION = "ai_suggestion"
    AI_CONFIG = "ai_config"

    # ── Encounter (Non-Combat) ──
    ENCOUNTER_START = "encounter_start"
    ENCOUNTER_END = "encounter_end"
    ENCOUNTER_CHOICE = "encounter_choice"
    ENCOUNTER_ROLL = "encounter_roll"
    ENCOUNTER_RESULT = "encounter_result"
    ENCOUNTER_STATE = "encounter_state"

    # ── Death Saves ──
    DEATH_SAVE_ROLL = "death_save_roll"
    DEATH_SAVE_RESULT = "death_save_result"

    # ── Concentration ──
    CONCENTRATION_BROKEN = "concentration_broken"

    # ── Terrain Zones ──
    TERRAIN_ZONE_ADD = "terrain_zone_add"
    TERRAIN_ZONE_REMOVE = "terrain_zone_remove"
    TERRAIN_ZONE_UPDATE = "terrain_zone_update"
    TERRAIN_ZONES_SYNC = "terrain_zones_sync"

    # ── Cover Zones ──
    COVER_ZONE_ADD = "cover_zone_add"
    COVER_ZONE_REMOVE = "cover_zone_remove"
    COVER_ZONE_UPDATE = "cover_zone_update"
    COVER_ZONES_SYNC = "cover_zones_sync"

    # ── Opportunity Attacks ──
    OPPORTUNITY_ATTACK_WARNING = "opportunity_attack_warning"
    OPPORTUNITY_ATTACK_CONFIRM_MOVE = "opportunity_attack_confirm_move"
    OPPORTUNITY_ATTACK_PROMPT = "opportunity_attack_prompt"
    OPPORTUNITY_ATTACK_RESOLVE = "opportunity_attack_resolve"

    # ── Attack Preview ──
    ATTACK_PREVIEW = "attack_preview"
    ATTACK_PREVIEW_RESULT = "attack_preview_result"

    # ── Turn Skip / Surprised ──
    TURN_SKIPPED = "turn_skipped"

    # ── Resource Tracking ──
    SPELL_SLOT_USE = "spell_slot_use"
    SPELL_SLOT_RECOVER = "spell_slot_recover"
    RESOURCE_UPDATE = "resource_update"
    REST_SHORT = "rest_short"
    REST_LONG = "rest_long"
    CHARACTER_LOAD_REQUEST = "character_load_request"
    CHARACTER_LOAD_RESPONSE = "character_load_response"
    CHARACTER_LIST_REQUEST = "character_list_request"
    CHARACTER_LIST_RESPONSE = "character_list_response"
    CHARACTER_DELETE_REQUEST = "character_delete_request"
    CHARACTER_DELETE_RESPONSE = "character_delete_response"
    # Delta/real-time character update
    CHARACTER_UPDATE = "character_update"
    CHARACTER_UPDATE_RESPONSE = "character_update_response"
    # Character action log
    CHARACTER_LOG_REQUEST = "character_log_request"
    CHARACTER_LOG_RESPONSE = "character_log_response"
    # Skill/ability/saving-throw rolls
    CHARACTER_ROLL = "character_roll"
    CHARACTER_ROLL_RESULT = "character_roll_result"
    # XP award (DM → server → all clients for that character)
    XP_AWARD = "xp_award"
    XP_AWARD_RESPONSE = "xp_award_response"
    # Multiclass request (player → server → broadcast CHARACTER_UPDATE)
    MULTICLASS_REQUEST = "multiclass_request"
    MULTICLASS_RESPONSE = "multiclass_response"

    # Batch messaging for performance
    BATCH = "batch"

    # Dynamic lighting / table settings
    TABLE_SETTINGS_UPDATE = "table_settings_update"    # DM → server: change lighting settings
    TABLE_SETTINGS_CHANGED = "table_settings_changed"  # server → all clients: settings broadcast

    # Wall segment system
    WALL_CREATE      = "wall_create"        # DM → server: add a wall
    WALL_UPDATE      = "wall_update"        # DM → server: modify wall properties
    WALL_REMOVE      = "wall_remove"        # DM → server: delete a wall
    WALL_BATCH_CREATE = "wall_batch_create" # DM → server: add many walls at once
    WALL_DATA        = "wall_data"          # server → client(s): single or batch wall state
    DOOR_TOGGLE      = "door_toggle"        # any permitted role → server: toggle door state

    # Layer settings persistence (DM-only write, broadcast to all)
    LAYER_SETTINGS_UPDATE = "layer_settings_update"  # DM → server + server → all clients

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
    data: Dict[str, Any] = field(default_factory=dict)
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
