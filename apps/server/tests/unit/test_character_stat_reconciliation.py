import json

import pytest
from database.models import CombatEncounter, Entity, SessionCharacter, VirtualTable
from service.character_stat_reconciliation import inspect_stat_reconciliation, public_stat_report


@pytest.fixture
def repair(test_db, test_game_session):
    game = test_game_session
    source = SessionCharacter(character_id='repair-source', session_id=game.id, owner_user_id=game.owner_id,
        character_name='Hero', character_data=json.dumps({'name': 'Hero', 'hp': 3, 'max_hp': 20, 'ac': 12}), version=4)
    table = VirtualTable(table_id='repair-table', session_id=game.id, name='Repair', width=100, height=100)
    test_db.add_all([source, table])
    test_db.flush()
    token = Entity(table_id=table.id, entity_id=1, sprite_id='repair-token', character_id=source.character_id,
                   name='Hero', position_x=0, position_y=0, layer='dungeon_master', hp=99, max_hp=99, ac=99)
    test_db.add(token)
    test_db.commit()
    return game, source, token


def test_dry_run_reports_source_and_projection_differences_without_writes(test_db, repair):
    game, source, token = repair
    original = source.character_data
    report = inspect_stat_reconciliation(test_db, game.id, source.character_id, game.owner_id)
    assert report['status'] == 'repairable' and report['source_changes']
    assert report['canonical_stats'] == {'hp': 3, 'max_hp': 20, 'ac': 12}
    assert report['token_changes'][0]['expected']['hp'] == 3
    assert report['_updates']['hp'] is None
    assert not any(key.startswith('_') for key in public_stat_report(report))
    assert source.character_data == original and source.version == 4 and token.hp == 99
    assert not test_db.dirty and not test_db.new and not test_db.deleted


def test_preview_is_session_dm_only_and_scoped_before_exposing_private_tokens(test_db, repair):
    game, source, _ = repair
    for session_id, actor in [(game.id, 999), (-1, game.owner_id)]:
        with pytest.raises(ValueError, match='DM authority'):
            inspect_stat_reconciliation(test_db, session_id, source.character_id, actor)


def test_conflicts_and_active_combat_are_blocked_instead_of_guessed(test_db, repair):
    game, source, _ = repair
    source.character_data = json.dumps({'name': 'Hero', 'hp': 3, 'data': {'hp': 9}})
    test_db.commit()
    assert inspect_stat_reconciliation(test_db, game.id, source.character_id, game.owner_id)['status'] == 'blocked'
    source.character_data = json.dumps({'name': 'Hero', 'hp': 3})
    test_db.add(CombatEncounter(encounter_id='active', session_id=game.id, table_id='repair-table', phase='active'))
    test_db.commit()
    report = inspect_stat_reconciliation(test_db, game.id, source.character_id, game.owner_id)
    assert report['status'] == 'blocked' and 'active combat' in report['blocked_reasons'][0]
    assert report['_updates'] == {}


def test_precondition_changes_when_source_or_projection_changes(test_db, repair):
    game, source, token = repair
    def read():
        return inspect_stat_reconciliation(test_db, game.id, source.character_id, game.owner_id)['expected_digest']
    before = read()
    token.hp = 1
    test_db.commit()
    assert read() != before
    before = read()
    source.version += 1
    test_db.commit()
    assert read() != before


@pytest.mark.parametrize('limit_tokens', [False, True])
def test_large_reports_are_bounded_and_an_incomplete_scan_cannot_repair(test_db, repair, monkeypatch, limit_tokens):
    from service import character_stat_reconciliation as module
    game, source, token = repair
    test_db.add(Entity(table_id=token.table_id, entity_id=2, sprite_id='second-token', character_id=source.character_id,
        name='Hero', position_x=50, position_y=50, layer='tokens', hp=99))
    test_db.commit()
    monkeypatch.setattr(module, 'MAX_REPORT_TOKENS', 1)
    if limit_tokens:
        monkeypatch.setattr(module, 'MAX_LINKED_TOKENS', 1)
    report = inspect_stat_reconciliation(test_db, game.id, source.character_id, game.owner_id)
    assert len(report['token_changes']) == 1 and report['token_changes_truncated']
    if limit_tokens:
        assert report['status'] == 'blocked' and report['_updates'] == {}
    else:
        assert report['status'] == 'repairable' and report['token_mismatch_count'] == 2
