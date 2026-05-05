"""Tests for SessionRules data model."""
from core_table.session_rules import SessionRules


def test_defaults():
    rules = SessionRules.defaults("abc")
    assert rules.default_movement_speed == 30.0
    assert rules.actions_per_turn == 1
    assert rules.enforce_spell_slots is True
    assert rules.ai_enabled is False


def test_round_trip():
    rules = SessionRules.defaults("abc")
    rules.default_movement_speed = 25.0
    rules.group_npc_initiative = True
    d = rules.to_dict()
    rules2 = SessionRules.from_dict(d)
    assert rules2.default_movement_speed == 25.0
    assert rules2.group_npc_initiative is True
    assert rules2.session_id == "abc"


def test_from_dict_ignores_unknown_keys():
    d = SessionRules.defaults("x").to_dict()
    d["unknown_field"] = "should_be_ignored"
    rules = SessionRules.from_dict(d)
    assert not hasattr(rules, "unknown_field")


def test_validate_speed():
    rules = SessionRules.defaults("x")
    rules.default_movement_speed = 0
    errors = rules.validate()
    assert any("movement_speed" in e for e in errors)


def test_validate_invalid_diagonal():
    rules = SessionRules.defaults("x")
    rules.diagonal_movement_rule = "bad_value"
    errors = rules.validate()
    assert any("diagonal_movement_rule" in e for e in errors)


def test_validate_ok():
    rules = SessionRules.defaults("x")
    assert rules.validate() == []
