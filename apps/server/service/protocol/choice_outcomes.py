"""Keep choice SQL settlement and live installation under session ownership."""
from copy import deepcopy
from typing import TYPE_CHECKING

from core_table.protocol import Message, MessageType
from service.choice_operation_service import (
    ChoiceIntent,
    ChoiceOperationRejected,
    ChoiceOperationService,
    ChoiceOutcome,
)
from service.encounter_engine import EncounterEngine
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from utils.blocking import run_blocking
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _ChoiceOutcomesMixin(_ProtocolBase):
    _pending_choice: ChoiceIntent | None = None

    if TYPE_CHECKING:
        from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService

        def _encounter_store(self) -> ChoiceEncounterPersistenceService: ...

    def _choice_service(self):
        return ChoiceOperationService(self._encounter_store())

    def _has_pending_choice(self):
        return isinstance(self._pending_choice, ChoiceIntent)

    @staticmethod
    def _choice_unknown(intent=None):
        return Message(MessageType.ERROR, {'error': 'Choice outcome is uncertain. Checking the original request is required.',
            'code': 'choice_outcome_unknown', 'outcome': 'unknown', 'resync_required': True,
            **({'operation_id': intent.identity.operation_id} if intent is not None else {})})

    @staticmethod
    def _install_choice(outcome: ChoiceOutcome):
        if outcome.current is None:
            EncounterEngine._active.pop(outcome.session_code, None)
        else:
            EncounterEngine.restore(deepcopy(outcome.current))

    @staticmethod
    def _choice_snapshot(outcome, *, dm=False):
        snapshot = deepcopy(outcome.current)
        if snapshot is not None and not dm:
            snapshot['dm_notes'] = ''
        return snapshot

    def _choice_response(self, outcome, intent):
        if outcome.role is None:
            return Message(MessageType.ERROR, {'error': 'Current encounter authority is required', 'code': 'forbidden',
                                               'operation_id': intent.identity.operation_id})
        if outcome.receipt is None:
            return Message(MessageType.ERROR, {'error': 'Choice transition did not commit', 'code': 'persistence_failed',
                'operation_id': intent.identity.operation_id, 'not_accepted': True, 'resync_required': True})
        kind = (MessageType.ENCOUNTER_STATE if outcome.replayed or intent.kind == 'encounter_start'
                else MessageType.ENCOUNTER_RESULT)
        return Message(kind, {**outcome.receipt, 'encounter': self._choice_snapshot(outcome, dm=is_dm(outcome.role)),
            'state_authoritative': True, 'replayed': outcome.replayed, 'resync_required': outcome.replayed})

    async def _recover_pending_choice(self, request: Message | None, client_id: str | None):
        intent = self._pending_choice
        if intent is None:
            return None
        try:
            outcome = await run_blocking(self._choice_service().lookup, intent, internal=True)
            self._install_choice(outcome)
        except Exception:
            logger.exception('Choice settlement or current installation is unavailable')
            return self._choice_unknown(intent)
        # A fresh lookup and successful live installation, including an explicit
        # empty state, precede releasing snapshots/cleanup and later mutations.
        self._pending_choice = None
        try:
            await self.broadcast_to_session(Message(MessageType.ENCOUNTER_STATE, {
                'encounter': self._choice_snapshot(outcome), 'state_authoritative': True, 'resync_required': True}), '')
        except Exception:
            logger.exception('Choice recovery notification failed after installation')
        response = self._choice_response(outcome, intent)
        matching = (request is not None and request.message_id == intent.identity.operation_id
                    and self._get_user_id(request, client_id) == intent.identity.actor_id)
        for recipient, info in list(getattr(self.session_manager, 'client_info', {}).items()):
            if info.get('user_id') != intent.identity.actor_id or matching and recipient == client_id:
                continue
            try:
                await self.send_to_client(Message(response.type, dict(response.data),
                    causation_id=intent.identity.operation_id, correlation_id=intent.identity.operation_id), recipient)
            except Exception:
                logger.exception('Choice outcome delivery failed')
        if not matching:
            return None
        assert request is not None
        try:
            replay = ChoiceIntent.create(intent.identity.session_id, intent.identity.actor_id, request.message_id,
                                         request.type.value, request.data)
            if replay.identity != intent.identity:
                raise ValueError('Recovered identity belongs to different input')
        except (ValueError, TypeError):
            return Message(MessageType.ERROR, {'error': 'Recovered choice identity belongs to different input',
                                              'code': 'operation_id_conflict'})
        return response

    async def _handle_choice_operation(self, request: Message, client_id: str) -> Message:
        try:
            # Repeat wire validation for direct protocol callers before admission.
            Message.from_dict(request.to_dict())
            intent = ChoiceIntent.create(self._get_session_id(request), self._get_user_id(request, client_id),
                                         request.message_id, request.type.value, request.data)
        except (ValueError, TypeError) as exc:
            return Message(MessageType.ERROR, {'error': str(exc), 'code': 'invalid_payload'})
        try:
            outcome = await run_blocking(self._choice_service().execute, intent)
        except ChoiceOperationRejected as exc:
            return Message(MessageType.ERROR, {'error': str(exc), 'code': exc.code,
                'operation_id': intent.identity.operation_id, **({'not_accepted': True} if exc.not_accepted else {})})
        except OperationOutcomeUnknown:
            self._pending_choice = intent
            return await self._recover_pending_choice(request, client_id) or self._choice_unknown(intent)
        except OperationRejected as exc:
            return Message(MessageType.ERROR, {'error': str(exc), 'code': exc.code})
        try:
            self._install_choice(outcome)
        except Exception:
            logger.exception('Accepted choice needs current cache repair')
            self._pending_choice = intent
            return self._choice_unknown(intent)
        response = self._choice_response(outcome, intent)
        if not outcome.replayed:
            try:
                await self.broadcast_to_session(Message(response.type, {**response.data,
                    'encounter': self._choice_snapshot(outcome)}), client_id)
            except Exception:
                logger.exception('Choice notification failed after durable acceptance')
                response.data['resync_required'] = True
        return response
