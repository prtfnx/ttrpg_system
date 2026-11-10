"""Install only the current fog projection while preserving unrelated live edits."""
from core_table.fog import fog_rectangles_from_entities


def install_fog_projection(manager, table, current):
    draft = table.fork_for_sprite_edit()
    for entity in list(draft.entities.values()):
        if entity.layer == 'fog_of_war':
            draft.remove_entity(entity.entity_id)
    for entity in current['fog_entities']:
        if entity.entity_id in draft.entities or entity.sprite_id in draft.sprite_to_entity:
            raise RuntimeError('Current fog collides with an unrelated retained entity')
        if not draft.restore_entity(entity, allow_out_of_bounds=True):
            raise RuntimeError('Current fog geometry could not be installed')
    draft.fog_rectangles = fog_rectangles_from_entities(draft.entities.values())
    key = str(table.table_id)
    manager.tables[key] = draft
    manager.tables_id[key] = draft
