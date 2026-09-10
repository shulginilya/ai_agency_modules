"""Application settings, read from the environment (12-factor style)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="AIM_", extra="ignore"
    )

    app_name: str = "AI Modules API"
    api_prefix: str = "/api"
    debug: bool = False

    #: Origins allowed to call the API from a browser.
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    #: Dotted paths of packages scanned for modules, plus the entry-point group.
    module_packages: list[str] = Field(default_factory=lambda: ["aim_modules"])
    entry_point_group: str = "ai_modules"

    #: Only these module ids are mounted when set; empty means "all discovered".
    enabled_modules: list[str] = Field(default_factory=list)

    #: Demo chat module.
    llm_provider: str = "mock"  # mock | anthropic
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-5"


@lru_cache
def get_settings() -> Settings:
    return Settings()
