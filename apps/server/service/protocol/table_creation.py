"""Session-owned table acceptance, installation and uncertain-outcome recovery."""

from contextlib import AsyncExitStack
from copy import deepcopy
from dataclasses import dataclass

from core_table.protocol import Message, MessageType
from core_table.table import VirtualTable
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.table_creation_service import TableCreateIntent, TableCreationAccepted, TableCreationService
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


@dataclass(frozen=True)
class PendingTableCreation:
    intent: TableCreateIntent


class _TableCreationMixin(_ProtocolBase):
    _pending_table_creation: PendingTableCreation | None = None

    def _table_creation_service(self):
        return TableCreationService()

    def _has_pending_table_creation(self) -> bool:
        return getattr(self, '_pending_table_creation', None) is not None

    @staticmethod
    def _table_creation_unknown(intent) -> Message:
        return Message(MessageType.ERROR, {
            'code': 'outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
            'operation_id': intent.identity.operation_id, 'table_id': intent.table_id,
            'error': 'Table creation outcome is unknown. Retry only the original request identity and input.',
        })

    def _install_created_table(self, accepted: TableCreationAccepted) -> tuple[dict | None, bool]:
        table_id = accepted.receipt['table_id']
        live = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
        installed = False
        if accepted.snapshot is None:
            # A retained receipt survives a later delete and cannot recreate it.
            return None, False
        if live is None:
            live = VirtualTable(accepted.snapshot['table_name'], accepted.snapshot['width'],
                                accepted.snapshot['height'], table_id=table_id)
            live.from_dict(deepcopy(accepted.snapshot))
            installed = True
        self.table_manager.add_table(live)
        # Never replace a resident table with an old receipt/read snapshot.
        return live.to_dict(), installed

    @staticmethod
    def _creation_response(accepted, snapshot, client_id):
        data = {**accepted.receipt, 'client_id': client_id, 'replayed': accepted.replayed}
        if snapshot is not None:
            data['table_data'] = snapshot
        else:
            data['table_deleted'] = True
        if accepted.replayed:
            data['resync_required'] = True
        return Message(MessageType.NEW_TABLE_RESPONSE, data)

    async def _publish_created_table(self, snapshot, client_id):
        metadata = {key: snapshot[key] for key in ('table_id', 'table_name', 'width', 'height')}
        await self.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
            'operation': 'create', 'table_id': metadata['table_id'],
            'table_name': metadata['table_name'], 'table_data': metadata,
        }), client_id)

    async def _table_creation_reply(self, accepted, snapshot, client_id):
        response = self._creation_response(accepted, snapshot, client_id)
        if snapshot is not None:
            try:
                enriched = await self.ensure_assets_in_r2(snapshot, self._get_session_code(),
                    self._get_client_info(client_id).get('user_id', 0))
                if isinstance(enriched, dict):
                    response.data['table_data'] = enriched
            except Exception:
                logger.exception('Created table asset enrichment failed')
                response.data['resync_required'] = True
        return response

    async def handle_new_table_request(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can create tables'})
        session_id, actor_id = self._get_session_id(msg), self._get_user_id(msg, client_id)
        if not session_id or actor_id is None or not self._get_session_code():
            return Message(MessageType.ERROR, {'error': 'Authentication and session context required'})
        try:
            intent = TableCreateIntent.create(session_id, actor_id, msg.message_id, msg.data)
            async with AsyncExitStack() as ownership:
                for table_id in sorted({intent.table_id} | ({intent.source_id} if intent.source_id else set())):
                    await ownership.enter_async_context(self.table_manager.table_write_lock(table_id))
                try:
                    service = self._table_creation_service()
                    accepted = None
                    if intent.source_id:
                        try:
                            accepted = await run_blocking(service.resolve, intent)
                        except OperationRejected:
                            raise
                        except Exception as exc:
                            raise OperationOutcomeUnknown('Original copy outcome cannot be read') from exc
                    if accepted is None:
                        source = self.table_manager.tables_id.get(intent.source_id) if intent.source_id else None
                        source_snapshot = deepcopy(source.to_dict()) if source is not None else None
                        source_dirty = bool(intent.source_id and intent.source_id in self.actions._dirty_tables)
                        accepted = await run_blocking(service.execute, intent, source_snapshot, source_dirty)
                except OperationOutcomeUnknown:
                    self._pending_table_creation = PendingTableCreation(intent)
                    return self._table_creation_unknown(intent)
                self._pending_table_creation = PendingTableCreation(intent)
                try:
                    snapshot, installed = self._install_created_table(accepted)
                    if installed:
                        await self.actions._add_to_history({'type': 'create_table', 'table_id': intent.table_id,
                            'name': intent.name, 'width': intent.width, 'height': intent.height})
                except Exception:
                    logger.exception('Committed table installation needs recovery')
                    return self._table_creation_unknown(intent)
                self._pending_table_creation = None
                response = await self._table_creation_reply(accepted, snapshot, client_id)
                if installed and snapshot is not None:
                    try:
                        await self._publish_created_table(snapshot, client_id)
                    except Exception:
                        logger.exception('Table notification failed after acceptance')
                        response.data['resync_required'] = True
                return response
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})

    async def _recover_pending_table_creation(self, request, client_id):
        pending = getattr(self, '_pending_table_creation', None)
        if pending is None:
            return None
        intent = pending.intent
        try:
            async with self.table_manager.table_write_lock(intent.table_id):
                accepted = await run_blocking(self._table_creation_service().resolve, intent, internal_recovery=True)
                snapshot, installed = self._install_created_table(accepted) if accepted is not None else (None, False)
                if installed:
                    await self.actions._add_to_history({'type': 'create_table', 'table_id': intent.table_id,
                        'name': intent.name, 'width': intent.width, 'height': intent.height})
        except Exception:
            logger.exception('Table creation recovery is unavailable')
            return self._table_creation_unknown(intent)
        self._pending_table_creation = None
        if installed and snapshot is not None:
            try:
                await self._publish_created_table(snapshot, '')
            except Exception:
                logger.exception('Recovered table notification failed')
        matching = request.message_id == intent.identity.operation_id and self._get_user_id(request, client_id) == intent.identity.actor_id
        if not matching:
            return None
        if accepted is None:
            return Message(MessageType.ERROR, {'code': 'persistence_failed',
                'error': 'Table creation did not commit. Retry the original request.'})
        if not accepted.actor_authorized or not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'code': 'forbidden', 'error': 'Current session DM authority is required'})
        try:
            replay = TableCreateIntent.create(intent.identity.session_id, intent.identity.actor_id,
                                             request.message_id, request.data)
            if request.type != MessageType.NEW_TABLE_REQUEST or replay.identity != intent.identity:
                raise OperationRejected('Recovered request identity belongs to different input', 'conflict')
        except OperationRejected:
            return Message(MessageType.ERROR, {'code': 'conflict', 'error': 'Recovered request identity belongs to different input'})
        return await self._table_creation_reply(accepted, snapshot, client_id)
