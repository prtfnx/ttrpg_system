"""Real sockets, separate actors and durable convergence on a disposable DB."""
import json
import os
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from core_table.protocol import Message, MessageType
from core_table.table import VirtualTable
from database import crud, models
from database.schema import upgrade_database_to_head
from service.canvas_command_service import sprite_transform
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from tests.integration.latency_proxy import delayed_websocket_proxy
from tests.integration.test_writer_fencing_postgresql import (
    _await_ready,
    _request,
    _start_server,
    _unused_port,
)
from tests.integration.test_writer_fencing_postgresql import database as database
from websockets.sync.client import connect
from websockets.typing import Origin

pytestmark = pytest.mark.integration


@pytest.fixture(params=["sqlite", pytest.param("postgresql", marks=pytest.mark.skipif(
    not os.getenv("TEST_POSTGRESQL_DATABASE_URL"), reason="TEST_POSTGRESQL_DATABASE_URL is not configured"))])
def live_scene(request, tmp_path):
    if request.param == "postgresql":
        engine, url, session_id, table_id = request.getfixturevalue("database")
    else:
        url = make_url("sqlite:///" + (tmp_path / "multiclient-test.db").as_posix())
        upgrade_database_to_head(url)
        engine = create_engine(url)
        with Session(engine) as db:
            owner = models.User(username="owner", hashed_password="not-a-login")
            db.add(owner)
            db.flush()
            game = models.GameSession(name="Game", session_code="FENCED", owner_id=owner.id)
            db.add(game)
            db.flush()
            session_id = game.id
            db.add(models.GamePlayer(session_id=session_id, user_id=owner.id, role="owner"))
            db.commit()
        table_id = str(uuid.uuid4())
    with Session(engine) as db:
        for name, role in (("editor", "co_dm"), ("observer", "spectator")):
            user = models.User(username=name, hashed_password="not-a-login")
            db.add(user)
            db.flush()
            db.add(models.GamePlayer(session_id=session_id, user_id=user.id, role=role))
        db.commit()
        table = VirtualTable("Shared", 1000, 1000, table_id=table_id)
        table.snap_to_grid = False
        table.add_entity({"sprite_id": "original", "x": 100, "y": 100, "width": 20, "height": 20})
        crud.save_table_to_db(db, table, session_id)
    port = _unused_port()
    process = _start_server(url, port, tmp_path / "multiclient-server.log")

    proxy_port = port

    def socket(actor):
        token = jwt.encode({"sub": actor, "sv": 0, "exp": datetime.now(UTC) + timedelta(minutes=5)},
            "isolated-writer-test-signing-key-32-bytes", algorithm="HS256")
        return connect(f"ws://127.0.0.1:{proxy_port}/ws/game/FENCED", proxy=None,
            additional_headers={"Cookie": f"token={token}"}, origin=Origin(f"http://127.0.0.1:{port}"))

    try:
        _await_ready(process, port)
        with delayed_websocket_proxy(f"ws://127.0.0.1:{port}/ws/game/FENCED") as proxy_port:
            yield engine, table_id, socket
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        if request.param == "sqlite":
            engine.dispose()


def receive_until(socket, predicate, timeout=15):
    deadline = time.monotonic() + timeout
    messages = []
    while time.monotonic() < deadline:
        message = json.loads(socket.recv(timeout=max(0.01, deadline - time.monotonic())))
        messages.append(message)
        if predicate(messages):
            return messages
    raise AssertionError("Socket did not reach the expected state")


def snapshot_rotation(message):
    table = VirtualTable("Snapshot", 1000, 1000)
    table.from_dict(message["data"]["table_data"])
    return table.find_entity_by_sprite_id("original").rotation


