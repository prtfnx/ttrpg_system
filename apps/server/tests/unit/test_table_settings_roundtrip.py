from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.server import TableManager
from core_table.table import VirtualTable
from database import crud, schemas
from service import canvas_persistence_service
from service.server_protocol import ServerProtocol
from sqlalchemy.orm import sessionmaker

SETTINGS = {
    "grid_enabled": False,
    "snap_to_grid": False,
    "grid_color_hex": "#123456",
    "background_color_hex": "#654321",
}


def assert_settings(table):
    assert {key: getattr(table, key) for key in SETTINGS} == SETTINGS


def test_snapshot_create_and_reload_preserve_appearance(test_db, test_game_session):
    table = VirtualTable("Round trip", 1000, 1000)
    for key, value in SETTINGS.items():
        setattr(table, key, value)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, str(table.table_id))
    assert success
    assert_settings(loaded)


def test_snapshot_update_and_reload_preserve_appearance(test_db, test_game_session):
    table = VirtualTable("Round trip", 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    for key, value in SETTINGS.items():
        setattr(table, key, value)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, str(table.table_id))
    assert success
    assert_settings(loaded)


def test_settings_update_survives_session_rehydration(test_db, test_game_session):
    table = VirtualTable("Round trip", 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    crud.update_virtual_table(test_db, str(table.table_id), schemas.VirtualTableUpdate(**SETTINGS))
    test_db.expire_all()
    loaded, success = crud.load_table_from_db(test_db, str(table.table_id))
    assert success
    assert_settings(loaded)


@pytest.mark.asyncio
@pytest.mark.parametrize("fail_commit", [False, True])
async def test_protocol_settings_save_then_reload(test_db, test_db_engine, test_game_session, monkeypatch, fail_commit):
    table = VirtualTable("Protocol settings", 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    factory = sessionmaker(bind=test_db_engine)
    if fail_commit:
        def failed_session():
            db = factory()
            db.commit = lambda: (_ for _ in ()).throw(RuntimeError("commit failed"))
            return db
        monkeypatch.setattr(canvas_persistence_service, "SessionLocal", failed_session)
    else:
        monkeypatch.setattr(canvas_persistence_service, "SessionLocal", factory)
    manager = TableManager(test_db)
    manager.add_table(table)
    session = SimpleNamespace(game_session_db_id=test_game_session.id, client_info={"dm": {"role": "owner"}})
    protocol = ServerProtocol(manager, session_manager=session)
    protocol.broadcast_to_session = AsyncMock()
    response = await protocol.handle_table_settings_update(Message(MessageType.TABLE_SETTINGS_UPDATE, {
        "table_id": str(table.table_id), **SETTINGS,
    }), "dm")
    with factory() as db:
        loaded, success = crud.load_table_from_db(db, str(table.table_id))
    assert success
    for name, value in SETTINGS.items():
        assert getattr(table, name) == getattr(loaded, name)
        if not fail_commit:
            assert getattr(loaded, name) == value
    if fail_commit:
        assert response.type == MessageType.ERROR
        assert table.grid_enabled is True
        protocol.broadcast_to_session.assert_not_awaited()
    else:
        assert response.type == MessageType.TABLE_SETTINGS_CHANGED
        protocol.broadcast_to_session.assert_awaited_once()
