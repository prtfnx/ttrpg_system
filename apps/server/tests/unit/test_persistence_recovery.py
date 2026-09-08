import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from core_table.actions_core import ActionsCore
from core_table.async_actions_protocol import Position
from core_table.server import TableManager
from database import crud
from service.game_session import ConnectionManager


@pytest.mark.asyncio
async def test_failed_mutation_reports_failure_then_retries_without_losing_state(test_db, test_game_session, monkeypatch):
    manager = TableManager(test_db)
    table = manager.create_table("Recovery", 100, 100)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    actions = ActionsCore(manager)
    actions._save_delay = 0.01
    original = manager.save_table_async
    calls = 0

    async def fail_once(*args, **kwargs):
        nonlocal calls
        calls += 1
        return False if calls == 1 else await original(*args, **kwargs)

    monkeypatch.setattr(manager, "save_table_async", fail_once)
    response = await actions.move_table(str(table.table_id), Position(20, 30), test_game_session.id)
    assert not response.success
    assert str(table.table_id) in actions._dirty_tables
    await asyncio.wait_for(actions._save_tasks[str(table.table_id)], 2)
    assert not actions._dirty_tables
    loaded, success = crud.load_table_from_db(test_db, str(table.table_id))
    assert success and loaded is not None and loaded.position == (20, 30)


@pytest.mark.asyncio
async def test_failed_flush_retains_dirty_state(test_db, test_game_session, monkeypatch):
    manager = TableManager(test_db)
    table = manager.create_table("Unsaved", 100, 100)
    actions = ActionsCore(manager)
    monkeypatch.setattr(manager, "save_table_async", AsyncMock(return_value=False))
    result = await actions.move_table(str(table.table_id), Position(1, 2), test_game_session.id)
    assert not result.success
    assert not await actions.flush_all_pending_saves()
    assert str(table.table_id) in actions._dirty_tables
    await actions.stop_persistence()


@pytest.mark.asyncio
async def test_failed_delete_keeps_live_table(test_db, test_game_session, monkeypatch):
    manager = TableManager(test_db)
    table = manager.create_table("Keep", 100, 100)
    monkeypatch.setattr(manager, "delete_table_async", AsyncMock(return_value=False))
    result = await ActionsCore(manager).delete_table(str(table.table_id), test_game_session.id)
    assert not result.success
    assert manager.get_table(str(table.table_id)) is table


@pytest.mark.asyncio
async def test_failed_final_save_keeps_session_until_recovery(monkeypatch):
    manager = ConnectionManager()
    service = MagicMock()
    service.wait_for_mutations = AsyncMock()
    service.save_to_database_async = AsyncMock(side_effect=[False, True])
    service.stop_persistence = AsyncMock()
    manager.sessions_protocols["TEST"] = service
    monkeypatch.setattr("service.game_session.get_server_asset_manager", MagicMock())
    await manager._cleanup_empty_session("TEST")
    assert manager.sessions_protocols["TEST"] is service
    service.cleanup.assert_not_called()
    await manager._cleanup_empty_session("TEST")
    assert "TEST" not in manager.sessions_protocols
    service.cleanup.assert_called_once()
    task = manager._cleanup_tasks["TEST"]
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
