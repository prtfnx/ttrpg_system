import json
import uuid

from core_table.game_mode import GameMode
from core_table.protocol import Message, MessageType
from core_table.session_rules import SessionRules
from database.crud import get_game_mode, get_session_rules_json
from database.database import SessionLocal
from service.rules_engine import RulesEngine
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _CombatMixin(_ProtocolBase):
    """Handler methods for combat domain."""

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
        state = CombatEngine.start_combat(
            session_id=session_code,
            table_id=table_id,
            entity_ids=d.get('entity_ids', []),
            settings=settings,
            names=d.get('names', {}),
        )
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict()})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_combat_end(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can end combat'})
        from service.combat_engine import CombatEngine
        state = CombatEngine.end_combat(self._get_session_code())
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict(), 'ended': True})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_combat_state_request(self, msg: Message, client_id: str) -> Message:
        from service.combat_engine import CombatEngine
        state = CombatEngine.get_state(self._get_session_code())
        if not state:
            return Message(MessageType.COMBAT_STATE, {'combat': None})
        if is_dm(self._get_client_role(client_id)):
            return Message(MessageType.COMBAT_STATE, {'combat': state.to_dict()})
        return Message(MessageType.COMBAT_STATE, {
            'combat': state.to_dict_for_player(state.settings.show_npc_hp_to_players)
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
        resp = Message(MessageType.INITIATIVE_ORDER, {'combatant_id': combatant_id, 'value': value, 'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

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
        resp = Message(MessageType.INITIATIVE_ORDER, {'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_initiative_add(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can add combatants'})
        d = msg.data or {}
        entity_id = d.get('entity_id')
        if not entity_id:
            return Message(MessageType.ERROR, {'error': 'entity_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        extra = {k: v for k, v in d.items() if k != 'entity_id'}
        combatant = CombatEngine.add_combatant(session_code, entity_id, **extra)
        if not combatant:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        state = CombatEngine.get_state(session_code)
        order = [{'combatant_id': c.combatant_id, 'name': c.name, 'initiative': c.initiative}
                 for c in (state.combatants if state else [])]
        resp = Message(MessageType.INITIATIVE_ORDER, {'combatant': combatant.to_dict(), 'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

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
        resp = Message(MessageType.INITIATIVE_ORDER, {'removed': combatant_id, 'order': order})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_turn_end(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        state = CombatEngine.get_state(session_code)
        if not state:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        role = self._get_client_role(client_id)
        if not is_dm(role):
            current = state.get_current_combatant()
            if not current or current.combatant_id != combatant_id:
                return Message(MessageType.ERROR, {'error': 'Not your turn'})
            if not state.settings.allow_player_end_turn:
                return Message(MessageType.ERROR, {'error': 'Players cannot end their own turn'})
        if not CombatEngine.end_turn(session_code, combatant_id):
            return Message(MessageType.ERROR, {'error': 'Cannot end turn'})
        state = CombatEngine.get_state(session_code)
        current = state.get_current_combatant() if state else None
        resp = Message(MessageType.TURN_START, {
            'combat': state.to_dict() if state else None,
            'current_combatant': current.to_dict() if current else None,
            'round_number': state.round_number if state else 0,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_turn_skip(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'Only DMs can skip turns'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        result = CombatEngine.next_turn(session_code)
        if not result:
            return Message(MessageType.ERROR, {'error': 'No active combat'})
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.TURN_START, {
            'combat': state.to_dict() if state else None,
            **result,
        })
        await self.broadcast_to_session(resp, client_id)
        return resp

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
            resp = Message(MessageType.CONDITIONS_SYNC, {'combatant_id': combatant_id, 'conditions': conditions})
            await self.broadcast_to_session(resp, client_id)
            return resp
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
            resp = Message(MessageType.CONDITIONS_SYNC, {'combatant_id': combatant_id, 'conditions': conditions})
            await self.broadcast_to_session(resp, client_id)
            return resp
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
        if not CombatEngine.dm_set_hp(session_code, combatant_id, int(hp)):
            return Message(MessageType.ERROR, {'error': 'Failed'})
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_apply_damage(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id, amount = d.get('combatant_id'), d.get('amount')
        if not combatant_id or amount is None:
            return Message(MessageType.ERROR, {'error': 'combatant_id and amount required'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        result = CombatEngine.apply_damage(session_code, combatant_id, int(amount),
                                           damage_type=d.get('damage_type', ''), is_dm=True)
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None, 'damage_result': result})
        await self.broadcast_to_session(resp, client_id)
        if result.get('concentration_broken'):
            conc_msg = Message(MessageType.CONCENTRATION_BROKEN, {
                'combatant_id': combatant_id,
                'spell': result['concentration_broken'],
            })
            await self.broadcast_to_session(conc_msg, client_id)
        return resp

    async def handle_dm_revert_action(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        from service.combat_engine import CombatEngine
        session_code = self._get_session_code()
        if not CombatEngine.dm_revert_last_action(session_code):
            return Message(MessageType.ERROR, {'error': 'Nothing to revert'})
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

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
        CombatEngine.dm_grant_resource(session_code, combatant_id, resource)
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

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
        CombatEngine.dm_grant_resource(session_code, combatant_id, 'movement', amount)
        state = CombatEngine.get_state(session_code)
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

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
                if 'enabled' in d:
                    c.ai_enabled = d['enabled']
                if 'behavior' in d:
                    c.ai_behavior = d['behavior']
                resp = Message(MessageType.COMBAT_STATE, {
                    'combatant_id': combatant_id, 'ai_enabled': c.ai_enabled, 'ai_behavior': c.ai_behavior
                })
                await self.broadcast_to_session(resp, client_id)
                return resp
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
        await self.broadcast_to_session(resp, client_id)
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
        result = CombatEngine.set_temp_hp(self._get_session_code(), combatant_id, int(temp_hp))
        if not result:
            return Message(MessageType.ERROR, {'error': 'Combatant not found or no active combat'})
        state = CombatEngine.get_state(self._get_session_code())
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None, 'temp_hp_set': result})
        await self.broadcast_to_session(resp, client_id)
        return resp

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
        resp = Message(MessageType.DEATH_SAVE_RESULT, {**result, 'combat': state.to_dict() if state else None})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_set_resistances(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_id = d.get('combatant_id')
        if not combatant_id:
            return Message(MessageType.ERROR, {'error': 'combatant_id required'})
        from service.combat_engine import CombatEngine
        result = CombatEngine.set_resistances(
            self._get_session_code(), combatant_id,
            resistances=d.get('resistances'), vulnerabilities=d.get('vulnerabilities'),
            immunities=d.get('immunities'),
        )
        if not result:
            return Message(MessageType.ERROR, {'error': 'Combatant not found or no active combat'})
        state = CombatEngine.get_state(self._get_session_code())
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None, 'resistances_update': result})
        await self.broadcast_to_session(resp, client_id)
        return resp

    async def handle_dm_set_surprised(self, msg: Message, client_id: str) -> Message:
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.ERROR, {'error': 'DMs only'})
        d = msg.data or {}
        combatant_ids = d.get('combatant_ids', [])
        surprised = bool(d.get('surprised', True))
        if not combatant_ids:
            return Message(MessageType.ERROR, {'error': 'combatant_ids required'})
        from service.combat_engine import CombatEngine
        result = CombatEngine.set_surprised(self._get_session_code(), combatant_ids, surprised)
        if not result:
            return Message(MessageType.ERROR, {'error': 'No matching combatants or no active combat'})
        state = CombatEngine.get_state(self._get_session_code())
        resp = Message(MessageType.COMBAT_STATE, {'combat': state.to_dict() if state else None, 'surprised_update': result})
        await self.broadcast_to_session(resp, client_id)
        return resp

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

    async def handle_action_commit(self, msg: Message, client_id: str) -> Message:
        d = msg.data or {}
        actions = d.get('actions', [])
        sequence_id = int(d.get('sequence_id', 0))

        if not actions:
            return Message(MessageType.ACTION_REJECTED, {
                'sequence_id': sequence_id, 'failed_index': 0, 'reason': 'No actions provided',
            })

        role = self._get_client_role(client_id)
        user_id = self._get_user_id(msg, client_id)
        is_dm_user = is_dm(role)
        session_code = self._get_session_code()

        # Load rules once for this commit batch (use cache when available)
        rules = None
        mode = GameMode.FREE_ROAM
        if session_code and not is_dm_user:
            cached = self._rules_cache.get(session_code)
            if cached:
                rules, game_mode_str = cached
                try:
                    mode = GameMode(game_mode_str)
                except ValueError:
                    mode = GameMode.FREE_ROAM
            else:
                db = SessionLocal()
                try:
                    rules_json = get_session_rules_json(db, session_code)
                    mode_str = get_game_mode(db, session_code) or 'free_roam'
                    if rules_json and rules_json != '{}':
                        rules_data = json.loads(rules_json)
                        rules_data.setdefault('session_id', session_code)
                        rules = SessionRules.from_dict(rules_data)
                    try:
                        mode = GameMode(mode_str)
                    except ValueError:
                        mode = GameMode.FREE_ROAM
                finally:
                    db.close()
                if rules is not None:
                    self._rules_cache[session_code] = (rules, mode_str)
        rules = rules or SessionRules.defaults(session_code or 'default')
        engine = RulesEngine(rules)

        applied = []
        for idx, action in enumerate(actions):
            action_type = action.get('action_type', '')
            sprite_id = action.get('sprite_id') or action.get('target_id') or ''
            table_id = action.get('table_id', 'default')

            if not is_dm_user and not await self._can_control_sprite(sprite_id, user_id):
                return Message(MessageType.ACTION_REJECTED, {
                    'sequence_id': sequence_id, 'failed_index': idx,
                    'reason': 'You do not control this sprite',
                })

            if action_type == 'move':
                to_pos = {'x': float(action.get('target_x', 0)), 'y': float(action.get('target_y', 0))}
                from_pos = action.get('from') or to_pos

                if not is_dm_user:
                    vr = engine.validate_action(
                        action, mode,
                        movement_cost=action.get('cost_ft'),
                        available_speed=action.get('speed_ft'),
                    )
                    if not vr.ok:
                        return Message(MessageType.ACTION_REJECTED, {
                            'sequence_id': sequence_id, 'failed_index': idx, 'reason': vr.reason,
                        })

                    # Collision validation based on configured tier
                    tier = getattr(rules, 'server_validation_tier', 'lightweight')
                    if tier != 'trust_client':
                        table = self.table_manager.tables_id.get(table_id) or self.table_manager.tables.get(table_id)
                        if table is not None:
                            from service.movement_validator import MovementValidator
                            from_t = (float(from_pos.get('x', 0)), float(from_pos.get('y', 0)))
                            to_t   = (float(to_pos.get('x', 0)),   float(to_pos.get('y', 0)))
                            mv = MovementValidator(rules)
                            if tier == 'lightweight':
                                mv_result = mv.validate_lightweight(sprite_id, from_t, to_t, table,
                                                                    client_path=action.get('path'))
                            else:
                                mv_result = mv.validate(sprite_id, from_t, to_t, table,
                                                        client_path=action.get('path'))
                            if not mv_result.valid:
                                return Message(MessageType.ACTION_REJECTED, {
                                    'sequence_id': sequence_id, 'failed_index': idx,
                                    'reason': mv_result.reason,
                                })

                result = await self.actions.move_sprite(
                    table_id=table_id, sprite_id=sprite_id,
                    old_position=from_pos, new_position=to_pos,
                    session_id=session_code,
                )
                if not result.success:
                    return Message(MessageType.ACTION_REJECTED, {
                        'sequence_id': sequence_id, 'failed_index': idx,
                        'reason': result.message or 'Move failed',
                    })
                applied.append({'sequence_index': action.get('sequence_index', idx), 'action_type': action_type,
                                'sprite_id': sprite_id, 'to': to_pos})

            else:
                # Non-move actions: validate permissions only; execution handled by future phases
                if not is_dm_user:
                    vr = engine.validate_action(action, mode, has_action_available=True)
                    if not vr.ok:
                        return Message(MessageType.ACTION_REJECTED, {
                            'sequence_id': sequence_id, 'failed_index': idx, 'reason': vr.reason,
                        })
                applied.append({'sequence_index': action.get('sequence_index', idx), 'action_type': action_type,
                                'sprite_id': sprite_id})

        resp = Message(MessageType.ACTION_RESULT, {'sequence_id': sequence_id, 'applied': applied})
        await self.broadcast_to_session(resp, client_id)
        return resp
