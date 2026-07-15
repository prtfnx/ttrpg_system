import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "dev-secret-key-change-me-in-production-0001"
DEFAULT_SESSION_SECRET = "dev-secret-change-me-now-min32chars-0001"


def _is_production(environment: str) -> bool:
    return environment.lower() == "production"


def parse_cors_origins(cors_origins: str, environment: str) -> list[str]:
    """Normalize configured CORS origins and reject wildcard production CORS."""
    origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
    if not origins:
        origins = ["*"]

    if _is_production(environment) and "*" in origins:
        raise ValueError("CORS_ORIGINS must list explicit origins in production.")

    return origins


def resolve_session_secret(session_secret: str, environment: str) -> str:
    """Return the session secret, enforcing a strong non-default production value."""
    if _is_production(environment):
        if not session_secret or len(session_secret) < 32 or session_secret == DEFAULT_SESSION_SECRET:
            raise ValueError(
                "SESSION_SECRET must be set to a strong, at least 32-character non-default value in production."
            )
        return session_secret

    if not session_secret or len(session_secret) < 32:
        return DEFAULT_SESSION_SECRET

    return session_secret


class Settings(BaseSettings):
    """Settings for the application, loaded from environment variables."""

    # These will be read from environment variables set manually on Render
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"

    # Session secret for OAuth state management (min 32 chars)
    SESSION_SECRET: str = DEFAULT_SESSION_SECRET

    # Environment configuration
    ENVIRONMENT: str = "development"
    BASE_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "*"

    # Observability
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    SERVICE_NAME: str = "ttrpg-server"
    SERVICE_VERSION: str = os.getenv("RENDER_GIT_COMMIT", "development")
    SERVICE_INSTANCE_ID: str = ""
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    OTEL_EXPORTER_OTLP_HEADERS: str = ""
    OTEL_TRACES_SAMPLER_ARG: float = 0.1
    METRICS_ENABLED: bool = True
    METRICS_TOKEN: str = ""
    BROWSER_TELEMETRY_ENABLED: bool = True
    BROWSER_TELEMETRY_SAMPLE_RATE: float = 0.1
    AUDIT_RETENTION_DAYS: int = 365
    WS_MAX_MESSAGE_BYTES: int = 64 * 1024
    WS_MESSAGES_PER_MINUTE: int = 120

    # Google OAuth credentials (optional - OAuth disabled if not set)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Email settings (Resend)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@ttrpg-system.com"

    # R2 (Cloudflare) settings for asset storage
    r2_enabled: bool = False
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket_name: str = ""
    r2_endpoint: str = ""        # Full endpoint URL (optional, derived from account_id if absent)
    r2_public_url: str = ""      # Public bucket URL for direct access

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_production_security(self):
        self.LOG_LEVEL = self.LOG_LEVEL.upper()
        self.LOG_FORMAT = self.LOG_FORMAT.lower()
        if self.LOG_LEVEL not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR, or CRITICAL.")
        if self.LOG_FORMAT not in {"json", "text"}:
            raise ValueError("LOG_FORMAT must be json or text.")
        if not 0 <= self.OTEL_TRACES_SAMPLER_ARG <= 1:
            raise ValueError("OTEL_TRACES_SAMPLER_ARG must be between 0 and 1.")
        if not 0 <= self.BROWSER_TELEMETRY_SAMPLE_RATE <= 1:
            raise ValueError("BROWSER_TELEMETRY_SAMPLE_RATE must be between 0 and 1.")
        if not 30 <= self.AUDIT_RETENTION_DAYS <= 3650:
            raise ValueError("AUDIT_RETENTION_DAYS must be between 30 and 3650.")
        if not 1024 <= self.WS_MAX_MESSAGE_BYTES <= 1024 * 1024:
            raise ValueError("WS_MAX_MESSAGE_BYTES must be between 1024 and 1048576.")
        if not 1 <= self.WS_MESSAGES_PER_MINUTE <= 6000:
            raise ValueError("WS_MESSAGES_PER_MINUTE must be between 1 and 6000.")
        if _is_production(self.ENVIRONMENT):
            if not self.SECRET_KEY or len(self.SECRET_KEY) < 32 or self.SECRET_KEY == DEFAULT_SECRET_KEY:
                raise ValueError(
                    "SECRET_KEY must be set to a strong, at least 32-character non-default value in production."
                )

            resolve_session_secret(self.SESSION_SECRET, self.ENVIRONMENT)
            parse_cors_origins(self.CORS_ORIGINS, self.ENVIRONMENT)
            if self.METRICS_ENABLED and len(self.METRICS_TOKEN) < 32:
                raise ValueError(
                    "METRICS_TOKEN must be at least 32 characters when metrics are enabled in production."
                )

        return self

    @property
    def is_production(self) -> bool:
        return _is_production(self.ENVIRONMENT)

    @property
    def cors_origin_list(self) -> list[str]:
        return parse_cors_origins(self.CORS_ORIGINS, self.ENVIRONMENT)

    @property
    def resolved_session_secret(self) -> str:
        return resolve_session_secret(self.SESSION_SECRET, self.ENVIRONMENT)
