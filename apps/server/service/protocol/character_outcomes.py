"""Install durable character outcomes without replaying an old edit or projection."""
from contextlib import AsyncExitStack
from typing import TYPE_CHECKING

from core_table.protocol import Message, MessageType
from service.character_update_service import CharacterUpdateIntent
from service.multiclass_service import MulticlassIntent
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _CharacterOutcomesMixin(_ProtocolBase):
    if TYPE_CHECKING:
        async def _sync_character_stats_to_tokens(self, session_id: int, character_id: str, updates: dict,
                *, committed_updates=None, committed_stats=None, strict_install=False, publish=True) -> bool | None: ...

    @staticmethod
    def _character_uncertain_response(character_id=None) -> Message:
        data = {'code': 'character_outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
                'error': 'Character outcome is uncertain. Reload to check before retrying.'}
        if character_id is not None:
            data['character_id'] = character_id
        return Message(MessageType.ERROR, data)

    @staticmethod
    def _character_receipt_response(data, character_id, *, committed=True,
                                    message_type=MessageType.CHARACTER_UPDATE_RESPONSE):
        response = {'success': committed, 'character_id': character_id,
            **{key: data[key] for key in ('operation_id', 'accepted_version', 'replayed',
                'resync_required', 'character_archived', 'new_class', 'accepted_level') if key in data}}
        if committed:
            response['version'] = data.get('version')
        else:
            response.update(error='Character update did not commit', code='persistence_failed',
                            current_version=data.get('version'), not_accepted=True)
        if message_type == MessageType.MULTICLASS_RESPONSE:
            response['resync_required'] = True
        return Message(message_type, response)

    @staticmethod
    def _character_intent_for_request(request, session_id, user_id):
        if request.type == MessageType.MULTICLASS_REQUEST:
            return MulticlassIntent.from_request(session_id, user_id, request.message_id, request.data)
        payload, options = request.data, request.data.get('stat_reconciliation') or {}
        return CharacterUpdateIntent.create(session_id, user_id, request.message_id, payload['character_id'],
            {} if options else payload.get('updates') or payload.get('character_data'),
            payload.get('version'), options.get('expected_digest'))

    def _remember_character_installation(self, request, data, session_id, user_id):
        from managers.character_manager import get_server_character_manager

        intent = self._character_intent_for_request(request, session_id, user_id)
        get_server_character_manager().update_operations._remember(intent, result=data)

    async def _accept_durable_character_result(self, request, client_id, data, updates, session_id, user_id,
                                              *, message_type=MessageType.CHARACTER_UPDATE_RESPONSE):
        character_id = request.data['character_id']
        replayed = data.get('replayed', False)
        try:
            resync = await self._sync_character_stats_to_tokens(session_id, character_id, updates,
                committed_updates=data['token_updates'], committed_stats=data['token_stats'],
                strict_install=True, publish=not replayed)
        except Exception:
            logger.exception('Committed character projections need cache recovery')
            self._remember_character_installation(request, data, session_id, user_id)
            return self._character_uncertain_response(character_id)
        if not replayed and updates:
            try:
                await self._broadcast_character_event(Message(MessageType.CHARACTER_UPDATE, {
                    'character_id': character_id, 'updates': updates, 'version': data['version'],
                }), session_id, character_id, client_id)
            except Exception:
                logger.exception('Character notification failed after acceptance')
                resync = True
        return self._character_receipt_response({**data, 'resync_required': bool(resync or replayed)}, character_id,
                                                message_type=message_type)

    async def _finish_durable_character_recovery(self, resolved, request, client_id, *, tables_owned=False):
        from managers.character_manager import get_server_character_manager

        attempt, data = resolved.attempt, resolved.current_result
        multiclass = attempt.operation is not None and attempt.operation.domain == 'character_multiclass'
        message_type = MessageType.MULTICLASS_RESPONSE if multiclass else MessageType.CHARACTER_UPDATE_RESPONSE
        if data is None:
            return self._character_uncertain_response(attempt.character_id)
        try:
            async with AsyncExitStack() as ownership:
                if not tables_owned:
                    for table_id in sorted(self.table_manager.tables):
                        await ownership.enter_async_context(self.table_manager.table_write_lock(table_id))
                await self._sync_character_stats_to_tokens(attempt.session_id, attempt.character_id, {},
                    committed_updates=data['token_updates'], committed_stats=data['token_stats'], strict_install=True,
                    publish=resolved.committed and resolved.actor_authorized)
        except Exception:
            logger.exception('Character projection recovery needs another canonical lookup')
            return self._character_uncertain_response(attempt.character_id)
        get_server_character_manager().update_recovery.complete(resolved)
        if resolved.committed and resolved.actor_authorized:
            try:
                await self._broadcast_character_event(Message(MessageType.CHARACTER_UPDATE, {
                    'character_id': attempt.character_id, 'updates': {}, 'version': data['version'],
                    'source': 'recovery', 'resync_required': True,
                }), attempt.session_id, attempt.character_id)
            except Exception:
                logger.exception('Recovered character notification failed')
        outcome = self._character_receipt_response({**data, 'operation_id': attempt.request_id}, attempt.character_id,
                                                   committed=resolved.committed, message_type=message_type)
        if not resolved.actor_authorized:
            outcome = Message(message_type, {'success': False, 'code': 'forbidden',
                'character_id': attempt.character_id, 'operation_id': attempt.request_id,
                'error': 'Current character edit authority is required'})
        matching = request.message_id == attempt.request_id and self._get_user_id(request, client_id) == attempt.user_id
        for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
            if info.get('user_id') != attempt.user_id or matching and recipient == client_id:
                continue
            try:
                await self.send_to_client(Message(outcome.type, dict(outcome.data), correlation_id=attempt.request_id,
                                                 causation_id=attempt.request_id), recipient)
            except Exception:
                logger.exception('Character recovery receipt delivery failed')
        if not matching:
            return None
        try:
            replay = self._character_intent_for_request(request, attempt.session_id, attempt.user_id)
            expected_type = MessageType.MULTICLASS_REQUEST if multiclass else MessageType.CHARACTER_UPDATE
            if request.type != expected_type or replay.identity != attempt.operation:
                raise ValueError('Recovered request identity belongs to different input')
        except (ValueError, TypeError, AttributeError, KeyError):
            return Message(MessageType.ERROR, {'code': 'operation_id_conflict',
                'error': 'The recovered request identity belongs to different character updates'})
        return outcome
