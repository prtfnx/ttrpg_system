"""Pipelined intent uses committed actor-scoped predecessors as version fences."""
import copy
import re
import uuid

import pytest
from database import crud, models
from service.canvas_command_service import CanvasRejected, sprite_transform
from sqlalchemy import event
from tests.unit.test_canvas_command_service import PAINT
from tests.unit.test_canvas_command_service import scene as scene


def after(command, operation_id):
    return {**copy.deepcopy(command), "members": [
        {**member, "after_operation_id": operation_id} for member in command["members"]]}


def test_twenty_mixed_edits_pipeline_with_separate_undo_and_exact_retry(scene):
    original = scene["command"]()
    previous = None
    for step in range(20):
        command = {**copy.deepcopy(original), "operation_id": str(uuid.uuid4())}
        if previous:
            command = after(command, previous)
        scene["execute"](command)
        previous = command["operation_id"]
    assert scene["table"]["table"].find_entity_by_sprite_id("sprite").position == (210, 420)
    replay = scene["execute"](command)
    assert replay.replayed and not replay.events and replay.receipt["resync_required"]
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 21
        assert db.query(models.CanvasCommandJournal).count() == 20
    for step in range(19, -1, -1):
        scene["execute"](scene["command"]("undo"))
        assert scene["table"]["table"].find_entity_by_sprite_id("sprite").position == (10 + step * 10, 20 + step * 20)


def test_denied_predecessor_does_not_apply_or_journal_its_dependents(scene):
    rejected = scene["command"]()
    rejected["members"][0]["version"] = 999
    with pytest.raises(CanvasRejected, match="changed"):
        scene["execute"](rejected)
    child = after(scene["command"](), rejected["operation_id"])
    with pytest.raises(CanvasRejected) as error:
        scene["execute"](child)
    assert error.value.code == "dependency_failed"
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0
        assert db.get(models.PaintObject, PAINT).version == 1
    # A new identity and freshly rebased intent remain independently valid.
    assert scene["execute"]().receipt["success"]


def test_intervening_remote_mutation_conflicts_instead_of_rebasing_over_it(scene, co_dm_user):
    with scene["factory"].begin() as db:
        db.add(models.GamePlayer(session_id=scene["session"], user_id=co_dm_user.id, role="co_dm"))
    first = scene["command"]()
    scene["execute"](first)
    child = after(scene["command"](), first["operation_id"])
    scene["execute"](actor_id=co_dm_user.id)
    with pytest.raises(CanvasRejected) as error:
        scene["execute"](child)
    assert error.value.code == "conflict"
    assert scene["table"]["table"].find_entity_by_sprite_id("sprite").position == (30, 60)
    # A different actor cannot use another actor's predecessor token.
    with pytest.raises(CanvasRejected) as error:
        scene["execute"](child, actor_id=co_dm_user.id)
    assert error.value.code == "dependency_failed"


def test_different_members_can_depend_on_different_committed_commands(scene):
    paint = scene["command"]()
    sprite = scene["command"]()
    paint["members"] = paint["members"][:1]
    sprite["members"] = sprite["members"][1:]
    scene["execute"](paint)
    scene["execute"](sprite)
    combined = scene["command"]()
    combined["members"][0]["after_operation_id"] = paint["operation_id"]
    combined["members"][1]["after_operation_id"] = sprite["operation_id"]
    assert scene["execute"](combined).receipt["success"]


