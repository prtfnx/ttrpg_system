"""Retain session settings ownership until current movement policy installs."""
from core_table.protocol import Message, MessageType
from core_table.session_rules import SessionRules
from service.session_edit_service import PendingSessionEdit, SessionEditIntent, SessionEditService
from service.session_operation_receipts import OperationRejected
from sqlalchemy.orm import Session, scoped_session
from utils.blocking import run_blocking
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _SessionEditsMixin(_ProtocolBase):
    _pending_session_edit: PendingSessionEdit | None = None

    def _has_pending_session_edit(self):
        return self._pending_session_edit is not None

    def _durable_session_edits(self):
        return isinstance(getattr(getattr(self, 'table_manager', None), 'db_session', None), (Session, scoped_session))

    def _session_edit_service(self):
        return SessionEditService()

    def _session_edit_intent(self, request, client_id):
        return SessionEditIntent.create(self._get_session_id(request), self._get_user_id(request, client_id),
            request.message_id, request.type.value, request.data)

    @staticmethod
    def _session_edit_unknown():
        return Message(MessageType.ERROR, {'domain': 'session_settings', 'code': 'outcome_unknown',
            'outcome': 'unknown', 'resync_required': True,
            'error': 'Session settings are still being checked. Keep the original identity and complete input.'})

    @staticmethod
    def _session_edit_response(attempt, outcome):
        identity = {'domain': 'session_settings', 'operation_id': attempt.intent.identity.operation_id,
            'resync_required': True}
        if not outcome.authorized:
            return Message(MessageType.ERROR, {**identity, 'code': 'forbidden', 'error': 'Current DM authority is required'})
        if not outcome.committed:
            return Message(MessageType.ERROR, {**identity, 'code': 'persistence_failed',
                'error': 'The original session edit did not commit. Review current state before retrying.'})
        return Message(MessageType.SUCCESS, {**outcome.receipt, 'replayed': outcome.replayed, 'resync_required': True})

    async def _install_session_edit(self, current):
        # Prepare before replacing the cached pair used by movement validation.
        rules = SessionRules.from_dict(current['rules'])
        self._rules_cache[current['session_code']] = (rules, current['mode'])

    async def _publish_session_edit(self, current, client_id=''):
        try:
            await self.broadcast_to_session(Message(MessageType.GAME_MODE_STATE, {'game_mode': current['mode']}), client_id)
            await self.broadcast_to_session(Message(MessageType.SESSION_RULES_CHANGED,
                {'rules': current['rules'], 'mode': current['mode']}), client_id)
        except Exception:
            logger.exception('Current session settings publication failed after settlement')

    async def _execute_session_edit(self, request, client_id):
        try:
            intent = self._session_edit_intent(request, client_id)
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
        self.table_manager.release_db_session()
        attempt = PendingSessionEdit(intent)
        self._pending_session_edit = attempt
        try:
            outcome = await run_blocking(self._session_edit_service().execute, intent)
        except OperationRejected as exc:
            self._pending_session_edit = None
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
        except Exception:
            logger.exception('Session edit acceptance needs fresh settlement')
            response = await self._recover_pending_session_edit(request, client_id)
            assert response is not None
            return response
        attempt.accepted = True
        try:
            await self._install_session_edit(outcome.current)
        except Exception:
            logger.exception('Accepted session edit needs current installation')
            response = await self._recover_pending_session_edit(request, client_id)
            assert response is not None
            return response
        self._pending_session_edit = None
        await self._publish_session_edit(outcome.current)
        return self._session_edit_response(attempt, outcome)

    async def _recover_pending_session_edit(self, request=None, client_id=None):
        attempt = self._pending_session_edit
        if attempt is None:
            return None
        intent = attempt.intent
        matching = (request is not None and request.message_id == intent.identity.operation_id
            and self._get_user_id(request, client_id) == intent.identity.actor_id)
        try:
            outcome = await run_blocking(self._session_edit_service().resolve, attempt)
            await self._install_session_edit(outcome.current)
        except Exception:
            logger.exception('Session settings settlement/current installation remains unavailable')
            return self._session_edit_unknown()
        self._pending_session_edit = None
        await self._publish_session_edit(outcome.current)
        response = self._session_edit_response(attempt, outcome)
        for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
            if info.get('user_id') != intent.identity.actor_id or matching and recipient == client_id:
                continue
            try:
                await self.send_to_client(Message(response.type, dict(response.data),
                    causation_id=intent.identity.operation_id, correlation_id=intent.identity.operation_id), recipient)
            except Exception:
                logger.exception('Original session edit receipt delivery failed')
        if not matching:
            return None
        try:
            if self._session_edit_intent(request, client_id).identity != intent.identity:
                raise OperationRejected('Original identity belongs to different input', 'conflict')
        except OperationRejected:
            return Message(MessageType.ERROR, {'code': 'conflict', 'error': 'Original identity belongs to different input'})
        return response

    async def _read_session_settings(self, request, client_id):
        try:
            current = await run_blocking(self._session_edit_service().load,
                self._get_session_id(request), self._get_user_id(request, client_id))
            await self._install_session_edit(current)
            return Message(MessageType.SESSION_RULES_CHANGED, {'rules': current['rules'], 'mode': current['mode']})
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
        except Exception:
            logger.exception('Current session settings read failed')
            return Message(MessageType.ERROR, {'code': 'session_settings_unavailable',
                'error': 'Current session settings are unavailable. Existing state was retained.'})
