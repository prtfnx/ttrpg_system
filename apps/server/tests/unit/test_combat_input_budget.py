import pytest
from pydantic import ValidationError
from service.combat_command_service import CombatCommandService


@pytest.mark.parametrize('formula', ['1000000000d6', '51d6+50d8', '1d0', '1d6junk'])
def test_combat_rejects_unbounded_or_invalid_dice_before_application(formula):
    with pytest.raises(ValidationError):
        CombatCommandService().parse_envelope({'commands': [
            {'type': 'cast_spell', 'actor_id': 'caster', 'damage_formula': formula},
        ]})


def test_combat_envelope_has_a_bounded_command_count():
    command = {'type': 'dodge', 'actor_id': 'actor'}
    assert len(CombatCommandService().parse_envelope({'commands': [command] * 50}).commands) == 50
    with pytest.raises(ValidationError):
        CombatCommandService().parse_envelope({'commands': [command] * 51})


@pytest.mark.parametrize('field', ['range_ft', 'value', 'target_x', 'cost_ft'])
@pytest.mark.parametrize('value', [float('inf'), float('nan')])
def test_nonfinite_combat_numbers_are_rejected(field, value):
    with pytest.raises(ValidationError):
        CombatCommandService().parse_envelope({'commands': [
            {'type': 'attack', 'actor_id': 'actor', field: value},
        ]})
