"""Persist the affected sprite set inside the caller's transaction."""
from database import crud, models
from utils.time import utc_now


def stage_sprite_delta(db, table, changes, session_id):
    """Do not rewrite unrelated entities, walls, or table settings.

    The caller owns table fencing, authorization, geometry validation, journal,
    and commit. Global sprite identity checks remain in save_entity_to_db.
    """
    sprites = [change for change in changes if change["kind"] == "sprite"]
    if not sprites:
        return
    stored = db.query(models.VirtualTable).filter_by(table_id=str(table.table_id), session_id=session_id).one_or_none()
    if stored is None:
        raise ValueError("Sprite table does not belong to this session")
    ids = [change["id"] for change in sprites]
    rows = {row.sprite_id: row for row in db.query(models.Entity).filter(models.Entity.sprite_id.in_(ids)).all()}
    for change in sprites:
        row = rows.get(change["id"])
        if row is not None and row.table_id != stored.id:
            raise ValueError("Sprite ID already belongs to another table")
        if change["after"] is None:
            if row is not None:
                db.delete(row)
        else:
            entity = table.find_entity_by_sprite_id(change["id"])
            if entity is None:
                raise ValueError("Staged sprite is missing")
            crud.save_entity_to_db(db, entity, stored.id, commit=False)
    stored.updated_at = utc_now()
    db.flush()
