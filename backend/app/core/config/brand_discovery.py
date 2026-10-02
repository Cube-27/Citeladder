"""Discovery schema queue defaults; acquisition/runtime policy is native."""

from typing import Final

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources

DISCOVERY_STATUS_QUEUED: Final = "queued"
TASK_KIND_BRAND_DISCOVERY: Final = "brand_discovery"


class BrandDiscoverySettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BRAND_DISCOVERY_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
    )
    maximum_attempts: int = Field(default=5, ge=1)


brand_discovery_settings = BrandDiscoverySettings()
