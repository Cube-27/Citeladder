"""Brand-discovery workflow, crawler, and Firecrawl fallback configuration."""

from __future__ import annotations

from typing import Final

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

DISCOVERY_STATUS_QUEUED: Final = "queued"
DISCOVERY_STATUS_RUNNING: Final = "running"
DISCOVERY_STATUS_NEEDS_INPUT: Final = "needs_input"
DISCOVERY_STATUS_READY: Final = "ready"
DISCOVERY_STATUS_CONFIRMED: Final = "confirmed"
DISCOVERY_STATUS_PROJECT_CREATED: Final = "project_created"
DISCOVERY_STATUSES: Final = frozenset(
    {
        DISCOVERY_STATUS_QUEUED,
        DISCOVERY_STATUS_RUNNING,
        DISCOVERY_STATUS_NEEDS_INPUT,
        DISCOVERY_STATUS_READY,
        DISCOVERY_STATUS_CONFIRMED,
        DISCOVERY_STATUS_PROJECT_CREATED,
    }
)

BUSINESS_TYPES: Final = ("b2b", "b2c", "both")
PRICE_TIERS: Final = ("budget", "mid_market", "premium", "luxury", "unknown")
CAPTURE_METHOD_CRAWLER: Final = "secure_crawler"
CAPTURE_METHOD_FIRECRAWL: Final = "firecrawl_rendered"
CAPTURE_METHOD_FIRECRAWL_SEARCH: Final = "firecrawl_search"
CAPTURE_METHOD_USER: Final = "user_input"
BRAND_DISCOVERY_VERSION: Final = "brand-discovery-v1"


class BrandDiscoverySettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BRAND_DISCOVERY_", extra="ignore")

    lease_seconds: int = 120
    poll_seconds: float = 1.0
    minimum_evidence_words: int = 80
    firecrawl_api_url: str = "https://api.firecrawl.dev/v2"
    firecrawl_api_key: SecretStr | None = None
    firecrawl_timeout_seconds: float = 45.0
    firecrawl_search_limit: int = 8
    maximum_competitors: int = 8


brand_discovery_settings = BrandDiscoverySettings()
