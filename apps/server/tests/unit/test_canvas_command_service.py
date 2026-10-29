import copy
import json
import math
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from core_table.table import VirtualTable
from database import crud, models
from service import canvas_command_service as module
from service.canvas_command_service import CanvasCommandService, CanvasRejected, sprite_transform
from service.paint_object_service import PaintCommandResult, PaintObjectService
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker

TABLE = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a"
PAINT = "dd830253-e2bf-4a92-9862-eabe85f79c99"
IDENTITY = {"dx": 0, "dy": 0, "scale": 1, "rotation": 0, "pivot_x": 0, "pivot_y": 0}


@pytest.fixture
def scene(test_db, test_db_engine, test_game_session, test_user):
    factory = sessionmaker(bind=test_db_engine)
    table = VirtualTable("Canvas", 1000, 1000, table_id=TABLE)
    table.snap_to_grid = False
    table.add_entity(
        {
            "sprite_id": "sprite",
            "x": 10,
            "y": 20,
            "width": 20,
            "height": 10,
            "name": "Text",
            "controlled_by": [test_user.id],
            "metadata": '{"saved":"Unicode РџСЂРёРІС–С‚"}',
        }
    )
    crud.save_table_to_db(test_db, table, test_game_session.id)
    paint = {
        "id": PAINT,
        "kind": "rectangle",
        "geometry": {"kind": "rectangle", "width": 20, "height": 10},
        "transform": {"x": 50, "y": 60, "scale_x": 1, "scale_y": 1},
        "style": {"stroke_rgba": [1, 0, 0, 1], "width": 2, "fill_rgba": None},
    }
    # Seed an existing scene through the trusted composition API. Seeding is
    # not a standalone user action in the journal under test.
    with factory.begin() as db:
        result = PaintObjectService(factory, writes_enabled=True).apply_in_transaction(
            db, "create", session_id=test_game_session.id, actor_id=test_user.id,
            table_id=TABLE, operation_id=str(uuid.uuid4()), editable=paint,
        )
    assert result.error is None
    service = CanvasCommandService(factory, writes_enabled=True)
    current = {"table": table}

    def members():
        with factory() as db:
            paint_object = db.get(models.PaintObject, PAINT)
            assert paint_object is not None
            version = paint_object.version
        entity = current["table"].find_entity_by_sprite_id("sprite")
        assert entity is not None
        return [
            {"kind": "paint", "id": PAINT, "version": version},
            {
                "kind": "sprite",
                "id": "sprite",
                "expected": sprite_transform(entity),
            },
        ]

    def command(mode="transform", **values):
        base = {
            "operation_id": str(uuid.uuid4()),
            "table_id": TABLE,
            "mode": mode,
            "issued_at": datetime.now(UTC).timestamp() * 1000,
        }
        if mode in {"transform", "delete", "copy", "cut"}:
            base["members"] = members()
        if mode == "transform":
            base["transform"] = {**IDENTITY, "dx": 10, "dy": 20}
        return {**base, **values}

    def execute(value=None, actor_id=None, **kwargs):
        result = service.execute(
            session_id=test_game_session.id,
            actor_id=actor_id or test_user.id,
            command=value or command(),
            table_snapshot=current["table"].to_dict(),
            **kwargs,
        )
        if result.table is not None:
            current["table"] = result.table
        return result

    return {
        "factory": factory,
        "table": current,
        "service": service,
        "command": command,
        "execute": execute,
        "members": members,
        "actor": test_user.id,
        "session": test_game_session.id,
    }


