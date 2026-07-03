from __future__ import annotations

from copy import deepcopy
from typing import Any

from utils.roles import SessionRole, is_dm


class CombatStatePresenter:
    _NPC_PRIVATE_FIELDS = {
        'ai_enabled',
        'ai_behavior',
        'actor_actions',
        'attacks_per_action',
        'attacks_used_this_action',
        'constitution_modifier',
        'controlled_by',
        'damage_immunities',
        'damage_resistances',
        'damage_vulnerabilities',
        'initiative_modifier',
        'save_modifiers',
        'spell_attack_bonus',
        'spell_save_dc',
        'spell_slots',
        'spell_slots_max',
    }

    @staticmethod
    def for_client(state: Any, role: str | None, user_id: int | None = None) -> dict | None:
        if state is None:
            return None
        if is_dm(role):
            return state.to_dict()

        visibility = CombatStatePresenter._npc_hp_visibility(
            getattr(getattr(state, 'settings', None), 'show_npc_hp_to_players', 'descriptor')
        )
        show_npc_ac = bool(
            getattr(getattr(state, 'settings', None), 'show_npc_ac_to_players', False)
        )
        view = state.to_dict_for_player(visibility)
        view['combatants'] = [
            CombatStatePresenter._sanitize_combatant(
                combatant,
                role,
                user_id,
                show_npc_ac,
            )
            for combatant in view.get('combatants', [])
            if not CombatStatePresenter._is_hidden_npc(combatant)
        ]
        visible_ids = {
            str(combatant.get('combatant_id'))
            for combatant in view['combatants']
            if combatant.get('combatant_id') is not None
        }
        view['action_log'] = CombatStatePresenter._sanitize_action_log(
            view.get('action_log', []),
            visible_ids,
        )
        return view

    @staticmethod
    def message_for_client(
        state: Any,
        role: str | None,
        user_id: int | None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        combat = CombatStatePresenter.for_client(state, role, user_id)
        data = deepcopy(context or {})
        data.pop('combat', None)
        if is_dm(role) or combat is None:
            data['combat'] = combat
            return data

        visible_combatants = {
            str(combatant['combatant_id']): combatant
            for combatant in combat.get('combatants', [])
            if combatant.get('combatant_id') is not None
        }
        CombatStatePresenter._sanitize_event_context(data, visible_combatants)
        data['combat'] = combat
        return data

    @staticmethod
    def _npc_hp_visibility(value: Any) -> str:
        if value is True:
            return 'full'
        if value is False:
            return 'none'
        return str(value or 'descriptor')

    @staticmethod
    def _is_hidden_npc(combatant: dict[str, Any]) -> bool:
        return bool(combatant.get('is_hidden') and combatant.get('is_npc'))

    @staticmethod
    def _sanitize_combatant(
        combatant: dict[str, Any],
        role: str | None,
        user_id: int | None,
        show_npc_ac: bool,
    ) -> dict[str, Any]:
        sanitized = dict(combatant)
        if sanitized.get('is_npc'):
            for field in CombatStatePresenter._NPC_PRIVATE_FIELDS:
                sanitized.pop(field, None)
            if not show_npc_ac:
                sanitized.pop('armor_class', None)

        if role == SessionRole.SPECTATOR.value:
            sanitized.pop('controlled_by', None)
            return sanitized

        controlled_by = [str(value) for value in sanitized.get('controlled_by', [])]
        if user_id is None or str(user_id) not in controlled_by:
            sanitized.pop('controlled_by', None)
        return sanitized

    @staticmethod
    def _sanitize_action_log(
        action_log: list[dict[str, Any]],
        visible_ids: set[str],
    ) -> list[dict[str, Any]]:
        sanitized_actions = []
        for action in action_log:
            actor_id = action.get('actor_id')
            if actor_id is not None and str(actor_id) not in visible_ids:
                continue

            sanitized = dict(action)
            sanitized.pop('state_before', None)
            sanitized.pop('is_dm_override', None)
            sanitized['target_ids'] = [
                target_id
                for target_id in sanitized.get('target_ids', [])
                if str(target_id) in visible_ids
            ]
            sanitized_actions.append(sanitized)
        return sanitized_actions

    @staticmethod
    def _sanitize_event_context(
        context: dict[str, Any],
        visible_combatants: dict[str, dict[str, Any]],
    ) -> None:
        applied = context.get('applied')
        if isinstance(applied, list):
            visible_ids = set(visible_combatants)
            sanitized_applied = []
            for item in applied:
                if not isinstance(item, dict):
                    continue
                actor_id = item.get('actor_id')
                if actor_id is not None and str(actor_id) not in visible_ids:
                    continue
                sanitized = dict(item)
                result = sanitized.get('result')
                if isinstance(result, dict):
                    result = dict(result)
                    CombatStatePresenter._sanitize_event_context(
                        result,
                        visible_combatants,
                    )
                    sanitized['result'] = result
                sanitized_applied.append(sanitized)
            context['applied'] = sanitized_applied

        if 'order' in context:
            context['order'] = [
                {
                    'combatant_id': combatant['combatant_id'],
                    'name': combatant.get('name', ''),
                    'initiative': combatant.get('initiative'),
                }
                for combatant in visible_combatants.values()
            ]

        for key in ('combatant', 'current_combatant'):
            value = context.get(key)
            if not isinstance(value, dict):
                continue
            combatant_id = value.get('combatant_id')
            context[key] = visible_combatants.get(str(combatant_id))

        combatant_id = context.get('combatant_id')
        if combatant_id is not None and str(combatant_id) not in visible_combatants:
            for key in ('combatant_id', 'conditions', 'name', 'value'):
                context.pop(key, None)

        context.pop('resistances_update', None)
        context.pop('surprised_update', None)
        context.pop('temp_hp_set', None)
        CombatStatePresenter._remove_private_result_fields(context)

    @staticmethod
    def _remove_private_result_fields(value: Any) -> None:
        if isinstance(value, dict):
            for key in (
                'ai_behavior',
                'ai_enabled',
                'new_hp',
                'spell_slots_remaining',
                'state_before',
                'temp_hp',
            ):
                value.pop(key, None)
            for nested in value.values():
                CombatStatePresenter._remove_private_result_fields(nested)
        elif isinstance(value, list):
            for nested in value:
                CombatStatePresenter._remove_private_result_fields(nested)
