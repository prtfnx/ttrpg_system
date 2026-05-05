from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from core_table.combat import Combatant, CombatState
from core_table.dice import DiceEngine, DiceRollResult
from core_table.session_rules import SessionRules

if TYPE_CHECKING:
    from core_table.table import VirtualTable


@dataclass
class AttackResult:
    hit: bool
    is_critical: bool = False
    is_fumble: bool = False
    attack_roll: Optional[DiceRollResult] = None
    damage_roll: Optional[DiceRollResult] = None
    damage_dealt: int = 0
    reason: str = ""


@dataclass
class SaveResult:
    success: bool
    roll: Optional[DiceRollResult] = None
    dc: int = 0


INCAPACITATING_COND = {'paralyzed', 'unconscious'}


class AttackResolver:
    def __init__(self, rules: SessionRules):
        self.rules = rules

    def resolve_attack(
        self, attacker: Combatant, target: Combatant,
        attack_bonus: int, damage_formula: str,
        damage_type: str = 'bludgeoning',
        advantage: bool = False, disadvantage: bool = False,
        combat: Optional[CombatState] = None,
        attack_type: str = 'melee',
        table: Optional['VirtualTable'] = None,
    ) -> AttackResult:
        # Advantage/disadvantage from conditions
        conds = attacker.condition_types()
        target_conds = target.condition_types()
        if 'poisoned' in conds or 'frightened' in conds:
            disadvantage = True
        if 'blinded' in conds:
            disadvantage = True
        if 'invisible' in conds:
            advantage = True
        # Prone: melee has advantage, ranged has disadvantage
        if 'prone' in target_conds:
            advantage = True  # simplified: assume melee

        # Ranged attack in melee: auto-disadvantage when hostile adjacent
        if attack_type == 'ranged' and combat is not None and table is not None:
            if self._has_adjacent_hostile(attacker, combat, table):
                disadvantage = True

        # Cover AC bonus (applies to target's effective AC)
        cover_ac = 0
        if table is not None and getattr(self.rules, 'enforce_cover', True):
            attacker_sprite = table.sprite_to_entity.get(str(getattr(attacker, 'entity_id', '')))
            target_sprite = table.sprite_to_entity.get(str(getattr(target, 'entity_id', '')))
            if attacker_sprite is not None and target_sprite is not None:
                ae = table.entities.get(attacker_sprite)
                te = table.entities.get(target_sprite)
                if ae and te:
                    a_pos = (float(ae.position[0]), float(ae.position[1]))
                    t_pos = (float(te.position[0]), float(te.position[1]))
                    cover = AttackResolver.resolve_cover(a_pos, t_pos, table)
                    cover_ac = {'half': 2, 'three_quarters': 5, 'full': 999}.get(cover, 0)
                    if cover_ac == 999:
                        return AttackResult(hit=False, reason="Target has full cover")

        effective_ac = target.armor_class + cover_ac

        # Roll attack
        formula = f'1d20+{attack_bonus}' if attack_bonus >= 0 else f'1d20{attack_bonus}'
        if advantage and not disadvantage:
            roll = DiceEngine.roll_with_advantage(formula)
        elif disadvantage and not advantage:
            roll = DiceEngine.roll_with_disadvantage(formula)
        else:
            roll = DiceEngine.roll(formula)

        if roll.is_fumble and not (advantage and not disadvantage):
            return AttackResult(hit=False, is_fumble=True, attack_roll=roll, reason="Natural 1")

        hit = roll.is_critical or (roll.total >= effective_ac)
        if not hit:
            return AttackResult(hit=False, attack_roll=roll, reason=f"Miss ({roll.total} vs AC {effective_ac})")

        # Incapacitated targets: crits at melee
        is_crit = roll.is_critical or any(t in target_conds for t in INCAPACITATING_COND)
        dmg_roll = DiceEngine.roll(damage_formula)
        if is_crit:
            dmg_roll = DiceEngine.apply_critical(dmg_roll, self.rules.critical_hit_rule)

        return AttackResult(
            hit=True, is_critical=is_crit, attack_roll=roll,
            damage_roll=dmg_roll, damage_dealt=max(0, dmg_roll.total),
        )

    def resolve_saving_throw(
        self, combatant: Combatant, ability: str, dc: int,
        bonus: int = 0
    ) -> SaveResult:
        roll = DiceEngine.roll(f'1d20+{bonus}')
        return SaveResult(success=roll.total >= dc, roll=roll, dc=dc)

    @staticmethod
    def resolve_cover(attacker_pos: tuple, target_pos: tuple, table: 'VirtualTable') -> str:
        """Return cover tier ('none'|'half'|'three_quarters'|'full') from cover zones on the table."""
        zones = getattr(table, 'cover_zones', [])
        if not zones:
            return 'none'
        tier_order = {'none': 0, 'half': 1, 'three_quarters': 2, 'full': 3}
        best = 'none'
        ax, ay = attacker_pos
        tx, ty = target_pos
        for zone in zones:
            if _los_blocked_by_zone(ax, ay, tx, ty, zone):
                if tier_order.get(zone.cover_tier, 0) > tier_order.get(best, 0):
                    best = zone.cover_tier
        return best

    @staticmethod
    def _has_adjacent_hostile(attacker: Combatant, combat: CombatState, table: 'VirtualTable') -> bool:
        """Return True if any active hostile is within 5ft (1 cell) of attacker."""
        grid = getattr(table, 'grid_cell_px', 50.0)
        reach = grid * 1.5  # diagonal adjacency threshold
        a_sprite = table.sprite_to_entity.get(str(getattr(attacker, 'entity_id', '')))
        if a_sprite is None:
            return False
        ae = table.entities.get(a_sprite)
        if ae is None:
            return False
        ax, ay = float(ae.position[0]), float(ae.position[1])
        for c in combat.combatants:
            if c.entity_id == attacker.entity_id or c.is_defeated:
                continue
            s = table.sprite_to_entity.get(str(c.entity_id))
            if s is None:
                continue
            ent = table.entities.get(s)
            if ent is None:
                continue
            dist = math.hypot(float(ent.position[0]) - ax, float(ent.position[1]) - ay)
            if dist <= reach:
                return True
        return False


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _seg_intersect(ax, ay, bx, by, cx, cy, dx, dy) -> bool:
    """Return True if segment AB intersects segment CD."""
    def cross(ox, oy, px, py, qx, qy):
        return (px - ox) * (qy - oy) - (py - oy) * (qx - ox)
    d1 = cross(cx, cy, dx, dy, ax, ay)
    d2 = cross(cx, cy, dx, dy, bx, by)
    d3 = cross(ax, ay, bx, by, cx, cy)
    d4 = cross(ax, ay, bx, by, dx, dy)
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True
    return False


