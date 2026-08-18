import json

import pytest
from database.models import Base, Entity, GameSession, PaintStroke, VirtualTable, Wall
from service import canvas_persistence_service as service
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture()
def canvas_db(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(service, "SessionLocal", factory)
    return factory


def _table(table_id: str, session_id: int) -> VirtualTable:
    return VirtualTable(
        table_id=table_id,
        session_id=session_id,
        name=table_id,
        width=100,
        height=100,
    )


def _entity(table_pk: int, sprite_id: str, controlled_by: str) -> Entity:
    return Entity(
        entity_id=1,
        sprite_id=sprite_id,
        table_id=table_pk,
        name=sprite_id,
        position_x=0,
        position_y=0,
        layer="tokens",
        controlled_by=controlled_by,
    )


def test_controlled_sprite_count_is_session_scoped_and_exact(canvas_db):
    with canvas_db() as db:
        first = _table("table-one", 1)
        second = _table("table-two", 2)
        db.add_all([first, second])
        db.flush()
        db.add_all([
            _entity(first.id, "owned", "[1]"),
            _entity(first.id, "other-user", "[10]"),
            _entity(first.id, "malformed", "not-json"),
            _entity(second.id, "other-session", "[1]"),
        ])
        db.commit()

    assert service.count_controlled_sprites(1, 1) == 1
    assert service.count_controlled_sprites(2, 1) == 1


def test_table_hydration_returns_detached_serializable_data(canvas_db):
    with canvas_db() as db:
        table = _table("table-one", 1)
        table.layer_settings = json.dumps({"tokens": {"opacity": 0.5}})
        db.add(table)
        db.add(Wall(
            wall_id="wall-one",
            table_id="table-one",
            x1=0,
            y1=0,
            x2=5,
            y2=5,
        ))
        db.add(PaintStroke(
            stroke_id="stroke-one",
            table_id="table-one",
            stroke_data='{"points": []}',
        ))
        db.commit()

    result = service.load_table_hydration("table-one")

    assert result.walls[0]["wall_id"] == "wall-one"
    assert result.layer_settings == {"tokens": {"opacity": 0.5}}
    assert result.paint_strokes[0]["stroke_id"] == "stroke-one"


def test_movement_policy_and_table_settings_round_trip(canvas_db):
    with canvas_db() as db:
        db.add(GameSession(
            id=1,
            name="Session",
            session_code="TST",
            owner_id=1,
            game_mode="combat",
            session_rules_json=json.dumps({"grid_size": 70}),
        ))
        db.add(_table("table-one", 1))
        db.commit()

    rules, mode = service.load_movement_policy("TST")
    updated = service.persist_table_settings("table-one", {
        "ambient_light_level": 0.25,
        "grid_enabled": False,
    })

    assert rules is not None
    assert rules.session_id == "TST"
    assert mode == "combat"
    assert updated is True
    with canvas_db() as db:
        table = db.query(VirtualTable).filter_by(table_id="table-one").one()
        assert table.ambient_light_level == 0.25
        assert table.grid_enabled is False


def test_entity_character_lookup_returns_only_scalar_data(canvas_db):
    with canvas_db() as db:
        table = _table("table-one", 1)
        db.add(table)
        db.flush()
        entity = _entity(table.id, "sprite-one", "[]")
        entity.character_id = "character-one"
        db.add(entity)
        db.commit()

    assert service.load_entity_character_id("sprite-one") == "character-one"
    assert service.load_entity_character_id("missing") is None
