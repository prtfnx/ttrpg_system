"""Thread-ready persistence helpers for character protocol side effects."""

from __future__ import annotations

from dataclasses import dataclass

from database.database import SessionLocal
from database.models import CharacterLog, Entity, VirtualTable
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class TokenStatUpdate:
    sprite_id: str
    table_id: str
    layer: str


def record_xp_award(
    *,
    character_id: str,
    session_id: int,
    user_id: int,
    amount: int,
    source: str,
    description: str,
) -> None:
    """Write the non-authoritative XP audit log in a worker-owned session."""
    with SessionLocal() as db:
        db.add(CharacterLog(
            character_id=character_id,
            session_id=session_id,
            action_type="xp_award",
            description=f"+{amount} XP from {source}"
            + (f": {description}" if description else ""),
            user_id=user_id,
        ))
        db.commit()


def persist_character_token_stats(
    session_id: int,
    character_id: str,
    updated_stats: dict[str, object],
) -> list[TokenStatUpdate]:
    """Persist linked-token stats and return detached identities and visibility."""
    with SessionLocal() as db:
        updates = stage_character_token_stats(db, session_id, character_id, updated_stats)
        db.commit()
    return updates


def stage_character_token_stats(
    db: Session,
    session_id: int,
    character_id: str,
    updated_stats: dict[str, object],
) -> list[TokenStatUpdate]:
    """Flush linked-token projections without committing a caller's transaction.

    The caller validates stat values, owns source/version acceptance, and must
    not install or publish these provisional identities before its commit.
    """
    if not updated_stats.keys() <= {"hp", "max_hp", "ac"}:
        raise ValueError("Linked stat projection can only change HP, max HP, and AC")
    if not updated_stats:
        return []
    rows = (
        db.query(Entity, VirtualTable.table_id)
        .join(VirtualTable, Entity.table_id == VirtualTable.id)
        .filter(VirtualTable.session_id == session_id, Entity.character_id == character_id)
        .order_by(Entity.id)
        .with_for_update(of=Entity)
        .all()
    )
    updates = []
    for entity, public_table_id in rows:
        for field, value in updated_stats.items():
            setattr(entity, field, value)
        updates.append(TokenStatUpdate(
            sprite_id=str(entity.sprite_id), table_id=str(public_table_id), layer=entity.layer,
        ))
    db.flush()
    return updates
