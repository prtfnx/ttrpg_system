"""
Integration tests for vision and lighting entity persistence.
Tests that light/obstacle/vision entity data round-trips correctly through the DB.
"""
import json
import sys
import pytest
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from server_host.database import crud, schemas
    from server_host.database.models import Base, Entity, GameSession, User, VirtualTable, Wall as WallModel
    HAS_SERVER = True
except ImportError:
    HAS_SERVER = False

pytestmark = pytest.mark.skipif(not HAS_SERVER, reason="server_host not importable")


# ---- fixtures ----

@pytest.fixture
def engine():
    # Fresh in-memory DB per test (crud.create_entity commits, so we need isolation)
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture
def db(engine):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def table_db_id(db):
    """Create the minimal User → GameSession → VirtualTable chain, return VirtualTable.id."""
    user = User(username="dm_test", hashed_password="hashed", email="dm@test.com")
    db.add(user)
    db.flush()

    session = GameSession(name="Test Campaign", session_code="TEST01", owner_id=user.id)
    db.add(session)
    db.flush()

    table = VirtualTable(
        table_id="aaaa-bbbb-cccc-dddd",
        name="Main Table",
        width=2000,
        height=2000,
        session_id=session.id,
    )
    db.add(table)
    db.flush()

    return table.id


def make_entity_data(**kwargs) -> schemas.EntityCreate:
    defaults = dict(
        entity_id=1,
        sprite_id="sprite-001",
        name="Test Sprite",
        position_x=100,
        position_y=200,
        layer="tokens",
    )
    defaults.update(kwargs)
    return schemas.EntityCreate(**defaults)


# ---- tests ----

def test_light_entity_round_trip(db, table_db_id):
    meta = json.dumps({"isLight": True, "presetName": "Torch", "radius": 150, "intensity": 1.0, "isOn": True})
    data = make_entity_data(
        sprite_id="light-001",
        layer="light",
        texture_path="__LIGHT__",
        metadata=meta,
    )
    entity = crud.create_entity(db, data, table_db_id)
    db.flush()

    assert entity.layer == "light"
    assert entity.texture_path == "__LIGHT__"
    stored = json.loads(entity.entity_metadata)
    assert stored["isLight"] is True
    assert stored["presetName"] == "Torch"
    assert stored["radius"] == 150


def test_wall_entity_round_trip(db, table_db_id):
    """Walls are first-class entities stored in the walls table, not in entities."""
    wall_data = {
        'wall_id': 'wall-001',
        'table_id': 'aaaa-bbbb-cccc-dddd',
        'x1': 50.0, 'y1': 50.0,
        'x2': 200.0, 'y2': 50.0,
        'wall_type': 'normal',
        'blocks_light': True,
        'blocks_sight': True,
        'blocks_movement': True,
        'blocks_sound': True,
    }
    wall = crud.create_wall(db, wall_data)

    loaded = crud.get_wall(db, 'wall-001')
    assert loaded is not None
    assert loaded.x2 == 200.0
    assert loaded.blocks_light is True
    assert loaded.wall_type == 'normal'
    assert loaded.table_id == 'aaaa-bbbb-cccc-dddd'


def test_entity_vision_radius_none_by_default(db, table_db_id):
    data = make_entity_data(entity_id=3, sprite_id="hero-001")
    entity = crud.create_entity(db, data, table_db_id)
    db.flush()

    assert entity.vision_radius is None
    assert entity.has_darkvision is False
    assert entity.darkvision_radius is None


def test_entity_vision_and_darkvision(db, table_db_id):
    data = make_entity_data(
        entity_id=4,
        sprite_id="paladin-001",
        name="Paladin",
        layer="tokens",
        vision_radius=300.0,
        has_darkvision=True,
        darkvision_radius=60.0,
        controlled_by=json.dumps([1]),
    )
    entity = crud.create_entity(db, data, table_db_id)
    db.flush()

    assert entity.vision_radius == 300.0
    assert entity.has_darkvision is True
    assert entity.darkvision_radius == 60.0
    assert json.loads(entity.controlled_by) == [1]


def test_obstacle_entity_stores_polygon_vertices(db, table_db_id):
    verts = [[0, 0], [100, 0], [100, 100], [0, 100]]
    data = make_entity_data(
        entity_id=5,
        sprite_id="poly-001",
        name="Stone Wall",
        layer="obstacles",
        obstacle_type="polygon",
        obstacle_data=json.dumps({"vertices": verts}),
    )
    entity = crud.create_entity(db, data, table_db_id)
    db.flush()

    assert entity.layer == "obstacles"
    assert entity.obstacle_type == "polygon"
    stored_verts = json.loads(entity.obstacle_data)["vertices"]
    assert stored_verts == verts
