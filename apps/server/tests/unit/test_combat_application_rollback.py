import asyncio
from copy import deepcopy
from unittest.mock import MagicMock

import pytest
from service.combat_command_service import CombatCommandContext, CombatCommandService
from service.combat_engine import CombatEngine


@pytest.fixture
def scenario(monkeypatch):
    state = CombatEngine.start_combat('apply-rollback', 'table', [], combatants=[
        {'entity_id': 'caster', 'name': 'Caster', 'hp': 20, 'max_hp': 20, 'controlled_by': ['1']},
        {'entity_id': 'target', 'name': 'Target', 'hp': 20, 'max_hp': 20},
    ])
    caster = next(actor for actor in state.combatants if actor.entity_id == 'caster')
    target = next(actor for actor in state.combatants if actor.entity_id == 'target')
    state.current_turn_index = state.active_combatants().index(caster)
    caster.spell_slots = {1: 2}
    caster.concentration_spell = 'Bless'
    before = deepcopy(state.to_dict())
    persistence = MagicMock()
    persistence.find_result.return_value = None
    service = CombatCommandService(persistence=persistence)
    envelope = service.parse_envelope({'sequence_id': 12, 'commands': [
        {'type': 'dm_override', 'actor_id': target.combatant_id, 'override_type': 'set_hp', 'value': 5},
        {'type': 'cast_spell', 'actor_id': caster.combatant_id, 'spell_name': 'Test',
         'spell_level': 1, 'target_ids': [target.combatant_id]},
    ]})
    context = CombatCommandContext(session_code='apply-rollback', client_id='owner', role='owner', user_id=1)

    def fail(*_args, **_kwargs):
        caster.spell_slots[1] -= 1
        caster.concentration_spell = None
        raise RuntimeError('private execution failure')

    monkeypatch.setattr('service.spell_resolver.SpellResolver.resolve_spell', fail)
    yield service, envelope, context, before, persistence
    CombatEngine._active.pop('apply-rollback', None)


@pytest.mark.parametrize('asynchronous', [False, True])
async def test_application_exception_restores_the_whole_batch(scenario, asynchronous):
    service, envelope, context, before, persistence = scenario
    result = await service.apply_async(envelope, context) if asynchronous else service.apply(envelope, context)
    assert not result.accepted
    assert result.failed_index == 1
    assert result.reason == 'Combat command could not be applied'
    assert 'private' not in result.reason
    assert CombatEngine.get_state(context.session_code).to_dict() == before
    persistence.persist_accepted.assert_not_called()


async def test_cancelled_application_restores_resources_before_propagating(scenario, monkeypatch):
    service, envelope, context, before, persistence = scenario
    original = service._apply_one_async

    async def cancel(command, *args):
        result = await original(command, *args)
        if command.type.value == 'dm_override':
            raise asyncio.CancelledError()
        return result

    monkeypatch.setattr(service, '_apply_one_async', cancel)
    with pytest.raises(asyncio.CancelledError):
        await service.apply_async(envelope, context)
    assert CombatEngine.get_state(context.session_code).to_dict() == before
    persistence.persist_accepted.assert_not_called()