def test_disjoint_predecessors_share_one_journal_read(scene, test_db_engine):
    table = scene["table"]["table"]
    identifiers = [f"branch-{index}" for index in range(8)]
    for index, identifier in enumerate(identifiers):
        table.add_entity({"sprite_id": identifier, "x": 100 + index * 50, "y": 300})
    with scene["factory"]() as db:
        crud.save_table_to_db(db, table, scene["session"])
    parents = []
    for identifier in identifiers:
        target = scene["table"]["table"].find_entity_by_sprite_id(identifier)
        command = scene["command"]("sprite_edit", members=[{"kind": "sprite", "id": identifier,
            "expected": sprite_transform(target)}], edit={"rotation": 10})
        scene["execute"](command)
        parents.append(command["operation_id"])
    combined = scene["command"]("transform", members=[{"kind": "sprite", "id": identifier,
        "expected": sprite_transform(scene["table"]["table"].find_entity_by_sprite_id(identifier)),
        "after_operation_id": parent} for identifier, parent in zip(identifiers, parents, strict=True)])
    reads = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT") and re.search(
                r"\bcanvas_command_journal\.changes\b", statement.partition("FROM")[0]):
            reads.append(statement)

    event.listen(test_db_engine, "before_cursor_execute", capture)
    try:
        result = scene["execute"](combined)
    finally:
        event.remove(test_db_engine, "before_cursor_execute", capture)
    assert result.receipt["success"]
    # One lookup for this operation's retry identity plus one bounded query for
    # all eight predecessor deltas, independent of the number of branches.
    assert len(reads) == 2
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 9
        loaded, ok = crud.load_table_from_db(db, combined["table_id"])
        for index, identifier in enumerate(identifiers):
            assert ok and loaded.find_entity_by_sprite_id(identifier).position == (110 + index * 50, 320)


def test_predecessor_fence_survives_reload_and_numeric_storage_normalization(scene):
    first = scene["command"]()
    scene["execute"](first)
    child = after(scene["command"](), first["operation_id"])
    with scene["factory"]() as db:
        loaded, ok = crud.load_table_from_db(db, first["table_id"])
        assert ok
    scene["table"]["table"] = loaded
    assert scene["execute"](child).receipt["success"]


@pytest.mark.parametrize("field,value", [("hp", 9), ("metadata", '{"note":"remote"}')])
def test_unrelated_remote_stats_are_preserved_without_false_pipeline_conflicts(scene, field, value):
    first = scene["command"]()
    scene["execute"](first)
    child = after(scene["command"](), first["operation_id"])
    table = scene["table"]["table"]
    setattr(table.find_entity_by_sprite_id("sprite"), field, value)
    with scene["factory"]() as db:
        crud.save_table_to_db(db, table, scene["session"])
    result = scene["execute"](child)
    assert getattr(result.table.find_entity_by_sprite_id("sprite"), field) == value
    assert result.table.find_entity_by_sprite_id("sprite").position == (30, 60)
    with scene["factory"]() as db:
        loaded, ok = crud.load_table_from_db(db, first["table_id"])
        assert ok and getattr(loaded.find_entity_by_sprite_id("sprite"), field) == value


@pytest.mark.parametrize("field,value", [("layer", "map"), ("obstacle_type", "polygon"),
    ("obstacle_data", {"vertices": [[0, 0], [5, 0], [0, 5]]})])
def test_intervening_layer_or_shape_changes_still_conflict(scene, field, value):
    first = scene["command"]()
    scene["execute"](first)
    child = after(scene["command"](), first["operation_id"])
    setattr(scene["table"]["table"].find_entity_by_sprite_id("sprite"), field, value)
    with pytest.raises(CanvasRejected) as error:
        scene["execute"](child)
    assert error.value.code == "conflict"


@pytest.mark.parametrize("mode", ["copy", "delete", "cut"])
def test_destructive_and_clipboard_commands_cannot_supply_dependencies(scene, mode):
    command = after(scene["command"](mode), str(uuid.uuid4()))
    with pytest.raises(CanvasRejected) as error:
        scene["execute"](command)
    assert error.value.code == "invalid_payload"


@pytest.mark.parametrize("predecessor", [None, "bad-id", "self", "unrelated", "undone"])
def test_invalid_or_unavailable_predecessors_cannot_bypass_validation(scene, predecessor):
    first = scene["command"]()
    scene["execute"](first)
    command = scene["command"]()
    if predecessor == "self":
        predecessor = command["operation_id"]
    elif predecessor == "unrelated":
        command["members"] = command["members"][1:]
        command["members"][0]["id"] = "other"
        scene["table"]["table"].add_entity({"sprite_id": "other", "x": 100, "y": 100})
        predecessor = first["operation_id"]
    elif predecessor == "undone":
        scene["execute"](scene["command"]("undo"))
        predecessor = first["operation_id"]
    command = after(command, predecessor)
    with pytest.raises(CanvasRejected):
        scene["execute"](command)
