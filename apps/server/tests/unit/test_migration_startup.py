from database.schema import migrate_database_for_start, repository_heads
from sqlalchemy import create_engine


def test_startup_migration_upgrades_and_verifies_head(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'startup.db').as_posix()}"
    engine = create_engine(database_url)

    try:
        assert migrate_database_for_start(engine) == repository_heads()
        assert migrate_database_for_start(engine) == repository_heads()
    finally:
        engine.dispose()
