"""Stage compatible transport members privately and commit their writes together."""
import copy
from contextlib import AsyncExitStack
from types import MethodType

from core_table.actions_core import ActionsCore
from core_table.protocol import Message, MessageType
from service.canvas_command_service import CanvasRejected
from service.combat_engine import CombatEngine
from service.sprite_editor_commands import (
    EDITOR_UPDATE_FIELDS,
    SpriteCommandScope,
    SpriteEditorCommandService,
    sprite_command_scope,
)
from utils.blocking import run_blocking
from utils.logger import setup_logger

logger = setup_logger(__name__)
_TYPES = {MessageType.SPRITE_CREATE, MessageType.SPRITE_REMOVE, MessageType.SPRITE_MOVE,
    MessageType.SPRITE_SCALE, MessageType.SPRITE_ROTATE}


def can_buffer(message):
    table_id = message.data.get('table_id')
    if not isinstance(table_id, str) or not table_id or table_id != table_id.strip():
        # Keep malformed/legacy aliases on the ordinary validation path. A
        # whitespace alias must not bypass the canonical table's private fork.
        return False
    if message.type == MessageType.SPRITE_CREATE and (
            message.data.get('character_id') or (message.data.get('sprite_data') or {}).get('character_id')):
        # Binding stats are resolved during SQL acceptance. Its canonical
        # publication must be built after that resolution, not collected early.
        return False
    return message.type in _TYPES or (message.type == MessageType.SPRITE_UPDATE
        and isinstance(message.data, dict) and set(message.data) <= EDITOR_UPDATE_FIELDS)


async def apply_sprite_batch(protocol, messages, client_id, factory):
    async with AsyncExitStack() as ownership:
        for table_id in sorted({message.data['table_id'] for message in messages}):
            await ownership.enter_async_context(protocol.table_manager.table_write_lock(table_id))
        return await _apply_sprite_batch(protocol, messages, client_id, factory)


