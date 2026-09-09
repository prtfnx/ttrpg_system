from alembic import command
from database.schema import alembic_config
from sqlalchemy import create_engine, inspect, text


def test_guest_migration_preserves_accounts_and_revokes_legacy_host(tmp_path):
    url = f"sqlite:///{(tmp_path / 'guest-migration.db').as_posix()}"
    config = alembic_config(url)
    command.upgrade(config, "0006_upload_intent_cleanup")
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO users (id, username, email, hashed_password, disabled, session_version, is_verified)
                VALUES (1, 'demo_host', 'demo@ttrpg-system.local', 'legacy', false, 0, false),
                       (2, 'normal', 'normal@example.com', 'existing', false, 3, false)
            """))
            connection.execute(text("""
                INSERT INTO game_sessions (name, session_code, owner_id, is_demo, is_active)
                VALUES ('Demo', 'DEMO2026', 1, true, true)
            """))
        command.upgrade(config, "head")
        with engine.connect() as connection:
            users = connection.execute(text(
                "SELECT username, disabled, session_version, guest_expires_at FROM users ORDER BY id"
            )).all()
        assert users == [("demo_host", 1, 1, None), ("normal", 0, 3, None)]
        assert "guest_expires_at" in {column["name"] for column in inspect(engine).get_columns("users")}
        command.check(config)
    finally:
        engine.dispose()
