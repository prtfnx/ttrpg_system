"""Tests for EncounterEngine."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

import pytest
from service.encounter_engine import EncounterEngine, EncounterPhase


@pytest.fixture(autouse=True)
def clean():
    EncounterEngine._active.clear()
    yield
    EncounterEngine._active.clear()


CHOICES = [
    {'choice_id': 'c1', 'text': 'Run away'},
    {'choice_id': 'c2', 'text': 'Fight', 'requires_roll': True, 'roll_ability': 'str', 'roll_dc': 12},
]


def test_create_encounter():
    enc = EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    assert enc.phase == EncounterPhase.PRESENTING
    assert len(enc.choices) == 2
    assert EncounterEngine.get('sess1') is enc


def test_submit_simple_choice():
    EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    result = EncounterEngine.submit_choice('sess1', 'p1', 'c1')
    assert result['status'] == 'choice_recorded'


def test_submit_roll_choice_requires_roll():
    EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    result = EncounterEngine.submit_choice('sess1', 'p1', 'c2')
    assert result['status'] == 'roll_required'
    enc = EncounterEngine.get('sess1')
    assert enc is not None
    assert enc.phase == EncounterPhase.AWAITING_ROLL


def test_submit_roll():
    EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    EncounterEngine.submit_choice('sess1', 'p1', 'c2')
    result = EncounterEngine.submit_roll('sess1', 'p1', bonus=100)  # huge bonus = success
    assert result['success'] is True
    assert 'roll' in result


def test_submit_roll_no_bonus_might_fail():
    EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    EncounterEngine.submit_choice('sess1', 'p1', 'c2')
    # With dc=12 and bonus=-100, should always fail
    result = EncounterEngine.submit_roll('sess1', 'p1', bonus=-100)
    assert result['success'] is False


def test_end_encounter():
    EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    enc = EncounterEngine.end_encounter('sess1')
    assert enc is not None
    assert enc.phase == EncounterPhase.COMPLETED
    assert EncounterEngine.get('sess1') is None


def test_invalid_choice():
    EncounterEngine.create('sess1', 'Test', 'A test.', CHOICES, ['p1'])
    result = EncounterEngine.submit_choice('sess1', 'p1', 'bad_id')
    assert 'error' in result


def test_no_active_encounter():
    result = EncounterEngine.submit_choice('sess_none', 'p1', 'c1')
    assert 'error' in result
