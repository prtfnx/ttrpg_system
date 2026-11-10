"""Retain table field edits through durable settlement and live installation."""
from core_table.protocol import Message, MessageType
from service.fog_edit_service import FogEditIntent, FogEditService
from service.session_operation_receipts import OperationRejected
from service.table_edit_service import PendingTableEdit, TableEditIntent, TableEditService
from sqlalchemy.orm import Session, scoped_session
from utils.blocking import run_blocking
from utils.logger import setup_logger

from .fog_edits import install_fog_projection
from .table_settings import _TableSettingsMixin

logger = setup_logger(__name__)


class _TableEditsMixin(_TableSettingsMixin):
    _pending_table_edit: PendingTableEdit | None = None

    def _has_pending_table_edit(self):
        return self._pending_table_edit is not None

    def _durable_table_edits(self):
        return isinstance(getattr(self.table_manager, 'db_session', None), (Session, scoped_session))

    def _table_edit_service(self):
        return TableEditService()

    def _fog_edit_service(self):
        return FogEditService()

    @staticmethod
    def _edit_intent(request, session_id, actor_id):
        intent_type = FogEditIntent if request.data.get('type') == 'fog_update' else TableEditIntent
        return intent_type.create(session_id, actor_id, request.message_id, request.type.value, request.data)

    def _edit_service(self, intent):
        return self._fog_edit_service() if intent.identity.domain == 'fog_edit' else self._table_edit_service()

    @staticmethod
    def _table_edit_unknown(request=None):
        data = {'code': 'outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
            'error': 'A table edit is still being checked. Keep its original identity and complete input.'}
        if request is not None:
            values = request.data.get('data', request.data)
            table_id = values.get('table_id') if isinstance(values, dict) else None
            if isinstance(table_id, str) and len(table_id) <= 128:
                data['table_id'] = table_id
        return Message(MessageType.ERROR, data)

    @staticmethod
    def _table_edit_response(attempt, outcome):
        identity = {'operation_id': attempt.intent.identity.operation_id,
            'table_id': attempt.intent.table_id, 'resync_required': True}
        if not outcome.authorized:
            return Message(MessageType.ERROR, {**identity, 'code': 'forbidden', 'outcome': 'unknown',
                'error': 'Current session DM authority is required to check the original table edit.'})
        if not outcome.committed:
            return Message(MessageType.ERROR, {**identity, 'code': 'persistence_failed',
                'error': 'The original table edit did not commit. Review current state before retrying.'})
        return Message(MessageType.SUCCESS, {**outcome.receipt, 'replayed': outcome.replayed,
            'resync_required': True, **({'table_deleted': True} if outcome.current is None else {})})

    async def _install_table_edit(self, intent, outcome):
        if outcome.current is None:
            await self.actions.discard_deleted_table(intent.table_id)
            return
        table = self.table_manager.get_table(intent.table_id)
        if table is None:
            raise RuntimeError('Original edited table is no longer resident')
        if 'fog_entities' in outcome.current:
            install_fog_projection(self.table_manager, table, outcome.current)
            return
        values = dict(outcome.current)
        if 'name' in values:
            values['display_name'] = values.pop('name')
        for prefix, attribute in (('position', 'position'), ('scale', 'scale')):
            if f'{prefix}_x' in values:
                values[attribute] = (values.pop(f'{prefix}_x'), values.pop(f'{prefix}_y'))
        for key, value in values.items():
            setattr(table, key, value)
        self.table_manager.tables_id[intent.table_id] = table

    async def _publish_table_edit(self, intent, outcome, client_id=''):
        try:
            await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
                'table_id': intent.table_id, 'operation': 'delete' if outcome.current is None else 'resync',
                'resync_required': True}), client_id)
        except Exception:
            logger.exception('Table edit resync publication failed after acceptance')

    async def _execute_table_edit(self, request, client_id) -> Message:
        try:
            intent = self._edit_intent(request, self._get_session_id(request), self._get_user_id(request, client_id))
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
        async with self.table_manager.table_write_lock(intent.table_id):
            self.table_manager.release_db_session()
            attempt = PendingTableEdit(intent)
            self._pending_table_edit = attempt
            try:
                outcome = await run_blocking(self._edit_service(intent).execute, intent,
                    intent.table_id in self.actions._dirty_tables)
            except OperationRejected as exc:
                self._pending_table_edit = None
                return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
            except Exception:
                logger.exception('Table edit acceptance needs fresh settlement')
                response = await self._recover_pending_table_edit(request, client_id, table_owned=True)
                assert response is not None
                return response
            attempt.accepted = True
            try:
                await self._install_table_edit(intent, outcome)
            except Exception:
                logger.exception('Accepted table edit needs current installation')
                response = await self._recover_pending_table_edit(request, client_id, table_owned=True)
                assert response is not None
                return response
            self._pending_table_edit = None
            await self._publish_table_edit(intent, outcome, client_id)
            return self._table_edit_response(attempt, outcome)

    async def _recover_pending_table_edit(self, request=None, client_id=None, *, table_owned=False):
        attempt = self._pending_table_edit
        if attempt is None:
            return None
        intent = attempt.intent
        matching = (request is not None and request.message_id == intent.identity.operation_id
            and self._get_user_id(request, client_id) == intent.identity.actor_id)
        try:
            if table_owned:
                outcome = await self._resolve_table_edit(attempt)
            else:
                async with self.table_manager.table_write_lock(intent.table_id):
                    outcome = await self._resolve_table_edit(attempt)
        except Exception:
            logger.exception('Table edit settlement/current installation remains unavailable')
            return self._table_edit_unknown(request)
        await self._publish_table_edit(intent, outcome)
        response = self._table_edit_response(attempt, outcome)
        for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
            if info.get('user_id') != intent.identity.actor_id or matching and recipient == client_id:
                continue
            try:
                await self.send_to_client(Message(response.type, dict(response.data),
                    causation_id=intent.identity.operation_id, correlation_id=intent.identity.operation_id), recipient)
            except Exception:
                logger.exception('Original table edit receipt delivery failed')
        if not matching:
            return None
        assert request is not None
        try:
            retry = self._edit_intent(request, intent.identity.session_id, intent.identity.actor_id)
            if retry.identity != intent.identity:
                raise OperationRejected('Original table edit identity belongs to different input', 'conflict')
        except OperationRejected:
            return Message(MessageType.ERROR, {'code': 'conflict', 'error': 'Original table edit identity belongs to different input'})
        return response

    async def _resolve_table_edit(self, attempt):
        outcome = await run_blocking(self._edit_service(attempt.intent).resolve, attempt)
        await self._install_table_edit(attempt.intent, outcome)
        self._pending_table_edit = None
        return outcome
