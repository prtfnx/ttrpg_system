from core_table.table import VirtualTable
from database import crud, schemas

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