def test_mixed_transform_is_one_durable_history_step_across_service_restart(scene):
    result = scene["execute"]()
    assert result.receipt["can_undo"] and not result.receipt["can_redo"]
    assert [event["type"] for event in result.events] == ["paint_object_event", "sprite_update"]
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).transform["x"] == 60
        loaded, ok = crud.load_table_from_db(db, TABLE)
        assert ok and loaded is not None
        entity = loaded.find_entity_by_sprite_id("sprite")
        assert entity is not None and entity.position == (20, 40)
    restarted = CanvasCommandService(scene["factory"], writes_enabled=True)
    undo = restarted.execute(
        session_id=scene["session"],
        actor_id=scene["actor"],
        command=scene["command"]("undo"),
        table_snapshot=loaded.to_dict(),
    )
    assert undo.table is not None
    entity = undo.table.find_entity_by_sprite_id("sprite")
    assert entity is not None and entity.position == (10, 20)
    assert undo.receipt["can_redo"] and not undo.receipt["can_undo"]
    redo = restarted.execute(
        session_id=scene["session"],
        actor_id=scene["actor"],
        command=scene["command"]("redo"),
        table_snapshot=undo.table.to_dict(),
    )
    assert redo.table is not None
    entity = redo.table.find_entity_by_sprite_id("sprite")
    assert entity is not None and entity.position == (20, 40)
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 4


def test_identical_retry_returns_receipt_and_requests_fresh_state_without_old_events(scene):
    command = scene["command"]()
    first = scene["execute"](command)
    retry = scene["execute"](command)
    assert first.events
    assert retry.replayed and retry.table is None and not retry.events
    assert retry.receipt["resync_required"]
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 2
        assert db.query(models.CanvasCommandJournal).count() == 1
    with pytest.raises(CanvasRejected, match="different canvas command"):
        scene["execute"]({**command, "transform": {**IDENTITY, "dx": 100}})


def test_missing_canonical_paint_event_rolls_back_the_composed_command(scene, monkeypatch):
    paint_service = scene["service"].paint
    apply = paint_service.apply_in_transaction
    before = copy.deepcopy(scene["table"]["table"].to_dict())

    def omit_event(*args, **kwargs):
        result = apply(*args, **kwargs)
        assert result.error is None
        return PaintCommandResult()

    monkeypatch.setattr(paint_service, "apply_in_transaction", omit_event)
    with pytest.raises(RuntimeError, match="without a canonical event"):
        scene["execute"]()
    assert scene["table"]["table"].to_dict() == before
    with scene["factory"]() as db:
        paint = db.get(models.PaintObject, PAINT)
        assert paint is not None and paint.version == 1
        assert db.query(models.CanvasCommandJournal).count() == 0
        loaded, ok = crud.load_table_from_db(db, TABLE)
        assert ok and loaded is not None and loaded.to_dict() == before


def sprite_edit_command(scene, edit):
    return scene["command"]("sprite_edit", members=scene["members"]()[1:], edit=edit)


def test_absolute_sprite_edits_persist_geometry_and_share_durable_history(scene):
    sprite = scene["table"]["table"].find_entity_by_sprite_id("sprite")
    sprite.obstacle_type = "polygon"
    sprite.obstacle_data = {"vertices": [[10, 20], [30, 20], [30, 30]]}
    original = copy.deepcopy(sprite.to_dict())
    result = scene["execute"](sprite_edit_command(scene, {"width": 40, "height": 20, "rotation": 90}))
    accepted = result.table.find_entity_by_sprite_id("sprite")
    assert (accepted.width, accepted.height, accepted.rotation) == (40, 20, 90)
    for actual, expected in zip(accepted.obstacle_data["vertices"], [[40, 10], [40, 50], [20, 50]], strict=True):
        assert actual == pytest.approx(expected)
    assert result.receipt["can_undo"]
    with scene["factory"]() as db:
        loaded, ok = crud.load_table_from_db(db, TABLE)
        assert ok and loaded is not None
        persisted = loaded.find_entity_by_sprite_id("sprite")
        assert persisted is not None and persisted.obstacle_data == accepted.obstacle_data
    undone = scene["execute"](scene["command"]("undo"))
    assert undone.table.find_entity_by_sprite_id("sprite").to_dict() == original
    redone = scene["execute"](scene["command"]("redo"))
    assert redone.table.find_entity_by_sprite_id("sprite").to_dict() == accepted.to_dict()


