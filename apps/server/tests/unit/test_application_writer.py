import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from database.models import Base
from database.writer import ApplicationWriter, WriterOwnershipLost
from fastapi import FastAPI
from fastapi.testclient import TestClient
from service.application_writer import WriterAdmissionMiddleware, monitor_writer
from service.game_session import ConnectionManager
from sqlalchemy import create_engine, text


@pytest.fixture
def writers(tmp_path):
    url = f"sqlite:///{(tmp_path / 'writers.db').as_posix()}"
    control = create_engine(url)
    Base.metadata.create_all(control)
    with control.begin() as connection:
        connection.execute(text("INSERT INTO application_writer_state (id, generation) VALUES (1, 0)"))
    application_engines = [create_engine(url), create_engine(url)]
    gates = [ApplicationWriter(engine, control) for engine in application_engines]
    yield gates
    for gate in gates:
        gate.close()
    for engine in application_engines:
        engine.dispose()


def test_lifespan_owns_the_same_manager_as_websocket_and_http_dependencies():
    import main
    from service.game_session import get_connection_manager

    assert main.app_state.connection_manager is get_connection_manager()


@pytest.mark.asyncio
async def test_startup_reports_preflight_failure_without_claiming_writer(monkeypatch, caplog):
    import main

    monkeypatch.setattr(main, "settings", SimpleNamespace(is_production=False, SERVICE_VERSION="test"))
    monkeypatch.setattr(main, "engine", SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))
    monkeypatch.setattr(main, "_readiness_result", lambda: {
        "status": "not_ready",
        "checks": {"database": {
            "ok": False, "code": "required_schema_missing",
            "missing_tables": ["application_writer_state"],
            "applied_revision": "0001_postgresql_baseline",
            "expected_revision": "0008_application_writer",
        }},
    })
    writer = MagicMock()
    monkeypatch.setattr(main, "ApplicationWriter", writer)

    with pytest.raises(RuntimeError, match="python -m alembic upgrade head") as error:
        async with main.lifespan(FastAPI()):
            pytest.fail("Startup must reject the stale database")

    assert "application_writer_state" in str(error.value)
    assert "0001_postgresql_baseline" in str(error.value)
    assert "0008_application_writer" in str(error.value)
    assert "Database schema accepted" not in caplog.text
    assert "application_writer_state" in caplog.text
    writer.assert_not_called()


def test_successor_fences_previous_process_and_cannot_be_reacquired(writers):
    old, new = writers
    assert old.claim() == 1
    with old.application_engine.begin() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1
    assert new.claim() == 2
    with pytest.raises(WriterOwnershipLost):
        with old.application_engine.begin() as connection:
            connection.execute(text("SELECT 1"))
    assert not old.active
    with pytest.raises(RuntimeError, match="never reacquire"):
        old.claim()
    with new.application_engine.begin() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1


def test_gate_rejects_transactions_before_claim_and_after_close(writers):
    gate = writers[0]
    with pytest.raises(WriterOwnershipLost), gate.application_engine.begin():
        pass
    gate.claim()
    gate.close()
    with pytest.raises(WriterOwnershipLost), gate.application_engine.begin():
        pass
    # Closing never resets the database fence to the unprotected bootstrap state.
    with writers[1].control_engine.connect() as connection:
        assert connection.execute(text("SELECT owner_token FROM application_writer_state")).scalar_one()


def test_admission_stops_http_and_websockets_but_preserves_liveness(writers):
    gate = writers[0]
    gate.claim()
    app = FastAPI()
    app.state.application_writer = gate
    app.add_middleware(WriterAdmissionMiddleware)

    @app.get("/health/live")
    @app.get("/action")
    def response():
        return {"ok": True}

    with TestClient(app) as client:
        assert client.get("/action").status_code == 200
        writers[1].claim()
        assert not gate.check()
        result = client.get("/action")
        assert result.status_code == 503 and result.headers["Retry-After"] == "2"
        assert client.get("/health/live").status_code == 200
        with client.websocket_connect("/ws/game/ROOM") as socket:
            assert socket.receive()["code"] == 1012


@pytest.mark.asyncio
async def test_monitor_closes_sessions_once_without_reclaiming(writers):
    gate = writers[0]
    gate.claim()
    writers[1].claim()
    manager = SimpleNamespace(close_all=AsyncMock())
    await asyncio.wait_for(monitor_writer(gate, manager, interval=0), 2)
    manager.close_all.assert_awaited_once_with(reason="Server replaced; reconnect")
    assert not gate.active


@pytest.mark.asyncio
async def test_connect_rechecks_ownership_after_socket_accept(writers):
    gate = writers[0]
    gate.claim()
    manager = ConnectionManager()
    manager.application_writer = gate
    manager.sessions_protocols["ROOM"] = MagicMock()
    socket = AsyncMock()

    async def accept():
        writers[1].claim()
        gate.check()

    socket.accept.side_effect = accept
    with pytest.raises(WriterOwnershipLost):
        await manager.connect(socket, "ROOM", 1, "player")
    assert not manager.connection_info
    assert not manager.active_connections


@pytest.mark.asyncio
async def test_superseded_session_drains_and_retires_without_retrying_stale_snapshot(writers, monkeypatch):
    gate = writers[0]
    gate.claim()
    writers[1].claim()
    assert not gate.check()
    manager = ConnectionManager()
    manager.application_writer = gate
    service = MagicMock()
    service.wait_for_mutations = AsyncMock()
    service.stop_persistence = AsyncMock()
    service.save_to_database_async = AsyncMock()
    manager.sessions_protocols["ROOM"] = service
    manager.game_session_db_ids["ROOM"] = 1
    assets = MagicMock()
    monkeypatch.setattr("service.game_session.get_server_asset_manager", lambda: assets)

    await manager.close_all(reason="Server replaced; reconnect")

    service.wait_for_mutations.assert_awaited_once_with()
    service.stop_persistence.assert_awaited_once_with()
    service.save_to_database_async.assert_not_awaited()
    service.cleanup.assert_called_once_with()
    assets.cleanup_session.assert_called_once_with("ROOM")
    assert not manager.sessions_protocols
    assert not manager.game_session_db_ids
    assert not manager._cleanup_tasks
