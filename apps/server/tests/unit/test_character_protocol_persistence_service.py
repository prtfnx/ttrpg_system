import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture()
def persistence_context(monkeypatch):
    import service.character_protocol_persistence_service as persistence
    from database.models import Base, Entity, GameSession, User, VirtualTable

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(persistence, "SessionLocal", session_factory)

    with session_factory() as db:
        owners = [
            User(username="owner-one", email="one@test", hashed_password="x"),
            User(username="owner-two", email="two@test", hashed_password="x"),
        ]
        db.add_all(owners)
        db.flush()
        sessions = [
            GameSession(name="One", session_code="ONE", owner_id=owners[0].id),
            GameSession(name="Two", session_code="TWO", owner_id=owners[1].id),
        ]
        db.add_all(sessions)
        db.flush()
        tables = [
            VirtualTable(
                table_id="table-one",
                name="One",
                width=100,
                height=100,
                session_id=sessions[0].id,
            ),
            VirtualTable(
                table_id="table-two",
                name="Two",
                width=100,
                height=100,
                session_id=sessions[1].id,
            ),
        ]
        db.add_all(tables)
        db.flush()
        db.add_all([
            Entity(
                entity_id=1,
                sprite_id="sprite-one",
                table_id=tables[0].id,
                name="One",
                position_x=0,
                position_y=0,
                layer="tokens",
                character_id="character-one",
                hp=1,
                max_hp=2,
                ac=3,
            ),
            Entity(
                entity_id=1,
                sprite_id="sprite-two",
                table_id=tables[1].id,
                name="Two",
                position_x=0,
                position_y=0,
                layer="tokens",
                character_id="character-one",
                hp=4,
                max_hp=5,
                ac=6,
            ),
        ])
        db.commit()
        ids = sessions[0].id, owners[0].id

    return persistence, session_factory, ids


@pytest.mark.unit
@pytest.mark.parametrize("layer", ["tokens", "dungeon_master", "light"])
def test_token_stats_are_persisted_only_in_authoritative_session(persistence_context, layer):
    from database.models import Entity

    persistence, session_factory, (session_id, _) = persistence_context
    with session_factory() as db:
        first = db.query(Entity).filter(Entity.sprite_id == "sprite-one").one()
        first.layer = layer
        db.commit()

    updates = persistence.persist_character_token_stats(
        session_id,
        "character-one",
        {"hp": 9, "max_hp": 12, "ac": 17},
    )

    assert updates == [
        persistence.TokenStatUpdate(sprite_id="sprite-one", table_id="table-one", layer=layer)
    ]
    with session_factory() as db:
        first = db.query(Entity).filter(Entity.sprite_id == "sprite-one").one()
        second = db.query(Entity).filter(Entity.sprite_id == "sprite-two").one()
        assert (first.hp, first.max_hp, first.ac) == (9, 12, 17)
        assert (second.hp, second.max_hp, second.ac) == (4, 5, 6)


@pytest.mark.unit
def test_xp_award_is_recorded_with_protocol_context(persistence_context):
    from database.models import CharacterLog

    persistence, session_factory, (session_id, user_id) = persistence_context

    persistence.record_xp_award(
        character_id="character-one",
        session_id=session_id,
        user_id=user_id,
        amount=250,
        source="quest",
        description="Saved the village",
    )

    with session_factory() as db:
        log = db.query(CharacterLog).one()
        assert log.action_type == "xp_award"
        assert log.description == "+250 XP from quest: Saved the village"
        assert log.session_id == session_id
        assert log.user_id == user_id


@pytest.mark.parametrize("commit", [False, True])
def test_linked_stats_share_the_callers_character_transaction(persistence_context, commit):
    import json

    from database.models import Entity, SessionCharacter

    persistence, factory, (session_id, user_id) = persistence_context
    with factory() as db:
        db.add(SessionCharacter(character_id="character-one", session_id=session_id, owner_user_id=user_id,
                                character_name="Hero", character_data='{"data":{"stats":{"hp":1}}}', version=1))
        db.commit()
    with factory() as db:
        character = db.query(SessionCharacter).filter_by(character_id="character-one").one()
        character.character_data = '{"data":{"stats":{"hp":9}}}'
        character.version = 2
        identities = persistence.stage_character_token_stats(db, session_id, "character-one", {"hp": 9})
        assert identities == [persistence.TokenStatUpdate("sprite-one", "table-one", "tokens")]
        assert db.in_transaction()
        if commit:
            db.commit()
        else:
            db.rollback()
    with factory() as db:
        character = db.query(SessionCharacter).filter_by(character_id="character-one").one()
        entity = db.query(Entity).filter_by(sprite_id="sprite-one").one()
        assert json.loads(character.character_data)["data"]["stats"]["hp"] == (9 if commit else 1)
        assert character.version == (2 if commit else 1)
        assert entity.hp == (9 if commit else 1)
        assert db.query(Entity).filter_by(sprite_id="sprite-two").one().hp == 4


def test_linked_stat_staging_cannot_modify_identity_or_permissions(persistence_context):
    from database.models import Entity

    persistence, factory, (session_id, _) = persistence_context
    with factory() as db:
        with pytest.raises(ValueError, match="only change"):
            persistence.stage_character_token_stats(db, session_id, "character-one",
                                                    {"hp": 9, "controlled_by": "[999]"})
        db.commit()
    with factory() as db:
        assert db.query(Entity).filter_by(sprite_id="sprite-one").one().hp == 1
