import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

from core_table.server import TableManager


def test_manager_starts_without_a_phantom_table():
    manager = TableManager()

    assert manager.tables == {}
    assert manager.tables_id == {}
    assert manager.get_table() is None
    assert manager.get_table("missing") is None


def test_created_table_is_indexed_by_authoritative_id():
    manager = TableManager()

    table = manager.create_table("Dungeon", 100, 80)
    table_id = str(table.table_id)

    assert manager.get_table(table_id) is table
    assert manager.tables_id[table_id] is table


def test_clear_tables_leaves_manager_empty():
    manager = TableManager()
    manager.create_table("Dungeon", 100, 80)

    manager.clear_tables()

    assert manager.tables == {}
    assert manager.tables_id == {}
    assert manager.get_table() is None


def test_save_persists_every_real_table():
    db_session = MagicMock()
    manager = TableManager(db_session)
    table = manager.create_table("Dungeon", 100, 80)

    save_table = MagicMock()
    database_module = ModuleType("database")
    database_module.crud = SimpleNamespace(save_table_to_db=save_table)

    with patch.dict(sys.modules, {"database": database_module}):
        assert manager.save_to_database(session_id=7) is True

    save_table.assert_called_once_with(db_session, table, 7)
