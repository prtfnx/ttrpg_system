"""Real PostgreSQL fencing and two-process snapshot handover regression."""
from __future__ import annotations

import json
import multiprocessing
import os
import socket
import subprocess
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import jwt
import pytest
from alembic import command
from core_table.table import VirtualTable
from database import crud, models
from database.schema import alembic_config
from database.url import normalize_database_url
from database.writer import ApplicationWriter, WriterOwnershipLost, migration_writer_transaction
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect
from websockets.typing import Origin

PG_URL = os.getenv("TEST_POSTGRESQL_DATABASE_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="TEST_POSTGRESQL_DATABASE_URL is not configured")


@pytest.fixture
def database():
    assert PG_URL is not None
    base_url = normalize_database_url(PG_URL)
    assert base_url.database and "test" in base_url.database.lower()
    schema = "writer_test_" + uuid.uuid4().hex
    base_engine = create_engine(base_url, poolclass=NullPool)
    with base_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = base_url.update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(url, poolclass=NullPool)
    config = alembic_config(url)
    command.upgrade(config, "head")
    with Session(engine) as db:
        user = models.User(username="owner", hashed_password="not-a-login")
        db.add(user)
        db.flush()
        game = models.GameSession(name="Game", session_code="FENCED", owner_id=user.id)
        db.add(game)
        db.flush()
        db.add(models.GamePlayer(session_id=game.id, user_id=user.id, role="owner"))
        db.commit()
        session_id = game.id
        table = VirtualTable("Original", 100, 100)
        table.add_entity({"sprite_id": "original", "name": "Original token"})
        crud.save_table_to_db(db, table, session_id)
    try:
        yield engine, url, session_id, str(table.table_id)
    finally:
        engine.dispose()
        with base_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        base_engine.dispose()


def make_writer(url):
    control = create_engine(url, poolclass=NullPool)
    app = create_engine(url, poolclass=NullPool)
    writer = ApplicationWriter(app, control)
    writer.claim()
    return writer


def test_every_application_table_has_a_database_write_guard(database):
    engine, url, _, _ = database
    writer = make_writer(url)
    try:
        with engine.connect() as connection:
            tables = set(connection.execute(text("""
                SELECT c.relname FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE t.tgname = 'application_writer_guard' AND n.nspname = current_schema()
            """)).scalars())
        assert tables == set(models.Base.metadata.tables) - {"application_writer_state"}
        # Statement triggers must reject even empty deletes from uninstrumented old code.
        for table in sorted(tables):
            with pytest.raises(DBAPIError) as error, engine.begin() as connection:
                connection.execute(text(f'DELETE FROM "{table}" WHERE false'))
            assert getattr(error.value.orig, "sqlstate", None) == "55000"
        with pytest.raises(DBAPIError) as error, engine.begin() as connection:
            connection.execute(text("TRUNCATE chat_messages"))
        assert getattr(error.value.orig, "sqlstate", None) == "55000"
    finally:
        writer.close()
        writer.application_engine.dispose()


def test_stale_full_snapshot_and_direct_writes_cannot_remove_newer_tokens(database):
    engine, url, session_id, table_id = database
    old = make_writer(url)
    new = None
    try:
        with Session(old.application_engine) as db:
            stale, ok = crud.load_table_from_db(db, table_id)
            assert ok and stale is not None
        new = make_writer(url)
        with Session(new.application_engine) as db:
            current, ok = crud.load_table_from_db(db, table_id)
            assert ok and current is not None
            current.add_entity({"sprite_id": "new-token", "name": "New token"})
            crud.save_table_to_db(db, current, session_id)
        with pytest.raises(WriterOwnershipLost), Session(old.application_engine) as db:
            crud.save_table_to_db(db, stale, session_id)
        with pytest.raises(DBAPIError) as error, engine.begin() as connection:
            connection.execute(text("SELECT set_config('ttrpg.writer_token', :owner, true)"), {"owner": old.owner_token})
            connection.execute(text("DELETE FROM entities"))
        assert getattr(error.value.orig, "sqlstate", None) == "55000"
        with Session(new.application_engine) as db:
            assert {entity.sprite_id for entity in db.query(models.Entity)} == {"original", "new-token"}
    finally:
        for writer in (old, new):
            if writer is not None:
                writer.close()
                writer.application_engine.dispose()


def test_migration_writes_remain_fenced_without_changing_live_owner(database):
    engine, url, _, _ = database
    writer = make_writer(url)
    try:
        with engine.connect() as connection:
            with migration_writer_transaction(connection):
                connection.execute(text("UPDATE users SET full_name = 'Migrated'"))
        command.check(alembic_config(url))
        assert writer.check()
        with writer.application_engine.connect() as connection:
            assert connection.execute(text("SELECT full_name FROM users")).scalar_one() == "Migrated"
            assert connection.execute(text("SELECT generation FROM application_writer_state")).scalar_one() == 1
    finally:
        writer.close()
        writer.application_engine.dispose()


def _old_process(url, session_id, table_id, release, successor_ready, messages):
    writer = make_writer(url)
    try:
        with Session(writer.application_engine) as db:
            stale, ok = crud.load_table_from_db(db, table_id)
            assert ok and stale is not None
        with writer.application_engine.begin() as connection:
            connection.execute(text("UPDATE virtual_tables SET name = 'Committed before handover'"))
            messages.put("holding")
            assert release.wait(15)
        messages.put("committed")
        assert successor_ready.wait(15)
        try:
            with Session(writer.application_engine) as db:
                crud.save_table_to_db(db, stale, session_id)
        except WriterOwnershipLost:
            messages.put("stale_write_rejected")
        else:
            messages.put("ERROR: stale snapshot committed")
    finally:
        writer.close()
        writer.application_engine.dispose()


def _new_process(url, session_id, table_id, successor_ready, claimed, messages):
    control = create_engine(url, poolclass=NullPool)
    app = create_engine(url, poolclass=NullPool)
    writer = ApplicationWriter(app, control)
    try:
        messages.put("claiming")
        writer.claim()
        claimed.set()
        with Session(app) as db:
            current, ok = crud.load_table_from_db(db, table_id)
            assert ok and current is not None
            assert current.display_name == "Committed before handover"
            current.add_entity({"sprite_id": "successor-token", "name": "Successor token"})
            crud.save_table_to_db(db, current, session_id)
        messages.put("successor_saved")
        successor_ready.set()
    finally:
        writer.close()
        app.dispose()


def test_two_process_handover_drains_transaction_and_fences_stale_snapshot(database):
    engine, url, session_id, table_id = database
    context = multiprocessing.get_context("spawn")
    release, successor_ready, claimed = (context.Event() for _ in range(3))
    messages = context.Queue()
    database_url = url.render_as_string(hide_password=False)
    old = context.Process(target=_old_process, args=(database_url, session_id, table_id, release, successor_ready, messages))
    new = context.Process(target=_new_process, args=(database_url, session_id, table_id, successor_ready, claimed, messages))
    old.start()
    try:
        assert messages.get(timeout=15) == "holding"
        new.start()
        assert messages.get(timeout=15) == "claiming"
        # The successor cannot hydrate until the previous transaction commits.
        assert not claimed.wait(0.25)
        release.set()
        results = {messages.get(timeout=15) for _ in range(3)}
        assert results == {"committed", "successor_saved", "stale_write_rejected"}
        old.join(10)
        new.join(10)
        assert old.exitcode == 0 and new.exitcode == 0
        with engine.connect() as connection:
            assert set(connection.execute(text("SELECT sprite_id FROM entities")).scalars()) == {
                "original", "successor-token",
            }
    finally:
        release.set()
        successor_ready.set()
        for process in (old, new):
            if process.pid is not None:
                if process.is_alive():
                    process.terminate()
                process.join(10)
        messages.close()


def _unused_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def _start_server(url, port, log_path):
    environment = {
        **os.environ,
        "DATABASE_URL": url.render_as_string(hide_password=False),
        "PYTHONPATH": os.pathsep.join(filter(None, [
            str(Path(__file__).resolve().parents[4] / "packages" / "core-table"),
            os.getenv("PYTHONPATH", ""),
        ])),
        "ENVIRONMENT": "development",
        "R2_ENABLED": "false",
        "BASE_URL": f"http://127.0.0.1:{port}",
        "CORS_ORIGINS": f"http://127.0.0.1:{port}",
        "SECRET_KEY": "isolated-writer-test-signing-key-32-bytes",
        "SESSION_SECRET": "isolated-writer-test-session-key-32-bytes",
        "GOOGLE_CLIENT_ID": "",
        "GOOGLE_CLIENT_SECRET": "",
        "LOG_LEVEL": "WARNING",
    }
    with log_path.open("w", encoding="utf-8") as output:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=Path(__file__).resolve().parents[2],
            env=environment, stdout=output, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    return process


def _await_ready(process, port):
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        assert process.poll() is None, "Test server exited before readiness"
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health/ready", timeout=1, trust_env=False).status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(0.1)
    raise AssertionError("Test server did not become ready")


def _request(socket_client, kind, data):
    identifier = uuid.uuid4().hex
    socket_client.send(json.dumps({"type": kind, "data": data, "message_id": identifier}))
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        message = json.loads(socket_client.recv(timeout=max(0.1, deadline - time.monotonic())))
        if message.get("causation_id") == identifier:
            return message
    raise AssertionError("No correlated response")


def test_live_servers_handover_closes_old_socket_and_reloads_acknowledged_state(database, tmp_path):
    engine, url, _, table_id = database
    first_port, second_port = _unused_port(), _unused_port()
    assert first_port != second_port
    first = _start_server(url, first_port, tmp_path / "old-server.log")
    second = None
    token = jwt.encode({
        "sub": "owner", "sv": 0, "exp": datetime.now(UTC) + timedelta(minutes=5),
    }, "isolated-writer-test-signing-key-32-bytes", algorithm="HS256")
    try:
        _await_ready(first, first_port)
        with connect(
            f"ws://127.0.0.1:{first_port}/ws/game/FENCED",
            additional_headers={"Cookie": f"token={token}"},
            origin=Origin(f"http://127.0.0.1:{first_port}"), proxy=None,
        ) as old_socket:
            response = _request(old_socket, "table_scale", {"table_id": table_id, "scale": 2})
            assert response["type"] == "success"
            with engine.connect() as connection:
                assert connection.execute(text("SELECT scale_x FROM virtual_tables")).scalar_one() == 2
            second = _start_server(url, second_port, tmp_path / "new-server.log")
            _await_ready(second, second_port)
            with pytest.raises(ConnectionClosed) as closed:
                while True:
                    old_socket.recv(timeout=10)
            assert closed.value.rcvd is not None and closed.value.rcvd.code == 1012
            assert httpx.get(
                f"http://127.0.0.1:{first_port}/demo/info", timeout=2, trust_env=False,
            ).status_code == 503
            with connect(
                f"ws://127.0.0.1:{second_port}/ws/game/FENCED",
                additional_headers={"Cookie": f"token={token}"},
                origin=Origin(f"http://127.0.0.1:{second_port}"), proxy=None,
            ) as new_socket:
                response = _request(new_socket, "table_request", {"table_id": table_id})
                assert response["type"] == "table_response"
                assert response["data"]["table_data"]["scale"] == [2.0, 2.0]
    finally:
        for process in (first, second):
            if process is not None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
