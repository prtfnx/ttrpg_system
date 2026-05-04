import time
from typing import Dict, Any, Callable

from core_table.protocol import Message, MessageType, BatchMessage
from core_table.actions_core import ActionsCore
from utils.logger import setup_logger

from .sprites import _SpritesMixin
from .tables import _TablesMixin
from .assets import _AssetsMixin
from .players import _PlayersMixin
from .characters import _CharactersMixin
from .auth import _AuthMixin
from .walls import _WallsMixin
from .session import _SessionMixin
from .combat import _CombatMixin
from .encounter import _EncounterMixin
from .helpers import _HelpersMixin

logger = setup_logger(__name__)


class ServerProtocol(
    _SpritesMixin,
    _TablesMixin,
    _AssetsMixin,
    _PlayersMixin,
    _CharactersMixin,
    _AuthMixin,
    _WallsMixin,
    _SessionMixin,
    _CombatMixin,
    _EncounterMixin,
    _HelpersMixin,
):
    # Class-level store for moves pending OA resolution: "{session}:{sprite_id}" → move data
    _pending_moves: dict = {}
    """
    WebSocket message dispatcher for the TTRPG server.

    Methods are organised into domain mixins under service/protocol/:
      sprites.py     — sprite CRUD, previews, compendium sprites
      tables.py      — table CRUD, settings, active-table management
      assets.py      — asset upload/download/hash/R2 sync
      players.py     — player list/kick/ban/status
      characters.py  — character save/load/update/XP/multiclass
      auth.py        — WS auth stubs (redirect to HTTP)
      walls.py       — wall/door CRUD + batch
      session.py     — layer settings, game mode, session rules
      combat.py      — initiative, turns, conditions, DM tools, cover
      encounter.py   — encounter start/end/choice/roll
      helpers.py     — send_to_client, broadcast, session helpers
    """

    def __init__(self, table_manager, session_manager=None):
        logger.info("Initializing ServerProtocol")
        self.table_manager = table_manager
        self.session_manager = session_manager
        self.clients: Dict[str, Any] = {}
        self.handlers: Dict[MessageType, Callable] = {}
        self.init_handlers()
        self.actions = ActionsCore(self.table_manager)
        # Ensure tables have id mapping
        if not self.table_manager.tables_id:
            self.table_manager.tables_id = {
                str(t.table_id): t for t in self.table_manager.tables.values()
            }
            logger.debug(
                f"Initialized tables_id with {len(self.table_manager.tables_id)} tables"
            )
        self._rules_cache: Dict[str, Any] = {}

    def register_handler(self, msg_type: MessageType, handler: Callable):
        """Extension point for custom message handlers."""
        self.handlers[msg_type] = handler

    def init_handlers(self):
        """Register all built-in protocol handlers."""
        self.register_handler(MessageType.PING, self.handle_ping)
        self.register_handler(MessageType.PONG, self.handle_pong)
        self.register_handler(MessageType.TEST, self.handle_test)
        self.register_handler(MessageType.BATCH, self.handle_batch)
        self.register_handler(MessageType.ERROR, self.handle_error)
        self.register_handler(MessageType.SUCCESS, self.handle_success)

        # Authentication
        self.register_handler(MessageType.AUTH_REGISTER, self.handle_auth_register)
        self.register_handler(MessageType.AUTH_LOGIN, self.handle_auth_login)
        self.register_handler(MessageType.AUTH_LOGOUT, self.handle_auth_logout)
        self.register_handler(MessageType.AUTH_TOKEN, self.handle_auth_token)
        self.register_handler(MessageType.AUTH_STATUS, self.handle_auth_status)

        # Tables
        self.register_handler(MessageType.NEW_TABLE_REQUEST, self.handle_new_table_request)
        self.register_handler(MessageType.TABLE_REQUEST, self.handle_table_request)
        self.register_handler(MessageType.TABLE_UPDATE, self.handle_table_update)
        self.register_handler(MessageType.TABLE_SCALE, self.handle_table_scale)
        self.register_handler(MessageType.TABLE_MOVE, self.handle_table_move)
        self.register_handler(MessageType.TABLE_DELETE, self.handle_delete_table)
        self.register_handler(MessageType.TABLE_LIST_REQUEST, self.handle_table_list_request)
        self.register_handler(MessageType.TABLE_ACTIVE_REQUEST, self.handle_table_active_request)
        self.register_handler(MessageType.TABLE_ACTIVE_SET, self.handle_table_active_set)
        self.register_handler(MessageType.TABLE_ACTIVE_SET_ALL, self.handle_table_active_set_all)
        self.register_handler(MessageType.TABLE_SETTINGS_UPDATE, self.handle_table_settings_update)

        # Players
        self.register_handler(MessageType.PLAYER_ACTION, self.handle_player_action)
        self.register_handler(MessageType.PLAYER_READY, self.handle_player_ready)
        self.register_handler(MessageType.PLAYER_UNREADY, self.handle_player_unready)
        self.register_handler(MessageType.PLAYER_STATUS, self.handle_player_status)
        self.register_handler(MessageType.PLAYER_LIST_REQUEST, self.handle_player_list_request)
        self.register_handler(MessageType.PLAYER_KICK_REQUEST, self.handle_player_kick_request)
        self.register_handler(MessageType.PLAYER_BAN_REQUEST, self.handle_player_ban_request)
        self.register_handler(MessageType.CONNECTION_STATUS_REQUEST, self.handle_connection_status_request)

        # Sprites
        self.register_handler(MessageType.SPRITE_REQUEST, self.handle_sprite_request)
        self.register_handler(MessageType.SPRITE_CREATE, self.handle_create_sprite)
        self.register_handler(MessageType.SPRITE_REMOVE, self.handle_delete_sprite)
        self.register_handler(MessageType.SPRITE_MOVE, self.handle_move_sprite)
        self.register_handler(MessageType.SPRITE_SCALE, self.handle_scale_sprite)
        self.register_handler(MessageType.SPRITE_ROTATE, self.handle_rotate_sprite)
        self.register_handler(MessageType.SPRITE_UPDATE, self.handle_sprite_update)
        self.register_handler(MessageType.SPRITE_DRAG_PREVIEW, self.handle_sprite_drag_preview)
        self.register_handler(MessageType.SPRITE_RESIZE_PREVIEW, self.handle_sprite_resize_preview)
        self.register_handler(MessageType.SPRITE_ROTATE_PREVIEW, self.handle_sprite_rotate_preview)

        # Files & Assets
        self.register_handler(MessageType.FILE_REQUEST, self.handle_file_request)
        self.register_handler(MessageType.FILE_DATA, self.handle_file_data)
        self.register_handler(MessageType.ASSET_UPLOAD_REQUEST, self.handle_asset_upload_request)
        self.register_handler(MessageType.ASSET_DOWNLOAD_REQUEST, self.handle_asset_download_request)
        self.register_handler(MessageType.ASSET_LIST_REQUEST, self.handle_asset_list_request)
        self.register_handler(MessageType.ASSET_UPLOAD_CONFIRM, self.handle_asset_upload_confirm)
        self.register_handler(MessageType.ASSET_DELETE_REQUEST, self.handle_asset_delete_request)
        self.register_handler(MessageType.ASSET_HASH_CHECK, self.handle_asset_hash_check)

        # Compendium sprites
        self.register_handler(MessageType.COMPENDIUM_SPRITE_ADD, self.handle_compendium_sprite_add)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_UPDATE, self.handle_compendium_sprite_update)
        self.register_handler(MessageType.COMPENDIUM_SPRITE_REMOVE, self.handle_compendium_sprite_remove)

        # Characters
        self.register_handler(MessageType.CHARACTER_SAVE_REQUEST, self.handle_character_save_request)
        self.register_handler(MessageType.CHARACTER_LOAD_REQUEST, self.handle_character_load_request)
        self.register_handler(MessageType.CHARACTER_LIST_REQUEST, self.handle_character_list_request)
        self.register_handler(MessageType.CHARACTER_DELETE_REQUEST, self.handle_character_delete_request)
        if hasattr(MessageType, 'CHARACTER_UPDATE'):
            self.register_handler(MessageType.CHARACTER_UPDATE, self.handle_character_update)
        if hasattr(MessageType, 'CHARACTER_LOG_REQUEST'):
            self.register_handler(MessageType.CHARACTER_LOG_REQUEST, self.handle_character_log_request)
        if hasattr(MessageType, 'CHARACTER_ROLL'):
            self.register_handler(MessageType.CHARACTER_ROLL, self.handle_character_roll)
        if hasattr(MessageType, 'XP_AWARD'):
            self.register_handler(MessageType.XP_AWARD, self.handle_xp_award)
        if hasattr(MessageType, 'MULTICLASS_REQUEST'):
            self.register_handler(MessageType.MULTICLASS_REQUEST, self.handle_multiclass_request)

        # Walls & doors
        self.register_handler(MessageType.WALL_CREATE,       self.handle_wall_create)
        self.register_handler(MessageType.WALL_UPDATE,       self.handle_wall_update)
        self.register_handler(MessageType.WALL_REMOVE,       self.handle_wall_remove)
        self.register_handler(MessageType.WALL_BATCH_CREATE, self.handle_wall_batch_create)
        self.register_handler(MessageType.DOOR_TOGGLE,       self.handle_door_toggle)

        # Session
        self.register_handler(MessageType.LAYER_SETTINGS_UPDATE, self.handle_layer_settings_update)
        self.register_handler(MessageType.GAME_MODE_CHANGE,      self.handle_game_mode_change)
        self.register_handler(MessageType.SESSION_RULES_UPDATE,  self.handle_session_rules_update)
        self.register_handler(MessageType.SESSION_RULES_REQUEST, self.handle_session_rules_request)

        # Combat
        self.register_handler(MessageType.COMBAT_START,          self.handle_combat_start)
        self.register_handler(MessageType.COMBAT_END,            self.handle_combat_end)
        self.register_handler(MessageType.COMBAT_STATE_REQUEST,  self.handle_combat_state_request)
        self.register_handler(MessageType.INITIATIVE_ROLL,       self.handle_initiative_roll)
        self.register_handler(MessageType.INITIATIVE_SET,        self.handle_initiative_set)
        self.register_handler(MessageType.INITIATIVE_ADD,        self.handle_initiative_add)
        self.register_handler(MessageType.INITIATIVE_REMOVE,     self.handle_initiative_remove)
        self.register_handler(MessageType.TURN_END,              self.handle_turn_end)
        self.register_handler(MessageType.TURN_SKIP,             self.handle_turn_skip)
        self.register_handler(MessageType.CONDITION_ADD,         self.handle_condition_add)
        self.register_handler(MessageType.CONDITION_REMOVE,      self.handle_condition_remove)
        self.register_handler(MessageType.DM_SET_HP,             self.handle_dm_set_hp)
        self.register_handler(MessageType.DM_APPLY_DAMAGE,       self.handle_dm_apply_damage)
        self.register_handler(MessageType.DM_REVERT_ACTION,      self.handle_dm_revert_action)
        self.register_handler(MessageType.DM_ADD_ACTION,         self.handle_dm_add_action)
        self.register_handler(MessageType.DM_ADD_MOVEMENT,       self.handle_dm_add_movement)
        self.register_handler(MessageType.DM_TOGGLE_AI,          self.handle_dm_toggle_ai)
        self.register_handler(MessageType.DM_SET_TEMP_HP,        self.handle_dm_set_temp_hp)
        self.register_handler(MessageType.DEATH_SAVE_ROLL,       self.handle_death_save_roll)
        self.register_handler(MessageType.DM_SET_RESISTANCES,    self.handle_dm_set_resistances)
        self.register_handler(MessageType.DM_SET_SURPRISED,      self.handle_dm_set_surprised)
        self.register_handler(MessageType.DM_SET_TERRAIN,        self.handle_dm_set_terrain)
        self.register_handler(MessageType.COVER_ZONE_ADD,        self.handle_cover_zone_add)
        self.register_handler(MessageType.COVER_ZONE_REMOVE,     self.handle_cover_zone_remove)
        self.register_handler(MessageType.COVER_ZONES_SYNC,      self.handle_cover_zones_sync)
        self.register_handler(MessageType.ATTACK_PREVIEW,        self.handle_attack_preview)
        self.register_handler(MessageType.OPPORTUNITY_ATTACK_CONFIRM_MOVE, self.handle_oa_confirm_move)
        self.register_handler(MessageType.OPPORTUNITY_ATTACK_RESOLVE,      self.handle_oa_resolve)
        self.register_handler(MessageType.AI_ACTION,             self.handle_ai_action)
        self.register_handler(MessageType.ACTION_COMMIT,         self.handle_action_commit)

        # Encounters
        self.register_handler(MessageType.ENCOUNTER_START,  self.handle_encounter_start)
        self.register_handler(MessageType.ENCOUNTER_END,    self.handle_encounter_end)
        self.register_handler(MessageType.ENCOUNTER_CHOICE, self.handle_encounter_choice)
        self.register_handler(MessageType.ENCOUNTER_ROLL,   self.handle_encounter_roll)

    async def handle_client(self, msg: Message, client_id: str) -> bool:
        """Dispatch an incoming message to the registered handler."""
        logger.debug(f"msg received: {msg}")
        logger.debug(f"Handling message type: {msg.type} for client {client_id}")
        if msg.type in self.handlers:
            response = await self.handlers[msg.type](msg, client_id)
            if response:
                logger.debug(f"Sending response to client {client_id}: {response}")
                await self.send_to_client(response, client_id)
            return True
        logger.warning(f"No handler registered for message type: {msg.type}")
        return False

    # ── Misc handlers ─────────────────────────────────────────────────────────

    async def handle_ping(self, msg: Message, client_id: str) -> Message:
        logger.info(f"PING received from client {client_id}")
        return Message(MessageType.PONG, {'timestamp': time.time(), 'client_id': client_id})

    async def handle_pong(self, msg: Message, client_id: str) -> Message:
        logger.debug(f"Received pong from {client_id}")
        return Message(MessageType.SUCCESS, {'pong_acknowledged': True})

    async def handle_success(self, msg: Message, client_id: str) -> Message:
        logger.debug(f"Received success from {client_id}: {msg}")
        return Message(MessageType.SUCCESS, {'acknowledged': True})

    async def handle_error(self, msg: Message, client_id: str) -> Message:
        logger.warning(f"Error message received from {client_id}: {msg}")
        return Message(MessageType.SUCCESS, {'error_acknowledged': True})

    async def handle_test(self, msg: Message, client_id: str) -> Message:
        return Message(MessageType.SUCCESS, {
            'message': 'Test message received',
            'server_time': time.time(),
            'echo_data': msg.data,
        })

    async def handle_batch(self, msg: Message, client_id: str) -> Message:
        """Process a batch of messages and return aggregated responses."""
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data provided in batch message'})
        messages_data = msg.data.get('messages', [])
        sequence_id = msg.data.get('seq', 0)
        logger.debug(f"Batch of {len(messages_data)} messages from {client_id}")
        responses = []
        for msg_data in messages_data:
            try:
                individual_msg = Message(
                    type=MessageType(msg_data.get('type')),
                    data=msg_data.get('data', {}),
                    client_id=msg_data.get('client_id'),
                    timestamp=msg_data.get('timestamp'),
                    version=msg_data.get('version', '0.1'),
                    priority=msg_data.get('priority', 5),
                    sequence_id=msg_data.get('sequence_id'),
                )
                handler = self.handlers.get(individual_msg.type)
                if handler:
                    response = await handler(individual_msg, client_id)
                    if response and hasattr(response, 'to_json'):
                        responses.append(response)
                else:
                    logger.warning(f"No handler for batch message type: {individual_msg.type}")
            except Exception as e:
                logger.error(f"Error processing batch message: {e}")
                responses.append(Message(MessageType.ERROR, {
                    'error': f'Batch message processing error: {str(e)}',
                    'original_message': msg_data,
                }))
        if responses:
            return Message(MessageType.BATCH, {
                'messages': [
                    {
                        'type': r.type.value, 'data': r.data or {},
                        'client_id': r.client_id, 'timestamp': r.timestamp,
                        'version': r.version, 'priority': r.priority,
                        'sequence_id': r.sequence_id,
                    }
                    for r in responses
                ],
                'seq': sequence_id,
                'processed_count': len(messages_data),
                'response_count': len(responses),
            })
        return Message(MessageType.SUCCESS, {
            'message': f'Batch processed: {len(messages_data)} messages',
            'seq': sequence_id,
            'processed_count': len(messages_data),
        })
