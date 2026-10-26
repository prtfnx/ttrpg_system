"""Legacy editor writes share durable history without reversing combat/stat edits."""
import copy
import json
import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from core_table.protocol import Message, MessageType
from core_table.table import VirtualTable
from database import crud, models
from service.canvas_command_service import CanvasCommandService, CanvasRejected
from service.paint_operation_cleanup import cleanup_expired_paint_operations
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
        assert entity is not None and entity.metadata is not None
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
            assert ok and loaded is not None and loaded.to_dict() == table.to_dict()


def test_retry_returns_fresh_history_not_old_sprite_data_and_checks_identity(editor):
    service, _, factory, _, edit, history = editor
    context, receipt = edit("Changed", 2)
    assert receipt["can_undo"]
    history("undo")
    replay = SpriteEditorCommandService(factory, writes_enabled=True).replay(context)
    assert replay is not None
    assert replay["resync_required"] and replay["can_redo"] and "sprite_data" not in replay
    changed = SpriteCommandScope(context.session_id, context.actor_id, context.table_id,
        context.operation_id, "different", True, context.issued_at_seconds)
    with pytest.raises(CanvasRejected, match="reused"):
        service.replay(changed)


def test_commit_timing_includes_slow_transaction_completion(editor):
    import time

    from utils.action_diagnostics import ActionDiagnostics, current_action_diagnostics
    _service, _table, factory, _scope, edit, _history = editor
    stats = ActionDiagnostics()
    token = current_action_diagnostics.set(stats)
    engine = factory.kw["bind"]
    def slow_commit(_connection):
        time.sleep(0.02)
    event.listen(engine, "commit", slow_commit)
    try:
        edit("Changed", 2)
    finally:
        event.remove(engine, "commit", slow_commit)
        current_action_diagnostics.reset(token)
    assert stats.commit_count == 1 and stats.fields()["commit_ms"] >= 20


def test_bulk_run_rechecks_each_command_authorization_and_rolls_back_on_revocation(editor, monkeypatch):
    service, table, factory, scope, _, _ = editor
    original = service._role
    checked = []
    def authorize(db, context):
        checked.append(context.operation_id)
        if len(checked) == 2:
            raise CanvasRejected("forbidden", "Actor revoked")
        return original(db, context)
    monkeypatch.setattr(service, "_role", authorize)
    commands = []
    for angle in (10, 20):
        staged = copy.deepcopy(table)
        staged.find_entity_by_sprite_id("text").rotation = angle
        commands.append(dict(scope=scope(MessageType.SPRITE_ROTATE, rotation=angle),
            before_snapshot=table.to_dict(), staged=staged))
    with pytest.raises(CanvasRejected, match="revoked"):
        service.persist_many(commands)
    assert len(checked) == 2
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0
        assert db.query(models.Entity).one().rotation == 0


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
        assert ok and loaded is not None and loaded.to_dict() == table.to_dict()


@pytest.mark.parametrize("metadata", ["a" * 61_440, "😀" * 16000, '"' * 32000], ids=["ascii", "utf8-unicode", "escaped-quotes"])
def test_oversized_wire_publication_rejects_before_snapshot_and_history_writes(editor, metadata):
    service, table, factory, scope, _, _ = editor
    staged = copy.deepcopy(table)
    staged.find_entity_by_sprite_id("text").metadata = metadata
    # UTF-8 bytes and JSON string escaping both count toward the wire budget.
    with pytest.raises(CanvasRejected, match="WebSocket frame budget"):
        service.persist(scope=scope(metadata=metadata), before_snapshot=table.to_dict(), staged=staged)
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0
        loaded, ok = crud.load_table_from_db(db, str(table.table_id))
        assert ok and loaded is not None and loaded.to_dict() == table.to_dict()


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


