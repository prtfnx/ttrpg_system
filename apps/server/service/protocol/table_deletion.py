"""Session-owned deletion acceptance and uncertain-outcome recovery."""

from dataclasses import dataclass

from core_table.protocol import Message, MessageType
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_deletion_service import TableDeleteIntent, TableDeletionService
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import is_dm

from .table_creation import _TableCreationMixin

logger = setup_logger(__name__)


@dataclass(frozen=True)
class PendingTableDeletion:
    intent: TableDeleteIntent


class _TableDeletionMixin(_TableCreationMixin):
    _pending_table_deletion: PendingTableDeletion | None = None

    def _table_deletion_service(self):
        return TableDeletionService()

    def _has_pending_table_deletion(self) -> bool:
        return getattr(self, '_pending_table_deletion', None) is not None

    @staticmethod
    def _table_deletion_unknown(intent):
        return Message(MessageType.ERROR, {
            'code': 'outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
            'operation_id': intent.identity.operation_id, 'table_id': intent.table_id,
            'error': 'Table deletion outcome is unknown. Retry only the original request identity and input.',
        })

    @staticmethod
    def _deletion_response(accepted):
        return Message(MessageType.SUCCESS, {**accepted.receipt, 'replayed': accepted.replayed,
                                            'resync_required': accepted.replayed})

    async def _publish_deleted_table(self, table_id, client_id):
        await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
            'operation': 'delete', 'table_id': table_id,
        }), client_id)

    def _table_has_cached_encounter(self, table_id):
        from service.combat_engine import CombatEngine
        from service.encounter_engine import EncounterEngine

        code = self._get_session_code()
        combat, choice = CombatEngine.get_state(code), EncounterEngine.get(code)
        return bool(
            combat and str(combat.table_id) == table_id and combat.phase.value not in ('inactive', 'ended')
            or choice and str(choice.table_id) == table_id and choice.phase.value != 'completed'
        )

    async def handle_delete_table(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can delete tables'})
        session_id, actor_id = self._get_session_id(msg), self._get_user_id(msg, client_id)
        if not session_id or actor_id is None or not self._get_session_code():
            return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
        try:
            intent = TableDeleteIntent.create(session_id, actor_id, msg.message_id, msg.data)
            async with self.table_manager.table_write_lock(intent.table_id):
                try:
                    accepted = await run_blocking(self._table_deletion_service().execute, intent,
                                                 self._table_has_cached_encounter(intent.table_id))
                except OperationOutcomeUnknown:
                    self._pending_table_deletion = PendingTableDeletion(intent)
                    return self._table_deletion_unknown(intent)
                self._pending_table_deletion = PendingTableDeletion(intent)
                try:
                    await self.actions.discard_deleted_table(intent.table_id)
                except Exception:
                    logger.exception('Committed table deletion needs cache recovery')
                    return self._table_deletion_unknown(intent)
                self._pending_table_deletion = None
                response = self._deletion_response(accepted)
                try:
                    await self._publish_deleted_table(intent.table_id, client_id)
                except Exception:
                    logger.exception('Table deletion notification failed after acceptance')
                    response.data['resync_required'] = True
                return response
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})

    async def _recover_pending_table_deletion(self, request, client_id):
        pending = getattr(self, '_pending_table_deletion', None)
        if pending is None:
            return None
        intent = pending.intent
        try:
            async with self.table_manager.table_write_lock(intent.table_id):
                accepted = await run_blocking(self._table_deletion_service().resolve, intent, internal_recovery=True)
                if accepted is not None:
                    await self.actions.discard_deleted_table(intent.table_id)
        except Exception:
            logger.exception('Table deletion recovery is unavailable')
            return self._table_deletion_unknown(intent)
        self._pending_table_deletion = None
        if accepted is not None:
            try:
                await self._publish_deleted_table(intent.table_id, '')
            except Exception:
                logger.exception('Recovered table deletion notification failed')
        matching = request.message_id == intent.identity.operation_id and self._get_user_id(request, client_id) == intent.identity.actor_id
        if not matching:
            return None
        if not accepted:
            return Message(MessageType.ERROR, {'code': 'persistence_failed',
                'error': 'Table deletion did not commit. Retry the original request.'})
        if not accepted.actor_authorized or not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'code': 'forbidden', 'error': 'Current session DM authority is required'})
        try:
            replay = TableDeleteIntent.create(intent.identity.session_id, intent.identity.actor_id,
                                             request.message_id, request.data)
            if request.type != MessageType.TABLE_DELETE or replay.identity != intent.identity:
                raise OperationRejected('Recovered request identity belongs to different input', 'conflict')
        except OperationRejected:
            return Message(MessageType.ERROR, {'code': 'conflict', 'error': 'Recovered request identity belongs to different input'})
        return self._deletion_response(accepted)
