from unittest.mock import Mock

import pytest
from core_table.entities import Wall
from core_table.table import VirtualTable
from database import crud, models


@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("failure_at", ["entity", "wall", "commit"])
def test_snapshot_failure_rolls_back_every_change(test_db, test_game_session, monkeypatch, existing, failure_at):
    table = VirtualTable("Original", 100, 100)
    first = table.add_entity({"name": "First"})
    removed = table.add_entity({"name": "Removed"})
    wall = Wall(table_id=str(table.table_id), x1=0, y1=0, x2=10, y2=10)
    table.add_wall(wall)
    if existing:
        crud.save_table_to_db(test_db, table, test_game_session.id)
    table.display_name = "Changed"
    first.name = "Changed"
    assert removed.entity_id is not None
    table.remove_entity(removed.entity_id)
    table.add_entity({"name": "Added"})
    table.walls.clear()
    table.add_wall(Wall(table_id=str(table.table_id), x1=1, y1=1, x2=5, y2=5))
    target = {"entity": "save_entity_to_db", "wall": "create_wall"}.get(failure_at)
    if target:
        original = getattr(crud, target)
        calls = 0

        def fail_after_staging(*args, **kwargs):
            nonlocal calls
            result = original(*args, **kwargs)
            calls += 1
            if failure_at == "wall" or calls == 2:
                raise RuntimeError("injected failure")
            return result

        monkeypatch.setattr(crud, target, fail_after_staging)
    else:
        monkeypatch.setattr(test_db, "commit", Mock(side_effect=RuntimeError("injected failure")))

    with pytest.raises(RuntimeError, match="injected failure"):
        crud.save_table_to_db(test_db, table, test_game_session.id)
    test_db.expire_all()
    if existing:
        row = crud.get_virtual_table_by_id(test_db, str(table.table_id))
        assert row is not None and row.name == "Original"
        assert {row.name for row in test_db.query(models.Entity).all()} == {"First", "Removed"}
        assert [row.wall_id for row in crud.get_table_walls(test_db, str(table.table_id))] == [wall.wall_id]
    else:
        assert test_db.query(models.VirtualTable).count() == 0
        assert test_db.query(models.Entity).count() == 0
        assert test_db.query(models.Wall).count() == 0


def test_successful_snapshot_commits_once(test_db, test_game_session, monkeypatch):
    table = VirtualTable("Atomic", 100, 100)
    for _ in range(3):
        table.add_entity({})
        table.add_wall(Wall(table_id=str(table.table_id), x1=0, y1=0, x2=10, y2=10))
    commit = Mock(wraps=test_db.commit)
    monkeypatch.setattr(test_db, "commit", commit)
    crud.save_table_to_db(test_db, table, test_game_session.id)
    commit.assert_called_once_with()
    assert test_db.query(models.Entity).count() == 3
    assert test_db.query(models.Wall).count() == 3
