from __future__ import annotations

from typing import Any

from utils.roles import SessionRole, is_dm


class CombatStatePresenter:
    _NPC_PRIVATE_FIELDS = {
        'ai_enabled',
        'ai_behavior',
        'attacks_per_action',
        'attacks_used_this_action',
        'constitution_modifier',
        'controlled_by',
        'damage_immunities',
        'damage_resistances',
        'damage_vulnerabilities',
        'initiative_modifier',
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
