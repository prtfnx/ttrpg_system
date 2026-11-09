"""Own admitted wall writes through commit settlement and current installation."""
from core_table.entities import Wall
from core_table.protocol import Message, MessageType
from service.session_operation_receipts import OperationRejected
from service.wall_command_service import PendingWallCommand, WallCommandIntent, WallCommandService
from sqlalchemy.orm import Session, scoped_session
from utils.blocking import run_blocking
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _WallOutcomesMixin(_ProtocolBase):
    _pending_wall_command: PendingWallCommand | None = None

    def _has_pending_wall_command(self):
        return self._pending_wall_command is not None

    def _durable_wall_commands(self):
        return isinstance(getattr(self.table_manager, 'db_session', None), (Session, scoped_session))

    def _wall_command_service(self):
        return WallCommandService()

    @staticmethod
    def _wall_unknown(request=None):
        data = {'code': 'outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
            'error': 'A wall save is still being checked. Keep the original request identity and input.'}
        # A blocked follower receives only its own scope; never another actor's receipt.
        if request is not None:
            table_id = request.data.get('table_id')
            if isinstance(table_id, str) and len(table_id) <= 128:
                data['table_id'] = table_id
        return Message(MessageType.ERROR, data)

    @staticmethod
    def _wall_receipt(attempt, outcome):
        identity = {'operation_id': attempt.intent.identity.operation_id, 'table_id': attempt.intent.table_id,
            'resync_required': True}
        if not outcome.authorized:
            return Message(MessageType.ERROR, {**identity, 'code': 'forbidden', 'outcome': 'unknown',
                'error': 'Current session authority is required to check the original wall save.'})
        if not outcome.committed:
            return Message(MessageType.ERROR, {**identity, 'code': 'persistence_failed',
                'error': 'The original wall save did not commit. Review current state before retrying.'})
        return Message(MessageType.SUCCESS, {**outcome.receipt, 'replayed': True, 'resync_required': True,
            **({'table_deleted': True} if not outcome.table_exists else {})})

    async def _install_wall_resolution(self, intent, outcome):
        if not outcome.table_exists:
            await self.actions.discard_deleted_table(intent.table_id)
            return
        table = self.table_manager.get_table(intent.table_id)
        if table is None:
            raise RuntimeError('Original wall table is no longer resident')
        wall = Wall.from_dict(outcome.wall) if outcome.wall is not None else None
        # Prepare before replacing; do not flush an old full-table snapshot.
        walls = dict(table.walls)
        if wall is None:
            walls.pop(intent.wall_id, None)
        else:
            walls[intent.wall_id] = wall
        table.walls = walls
        self.table_manager.tables_id[intent.table_id] = table

    async def _notify_wall_resync(self, table_id):
        try:
            await self.broadcast_to_session(Message(MessageType.SPRITE_RESPONSE, {
                'table_id': table_id, 'success': True, 'resync_required': True}), '')
        except Exception:
            logger.exception('Current wall resync notification failed')

    async def _execute_wall_command(self, request, client_id) -> Message:
        try:
            intent = WallCommandIntent.create(self._get_session_id(request), self._get_user_id(request, client_id),
                request.message_id, request.type.value, request.data)
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
        async with self.table_manager.table_write_lock(intent.table_id):
            self.table_manager.release_db_session()
            attempt = PendingWallCommand(intent)
            self._pending_wall_command = attempt
            try:
                outcome = await run_blocking(self._wall_command_service().execute, intent,
                    intent.table_id in self.actions._dirty_tables)
            except OperationRejected as exc:
                self._pending_wall_command = None
                return Message(MessageType.ERROR, {'code': exc.code, 'error': str(exc)})
            except Exception:
                logger.exception('Wall acceptance needs fresh settlement')
                response = await self._recover_pending_wall_command(request, client_id, table_owned=True)
                assert response is not None
                return response
            attempt.accepted = True
            try:
                await self._install_wall_resolution(intent, outcome)
            except Exception:
                logger.exception('Accepted wall needs current cache installation')
                response = await self._recover_pending_wall_command(request, client_id, table_owned=True)
                assert response is not None
                return response
            self._pending_wall_command = None
            if outcome.replayed:
                await self._notify_wall_resync(intent.table_id)
                return self._wall_receipt(attempt, outcome)
            data = ({'operation': 'remove', 'wall_id': intent.wall_id} if outcome.wall is None else
                {'operation': 'create' if intent.kind == 'wall_create' else 'update', 'wall': outcome.wall})
            response = Message(MessageType.WALL_DATA, {**data, 'table_id': intent.table_id})
            try:
                await self.broadcast_to_session(response, client_id)
            except Exception:
                logger.exception('Wall notification failed after acceptance')
                return self._wall_receipt(attempt, outcome)
            return response

    async def _recover_pending_wall_command(self, request=None, client_id=None, *, table_owned=False):
        attempt = self._pending_wall_command
        if attempt is None:
            return None
        intent = attempt.intent
        matching = (request is not None and request.message_id == intent.identity.operation_id
            and self._get_user_id(request, client_id) == intent.identity.actor_id)
        try:
            if table_owned:
                outcome = await self._resolve_wall_command(attempt)
            else:
                async with self.table_manager.table_write_lock(intent.table_id):
                    outcome = await self._resolve_wall_command(attempt)
        except Exception:
            logger.exception('Wall settlement/current installation remains unavailable')
            return self._wall_unknown(request)
        await self._notify_wall_resync(intent.table_id)
        response = self._wall_receipt(attempt, outcome)
        for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
            if info.get('user_id') != intent.identity.actor_id or matching and recipient == client_id:
                continue
            try:
                await self.send_to_client(Message(response.type, dict(response.data),
                    causation_id=intent.identity.operation_id, correlation_id=intent.identity.operation_id), recipient)
            except Exception:
                logger.exception('Original wall receipt delivery failed')
        if not matching:
            return None
        assert request is not None
        try:
            retry = WallCommandIntent.create(intent.identity.session_id, intent.identity.actor_id,
                request.message_id, request.type.value, request.data)
            if retry.identity != intent.identity:
                raise OperationRejected('Wall identity belongs to different input', 'conflict')
        except OperationRejected:
            return Message(MessageType.ERROR, {'code': 'conflict', 'error': 'Wall identity belongs to different input'})
        return response

    async def _resolve_wall_command(self, attempt):
        outcome = await run_blocking(self._wall_command_service().resolve, attempt)
        await self._install_wall_resolution(attempt.intent, outcome)
        self._pending_wall_command = None
        return outcome
