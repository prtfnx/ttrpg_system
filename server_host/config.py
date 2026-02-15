from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    """Settings for the application, loaded from environment variables."""
   
    # These will be read from environment variables set manually on Render
    SECRET_KEY: str = os.getenv("SECRET_KEY", "setted in env")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    jwt_secret_key: str = ""
    
    # Session secret for OAuth state management
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
    
    # Environment configuration
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    
    # Google OAuth credentials (optional - OAuth disabled if not set)
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    
    # R2 (Cloudflare) settings for asset storage
    r2_enabled: bool = False
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket_name: str = ""
    
    model_config = SettingsConfigDict(env_file=".env")