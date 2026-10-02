"""Shared model/entitlement settings; acquisition and worker policy is native."""

from __future__ import annotations

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources
from app.core.config.site_health_crawl_policy import (
    SAMPLE_DISCOVERY_URL_CAP,
    SAMPLE_URL_LIMIT,
    SiteHealthRuntimePolicy,
)
from app.core.config.site_health_crawl_policy import (
    runtime_policy_for_allowance as _runtime_policy_for_allowance,
)


class SiteHealthSettings(BaseSettings):
    """Bounds still read by Python model defaults and supported operators."""

    model_config = SettingsConfigDict(
        env_prefix="SITE_HEALTH_",
        extra="ignore",
        allow_inf_nan=False,
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
    )
    automatic_page_limit: int = Field(default=500, gt=0)
    max_requested_page_limit: int = Field(default=500, gt=0)
    sample_url_limit: int = Field(default=SAMPLE_URL_LIMIT, ge=0)
    sample_discovery_url_cap: int = Field(default=SAMPLE_DISCOVERY_URL_CAP, ge=0)
    max_attempts: int = 4

    @model_validator(mode="after")
    def _validate_limits(self) -> SiteHealthSettings:
        if self.automatic_page_limit > self.max_requested_page_limit:
            raise ValueError(
                "automatic_page_limit must not exceed max_requested_page_limit"
            )
        if self.sample_discovery_url_cap < self.sample_url_limit:
            raise ValueError(
                "sample_discovery_url_cap must not be less than sample_url_limit"
            )
        return self


site_health_settings = SiteHealthSettings()


def runtime_policy_for_allowance(
    monitored_urls_allowance: int,
) -> SiteHealthRuntimePolicy:
    """Resolve the supported operator projection using shared allowance bounds."""
    return _runtime_policy_for_allowance(
        monitored_urls_allowance, settings=site_health_settings
    )
