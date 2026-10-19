import asyncio
import threading

import pytest
from core_table.actions_core import ActionsCore
from core_table.server import TableManager
from database import crud, models
from sqlalchemy import event


@pytest.fixture
def scene(test_db, test_game_session):
    manager = TableManager(test_db)
    table = manager.create_table("Walls", 1000, 1000)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    return ActionsCore(manager), table, test_game_session.id


async def test_wall_writes_run_off_loop_and_reload_identically(scene, test_db, test_db_engine):
    actions, table, session_id = scene
    threads = []
    main_thread = threading.get_ident()
    def listener(*_args):
        threads.append(threading.get_ident())
    event.listen(test_db_engine, "before_cursor_execute", listener)
    try:
        wall = await actions.create_wall(str(table.table_id), {"x1": 0, "y1": 0, "x2": 50, "y2": 50}, session_id)
        await actions.update_wall(str(table.table_id), wall["wall_id"], {"x2": 60}, session_id)
        await actions.delete_wall(str(table.table_id), wall["wall_id"], session_id)
    finally:
        event.remove(test_db_engine, "before_cursor_execute", listener)
    assert threads and all(thread != main_thread for thread in threads)
    test_db.expire_all()
    assert not test_db.query(models.Wall).count() and not table.walls


async def test_failed_wall_write_does_not_publish_or_dirty_live_state(scene, monkeypatch):
    actions, table, session_id = scene
    wall = await actions.create_wall(str(table.table_id), {"x1": 0, "y1": 0, "x2": 50, "y2": 50}, session_id)

    def fail(*_args, **_kwargs):
        raise RuntimeError("Storage unavailable")

    monkeypatch.setattr(crud, "update_wall", fail)
    with pytest.raises(RuntimeError):
        await actions.update_wall(str(table.table_id), wall["wall_id"], {"x2": 60}, session_id)
    assert table.get_wall(wall["wall_id"]).x2 == 50


async def test_cancelled_wall_write_finishes_commit_and_live_publication(scene, monkeypatch):
    actions, table, session_id = scene
    started, release = threading.Event(), threading.Event()
    original = crud.create_wall

    def slow(*args, **kwargs):
        started.set()
        assert release.wait(3)
        return original(*args, **kwargs)

    monkeypatch.setattr(crud, "create_wall", slow)
    task = asyncio.create_task(actions.create_wall(str(table.table_id), {"x1": 0, "y1": 0, "x2": 50, "y2": 50}, session_id))
    while not started.is_set():
        await asyncio.sleep(0)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done() and not table.walls
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(table.walls) == 1
