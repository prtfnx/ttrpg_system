from config import Settings
from database.database import create_database_engine
from database.url import normalize_database_url


def test_provider_postgresql_url_uses_psycopg3_without_losing_query_options():
    url = normalize_database_url(
        "postgresql://app:secret@database.example/ttrpg"
        "?sslmode=require&channel_binding=require"
    )

    assert url.drivername == "postgresql+psycopg"
    assert url.username == "app"
    assert url.password == "secret"
    assert url.query["sslmode"] == "require"
    assert url.query["channel_binding"] == "require"
    assert "secret" not in url.render_as_string(hide_password=True)


def test_explicit_psycopg_url_is_unchanged():
    raw = "postgresql+psycopg://app:secret@database.example/ttrpg"

    assert normalize_database_url(raw).render_as_string(hide_password=False) == raw


def test_sqlite_engine_enables_foreign_keys_for_unit_test_compatibility():
    settings = Settings(DATABASE_URL="sqlite:///:memory:")
    engine = create_database_engine(settings)

    try:
        with engine.connect() as connection:
            enabled = connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one()
        assert enabled == 1
    finally:
        engine.dispose()


def test_unsupported_database_backend_is_rejected():
    settings = Settings(DATABASE_URL="mysql://app:secret@database.example/ttrpg")

    try:
        create_database_engine(settings)
    except ValueError as exc:
        assert str(exc) == "Unsupported database backend: mysql"
    else:
        raise AssertionError("Expected an unsupported database backend error")
