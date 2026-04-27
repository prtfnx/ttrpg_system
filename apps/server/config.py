from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    """Settings for the application, loaded from environment variables."""
   
    # These will be read from environment variables set manually on Render
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-me-in-production-0001")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")

    # Session secret for OAuth state management (min 32 chars)
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-secret-change-me-now-min32chars-0001")
    
    # Environment configuration
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    
    # Google OAuth credentials (optional - OAuth disabled if not set)
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    
    # Email settings (Resend)
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "noreply@ttrpg-system.com")

    # R2 (Cloudflare) settings for asset storage
    r2_enabled: bool = False
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket_name: str = ""
    r2_endpoint: str = ""        # Full endpoint URL (optional, derived from account_id if absent)
    r2_public_url: str = ""      # Public bucket URL for direct access
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")