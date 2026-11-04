from core_table.protocol import Message, MessageType
from service.choice_encounter_persistence_service import (
    ChoiceEncounterPersistenceError,
    ChoiceEncounterPersistenceService,
)
from service.encounter_engine import EncounterEngine
from utils.blocking import run_blocking

from .choice_outcomes import _ChoiceOutcomesMixin

CHOICE_ENCOUNTER_MUTATIONS = frozenset({
    MessageType.ENCOUNTER_START, MessageType.ENCOUNTER_END,
    MessageType.ENCOUNTER_CHOICE, MessageType.ENCOUNTER_ROLL,
})


class _EncounterMixin(_ChoiceOutcomesMixin):
    def _encounter_store(self):
        return ChoiceEncounterPersistenceService()

    async def _load_active_choice_encounter(self, session_code: str, encounter_id: str | None = None):
        # Join owns the same session lock. Settle an admitted write before reading
        # welcome state, even when no earlier socket remains to request recovery.
        if self._has_pending_choice():
            if await self._recover_pending_choice(None, None) is not None:
                raise ChoiceEncounterPersistenceError('Choice acceptance is still unknown')
        enc = EncounterEngine.get(session_code)
        if enc and (encounter_id is None or enc.encounter_id == encounter_id):
            return enc
        snapshot = await run_blocking(self._encounter_store().load_active, session_code, encounter_id)
        return EncounterEngine.restore(snapshot) if snapshot else None

    async def handle_encounter_start(self, msg: Message, client_id: str) -> Message:
        return await self._handle_choice_operation(msg, client_id)

    async def handle_encounter_end(self, msg: Message, client_id: str) -> Message:
        return await self._handle_choice_operation(msg, client_id)

    async def handle_encounter_choice(self, msg: Message, client_id: str) -> Message:
        return await self._handle_choice_operation(msg, client_id)

    async def handle_encounter_roll(self, msg: Message, client_id: str) -> Message:
        return await self._handle_choice_operation(msg, client_id)
