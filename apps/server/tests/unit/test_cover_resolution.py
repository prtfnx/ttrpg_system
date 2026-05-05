"""Tests for cover resolution in AttackResolver."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from unittest.mock import MagicMock

from core_table.session_rules import SessionRules
from core_table.table import CoverZone
from service.attack_resolver import AttackResolver


def make_table(zones=None):
    table = MagicMock()
    table.cover_zones = zones or []
    return table


def rect_zone(x, y, w, h, tier='half'):
    return CoverZone(zone_id='z1', shape_type='rect', coords=[x, y, w, h], cover_tier=tier)


def circle_zone(cx, cy, r, tier='three_quarters'):
    return CoverZone(zone_id='z2', shape_type='circle', coords=[cx, cy, r], cover_tier=tier)


def test_no_cover_when_no_zones():
    table = make_table([])
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'none'


def test_half_cover_adds_2ac():
    # Zone directly on LOS
    zone = rect_zone(45, -10, 10, 20, tier='half')
    table = make_table([zone])
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'half'


def test_three_quarter_cover_adds_5ac():
    zone = rect_zone(45, -10, 10, 20, tier='three_quarters')
    table = make_table([zone])
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'three_quarters'


def test_full_cover_returns_full():
    zone = rect_zone(45, -10, 10, 20, tier='full')
    table = make_table([zone])
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'full'


def test_highest_tier_wins():
    zones = [
        rect_zone(30, -10, 10, 20, tier='half'),
        rect_zone(60, -10, 10, 20, tier='three_quarters'),
    ]
    table = make_table(zones)
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'three_quarters'


def test_circle_zone_blocks_los():
    # Circle centered on LOS midpoint
    zone = circle_zone(50, 0, 15, tier='half')
    table = make_table([zone])
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'half'


def test_clear_los_no_cover():
    # Zone completely off to the side
    zone = rect_zone(50, 50, 10, 10, tier='full')
    table = make_table([zone])
    result = AttackResolver.resolve_cover((0, 0), (100, 0), table)
    assert result == 'none'


def test_full_cover_blocks_attack():

    from core_table.combat import Combatant

    rules = SessionRules.defaults('test')
    resolver = AttackResolver(rules)

    attacker = Combatant(combatant_id='a', entity_id='ea', name='A', hp=20, max_hp=20, armor_class=10, movement_speed=30, movement_remaining=30)
    target = Combatant(combatant_id='t', entity_id='et', name='T', hp=20, max_hp=20, armor_class=10, movement_speed=30, movement_remaining=30)

    zone = rect_zone(45, -10, 10, 20, tier='full')
    table = MagicMock()
    table.cover_zones = [zone]
    table.sprite_to_entity = {'ea': 'ea', 'et': 'et'}

    mock_ae = MagicMock()
    mock_ae.position = [0, 0]
    mock_te = MagicMock()
    mock_te.position = [100, 0]
    table.entities = {'ea': mock_ae, 'et': mock_te}

    result = resolver.resolve_attack(attacker, target, 10, '1d6', table=table)
    assert not result.hit
    assert result.reason == 'Target has full cover'
