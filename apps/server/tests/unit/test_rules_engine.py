"""Tests for RulesEngine validation pipeline."""
import pytest
from core_table.game_mode import GameMode
from core_table.session_rules import SessionRules
from service.rules_engine import RulesEngine


@pytest.fixture
def rules():
    return SessionRules.defaults("test")


@pytest.fixture
def engine(rules):
    return RulesEngine(rules)


def test_dm_bypass(engine):
    result = engine.validate_action({}, GameMode.FIGHT, is_dm=True, is_their_turn=False)
    assert result.ok


def test_wrong_owner_blocked(engine):
    result = engine.validate_action(
        {}, GameMode.FIGHT,
        user_id="player1", token_owner_id="player2",
        is_their_turn=True,
    )
    assert not result.ok
    assert result.step == "auth"


def test_free_roam_skips_turn_check(engine):
    result = engine.validate_action(
        {}, GameMode.FREE_ROAM,
        is_their_turn=False,  # should be ignored
        path_clear=True,
    )
    assert result.ok


def test_free_roam_blocked_path(engine):
    result = engine.validate_action({}, GameMode.FREE_ROAM, path_clear=False)
    assert not result.ok
    assert result.step == "movement"


def test_fight_not_your_turn(engine):
    result = engine.validate_action(
        {}, GameMode.FIGHT,
        is_their_turn=False,
        has_action_available=True,
    )
    assert not result.ok
    assert result.step == "turn"


def test_fight_no_action(engine):
    result = engine.validate_action(
        {}, GameMode.FIGHT,
        is_their_turn=True,
        has_action_available=False,
    )
    assert not result.ok
    assert result.step == "action_economy"


def test_fight_exceeds_speed(engine):
    result = engine.validate_action(
        {}, GameMode.FIGHT,
        is_their_turn=True,
        has_action_available=True,
        has_resource=True,
        path_clear=True,
        movement_cost=40.0,
        available_speed=30.0,
    )
    assert not result.ok
    assert result.step == "movement"


def test_fight_valid_move(engine):
    result = engine.validate_action(
        {}, GameMode.FIGHT,
        is_their_turn=True,
        has_action_available=True,
        has_resource=True,
        path_clear=True,
        movement_cost=20.0,
        available_speed=30.0,
    )
    assert result.ok


def test_explore_no_action(engine):
    result = engine.validate_action(
        {}, GameMode.EXPLORE,
        has_action_available=False,
        path_clear=True,
    )
    assert not result.ok
    assert result.step == "action_economy"


def test_free_roam_ignores_speed_if_not_enforced(rules):
    rules.enforce_movement_speed = False
    engine = RulesEngine(rules)
    result = engine.validate_action(
        {}, GameMode.FREE_ROAM,
        movement_cost=999.0,
        available_speed=5.0,
    )
    assert result.ok