def _los_blocked_by_zone(ax, ay, tx, ty, zone) -> bool:
    """Return True if zone intersects the LOS segment from attacker to target."""
    st = zone.shape_type
    c = zone.coords
    if st == 'rect' and len(c) == 4:
        x, y, w, h = c
        edges = [
            (x, y, x + w, y),
            (x + w, y, x + w, y + h),
            (x + w, y + h, x, y + h),
            (x, y + h, x, y),
        ]
        return any(_seg_intersect(ax, ay, tx, ty, *e) for e in edges)
    elif st == 'circle' and len(c) == 3:
        cx, cy, r = c
        # Closest point on LOS segment to circle center
        dx, dy = tx - ax, ty - ay
        seg_len_sq = dx * dx + dy * dy
        if seg_len_sq == 0:
            return math.hypot(ax - cx, ay - cy) <= r
        t = max(0.0, min(1.0, ((cx - ax) * dx + (cy - ay) * dy) / seg_len_sq))
        closest_x = ax + t * dx
        closest_y = ay + t * dy
        return math.hypot(closest_x - cx, closest_y - cy) <= r
    elif st == 'polygon' and len(c) >= 3:
        pts = c
        for i in range(len(pts)):
            px1, py1 = pts[i]
            px2, py2 = pts[(i + 1) % len(pts)]
            if _seg_intersect(ax, ay, tx, ty, px1, py1, px2, py2):
                return True
    return False
