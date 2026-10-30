import asyncio
import inspect
import time
from collections.abc import Awaitable, Callable
from typing import Any, Dict

from core_table.action_batches import _finish_before_cancellation
from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from service.canvas_command_service import CanvasRejected
from service.command_policy import MUTATING_MESSAGE_TYPES, SESSION_STATE_READ_MESSAGE_TYPES
from service.sprite_command_batch import apply_sprite_batch, can_buffer
from service.sprite_editor_commands import (
    SPRITE_COMMAND_TYPES,
    SpriteCommandScope,
    SpriteEditorCommandService,
    sprite_command_scope,
)
from utils.action_diagnostics import ActionDiagnostics, current_action_diagnostics
from utils.blocking import run_blocking
from utils.logger import log_context, setup_logger

from ..legacy_paint import is_legacy_paint_message, legacy_paint_upgrade_data
from .assets import _AssetsMixin
from .canvas import _CanvasMixin
from .characters import _CharactersMixin
from .chat import _ChatMixin
from .combat import _CombatMixin
from .encounter import CHOICE_ENCOUNTER_MUTATIONS, _EncounterMixin
from .helpers import _HelpersMixin
from .measurements import _MeasurementsMixin
from .paint import _PaintMixin
from .players import _PlayersMixin
from .session import _SessionMixin
from .sprites import _SpritesMixin
from .tables import _TablesMixin
from .walls import _WallsMixin

logger = setup_logger(__name__)

# Transport accepts 50 members; durable sub-runs publish receipts sooner.
MAX_SPRITE_RUN_COMMANDS = 10


SERIALIZED_MESSAGE_TYPES = MUTATING_MESSAGE_TYPES | SESSION_STATE_READ_MESSAGE_TYPES

# These payloads use success for command/query acceptance. Encounter and dice
# results use it for game outcomes, so a failed roll must not count as a denial.
SUCCESS_FLAG_RESPONSES = frozenset({
    MessageType.CANVAS_COMMAND_RESULT,
    MessageType.ASSET_UPLOAD_RESPONSE, MessageType.ASSET_DOWNLOAD_RESPONSE,
    MessageType.ASSET_DELETE_RESPONSE, MessageType.TABLE_ACTIVE_SET_ALL_RESPONSE,
    MessageType.CHARACTER_SAVE_RESPONSE, MessageType.CHARACTER_LOAD_RESPONSE,
    MessageType.CHARACTER_LIST_RESPONSE, MessageType.CHARACTER_DELETE_RESPONSE,
    MessageType.CHARACTER_UPDATE_RESPONSE, MessageType.CHARACTER_LOG_RESPONSE,
    MessageType.CHARACTER_DRAFT_CREATE_RESPONSE, MessageType.CHARACTER_DRAFT_LIST_RESPONSE,
    MessageType.CHARACTER_DRAFT_LOAD_RESPONSE, MessageType.CHARACTER_DRAFT_UPDATE_RESPONSE,
    MessageType.CHARACTER_DRAFT_FINALIZE_RESPONSE, MessageType.CHARACTER_DRAFT_ABANDON_RESPONSE,
    MessageType.XP_AWARD_RESPONSE, MessageType.MULTICLASS_RESPONSE,
})


def _response_failed(response: Message) -> bool:
    return (response.type in {MessageType.ERROR, MessageType.ACTION_REJECTED}
            or response.type in SUCCESS_FLAG_RESPONSES and response.data.get('success') is False
            or response.type == MessageType.CANVAS_HISTORY_STATE and 'error' in response.data)


