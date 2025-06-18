from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    """Settings for the application, loaded from environment variables."""
   
    # These will be read from environment variables set manually on Render
    SECRET_KEY: str = os.getenv("SECRET_KEY", "setted in env")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    jwt_secret_key: str = ""
    
    # R2 (Cloudflare) settings for asset storage
    r2_enabled: bool = False
    r2_account_id: str = ""
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket_name: str = ""
    
    model_config = SettingsConfigDict(env_file=".env")