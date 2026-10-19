import logging
from unittest.mock import Mock

import pytest
from alembic import command
from config import Settings
from database import database as database_module
from database.models import GameSession, User
from database.schema import alembic_config, database_revision, migrate_database_for_start, repository_heads
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session


def test_startup_migration_upgrades_and_verifies_head(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'startup.db').as_posix()}"
    engine = create_engine(database_url)
    root_logger = logging.getLogger()
    handlers, level = tuple(root_logger.handlers), root_logger.level

    try:
        assert migrate_database_for_start(engine) == repository_heads()
        assert migrate_database_for_start(engine) == repository_heads()
        assert tuple(root_logger.handlers) == handlers
        assert root_logger.level == level
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


@pytest.mark.parametrize("launcher", ["direct", "hosted"])
def test_launchers_upgrade_existing_database_before_http(tmp_path, monkeypatch, launcher):
    import main

    from scripts import migrate_and_start

    database_url = f"sqlite:///{(tmp_path / 'existing.db').as_posix()}"
    command.upgrade(alembic_config(database_url), "0010_paint_objects")
    engine = create_engine(database_url)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(database_module, "database_settings", Settings(
        DATABASE_URL=database_url, DATABASE_MIGRATION_URL=database_url,
    ))

    try:
        with Session(engine) as db:
            owner = User(username="existing-owner", hashed_password="not-a-login")
            db.add(owner)
            db.flush()
            game = GameSession(name="Existing game", session_code="STARTUP", owner_id=owner.id)
            db.add(game)
            db.flush()
            db.execute(text(
                "INSERT INTO game_players (session_id, user_id, role, is_connected) "
                "VALUES (:session, :user, 'owner', false)"
            ), {"session": game.id, "user": owner.id})
            db.commit()

        def verify_http_start(*args, **kwargs):
            assert database_revision(engine) == repository_heads()
            assert "canvas_command_journal" in inspect(engine).get_table_names()
            with engine.connect() as connection:
                assert connection.execute(text("SELECT username FROM users")).scalar_one() == "existing-owner"
                assert connection.execute(text("SELECT name FROM game_sessions")).scalar_one() == "Existing game"
                assert connection.execute(text("SELECT selection_mode FROM game_players")).scalar_one() == "separate"
                assert connection.execute(text("SELECT generation FROM application_writer_state")).scalar_one() == 0

        start_http = Mock(side_effect=verify_http_start)
        monkeypatch.setattr(main.uvicorn, "run", start_http)
        monkeypatch.setattr(migrate_and_start.os, "execvp", start_http)
        start = main.run_server if launcher == "direct" else migrate_and_start.main
        start()
        start()
        assert start_http.call_count == 2
    finally:
        engine.dispose()


@pytest.mark.parametrize("launcher", ["direct", "hosted"])
def test_launchers_do_not_start_http_when_migration_fails(monkeypatch, caplog, launcher):
    import main

    from scripts import migrate_and_start

    monkeypatch.setattr(migrate_and_start, "migrate", Mock(
        side_effect=RuntimeError("postgresql://owner:secret@private-db/database"),
    ))
    start_http = Mock()
    monkeypatch.setattr(main.uvicorn, "run", start_http)
    monkeypatch.setattr(migrate_and_start.os, "execvp", start_http)
    start = main.run_server if launcher == "direct" else migrate_and_start.main

    with pytest.raises(SystemExit) as error:
        start()

    assert error.value.code == 1
    assert "database.migration.failed" in caplog.text
    assert "secret" not in caplog.text
    assert "private-db" not in caplog.text
    assert all(record.exc_info is None for record in caplog.records if record.message == "database.migration.failed")
    start_http.assert_not_called()
