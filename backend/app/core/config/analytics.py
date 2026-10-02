"""Shared Python model/operator defaults; runtime policy is native."""

from __future__ import annotations

from typing import Final

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AI_REFERRAL_RULE_VERSION: Final = "ai-referral-rules-1"

AI_REFERRAL_ANALYZER_VERSION: Final = "ai-referrals-v1"

AI_REFERRAL_FORMULA_VERSION: Final = "ai-referral-sessions-v1"

REFERRAL_SANITIZE_VERSION: Final = "referral-sanitize-1"

AI_SOURCE_OTHER: Final = "other"

ANALYTICS_TASK_KIND_INGEST_REFERRALS: Final = "ingest_referrals"

ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH: Final = "opportunity_refresh"


class AnalyticsSettings(BaseSettings):
    """Shared model/operator attempt default."""

    model_config = SettingsConfigDict(env_prefix="ANALYTICS_", extra="ignore")
    task_max_attempts: int = Field(default=3, gt=0)


analytics_settings = AnalyticsSettings()
