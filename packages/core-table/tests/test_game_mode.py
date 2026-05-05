"""Tests for GameModeFSM."""
from core_table.game_mode import GameMode, GameModeFSM


def test_initial_mode():
    fsm = GameModeFSM()
    assert fsm.mode == GameMode.FREE_ROAM


def test_valid_transitions():
    fsm = GameModeFSM()
    assert fsm.transition(GameMode.EXPLORE) is True
    assert fsm.mode == GameMode.EXPLORE
    assert fsm.transition(GameMode.FIGHT) is True
    assert fsm.mode == GameMode.FIGHT
    assert fsm.transition(GameMode.FREE_ROAM) is True


def test_invalid_same_mode():
    fsm = GameModeFSM()
    # FREE_ROAM -> FREE_ROAM is not in transition table
    assert fsm.transition(GameMode.FREE_ROAM) is False
    assert fsm.mode == GameMode.FREE_ROAM


def test_on_enter_callback():
    fsm = GameModeFSM()
    calls = []
    fsm.on_enter(GameMode.FIGHT, lambda state: calls.append(state.mode))
    fsm.transition(GameMode.FIGHT)
    assert calls == [GameMode.FIGHT]


def test_transition_to_fight_keeps_combat_id_none():
    fsm = GameModeFSM(GameMode.EXPLORE)
    fsm.transition(GameMode.FIGHT)
    assert fsm.state.combat_id is None


def test_advance_round():
    fsm = GameModeFSM(GameMode.EXPLORE)
    fsm.advance_round()
    assert fsm.state.round_number == 1
    assert fsm.state.players_submitted == {}


def test_all_submitted():
    fsm = GameModeFSM(GameMode.EXPLORE)
    fsm.mark_submitted("user1")
    assert not fsm.all_submitted(["user1", "user2"])
    fsm.mark_submitted("user2")
    assert fsm.all_submitted(["user1", "user2"])


def test_state_serialization():
    fsm = GameModeFSM(GameMode.FIGHT)
    fsm.state.combat_id = "combat-xyz"
    d = fsm.state.to_dict()
    assert d["mode"] == "fight"
    assert d["combat_id"] == "combat-xyz"


def test_custom_can_reach_all():
    for target in (GameMode.FREE_ROAM, GameMode.EXPLORE, GameMode.FIGHT):
        fsm = GameModeFSM(GameMode.CUSTOM)
        assert fsm.transition(target) is True
