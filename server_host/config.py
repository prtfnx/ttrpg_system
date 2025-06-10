from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings for the application, loaded from environment variables."""
   
    SECRET_KEY: str 
    ALGORITHM: str 
    model_config = SettingsConfigDict(env_file=".env")