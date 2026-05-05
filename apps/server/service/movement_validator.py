from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

from core_table.pathfinding import PathfindingSystem, SpatialHashGrid
from core_table.session_rules import SessionRules

if TYPE_CHECKING:
    from core_table.combat import CombatState


@dataclass
class Combatant:
    entity_id: str
    movement_remaining: float  # feet


@dataclass
class MovementResult:
    valid: bool
    reason: str = ""
    valid_path: list = field(default_factory=list)
    movement_cost: float = 0.0
    opportunity_attack_triggers: list = field(default_factory=list)


class MovementValidator:
    """Server-side movement validation using active SessionRules and table state."""

    def __init__(self, rules: SessionRules):
        self.rules = rules

    def validate(
        self,
        entity_id: str,
        from_pos: tuple,
        to_pos: tuple,
        table,                              # VirtualTable
        combatant: Optional[Combatant] = None,
        client_path: Optional[list] = None,
    ) -> MovementResult:
        # Table bounds: table uses grid cells, positions are pixel coords
        if getattr(self.rules, 'movement_mode', 'cell') == 'cell':
            to_pos = self._snap_to_cell(to_pos, table.grid_cell_px)
        if table.width > 0 and table.height > 0:
            max_x = table.width * table.grid_cell_px
            max_y = table.height * table.grid_cell_px
            tx, ty = to_pos
            if not (0 <= tx <= max_x and 0 <= ty <= max_y):
                return MovementResult(valid=False, reason="Outside table bounds")

        walls = []
        if self.rules.walls_block_movement:
            walls = [
                w for w in table.walls.values()
                if hasattr(w, 'blocks_movement') and w.blocks_movement
            ]

        obstacles = []
        if self.rules.obstacles_block_movement:
            obstacles = [
                e for e in table.entities.values()
                if getattr(e, 'layer', None) == 'obstacles'
                and str(getattr(e, 'entity_id', '')) != str(entity_id)
            ]

        # Build spatial hash once for all collision checks
        sh = SpatialHashGrid.build(walls, obstacles, table.grid_cell_px) if walls or obstacles else None

        # Build or accept path
        path = client_path
        if not path:
            if walls or obstacles:
                # Fast path: if direct line of sight is clear, skip expensive A*
                direct_blocked = False
                if walls and PathfindingSystem.is_path_blocked_by_walls(from_pos, to_pos, walls, sh):
                    direct_blocked = True
                if not direct_blocked and obstacles and PathfindingSystem.is_path_blocked_by_obstacles(
                    from_pos, to_pos, obstacles, entity_id, sh
                ):
                    direct_blocked = True

                if direct_blocked:
                    path = PathfindingSystem.find_path_astar(
                        from_pos, to_pos, walls, obstacles,
                        grid_size=table.grid_cell_px,
                        exclude_entity_id=entity_id,
                        grid_bounds=(table.width - 1, table.height - 1) if table.width > 0 else None,
                        spatial_hash=sh,
                    )
                    if path is None:
                        return MovementResult(valid=False, reason="No clear path to destination")
                else:
                    path = [from_pos, to_pos]
            else:
                path = [from_pos, to_pos]

        # Wall collision along path segments
        if walls:
            for seg_start, seg_end in zip(path, path[1:]):
                if PathfindingSystem.is_path_blocked_by_walls(seg_start, seg_end, walls, sh):
                    return MovementResult(valid=False, reason="Path blocked by wall")

        # Obstacle collision along path segments
        if obstacles:
            for seg_start, seg_end in zip(path, path[1:]):
                if PathfindingSystem.is_path_blocked_by_obstacles(
                    seg_start, seg_end, obstacles, entity_id, sh
                ):
                    return MovementResult(valid=False, reason="Path blocked by obstacle")

        # Speed check (only when rules say so and combatant info is available)
        movement_cost = 0.0
        if self.rules.enforce_movement_speed and combatant is not None:
            difficult = getattr(table, 'difficult_terrain_cells', set())
            # Sum cost of each segment in the actual path (accounts for detours)
            for seg_start, seg_end in zip(path, path[1:]):
                seg_cost = PathfindingSystem.get_movement_cost(
                    seg_start, seg_end,
                    grid_size=table.grid_cell_px,
                    diagonal_rule=self.rules.diagonal_movement_rule,
                )
                if difficult and getattr(self.rules, 'enforce_difficult_terrain', True):
                    # Mid-point cell of segment determines terrain type
                    mid_x = (seg_start[0] + seg_end[0]) / 2
                    mid_y = (seg_start[1] + seg_end[1]) / 2
                    cell = (int(mid_x // table.grid_cell_px), int(mid_y // table.grid_cell_px))
                    if cell in difficult:
                        seg_cost *= 2
                movement_cost += seg_cost
            if movement_cost > combatant.movement_remaining:
                return MovementResult(
                    valid=False,
                    reason=(
                        f"Insufficient movement: need {movement_cost:.0f}ft, "
                        f"have {combatant.movement_remaining:.0f}ft"
                    ),
                )

        return MovementResult(valid=True, valid_path=path, movement_cost=movement_cost)

    def check_opportunity_attacks(
        self, entity_id: str, from_pos: tuple, table, combat_state: Optional['CombatState'],
        to_pos: Optional[tuple] = None,
    ) -> list[dict]:
        """Return OA triggers: combatants within reach at from_pos but NOT at to_pos.
        Only fires when the mover actually leaves reach (D&D 5e rule)."""
        if combat_state is None or not getattr(self.rules, 'opportunity_attacks_enabled', True):
            return []
        grid = table.grid_cell_px
        reach = grid * 1.5  # covers diagonal adjacency
        triggers = []
        for c in combat_state.combatants:
            if str(c.entity_id) == str(entity_id) or c.is_defeated or not c.has_reaction:
                continue
            sprite_key = table.sprite_to_entity.get(str(c.entity_id))
            if sprite_key is None:
                continue
            ent = table.entities.get(sprite_key)
            if ent is None:
                continue
            ex, ey = float(ent.position[0]), float(ent.position[1])
            dist_from = math.hypot(ex - from_pos[0], ey - from_pos[1])
            if dist_from > reach:
                continue  # wasn't adjacent to start with
            # Only trigger if the mover leaves reach at the destination
            if to_pos is not None:
                dist_to = math.hypot(ex - to_pos[0], ey - to_pos[1])
                if dist_to <= reach:
                    continue  # still adjacent — no OA
            triggers.append({
                'combatant_id': c.combatant_id,
                'name': c.name,
                'controlled_by': getattr(c, 'controlled_by', None),
            })
        return triggers

    # ── Helpers ───────────────────────────────────────────────────────────

    def _snap_to_cell(self, pos: tuple, grid: float) -> tuple:
        """Snap pixel position to nearest grid cell center."""

        return (
            math.floor(pos[0] / grid) * grid + grid / 2,
            math.floor(pos[1] / grid) * grid + grid / 2,
        )

    def _get_walls_and_obstacles(self, entity_id: str, table) -> tuple[list, list]:
        walls = []
        if self.rules.walls_block_movement:
            walls = [
                w for w in table.walls.values()
                if hasattr(w, 'blocks_movement') and w.blocks_movement
            ]
        obstacles = []
        if self.rules.obstacles_block_movement:
            obstacles = [
                e for e in table.entities.values()
                if getattr(e, 'layer', None) == 'obstacles'
                and str(getattr(e, 'entity_id', '')) != str(entity_id)
            ]
        return walls, obstacles

    def validate_lightweight(
        self,
        entity_id: str,
        from_pos: tuple,
        to_pos: tuple,
        table,
        combatant: 'Combatant | None' = None,
        client_path: 'list | None' = None,
    ) -> MovementResult:
        """Segment-only validation: no A*, no pathfinding — fast enough for Render free tier.

        Checks:
        1. Table bounds
        2. Each path segment vs walls/obstacles (direct intersection only)
        3. Optionally enforces movement speed if combatant provided
        """
        grid = table.grid_cell_px
        if getattr(self.rules, 'movement_mode', 'cell') == 'cell':
            to_pos = self._snap_to_cell(to_pos, grid)

        if table.width > 0 and table.height > 0:
            max_x, max_y = table.width * grid, table.height * grid
            if not (0 <= to_pos[0] <= max_x and 0 <= to_pos[1] <= max_y):
                return MovementResult(valid=False, reason="Outside table bounds")

        walls, obstacles = self._get_walls_and_obstacles(entity_id, table)
        sh = SpatialHashGrid.build(walls, obstacles, grid) if walls or obstacles else None
        path = client_path or [from_pos, to_pos]

        for seg_start, seg_end in zip(path, path[1:]):
            if walls and PathfindingSystem.is_path_blocked_by_walls(seg_start, seg_end, walls, sh):
                return MovementResult(valid=False, reason="Path crosses a wall")
            if obstacles and PathfindingSystem.is_path_blocked_by_obstacles(seg_start, seg_end, obstacles, entity_id, sh):
                return MovementResult(valid=False, reason="Path blocked by obstacle")

        movement_cost = 0.0
        if self.rules.enforce_movement_speed and combatant is not None:
            difficult = getattr(table, 'difficult_terrain_cells', set())
            for seg_start, seg_end in zip(path, path[1:]):
                seg_cost = PathfindingSystem.get_movement_cost(
                    seg_start, seg_end, grid_size=grid,
                    diagonal_rule=self.rules.diagonal_movement_rule,
                )
                if difficult:
                    mid_x = (seg_start[0] + seg_end[0]) / 2
                    mid_y = (seg_start[1] + seg_end[1]) / 2
                    cell = (int(mid_x // grid), int(mid_y // grid))
                    if cell in difficult:
                        seg_cost *= 2
                movement_cost += seg_cost
            if movement_cost > combatant.movement_remaining:
                return MovementResult(valid=False, reason=f"Insufficient movement: need {movement_cost:.0f}ft")

        return MovementResult(valid=True, valid_path=path, movement_cost=movement_cost)
