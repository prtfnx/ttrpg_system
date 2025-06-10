from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    """Settings for the application, loaded from environment variables."""
   
    # These will be read from environment variables set manually on Render
    SECRET_KEY: str = os.getenv("SECRET_KEY", "setted in env")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    
    model_config = SettingsConfigDict(env_file=".env")