def test_layer_edit_reindexes_and_publishes_filtered_remove_before_upsert(scene):
    result = scene["execute"](sprite_edit_command(scene, {"layer": "dungeon_master"}))
    assert [(value["type"], value["layer"]) for value in result.events] == [
        ("sprite_remove", "tokens"), ("sprite_update", "dungeon_master"),
    ]
    assert "sprite_data" not in result.events[0]["data"]
    sprite = result.table.find_entity_by_sprite_id("sprite")
    assert not result.table.entity_index["tokens"].get((10, 20))
    assert result.table.entity_index["dungeon_master"][(10, 20)] == [sprite.entity_id]
    undo = scene["execute"](scene["command"]("undo"))
    assert [(value["type"], value["layer"]) for value in undo.events] == [
        ("sprite_remove", "dungeon_master"), ("sprite_update", "tokens"),
    ]
    assert not undo.table.entity_index["dungeon_master"].get((10, 20))


def test_layer_edit_rechecks_destination_permissions(scene):
    with scene["factory"].begin() as db:
        player = models.User(username="layer-player", hashed_password="x")
        db.add(player)
        db.flush()
        actor = player.id
        db.add(models.GamePlayer(session_id=scene["session"], user_id=actor, role="player"))
    scene["table"]["table"].find_entity_by_sprite_id("sprite").controlled_by = [actor]
    with pytest.raises(CanvasRejected, match="not visible"):
        scene["execute"](sprite_edit_command(scene, {"layer": "dungeon_master"}), actor_id=actor)


@pytest.mark.parametrize("edit", [{}, {"width": 10}, {"height": 10}, {"width": -1, "height": 10},
    {"rotation": True}, {"rotation": 181}, {"layer": "unknown"}, {"controlled_by": [42]}])
def test_invalid_sprite_edits_leave_storage_and_history_unchanged(scene, edit):
    before = scene["table"]["table"].to_dict()
    with pytest.raises(CanvasRejected):
        scene["execute"](sprite_edit_command(scene, edit))
    assert scene["table"]["table"].to_dict() == before
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0


def test_missing_session_read_rejects_without_advancing_scene_or_history(scene, monkeypatch):
    original_get = Session.get
    def get(db, entity, ident, **kwargs):
        return None if entity is models.GameSession else original_get(db, entity, ident, **kwargs)
    monkeypatch.setattr(Session, "get", get)
    before = scene["table"]["table"].to_dict()
    with pytest.raises(CanvasRejected, match="Session no longer exists"):
        scene["execute"](sprite_edit_command(scene, {"rotation": 90}))
    assert scene["table"]["table"].to_dict() == before
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0


def test_sprite_edit_fences_stale_state_combat_and_occupied_layers(scene):
    command = sprite_edit_command(scene, {"rotation": 90})
    command["members"][0]["expected"]["width"] = 999
    with pytest.raises(CanvasRejected, match="sprite changed"):
        scene["execute"](command)
    with pytest.raises(CanvasRejected, match="Combat tokens"):
        scene["execute"](sprite_edit_command(scene, {"rotation": 90}), combat_sprite_ids=("sprite",))
    scene["table"]["table"].add_entity({"sprite_id": "occupied", "layer": "map", "x": 10, "y": 20})
    with pytest.raises(CanvasRejected, match="occupied"):
        scene["execute"](sprite_edit_command(scene, {"layer": "map"}))


def test_late_member_failure_rolls_back_paint_revision_ledger_and_sprite_snapshot(scene):
    table = scene["table"]["table"]
    table.add_entity({"sprite_id": "occupied", "x": 20, "y": 40})
    before = copy.deepcopy(table.to_dict())
    with pytest.raises(CanvasRejected, match="occupied"):
        scene["execute"]()
    assert table.to_dict() == before
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 1
        assert db.get(models.PaintState, TABLE).revision == 1
        assert db.query(models.PaintOperationResult).count() == 1
        assert db.query(models.CanvasCommandJournal).count() == 0


def test_group_can_move_into_another_members_vacated_anchor(scene):
    table = scene["table"]["table"]
    table.add_entity({"sprite_id": "second", "x": 20, "y": 40, "width": 20, "height": 10})
    members = scene["members"]() + [
        {"kind": "sprite", "id": "second", "expected": sprite_transform(table.find_entity_by_sprite_id("second"))}
    ]
    result = scene["execute"](scene["command"](members=members))
    assert result.table.find_entity_by_sprite_id("sprite").position == (20, 40)
    assert result.table.find_entity_by_sprite_id("second").position == (30, 60)


