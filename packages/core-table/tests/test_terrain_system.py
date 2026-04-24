"""Tests for difficult terrain movement cost and table terrain model."""
import pytest
from core_table.session_rules import SessionRules
from core_table.table import CoverZone


# ── CoverZone model tests ─────────────────────────────────────────────────────

def test_cover_zone_to_dict():
    z = CoverZone(zone_id='z1', shape_type='rect', coords=[0, 0, 50, 50], cover_tier='half', label='Wall')
    d = z.to_dict()
    assert d['zone_id'] == 'z1'
    assert d['cover_tier'] == 'half'
    assert d['coords'] == [0, 0, 50, 50]


def test_cover_zone_from_dict():
    d = {'zone_id': 'z2', 'shape_type': 'circle', 'coords': [100, 100, 25], 'cover_tier': 'three_quarters', 'label': ''}
    z = CoverZone.from_dict(d)
    assert z.zone_id == 'z2'
    assert z.shape_type == 'circle'
    assert z.cover_tier == 'three_quarters'


def test_cover_zone_roundtrip():
    z = CoverZone(zone_id='z3', shape_type='polygon', coords=[[0, 0], [50, 0], [50, 50]], cover_tier='full')
    z2 = CoverZone.from_dict(z.to_dict())
    assert z2.zone_id == z.zone_id
    assert z2.cover_tier == z.cover_tier


# ── SessionRules terrain flags ────────────────────────────────────────────────

def test_session_rules_has_enforce_difficult_terrain():
    rules = SessionRules.defaults('test')
    assert hasattr(rules, 'enforce_difficult_terrain')
    assert rules.enforce_difficult_terrain is True


def test_session_rules_enforce_cover():
    rules = SessionRules.defaults('test')
    assert rules.enforce_cover is True


def test_session_rules_oa_fields():
    rules = SessionRules.defaults('test')
    assert rules.opportunity_attacks_enabled is True
    assert rules.opportunity_attack_timeout_sec == 30
