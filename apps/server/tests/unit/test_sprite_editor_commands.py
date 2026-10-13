"""Legacy editor writes share durable history without reversing combat/stat edits."""
import copy
import json
import uuid
from datetime import UTC, datetime

import pytest
from core_table.protocol import Message, MessageType
from core_table.table import VirtualTable
from database import crud, models
from service.canvas_command_service import CanvasCommandService, CanvasRejected
from service.sprite_editor_commands import SpriteCommandScope, SpriteEditorCommandService
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def editor(test_db, test_db_engine, test_game_session, test_user):
    table = VirtualTable("Editor", 1000, 1000)
    descriptor = {"version": 1, "text": "Original", "font_size": 24, "font_family": "sans-serif",
        "font_weight": 400, "font_style": "normal", "color": "#ffffff", "language": "und", "direction": "auto"}
    table.add_entity({"sprite_id": "text", "x": 20, "y": 30, "width": 100, "height": 40,
        "texture_path": "__TEXT__", "controlled_by": [test_user.id],
        "metadata": json.dumps({"text_sprite": descriptor, "text_revision": 1})})
    assert crud.save_table_to_db(test_db, table, test_game_session.id)
    factory = sessionmaker(bind=test_db_engine)
    service = SpriteEditorCommandService(factory, writes_enabled=True)

    def scope(kind=MessageType.SPRITE_UPDATE, **data):
        return SpriteCommandScope.from_message(Message(kind, {"table_id": str(table.table_id),
            "sprite_id": "text", **data}), test_game_session.id, test_user.id)

    def edit(text, revision):
        staged = copy.deepcopy(table)
        entity = staged.find_entity_by_sprite_id("text")
        metadata = json.loads(entity.metadata)
        metadata["text_sprite"]["text"], metadata["text_revision"] = text, revision
        entity.metadata = json.dumps(metadata)
        context = scope(metadata=entity.metadata, expected_text_revision=revision - 1)
        receipt = service.persist(scope=context, before_snapshot=table.to_dict(), staged=staged)
        table.__dict__.update(staged.__dict__)
        return context, receipt

    def history(mode):
        result = CanvasCommandService(factory, writes_enabled=True).execute(session_id=test_game_session.id,
            actor_id=test_user.id, table_snapshot=table.to_dict(), command={"operation_id": str(uuid.uuid4()),
                "table_id": str(table.table_id), "issued_at": datetime.now(UTC).timestamp() * 1000, "mode": mode})
        table.__dict__.update(result.table.__dict__)
        return result

    return service, table, factory, scope, edit, history


def test_text_edits_undo_redo_across_service_restart_keep_revision_monotonic(editor):
    _, table, factory, _, edit, history = editor
    edit("First", 2)
    edit("Другий", 3)
    for mode, text, revision in [("undo", "First", 4), ("undo", "Original", 5),
            ("redo", "First", 6), ("redo", "Другий", 7)]:
        assert history(mode).receipt["success"]
        metadata = json.loads(table.find_entity_by_sprite_id("text").metadata)
        assert metadata["text_sprite"]["text"] == text and metadata["text_revision"] == revision
        with factory() as db:
            loaded, ok = crud.load_table_from_db(db, str(table.table_id))
            assert ok and loaded.to_dict() == table.to_dict()


def test_retry_returns_fresh_history_not_old_sprite_data_and_checks_identity(editor):
    service, _, factory, _, edit, history = editor
    context, receipt = edit("Changed", 2)
    assert receipt["can_undo"]
    history("undo")
    replay = SpriteEditorCommandService(factory, writes_enabled=True).replay(context)
    assert replay["resync_required"] and replay["can_redo"] and "sprite_data" not in replay
    changed = SpriteCommandScope(context.session_id, context.actor_id, context.table_id,
        context.operation_id, "different", True)
    with pytest.raises(CanvasRejected, match="reused"):
        service.replay(changed)


def test_text_history_cannot_overwrite_another_edit(editor):
    _, table, _, _, edit, history = editor
    edit("Accepted", 2)
    entity = table.find_entity_by_sprite_id("text")
    metadata = json.loads(entity.metadata)
    metadata["text_sprite"]["color"] = "#123456"
    entity.metadata = json.dumps(metadata)
    with pytest.raises(CanvasRejected, match="another edit"):
        history("undo")


def test_commit_failure_rolls_back_sprite_and_journal_together(editor):
    service, table, factory, scope, _, _ = editor
    staged = copy.deepcopy(table)
    staged.find_entity_by_sprite_id("text").rotation = 90

    def fail(_db):
        raise RuntimeError("commit failed")

    event.listen(Session, "before_commit", fail)
    try:
        with pytest.raises(RuntimeError, match="commit failed"):
            service.persist(scope=scope(MessageType.SPRITE_ROTATE, rotation=90), before_snapshot=table.to_dict(), staged=staged)
    finally:
        event.remove(Session, "before_commit", fail)
    with factory() as db:
        assert not db.query(models.CanvasCommandJournal).count()
        loaded, ok = crud.load_table_from_db(db, str(table.table_id))
        assert ok and loaded.to_dict() == table.to_dict()


@pytest.mark.parametrize("combat", [False, True])
def test_stats_and_combat_moves_have_retry_receipts_but_no_editor_undo(editor, combat):
    service, table, factory, scope, _, _ = editor
    staged = copy.deepcopy(table)
    staged.find_entity_by_sprite_id("text").rotation = 45
    context = scope(MessageType.SPRITE_ROTATE, rotation=45) if combat else scope(hp=10)
    receipt = service.persist(scope=context, before_snapshot=table.to_dict(), staged=staged,
        combat_sprite_ids=("text",) if combat else ())
    assert not receipt["can_undo"]
    with factory() as db:
        row = db.query(models.CanvasCommandJournal).one()
        assert row.changes is None and row.kind == "sprite_receipt"
    assert service.replay(context)["resync_required"]


def test_noop_has_receipt_without_history_or_redo_abandonment(editor):
    service, table, _, scope, edit, history = editor
    edit("Changed", 2)
    history("undo")
    receipt = service.persist(scope=scope(MessageType.SPRITE_ROTATE, rotation=0),
        before_snapshot=table.to_dict(), staged=copy.deepcopy(table))
    assert receipt["can_redo"] and not receipt["can_undo"]


def test_revoked_membership_is_checked_for_record_and_replay(editor, test_db):
    service, table, factory, _, edit, _ = editor
    context, _ = edit("Changed", 2)
    with factory.begin() as db:
        session = db.get(models.GameSession, context.session_id)
        owner = models.User(username="new-owner", email="new-owner@example.test", hashed_password="not-used")
        db.add(owner)
        db.flush()
        session.owner_id = owner.id
        db.query(models.GamePlayer).filter_by(session_id=context.session_id, user_id=context.actor_id).delete()
    with pytest.raises(CanvasRejected, match="member"):
        service.replay(context)
    with pytest.raises(CanvasRejected, match="member"):
        service.persist(scope=context, before_snapshot=table.to_dict(), staged=copy.deepcopy(table))
