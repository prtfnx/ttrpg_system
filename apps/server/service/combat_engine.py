import logging
import math
import random
import time
import uuid

from core_table.combat import (
    CombatAction,
    Combatant,
    CombatPhase,
    CombatSettings,
    CombatState,
)
from core_table.combat_fsm import CombatFSM
from core_table.dice import DiceEngine
from core_table.session_rules import SessionRules
from .spell_resolver import SpellResolver

logger = logging.getLogger(__name__)


class CombatEngine:
    """Server-authoritative combat orchestrator. One per active combat."""

    # session_code → CombatState (in-memory; persisted to DB on round/end)
    _active: dict[str, CombatState] = {}

    # ── Persistence ─────────────────────────────────────────────────────────

    @classmethod
    def persist(cls, session_id: str) -> None:
        """Synchronously snapshot the current combat state to the DB."""
        state = cls._active.get(session_id)
        if not state:
            return
        try:
            from database.crud import upsert_combat_encounter
            from database.database import SessionLocal
            with SessionLocal() as db:
                upsert_combat_encounter(db, session_id, state.to_dict())
        except Exception as exc:  # never let persistence crash combat
            logger.warning('Failed to persist combat state: %s', exc)

    @classmethod
    def restore(cls, session_id: str) -> CombatState | None:
        """Restore combat from DB if not already in memory."""
        if session_id in cls._active:
            return cls._active[session_id]
        try:
            from database.crud import load_active_combat_encounter
            from database.database import SessionLocal
            with SessionLocal() as db:
                data = load_active_combat_encounter(db, session_id)
            if not data:
                return None
            state = CombatState.from_dict(data)
            cls._active[session_id] = state
            logger.info('Restored combat %s from DB for session %s', state.combat_id, session_id)
            return state
        except Exception as exc:
            logger.warning('Failed to restore combat state: %s', exc)
            return None

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
        cls.persist(session_id)
        return state

    @classmethod
    def end_combat(cls, session_id: str) -> CombatState | None:
        state = cls._active.pop(session_id, None)
        if state:
            state.phase = CombatPhase.ENDED
            try:
                from database.crud import mark_combat_encounter_ended
                from database.database import SessionLocal
                with SessionLocal() as db:
                    mark_combat_encounter_ended(db, state.combat_id)
            except Exception as exc:
                logger.warning('Failed to mark combat ended: %s', exc)
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
        current.is_dodging = False
        current.is_disengaging = False
        current.attacks_used_this_action = 0

        # Persist on every new round (not every single turn to reduce DB writes)
        if state.current_turn_index == 0:
            cls.persist(session_id)

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
            # Concentration saving throw (Con save, DC = max(10, damage/2))
            if actual > 0 and c.concentration_spell:
                dc = max(10, math.ceil(actual / 2))
                raw = DiceEngine.roll('1d20').total
                con_roll = raw + c.constitution_modifier
                if con_roll < dc:
                    result['concentration_broken'] = c.concentration_spell
                    c.concentration_spell = None
                else:
                    result['concentration_saved'] = c.concentration_spell
                result['concentration_roll'] = {'raw': raw, 'modifier': c.constitution_modifier, 'total': con_roll, 'dc': dc}
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

    # ── Player Action Execution ─────────────────────────────────────────────

    @classmethod
    def execute_attack(
        cls,
        session_id: str,
        attacker_id: str,
        target_id: str,
        attack_bonus: int,
        damage_formula: str,
        damage_type: str,
        attack_type: str = 'melee',
        weapon_range_ft: float = 5.0,
        table=None,
        rules=None,
    ) -> dict:
        """Resolve an attack server-authoritatively. Returns result dict."""
        from service.attack_resolver import AttackResolver
        from core_table.session_rules import SessionRules

        state = cls._active.get(session_id)
        if not state:
            return {'error': 'No active combat'}

        attacker = next((c for c in state.combatants if c.combatant_id == attacker_id), None)
        target = next((c for c in state.combatants if c.combatant_id == target_id), None)
        if not attacker or not target:
            return {'error': 'Combatant not found'}
        if target.is_defeated:
            return {'error': 'Target is already defeated'}
        if not attacker.has_action and attacker.attacks_used_this_action >= attacker.attacks_per_action:
            return {'error': 'No action remaining'}

        # Range check using entity positions
        if table is not None:
            range_err = cls._check_range(state, attacker, target, weapon_range_ft, table)
            if range_err:
                return {'error': range_err}

        rules = rules or SessionRules.defaults(session_id)
        resolver = AttackResolver(rules)

        # Snapshot for undo
        state_before = {
            'combatant_id': target_id,
            'hp': target.hp, 'temp_hp': target.temp_hp,
            'is_defeated': target.is_defeated,
            'concentration_spell': target.concentration_spell,
        }
        attacker_before = {
            'combatant_id': attacker_id,
            'has_action': attacker.has_action,
            'attacks_used_this_action': attacker.attacks_used_this_action,
        }

        result = resolver.resolve_attack(
            attacker, target,
            attack_bonus=attack_bonus,
            damage_formula=damage_formula,
            damage_type=damage_type,
            attack_type=attack_type,
            table=table,
            combat=state,
        )

        damage_result: dict = {}
        if result.hit:
            damage_result = cls.apply_damage(session_id, target_id, result.damage_dealt, damage_type)

        # Consume action after all attacks used
        attacker.attacks_used_this_action += 1
        if attacker.attacks_used_this_action >= attacker.attacks_per_action:
            attacker.has_action = False

        # Log for audit / undo
        action = CombatAction(
            action_id=str(uuid.uuid4()),
            combat_id=state.combat_id,
            round_number=state.round_number,
            turn_index=state.current_turn_index,
            actor_id=attacker_id,
            action_type='attack',
            action_cost='action',
            target_ids=[target_id],
            rolls=[{'attack': result.attack_roll.total if result.attack_roll else None,
                    'damage': result.damage_dealt}],
            outcome='hit' if result.hit else 'miss',
            damage_dealt=result.damage_dealt,
            state_before={**state_before, **attacker_before},
            timestamp=time.time(),
        )
        state.action_log.append(action)

        return {
            'hit': result.hit,
            'is_critical': result.is_critical,
            'is_fumble': result.is_fumble,
            'attack_roll': result.attack_roll.total if result.attack_roll else None,
            'damage_roll': result.damage_dealt,
            'damage_dealt': result.damage_dealt,
            'reason': result.reason,
            **damage_result,
        }

    @classmethod
    def execute_utility(cls, session_id: str, combatant_id: str, action_type: str) -> dict:
        """Handle dash/dodge/disengage utility actions."""
        state = cls._active.get(session_id)
        if not state:
            return {'error': 'No active combat'}
        c = next((x for x in state.combatants if x.combatant_id == combatant_id), None)
        if not c:
            return {'error': 'Combatant not found'}
        if not c.has_action:
            return {'error': 'No action remaining'}

        c.has_action = False
        if action_type == 'dash':
            c.movement_remaining += c.movement_speed
        elif action_type == 'dodge':
            c.is_dodging = True
        elif action_type == 'disengage':
            c.is_disengaging = True

        action = CombatAction(
            action_id=str(uuid.uuid4()),
            combat_id=state.combat_id,
            round_number=state.round_number,
            turn_index=state.current_turn_index,
            actor_id=combatant_id,
            action_type=action_type,
            action_cost='action',
            outcome=action_type,
            timestamp=time.time(),
        )
        state.action_log.append(action)
        return {'action_type': action_type, 'combatant_id': combatant_id}

    @staticmethod
    def _check_range(state: CombatState, attacker: Combatant, target: Combatant,
                     range_ft: float, table) -> str | None:
        """Return an error string if target is out of range, else None."""
        atk_sprite = table.sprite_to_entity.get(str(attacker.entity_id))
        tgt_sprite = table.sprite_to_entity.get(str(target.entity_id))
        ae = table.entities.get(atk_sprite) if atk_sprite else None
        te = table.entities.get(tgt_sprite) if tgt_sprite else None
        if ae is None or te is None:
            return None  # can't determine; allow
        ft_per_unit = getattr(table, 'ft_per_unit', 1.0)
        dist_px = math.hypot(te.position[0] - ae.position[0], te.position[1] - ae.position[1])
        dist_ft = dist_px * ft_per_unit
        # 5-ft grid tolerance (half-diagonal of a square)
        if dist_ft > range_ft + 2.5:
            return f'Target out of range ({dist_ft:.0f} ft > {range_ft:.0f} ft)'
        return None

    @classmethod
    def execute_spell(
        cls,
        session_id: str,
        caster_id: str,
        spell_name: str,
        spell_level: int,
        target_ids: list,
        damage_formula: str = "",
        save_ability: str = "",
        save_dc: int = 0,
        damage_type: str = "fire",
        requires_attack_roll: bool = False,
        attack_bonus: int = 0,
        is_concentration: bool = False,
    ) -> dict:
        state = cls._active.get(session_id)
        if not state:
            return {'error': 'No active combat'}
        caster = next((x for x in state.combatants if x.combatant_id == caster_id), None)
        if not caster:
            return {'error': 'Combatant not found'}
        if not caster.has_action:
            return {'error': 'No action remaining'}

        targets = [x for x in state.combatants if x.combatant_id in target_ids]
        resolver = SpellResolver(state.settings.rules if hasattr(state.settings, 'rules') else SessionRules(session_id=session_id))
        result = resolver.resolve_spell(
            caster, spell_name, spell_level, targets,
            damage_formula=damage_formula, save_ability=save_ability,
            save_dc=save_dc, damage_type=damage_type,
            requires_attack_roll=requires_attack_roll, attack_bonus=attack_bonus,
        )

        if not result.success:
            return {'error': result.reason}

        caster.has_action = False
        if is_concentration:
            caster.concentration_spell = spell_name

        # Apply damage to targets
        conc_results = []
        for dr in result.damage_results:
            if dr['damage'] > 0:
                conc = cls.apply_damage(session_id, dr['target_id'], dr['damage'])
                conc_results.append(conc)

        action = CombatAction(
            action_id=str(uuid.uuid4()),
            combat_id=state.combat_id,
            round_number=state.round_number,
            turn_index=state.current_turn_index,
            actor_id=caster_id,
            action_type='spell',
            action_cost='action',
            outcome=spell_name,
            timestamp=time.time(),
        )
        state.action_log.append(action)
        return {
            'spell': spell_name,
            'slot_used': result.slot_used,
            'slots_remaining': caster.spell_slots.get(spell_level, 0),
            'targets_hit': result.targets_hit,
            'damage_results': result.damage_results,
            'concentration_effects': conc_results,
        }

    @classmethod
    def restore_spell_slot(cls, session_id: str, combatant_id: str, slot_level: int) -> dict:
        state = cls._active.get(session_id)
        if not state:
            return {'error': 'No active combat'}
        c = next((x for x in state.combatants if x.combatant_id == combatant_id), None)
        if not c:
            return {'error': 'Combatant not found'}
        max_slots = c.spell_slots_max.get(slot_level, 0)
        if max_slots == 0:
            return {'error': f'Combatant has no level-{slot_level} spell slots'}
        c.spell_slots[slot_level] = min(max_slots, c.spell_slots.get(slot_level, 0) + 1)
        return {'combatant_id': combatant_id, 'slot_level': slot_level, 'slots_remaining': c.spell_slots[slot_level]}