class ServerProtocol(
    _CanvasMixin,
    _SpritesMixin,
    _TablesMixin,
    _AssetsMixin,
    _PlayersMixin,
    _CharactersMixin,
    _WallsMixin,
    _PaintMixin,
    _MeasurementsMixin,
    _SessionMixin,
    _CombatMixin,
    _EncounterMixin,
    _HelpersMixin,
    _ChatMixin,
):
    """
    WebSocket message dispatcher for the TTRPG server.

    Methods are organised into domain mixins under service/protocol/:
      sprites.py     — sprite CRUD, previews, compendium sprites
      tables.py      — table CRUD, settings, active-table management
      assets.py      — asset upload/download/hash/R2 sync
      players.py     — player list/kick/ban/status
      characters.py  — character save/load/update/XP/multiclass
      walls.py       — wall/door CRUD
      session.py     — layer settings, game mode, session rules
      combat.py      — initiative, turns, conditions, DM tools, cover
      encounter.py   — encounter start/end/choice/roll
      helpers.py     — send_to_client, broadcast, session helpers
      chat.py        — chat message handling and history retrieval
    """

    def __init__(
        self,
        table_manager,
        session_manager=None,
        transport_send: Callable[[Message, str], Awaitable[None]] | None = None,
        snapshot_send: Callable[[list[Message], str], Awaitable[None]] | None = None,
    ):
        logger.info("Initializing ServerProtocol")
        self.table_manager = table_manager
        self.session_manager = session_manager
        self._transport_send = transport_send
        self._snapshot_send = snapshot_send
        self._mutation_lock = asyncio.Lock()
        self._paint_preview_authorizations: dict[
            tuple[int, int, str], tuple[float, bool]
        ] = {}
        self.clients: Dict[str, Any] = {}
        self.handlers: Dict[MessageType, Callable] = {}
        self.init_handlers()
        self.actions = ActionsCore(self.table_manager)
        self.actions.persist_sprite_command = self._persist_sprite_editor_command
        self.actions.sprite_delta_snapshots = True
        # Ensure tables have id mapping
        if not self.table_manager.tables_id:
            self.table_manager.tables_id = {
                str(t.table_id): t for t in self.table_manager.tables.values()
            }
            logger.debug(
                f"Initialized tables_id with {len(self.table_manager.tables_id)} tables"
            )
        self._rules_cache: Dict[str, Any] = {}
        prior_guard = self.table_manager.persistence_guard
        self.table_manager.persistence_guard = lambda: (
            not self._has_pending_writes() and (prior_guard is None or bool(prior_guard()))
        )

    def _has_pending_writes(self) -> bool:
        return self._has_pending_combat() or self._has_pending_character_update()

    def register_handler(self, msg_type: MessageType, handler: Callable):
        """Extension point for custom message handlers."""
        self.handlers[msg_type] = handler

    def init_handlers(self):
        """Register all built-in protocol handlers."""
        self.register_handler(MessageType.PING, self.handle_ping)
        self.register_handler(MessageType.BATCH_REQUEST, self.handle_batch_request)

        # Tables
        self.register_handler(MessageType.NEW_TABLE_REQUEST, self.handle_new_table_request)
        self.register_handler(MessageType.TABLE_REQUEST, self.handle_table_request)
        self.register_handler(MessageType.TABLE_UPDATE_REQUEST, self.handle_table_update)
        self.register_handler(MessageType.TABLE_SCALE, self.handle_table_scale)
        self.register_handler(MessageType.TABLE_MOVE, self.handle_table_move)
        self.register_handler(MessageType.TABLE_DELETE, self.handle_delete_table)
        self.register_handler(MessageType.TABLE_LIST_REQUEST, self.handle_table_list_request)
        self.register_handler(MessageType.TABLE_ACTIVE_REQUEST, self.handle_table_active_request)
        self.register_handler(MessageType.TABLE_ACTIVE_SET, self.handle_table_active_set)
        self.register_handler(MessageType.TABLE_ACTIVE_SET_ALL, self.handle_table_active_set_all)
        self.register_handler(MessageType.TABLE_SETTINGS_UPDATE, self.handle_table_settings_update)

        # Players
        self.register_handler(MessageType.PLAYER_READY, self.handle_player_ready)
        self.register_handler(MessageType.PLAYER_UNREADY, self.handle_player_unready)
        self.register_handler(
            MessageType.PLAYER_STATUS_REQUEST,
            self.handle_player_status_request,
        )
        self.register_handler(MessageType.PLAYER_LIST_REQUEST, self.handle_player_list_request)
        self.register_handler(MessageType.PLAYER_KICK_REQUEST, self.handle_player_kick_request)
        self.register_handler(MessageType.PLAYER_BAN_REQUEST, self.handle_player_ban_request)

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
        self.register_handler(MessageType.CHARACTER_DRAFT_CREATE_REQUEST, self.handle_character_draft_create)
        self.register_handler(MessageType.CHARACTER_DRAFT_LIST_REQUEST, self.handle_character_draft_list)
        self.register_handler(MessageType.CHARACTER_DRAFT_LOAD_REQUEST, self.handle_character_draft_load)
        self.register_handler(MessageType.CHARACTER_DRAFT_UPDATE_REQUEST, self.handle_character_draft_update)
        self.register_handler(MessageType.CHARACTER_DRAFT_FINALIZE_REQUEST, self.handle_character_draft_finalize)
        self.register_handler(MessageType.CHARACTER_DRAFT_ABANDON_REQUEST, self.handle_character_draft_abandon)

        # Walls & doors
        self.register_handler(MessageType.WALL_CREATE,       self.handle_wall_create)
        self.register_handler(MessageType.WALL_UPDATE,       self.handle_wall_update)
        self.register_handler(MessageType.WALL_REMOVE,       self.handle_wall_remove)
        self.register_handler(MessageType.DOOR_TOGGLE,       self.handle_door_toggle)

        # Shared editor transactions and actor-scoped history
        self.register_handler(MessageType.CANVAS_COMMAND, self.handle_canvas_command)
        self.register_handler(MessageType.CANVAS_HISTORY_REQUEST, self.handle_canvas_history_request)

        # Paint objects
        self.register_handler(MessageType.PAINT_OBJECT_CREATE, self.handle_paint_object_create)
        self.register_handler(MessageType.PAINT_OBJECT_UPDATE, self.handle_paint_object_update)
        self.register_handler(MessageType.PAINT_OBJECT_DELETE, self.handle_paint_object_delete)
        self.register_handler(MessageType.PAINT_SNAPSHOT_REQUEST, self.handle_paint_snapshot_request)
        self.register_handler(MessageType.PAINT_PREVIEW, self.handle_paint_preview)
        self.register_handler(MessageType.PAINT_PREVIEW_CANCEL, self.handle_paint_preview_cancel)
        self.register_handler(MessageType.MEASUREMENT_UPSERT, self.handle_measurement_upsert)
        self.register_handler(MessageType.MEASUREMENT_DELETE, self.handle_measurement_delete)
        self.register_handler(MessageType.MEASUREMENT_CLEAR, self.handle_measurement_clear)
        self.register_handler(MessageType.MEASUREMENT_SYNC, self.handle_measurement_sync)

        # Session
        self.register_handler(MessageType.LAYER_SETTINGS_UPDATE, self.handle_layer_settings_update)
        self.register_handler(MessageType.GAME_MODE_CHANGE,      self.handle_game_mode_change)
        self.register_handler(MessageType.SESSION_RULES_UPDATE,  self.handle_session_rules_update)
        self.register_handler(MessageType.SESSION_RULES_REQUEST, self.handle_session_rules_request)

        # Combat
        self.register_handler(MessageType.COMBAT_STATE_REQUEST,  self.handle_combat_state_request)
        self.register_handler(MessageType.COVER_ZONES_SYNC,      self.handle_cover_zones_sync)
        self.register_handler(MessageType.ATTACK_PREVIEW,        self.handle_attack_preview)
        self.register_handler(MessageType.AI_ACTION,             self.handle_ai_action)
        self.register_handler(MessageType.COMBAT_COMMAND,        self.handle_combat_command)

        # Encounters
        self.register_handler(MessageType.ENCOUNTER_START,  self.handle_encounter_start)
        self.register_handler(MessageType.ENCOUNTER_END,    self.handle_encounter_end)
        self.register_handler(MessageType.ENCOUNTER_CHOICE, self.handle_encounter_choice)
        self.register_handler(MessageType.ENCOUNTER_ROLL,   self.handle_encounter_roll)

        # Chat
        self.register_handler(MessageType.CHAT, self.handle_chat)
        self.register_handler(MessageType.CHAT_REQUEST, self.handle_chat_request)
        self.register_handler(MessageType.CHAT_MODERATE, self.handle_chat_moderate)

    async def handle_client(self, msg: Message, client_id: str) -> bool:
        stats = ActionDiagnostics()
        token = current_action_diagnostics.set(stats)
        started = time.perf_counter()
        try:
            return await self._dispatch_client(msg, client_id, stats)
        finally:
            elapsed = time.perf_counter() - started
            log = logger.info if elapsed >= 0.25 else logger.debug
            log("Protocol command completed", extra={"event_name": "websocket.command.completed",
                "message_type": msg.type.value, "message_id": msg.message_id,
                "client_id": client_id, "duration_ms": round(elapsed * 1000, 2), **stats.fields()})
            current_action_diagnostics.reset(token)

    async def _dispatch_client(self, msg: Message, client_id: str, stats: ActionDiagnostics) -> bool:
        """Dispatch an incoming message to the registered handler."""
        logger.debug(
            "Dispatching WebSocket protocol message",
            extra={
                "event_name": "websocket.message.dispatch",
                "message_type": msg.type.value,
                "message_id": msg.message_id,
                "correlation_id": msg.correlation_id or msg.message_id,
                "client_id": client_id,
            },
        )
        if msg.type in self.handlers:
            if msg.type in SERIALIZED_MESSAGE_TYPES:
                waiting = time.perf_counter()
                async with self._mutation_lock:
                    waited = time.perf_counter() - waiting
                    stats.lock_wait_seconds += waited
                    if waited >= 0.25:
                        logger.info("Command waited for session mutation ownership", extra={
                            "event_name": "websocket.command.lock_wait", "message_id": msg.message_id,
                            "message_type": msg.type.value, "lock_wait_ms": round(waited * 1000, 2)})
                    response = await self._invoke_handler(msg, client_id)
            else:
                response = await self._invoke_handler(msg, client_id)
            if response:
                self._correlate_response(msg, response)
                await self.send_to_client(response, client_id)
            return True
        logger.warning(f"No handler registered for message type: {msg.type}")
        return False

    async def _invoke_handler(self, msg: Message, client_id: str):
        with log_context(message_id=msg.message_id, correlation_id=msg.correlation_id or msg.message_id,
                         message_type=msg.type.value):
            return await self._invoke_handler_in_scope(msg, client_id)

    async def _invoke_handler_in_scope(self, msg: Message, client_id: str):
        if self._has_pending_writes() or msg.type in CHOICE_ENCOUNTER_MUTATIONS | {MessageType.COMBAT_COMMAND} or (msg.type in SPRITE_COMMAND_TYPES | {MessageType.BATCH_REQUEST, MessageType.WALL_CREATE,
                MessageType.WALL_UPDATE, MessageType.WALL_REMOVE, MessageType.DOOR_TOGGLE,
                MessageType.TABLE_SETTINGS_UPDATE, MessageType.CHARACTER_UPDATE} and getattr(
                    getattr(self, "table_manager", None), "db_session", None)):
            # Include post-commit broadcasts in cancellation shielding. The
            # session lock must not release between storage and publication.
            worker = asyncio.create_task(self._invoke_after_combat_recovery(msg, client_id))
            return await _finish_before_cancellation(worker)
        return await self._invoke_after_combat_recovery(msg, client_id)

    async def _invoke_after_combat_recovery(self, msg: Message, client_id: str):
        if msg.type in SERIALIZED_MESSAGE_TYPES:
            failure = await self._recover_pending_combat()
            if failure is not None:
                return failure
            outcome = await self._recover_pending_character_update(msg, client_id)
            if outcome is not None:
                return outcome
        return await self._invoke_handler_body(msg, client_id)

    async def _invoke_handler_body(self, msg: Message, client_id: str):
        """Run one handler and persist mutation-coupled table state in order."""
        scope = None
        try:
            if msg.type in SPRITE_COMMAND_TYPES and getattr(getattr(self, "table_manager", None), "db_session", None):
                scope = SpriteCommandScope.from_message(msg, self._get_session_id(msg), self._get_user_id(msg, client_id))
            if scope is not None:
                prepared = getattr(self, "_sprite_batch_replays", None)
                replay = prepared.get((scope.operation_id, scope.request_hash)) if prepared is not None else await run_blocking(
                    SpriteEditorCommandService(SessionLocal).replay, scope)
                if isinstance(replay, CanvasRejected):
                    raise replay
                if replay is not None:
                    if msg.data.get('action_id'):
                        replay['action_id'] = msg.data['action_id']
                    return Message(MessageType.SPRITE_RESPONSE, replay)
            token = sprite_command_scope.set(scope)
            try:
                response = await self.handlers[msg.type](msg, client_id)
            finally:
                sprite_command_scope.reset(token)
            if scope is not None and scope.receipt and response is not None:
                response.data = {**(response.data or {}), **scope.receipt}
        except CanvasRejected as exc:
            return Message(MessageType.ERROR, {'error': str(exc), 'code': exc.code})
        except Exception:
            if scope is None or not scope.receipt:
                raise
            logger.exception("Sprite event publication failed after commit")
            data = {**scope.receipt, 'resync_required': True}
            if msg.data.get('action_id'):
                data['action_id'] = msg.data['action_id']
            return Message(MessageType.SPRITE_RESPONSE, data)
        if (scope is None and msg.type in {MessageType.SPRITE_UPDATE, MessageType.TABLE_UPDATE_REQUEST}
                and response is not None
                and response.type not in {MessageType.ERROR, MessageType.ACTION_REJECTED}):
            auto_save = getattr(getattr(self, "session_manager", None), "auto_save", None)
            if callable(auto_save):
                auto_save_result = auto_save()
                if inspect.isawaitable(auto_save_result):
                    await auto_save_result
        return response

    @staticmethod
    def _correlate_response(request, response):
        response.correlation_id = request.correlation_id or request.message_id
        response.causation_id = request.message_id
        # Every outcome, including validation and permission failures, releases
        # its exact optimistic owner. Never depend on an optional handler echo.
        if request.type in MUTATING_MESSAGE_TYPES:
            for key in ("action_id", "operation_id", "table_id", "sprite_id"):
                value = (request.data or {}).get(key)
                if isinstance(value, str) and len(value) <= 128:
                    response.data.setdefault(key, value)

    async def wait_for_mutations(self) -> None:
        """Wait until every earlier mutation for this session has completed."""
        async with self._mutation_lock:
            return

    # ── Misc handlers ─────────────────────────────────────────────────────────

    async def handle_ping(self, msg: Message, client_id: str) -> Message:
        logger.debug(f"PING received from client {client_id}")
        return Message(MessageType.PONG, {'timestamp': time.time(), 'client_id': client_id})

    async def handle_batch_request(self, msg: Message, client_id: str) -> Message:
        """Aggregate transport messages, not an atomic domain transaction."""
        if not isinstance(msg.data, dict):
            return Message(MessageType.ERROR, {'error': 'Batch data must be an object'})
        messages_data = msg.data.get('messages')
        # Repeat the endpoint's structural checks for other protocol callers.
        # Preflight the whole envelope before invoking any mutating handler.
        if (not isinstance(messages_data, list) or not 1 <= len(messages_data) <= 50
                or any(not isinstance(item, dict) or item.get('type') == MessageType.BATCH_REQUEST.value
                       for item in messages_data)):
            return Message(MessageType.ERROR, {'error': 'Batch requires 1–50 messages and cannot contain nested batches'})
        sequence_id = msg.data.get('seq', 0)
        logger.debug(f"Batch of {len(messages_data)} messages from {client_id}")
        responses = []
        streamed = set()

        async def record_response(request, response):
            self._correlate_response(request, response)
            responses.append(response)
            if request.type in MUTATING_MESSAGE_TYPES or response.type in {MessageType.TABLE_RESPONSE, MessageType.TABLE_DATA}:
                # Receipts and full snapshots must not wait for unrelated
                # members or be duplicated inside an oversized summary frame.
                await self.send_to_client(response, client_id)
                streamed.add(response.message_id)

        index = 0
        while index < len(messages_data):
            msg_data = messages_data[index]
            index += 1
            individual_msg = None
            try:
                if is_legacy_paint_message(msg_data):
                    response = Message(MessageType.ERROR, legacy_paint_upgrade_data())
                    response.correlation_id = msg_data.get('correlation_id') or msg_data.get('message_id')
                    response.causation_id = msg_data.get('message_id')
                    responses.append(response)
                    continue
                individual_msg = Message.from_dict(msg_data)
                if (can_buffer(individual_msg)
                        and not self._has_pending_writes()
                        and getattr(getattr(self, "table_manager", None), "db_session", None)):
                    run = [individual_msg]
                    while index < len(messages_data) and len(run) < MAX_SPRITE_RUN_COMMANDS:
                        try:
                            following = Message.from_dict(messages_data[index])
                        except ValueError:
                            break
                        if not can_buffer(following):
                            break
                        run.append(following)
                        index += 1
                    if len(run) > 1:
                        outcomes = await apply_sprite_batch(self, run, client_id, SessionLocal)
                        for request, outcome in zip(run, outcomes, strict=True):
                            if outcome:
                                await record_response(request, outcome)
                        continue
                handler = self.handlers.get(individual_msg.type)
                if handler:
                    response = await self._invoke_handler(individual_msg, client_id)
                    if response and hasattr(response, 'to_json'):
                        if response.type == MessageType.PAINT_SNAPSHOT_CHUNK:
                            self._correlate_response(individual_msg, response)
                            # The paint handler already streams earlier chunks.
                            # Nesting its final chunk (or several snapshots) in
                            # a batch would invalidate the complete frame budget.
                            await self.send_to_client(response, client_id)
                            continue
                        await record_response(individual_msg, response)
                else:
                    logger.warning(f"No handler for batch message type: {individual_msg.type}")
                    response = Message(MessageType.ERROR, {'error': 'Unsupported batch message type'})
                    response.correlation_id = individual_msg.correlation_id or individual_msg.message_id
                    response.causation_id = individual_msg.message_id
                    responses.append(response)
            except Exception:
                logger.exception("Batch message processing failed")
                error: dict[str, Any] = {'error': 'Batch message processing failed',
                    'code': 'invalid_payload' if individual_msg is None else 'outcome_unknown'}
                if individual_msg is not None:
                    error['resync_required'] = True
                responses.append(Message(MessageType.ERROR, error))
                responses[-1].correlation_id = msg_data.get('correlation_id') or msg_data.get('message_id')
                responses[-1].causation_id = msg_data.get('message_id')
                for key in ('action_id', 'operation_id', 'table_id', 'sprite_id'):
                    value = msg_data.get('data', {}).get(key) if isinstance(msg_data.get('data'), dict) else None
                    if isinstance(value, str) and 0 < len(value) <= 128:
                        responses[-1].data[key] = value
        return Message(MessageType.BATCH_RESPONSE, {
            'messages': [response.to_dict() for response in responses if response.message_id not in streamed],
            'seq': sequence_id,
            'processed_count': len(messages_data),
            'response_count': len(responses),
            'failed_count': sum(_response_failed(response) for response in responses),
            'atomic': False,
        })
