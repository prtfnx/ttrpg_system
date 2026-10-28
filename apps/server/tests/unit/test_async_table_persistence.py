import asyncio
import threading
import time

import pytest
from core_table.server import TableManager
from database import crud


@pytest.mark.asyncio
async def test_save_uses_isolated_snapshot_and_worker_session(test_db, test_game_session, monkeypatch):
    manager = TableManager(test_db)
    table = manager.create_table("Snapshot", 100, 100)
    entity = table.add_entity({"name": "Before"})
    started = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop_thread = threading.get_ident()
    original = crud.save_table_to_db

    def slow_save(db, snapshot, session_id):
        assert db is not test_db
        assert threading.get_ident() != loop_thread
        loop.call_soon_threadsafe(started.set)
        time.sleep(0.05)
        return original(db, snapshot, session_id)

    monkeypatch.setattr(crud, "save_table_to_db", slow_save)
    task = asyncio.create_task(manager.save_table_async(str(table.table_id), test_game_session.id))
    await asyncio.wait_for(started.wait(), 2)
    assert not task.done(), "Database work blocked the event loop"
    entity.name = "After"
    assert await task
    test_db.expire_all()
    saved = crud.get_entity_by_sprite_id(test_db, entity.sprite_id)
    assert saved is not None and saved.name == "Before"
    assert await manager.save_table_async(str(table.table_id), test_game_session.id)
    test_db.expire_all()
    saved = crud.get_entity_by_sprite_id(test_db, entity.sprite_id)
    assert saved is not None and saved.name == "After"


@pytest.mark.asyncio
async def test_cancelled_save_keeps_lock_until_worker_finishes(test_db, test_game_session, monkeypatch):
    manager = TableManager(test_db)
    table = manager.create_table("Cancellation", 100, 100)
    started = asyncio.Event()
    release = threading.Event()
    loop = asyncio.get_running_loop()
    original = crud.save_table_to_db
    calls = 0

    def blocked_save(db, snapshot, session_id):
        nonlocal calls
        calls += 1
        if calls == 1:
            loop.call_soon_threadsafe(started.set)
            assert release.wait(2)
        return original(db, snapshot, session_id)

    monkeypatch.setattr(crud, "save_table_to_db", blocked_save)
    first = asyncio.create_task(manager.save_table_async(str(table.table_id), test_game_session.id))
    await asyncio.wait_for(started.wait(), 2)
    first.cancel()
    second = asyncio.create_task(manager.save_table_async(str(table.table_id), test_game_session.id))
    await asyncio.sleep(0)
    assert calls == 1
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert await second
    assert calls == 2


async def test_quarantined_snapshots_cannot_save_or_delete(test_db, test_game_session):
    manager = TableManager(test_db)
    table = manager.create_table("Guarded", 100, 100)
    table_id = str(table.table_id)
    assert await manager.save_table_async(table_id, test_game_session.id)
    table.display_name = "Unconfirmed"
    manager.persistence_guard = lambda: False
    assert not manager.save_table(table_id, test_game_session.id)
    assert not manager.save_to_database(test_game_session.id)
    assert not await manager.save_table_async(table_id, test_game_session.id)
    assert not await manager.delete_table_async(table_id, test_game_session.id)
    assert not await manager.save_to_database_async(test_game_session.id)
    test_db.expire_all()
    row = crud.get_virtual_table_by_id(test_db, table_id)
    assert row is not None and row.name == "Guarded"
    manager.persistence_guard = lambda: True
    assert await manager.save_table_async(table_id, test_game_session.id)
    test_db.expire_all()
    row = crud.get_virtual_table_by_id(test_db, table_id)
    assert row is not None and row.name == "Unconfirmed"


async def test_snapshot_guard_is_rechecked_after_waiting_for_table_ownership(test_db, test_game_session):
    manager = TableManager(test_db)
    table = manager.create_table("Waiting", 100, 100)
    table_id = str(table.table_id)
    lock = manager.table_write_lock(table_id)
    await lock.acquire()
    task = asyncio.create_task(manager.save_table_async(table_id, test_game_session.id))
    try:
        await asyncio.sleep(0)
        assert not task.done()
        manager.persistence_guard = lambda: False
    finally:
        lock.release()
    assert not await task
    assert crud.get_virtual_table_by_id(test_db, table_id) is None
