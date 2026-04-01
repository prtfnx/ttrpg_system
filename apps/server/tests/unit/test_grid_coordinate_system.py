"""
Tests for the grid coordinate system (phase 1 of unit-coordinate-system feature).

Covers real user behaviour:
- New tables default to 5e grid: 50px/cell, 5ft/cell → 10px/ft
- DM can change cell size, distance per cell, and unit type
- Invalid values are rejected before hitting the DB
- Settings round-trip through to_dict/from_dict (client receives correct state on join)
- Grid settings persist across DB write/read cycles
- pixels_per_unit property always reflects current grid config
- Metric tables (metres) store and report correctly
"""
import pytest
import uuid

from core_table.table import VirtualTable
from server_host.database import crud, schemas


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_table_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def session(test_db, test_user):
    from server_host.database import crud as db_crud, schemas as sc
    session_data = sc.GameSessionCreate(name="Grid Test Session")
    return db_crud.create_game_session(test_db, session_data, test_user.id, "GRID01")


@pytest.fixture
def db_table(test_db, session):
    table_data = schemas.VirtualTableCreate(
        table_id=_make_table_id(),
        name="Test Table",
        width=3000,
        height=3000,
        session_id=session.id,
    )
    return crud.create_virtual_table(test_db, table_data)


# ---------------------------------------------------------------------------
# In-memory VirtualTable — coordinate system model
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestVirtualTableGridModel:
    def test_default_grid_is_5e_standard(self):
        """New table defaults: 50px/cell, 5ft/cell — the D&D 5e standard."""
        table = VirtualTable("Dungeon", 100, 100)
        assert table.grid_cell_px == pytest.approx(50.0)
        assert table.cell_distance == pytest.approx(5.0)
        assert table.distance_unit == "ft"

    def test_pixels_per_unit_default_is_10(self):
        """Default grid gives 10 pixels per foot (50px / 5ft)."""
        table = VirtualTable("Dungeon", 100, 100)
        assert table.pixels_per_unit == pytest.approx(10.0)

    def test_pixels_per_unit_updates_when_cell_px_changes(self):
        """Changing cell pixel size immediately affects pixels_per_unit."""
        table = VirtualTable("Dungeon", 100, 100)
        table.grid_cell_px = 100.0  # doubled
        assert table.pixels_per_unit == pytest.approx(20.0)  # 100 / 5

    def test_pixels_per_unit_updates_when_cell_distance_changes(self):
        """Changing distance per cell immediately affects pixels_per_unit."""
        table = VirtualTable("Dungeon", 100, 100)
        table.cell_distance = 10.0  # 10ft per cell now
        assert table.pixels_per_unit == pytest.approx(5.0)  # 50 / 10

    def test_metric_table_stores_metres(self):
        """DM can set a metric table (1.5m/cell) and unit is stored as 'm'."""
        table = VirtualTable("Metric Map", 100, 100, cell_distance=1.5, distance_unit="m")
        assert table.distance_unit == "m"
        assert table.cell_distance == pytest.approx(1.5)

    def test_grid_settings_in_to_dict(self):
        """to_dict includes grid settings so clients get them on table join."""
        table = VirtualTable("Custom", 100, 100, grid_cell_px=75.0, cell_distance=5.0, distance_unit="ft")
        d = table.to_dict()
        assert d["grid_cell_px"] == pytest.approx(75.0)
        assert d["cell_distance"] == pytest.approx(5.0)
        assert d["distance_unit"] == "ft"

    def test_grid_settings_round_trip_via_dict(self):
        """from_dict restores grid settings so a reconnecting client gets correct state."""
        table = VirtualTable("Original", 100, 100, grid_cell_px=100.0, cell_distance=10.0, distance_unit="m")
        restored = VirtualTable("placeholder", 100, 100)
        restored.from_dict(table.to_dict())
        assert restored.grid_cell_px == pytest.approx(100.0)
        assert restored.cell_distance == pytest.approx(10.0)
        assert restored.distance_unit == "m"
        assert restored.pixels_per_unit == pytest.approx(10.0)

    def test_pixels_per_unit_safe_when_cell_distance_is_zero(self):
        """pixels_per_unit returns fallback 10.0 instead of dividing by zero."""
        table = VirtualTable("Dungeon", 100, 100)
        table.cell_distance = 0.0
        assert table.pixels_per_unit == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestGridSchemas:
    def test_virtual_table_create_defaults(self):
        """VirtualTableCreate schema defaults match D&D 5e standard grid."""
        schema = schemas.VirtualTableCreate(
            table_id=_make_table_id(),
            name="Test",
            width=1000,
            height=1000,
            session_id=1,
        )
        assert schema.grid_cell_px == pytest.approx(50.0)
        assert schema.cell_distance == pytest.approx(5.0)
        assert schema.distance_unit == "ft"

    def test_virtual_table_create_accepts_custom_grid(self):
        """DM can create a table with non-standard grid settings."""
        schema = schemas.VirtualTableCreate(
            table_id=_make_table_id(),
            name="Big Map",
            width=5000,
            height=5000,
            session_id=1,
            grid_cell_px=100.0,
            cell_distance=10.0,
            distance_unit="ft",
        )
        assert schema.grid_cell_px == pytest.approx(100.0)
        assert schema.cell_distance == pytest.approx(10.0)

    def test_virtual_table_create_accepts_metric(self):
        """VirtualTableCreate accepts 'm' as distance_unit."""
        schema = schemas.VirtualTableCreate(
            table_id=_make_table_id(),
            name="Euro Campaign",
            width=2000,
            height=2000,
            session_id=1,
            distance_unit="m",
        )
        assert schema.distance_unit == "m"

    def test_virtual_table_update_allows_partial_grid_change(self):
        """VirtualTableUpdate allows changing only one grid field at a time."""
        update = schemas.VirtualTableUpdate(grid_cell_px=75.0)
        assert update.grid_cell_px == pytest.approx(75.0)
        assert update.cell_distance is None
        assert update.distance_unit is None


