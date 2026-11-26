"""Resolve action references and validate geometry before spending combat resources."""

import math

from core_table.pathfinding import PathfindingSystem
from core_table.session_rules import SessionRules
from pydantic import ValidationError
from service.combat_actions import CombatActionDefinition, find_combat_action
from utils.roles import is_dm

MECHANICAL_FIELDS = frozenset({
    'attack_bonus', 'damage_formula', 'damage_type', 'attack_type', 'range_ft',
    'spell_name', 'spell_level', 'save_ability', 'save_dc', 'requires_attack_roll',
    'is_concentration', 'effect', 'save_half',
})


class ActionCommandRejected(ValueError):
    pass


def resolve_definition(command, actor, role):
    kind = 'spell' if command.type.value == 'cast_spell' else 'attack'
    if command.action_id:
        if command.manual or MECHANICAL_FIELDS.intersection(command.model_fields_set):
            raise ActionCommandRejected('Action mechanics are resolved by the server')
        action = find_combat_action(actor, command.action_id)
        if action is None or action.kind != kind:
            raise ActionCommandRejected('Executable action reference is unavailable')
        return action
    if not command.manual or not is_dm(role):
        raise ActionCommandRejected('Choose a supported action; manual resolution requires a DM')
    effect = command.effect or ('attack_roll' if kind == 'attack' or command.requires_attack_roll
                                else 'saving_throw' if command.save_ability else None)
    if effect is None:
        raise ActionCommandRejected('Manual damage spells require an explicit supported effect')
    if effect == 'saving_throw' and command.save_dc <= 0:
        raise ActionCommandRejected('Saving throws require a positive difficulty class')
    try:
        return CombatActionDefinition.model_validate({
            'name': command.spell_name or 'Manual attack', 'kind': kind, 'effect': effect,
            'damage_formula': command.damage_formula, 'damage_type': command.damage_type,
            'range_ft': command.range_ft, 'attack_bonus': command.attack_bonus,
            'attack_type': command.attack_type, 'spell_level': command.spell_level if kind == 'spell' else 0,
            'save_ability': command.save_ability or None, 'save_dc': command.save_dc,
            'save_half': command.save_half if effect == 'saving_throw' else False,
            'is_concentration': command.is_concentration, 'max_targets': 20 if kind == 'spell' else 1,
        })
    except ValidationError as exc:
        raise ActionCommandRejected('Manual action mechanics are invalid') from exc


def _position(table, actor) -> tuple[float, float]:
    finder = getattr(table, 'find_entity_by_sprite_id', None)
    entity = finder(actor.entity_id) if callable(finder) else None
    position = getattr(entity, 'position', None)
    if (not isinstance(position, (list, tuple)) or len(position) < 2
            or any(isinstance(value, bool) or not isinstance(value, (int, float))
                   or not math.isfinite(value) for value in position[:2])):
        raise ActionCommandRejected('Combat token geometry is unavailable')
    return float(position[0]), float(position[1])


def validate_targets(state, actor, targets, table, action, role):
    if table is None:
        raise ActionCommandRejected('Encounter table is unavailable')
    if not 1 <= len(targets) <= action.max_targets:
        raise ActionCommandRejected('Action target count is invalid')
    if len({target.combatant_id for target in targets}) != len(targets):
        raise ActionCommandRejected('Action targets must be distinct')
    grid, distance = getattr(table, 'grid_cell_px', None), getattr(table, 'cell_distance', None)
    if (isinstance(grid, bool) or not isinstance(grid, (int, float)) or not math.isfinite(grid) or grid <= 0
            or isinstance(distance, bool) or not isinstance(distance, (int, float))
            or not math.isfinite(distance) or distance <= 0):
        raise ActionCommandRejected('Encounter table units are unavailable')
    unit = getattr(table, 'distance_unit', None)
    if unit not in {'ft', 'm'}:
        raise ActionCommandRejected('Encounter table units are unavailable')
    start = _position(table, actor)
    for target in targets:
        if target.is_defeated or target.is_hidden and not is_dm(role):
            raise ActionCommandRejected('Target is unavailable')
        end = _position(table, target)
        feet = math.hypot(end[0] - start[0], end[1] - start[1]) * distance / grid
        if unit == 'm':
            feet /= 0.3048
        if feet > action.range_ft + 1e-6:
            raise ActionCommandRejected('Target is outside the action range')
        for wall in table.walls.values():
            if not wall.blocks_sight or wall.is_door and wall.door_state == 'open':
                continue
            if PathfindingSystem.line_segments_intersect(*start, *end, wall.x1, wall.y1, wall.x2, wall.y2):
                raise ActionCommandRejected('Action line of sight is blocked')
        obstacles = [entity for entity in table.entities.values() if entity.layer == 'obstacles']
        if PathfindingSystem.is_path_blocked_by_obstacles(start, end, obstacles, actor.entity_id):
            raise ActionCommandRejected('Action line of sight is blocked')


