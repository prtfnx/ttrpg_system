import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class GameMode(str, Enum):
    FREE_ROAM = "free_roam"
    EXPLORE = "explore"
    FIGHT = "fight"
    CUSTOM = "custom"


# Valid transitions: from_mode -> set of allowed to_modes
_TRANSITIONS: dict[GameMode, set[GameMode]] = {
    GameMode.FREE_ROAM: {GameMode.EXPLORE, GameMode.FIGHT, GameMode.CUSTOM},
    GameMode.EXPLORE:   {GameMode.FREE_ROAM, GameMode.FIGHT, GameMode.CUSTOM},
    GameMode.FIGHT:     {GameMode.FREE_ROAM, GameMode.EXPLORE, GameMode.CUSTOM},
    GameMode.CUSTOM:    {GameMode.FREE_ROAM, GameMode.EXPLORE, GameMode.FIGHT},
}


@dataclass
class GameModeState:
    mode: GameMode = GameMode.FREE_ROAM
    round_number: int = 0
    # EXPLORE: track who submitted
    players_submitted: dict = field(default_factory=dict)  # user_id -> bool
    round_timer_seconds: Optional[int] = None
    # FIGHT: link to CombatState
    combat_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "mode": self.mode.value,
            "round_number": self.round_number,
            "players_submitted": self.players_submitted,
            "round_timer_seconds": self.round_timer_seconds,
            "combat_id": self.combat_id,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "GameModeState":
        return cls(
            mode=GameMode(data.get("mode", GameMode.FREE_ROAM)),
            round_number=data.get("round_number", 0),
            players_submitted=data.get("players_submitted", {}),
            round_timer_seconds=data.get("round_timer_seconds"),
            combat_id=data.get("combat_id"),
        )


class GameModeFSM:
    """
    Tracks the current game mode and enforces valid transitions.
    Callbacks (on_enter) can be registered to react to mode changes.
    """

    def __init__(self, initial_mode: GameMode = GameMode.FREE_ROAM):
        self.state = GameModeState(mode=initial_mode)
        self._on_enter: dict[GameMode, list[Callable]] = {m: [] for m in GameMode}

    @property
    def mode(self) -> GameMode:
        return self.state.mode

    def on_enter(self, mode: GameMode, callback: Callable) -> None:
        self._on_enter[mode].append(callback)

    def transition(self, target: GameMode) -> bool:
        current = self.state.mode
        if target not in _TRANSITIONS.get(current, set()):
            logger.warning("Invalid FSM transition %s -> %s", current, target)
            return False

        # Reset per-mode state on transition
        if target != GameMode.FIGHT:
            self.state.combat_id = None
        if target not in (GameMode.EXPLORE, GameMode.CUSTOM):
            self.state.players_submitted = {}
            self.state.round_number = 0

        self.state.mode = target
        logger.info("Game mode: %s -> %s", current, target)

        for cb in self._on_enter[target]:
            try:
                cb(self.state)
            except Exception:
                logger.exception("on_enter callback error for mode %s", target)

        return True

    def advance_round(self) -> None:
        self.state.round_number += 1
        self.state.players_submitted = {}

    def mark_submitted(self, user_id: str) -> None:
        self.state.players_submitted[user_id] = True

    def all_submitted(self, active_player_ids: list[str]) -> bool:
        return all(self.state.players_submitted.get(uid) for uid in active_player_ids)
