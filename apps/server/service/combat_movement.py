"""Detached movement drafts for the combat command's acceptance transaction."""
from __future__ import annotations

import copy
import json
import math
from dataclasses import dataclass
from typing import Any

from core_table.table import VirtualTable
from database import models
from sqlalchemy.orm import Session
from utils.time import utc_now


@dataclass(frozen=True)
class CombatSpriteMovement:
    table_id: str
    sprite_id: str
    entity_id: int
    before: tuple[int, int]
    after: tuple[int, int]
    geometry_before: dict | None
    geometry_after: dict | None


def stage_combat_movements(db: Session, session_id: int, movements: tuple[CombatSpriteMovement, ...]) -> None:
    """Stage only movement-owned fields; caller owns commit and writer fencing."""
    for move in movements:
        table = db.query(models.VirtualTable).filter_by(
            table_id=move.table_id, session_id=session_id,
        ).with_for_update().one_or_none()
        if table is None:
            raise ValueError("Combat table does not belong to this session")
        entity = db.query(models.Entity).filter_by(
            table_id=table.id, sprite_id=move.sprite_id, entity_id=move.entity_id,
        ).with_for_update().one_or_none()
        if entity is None or (entity.position_x, entity.position_y) != move.before:
            raise ValueError("Combat token changed before acceptance; reload")
        if move.geometry_before != move.geometry_after:
            stored_geometry = json.loads(entity.obstacle_data) if entity.obstacle_data else None
            if stored_geometry != move.geometry_before:
                raise ValueError("Combat token geometry changed before acceptance; reload")
            entity.obstacle_data = json.dumps(move.geometry_after) if move.geometry_after is not None else None
        entity.position_x, entity.position_y = move.after
        table.updated_at = utc_now()
        # A later movement in the same batch must see the staged predecessor,
        # including when the session factory disables autoflush.
        db.flush()


class CombatMovementDraft:
    """Validate/move against a private table and publish only after acceptance.

    The protocol must hold its session lock and the table's write lock for this
    object's entire lifetime. No database session or live entity enters a worker.
    """

    def __init__(self, table: VirtualTable):
        self.live = table
        self.table = copy.deepcopy(table)
        self._movements: list[CombatSpriteMovement] = []

    def lookup(self, table_id: str) -> VirtualTable | None:
        return self.table if str(self.table.table_id) == table_id else None

    async def move(
        self, table_id: str, sprite_id: str, _old_position: dict[str, float],
        new_position: dict[str, float], _session_code: str, *, allow_out_of_bounds: bool,
    ) -> dict[str, Any]:
        table = self.lookup(table_id)
        entity = table.find_entity_by_sprite_id(sprite_id) if table else None
        if table is None or entity is None or entity.entity_id is None:
            return {"success": False, "message": "Combat token not found on its table"}
        values = (new_position.get("x"), new_position.get("y"))
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool)
                   and math.isfinite(value) for value in values):
            return {"success": False, "message": "Invalid combat position"}
        target = (int(new_position["x"]), int(new_position["y"]))
        if not allow_out_of_bounds and not table.is_valid_position(target):
            return {"success": False, "message": "Outside table bounds"}
        before = entity.position
        geometry_before = copy.deepcopy(entity.obstacle_data)
        try:
            table.move_entity(entity.entity_id, target, allow_out_of_bounds=allow_out_of_bounds)
        except ValueError as exc:
            return {"success": False, "message": str(exc)}
        self._movements.append(CombatSpriteMovement(
            table_id, sprite_id, entity.entity_id, before, entity.position,
            geometry_before, copy.deepcopy(entity.obstacle_data),
        ))
        return {"success": True, "from": {"x": before[0], "y": before[1]},
                "to": {"x": entity.position[0], "y": entity.position[1]}}

    def effects(self) -> tuple[CombatSpriteMovement, ...]:
        return copy.deepcopy(tuple(self._movements))

    def publish(self) -> None:
        # Preserve live table/entity references and fields owned by other
        # domains. Replay only the already validated, committed movements.
        for move in self._movements:
            self.live.move_entity(move.entity_id, move.after, allow_out_of_bounds=True)
