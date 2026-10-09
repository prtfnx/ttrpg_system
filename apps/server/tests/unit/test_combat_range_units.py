import pytest
from core_table.combat import Combatant, CombatState
from core_table.table import VirtualTable
from service.combat_engine import CombatEngine


@pytest.mark.parametrize("cell_px,cell_distance,unit,target_x,range_ft,allowed", [
    (50, 5, "ft", 50, 5, True),
    (50, 5, "ft", 100, 5, False),
    (100, 10, "ft", 50, 5, True),
    (100, 10, "ft", 100, 5, False),
    (50, 1.524, "m", 50, 5, True),
    (50, 1.524, "m", 100, 5, False),
    (50, 5, "ft", 200, 15, False),
    (50, 5, "ft", 200, 30, True),
])
def test_attack_range_uses_persisted_table_geometry_even_with_grid_hidden(
    cell_px, cell_distance, unit, target_x, range_ft, allowed,
):
    table = VirtualTable("Range", 1000, 1000, grid_cell_px=cell_px,
                         cell_distance=cell_distance, distance_unit=unit)
    table.grid_enabled = False
    attacker_entity = table.add_entity({"position": [0, 0]})
    target_entity = table.add_entity({"position": [target_x, 0]})
    attacker = Combatant(combatant_id="attacker", entity_id=attacker_entity.sprite_id, name="Attacker")
    target = Combatant(combatant_id="target", entity_id=target_entity.sprite_id, name="Target")
    state = CombatState(combat_id="range", session_id="trusted", table_id=str(table.table_id))
    error = CombatEngine._check_range(state, attacker, target, range_ft, table)
    assert (error is None) is allowed
