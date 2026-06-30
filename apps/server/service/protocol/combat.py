import json
import time
import uuid
from typing import Any

from core_table.protocol import Message, MessageType
from core_table.session_rules import SessionRules
from database.crud import get_game_mode, get_session_rules_json
from database.database import SessionLocal
from pydantic import ValidationError
from service.combat_command_service import CombatCommandContext, CombatCommandService
from service.combat_persistence_service import CombatPersistenceService
from service.combat_state_presenter import CombatStatePresenter
from service.combatant_factory import CombatantFactory, CombatantFactoryContext
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _CombatMixin(_ProtocolBase):
    """Handler methods for combat domain."""

    def _combat_client_ids(self) -> list[str]:
        client_info = getattr(self.session_manager, 'client_info', None)
        if isinstance(client_info, dict):
            return list(client_info)

        clients = getattr(self.session_manager, 'clients', None)
        if isinstance(clients, dict):
            return list(clients)

        return list(getattr(self, 'clients', {}))

    def _combat_state_message(
        self,
        state: Any,
        message_type: MessageType,
        recipient_id: str,
        context: dict[str, Any] | None = None,
    ) -> Message:
        client_info = self._get_client_info(recipient_id)
        data = CombatStatePresenter.message_for_client(
            state,
            self._get_client_role(recipient_id),
            client_info.get('user_id'),
            context,
        )
        return Message(message_type, data)

    async def _broadcast_combat_state(
        self,
        state: Any,
        message_type: MessageType,
        client_id: str,
        context: dict[str, Any] | None = None,
    ) -> Message:
        for recipient_id in self._combat_client_ids():
            if recipient_id == client_id:
                continue
            await self.send_to_client(
                self._combat_state_message(state, message_type, recipient_id, context),
                recipient_id,
            )

        return self._combat_state_message(state, message_type, client_id, context)

    def _get_combat_persistence_service(self) -> CombatPersistenceService | None:
        if hasattr(self, 'combat_persistence_service'):
            return self.combat_persistence_service
        self.combat_persistence_service = CombatPersistenceService()
        return self.combat_persistence_service

    def _persist_direct_combat_mutation(
        self,
        msg: Message,
        client_id: str,
        *,
        session_code: str,
        command_type: str,
        actor_id: str | None,
        command_payload: dict[str, Any],
        result_payload: dict[str, Any],
        state_before: dict[str, Any] | None,
        state_after: Any,
    ) -> str | None:
        if state_after is None:
            return None

        sequence_id = int(command_payload.get('sequence_id') or time.time_ns())
        result = {
            'accepted': True,
            'sequence_id': sequence_id,
            'applied': [{
                'sequence_index': 0,
                'action_type': command_type,
                'actor_id': actor_id,
                'result': result_payload,
            }],
            'combat': state_after.to_dict(),
        }

        persistence = self._get_combat_persistence_service()
        if persistence is None:
            from service.combat_engine import CombatEngine
            CombatEngine.persist(session_code)
            return None

        try:
            persisted = persistence.persist_accepted(
                session_code=session_code,
                requester_key=persistence.requester_key(
                    self._get_user_id(msg, client_id),
                    client_id,
                ),
                sequence_id=sequence_id,
                actor_id=actor_id,
                command_type=command_type,
                command_payload={
                    'sequence_id': sequence_id,
                    'commands': [{
                        'type': command_type,
                        'actor_id': actor_id,
                        **command_payload,
                    }],
                },
                result_payload=result,
                state_before=state_before or {},
                state_after=state_after.to_dict(),
                created_by=self._get_user_id(msg, client_id),
            )
            state_after.state_version = persisted.state_version
            return None
        except Exception as exc:
            if state_before is not None:
                from core_table.combat import CombatState
                from service.combat_engine import CombatEngine
                CombatEngine._active[session_code] = CombatState.from_dict(state_before)
            logger.warning('Failed to persist direct combat mutation %s: %s', command_type, exc)
            return 'Failed to persist combat mutation'

    async def handle_combat_start(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can start combat'})
        d = msg.data or {}
        table_id = d.get('table_id')
        if not table_id:
            return Message(MessageType.ERROR, {'error': 'table_id required'})

        from core_table.combat import CombatSettings
        from service.combat_engine import CombatEngine
        settings = CombatSettings.from_dict(d['settings']) if d.get('settings') else None
        session_code = self._get_session_code()
        entity_ids = [str(entity_id) for entity_id in d.get('entity_ids', []) if entity_id]
        incoming_combatants = [item for item in d.get('combatants', []) if isinstance(item, dict)]
        if not entity_ids:
            entity_ids = [str(item.get('entity_id')) for item in incoming_combatants if item.get('entity_id')]
        combatants = CombatantFactory().build_many(
            entity_ids,
            incoming_combatants,
            self._combatant_factory_context(msg, table_id),
        )
        state = CombatEngine.start_combat(
            session_id=session_code,
            table_id=table_id,
            entity_ids=entity_ids,
            settings=settings,
            names=d.get('names', {}),
            combatants=combatants,
        )
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
        )

    async def handle_combat_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end combat'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.end_combat(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
            {'ended': True},
        )

    async def handle_combat_state_request(self, msg: Message, client_id: str) -> Message:
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        # Try in-memory first, then restore from DB (handles reconnects after restart)
        state = CombatEngine.get_state(session_code) or CombatEngine.restore(session_code)
        if not state:
            return Message(MessageType.COMBAT_STATE, {'combat': None})
        return Message(MessageType.COMBAT_STATE, {
            'combat': CombatStatePresenter.for_client(
                state,
                self._get_client_role(client_id),
                self._get_user_id(msg, client_id),
            )
        })

    async def handle_initiative_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        value = CombatEngine.roll_initiative(session_code, combatant_id)
        if value is None:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        return await self._broadcast_combat_state(
            state,
            MessageType.INITIATIVE_ORDER,
            client_id,
            {
                'combatant_id': combatant_id,
                'value': value,
                'order': order,
            },
        )

    async def handle_initiative_set(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can set initiative'})
        d = msg.data or {}
        combatant_id, value = d.get('combatant_id'), d.get('value')
        if not combatant_id or value is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and value required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not CombatEngine.set_initiative(session_code, combatant_id, float(value)):
            return Message(MessageType.ERROR, {'error': 'Failed — no active combat or combatant not found'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        return await self._broadcast_combat_state(
            state,
            MessageType.INITIATIVE_ORDER,
            client_id,
            {'order': order},
        )

    async def handle_initiative_add(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can add combatants'})
        d = msg.data or {}
        entity_id = d.get('entity_id')
        if not entity_id:
            return Message(MessageType.ERROR, {'error': 'entity_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state = CombatEngine.get_state(session_code)
        table_id = d.get('table_id') or (state.table_id if state else '')
        resolved = CombatantFactory().build_payload(
            str(entity_id),
            d,
            self._combatant_factory_context(msg, table_id),
        )
        extra = {k: v for k, v in resolved.items() if k != 'entity_id'}
        combatant = CombatEngine.add_combatant(session_code, entity_id, **extra)
        if not combatant:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        return await self._broadcast_combat_state(
            state,
            MessageType.INITIATIVE_ORDER,
            client_id,
            {
                'combatant': combatant.to_dict(),
                'order': order,
            },
        )

    async def handle_initiative_remove(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can remove combatants'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        CombatEngine.remove_combatant(session_code, combatant_id)
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        return await self._broadcast_combat_state(
            state,
            MessageType.INITIATIVE_ORDER,
            client_id,
            {
                'removed': combatant_id,
                'order': order,
            },
        )

    async def handle_turn_skip(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can skip turns'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        result = CombatEngine.next_turn(session_code)
        if not result:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        state = CombatEngine.get_state(session_code)
        return await self._broadcast_combat_state(
            state,
            MessageType.TURN_START,
            client_id,
            result,
        )

    async def handle_condition_add(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can add conditions'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        condition_str = d.get('condition_type')
        if not combatant_id or not condition_str:
            return Message(MessageType.ERROR, {'error': 'combatant_id and condition_type required'})
        from core_table.conditions import ActiveCondition, ConditionType
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            try:
                ctype = ConditionType(condition_str)
            except ValueError:
                return Message(MessageType.ERROR, {'error': f'Unknown condition: {condition_str}'})
            if not any(x.condition_type == ctype for x in c.conditions):
                c.conditions.append(ActiveCondition(
                    condition_id=str(uuid.uuid4()),
                    condition_type=ctype,
                    source=d.get('source', 'dm'),
                    duration_type='rounds' if d.get('duration') else 'permanent',
                    duration_remaining=d.get('duration'),
                ))
            conditions = [x.to_dict() for x in c.conditions]
            return await self._broadcast_combat_state(
                state,
                MessageType.CONDITIONS_SYNC,
                client_id,
                {'combatant_id': combatant_id, 'conditions': conditions},
            )
        return Message(MessageType.ERROR, {'error': 'Combatant not found'})

    async def handle_condition_remove(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can remove conditions'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        condition_str = d.get('condition_type')
        if not combatant_id or not condition_str:
            return Message(MessageType.ERROR, {'error': 'combatant_id and condition_type required'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            c.conditions = [x for x in c.conditions if x.condition_type.value != condition_str]
            conditions = [x.to_dict() for x in c.conditions]
            return await self._broadcast_combat_state(
                state,
                MessageType.CONDITIONS_SYNC,
                client_id,
                {'combatant_id': combatant_id, 'conditions': conditions},
            )
        return Message(MessageType.ERROR, {'error': 'Combatant not found'})

    async def handle_dm_set_hp(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id, hp = d.get('combatant_id'), d.get('hp')
        if not combatant_id or hp is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and hp required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        if not CombatEngine.dm_set_hp(session_code, combatant_id, int(hp)):
            return Message(MessageType.ERROR, {'error': 'Failed'})
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_set_hp',
            actor_id=combatant_id,
            command_payload=d,
            result_payload={'combatant_id': combatant_id, 'hp': int(hp)},
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
        )

    async def handle_dm_apply_damage(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id, amount = d.get('combatant_id'), d.get('amount')
        if not combatant_id or amount is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and amount required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.apply_damage(session_code, combatant_id, int(amount),
                                           damage_type=d.get('damage_type', ''), is_dm=True)
        if result.get('error'):
            return Message(MessageType.ERROR, result)
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_apply_damage',
            actor_id=combatant_id,
            command_payload=d,
            result_payload=result,
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        resp = await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
            {'damage_result': result},
        )
        if result.get('concentration_broken'):
            conc_msg = Message(MessageType.CONCENTRATION_BROKEN, {
                'combatant_id': combatant_id,
                'spell': result['concentration_broken'],
                'roll': result.get('concentration_roll'),
            })
            await self.broadcast_to_session(conc_msg, client_id)
        elif result.get('concentration_saved'):
            await self.broadcast_to_session(
                Message(MessageType.CONCENTRATION_SAVED, {
                    'combatant_id': combatant_id,
                    'spell': result['concentration_saved'],
                    'roll': result.get('concentration_roll'),
                }), client_id,
            )
        return resp

    async def handle_dm_revert_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not CombatEngine.dm_revert_last_action(session_code):
            return Message(MessageType.ERROR, {'error': 'Nothing to revert'})
        state = CombatEngine.get_state(session_code)
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
        )

    async def handle_dm_add_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        resource = d.get('resource', 'action')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.dm_grant_resource(session_code, combatant_id, resource)
        if result is False:
            return Message(MessageType.ERROR, {'error': 'Combatant not found or no active combat'})
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_grant_resource',
            actor_id=combatant_id,
            command_payload=d,
            result_payload={'combatant_id': combatant_id, 'resource': resource},
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
        )

    async def handle_dm_add_movement(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        amount = float(d.get('amount', 5))
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.dm_grant_resource(session_code, combatant_id, 'movement', amount)
        if result is False:
            return Message(MessageType.ERROR, {'error': 'Combatant not found or no active combat'})
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_grant_movement',
            actor_id=combatant_id,
            command_payload=d,
            result_payload={'combatant_id': combatant_id, 'resource': 'movement', 'amount': amount},
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
        )

    async def handle_dm_toggle_ai(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                state_before = state.to_dict()
                if 'enabled' in d:
                    c.ai_enabled = d['enabled']
                if 'behavior' in d:
                    c.ai_behavior = d['behavior']
                persist_error = self._persist_direct_combat_mutation(
                    msg,
                    client_id,
                    session_code=self._get_session_code(),
                    command_type='dm_toggle_ai',
                    actor_id=combatant_id,
                    command_payload=d,
                    result_payload={
                        'combatant_id': combatant_id,
                        'ai_enabled': c.ai_enabled,
                        'ai_behavior': c.ai_behavior,
                    },
                    state_before=state_before,
                    state_after=state,
                )
                if persist_error:
                    return Message(MessageType.ERROR, {'error': persist_error})
                return await self._broadcast_combat_state(
                    state,
                    MessageType.COMBAT_STATE,
                    client_id,
                    {'combatant_id': combatant_id},
                )
        return Message(MessageType.ERROR, {'error': 'Combatant not found'})

    async def handle_ai_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        from service.npc_ai import NPCAIEngine
        session_code = self._get_session_code()
        state = CombatEngine.get_state(session_code)
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        combatant = next((c for c in state.combatants if c.combatant_id == combatant_id), None)
        if not combatant:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        decision = NPCAIEngine.decide_action(combatant, state, combatant.ai_behavior)
        resp = Message(MessageType.AI_SUGGESTION, {'combatant_id': combatant_id, 'decision': {
            'action_type': decision.action_type, 'target_id': decision.target_id,
            'move_to': decision.move_to, 'reasoning': decision.reasoning,
        }})
        return resp

    async def handle_dm_set_temp_hp(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        temp_hp = d.get('temp_hp') if d.get('temp_hp') is not None else d.get('amount')
        if not combatant_id or temp_hp is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and temp_hp required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.set_temp_hp(session_code, combatant_id, int(temp_hp))
        if not result:
            return Message(MessageType.ERROR, {'error': 'Combatant not found or no active combat'})
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_set_temp_hp',
            actor_id=combatant_id,
            command_payload=d,
            result_payload=result,
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
            {'temp_hp_set': result},
        )

    async def handle_death_save_roll(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        # Only the controlling player or DM may roll
        state = CombatEngine.get_state(session_code)
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        combatant = next((c for c in state.combatants if c.combatant_id == combatant_id), None)
        if not combatant:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        user_id = self._get_user_id(msg, client_id)
        if not is_dm(self._get_client_role(client_id)):
            if user_id is None or str(user_id) not in combatant.controlled_by:
                return Message(MessageType.ERROR, {'error': 'Not your combatant'})
        result = CombatEngine.roll_death_save(session_code, combatant_id)
        if result is None:
            return Message(MessageType.ERROR, {'error': 'Cannot roll — combatant is not downed'})
        state = CombatEngine.get_state(session_code)
        return await self._broadcast_combat_state(
            state,
            MessageType.DEATH_SAVE_RESULT,
            client_id,
            result,
        )

    async def handle_dm_set_resistances(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.set_resistances(
            session_code, combatant_id,
            resistances=d.get('resistances'), vulnerabilities=d.get('vulnerabilities'),
            immunities=d.get('immunities'),
        )
        if not result:
            return Message(MessageType.ERROR, {'error': 'Combatant not found or no active combat'})
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_set_resistances',
            actor_id=combatant_id,
            command_payload=d,
            result_payload=result,
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
            {'resistances_update': result},
        )

    async def handle_dm_set_surprised(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_ids = d.get('combatant_ids', [])
        surprised = bool(d.get('surprised', True))
        if not combatant_ids:
            return Message(MessageType.ERROR, {'error': 'combatant_ids required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.set_surprised(session_code, combatant_ids, surprised)
        if not result:
            return Message(MessageType.ERROR, {'error': 'No matching combatants or no active combat'})
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_set_surprised',
            actor_id=','.join(combatant_ids),
            command_payload=d,
            result_payload=result,
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.COMBAT_STATE,
            client_id,
            {'surprised_update': result},
        )

    async def handle_dm_set_terrain(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        cells = d.get('cells', [])        # list of [col, row]
        mode = d.get('mode', 'add')       # 'add' | 'remove' | 'clear'
        table_id = str(d.get('table_id', ''))
        table = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})
        if not hasattr(table, 'difficult_terrain_cells'):
            table.difficult_terrain_cells = set()
        if mode == 'clear':
            table.difficult_terrain_cells.clear()
        elif mode == 'remove':
            for col, row in cells:
                table.difficult_terrain_cells.discard((col, row))
        else:
            for col, row in cells:
                table.difficult_terrain_cells.add((col, row))
        resp = Message(MessageType.DM_SET_TERRAIN, {
            'difficult_terrain': [list(c) for c in table.difficult_terrain_cells],
            'mode': mode,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

    def _get_table_by_id(self, table_id: str):
        return self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)

    def _combatant_factory_context(self, msg: Message, table_id: str) -> CombatantFactoryContext:
        session_id = self._get_session_id(msg)

        def load_character(character_id: str) -> dict[str, Any] | None:
            if not session_id or not character_id:
                return None
            try:
                from database.models import SessionCharacter
                with SessionLocal() as db:
                    character = db.query(SessionCharacter).filter(
                        SessionCharacter.session_id == session_id,
                        SessionCharacter.character_id == character_id,
                    ).first()
                    if not character:
                        return None
                    data = json.loads(character.character_data)
                    if isinstance(data, dict):
                        data.setdefault('name', character.character_name)
                        return data
            except Exception as exc:
                logger.debug('Could not load character %s for combatant factory: %s', character_id, exc)
            return None

        return CombatantFactoryContext(
            table=self._get_table_by_id(str(table_id)) if table_id else None,
            load_character=load_character,
        )

    async def handle_combat_command(self, msg: Message, client_id: str) -> Message:
        service = CombatCommandService(
            persistence=self._get_combat_persistence_service(),
        )
        payload = msg.data or {}

        try:
            envelope = service.parse_envelope(payload)
        except ValidationError as exc:
            return Message(MessageType.ACTION_REJECTED, {
                "accepted": False,
                "sequence_id": payload.get("sequence_id", 0),
                "applied": [],
                "failed_index": 0,
                "reason": str(exc),
            })

        result = await service.apply_async(
            envelope,
            CombatCommandContext(
                session_code=self._get_session_code(),
                client_id=client_id,
                role=self._get_client_role(client_id),
                user_id=self._get_user_id(msg, client_id),
                table_lookup=self._get_table_by_id,
                move_sprite=self._move_sprite_for_combat_command,
                validate_move=self._validate_move_for_combat_command,
            ),
        )
        response_type = MessageType.ACTION_RESULT if result.accepted else MessageType.ACTION_REJECTED
        if result.accepted:
            from service.combat_engine import CombatEngine
            state = CombatEngine.get_state(self._get_session_code())
            context = result.to_dict()
            context.pop('combat', None)
            if result.duplicate:
                return self._combat_state_message(
                    state,
                    response_type,
                    client_id,
                    context,
                )
            return await self._broadcast_combat_state(
                state,
                response_type,
                client_id,
                context,
            )
        return Message(response_type, result.to_dict())

    async def _move_sprite_for_combat_command(
        self,
        table_id: str,
        sprite_id: str,
        old_position: dict[str, float],
        new_position: dict[str, float],
        session_id: str,
    ) -> dict[str, Any]:
        result = await self.actions.move_sprite(
            table_id=table_id,
            sprite_id=sprite_id,
            old_position=old_position,
            new_position=new_position,
            session_id=session_id,
        )
        return {"success": result.success, "message": result.message}

    def _validate_move_for_combat_command(
        self,
        table_id: str,
        sprite_id: str,
        old_position: dict[str, float],
        new_position: dict[str, float],
        path: list[Any],
    ) -> dict[str, Any]:
        table = self._get_table_by_id(table_id)
        if table is None:
            return {"success": False, "message": "Table not found"}

        session_code = self._get_session_code()
        rules = None
        mode_str = "free_roam"
        cached = self._rules_cache.get(session_code) if session_code else None
        if cached:
            rules = cached[0]
            mode_str = cached[1]
        elif session_code:
            db = SessionLocal()
            try:
                rules_json = get_session_rules_json(db, session_code)
                mode_str = get_game_mode(db, session_code) or "free_roam"
                if rules_json and rules_json != "{}":
                    rules_data = json.loads(rules_json)
                    rules_data.setdefault("session_id", session_code)
                    rules = SessionRules.from_dict(rules_data)
                    self._rules_cache[session_code] = (rules, mode_str)
            finally:
                db.close()
        rules = rules or SessionRules.defaults(session_code or "default")

        from service.combat_engine import CombatEngine
        from service.movement_validator import MovementValidator

        validator = MovementValidator(rules)
        tier = getattr(rules, "server_validation_tier", "lightweight")
        from_pos = (float(old_position.get("x", 0)), float(old_position.get("y", 0)))
        to_pos = (float(new_position.get("x", 0)), float(new_position.get("y", 0)))
        if tier == "trust_client":
            result = None
        elif tier == "lightweight":
            result = validator.validate_lightweight(sprite_id, from_pos, to_pos, table, client_path=path)
        else:
            result = validator.validate(sprite_id, from_pos, to_pos, table, client_path=path)
        if result is not None and not result.valid:
            return {"success": False, "message": result.reason}

        triggers = []
        if mode_str == "fight":
            triggers = validator.check_opportunity_attacks(
                sprite_id,
                from_pos,
                table,
                CombatEngine.get_state(session_code),
                to_pos=to_pos,
            )
        return {"success": True, "message": "ok", "opportunity_attack_triggers": triggers}

    async def handle_cover_zone_add(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        from core_table.table import CoverZone
        d = msg.data or {}
        table_id = str(d.get('table_id', ''))
        table = self._get_table_by_id(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})
        zone = CoverZone.from_dict(d['zone'])
        if not hasattr(table, 'cover_zones'):
            table.cover_zones = []
        # Replace if zone_id already exists
        table.cover_zones = [z for z in table.cover_zones if z.zone_id != zone.zone_id]
        table.cover_zones.append(zone)
        resp = Message(MessageType.COVER_ZONE_ADD, {'zone': zone.to_dict()})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_cover_zone_remove(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        table_id = str(d.get('table_id', ''))
        table = self._get_table_by_id(table_id)
        if table is None:
            return Message(MessageType.ERROR, {'error': 'Table not found'})
        zone_id = d.get('zone_id', '')
        if hasattr(table, 'cover_zones'):
            table.cover_zones = [z for z in table.cover_zones if z.zone_id != zone_id]
        resp = Message(MessageType.COVER_ZONE_REMOVE, {'zone_id': zone_id})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_cover_zones_sync(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        table_id = str(d.get('table_id', ''))
        table = self._get_table_by_id(table_id)
        zones = [z.to_dict() for z in getattr(table, 'cover_zones', [])] if table else []
        return Message(MessageType.COVER_ZONES_SYNC, {'zones': zones})

    async def handle_attack_preview(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        from service.attack_resolver import AttackResolver
        from service.combat_engine import CombatEngine
        d = msg.data or {}
        session_code = self._get_session_code()
        state = CombatEngine.get_state(session_code)
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        attacker_id = d.get('attacker_id', '')
        target_id = d.get('target_id', '')
        atk = next((c for c in state.combatants if c.combatant_id == attacker_id), None)
        tgt = next((c for c in state.combatants if c.combatant_id == target_id), None)
        if not atk or not tgt:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        table_id = str(d.get('table_id', ''))
        table = self._get_table_by_id(table_id)
        from core_table.session_rules import SessionRules
        rules = SessionRules.defaults(session_code or 'default')
        resolver = AttackResolver(rules)
        attack_type = d.get('attack_type', 'melee')
        # Look up real entity positions for accurate cover calculation
        cover = 'none'
        if table:
            atk_sprite = table.sprite_to_entity.get(str(atk.entity_id))
            tgt_sprite = table.sprite_to_entity.get(str(tgt.entity_id))
            atk_ent = table.entities.get(atk_sprite) if atk_sprite else None
            tgt_ent = table.entities.get(tgt_sprite) if tgt_sprite else None
            if atk_ent and tgt_ent:
                atk_pos = (float(atk_ent.position[0]), float(atk_ent.position[1]))
                tgt_pos = (float(tgt_ent.position[0]), float(tgt_ent.position[1]))
                cover = AttackResolver.resolve_cover(atk_pos, tgt_pos, table)
        # Resolve with attack_bonus=0 just for preview info
        attack_bonus = int(d.get('attack_bonus', 0))
        result = resolver.resolve_attack(
            atk, tgt, attack_bonus=attack_bonus,
            damage_formula=d.get('damage_formula', '1d6'),
            damage_type=d.get('damage_type', 'bludgeoning'),
            attack_type=attack_type, table=table, combat=state,
        )
        return Message(MessageType.ATTACK_PREVIEW_RESULT, {
            'hit': result.hit, 'is_critical': result.is_critical,
            'attack_roll': result.attack_roll.total if result.attack_roll else None,
            'damage_dealt': result.damage_dealt, 'reason': result.reason,
            'cover': cover,
            'effective_ac': tgt.armor_class + {'half': 2, 'three_quarters': 5}.get(cover, 0),
        })

    async def handle_oa_confirm_move(self, msg: Message, client_id: str) -> Message:
        """Player confirmed move despite OA warning — apply the pending move."""
        d = msg.data or {}
        session_code = self._get_session_code()
        entity_id = d.get('entity_id', '')
        # Ownership check: only DM or controlling player may confirm
        role = self._get_client_role(client_id)
        if not is_dm(role):
            user_id_check = self._get_user_id(msg, client_id)
            if not await self._can_control_sprite(entity_id, user_id_check):
                return Message(MessageType.ERROR, {'error': 'You do not control this sprite'})
        key = f'{session_code}:{entity_id}'
        pending = self.__class__._pending_moves.pop(key, None)
        if not pending:
            return Message(MessageType.ERROR, {'error': 'No pending move'})
        move_msg = Message(MessageType.SPRITE_MOVE, {
            'sprite_id': entity_id,
            'from': pending['from_pos'],
            'to': pending['to_pos'],
            'path': pending.get('path', []),
            'action_id': pending.get('action_id'),
        })
        await self.broadcast_to_session(move_msg, client_id)
        return move_msg

    async def handle_oa_resolve(self, msg: Message, client_id: str) -> Message:
        """Attacker resolves (or passes) an opportunity attack reaction."""
        from service.attack_resolver import AttackResolver
        from service.combat_engine import CombatEngine
        d = msg.data or {}
        session_code = self._get_session_code()
        attacker_id = d.get('attacker_combatant_id', '')
        state = CombatEngine.get_state(session_code)
        # Auth: DM or the controlling player of the attacker
        role = self._get_client_role(client_id)
        if not is_dm(role) and state:
            atk_check = next((c for c in state.combatants if c.combatant_id == attacker_id), None)
            user_id_check = self._get_user_id(msg, client_id)
            if atk_check and user_id_check is not None:
                if str(user_id_check) not in getattr(atk_check, 'controlled_by', []):
                    return Message(MessageType.ERROR, {'error': 'Not your combatant'})
        if not d.get('use_reaction', False):
            resp = Message(MessageType.OPPORTUNITY_ATTACK_RESOLVE, {'resolved': True, 'passed': True})
            await self.broadcast_to_session(resp, client_id)
            return resp
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        target_id = d.get('target_combatant_id', '')
        atk = next((c for c in state.combatants if c.combatant_id == attacker_id), None)
        tgt = next((c for c in state.combatants if c.combatant_id == target_id), None)
        if not atk or not tgt:
            return Message(MessageType.ERROR, {'error': 'Combatant not found'})
        atk.has_reaction = False
        from core_table.session_rules import SessionRules
        rules = SessionRules.defaults(session_code or 'default')
        resolver = AttackResolver(rules)
        result = resolver.resolve_attack(
            atk, tgt, attack_bonus=int(d.get('attack_bonus', 0)),
            damage_formula=d.get('damage_formula', '1d6+0'),
            damage_type=d.get('damage_type', 'bludgeoning'),
            combat=state,
        )
        if result.hit:
            CombatEngine.apply_damage(session_code, tgt.combatant_id, result.damage_dealt)
        resp = Message(MessageType.OPPORTUNITY_ATTACK_RESOLVE, {
            'hit': result.hit, 'damage': result.damage_dealt,
            'attacker': attacker_id, 'target': target_id,
            'reason': result.reason,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_restore_spell_slot(self, msg: Message, client_id: str) -> Message:
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DM only'})
        d = msg.data or {}
        state_before_obj = CombatEngine.get_state(session_code)
        state_before = state_before_obj.to_dict() if state_before_obj else None
        result = CombatEngine.restore_spell_slot(
            session_code,
            combatant_id=d.get('combatant_id', ''),
            slot_level=d.get('slot_level', 1),
        )
        if 'error' in result:
            return Message(MessageType.ERROR, result)
        state = CombatEngine.get_state(session_code)
        persist_error = self._persist_direct_combat_mutation(
            msg,
            client_id,
            session_code=session_code,
            command_type='dm_restore_spell_slot',
            actor_id=d.get('combatant_id'),
            command_payload=d,
            result_payload=result,
            state_before=state_before,
            state_after=state,
        )
        if persist_error:
            return Message(MessageType.ERROR, {'error': persist_error})
        return await self._broadcast_combat_state(
            state,
            MessageType.SPELL_SLOT_RECOVER,
            client_id,
            result,
        )

