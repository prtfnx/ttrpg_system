from __future__ import annotations

from typing import Any

from utils.roles import SessionRole, is_dm


class CombatStatePresenter:
    @staticmethod
    def for_client(state: Any, role: str | None, user_id: int | None = None) -> dict | None:
        if state is None:
            return None
        if is_dm(role):
            return state.to_dict()

        visibility = CombatStatePresenter._npc_hp_visibility(
            getattr(getattr(state, 'settings', None), 'show_npc_hp_to_players', 'descriptor')
        )
        view = state.to_dict_for_player(visibility)
        view['combatants'] = [
            CombatStatePresenter._sanitize_combatant(combatant, role, user_id)
            for combatant in view.get('combatants', [])
            if not CombatStatePresenter._is_hidden_npc(combatant)
        ]
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
    def _sanitize_combatant(combatant: dict[str, Any], role: str | None, user_id: int | None) -> dict[str, Any]:
        sanitized = dict(combatant)
        if role == SessionRole.SPECTATOR.value:
            sanitized.pop('controlled_by', None)
            return sanitized

        controlled_by = [str(value) for value in sanitized.get('controlled_by', [])]
        if user_id is None or str(user_id) not in controlled_by:
            sanitized.pop('controlled_by', None)
        return sanitized