async def _apply_sprite_batch(protocol, messages, client_id, factory):
    """Called under the session lock. No live state or events escape before commit.

    Validation denials are independent. A storage failure rolls back the entire
    provisional write run. Non-sprite commands are barriers in the dispatcher.
    """
    manager = copy.copy(protocol.table_manager)
    affected = {message.data.get("table_id") for message in messages}
    tables = {id(table): table.fork_for_sprite_edit() if str(table.table_id) in affected else table
        for table in manager.tables.values()}
    manager.tables = {key: tables[id(table)] for key, table in manager.tables.items()}
    manager.tables_id = {key: tables[id(table)] for key, table in manager.tables_id.items()}
    staged = copy.copy(protocol)
    staged.table_manager = manager
    staged.actions = ActionsCore(manager)
    staged.actions.sprite_delta_snapshots = True
    staged.handlers = {kind: MethodType(handler.__func__, staged)
        if getattr(handler, "__self__", None) is protocol else handler
        for kind, handler in protocol.handlers.items()}
    writes, publications, responses, seen = [], [], [], {}

    async def collect(table, before_snapshot, _result, session_id):
        scope = sprite_command_scope.get()
        if scope is None or scope.session_id != session_id:
            raise ValueError("Buffered sprite command has no trusted scope")
        combat = CombatEngine.get_state(protocol._get_session_code())
        combat_ids = tuple(str(member.entity_id) for member in combat.combatants) if (
            combat is not None and combat.table_id == scope.table_id
            and getattr(combat.phase, "value", combat.phase) != "inactive") else ()
        writes.append(dict(scope=scope, before_snapshot=before_snapshot, staged=table, combat_sprite_ids=combat_ids))
        scope.receipt.update(success=True, table_id=scope.table_id)
        return True

    async def send(message, target):
        publications.append(("send_to_client", copy.deepcopy(message), (target,)))

    async def broadcast(message, excluded=None):
        publications.append(("broadcast_to_session", copy.deepcopy(message), (excluded,)))

    async def filtered(message, layer, excluded):
        publications.append(("broadcast_filtered", copy.deepcopy(message), (layer, excluded)))

    staged.actions.persist_sprite_command = collect
    staged.send_to_client, staged.broadcast_to_session, staged.broadcast_filtered = send, broadcast, filtered
    attempt = None
    try:
        scopes = [SpriteCommandScope.from_message(message, protocol._get_session_id(message),
            protocol._get_user_id(message, client_id)) for message in messages]
        staged._sprite_batch_replays = await run_blocking(SpriteEditorCommandService(factory).replay_many,
            [scope for scope in scopes if scope is not None])
        for message in messages:
            scope = SpriteCommandScope.from_message(message, protocol._get_session_id(message),
                protocol._get_user_id(message, client_id))
            if scope and scope.operation_id in seen:
                old_hash = seen[scope.operation_id]
                response = Message(MessageType.SPRITE_RESPONSE, {"success": True,
                    "table_id": scope.table_id, "resync_required": True}) if old_hash == scope.request_hash else Message(
                        MessageType.ERROR, {"error": "Message identity was reused", "code": "invalid_payload"})
            else:
                response = await staged._invoke_handler(message, client_id)
                if scope and response and response.type not in {MessageType.ERROR, MessageType.ACTION_REJECTED}:
                    seen[scope.operation_id] = scope.request_hash
            responses.append(response)
        if writes:
            attempt = protocol._remember_sprite_write(writes, factory)
            receipts = await run_blocking(SpriteEditorCommandService(factory).persist_many, writes)
            attempt.accepted = True
            by_id = {write["scope"].operation_id: receipt for write, receipt in zip(writes, receipts, strict=True)}
            for message, response in zip(messages, responses, strict=True):
                scope = SpriteCommandScope.from_message(message, protocol._get_session_id(message),
                    protocol._get_user_id(message, client_id))
                if scope and response and scope.operation_id in by_id and response.type != MessageType.ERROR:
                    response.data = {**response.data, **by_id[scope.operation_id]}
            for table in protocol.table_manager.tables.values():
                replacement = tables[id(table)]
                if replacement is table:
                    continue
                table.__dict__.clear()
                table.__dict__.update(replacement.__dict__)
            protocol._complete_sprite_write(attempt)
    except Exception as exc:
        logger.exception("Buffered sprite acceptance or installation needs settlement")
        if attempt is not None:
            if isinstance(exc, CanvasRejected):
                attempt.failure = (exc.code, str(exc))
            try:
                attempt, outcome = await protocol._settle_sprite_write(tables_owned=True)
            except Exception:
                logger.exception('Buffered sprite outcome remains unknown')
                outcome = None
            settled = []
            for index, message in enumerate(messages):
                response = responses[index] if index < len(responses) else None
                scope = next((item for item in attempt.scopes if item.message_id == message.message_id), None)
                if scope is not None and (response is None or response.type not in {MessageType.ERROR, MessageType.ACTION_REJECTED}):
                    response = (protocol._sprite_settled_response(attempt, outcome, scope) if outcome is not None
                        else protocol._sprite_unknown(scope))
                settled.append(response)
            # Provisional events/history are discarded. Recovered peers receive
            # current-state read hints, and the caller streams each receipt.
            return settled
        return [Message(MessageType.ERROR, {"error": "Sprite batch could not be saved; reload before retrying",
            "code": "persistence_failed", "resync_required": True}) for _ in messages]
    try:
        for entry in staged.actions.action_history:
            await protocol.actions._add_to_history(entry)
    except Exception:
        # The journal and canonical state are already committed. In-memory
        # history availability is recoverable; it cannot become a rejection.
        logger.exception("Buffered sprite history publication failed after commit")
        for response in responses:
            if response and response.type not in {MessageType.ERROR, MessageType.ACTION_REJECTED}:
                response.data["resync_required"] = True
    for method, message, args in publications:
        try:
            await getattr(protocol, method)(message, *args)
        except Exception:
            logger.exception("Buffered sprite publication failed after commit")
            for response in responses:
                if response and response.type not in {MessageType.ERROR, MessageType.ACTION_REJECTED}:
                    response.data["resync_required"] = True
    return responses
