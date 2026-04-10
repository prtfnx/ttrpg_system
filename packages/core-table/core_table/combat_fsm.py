from __future__ import annotations
from .combat import CombatPhase, CombatState, CombatSettings, Combatant


TRANSITIONS: dict[CombatPhase, set[CombatPhase]] = {
    CombatPhase.INACTIVE: {CombatPhase.SETUP},
    CombatPhase.SETUP:    {CombatPhase.ROLLING, CombatPhase.ACTIVE, CombatPhase.INACTIVE},
    CombatPhase.ROLLING:  {CombatPhase.ACTIVE, CombatPhase.INACTIVE},
    CombatPhase.ACTIVE:   {CombatPhase.PAUSED, CombatPhase.ENDED},
    CombatPhase.PAUSED:   {CombatPhase.ACTIVE, CombatPhase.ENDED},
    CombatPhase.ENDED:    {CombatPhase.INACTIVE},
}


class CombatFSM:
    def __init__(self, state: CombatState):
        self.state = state

    def can_transition(self, target: CombatPhase) -> bool:
        return target in TRANSITIONS.get(self.state.phase, set())

    def transition(self, target: CombatPhase, settings: CombatSettings | None = None) -> bool:
        if not self.can_transition(target):
            return False
        self._on_exit(self.state.phase)
        self.state.phase = target
        self._on_enter(target, settings)
        return True

    def force_end(self):
        self.state.phase = CombatPhase.INACTIVE

    def _on_enter(self, phase: CombatPhase, settings: CombatSettings | None):
        if phase == CombatPhase.ACTIVE:
            if settings and settings.auto_sort_initiative:
                self.state.combatants.sort(
                    key=lambda c: (c.initiative or 0, c.initiative_modifier),
                    reverse=True,
                )
            self.state.current_turn_index = 0

    def _on_exit(self, phase: CombatPhase):
        pass  # future: cleanup hooks