def apply_combat_action(service, command, context, state, actor_id):
    opportunity = command.type.value == 'resolve_opportunity_attack'
    if opportunity and not command.use_reaction:
        return {'resolved': True, 'passed': True, 'attacker': actor_id, 'target': command.target_id}
    if opportunity and not is_dm(context.role) and not context.reaction_authorized:
        return {'error': 'Opportunity attack timing requires DM manual resolution'}
    spell = command.type.value == 'cast_spell'
    if not spell and not command.target_id:
        return {'error': 'target_id required'}
    identifiers = command.target_ids if spell else [command.target_id]
    actor = service._get_combatant(state, actor_id)
    targets = []
    for identifier in identifiers:
        target_id = service._resolve_combatant_id(state, identifier)
        if target_id is None:
            return {'error': 'target_id not found'}
        targets.append(service._get_combatant(state, target_id))
    if actor is None or actor.is_defeated or actor.hp <= 0 or not actor.can_act():
        return {'error': 'Combatant cannot act'}
    try:
        if command.table_id is not None and command.table_id != state.table_id:
            raise ActionCommandRejected('Actions must use the encounter table')
        action = resolve_definition(command, actor, context.role)
        table = context.table_lookup(state.table_id)
        validate_targets(state, actor, targets, table, action, context.role)
        if opportunity and action.attack_type != 'melee':
            raise ActionCommandRejected('Opportunity attacks require a melee attack')
    except ActionCommandRejected as exc:
        return {'error': str(exc)}
    if spell:
        return service._engine.execute_spell(
            context.session_code, caster_id=actor_id, spell_name=action.name, spell_level=action.spell_level,
            target_ids=[target.combatant_id for target in targets], damage_formula=action.damage_formula,
            save_ability=action.save_ability or '', save_dc=action.save_dc, damage_type=action.damage_type,
            requires_attack_roll=action.effect == 'attack_roll', attack_bonus=action.attack_bonus,
            is_concentration=action.is_concentration, effect=action.effect, save_half=action.save_half, table=table,
            attack_type=action.attack_type,
        )
    if not opportunity:
        return service._engine.execute_attack(
            context.session_code, attacker_id=actor_id, target_id=targets[0].combatant_id,
            attack_bonus=action.attack_bonus, damage_formula=action.damage_formula, damage_type=action.damage_type,
            attack_type=action.attack_type, weapon_range_ft=action.range_ft, table=table,
        )
    if not actor.has_reaction:
        return {'error': 'Reaction already used'}
    actor.has_reaction = False
    from service.attack_resolver import AttackResolver

    resolver = AttackResolver(SessionRules(session_id=context.session_code,
                                          critical_hit_rule=state.settings.critical_hit_rule))
    result = resolver.resolve_attack(actor, targets[0], action.attack_bonus, action.damage_formula,
                                     action.damage_type, combat=state, table=table)
    payload = {'hit': result.hit, 'damage': result.damage_dealt, 'attacker': actor_id,
               'target': targets[0].combatant_id, 'reason': result.reason}
    if result.hit:
        payload['damage_result'] = service._engine.apply_damage(
            context.session_code, targets[0].combatant_id, result.damage_dealt, action.damage_type,
        )
    return payload
