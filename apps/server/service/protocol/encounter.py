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
        if not choices or not all(
            isinstance(choice, dict) and str(choice.get('text') or '').strip()
            for choice in choices
        ):
            return Message(MessageType.ERROR, {'error': 'choices required'})
        from service.encounter_engine import EncounterEngine
        from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceError
        session_code = self._get_session_code()
        created_by = self._get_user_id(msg, client_id)
        try:
            if self._load_active_choice_encounter(session_code):
                return Message(MessageType.ERROR, {'error': 'An active encounter already exists'})
        except ChoiceEncounterPersistenceError:
            logger.exception("Failed to check for an active choice encounter")
            return Message(MessageType.ERROR, {'error': 'Encounter storage is unavailable'})

        try:
            enc = EncounterEngine.create(
                session_code,
                str(title),
                str(description),
                choices,
                participants,
                dm_notes=str(d.get('dm_notes', '')),
                table_id=str(d.get('table_id', '')),
            )
        except (TypeError, ValueError):
            return Message(MessageType.ERROR, {'error': 'Invalid encounter choice data'})
        try:
            self._persist_choice_encounter(
                session_code=session_code,
                encounter=enc.to_dict(dm=True),
                event_type='EncounterStarted',
                actor_id=str(created_by or client_id),
                payload=d,
                created_by=created_by,
            )
        except ChoiceEncounterPersistenceError:
            EncounterEngine.end_encounter(session_code, enc.encounter_id)
            logger.exception("Failed to persist choice encounter start")
            return Message(MessageType.ERROR, {'error': 'Encounter could not be saved'})
        resp = Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=False)})
        await self.broadcast_to_session(resp, client_id)
        return Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=True)})

    async def handle_encounter_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end encounters'})
        from service.encounter_engine import EncounterEngine
        from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceError
        d = msg.data or {}
        session_code = self._get_session_code()
        try:
            active = self._load_active_choice_encounter(session_code, d.get('encounter_id'))
        except ChoiceEncounterPersistenceError:
            logger.exception("Failed to load choice encounter for completion")
            return Message(MessageType.ERROR, {'error': 'Encounter storage is unavailable'})
        before = active.to_dict(dm=True) if active else None
        enc = EncounterEngine.end_encounter(session_code, d.get('encounter_id'))
        if not enc:
            return Message(MessageType.ERROR, {'error': 'No active encounter'})
        dm_encounter = enc.to_dict(dm=True)
        actor_id = str(self._get_user_id(msg, client_id) or client_id)
        try:
            self._persist_choice_encounter(
                session_code=session_code,
                encounter=dm_encounter,
                event_type='EncounterEnded',
                actor_id=actor_id,
                payload=d,
                created_by=self._get_user_id(msg, client_id),
            )
        except ChoiceEncounterPersistenceError:
            if before:
                EncounterEngine.restore(before)
            logger.exception("Failed to persist choice encounter completion")
            return Message(MessageType.ERROR, {'error': 'Encounter could not be saved'})
        public_resp = Message(MessageType.ENCOUNTER_RESULT, {
            'encounter_id': enc.encounter_id,
            'ended': True,
            'player_choices': enc.player_choices,
            'encounter': enc.to_dict(dm=False),
        })
        await self.broadcast_to_session(public_resp, client_id)
        return Message(MessageType.ENCOUNTER_RESULT, {
            **public_resp.data,
            'encounter': dm_encounter,
        })

    async def handle_encounter_choice(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        choice_id = d.get('choice_id')
        if not choice_id:
            return Message(MessageType.ERROR, {'error': 'choice_id required'})
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceError
        session_code = self._get_session_code()
        try:
            active = self._load_active_choice_encounter(session_code, d.get('encounter_id'))
        except ChoiceEncounterPersistenceError:
            logger.exception("Failed to load choice encounter for selection")
            return Message(MessageType.ERROR, {'error': 'Encounter storage is unavailable'})
        before = active.to_dict(dm=True) if active else None
        result = EncounterEngine.submit_choice(session_code, player_id, choice_id, d.get('encounter_id'))
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        enc = EncounterEngine.get(session_code)
        if enc:
            try:
                self._persist_choice_encounter(
                    session_code=session_code,
                    encounter=enc.to_dict(dm=True),
                    event_type='ChoiceSelected',
                    actor_id=player_id,
                    payload={'choice_id': choice_id, 'result': result.get('status')},
                    created_by=self._get_user_id(msg, client_id),
                )
            except ChoiceEncounterPersistenceError:
                if before:
                    EncounterEngine.restore(before)
                logger.exception("Failed to persist choice encounter selection")
                return Message(MessageType.ERROR, {'error': 'Encounter could not be saved'})
        public_result = {key: value for key, value in result.items() if key != 'encounter'}
        if enc:
            public_result['encounter'] = enc.to_dict(dm=False)
        resp = Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **public_result})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_encounter_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        try:
            bonus = int(d.get('bonus', 0))
        except (TypeError, ValueError):
            return Message(MessageType.ERROR, {'error': 'bonus must be an integer'})
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        from service.choice_encounter_persistence_service import ChoiceEncounterPersistenceError
        session_code = self._get_session_code()
        try:
            active = self._load_active_choice_encounter(session_code, d.get('encounter_id'))
        except ChoiceEncounterPersistenceError:
            logger.exception("Failed to load choice encounter for roll")
            return Message(MessageType.ERROR, {'error': 'Encounter storage is unavailable'})
        before = active.to_dict(dm=True) if active else None
        result = EncounterEngine.submit_roll(session_code, player_id, bonus, d.get('encounter_id'))
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        enc = EncounterEngine.get(session_code)
        if enc:
            try:
                self._persist_choice_encounter(
                    session_code=session_code,
                    encounter=enc.to_dict(dm=True),
                    event_type='RollResolved',
                    actor_id=player_id,
                    payload={'bonus': bonus, 'roll': result.get('roll'), 'success': result.get('success')},
                    created_by=self._get_user_id(msg, client_id),
                )
            except ChoiceEncounterPersistenceError:
                if before:
                    EncounterEngine.restore(before)
                logger.exception("Failed to persist choice encounter roll")
                return Message(MessageType.ERROR, {'error': 'Encounter could not be saved'})
        public_result = {key: value for key, value in result.items() if key != 'encounter'}
        if enc:
            public_result['encounter'] = enc.to_dict(dm=False)
        resp = Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **public_result})
        await self.broadcast_to_session(resp, client_id)
        return resp
