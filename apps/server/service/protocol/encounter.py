from core_table.protocol import Message, MessageType
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _EncounterMixin(_ProtocolBase):
    """Handler methods for encounter domain."""

    def _encounter_store(self):
        from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceService
        return ChoiceEncounterPersistenceService()

    def _load_active_choice_encounter(self, session_code: str, encounter_id: str | None = None):
        from service.encounter_engine import EncounterEngine

        enc = EncounterEngine.get(session_code)
        if enc and (encounter_id is None or enc.encounter_id == encounter_id):
            return enc

        snapshot = self._encounter_store().load_active(session_code, encounter_id)
        return EncounterEngine.restore(snapshot) if snapshot else None

    def _persist_choice_encounter(
        self,
        *,
        session_code: str,
        encounter: dict,
        event_type: str,
        actor_id: str | None,
        payload: dict,
        created_by: int | None = None,
    ) -> None:
        self._encounter_store().save_snapshot(
            session_code=session_code,
            encounter=encounter,
            event_type=event_type,
            actor_id=actor_id,
            payload=payload,
            created_by=created_by,
        )

    async def handle_encounter_start(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can start encounters'})
        d = msg.data or {}
        title = d.get('title', 'Encounter')
        description = d.get('description', '')
        choices = d.get('choices', [])
        participants = d.get('participants', [])
        if not choices:
            return Message(MessageType.ERROR, {'error': 'choices required'})
        from service.encounter_engine import EncounterEngine
        session_code = self._get_session_code()
        created_by = self._get_user_id(msg, client_id)
        enc = EncounterEngine.create(session_code, title, description, choices, participants,
                                     dm_notes=d.get('dm_notes', ''),
                                     table_id=d.get('table_id', ''))
        self._persist_choice_encounter(
            session_code=session_code,
            encounter=enc.to_dict(dm=True),
            event_type='EncounterStarted',
            actor_id=str(created_by or client_id),
            payload=d,
            created_by=created_by,
        )
        resp = Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=False)})
        await self.broadcast_to_session(resp, client_id)
        return Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=True)})

    async def handle_encounter_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end encounters'})
        from service.encounter_engine import EncounterEngine
        d = msg.data or {}
        session_code = self._get_session_code()
        self._load_active_choice_encounter(session_code, d.get('encounter_id'))
        enc = EncounterEngine.end_encounter(session_code, d.get('encounter_id'))
        if not enc:
            return Message(MessageType.ERROR, {'error': 'No active encounter'})
        encounter = enc.to_dict(dm=True)
        actor_id = str(self._get_user_id(msg, client_id) or client_id)
        self._persist_choice_encounter(
            session_code=session_code,
            encounter=encounter,
            event_type='EncounterEnded',
            actor_id=actor_id,
            payload=d,
            created_by=self._get_user_id(msg, client_id),
        )
        resp = Message(MessageType.ENCOUNTER_RESULT, {
            'encounter_id': enc.encounter_id,
            'ended': True,
            'player_choices': enc.player_choices,
            'encounter': encounter,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_encounter_choice(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        choice_id = d.get('choice_id')
        if not choice_id:
            return Message(MessageType.ERROR, {'error': 'choice_id required'})
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        session_code = self._get_session_code()
        self._load_active_choice_encounter(session_code, d.get('encounter_id'))
        result = EncounterEngine.submit_choice(session_code, player_id, choice_id, d.get('encounter_id'))
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        encounter = result.get('encounter')
        if encounter:
            self._persist_choice_encounter(
                session_code=session_code,
                encounter=encounter,
                event_type='ChoiceSelected',
                actor_id=player_id,
                payload={'choice_id': choice_id, 'result': result.get('status')},
                created_by=self._get_user_id(msg, client_id),
            )
        resp = Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **result})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_encounter_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        bonus = int(d.get('bonus', 0))
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        session_code = self._get_session_code()
        self._load_active_choice_encounter(session_code, d.get('encounter_id'))
        result = EncounterEngine.submit_roll(session_code, player_id, bonus, d.get('encounter_id'))
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        encounter = result.get('encounter')
        if encounter:
            self._persist_choice_encounter(
                session_code=session_code,
                encounter=encounter,
                event_type='RollResolved',
                actor_id=player_id,
                payload={'bonus': bonus, 'roll': result.get('roll'), 'success': result.get('success')},
                created_by=self._get_user_id(msg, client_id),
            )
        resp = Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **result})
        await self.broadcast_to_session(resp, client_id)
        return resp
