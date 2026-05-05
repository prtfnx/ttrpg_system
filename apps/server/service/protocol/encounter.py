from typing import TYPE_CHECKING

from core_table.protocol import Message, MessageType
from utils.logger import setup_logger
from utils.roles import is_dm

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)


class _EncounterMixin:
    """Handler methods for encounter domain."""

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
        enc = EncounterEngine.create(session_code, title, description, choices, participants,
                                     dm_notes=d.get('dm_notes', ''))
        resp = Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=False)})
        await self.broadcast_to_session(resp, client_id)
        return Message(MessageType.ENCOUNTER_STATE, {'encounter': enc.to_dict(dm=True)})

    async def handle_encounter_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end encounters'})
        from service.encounter_engine import EncounterEngine
        enc = EncounterEngine.end_encounter(self._get_session_code())
        if not enc:
            return Message(MessageType.ERROR, {'error': 'No active encounter'})
        resp = Message(MessageType.ENCOUNTER_RESULT, {'encounter_id': enc.encounter_id, 'ended': True,
                                                      'player_choices': enc.player_choices})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_encounter_choice(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        choice_id = d.get('choice_id')
        if not choice_id:
            return Message(MessageType.ERROR, {'error': 'choice_id required'})
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        result = EncounterEngine.submit_choice(self._get_session_code(), player_id, choice_id)
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        return Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **result})

    async def handle_encounter_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        bonus = int(d.get('bonus', 0))
        player_id = str(self._get_user_id(msg, client_id) or client_id)
        from service.encounter_engine import EncounterEngine
        result = EncounterEngine.submit_roll(self._get_session_code(), player_id, bonus)
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        resp = Message(MessageType.ENCOUNTER_RESULT, {'player_id': player_id, **result})
        await self.broadcast_to_session(resp, client_id)
        return resp
