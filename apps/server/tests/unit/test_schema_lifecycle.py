from alembic import command
from sqlalchemy import create_engine

from database.models import Base
from database.schema import (
    alembic_config,
    database_revision,
    repository_heads,
    schema_is_current,
    upgrade_database_to_head,
)


def test_schema_lifecycle_tracks_repository_head(tmp_path):
    database_path = tmp_path / "lifecycle.db"
    database_url = f"sqlite:///{database_path.as_posix()}"
    engine = create_engine(database_url)

    try:
        assert schema_is_current(engine) is False

        upgrade_database_to_head(database_url)

        assert schema_is_current(engine) is True
        assert database_revision(engine) == repository_heads()

        command.downgrade(alembic_config(database_url), "base")
        assert schema_is_current(engine) is False
    finally:
        engine.dispose()


def test_repository_baseline_matches_all_model_tables():
    assert len(Base.metadata.tables) == 24
    assert repository_heads() == ("0001_postgresql_baseline",)