def test_expired_original_create_cannot_resurrect_deleted_sprite_after_real_cleanup(editor):
    service, table, factory, scope, _, _ = editor
    created = copy.deepcopy(table)
    created.add_entity({"sprite_id": "retry-target", "x": 200, "y": 200, "width": 20, "height": 20})
    create_scope = scope(MessageType.SPRITE_CREATE, sprite_id="retry-target", sprite_data={"sprite_id": "retry-target"})
    service.persist(scope=create_scope, before_snapshot=table.to_dict(), staged=created)
    removed = copy.deepcopy(created)
    removed.remove_entity(removed.find_entity_by_sprite_id("retry-target").entity_id)
    service.persist(scope=scope(MessageType.SPRITE_REMOVE, sprite_id="retry-target"),
        before_snapshot=created.to_dict(), staged=removed)
    later = datetime.fromtimestamp(create_scope.issued_at_seconds, UTC).replace(tzinfo=None) + timedelta(days=3)
    cleanup_expired_paint_operations(session_factory=factory, now=lambda: later)
    restarted = SpriteEditorCommandService(factory, writes_enabled=True, now=lambda: later)
    with pytest.raises(CanvasRejected, match="intent expired"):
        restarted.replay(create_scope)
    with pytest.raises(CanvasRejected, match="intent expired"):
        restarted.persist(scope=create_scope, before_snapshot=removed.to_dict(), staged=created)
    with factory() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0
        loaded, ok = crud.load_table_from_db(db, str(table.table_id))
        assert ok and loaded is not None
        assert loaded.find_entity_by_sprite_id("retry-target") is None


@pytest.mark.parametrize("issued_at", [None, True, float("nan"), float("inf"), -1, 9_007_199_254_741])
def test_invalid_sprite_intent_fails_before_opening_database(editor, issued_at):
    _, table, _, scope, _, _ = editor
    def unavailable():
        pytest.fail("Invalid intent must not open a transaction")
    service = SpriteEditorCommandService(unavailable, writes_enabled=True)
    context = replace(scope(), issued_at_seconds=issued_at)
    with pytest.raises(CanvasRejected, match="original sprite timestamp"):
        service.replay(context)
    with pytest.raises(CanvasRejected, match="original sprite timestamp"):
        service.persist(scope=context, before_snapshot=table.to_dict(), staged=copy.deepcopy(table))


def test_sprite_timestamp_cannot_be_refreshed_under_an_existing_message_identity(editor):
    service, _, _, _, edit, _ = editor
    context, _ = edit("Accepted", 2)
    message = Message(MessageType.SPRITE_UPDATE, {"table_id": context.table_id, "sprite_id": "text"}, timestamp=context.issued_at_seconds)
    first = SpriteCommandScope.from_message(message, context.session_id, context.actor_id)
    assert first is not None and message.timestamp is not None
    message.timestamp = message.timestamp + 1
    refreshed = SpriteCommandScope.from_message(message, context.session_id, context.actor_id)
    assert refreshed is not None
    assert first.operation_id == refreshed.operation_id and first.request_hash != refreshed.request_hash
    with pytest.raises(CanvasRejected, match="reused"):
        service.replay(replace(context, request_hash=refreshed.request_hash, issued_at_seconds=refreshed.issued_at_seconds))


def test_future_sprite_intent_rejects_with_a_fixed_clock(editor):
    _, _, factory, scope, _, _ = editor
    context = scope()
    current = datetime.fromtimestamp(context.issued_at_seconds, UTC).replace(tzinfo=None)
    service = SpriteEditorCommandService(factory, writes_enabled=True, now=lambda: current)
    with pytest.raises(CanvasRejected, match="intent expired"):
        service.replay(replace(context, issued_at_seconds=context.issued_at_seconds + 61))


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


@pytest.mark.parametrize("unrelated_count", [0, 100])
def test_sprite_edit_only_updates_affected_rows(editor, unrelated_count):
    service, table, factory, scope, _, _ = editor
    with factory() as db:
        session_id = db.query(models.VirtualTable).filter_by(table_id=str(table.table_id)).one().session_id
        for index in range(unrelated_count):
            table.add_entity({"sprite_id": f"untouched-{index}", "x": index + 200, "y": 300})
        crud.save_table_to_db(db, table, session_id)
        timestamps = {row.sprite_id: row.updated_at for row in db.query(models.Entity).all()}
    statements = []
    engine = factory.kw["bind"]

    def capture(_conn, _cursor, sql, _parameters, _context, _many):
        statements.append(sql)

    staged = copy.deepcopy(table)
    staged.find_entity_by_sprite_id("text").rotation = 45
    event.listen(engine, "before_cursor_execute", capture)
    try:
        service.persist(scope=scope(MessageType.SPRITE_ROTATE, rotation=45),
            before_snapshot=table.to_dict(), staged=staged)
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert len(statements) < 30  # Independent of unrelated table population.
    with factory() as db:
        assert all(row.updated_at == timestamps[row.sprite_id]
            for row in db.query(models.Entity).all() if row.sprite_id != "text")
        loaded, ok = crud.load_table_from_db(db, str(table.table_id))
        assert ok and loaded is not None and loaded.to_dict() == staged.to_dict()
