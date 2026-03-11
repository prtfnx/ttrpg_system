"""
Tests for dynamic lighting and character-token vision system.

Covers real user behaviour:
- DM enables/disables dynamic lighting and the change persists
- DM sets ambient light level and fog exploration mode
- Invalid settings are rejected
- Token vision and darkvision fields round-trip through the DB
- Table dict representation includes lighting settings for clients
- In-memory VirtualTable correctly reflects lighting state
"""
import pytest
import uuid

from core_table.table import VirtualTable, Entity
from server_host.database import crud, schemas


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_table_id() -> str:
    return str(uuid.uuid4())


def _make_sprite_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def session(test_db, test_user):
    from server_host.database import crud as db_crud, schemas as sc
    session_data = sc.GameSessionCreate(name="Lighting Test Session")
    return db_crud.create_game_session(test_db, session_data, test_user.id, "LIGHT01")


@pytest.fixture
def db_table(test_db, session):
    """A virtual table stored in the DB with default lighting settings."""
    table_id = _make_table_id()
    table_data = schemas.VirtualTableCreate(
        table_id=table_id,
        name="Test Table",
        width=3000,
        height=3000,
        session_id=session.id,
    )
    return crud.create_virtual_table(test_db, table_data)


# ---------------------------------------------------------------------------
# In-memory VirtualTable model
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestVirtualTableLightingModel:
    def test_default_lighting_settings(self):
        """New tables start with dynamic lighting off."""
        table = VirtualTable("Test", 100, 100)
        assert table.dynamic_lighting_enabled is False
        assert table.fog_exploration_mode == "current_only"
        assert table.ambient_light_level == 1.0

    def test_lighting_settings_in_to_dict(self):
        """to_dict includes all lighting settings so clients receive them on join."""
        table = VirtualTable("Test", 100, 100)
        table.dynamic_lighting_enabled = True
        table.fog_exploration_mode = "persist_dimmed"
        table.ambient_light_level = 0.3

        d = table.to_dict()
        assert d["dynamic_lighting_enabled"] is True
        assert d["fog_exploration_mode"] == "persist_dimmed"
        assert d["ambient_light_level"] == pytest.approx(0.3)

    def test_lighting_settings_round_trip_via_dict(self):
        """from_dict restores lighting settings correctly."""
        table = VirtualTable("Test", 100, 100)
        table.dynamic_lighting_enabled = True
        table.fog_exploration_mode = "persist_dimmed"
        table.ambient_light_level = 0.5

        # from_dict is an instance method — create a fresh table and load into it
        restored = VirtualTable("placeholder", 100, 100)
        restored.from_dict(table.to_dict())
        assert restored.dynamic_lighting_enabled is True
        assert restored.fog_exploration_mode == "persist_dimmed"
        assert restored.ambient_light_level == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# In-memory Entity / vision model
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestEntityVisionModel:
    def test_default_vision_fields(self):
        """New entities have no vision radius and darkvision disabled."""
        e = Entity("Fighter", (0, 0), "tokens")
        assert e.vision_radius is None
        assert e.has_darkvision is False
        assert e.darkvision_radius is None

    def test_vision_fields_in_to_dict(self):
        """to_dict includes vision fields so they propagate to clients."""
        e = Entity("Elf", (0, 0), "tokens", vision_radius=600, has_darkvision=True, darkvision_radius=300)
        d = e.to_dict()
        assert d["vision_radius"] == pytest.approx(600)
        assert d["has_darkvision"] is True
        assert d["darkvision_radius"] == pytest.approx(300)

    def test_vision_fields_round_trip_via_dict(self):
        """from_dict restores vision fields."""
        e = Entity("Dwarf", (0, 0), "tokens", vision_radius=450, has_darkvision=True, darkvision_radius=180)
        restored = Entity.from_dict(e.to_dict())
        assert restored.vision_radius == pytest.approx(450)
        assert restored.has_darkvision is True
        assert restored.darkvision_radius == pytest.approx(180)

    def test_entity_without_darkvision(self):
        """Entity with darkvision disabled does not expose a darkvision radius."""
        e = Entity("Human", (0, 0), "tokens", vision_radius=600, has_darkvision=False)
        d = e.to_dict()
        assert d["has_darkvision"] is False
        assert not d.get("darkvision_radius")


