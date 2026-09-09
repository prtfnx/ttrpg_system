from unittest.mock import Mock

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


def test_startup_enforces_one_worker_even_with_web_concurrency(monkeypatch):
    from scripts import migrate_and_start

    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    monkeypatch.setenv("PORT", "9123")
    monkeypatch.setattr(migrate_and_start, "migrate", lambda: repository_heads())
    execute = Mock()
    monkeypatch.setattr(migrate_and_start.os, "execvp", execute)

    migrate_and_start.main()

    arguments = execute.call_args.args[1]
    assert arguments[arguments.index("--workers") + 1] == "1"
    assert arguments[arguments.index("--port") + 1] == "9123"