def test_stale_selection_rejects_the_entire_command(scene):
    command = scene["command"]()
    command["members"][0]["version"] = 100
    with pytest.raises(CanvasRejected, match="paint object changed"):
        scene["execute"](command)
    command = scene["command"]()
    command["members"][1]["expected"]["x"] = 900
    with pytest.raises(CanvasRejected, match="sprite changed"):
        scene["execute"](command)


def test_history_checks_only_affected_objects_and_does_not_overwrite_other_members(scene):
    scene["execute"]()
    scene["table"]["table"].add_entity({"sprite_id": "unrelated", "x": 800, "y": 800, "name": "Remote edit"})
    result = scene["execute"](scene["command"]("undo"))
    assert result.table.find_entity_by_sprite_id("unrelated").name == "Remote edit"


def test_history_conflict_leaves_scene_and_stacks_unchanged(scene):
    scene["execute"]()
    scene["table"]["table"].find_entity_by_sprite_id("sprite").rotation = 90
    with pytest.raises(CanvasRejected, match="another edit"):
        scene["execute"](scene["command"]("undo"))
    history = scene["service"].history(session_id=scene["session"], actor_id=scene["actor"], table_id=TABLE)
    assert history["can_undo"] and not history["can_redo"]
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 2


def test_multiple_local_steps_can_undo_and_redo_despite_monotonic_paint_versions(scene):
    scene["execute"]()
    scene["execute"]()
    for _ in range(2):
        scene["execute"](scene["command"]("undo"))
    assert scene["table"]["table"].find_entity_by_sprite_id("sprite").position == (10, 20)
    for _ in range(2):
        scene["execute"](scene["command"]("redo"))
    assert scene["table"]["table"].find_entity_by_sprite_id("sprite").position == (30, 60)


def test_copy_cut_and_paste_use_captured_server_content_and_new_ids(scene):
    copied = scene["execute"](scene["command"]("copy"))
    assert not copied.events and not copied.receipt["can_undo"]
    original_members = scene["members"]()
    scene["execute"](scene["command"]("cut", members=original_members))
    new_paint, new_sprite = str(uuid.uuid4()), str(uuid.uuid4())
    pasted = scene["execute"](
        scene["command"](
            "paste",
            clipboard_id=copied.receipt["clipboard_id"],
            ids=[
                {"kind": "paint", "source_id": PAINT, "id": new_paint},
                {"kind": "sprite", "source_id": "sprite", "id": new_sprite},
            ],
            transform={**IDENTITY, "dx": 100},
        )
    )
    assert pasted.table.find_entity_by_sprite_id(new_sprite).position == (110, 20)
    assert pasted.table.find_entity_by_sprite_id(new_sprite).metadata.startswith('{"saved"')
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, new_paint).created_by == scene["actor"]
        assert db.get(models.PaintObject, new_paint).version == 1
        assert db.get(models.PaintObject, PAINT) is None


