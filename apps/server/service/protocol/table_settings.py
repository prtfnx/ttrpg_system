"""Session-owned durable settings acceptance and canonical cache recovery."""
from dataclasses import dataclass

from core_table.protocol import Message, MessageType
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_settings_service import TableSettingsIntent, TableSettingsService
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import is_dm

from .table_deletion import _TableDeletionMixin

logger = setup_logger(__name__)


@dataclass(frozen=True)
class PendingTableSettings:
    intent: TableSettingsIntent


class _TableSettingsMixin(_TableDeletionMixin):
    _pending_table_settings: PendingTableSettings | None = None

    def _table_settings_service(self):
        return TableSettingsService()

    def _has_pending_table_settings(self):
        return getattr(self, '_pending_table_settings', None) is not None

    @staticmethod
    def _settings_unknown(intent):
        return Message(MessageType.ERROR, {
            'code': 'outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
            'operation_id': intent.identity.operation_id, 'table_id': intent.table_id,
            'error': 'Table settings outcome is unknown. Retry only the original request identity and input.',
        })

    @staticmethod
    def _settings_response(accepted):
        return Message(MessageType.TABLE_SETTINGS_CHANGED, {
            **accepted.receipt, **(accepted.settings or {'table_deleted': True}),
            'replayed': accepted.replayed, 'resync_required': accepted.replayed,
        })

    async def _install_table_settings(self, intent, accepted):
        if accepted.settings is None:
            await self.actions.discard_deleted_table(intent.table_id)
            return True
        table = self.table_manager.tables_id.get(intent.table_id) or self.table_manager.tables.get(intent.table_id)
        if table is None or accepted.replayed and intent.table_id in self.actions._dirty_tables:
            return False
        changed = any(getattr(table, key, 0 if key == 'settings_revision' else None) != value
                      for key, value in accepted.settings.items())
        for key, value in accepted.settings.items():
            setattr(table, key, value)
        return changed

    async def _publish_table_settings(self, intent, accepted, client_id):
        if accepted.settings is None:
            await self._publish_deleted_table(intent.table_id, client_id)
        else:
            await self.broadcast_to_session(Message(MessageType.TABLE_SETTINGS_CHANGED, {
                'table_id': intent.table_id, **accepted.settings,
            }), client_id)

    async def handle_table_settings_update(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can change table settings'})
        session_id, actor_id = self._get_session_id(msg), self._get_user_id(msg, client_id)
        if not session_id or actor_id is None or not self._get_session_code():
            return Message(MessageType.ERROR, {'error': 'Authentication and session identity required'})
        try:
            intent = TableSettingsIntent.create(session_id, actor_id, msg.message_id, msg.data)
            async with self.table_manager.table_write_lock(intent.table_id):
                try:
                    accepted = await run_blocking(self._table_settings_service().execute, intent,
                                                 intent.table_id in self.actions._dirty_tables)
                except OperationOutcomeUnknown:
                    self._pending_table_settings = PendingTableSettings(intent)
                    return self._settings_unknown(intent)
                self._pending_table_settings = PendingTableSettings(intent)
                try:
                    installed = await self._install_table_settings(intent, accepted)
                except Exception:
                    logger.exception('Committed settings need cache recovery')
                    return self._settings_unknown(intent)
                self._pending_table_settings = None
                response = self._settings_response(accepted)
                if (not accepted.replayed and accepted.receipt['changed']) or installed:
                    try:
                        await self._publish_table_settings(intent, accepted, client_id)
                    except Exception:
                        logger.exception('Settings notification failed after acceptance')
                        response.data['resync_required'] = True
                return response
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})

    async def _recover_pending_table_settings(self, request, client_id):
        pending = getattr(self, '_pending_table_settings', None)
        if pending is None:
            return None
        intent = pending.intent
        try:
            async with self.table_manager.table_write_lock(intent.table_id):
                accepted = await run_blocking(self._table_settings_service().resolve, intent, internal_recovery=True)
                if accepted is not None:
                    await self._install_table_settings(intent, accepted)
        except Exception:
            logger.exception('Settings outcome recovery unavailable')
            return self._settings_unknown(intent)
        self._pending_table_settings = None
        if accepted is not None:
            try:
                await self._publish_table_settings(intent, accepted, '')
            except Exception:
                logger.exception('Recovered settings notification failed')
        matching = request.message_id == intent.identity.operation_id and self._get_user_id(request, client_id) == intent.identity.actor_id
        if not matching:
            return None
        if accepted is None:
            return Message(MessageType.ERROR, {'code': 'persistence_failed',
                'error': 'Table settings did not commit. Retry the original request.'})
        if not accepted.actor_authorized or not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'code': 'forbidden', 'error': 'Current session DM authority is required'})
        try:
            replay = TableSettingsIntent.create(intent.identity.session_id, intent.identity.actor_id,
                                               request.message_id, request.data)
            if request.type != MessageType.TABLE_SETTINGS_UPDATE or replay.identity != intent.identity:
                raise OperationRejected('Recovered request identity belongs to different input', 'conflict')
        except OperationRejected:
            return Message(MessageType.ERROR, {'code': 'conflict', 'error': 'Recovered request identity belongs to different input'})
        return self._settings_response(accepted)
