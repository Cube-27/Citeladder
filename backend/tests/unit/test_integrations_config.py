"""Behavioral contracts for integration policy retained by the TS owners."""

from __future__ import annotations

from urllib.parse import urlsplit

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.config.integrations_contracts import (
    INTEGRATION_GRANT_STATUSES,
    INTEGRATION_SYNC_KINDS,
)
from app.core.config.integrations_datasets import (
    DATASET_GA4_LANDING_DAILY,
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_PAGE_DAILY,
    INTEGRATION_DATASET_TEMPLATES,
    pack_dimension_key,
)
from app.core.config.integrations_settings import IntegrationSettings
from app.core.config.integrations_transport import (
    BING_API_BASE_URL,
    GA4_API_BASE_URL,
    GSC_API_BASE_URL,
    INTEGRATION_APPROVED_ENDPOINT_HOSTS,
    INTEGRATION_OAUTH_AUTHORIZE_URLS,
    INTEGRATION_OAUTH_REVOKE_URLS,
    INTEGRATION_OAUTH_SCOPES,
    INTEGRATION_OAUTH_TOKEN_URLS,
    INTEGRATION_PROVIDER_BING,
    INTEGRATION_PROVIDER_GA4,
    INTEGRATION_PROVIDER_GSC,
    INTEGRATION_PROVIDER_TRANSPORT,
    INTEGRATION_PROVIDERS,
    INTEGRATION_TRANSPORT_GOOGLE,
    INTEGRATION_TRANSPORT_MICROSOFT,
)


def test_provider_grants_and_urls_stay_transport_scoped() -> None:
    assert INTEGRATION_PROVIDERS == {"gsc", "ga4", "bing"}
    assert INTEGRATION_PROVIDER_TRANSPORT == {
        INTEGRATION_PROVIDER_GSC: INTEGRATION_TRANSPORT_GOOGLE,
        INTEGRATION_PROVIDER_GA4: INTEGRATION_TRANSPORT_GOOGLE,
        INTEGRATION_PROVIDER_BING: INTEGRATION_TRANSPORT_MICROSOFT,
    }
    assert INTEGRATION_GRANT_STATUSES >= {
        "connected",
        "needs_reauth",
        "pending_revocation",
    }
    assert INTEGRATION_SYNC_KINDS == {"scheduled", "on_demand", "backfill"}
    for url in (
        *INTEGRATION_OAUTH_AUTHORIZE_URLS.values(),
        *INTEGRATION_OAUTH_TOKEN_URLS.values(),
    ):
        parsed = urlsplit(url)
        assert parsed.scheme == "https"
        assert parsed.hostname in INTEGRATION_APPROVED_ENDPOINT_HOSTS
    for url in (GSC_API_BASE_URL, GA4_API_BASE_URL, BING_API_BASE_URL):
        assert urlsplit(url).hostname in INTEGRATION_APPROVED_ENDPOINT_HOSTS
    assert (
        "https://www.googleapis.com/auth/webmasters.readonly"
        in INTEGRATION_OAUTH_SCOPES[INTEGRATION_TRANSPORT_GOOGLE]
    )
    assert INTEGRATION_OAUTH_SCOPES[INTEGRATION_TRANSPORT_MICROSOFT] == (
        "webmaster.read",
    )
    assert INTEGRATION_OAUTH_REVOKE_URLS[INTEGRATION_TRANSPORT_MICROSOFT] == ""


def test_dataset_grains_and_dimension_packing_remain_compatible() -> None:
    assert INTEGRATION_DATASET_TEMPLATES[DATASET_GSC_DAY_DAILY].dimensions == ("date",)
    assert INTEGRATION_DATASET_TEMPLATES[DATASET_GSC_PAGE_DAILY].dimensions == (
        "page",
        "date",
    )
    landing = INTEGRATION_DATASET_TEMPLATES[DATASET_GA4_LANDING_DAILY]
    assert landing.dimensions == (
        "landingPage",
        "sessionSource",
        "sessionMedium",
        "date",
    )
    row = dict(
        zip(landing.dimensions, ("/lp", "google", "organic", "20260723"), strict=True)
    )
    assert (
        pack_dimension_key([row[name] for name in landing.dimensions])
        == "/lp | google | organic | 20260723"
    )
    source_medium = INTEGRATION_DATASET_TEMPLATES[DATASET_GA4_SOURCE_MEDIUM_DAILY]
    assert source_medium.dimensions == ("sessionSource", "sessionMedium", "date")


def test_worker_settings_reject_invalid_bounds_and_credentials_stay_env_injected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTEGRATION_DISPATCHER_INTERVAL_SECONDS", "15")
    configured = IntegrationSettings(_env_file=None)
    assert configured.dispatcher_interval_seconds == 15
    assert configured.sync_max_pages > 0
    assert configured.lease_ttl_seconds > configured.heartbeat_interval_seconds
    monkeypatch.setenv(
        "INTEGRATION_HEARTBEAT_INTERVAL_SECONDS", str(configured.lease_ttl_seconds)
    )
    with pytest.raises(ValidationError):
        IntegrationSettings(_env_file=None)

    for variable in (
        "INTEGRATION_GOOGLE_CLIENT_ID",
        "INTEGRATION_GOOGLE_CLIENT_SECRET",
        "INTEGRATION_MICROSOFT_CLIENT_ID",
        "INTEGRATION_MICROSOFT_CLIENT_SECRET",
    ):
        monkeypatch.delenv(variable, raising=False)
    fresh = Settings(_env_file=None)
    assert fresh.integration_google_client_id == ""
    assert fresh.integration_google_client_secret == ""
