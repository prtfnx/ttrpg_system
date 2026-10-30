import json

import pytest
from database.models import CharacterLog, CombatEncounter, Entity, SessionCharacter, VirtualTable
from managers import character_manager
from service.character_stat_reconciliation import inspect_stat_reconciliation, public_stat_report
from sqlalchemy.orm import sessionmaker


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


@pytest.fixture
def manager(test_db_engine, monkeypatch):
    factory = sessionmaker(bind=test_db_engine, expire_on_commit=False)
    monkeypatch.setattr(character_manager, 'SessionLocal', factory)
    return character_manager.ServerCharacterManager(), factory


def test_guarded_apply_commits_source_projections_and_audit_and_clean_retry_is_noop(manager, repair):
    service, factory = manager
    game, source, _ = repair
    preview = service.preview_stat_reconciliation(game.id, source.character_id, game.owner_id)
    result = service.update_character(game.id, source.character_id, {}, game.owner_id,
                                      stat_reconciliation_digest=preview['expected_digest'])
    assert result['success'] and result['version'] == 5
    assert result['token_stats'] == {'hp': 3, 'max_hp': 20, 'ac': 12}
    with factory() as db:
        saved = db.query(SessionCharacter).one()
        assert 'hp' not in json.loads(saved.character_data)
        assert json.loads(saved.character_data)['data']['stats'] == {'hp': 3, 'maxHp': 20, 'ac': 12}
        assert db.query(Entity).one().hp == 3
        assert db.query(CharacterLog).one().action_type == 'stat_reconciliation'
    stale = service.update_character(game.id, source.character_id, {}, game.owner_id,
                                     stat_reconciliation_digest=preview['expected_digest'])
    assert not stale['success'] and 'fresh dry run' in stale['error']
    clean = service.preview_stat_reconciliation(game.id, source.character_id, game.owner_id)
    assert clean['status'] == 'clean'
    result = service.update_character(game.id, source.character_id, {}, game.owner_id,
                                      stat_reconciliation_digest=clean['expected_digest'])
    assert result['success'] and result['version'] == 5 and result['applied_updates'] == {}
    with factory() as db:
        assert db.query(CharacterLog).count() == 1


@pytest.mark.parametrize('changed', ['projection', 'combat', 'authority'])
def test_apply_rechecks_projection_combat_and_current_authority(manager, repair, changed):
    service, factory = manager
    game, source, _ = repair
    preview = service.preview_stat_reconciliation(game.id, source.character_id, game.owner_id)
    with factory() as db:
        if changed == 'projection':
            db.query(Entity).one().hp = 1
        if changed == 'combat':
            db.add(CombatEncounter(encounter_id='new-combat', session_id=game.id, table_id='repair-table', phase='active'))
        db.commit()
    result = service.update_character(game.id, source.character_id, {}, 999 if changed == 'authority' else game.owner_id,
                                      bypass_owner_check=True, stat_reconciliation_digest=preview['expected_digest'])
    assert not result['success']
    with factory() as db:
        assert db.query(SessionCharacter).one().version == 4 and not db.query(CharacterLog).count()


def test_projection_failure_rolls_back_the_entire_repair(manager, repair, monkeypatch):
    service, factory = manager
    game, source, _ = repair
    preview = service.preview_stat_reconciliation(game.id, source.character_id, game.owner_id)
    stage = character_manager.stage_character_token_stats

    def fail(*args):
        stage(*args)
        raise RuntimeError('Projection failed after flush')
    monkeypatch.setattr(character_manager, 'stage_character_token_stats', fail)
    result = service.update_character(game.id, source.character_id, {}, game.owner_id,
                                      stat_reconciliation_digest=preview['expected_digest'])
    assert not result['success']
    with factory() as db:
        assert db.query(SessionCharacter).one().version == 4 and db.query(Entity).one().hp == 99
        assert not db.query(CharacterLog).count()