@pytest.mark.parametrize("archive_source", [False, True])
def test_paste_rechecks_character_source_instead_of_restoring_clipboard_stats(scene, archive_source):
    table = scene["table"]["table"]
    token = table.find_entity_by_sprite_id("sprite")
    token.character_id, token.hp, token.max_hp, token.ac = "canvas-source", 99, 99, 99
    with scene["factory"]() as db:
        source = models.SessionCharacter(character_id="canvas-source", session_id=scene["session"],
            owner_user_id=scene["actor"], character_name="Hero", version=1,
            character_data=json.dumps({"character_id": "canvas-source", "name": "Hero",
                "data": {"stats": {"hp": 10, "maxHp": 20, "ac": 12}}}))
        db.add(source)
        crud.save_table_to_db(db, table, scene["session"])
    copied = scene["execute"](scene["command"]("copy", members=[scene["members"]()[1]]))
    with scene["factory"]() as db:
        source = db.query(models.SessionCharacter).one()
        source.version = 2
        source.character_data = json.dumps({"character_id": "canvas-source", "name": "Hero",
            "data": {"stats": {"hp": 0, "maxHp": 30, "ac": None}}})
        if archive_source:
            from utils.time import utc_now
            source.archived_at = utc_now()
        db.commit()
    target = str(uuid.uuid4())
    command = scene["command"]("paste", clipboard_id=copied.receipt["clipboard_id"],
        ids=[{"kind": "sprite", "source_id": "sprite", "id": target}], transform={**IDENTITY, "dx": 100})
    if archive_source:
        with pytest.raises(CanvasRejected, match="not found or edit permission denied"):
            scene["execute"](command)
    else:
        result = scene["execute"](command)
        pasted = result.table.find_entity_by_sprite_id(target)
        assert (pasted.hp, pasted.max_hp, pasted.ac) == (0, 30, None)
        assert result.events[0]["data"]["sprite_data"]["hp"] == 0
    with scene["factory"]() as db:
        assert db.query(models.Entity).filter_by(sprite_id=target).count() == (0 if archive_source else 1)
        assert db.query(models.CanvasCommandJournal).count() == (1 if archive_source else 2)
        assert db.query(models.SessionCharacter).one().version == 2


def test_delete_undo_preserves_original_paint_provenance_and_sprite_control(scene):
    before = scene["members"]()
    original_controllers = list(scene["table"]["table"].find_entity_by_sprite_id("sprite").controlled_by)
    scene["execute"](scene["command"]("delete", members=before))
    result = scene["execute"](scene["command"]("undo"))
    assert result.table.find_entity_by_sprite_id("sprite").controlled_by == original_controllers
    with scene["factory"]() as db:
        restored = db.get(models.PaintObject, PAINT)
        assert restored.version == 2 and restored.z_order == 1 and restored.created_by == scene["actor"]


@pytest.mark.parametrize("mode", ["transform", "delete", "cut", "copy"])
def test_authorization_is_current_and_cannot_be_forged_in_members(scene, mode):
    with scene["factory"].begin() as db:
        player = models.User(username="stranger", hashed_password="x")
        db.add(player)
        db.flush()
        actor = player.id
        db.add(models.GamePlayer(session_id=scene["session"], user_id=actor, role="player"))
    with pytest.raises(CanvasRejected, match="creator|control"):
        scene["execute"](scene["command"](mode), actor_id=actor)
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 0


def test_combat_members_cannot_bypass_combat_command_authority(scene):
    with pytest.raises(CanvasRejected, match="Combat tokens"):
        scene["execute"](combat_sprite_ids=("sprite",))


def test_persisted_combat_fences_editor_commands_before_engine_hydration(scene):
    with scene["factory"].begin() as db:
        db.add(models.CombatEncounter(encounter_id=str(uuid.uuid4()), session_id=scene["session"],
            table_id=TABLE, phase="combat", combatants_json='[{"entity_id":"sprite"}]'))
    with pytest.raises(CanvasRejected, match="Combat tokens"):
        scene["execute"]()
    assert scene["execute"](scene["command"]("copy")).receipt["clipboard_id"]


def test_bounded_history_expires_old_deltas_without_deleting_retry_receipts(scene, monkeypatch):
    monkeypatch.setattr(module, "MAX_HISTORY_ENTRIES", 1)
    first = scene["command"]()
    scene["execute"](first)
    scene["execute"]()
    with scene["factory"]() as db:
        rows = db.query(models.CanvasCommandJournal).order_by(models.CanvasCommandJournal.id).all()
        assert rows[0].state == "expired" and rows[0].changes is None
        assert rows[1].changes is not None
    assert scene["execute"](first).replayed


def test_expired_intents_unknown_fields_and_duplicate_members_fail_before_writing(scene):
    command = scene["command"]()
    with pytest.raises(CanvasRejected, match="expired"):
        scene["execute"]({**command, "issued_at": command["issued_at"] - 25 * 3600 * 1000})
    with pytest.raises(CanvasRejected, match="Unknown"):
        scene["execute"]({**command, "actor_id": scene["actor"]})
    with pytest.raises(CanvasRejected, match="duplicate"):
        scene["execute"]({**command, "members": [command["members"][0]] * 2})


