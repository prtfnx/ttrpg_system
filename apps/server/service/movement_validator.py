from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

from core_table.pathfinding import PathfindingSystem
from core_table.session_rules import SessionRules

if TYPE_CHECKING:
    pass


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

        # Build or accept path
        path = client_path
        if not path:
            if walls or obstacles:
                path = PathfindingSystem.find_path_astar(
                    from_pos, to_pos, walls, obstacles,
                    grid_size=table.grid_cell_px,
                    exclude_entity_id=entity_id,
                    grid_bounds=(table.width - 1, table.height - 1) if table.width > 0 else None,
                )
                if path is None:
                    return MovementResult(valid=False, reason="No clear path to destination")
            else:
                path = [from_pos, to_pos]

        # Wall collision along path segments
        if walls:
            for seg_start, seg_end in zip(path, path[1:]):
                if PathfindingSystem.is_path_blocked_by_walls(seg_start, seg_end, walls):
                    return MovementResult(valid=False, reason="Path blocked by wall")

        # Obstacle collision along path segments
        if obstacles:
            for seg_start, seg_end in zip(path, path[1:]):
                if PathfindingSystem.is_path_blocked_by_obstacles(
                    seg_start, seg_end, obstacles, entity_id
                ):
                    return MovementResult(valid=False, reason="Path blocked by obstacle")

        # Speed check (only when rules say so and combatant info is available)
        movement_cost = 0.0
        if self.rules.enforce_movement_speed and combatant is not None:
            # Sum cost of each segment in the actual path (accounts for detours)
            for seg_start, seg_end in zip(path, path[1:]):
                movement_cost += PathfindingSystem.get_movement_cost(
                    seg_start, seg_end,
                    grid_size=table.grid_cell_px,
                    diagonal_rule=self.rules.diagonal_movement_rule,
                )
            if movement_cost > combatant.movement_remaining:
                return MovementResult(
                    valid=False,
                    reason=(
                        f"Insufficient movement: need {movement_cost:.0f}ft, "
                        f"have {combatant.movement_remaining:.0f}ft"
                    ),
                )

        return MovementResult(valid=True, valid_path=path, movement_cost=movement_cost)