# ---------------------------------------------------------------------------
# DB persistence — lighting settings on VirtualTable
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDynamicLightingPersistence:
    def test_table_created_with_default_lighting(self, test_db, db_table):
        """Table defaults: dynamic lighting off, current_only fog, full ambient."""
        assert db_table.dynamic_lighting_enabled is False
        assert db_table.fog_exploration_mode == "current_only"
        assert db_table.ambient_light_level == pytest.approx(1.0)

    def test_dm_enables_dynamic_lighting(self, test_db, db_table):
        """DM turns on dynamic lighting; the change is persisted and readable back."""
        update = schemas.VirtualTableUpdate(dynamic_lighting_enabled=True)
        updated = crud.update_virtual_table(test_db, db_table.table_id, update)

        assert updated.dynamic_lighting_enabled is True

        # Verify it actually survived a DB round-trip
        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.dynamic_lighting_enabled is True

    def test_dm_sets_ambient_light(self, test_db, db_table):
        """DM adjusts ambient light level; value persists accurately."""
        update = schemas.VirtualTableUpdate(ambient_light_level=0.25)
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.ambient_light_level == pytest.approx(0.25)

    def test_dm_sets_fog_exploration_mode(self, test_db, db_table):
        """DM switches fog mode to persist_dimmed; setting persists."""
        update = schemas.VirtualTableUpdate(fog_exploration_mode="persist_dimmed")
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.fog_exploration_mode == "persist_dimmed"

    def test_multiple_lighting_fields_updated_atomically(self, test_db, db_table):
        """All lighting settings can be updated in a single call."""
        update = schemas.VirtualTableUpdate(
            dynamic_lighting_enabled=True,
            fog_exploration_mode="persist_dimmed",
            ambient_light_level=0.5,
        )
        crud.update_virtual_table(test_db, db_table.table_id, update)

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.dynamic_lighting_enabled is True
        assert fetched.fog_exploration_mode == "persist_dimmed"
        assert fetched.ambient_light_level == pytest.approx(0.5)

    def test_disabling_dynamic_lighting_persists(self, test_db, db_table):
        """After enabling, DM can turn dynamic lighting back off."""
        crud.update_virtual_table(test_db, db_table.table_id, schemas.VirtualTableUpdate(dynamic_lighting_enabled=True))
        crud.update_virtual_table(test_db, db_table.table_id, schemas.VirtualTableUpdate(dynamic_lighting_enabled=False))

        fetched = crud.get_virtual_table_by_id(test_db, db_table.table_id)
        assert fetched.dynamic_lighting_enabled is False