def test_two_editors_commit_without_waiting_for_receipts_and_observer_recovers(live_scene):
    engine, table_id, socket = live_scene
    barrier = threading.Barrier(2)

    def edit(client, offset):
        commands = [Message(MessageType.SPRITE_ROTATE,
            {"table_id": table_id, "sprite_id": "original", "rotation": offset + index,
                "action_id": str(uuid.uuid4())}).to_dict() for index in range(1, 21)]
        identifiers = {item["message_id"] for item in commands}
        barrier.wait(timeout=5)
        started = time.monotonic()
        client.send(Message(MessageType.BATCH_REQUEST, {"messages": commands, "seq": 1}).to_json())
        # Deliberately delay receipt consumption; server progress cannot depend
        # on a browser applying or confirming the previous result.
        time.sleep(0.1)
        messages = receive_until(client, lambda frames: identifiers <= {item.get("causation_id") for item in frames})
        receipts = [item for item in messages if item.get("causation_id") in identifiers]
        assert len(receipts) == 20 and all(item["data"].get("success") for item in receipts)
        assert [item["causation_id"] for item in receipts] == [item["message_id"] for item in commands]
        return time.monotonic() - started

    with socket("owner") as owner, socket("editor") as editor, socket("observer") as observer:
        _request(observer, "table_request", {"table_id": table_id})
        with ThreadPoolExecutor(max_workers=2) as workers:
            first = workers.submit(edit, owner, 0)
            second = workers.submit(edit, editor, 100)
            messages = receive_until(observer, lambda frames: sum(item["type"] == "sprite_rotate" for item in frames) == 40)
            timings = [first.result(timeout=20), second.result(timeout=20)]
        rotations = [item["data"]["rotation"] for item in messages if item["type"] == "sprite_rotate"]
        with Session(engine) as db:
            assert db.query(models.CanvasCommandJournal).count() == 40
            assert db.query(models.Entity).one().rotation == rotations[-1]
        for client in (owner, editor):
            pong = _request(client, "ping", {})
            assert pong["type"] == "pong"
        snapshot = _request(observer, "table_request", {"table_id": table_id})
        assert snapshot_rotation(snapshot) == rotations[-1]
    with socket("observer") as reconnected:
        snapshot = _request(reconnected, "table_request", {"table_id": table_id})
        assert snapshot_rotation(snapshot) == rotations[-1]
    print(f"MULTICLIENT backend={engine.dialect.name} receipts=40 editor_completion_ms={[round(value * 1000) for value in timings]}")


def test_conflicting_actors_retry_and_permission_denial_preserve_accepted_state(live_scene):
    engine, table_id, socket = live_scene

    def command(mode="transform"):
        with Session(engine) as db:
            table, ok = crud.load_table_from_db(db, table_id)
            assert ok
        data = {"operation_id": str(uuid.uuid4()), "table_id": table_id,
            "issued_at": time.time() * 1000, "mode": mode}
        if mode == "transform":
            data.update(members=[{"kind": "sprite", "id": "original",
                "expected": sprite_transform(table.find_entity_by_sprite_id("original"))}],
                transform={"dx": 10, "dy": 0, "scale": 1, "rotation": 0, "pivot_x": 0, "pivot_y": 0})
        return Message(MessageType.CANVAS_COMMAND, data)

    def result(client, message):
        client.send(message.to_json())
        frames = receive_until(client, lambda frames: any(item.get("causation_id") == message.message_id for item in frames))
        return next(item["data"] for item in frames if item.get("causation_id") == message.message_id)

    with socket("owner") as owner, socket("editor") as editor, socket("observer") as observer:
        first, stale = command(), command()
        assert result(owner, first)["success"]
        rejected = result(editor, stale)
        assert not rejected["success"] and rejected["code"] == "conflict"
        replay = result(owner, first)
        assert replay["success"] and replay["resync_required"]
        assert result(observer, command())["code"] == "forbidden"
        with Session(engine) as db:
            assert db.query(models.CanvasCommandJournal).count() == 1
            assert db.query(models.Entity).one().position_x == 110
        # A new command based on recovered authoritative state is accepted.
        assert result(editor, command())["success"]
        dependent = command()
        dependent.data["members"][0]["after_operation_id"] = first.data["operation_id"]
        assert result(owner, dependent)["code"] == "conflict"
        # Actor-scoped undo cannot overwrite the other actor's later edit.
        assert result(owner, command("undo"))["code"] == "history_conflict"
        assert result(editor, command("undo"))["success"]
        assert result(owner, command("undo"))["success"]
        with Session(engine) as db:
            assert db.query(models.Entity).one().position_x == 100