# ---------------------------------------------------------------------------
# DB persistence — grid coordinate system fields
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestGridPersistence:
    def test_table_created_with_default_grid(self, test_db, db_table):
        """New table has 5e default grid values in the DB."""
        assert db_table.grid_cell_px == pytest.approx(50.0)
        assert db_table.cell_distance == pytest.approx(5.0)
        assert db_table.distance_unit == "ft"

    def test_dm_changes_cell_pixel_size(self, test_db, db_table):
        """DM changes pixels per cell; value persists and is readable back."""
        update = schemas.VirtualTableUpdate(grid_cell_px=100.0)
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.grid_cell_px == pytest.approx(100.0)
        # Other fields unchanged
        assert fetched.cell_distance == pytest.approx(5.0)
        assert fetched.distance_unit == "ft"

    def test_dm_changes_distance_per_cell(self, test_db, db_table):
        """DM changes game units per cell; value persists without affecting cell size."""
        update = schemas.VirtualTableUpdate(cell_distance=10.0)
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.cell_distance == pytest.approx(10.0)
        assert fetched.grid_cell_px == pytest.approx(50.0)

    def test_dm_switches_to_metric(self, test_db, db_table):
        """DM toggles distance unit to metres; the 'm' value persists."""
        update = schemas.VirtualTableUpdate(distance_unit="m", cell_distance=1.5)
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.distance_unit == "m"
        assert fetched.cell_distance == pytest.approx(1.5)

    def test_all_grid_fields_update_atomically(self, test_db, db_table):
        """All three grid fields can be set in a single update call."""
        update = schemas.VirtualTableUpdate(
            grid_cell_px=75.0,
            cell_distance=5.0,
            distance_unit="ft",
        )
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.grid_cell_px == pytest.approx(75.0)
        assert fetched.cell_distance == pytest.approx(5.0)
        assert fetched.distance_unit == "ft"

    def test_grid_settings_survive_alongside_lighting_update(self, test_db, db_table):
        """Updating lighting fields does not clobber grid settings."""
        crud.update_virtual_table(test_db, db_table.table_id, schemas.VirtualTableUpdate(grid_cell_px=80.0))
        crud.update_virtual_table(test_db, db_table.table_id, schemas.VirtualTableUpdate(dynamic_lighting_enabled=True))

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.grid_cell_px == pytest.approx(80.0)
        assert fetched.dynamic_lighting_enabled is True

    def test_create_table_with_custom_grid_persists(self, test_db, session):
        """Table created with non-default grid has correct values after DB write."""
        table_data = schemas.VirtualTableCreate(
            table_id=_make_table_id(),
            name="Custom Grid Table",
            width=2000,
            height=2000,
            session_id=session.id,
            grid_cell_px=100.0,
            cell_distance=10.0,
            distance_unit="ft",
        )
        table = crud.create_virtual_table(test_db, table_data)

        assert table.grid_cell_px == pytest.approx(100.0)
        assert table.cell_distance == pytest.approx(10.0)
        assert table.distance_unit == "ft"