def test_commit_failure_leaves_live_scene_and_all_durable_domains_unchanged(scene):
    before = copy.deepcopy(scene["table"]["table"].to_dict())

    def fail_commit(db):
        raise RuntimeError("simulated storage failure")

    event.listen(Session, "before_commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="storage failure"):
            scene["execute"]()
    finally:
        event.remove(Session, "before_commit", fail_commit)
    assert scene["table"]["table"].to_dict() == before
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 1
        assert db.get(models.PaintState, TABLE).revision == 1
        assert db.query(models.CanvasCommandJournal).count() == 0
        loaded, ok = crud.load_table_from_db(db, TABLE)
        assert ok and loaded is not None
        entity = loaded.find_entity_by_sprite_id("sprite")
        assert entity is not None and entity.position == (10, 20)


def test_transform_delete_restore_then_undo_earlier_step_preserves_paint_creation_time(scene):
    with scene["factory"]() as db:
        created = db.get(models.PaintObject, PAINT).created_at
    scene["execute"]()
    scene["execute"](scene["command"]("delete"))
    scene["execute"](scene["command"]("undo"))
    scene["execute"](scene["command"]("undo"))
    with scene["factory"]() as db:
        paint = db.get(models.PaintObject, PAINT)
        assert paint.created_at == created and paint.transform["x"] == 50


def test_uniform_group_resize_and_rotation_share_a_pivot(scene):
    result = scene["execute"](
        scene["command"](
            transform={**IDENTITY, "scale": 2, "rotation": math.pi / 2, "pivot_x": 100, "pivot_y": 100, "dy": 200}
        )
    )
    sprite = result.table.find_entity_by_sprite_id("sprite")
    assert sprite.position == (230, 130)
    assert (sprite.scale_x, sprite.scale_y, sprite.rotation) == (2, 2, 90)
    with scene["factory"]() as db:
        transform = db.get(models.PaintObject, PAINT).transform
        assert transform["x"] == pytest.approx(180)
        assert transform["y"] == pytest.approx(200)
        assert transform["rotation"] == pytest.approx(math.pi / 2)
        assert transform["scale_x"] == transform["scale_y"] == 2


def test_group_out_of_bounds_rolls_back_the_entire_transform(scene):
    with scene["factory"].begin() as db:
        db.get(models.GameSession, scene["session"]).session_rules_json = '{"out_of_bounds_movement":"none"}'
    with pytest.raises(CanvasRejected, match="leave the table"):
        scene["execute"](scene["command"](transform={**IDENTITY, "dx": -500}))
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 1


@pytest.mark.parametrize("policy", ["all", "dm_only", "none"])
@pytest.mark.parametrize("role", ["owner", "co_dm", "player", "trusted_player"])
def test_sprite_boundary_policy_persists_and_reloads_off_table_positions(scene, policy, role):
    with scene["factory"].begin() as db:
        db.get(models.GameSession, scene["session"]).session_rules_json = '{"out_of_bounds_movement":"' + policy + '"}'
        actor = scene["actor"]
        if role != "owner":
            user = models.User(username="boundary-user", hashed_password="x")
            db.add(user)
            db.flush()
            actor = user.id
            db.add(models.GamePlayer(session_id=scene["session"], user_id=actor, role=role))
    scene["table"]["table"].find_entity_by_sprite_id("sprite").controlled_by = [actor]
    command = scene["command"](members=scene["members"]()[1:], transform={**IDENTITY, "dx": -500})
    allowed = policy == "all" or policy == "dm_only" and role in {"owner", "co_dm"}
    if not allowed:
        with pytest.raises(CanvasRejected, match="leave the table"):
            scene["execute"](command, actor_id=actor)
        return
    result = scene["execute"](command, actor_id=actor)
    assert result.table.find_entity_by_sprite_id("sprite").position == (-490, 20)
    with scene["factory"]() as db:
        loaded, ok = crud.load_table_from_db(db, TABLE)
        assert ok and loaded is not None
        entity = loaded.find_entity_by_sprite_id("sprite")
        assert entity is not None and entity.position == (-490, 20)
    scene["execute"](scene["command"]("undo"), actor_id=actor)
    assert scene["table"]["table"].find_entity_by_sprite_id("sprite").position == (10, 20)


def test_copy_does_not_clear_redo_but_a_new_edit_does(scene):
    scene["execute"]()
    scene["execute"](scene["command"]("undo"))
    assert scene["execute"](scene["command"]("copy")).receipt["can_redo"]
    assert not scene["execute"]().receipt["can_redo"]


def test_expired_clipboard_and_other_actor_clipboard_are_not_usable(scene):
    copied = scene["execute"](scene["command"]("copy"))
    paste = scene["command"](
        "paste",
        clipboard_id=copied.receipt["clipboard_id"],
        ids=[
            {"kind": member["kind"], "source_id": member["id"], "id": str(uuid.uuid4())}
            for member in scene["members"]()
        ],
        transform=IDENTITY,
    )
    with scene["factory"].begin() as db:
        row = db.query(models.CanvasCommandJournal).one()
        row.created_at -= timedelta(hours=25)
    with pytest.raises(CanvasRejected, match="Clipboard is unavailable"):
        scene["execute"](paste)


def test_sprite_expected_transform_rejects_boolean_numbers(scene):
    command = scene["command"]()
    command["members"][1]["expected"]["scale_x"] = True
    with pytest.raises(CanvasRejected, match="Invalid or out-of-range"):
        scene["execute"](command)


def test_journal_receipts_do_not_duplicate_large_scene_events(scene):
    scene["execute"]()
    with scene["factory"]() as db:
        assert set(db.query(models.CanvasCommandJournal).one().result_json) == {"receipt"}


def test_history_availability_and_retention_do_not_materialize_scene_deltas(scene):
    scene["execute"]()
    statements = []
    engine = scene["factory"].kw["bind"]

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT") and "canvas_command_journal" in statement:
            statements.append(re.split(r"\bFROM\b", statement, maxsplit=1, flags=re.IGNORECASE)[0])

    event.listen(engine, "before_cursor_execute", capture)
    try:
        state = scene["service"].history(session_id=scene["session"], actor_id=scene["actor"], table_id=TABLE)
        assert state["can_undo"] and not state["can_redo"]
        with scene["factory"].begin() as db:
            scene["service"]._trim(db, TABLE, scene["actor"])
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert len(statements) == 2
    assert all(not re.search(r"\.(changes|result_json)(?:\s|,|$)", statement) for statement in statements)


def test_standalone_paint_creation_resize_restyle_and_deletion_share_durable_history(scene):
    service = PaintObjectService(scene["factory"], writes_enabled=True)
    target = str(uuid.uuid4())
    value = {"id": target, "kind": "rectangle", "geometry": {"kind": "rectangle", "width": 20, "height": 10},
             "transform": {"x": 50, "y": 60, "scale_x": 1, "scale_y": 1},
             "style": {"stroke_rgba": [1, 0, 0, 1], "width": 2, "fill_rgba": None}}
    context = {"session_id": scene["session"], "actor_id": scene["actor"], "table_id": TABLE}
    operation = str(uuid.uuid4())
    context["issued_at"] = datetime.now(UTC).timestamp() * 1000
    assert service.create(**context, operation_id=operation, editable=value).error is None
    assert service.create(**context, operation_id=operation, editable=value).broadcast is False
    value["transform"].update(scale_x=2, scale_y=3, rotation=0.5)
    value["style"]["width"] = 5
    assert service.update(**context, operation_id=str(uuid.uuid4()), object_id=target, expected_version=1, editable=value).error is None
    assert service.delete(**context, operation_id=str(uuid.uuid4()), object_id=target, expected_version=2).error is None
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 3
    for _ in range(3):
        scene["execute"](scene["command"]("undo"))
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, target) is None
    for _ in range(3):
        scene["execute"](scene["command"]("redo"))
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, target) is None


