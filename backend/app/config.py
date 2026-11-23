"""Application settings loaded from environment variables or a local .env file."""

from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "JobTrack AI"
    database_url: str = "sqlite:///./jobtrack.db"
    cors_origins: str = "http://localhost:5173"

    # AI analysis (optional). Without a key the app uses the local keyword analysis.
    # The key is only read on the backend and never sent to the frontend.
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-opus-5-5"
    ai_timeout_seconds: float = 60.0
    ai_max_retries: int = 2

    @field_validator("anthropic_api_key", mode="before")
    @classmethod
    def blank_key_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
