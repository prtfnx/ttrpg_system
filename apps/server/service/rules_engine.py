"""
Server-side validation pipeline.  Every player action runs through this.
Steps are skipped or relaxed based on game mode and session rules.
"""
import logging
from dataclasses import dataclass
from typing import Any, Optional

from core_table.game_mode import GameMode
from core_table.session_rules import SessionRules

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    ok: bool
    reason: str = ""
    step: str = ""


class RulesEngine:
    """
    Stateless validator.  Instantiate once per session, call validate_action()
    for each incoming player command.
    """

    def __init__(self, rules: SessionRules):
        self.rules = rules

    def validate_action(
        self,
        action: dict[str, Any],
        mode: GameMode,
        *,
        is_dm: bool = False,
        # Optional context — None means "skip that check"
        user_id: Optional[str] = None,
        token_owner_id: Optional[str] = None,
        is_their_turn: Optional[bool] = None,
        has_action_available: Optional[bool] = None,
        has_resource: Optional[bool] = None,
        path_clear: Optional[bool] = None,
        movement_cost: Optional[float] = None,
        available_speed: Optional[float] = None,
        target_valid: Optional[bool] = None,
    ) -> ValidationResult:
        # DMs skip all validation — straight to resolution.
        if is_dm:
            return ValidationResult(ok=True)

        # Step 1: auth
        r = self._check_auth(user_id, token_owner_id)
        if not r.ok:
            return r

        # Steps 3-8 vary by mode
        if mode == GameMode.FREE_ROAM:
            return self._validate_free_roam(path_clear, movement_cost, available_speed)

        if mode == GameMode.EXPLORE:
            return self._validate_explore(
                path_clear, movement_cost, available_speed,
                has_action_available, has_resource
            )

        if mode in (GameMode.FIGHT, GameMode.CUSTOM):
            return self._validate_fight(
                is_their_turn, has_action_available, has_resource,
                path_clear, movement_cost, available_speed, target_valid
            )

        return ValidationResult(ok=True)

    # ── per-mode helpers ─────────────────────────────────────────────────────

    def _check_auth(self, user_id: Optional[str], owner_id: Optional[str]) -> ValidationResult:
        if user_id is None or owner_id is None:
            return ValidationResult(ok=True)  # no context → skip
        if user_id != owner_id:
            return ValidationResult(ok=False, reason="You don't control this token", step="auth")
        return ValidationResult(ok=True)

    def _validate_free_roam(
        self,
        path_clear: Optional[bool],
        movement_cost: Optional[float],
        available_speed: Optional[float],
    ) -> ValidationResult:
        # Only movement obstacle check (if enabled)
        if self.rules.obstacles_block_movement or self.rules.walls_block_movement:
            if path_clear is False:
                return ValidationResult(ok=False, reason="Path is blocked", step="movement")
        return ValidationResult(ok=True)

    def _validate_explore(
        self,
        path_clear: Optional[bool],
        movement_cost: Optional[float],
        available_speed: Optional[float],
        has_action: Optional[bool],
        has_resource: Optional[bool],
    ) -> ValidationResult:
        r = self._check_movement(path_clear, movement_cost, available_speed)
        if not r.ok:
            return r
        if self.rules.actions_per_turn > 0 and has_action is False:
            return ValidationResult(ok=False, reason="No actions remaining this round", step="action_economy")
        if has_resource is False:
            return ValidationResult(ok=False, reason="Insufficient resources", step="resources")
        return ValidationResult(ok=True)

    def _validate_fight(
        self,
        is_their_turn: Optional[bool],
        has_action: Optional[bool],
        has_resource: Optional[bool],
        path_clear: Optional[bool],
        movement_cost: Optional[float],
        available_speed: Optional[float],
        target_valid: Optional[bool],
    ) -> ValidationResult:
        if is_their_turn is False:
            return ValidationResult(ok=False, reason="It's not your turn", step="turn")
        if has_action is False:
            return ValidationResult(ok=False, reason="No actions remaining", step="action_economy")
        if has_resource is False:
            return ValidationResult(ok=False, reason="Insufficient resources", step="resources")
        r = self._check_movement(path_clear, movement_cost, available_speed)
        if not r.ok:
            return r
        if self.rules.enforce_range and target_valid is False:
            return ValidationResult(ok=False, reason="Target out of range or no line of sight", step="target")
        return ValidationResult(ok=True)

    def _check_movement(
        self,
        path_clear: Optional[bool],
        movement_cost: Optional[float],
        available_speed: Optional[float],
    ) -> ValidationResult:
        if (self.rules.obstacles_block_movement or self.rules.walls_block_movement) and path_clear is False:
            return ValidationResult(ok=False, reason="Path is blocked", step="movement")
        if self.rules.enforce_movement_speed and movement_cost is not None and available_speed is not None:
            if movement_cost > available_speed:
                return ValidationResult(
                    ok=False,
                    reason=f"Move costs {movement_cost:.0f}ft but only {available_speed:.0f}ft remaining",
                    step="movement",
                )
        return ValidationResult(ok=True)