def test_failed_paint_history_write_rolls_back_object_revision_and_retry_ledger(scene, monkeypatch):
    from service import paint_object_service

    def reject(*_args, **_kwargs):
        raise RuntimeError("journal unavailable")

    monkeypatch.setattr(paint_object_service, "record_paint_command", reject)
    service = PaintObjectService(scene["factory"], writes_enabled=True)
    with scene["factory"]() as db:
        from service.canvas_command_service import editable_paint
        value = editable_paint(module._object_dict(db.get(models.PaintObject, PAINT)))
    with pytest.raises(RuntimeError, match="journal unavailable"):
        service.update(issued_at=datetime.now(UTC).timestamp() * 1000, session_id=scene["session"], actor_id=scene["actor"], table_id=TABLE,
                       operation_id=str(uuid.uuid4()), object_id=PAINT, expected_version=1, editable=value)
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).version == 1
        assert db.get(models.PaintState, TABLE).revision == 1
        assert db.query(models.PaintOperationResult).count() == 1
        assert db.query(models.CanvasCommandJournal).count() == 0


def test_group_restyle_is_one_reversible_idempotent_paint_only_command(scene):
    from service.canvas_command_service import editable_paint

    second_id = str(uuid.uuid4())
    with scene["factory"].begin() as db:
        second = editable_paint(module._object_dict(db.get(models.PaintObject, PAINT)))
        second["id"] = second_id
        accepted = PaintObjectService(scene["factory"], writes_enabled=True).apply_in_transaction(
            db, "create", session_id=scene["session"], actor_id=scene["actor"], table_id=TABLE,
            operation_id=str(uuid.uuid4()), editable=second,
        )
        assert accepted.error is None
    style = {"stroke_rgba": [0, 1, 0, 0.5], "width": 6, "fill_rgba": [0, 0, 1, 0.25]}
    members = [{"kind": "paint", "id": PAINT, "version": 1},
               {"kind": "paint", "id": second_id, "version": 1}]
    command = scene["command"]("restyle", members=members, style=style)
    result = scene["execute"](command)
    assert len(result.events) == 2 and result.receipt["can_undo"]
    assert scene["execute"](command).replayed
    with scene["factory"]() as db:
        assert db.query(models.CanvasCommandJournal).count() == 1
        for member in members:
            assert db.get(models.PaintObject, member["id"]).style == style
    scene["execute"](scene["command"]("undo"))
    with scene["factory"]() as db:
        assert all(db.get(models.PaintObject, member["id"]).style["width"] == 2 for member in members)
    scene["execute"](scene["command"]("redo"))
    with scene["factory"]() as db:
        assert all(db.get(models.PaintObject, member["id"]).style == style for member in members)


