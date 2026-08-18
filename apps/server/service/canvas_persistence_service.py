"""Thread-ready persistence helpers for canvas protocol fallbacks."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from core_table.session_rules import SessionRules
from database import crud, models, schemas
from database.database import SessionLocal


@dataclass(frozen=True)
class TableHydration:
    walls: list[dict[str, Any]]
    layer_settings: dict[str, Any]
    paint_strokes: list[dict[str, Any]]


def count_controlled_sprites(session_id: int, user_id: int) -> int:
    """Count exact controller membership within one authoritative session."""
    with SessionLocal() as db:
        candidates = (
            db.query(models.Entity.controlled_by)
            .join(models.VirtualTable, models.Entity.table_id == models.VirtualTable.id)
            .filter(
                models.VirtualTable.session_id == session_id,
                models.Entity.controlled_by.isnot(None),
                models.Entity.controlled_by.contains(str(user_id)),
            )
            .all()
        )
    count = 0
    for (raw_controllers,) in candidates:
        try:
            controllers = json.loads(raw_controllers or "[]")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(controllers, list) and user_id in controllers:
            count += 1
    return count


def load_movement_policy(session_code: str) -> tuple[SessionRules | None, str]:
    """Load movement rules using a worker-owned SQLAlchemy session."""
    with SessionLocal() as db:
        rules_json = crud.get_session_rules_json(db, session_code)
        game_mode = crud.get_game_mode(db, session_code)
    if not rules_json or rules_json == "{}":
        return None, game_mode
    rules_data = json.loads(rules_json)
    rules_data.setdefault("session_id", session_code)
    return SessionRules.from_dict(rules_data), game_mode


def load_entity_character_id(sprite_id: str) -> str | None:
    """Resolve a token's durable character link without exposing an ORM row."""
    with SessionLocal() as db:
        value = db.query(models.Entity.character_id).filter(
            models.Entity.sprite_id == sprite_id
        ).scalar()
    return str(value) if value else None


def load_table_hydration(table_id: str) -> TableHydration:
    """Load join-time table fallbacks in one short worker transaction."""
    with SessionLocal() as db:
        walls = [
            wall.to_dict()
            for wall in db.query(models.Wall).filter(models.Wall.table_id == table_id).all()
        ]
        table = crud.get_virtual_table_by_id(db, table_id)
        layer_settings: dict[str, Any] = {}
        if table and table.layer_settings:
            parsed = json.loads(table.layer_settings)
            if isinstance(parsed, dict):
                layer_settings = parsed
        paint_strokes = [
            stroke.to_dict()
            for stroke in crud.get_paint_strokes_for_table(db, table_id)
        ]
    return TableHydration(walls, layer_settings, paint_strokes)


def persist_table_settings(table_id: str, settings: dict[str, Any]) -> bool:
    """Persist validated table settings using a worker-owned session."""
    with SessionLocal() as db:
        update = schemas.VirtualTableUpdate(**settings)
        return crud.update_virtual_table(db, table_id, update) is not None
