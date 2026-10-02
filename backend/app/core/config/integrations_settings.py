"""Shared integration queue-row attempt default."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources


class IntegrationSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="INTEGRATION_", env_file=dotenv_sources(), extra="ignore"
    )
    sync_max_attempts: int = Field(default=4, gt=0)


integration_settings = IntegrationSettings()