@pytest.mark.parametrize("invalid", ["stale", "removed", "style", "sprite", "forbidden"])
def test_invalid_restyle_preserves_all_paint_and_history(scene, invalid):
    members = scene["members"]()[:1]
    style = {"stroke_rgba": [0, 1, 0, 1], "width": 6, "fill_rgba": None}
    if invalid == "stale":
        members[0]["version"] = 2
    elif invalid == "removed":
        # A valid first member must not be committed when the second is stale.
        members.append({"kind": "paint", "id": str(uuid.uuid4()), "version": 1})
    elif invalid == "style":
        style["width"] = True
    elif invalid == "sprite":
        members.extend(scene["members"]()[1:])
    else:
        with scene["factory"].begin() as db:
            player = models.User(username="restyle-stranger", hashed_password="x")
            db.add(player)
            db.flush()
            actor = player.id
            db.add(models.GamePlayer(session_id=scene["session"], user_id=actor, role="player"))
    with pytest.raises(CanvasRejected):
        scene["execute"](scene["command"]("restyle", members=members, style=style),
                         actor_id=actor if invalid == "forbidden" else None)
    with scene["factory"]() as db:
        assert db.get(models.PaintObject, PAINT).style["width"] == 2
        assert db.get(models.PaintObject, PAINT).version == 1
        assert db.get(models.PaintState, TABLE).revision == 1
        assert db.query(models.CanvasCommandJournal).count() == 0
