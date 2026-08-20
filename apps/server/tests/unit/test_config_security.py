import pytest
from config import DEFAULT_SECRET_KEY, DEFAULT_SESSION_SECRET, Settings


def test_development_allows_local_defaults():
    settings = Settings(
        ENVIRONMENT="development",
        SECRET_KEY=DEFAULT_SECRET_KEY,
        SESSION_SECRET="short",
        CORS_ORIGINS="*",
    )

    assert settings.cors_origin_list == ["*"]
    assert settings.resolved_session_secret == DEFAULT_SESSION_SECRET


def test_production_rejects_default_jwt_secret():
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY=DEFAULT_SECRET_KEY,
            SESSION_SECRET="s" * 40,
            CORS_ORIGINS="https://app.example.com",
        )


def test_production_rejects_default_session_secret():
    with pytest.raises(ValueError, match="SESSION_SECRET"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="j" * 40,
            SESSION_SECRET=DEFAULT_SESSION_SECRET,
            CORS_ORIGINS="https://app.example.com",
        )


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="j" * 40,
            SESSION_SECRET="s" * 40,
            CORS_ORIGINS="*",
        )


def test_production_accepts_explicit_origins_and_strong_secrets():
    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="j" * 40,
        SESSION_SECRET="s" * 40,
        CORS_ORIGINS="https://app.example.com, https://admin.example.com",
        METRICS_TOKEN="m" * 40,
        DATABASE_URL="postgresql://app:secret@database.example/ttrpg",
    )

    assert settings.is_production
    assert settings.cors_origin_list == ["https://app.example.com", "https://admin.example.com"]
    assert settings.resolved_session_secret == "s" * 40


def test_production_requires_postgresql():
    with pytest.raises(ValueError, match="DATABASE_URL"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="j" * 40,
            SESSION_SECRET="s" * 40,
            CORS_ORIGINS="https://app.example.com",
            METRICS_TOKEN="m" * 40,
            DATABASE_URL="sqlite:///./ttrpg.db",
        )


def test_production_migration_database_requires_postgresql():
    with pytest.raises(ValueError, match="DATABASE_MIGRATION_URL"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="j" * 40,
            SESSION_SECRET="s" * 40,
            CORS_ORIGINS="https://app.example.com",
            METRICS_TOKEN="m" * 40,
            DATABASE_URL="postgresql://app:secret@database.example/ttrpg",
            DATABASE_MIGRATION_URL="sqlite:///./migration.db",
        )


def test_production_requires_metrics_authentication_token():
    with pytest.raises(ValueError, match="METRICS_TOKEN"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="j" * 40,
            SESSION_SECRET="s" * 40,
            CORS_ORIGINS="https://app.example.com",
        )


def test_observability_settings_are_normalized_and_bounded():
    settings = Settings(LOG_LEVEL="warning", LOG_FORMAT="TEXT", OTEL_TRACES_SAMPLER_ARG=0.5)
    assert settings.LOG_LEVEL == "WARNING"
    assert settings.LOG_FORMAT == "text"

    with pytest.raises(ValueError, match="OTEL_TRACES_SAMPLER_ARG"):
        Settings(OTEL_TRACES_SAMPLER_ARG=1.1)

    with pytest.raises(ValueError, match="WS_MAX_MESSAGE_BYTES"):
        Settings(WS_MAX_MESSAGE_BYTES=100)

    with pytest.raises(ValueError, match="WS_MESSAGES_PER_MINUTE"):
        Settings(WS_MESSAGES_PER_MINUTE=0)

    with pytest.raises(ValueError, match="WS_SEND_TIMEOUT_SECONDS"):
        Settings(WS_SEND_TIMEOUT_SECONDS=0)

    with pytest.raises(ValueError, match="AUDIT_RETENTION_DAYS"):
        Settings(AUDIT_RETENTION_DAYS=7)

    with pytest.raises(ValueError, match="CHAT_RETENTION_DAYS"):
        Settings(CHAT_RETENTION_DAYS=7)


def test_asset_resource_limits_are_bounded_and_consistent():
    with pytest.raises(ValueError, match="ASSET_MAX_FILE_BYTES"):
        Settings(ASSET_MAX_FILE_BYTES=100)

    with pytest.raises(ValueError, match="ASSET_UPLOADS_PER_MINUTE"):
        Settings(ASSET_UPLOADS_PER_MINUTE=0)

    with pytest.raises(ValueError, match="ASSET_UPLOADS_PER_HOUR"):
        Settings(ASSET_UPLOADS_PER_MINUTE=20, ASSET_UPLOADS_PER_HOUR=10)

    with pytest.raises(ValueError, match="ASSET_MAX_PENDING_UPLOADS_PER_USER"):
        Settings(ASSET_MAX_PENDING_UPLOADS_PER_USER=0)

    with pytest.raises(ValueError, match="ASSET_MAX_ASSETS_PER_USER"):
        Settings(ASSET_MAX_ASSETS_PER_USER=0)

    with pytest.raises(ValueError, match="ASSET_MAX_STORAGE_BYTES_PER_USER"):
        Settings(ASSET_MAX_STORAGE_BYTES_PER_USER=1024)

    with pytest.raises(ValueError, match="ASSET_DOWNLOADS_PER_HOUR"):
        Settings(ASSET_DOWNLOADS_PER_HOUR=0)

    with pytest.raises(ValueError, match="ASSET_DOWNLOAD_URL_TTL_SECONDS"):
        Settings(ASSET_DOWNLOAD_URL_TTL_SECONDS=10)

    with pytest.raises(ValueError, match="ASSET_UPLOAD_URL_TTL_SECONDS"):
        Settings(ASSET_UPLOAD_URL_TTL_SECONDS=10)

    with pytest.raises(ValueError, match="ASSET_UPLOAD_INTENT_TTL_SECONDS"):
        Settings(ASSET_UPLOAD_URL_TTL_SECONDS=900, ASSET_UPLOAD_INTENT_TTL_SECONDS=899)

    with pytest.raises(ValueError, match="ASSET_MAX_TOTAL_STORAGE_BYTES"):
        Settings(ASSET_MAX_TOTAL_STORAGE_BYTES=1024)

    with pytest.raises(ValueError, match="ASSET_MAX_LINKS_PER_SESSION"):
        Settings(ASSET_MAX_LINKS_PER_SESSION=0)

    with pytest.raises(ValueError, match="ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION"):
        Settings(
            ASSET_MAX_LINKS_PER_SESSION=10,
            ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION=11,
        )


@pytest.mark.parametrize("value", [0, 129])
def test_blocking_worker_concurrency_is_bounded(value: int):
    with pytest.raises(ValueError, match="BLOCKING_WORKER_CONCURRENCY"):
        Settings(BLOCKING_WORKER_CONCURRENCY=value)


@pytest.mark.parametrize("value", [1, 128])
def test_blocking_worker_concurrency_accepts_documented_boundaries(value: int):
    assert Settings(BLOCKING_WORKER_CONCURRENCY=value).BLOCKING_WORKER_CONCURRENCY == value