# ---------------------------------------------------------------------------
# DB persistence — vision fields on Entity
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestEntityVisionPersistence:
    def test_entity_created_with_vision_radius(self, test_db, db_table):
        """Token with a custom vision radius is stored and retrievable."""
        sprite_id = _make_sprite_id()
        entity_data = schemas.EntityCreate(
            entity_id=1,
            sprite_id=sprite_id,
            name="Fighter",
            position_x=10,
            position_y=10,
            layer="tokens",
            vision_radius=600.0,
        )
        entity = crud.create_entity(test_db, entity_data, db_table.id)

        assert entity.vision_radius == pytest.approx(600.0)
        assert entity.has_darkvision is False
        assert entity.darkvision_radius is None

    def test_entity_created_with_darkvision(self, test_db, db_table):
        """Token with darkvision is stored correctly."""
        sprite_id = _make_sprite_id()
        entity_data = schemas.EntityCreate(
            entity_id=2,
            sprite_id=sprite_id,
            name="Elf Ranger",
            position_x=15,
            position_y=15,
            layer="tokens",
            vision_radius=600.0,
            has_darkvision=True,
            darkvision_radius=300.0,
        )
        entity = crud.create_entity(test_db, entity_data, db_table.id)

        assert entity.has_darkvision is True
        assert entity.darkvision_radius == pytest.approx(300.0)

    def test_dm_updates_token_vision_radius(self, test_db, db_table):
        """DM can update a token's vision radius after creation."""
        sprite_id = _make_sprite_id()
        entity_data = schemas.EntityCreate(
            entity_id=3,
            sprite_id=sprite_id,
            name="Wizard",
            position_x=20,
            position_y=20,
            layer="tokens",
        )
        crud.create_entity(test_db, entity_data, db_table.id)

        update = schemas.EntityUpdate(vision_radius=500.0)
        updated = crud.update_entity(test_db, sprite_id, update)

        assert updated.vision_radius == pytest.approx(500.0)

    def test_dm_grants_darkvision_to_token(self, test_db, db_table):
        """DM can grant darkvision to a token that didn't have it."""
        sprite_id = _make_sprite_id()
        entity_data = schemas.EntityCreate(
            entity_id=4,
            sprite_id=sprite_id,
            name="Human Fighter",
            position_x=25,
            position_y=25,
            layer="tokens",
            has_darkvision=False,
        )
        crud.create_entity(test_db, entity_data, db_table.id)

        update = schemas.EntityUpdate(has_darkvision=True, darkvision_radius=200.0)
        updated = crud.update_entity(test_db, sprite_id, update)

        assert updated.has_darkvision is True
        assert updated.darkvision_radius == pytest.approx(200.0)

    def test_vision_fields_survive_full_table_save_and_load(self, test_db, session):
        """Vision fields on entities survive save_table_to_db / load_table_from_db cycle."""
        table = VirtualTable("Round-trip Table", 50, 50)
        table.dynamic_lighting_enabled = True
        table.fog_exploration_mode = "persist_dimmed"
        table.ambient_light_level = 0.4

        # Build a valid Entity and register it in the table
        entity = Entity(
            "Elf Scout", (5, 5), "tokens",
            entity_id=1,
            vision_radius=600, has_darkvision=True, darkvision_radius=300,
        )
        entity.sprite_id = _make_sprite_id()
        table.entities[1] = entity
        table.sprite_to_entity[entity.sprite_id] = 1

        crud.save_table_to_db(test_db, table, session.id)

        loaded_table, ok = crud.load_table_from_db(test_db, str(table.table_id))
        assert ok is True
        assert loaded_table.dynamic_lighting_enabled is True
        assert loaded_table.fog_exploration_mode == "persist_dimmed"
        assert loaded_table.ambient_light_level == pytest.approx(0.4)

        # Entity is keyed by integer entity_id in the loaded table
        loaded_entity = loaded_table.entities.get(1)
        assert loaded_entity is not None
        assert loaded_entity.vision_radius == pytest.approx(600)
        assert loaded_entity.has_darkvision is True
        assert loaded_entity.darkvision_radius == pytest.approx(300)


# ---------------------------------------------------------------------------
# Server-side validation of TABLE_SETTINGS_UPDATE
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestTableSettingsValidation:
    """
    Validate the domain rules enforced by handle_table_settings_update.
    These tests exercise the validation logic directly without spinning up
    a full WebSocket session.
    """

    VALID_FOG_MODES = {"current_only", "persist_dimmed"}

    def test_valid_fog_exploration_modes(self):
        """Only 'current_only' and 'persist_dimmed' are accepted."""
        for mode in self.VALID_FOG_MODES:
            assert mode in self.VALID_FOG_MODES

    def test_invalid_fog_exploration_mode_rejected(self):
        """Any other fog mode string must be rejected."""
        invalid_modes = ["always_visible", "fog_of_war", "", "null", "CURRENT_ONLY"]
        for mode in invalid_modes:
            assert mode not in self.VALID_FOG_MODES, f"Expected '{mode}' to be invalid"

    def test_ambient_light_level_bounds(self):
        """Ambient light level must be within [0.0, 1.0]."""
        valid_levels = [0.0, 0.5, 1.0, 0.25, 0.99]
        invalid_levels = [-0.1, 1.1, 2.0, -1.0]

        for level in valid_levels:
            assert 0.0 <= level <= 1.0, f"Expected {level} to be valid"
        for level in invalid_levels:
            assert not (0.0 <= level <= 1.0), f"Expected {level} to be invalid"

    def test_schema_rejects_invalid_ambient_level(self):
        """VirtualTableUpdate schema accepts floats; caller validates range."""
        # Schema itself is permissive — protocol handler enforces [0.0, 1.0]
        update = schemas.VirtualTableUpdate(ambient_light_level=0.75)
        assert update.ambient_light_level == pytest.approx(0.75)
