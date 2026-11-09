"""Keep admitted canvas commands owned through settlement and installation."""
import hashlib
import uuid

from core_table.protocol import Message, MessageType
from service.canvas_command_service import CanvasRejected, encoded
from service.canvas_write_recovery import resolve_canvas_write
from utils.blocking import run_blocking
from utils.logger import setup_logger

from .sprite_outcomes import _SpriteOutcomesMixin

logger = setup_logger(__name__)


class _CanvasOutcomesMixin(_SpriteOutcomesMixin):
    _pending_canvas_write = None

    def _has_pending_canvas_write(self):
        return self._pending_canvas_write is not None

    def _complete_canvas_write(self, attempt):
        if self._pending_canvas_write is attempt:
            self._pending_canvas_write = None

    @staticmethod
    def _canvas_settled_response(attempt, outcome):
        identity = {'operation_id': attempt.intent.operation_id, 'table_id': attempt.intent.table_id}
        if not outcome.authorized:
            return Message(MessageType.CANVAS_COMMAND_RESULT, {**identity, 'success': False,
                'code': 'forbidden', 'error': 'Current session authority is required to check this command.',
                'resync_required': True})
        if not outcome.committed:
            return Message(MessageType.CANVAS_COMMAND_RESULT, {**identity, 'success': False,
                'code': 'persistence_failed', 'error': 'Canvas command did not commit. Review current state before retrying.',
                'resync_required': True})
        return Message(MessageType.CANVAS_COMMAND_RESULT, dict(outcome.receipt))

    @staticmethod
    def _canvas_unknown(attempt, *, direct=True, include_identity=True):
        data = {'code': 'outcome_unknown', 'error': 'Canvas save is still being checked. Keep its original identity.',
            'resync_required': True}
        if include_identity:
            data.update(operation_id=attempt.intent.operation_id, table_id=attempt.intent.table_id)
        if direct:
            return Message(MessageType.CANVAS_COMMAND_RESULT, {**data, 'success': False})
        return Message(MessageType.ERROR, {**data, 'outcome': 'unknown'})

    async def _recover_pending_canvas_write(self, request=None, client_id=None, *, table_owned=False):
        attempt = self._pending_canvas_write
        if attempt is None:
            return None
        actor_id = self._get_user_id(request, client_id) if request is not None else None
        try:
            operation_id = str(uuid.UUID(request.data.get('operation_id', ''))) if request is not None else None
        except (ValueError, TypeError, AttributeError):
            operation_id = None
        matching = (request is not None and request.type == MessageType.CANVAS_COMMAND
            and actor_id == attempt.intent.actor_id and operation_id == attempt.intent.operation_id)
        try:
            if table_owned:
                outcome = await self._resolve_and_install_canvas(attempt)
            else:
                async with self.table_manager.table_write_lock(attempt.intent.table_id):
                    outcome = await self._resolve_and_install_canvas(attempt)
        except Exception:
            logger.exception('Canvas outcome/current installation remains unavailable')
            if request is not None and request.type == MessageType.CANVAS_COMMAND:
                # A pipelined follower has not been admitted. Keep that follower's
                # identity in its own unknown reply so hydration cannot discard it.
                data = {'success': False, 'code': 'outcome_unknown', 'resync_required': True,
                    'error': 'Canvas save is waiting for an earlier outcome. Keep the original request.'}
                for key, limit in (('operation_id', 36), ('table_id', 128)):
                    value = request.data.get(key)
                    if isinstance(value, str) and len(value) <= limit:
                        data[key] = value
                return Message(MessageType.CANVAS_COMMAND_RESULT, data)
            return self._canvas_unknown(attempt, direct=matching, include_identity=actor_id == attempt.intent.actor_id)
        try:
            # Paint lives in SQL; a normal table resync also requests its current
            # paint snapshot. No accepted historical delta goes to peers.
            await self.broadcast_to_session(Message(MessageType.SPRITE_RESPONSE, {
                'table_id': attempt.intent.table_id, 'success': True, 'resync_required': True}), '')
        except Exception:
            logger.exception('Current canvas resync notification failed after installation')
        response = self._canvas_settled_response(attempt, outcome)
        for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
            if info.get('user_id') != attempt.intent.actor_id or matching and recipient == client_id:
                continue
            try:
                receipt = Message(response.type, dict(response.data), causation_id=attempt.message_id,
                    correlation_id=attempt.message_id)
                await self.send_to_client(receipt, recipient)
            except Exception:
                logger.exception('Recovered canvas receipt delivery failed')
        if not matching:
            return None
        assert request is not None
        try:
            if hashlib.sha256(encoded(request.data)).hexdigest() != attempt.intent.request_hash:
                raise CanvasRejected('operation_id_conflict', 'Canvas identity belongs to different input')
        except (ValueError, TypeError):
            return Message(MessageType.CANVAS_COMMAND_RESULT, {'operation_id': attempt.intent.operation_id,
                'table_id': attempt.intent.table_id, 'success': False, 'code': 'operation_id_conflict',
                'error': 'Canvas identity belongs to different input'})
        return response

    async def _resolve_and_install_canvas(self, attempt):
        outcome = await run_blocking(resolve_canvas_write, attempt)
        if self.table_manager.get_table(attempt.intent.table_id) is None:
            raise RuntimeError('Original canvas table is no longer resident')
        self._install_sprite_resolution(outcome)
        self.table_manager.tables_id[attempt.intent.table_id] = self.table_manager.tables[attempt.intent.table_id]
        self._complete_canvas_write(attempt)
        return outcome
