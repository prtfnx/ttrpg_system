"""Retain sprite/session ownership until SQL settlement and current installation."""
from contextlib import AsyncExitStack

from core_table.protocol import Message, MessageType
from service.canvas_command_service import CanvasRejected
from service.sprite_editor_commands import SpriteCommandScope
from service.sprite_write_recovery import PendingSpriteWrite, resolve_sprite_write
from utils.blocking import run_blocking
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _SpriteOutcomesMixin(_ProtocolBase):
    _pending_sprite_write: PendingSpriteWrite | None = None

    def _has_pending_sprite_write(self) -> bool:
        return self._pending_sprite_write is not None

    def _remember_sprite_write(self, commands, factory):
        if self._has_pending_sprite_write():
            raise RuntimeError('An earlier sprite outcome still owns this session')
        attempt = PendingSpriteWrite.create(commands, factory)
        self._pending_sprite_write = attempt
        return attempt

    def _complete_sprite_write(self, attempt):
        if self._pending_sprite_write is attempt:
            self._pending_sprite_write = None

    @staticmethod
    def _sprite_unknown(scope=None):
        return Message(MessageType.ERROR, {'code': 'outcome_unknown', 'outcome': 'unknown',
            'error': 'Sprite save is still being checked. Keep the original request before retrying.',
            'resync_required': True,
            **({'operation_id': scope.message_id, 'table_id': scope.table_id} if scope else {})})

    @staticmethod
    def _sprite_settled_response(attempt, outcome, scope):
        if not outcome.authorized:
            return Message(MessageType.ERROR, {'code': 'forbidden', 'error': 'Current session authority is required'})
        if not outcome.committed:
            code, error = attempt.failure or ('persistence_failed', 'Sprite changes did not commit. Review current state before retrying.')
            return Message(MessageType.ERROR, {'code': code, 'error': error, 'not_accepted': True,
                'operation_id': scope.message_id, 'table_id': scope.table_id, 'resync_required': True})
        return Message(MessageType.SPRITE_RESPONSE, dict(outcome.receipts[scope.operation_id]))

    def _install_sprite_resolution(self, outcome):
        replacements = []
        for table_id, sprites in outcome.sprites.items():
            table = self.table_manager.get_table(table_id)
            if table is None:
                raise RuntimeError('Original sprite table is no longer resident')
            replacement = table.fork_for_sprite_edit(sprites)
            for target in sprites:
                existing = replacement.find_entity_by_sprite_id(target)
                if existing is not None:
                    replacement.remove_entity(existing.entity_id)
            for entity in sprites.values():
                if entity is not None and entity.entity_id in replacement.entities:
                    raise RuntimeError('Current sprite identity conflicts with an unrelated live entity')
                if entity is not None and not replacement.restore_entity(entity, allow_out_of_bounds=True):
                    raise RuntimeError('Current sprite projection could not be installed')
            replacements.append((table, replacement))
        # Prepare every replacement before exposing any table's repaired state.
        for table, replacement in replacements:
            table.__dict__.clear()
            table.__dict__.update(replacement.__dict__)

    async def _settle_sprite_write(self, *, tables_owned=False):
        attempt = self._pending_sprite_write
        if attempt is None:
            raise RuntimeError('No admitted sprite write to settle')
        async with AsyncExitStack() as ownership:
            if not tables_owned:
                for table_id in sorted(attempt.targets):
                    await ownership.enter_async_context(self.table_manager.table_write_lock(table_id))
            outcome = await run_blocking(resolve_sprite_write, attempt)
            self._install_sprite_resolution(outcome)
            self._complete_sprite_write(attempt)
        # No historical sprite delta or actor history is sent to peers. Each
        # viewer reloads through normal layer/role filtering.
        for table_id in attempt.targets:
            try:
                await self.broadcast_to_session(Message(MessageType.SPRITE_RESPONSE, {
                    'success': True, 'table_id': table_id, 'resync_required': True}), '')
            except Exception:
                logger.exception('Current sprite resync notification failed after installation')
        return attempt, outcome

    async def _recover_pending_sprite_write(self, request=None, client_id=None, *, admitted_scope=None):
        attempt = self._pending_sprite_write
        if attempt is None:
            return None
        actor_id = self._get_user_id(request, client_id) if request is not None else None
        matching = next((scope for scope in attempt.scopes
            if request is not None and request.message_id == scope.message_id and actor_id == scope.actor_id), None)
        try:
            attempt, outcome = await self._settle_sprite_write()
        except Exception:
            logger.exception('Sprite outcome/current installation remains unavailable')
            return self._sprite_unknown(attempt.scopes[0] if actor_id == attempt.scopes[0].actor_id else None)
        for scope in attempt.scopes:
            for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
                if info.get('user_id') != scope.actor_id or matching is scope and recipient == client_id:
                    continue
                response = self._sprite_settled_response(attempt, outcome, scope)
                response.causation_id = response.correlation_id = scope.message_id
                try:
                    await self.send_to_client(response, recipient)
                except Exception:
                    logger.exception('Recovered sprite receipt delivery failed')
        if matching is None:
            return None
        try:
            replay = admitted_scope or SpriteCommandScope.from_message(request, matching.session_id, actor_id)
            if replay is None or (replay.operation_id, replay.request_hash) != (matching.operation_id, matching.request_hash):
                raise CanvasRejected('operation_id_conflict', 'Original sprite identity belongs to different input')
        except (ValueError, TypeError):
            return Message(MessageType.ERROR, {'code': 'operation_id_conflict',
                'error': 'Original sprite identity belongs to different input'})
        return self._sprite_settled_response(attempt, outcome, matching)
