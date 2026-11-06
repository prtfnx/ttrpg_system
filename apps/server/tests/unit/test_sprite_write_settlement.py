"""Fresh journal settlement is separate from staging and protocol publication."""
import copy
from datetime import timedelta

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from database import crud, models
from service.sprite_editor_commands import SpriteCommandScope, SpriteEditorCommandService
from service.sprite_write_recovery import PendingSpriteWrite, SpriteWriteUnknown, resolve_sprite_write
from sqlalchemy.orm import sessionmaker
from utils.time import utc_now


@pytest.fixture
def staged(test_db, test_db_engine, test_game_session, test_user):
    factory = sessionmaker(bind=test_db_engine)
    manager = TableManager(test_db)
    table = manager.create_table('Settlement storage', 1000, 1000)
    table.add_entity({'sprite_id': 'token', 'x': 10, 'y': 20})
    assert crud.save_table_to_db(test_db, table, test_game_session.id)
    scope = SpriteCommandScope.from_message(Message(MessageType.SPRITE_ROTATE, {
        'table_id': str(table.table_id), 'sprite_id': 'token', 'rotation': 30}), test_game_session.id, test_user.id)
    draft = copy.deepcopy(table)
    entity, original = draft.find_entity_by_sprite_id('token'), table.find_entity_by_sprite_id('token')
    assert entity is not None and original is not None
    entity.rotation = 30
    command = dict(scope=scope, before_snapshot={'table_id': str(table.table_id), '_sprite_targets': ['token'],
        'sprites': {'token': original.to_dict()}}, staged=draft)
    return factory, command


@pytest.mark.parametrize('committed', [False, True])
def test_fresh_outcome_has_current_detached_entities_and_no_second_write(staged, committed):
    factory, command = staged
    attempt = PendingSpriteWrite.create([command], factory)
    if committed:
        SpriteEditorCommandService(factory).persist(**command)
        with factory() as db:
            db.query(models.Entity).filter_by(sprite_id='token').one().hp = 7
            db.commit()
    outcome = resolve_sprite_write(attempt)
    assert outcome.committed is committed and outcome.authorized
    scope = attempt.scopes[0]
    entity = outcome.sprites[scope.table_id]['token']
    assert entity is not None
    assert entity.rotation == (30 if committed else 0)
    assert entity.hp == (7 if committed else None)
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == int(committed)


def test_expired_undo_body_still_proves_the_original_commit(staged):
    factory, command = staged
    SpriteEditorCommandService(factory).persist(**command)
    with factory() as db:
        row = db.query(models.CanvasCommandJournal).one()
        row.changes, row.changes_bytes, row.state = None, 0, 'expired'
        row.created_at = utc_now() - timedelta(days=3)
        db.commit()
    outcome = resolve_sprite_write(PendingSpriteWrite.create([command], factory))
    assert outcome.committed and outcome.receipts[command['scope'].operation_id]['resync_required']


def test_missing_known_acceptance_never_becomes_a_rejection(staged):
    factory, command = staged
    attempt = PendingSpriteWrite.create([command], factory)
    attempt.accepted = True
    with pytest.raises(SpriteWriteUnknown, match='disappeared'):
        resolve_sprite_write(attempt)


def test_changed_journal_identity_cannot_settle_the_original(staged):
    factory, command = staged
    SpriteEditorCommandService(factory).persist(**command)
    with factory() as db:
        db.query(models.CanvasCommandJournal).one().request_hash = 'different'
        db.commit()
    with pytest.raises(SpriteWriteUnknown, match='identity'):
        resolve_sprite_write(PendingSpriteWrite.create([command], factory))


def test_partial_run_is_ambiguous_even_when_every_current_sprite_matches(staged):
    factory, command = staged
    SpriteEditorCommandService(factory).persist(**command)
    second = copy.copy(command)
    second['scope'] = SpriteCommandScope.from_message(Message(MessageType.SPRITE_ROTATE, {
        'table_id': command['scope'].table_id, 'sprite_id': 'token', 'rotation': 30}),
        command['scope'].session_id, command['scope'].actor_id)
    with pytest.raises(SpriteWriteUnknown, match='part'):
        resolve_sprite_write(PendingSpriteWrite.create([command, second], factory))


def test_deleted_original_table_cannot_prove_unrecorded_rejection(staged):
    factory, command = staged
    with factory() as db:
        db.delete(db.query(models.VirtualTable).one())
        db.commit()
    with pytest.raises(SpriteWriteUnknown, match='disappeared'):
        resolve_sprite_write(PendingSpriteWrite.create([command], factory))
