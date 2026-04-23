import logging
import math
import random
import time
import uuid
from typing import Optional

from core_table.combat import (
    ActionCost, CombatAction, CombatPhase, CombatSettings, CombatState, Combatant,
)
from core_table.combat_fsm import CombatFSM
from core_table.dice import DiceEngine

logger = logging.getLogger(__name__)


class CombatEngine:
    """Server-authoritative combat orchestrator. One per active combat."""

    # session_code → CombatState (in-memory; persisted to DB on round/end)
    _active: dict[str, CombatState] = {}

    # ── Lifecycle ───────────────────────────────────────────────────────────

    @classmethod
    def start_combat(
        cls,
        session_id: str,
        table_id: str,
        entity_ids: list[str],
        settings: CombatSettings | None = None,
        names: dict[str, str] | None = None,
    ) -> CombatState:
        combat_id = str(uuid.uuid4())
        state = CombatState(
            combat_id=combat_id, session_id=session_id, table_id=table_id,
            phase=CombatPhase.SETUP, started_at=time.time(),
            settings=settings or CombatSettings(),
        )
        names = names or {}
        for eid in entity_ids:
            state.combatants.append(Combatant(
                combatant_id=str(uuid.uuid4()), entity_id=eid,
                name=names.get(eid, eid[:8]),
                movement_speed=30, movement_remaining=30,
            ))
        cls._active[session_id] = state

        if state.settings.auto_roll_npc_initiative:
            for c in state.combatants:
                if c.is_npc and c.initiative is None:
                    c.initiative = float(random.randint(1, 20) + c.initiative_modifier)

        fsm = CombatFSM(state)
        fsm.transition(CombatPhase.ACTIVE, state.settings)
        state.round_number = 1
        return state

    @classmethod
    def end_combat(cls, session_id: str) -> CombatState | None:
        state = cls._active.pop(session_id, None)
        if state:
            state.phase = CombatPhase.ENDED
        return state

    @classmethod
    def get_state(cls, session_id: str) -> CombatState | None:
        return cls._active.get(session_id)

    # ── Combatants ──────────────────────────────────────────────────────────

    @classmethod
    def add_combatant(cls, session_id: str, entity_id: str, **kwargs) -> Combatant | None:
        state = cls._active.get(session_id)
        if not state:
            return None
        c = Combatant(
            combatant_id=str(uuid.uuid4()), entity_id=entity_id,
            movement_speed=kwargs.get('movement_speed', 30),
            movement_remaining=kwargs.get('movement_speed', 30),
            **{k: v for k, v in kwargs.items() if k not in ('movement_speed',)},
        )
        state.combatants.append(c)
        return c

    @classmethod
    def remove_combatant(cls, session_id: str, combatant_id: str) -> bool:
        state = cls._active.get(session_id)
        if not state:
            return False
        before = len(state.combatants)
        state.combatants = [c for c in state.combatants if c.combatant_id != combatant_id]
        # Adjust index if needed
        active = state.active_combatants()
        if active:
            state.current_turn_index %= len(active)
        return len(state.combatants) < before

    # ── Initiative ──────────────────────────────────────────────────────────

    @classmethod
    def set_initiative(cls, session_id: str, combatant_id: str, value: float) -> bool:
        state = cls._active.get(session_id)
        if not state:
            return False
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                c.initiative = value
                if state.settings.auto_sort_initiative:
                    state.combatants.sort(
                        key=lambda x: (x.initiative or 0, x.initiative_modifier),
                        reverse=True,
                    )
                return True
        return False

    @classmethod
    def roll_initiative(cls, session_id: str, combatant_id: str) -> float | None:
        state = cls._active.get(session_id)
        if not state:
            return None
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                result = DiceEngine.roll('1d20')
                c.initiative = float(result.total + c.initiative_modifier)
                return c.initiative
        return None

    # ── Turn Management ─────────────────────────────────────────────────────

    @classmethod
    def next_turn(cls, session_id: str) -> dict | None:
        """Advance to next combatant. Reset their economy. Tick conditions."""
        state = cls._active.get(session_id)
        if not state or state.phase != CombatPhase.ACTIVE:
            return None

        active = state.active_combatants()
        if not active:
            return None

        state.current_turn_index = (state.current_turn_index + 1) % len(active)

        # New round — tick conditions and clear surprise
        if state.current_turn_index == 0:
            state.round_number += 1
            for c in state.combatants:
                c.conditions = [cond for cond in c.conditions if not cond.tick()]
                c.surprised = False  # surprise only lasts round 1

        # Reset current combatant's turn resources
        current = state.active_combatants()[state.current_turn_index]

        # Surprised combatants on round 1 lose their turn; loop in case several are consecutive
        if state.round_number == 1:
            checked = 0
            while checked < len(active) and current.surprised:
                current.surprised = False
                state.current_turn_index = (state.current_turn_index + 1) % len(active)
                current = state.active_combatants()[state.current_turn_index]
                checked += 1
        current.has_action = True
        current.has_bonus_action = True
        current.has_reaction = True
        current.movement_remaining = current.movement_speed

        return {
            'combatant_id': current.combatant_id,
            'name': current.name,
            'round_number': state.round_number,
        }

    @classmethod
    def end_turn(cls, session_id: str, combatant_id: str) -> bool:
        state = cls._active.get(session_id)
        if not state:
            return False
        current = state.get_current_combatant()
        if not current or current.combatant_id != combatant_id:
            return False
        cls.next_turn(session_id)
        return True

    # ── HP / Damage ─────────────────────────────────────────────────────────

    @classmethod
    def apply_damage(cls, session_id: str, combatant_id: str, amount: int,
                     damage_type: str = '', is_dm: bool = False) -> dict:
        state = cls._active.get(session_id)
        if not state:
            return {'error': 'no active combat'}
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            # Apply resistance / immunity / vulnerability
            dt = damage_type.lower()
            if dt and dt in c.damage_immunities:
                return {'new_hp': c.hp, 'temp_hp': c.temp_hp, 'absorbed': 0, 'defeated': c.is_defeated, 'immune': True}
            if dt and dt in c.damage_vulnerabilities:
                amount = amount * 2
            elif dt and dt in c.damage_resistances:
                amount = amount // 2
            # Temp HP absorbs first
            absorbed = min(c.temp_hp, amount)
            c.temp_hp -= absorbed
            actual = amount - absorbed
            c.hp = max(0, c.hp - actual)
            # Downed ≠ defeated when death saves are on — let roll_death_save handle it
            if c.hp == 0 and (not state.settings.death_saves_enabled or c.is_npc):
                c.is_defeated = True
            result: dict = {'new_hp': c.hp, 'temp_hp': c.temp_hp, 'absorbed': absorbed, 'defeated': c.is_defeated}
            # Concentration check on any damage taken
            if actual > 0 and c.concentration_spell:
                dc = max(10, math.ceil(actual / 2))
                con_roll = DiceEngine.roll('1d20').total
                if con_roll < dc:
                    result['concentration_broken'] = c.concentration_spell
                    c.concentration_spell = None
            return result
        return {'error': 'combatant not found'}

    @classmethod
    def apply_healing(cls, session_id: str, combatant_id: str, amount: int) -> dict:
        state = cls._active.get(session_id)
        if not state:
            return {'error': 'no active combat'}
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                c.hp = min(c.max_hp, c.hp + amount)
                c.is_defeated = c.hp <= 0
                return {'new_hp': c.hp}
        return {'error': 'not found'}

    # ── DM Overrides ────────────────────────────────────────────────────────

    @classmethod
    def dm_set_hp(cls, session_id: str, combatant_id: str, hp: int) -> bool:
        state = cls._active.get(session_id)
        if not state:
            return False
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                c.hp = max(0, min(c.max_hp, hp))
                c.is_defeated = c.hp <= 0
                return True
        return False

    @classmethod
    def dm_grant_resource(cls, session_id: str, combatant_id: str,
                          resource: str, amount: float = 1) -> bool:
        state = cls._active.get(session_id)
        if not state:
            return False
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            if resource == 'action':
                c.has_action = True
            elif resource == 'bonus_action':
                c.has_bonus_action = True
            elif resource == 'reaction':
                c.has_reaction = True
            elif resource == 'movement':
                c.movement_remaining += amount
            return True
        return False

    @classmethod
    def dm_revert_last_action(cls, session_id: str) -> bool:
        """Restore state_before snapshot from last logged action."""
        state = cls._active.get(session_id)
        if not state or not state.action_log:
            return False
        last = state.action_log.pop()
        if not last.state_before:
            return False
        # Restore the combatant snapshot
        snap = last.state_before
        for c in state.combatants:
            if c.combatant_id == snap.get('combatant_id'):
                c.hp = snap.get('hp', c.hp)
                c.temp_hp = snap.get('temp_hp', c.temp_hp)
                c.has_action = snap.get('has_action', c.has_action)
                c.has_bonus_action = snap.get('has_bonus_action', c.has_bonus_action)
                c.movement_remaining = snap.get('movement_remaining', c.movement_remaining)
                c.is_defeated = c.hp <= 0
                break
        return True

    @classmethod
    def log_action(cls, session_id: str, action: CombatAction):
        state = cls._active.get(session_id)
        if state:
            state.action_log.append(action)

    # ── Death Saves ─────────────────────────────────────────────────────────

    @classmethod
    def roll_death_save(cls, session_id: str, combatant_id: str) -> dict | None:
        """Roll 1d20 death saving throw for a downed combatant.
        Returns result dict or None if combatant not found / not downed."""
        state = cls._active.get(session_id)
        if not state or not state.settings.death_saves_enabled:
            return None
        for c in state.combatants:
            if c.combatant_id != combatant_id:
                continue
            if c.hp > 0:
                return None  # not downed
            roll = DiceEngine.roll('1d20').total
            if roll == 20:
                c.hp = 1
                c.is_defeated = False
                c.death_save_successes = 0
                c.death_save_failures = 0
                return {'roll': roll, 'result': 'stabilized', 'combatant_id': combatant_id}
            if roll == 1:
                c.death_save_failures += 2
            elif roll < 10:
                c.death_save_failures += 1
            else:
                c.death_save_successes += 1
            if c.death_save_failures >= 3:
                c.is_defeated = True
                return {'roll': roll, 'result': 'dead', 'combatant_id': combatant_id,
                        'successes': c.death_save_successes, 'failures': c.death_save_failures}
            if c.death_save_successes >= 3:
                c.death_save_successes = 0
                c.death_save_failures = 0
                return {'roll': roll, 'result': 'stable', 'combatant_id': combatant_id,
                        'successes': 3, 'failures': c.death_save_failures}
            return {'roll': roll, 'result': 'success' if roll >= 10 else 'failure',
                    'combatant_id': combatant_id,
                    'successes': c.death_save_successes, 'failures': c.death_save_failures}
        return None

    # ── Temp HP ─────────────────────────────────────────────────────────────

    @classmethod
    def set_temp_hp(cls, session_id: str, combatant_id: str, amount: int) -> dict | None:
        state = cls._active.get(session_id)
        if not state:
            return None
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                c.temp_hp = max(0, amount)
                return {'combatant_id': combatant_id, 'temp_hp': c.temp_hp}
        return None

    # ── Resistances ─────────────────────────────────────────────────────────

    @classmethod
    def set_resistances(cls, session_id: str, combatant_id: str,
                        resistances: list[str] | None = None,
                        vulnerabilities: list[str] | None = None,
                        immunities: list[str] | None = None) -> dict | None:
        state = cls._active.get(session_id)
        if not state:
            return None
        for c in state.combatants:
            if c.combatant_id == combatant_id:
                if resistances is not None:
                    c.damage_resistances = resistances
                if vulnerabilities is not None:
                    c.damage_vulnerabilities = vulnerabilities
                if immunities is not None:
                    c.damage_immunities = immunities
                return {
                    'combatant_id': combatant_id,
                    'damage_resistances': c.damage_resistances,
                    'damage_vulnerabilities': c.damage_vulnerabilities,
                    'damage_immunities': c.damage_immunities,
                }
        return None

    # ── Surprise ─────────────────────────────────────────────────────────────

    @classmethod
    def set_surprised(cls, session_id: str, combatant_ids: list[str], surprised: bool) -> dict | None:
        state = cls._active.get(session_id)
        if not state:
            return None
        updated = []
        for c in state.combatants:
            if c.combatant_id in combatant_ids:
                c.surprised = surprised
                updated.append(c.combatant_id)
        return {'updated': updated, 'surprised': surprised} if updated else None