def test_pipeline_and_sequential_edits_converge_through_delayed_real_sockets(live_scene):
    engine, table_id, socket = live_scene
    with Session(engine) as db:
        table, ok = crud.load_table_from_db(db, table_id)
        assert ok
        expected = sprite_transform(table.find_entity_by_sprite_id("original"))

    def move(previous=None, x=100):
        member = {"kind": "sprite", "id": "original", "expected": {**expected, "x": x}}
        if previous:
            member["after_operation_id"] = previous
        return Message(MessageType.CANVAS_COMMAND, {"operation_id": str(uuid.uuid4()), "table_id": table_id,
            "issued_at": time.time() * 1000, "mode": "transform", "members": [member],
            "transform": {"dx": 5, "dy": 0, "scale": 1, "rotation": 0, "pivot_x": 0, "pivot_y": 0}})

    def receipt(client, message):
        frames = receive_until(client, lambda frames: any(item.get("causation_id") == message.message_id for item in frames))
        return next(item["data"] for item in frames if item.get("causation_id") == message.message_id)

    with socket("owner") as owner, socket("observer") as observer:
        _request(observer, "table_request", {"table_id": table_id})
        commands, previous = [], None
        for _ in range(8):
            message = move(previous)
            commands.append(message)
            previous = message.data["operation_id"]
        identifiers = {message.message_id for message in commands}
        started = time.monotonic()
        for message in commands:
            owner.send(message.to_json())
        frames = receive_until(owner, lambda frames: identifiers <= {item.get("causation_id") for item in frames})
        pipeline_ms = (time.monotonic() - started) * 1000
        results = [item for item in frames if item.get("causation_id") in identifiers]
        assert len(results) == 8 and all(item["data"]["success"] for item in results)
        assert [item["causation_id"] for item in results] == [message.message_id for message in commands]
        peer_events = receive_until(observer, lambda frames: sum(item["type"] == "sprite_update" for item in frames) == 8)
        peer = [item for item in peer_events if item["type"] == "sprite_update"][-1]
        assert peer["data"]["sprite_data"]["position"][0] == 140
        with Session(engine) as db:
            assert db.query(models.Entity).one().position_x == 140
            assert db.query(models.CanvasCommandJournal).count() == 8
        for _ in range(8):
            message = Message(MessageType.CANVAS_COMMAND, {"operation_id": str(uuid.uuid4()), "table_id": table_id,
                "issued_at": time.time() * 1000, "mode": "undo"})
            owner.send(message.to_json())
            assert receipt(owner, message)["success"]
        started = time.monotonic()
        for index in range(8):
            message = move(x=100 + index * 5)
            owner.send(message.to_json())
            assert receipt(owner, message)["success"]
        sequential_ms = (time.monotonic() - started) * 1000
        snapshot = _request(observer, "table_request", {"table_id": table_id})
        table = VirtualTable("Snapshot", 1000, 1000)
        table.from_dict(snapshot["data"]["table_data"])
        assert table.find_entity_by_sprite_id("original").position == (140, 100)
        with Session(engine) as db:
            assert db.query(models.Entity).one().position_x == 140
        # Report measured timings; correctness does not depend on a fragile
        # wall-clock performance assertion on a loaded CI machine.
        print(f"PIPELINE backend={engine.dialect.name} one_way_delay_ms=50 commands=8 "
            f"pipeline_ms={pipeline_ms:.1f} sequential_ms={sequential_ms:.1f}")


def test_retry_after_lost_receipt_does_not_repeat_the_peer_edit(live_scene):
    engine, table_id, socket = live_scene
    with Session(engine) as db:
        table, ok = crud.load_table_from_db(db, table_id)
        assert ok
        expected = sprite_transform(table.find_entity_by_sprite_id("original"))
    message = Message(MessageType.CANVAS_COMMAND, {"operation_id": str(uuid.uuid4()), "table_id": table_id,
        "issued_at": time.time() * 1000, "mode": "transform", "members": [
            {"kind": "sprite", "id": "original", "expected": expected}],
        "transform": {"dx": 5, "dy": 0, "scale": 1, "rotation": 0, "pivot_x": 0, "pivot_y": 0}})
    with socket("observer") as observer:
        _request(observer, "table_request", {"table_id": table_id})
        with socket("owner") as owner:
            owner.send(message.to_json())
            deadline = time.monotonic() + 5
            while True:
                with Session(engine) as db:
                    committed = db.query(models.CanvasCommandJournal).filter_by(
                        operation_id=message.data["operation_id"]).count() == 1
                if committed:
                    break
                assert time.monotonic() < deadline, "Command did not commit"
                time.sleep(0.02)
            # Close without ever consuming this command's outcome.
        with socket("owner") as reconnected:
            reconnected.send(message.to_json())
            frames = receive_until(reconnected, lambda frames: any(
                item.get("causation_id") == message.message_id for item in frames))
            receipt = next(item["data"] for item in frames if item.get("causation_id") == message.message_id)
            assert receipt["success"] and receipt["resync_required"]
        request = Message(MessageType.TABLE_REQUEST, {"table_id": table_id})
        observer.send(request.to_json())
        frames = receive_until(observer, lambda frames: any(item.get("causation_id") == request.message_id for item in frames))
        assert sum(item["type"] == "sprite_update" for item in frames) == 1
        with Session(engine) as db:
            assert db.query(models.CanvasCommandJournal).count() == 1
            assert db.query(models.Entity).one().position_x == 105
