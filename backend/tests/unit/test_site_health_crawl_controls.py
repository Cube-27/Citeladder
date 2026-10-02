"""Validation of the Python-owned crawl configuration exported to TypeScript."""

import pytest
from pydantic import ValidationError

from app.core.config.entitlements import FREE_MONITORED_URLS
from app.core.config.site_health_crawl_policy import (
    FULL_DISCOVERY_HEADROOM,
    MIN_FULL_DISCOVERY_URL_CAP,
)
from app.core.config.site_health_runtime import (
    SiteHealthSettings,
    runtime_policy_for_allowance,
    site_health_settings,
)


@pytest.mark.parametrize(
    "limits",
    [
        {"sample_url_limit": -1},
        {"sample_discovery_url_cap": -1},
        {"sample_url_limit": 11, "sample_discovery_url_cap": 10},
    ],
)
def test_sample_limits_remain_nonnegative_and_discovery_covers_analysis(limits):
    with pytest.raises(ValidationError):
        SiteHealthSettings(**limits)


def test_automatic_page_limit_must_fit_public_maximum():
    with pytest.raises(
        ValidationError,
        match="automatic_page_limit must not exceed max_requested_page_limit",
    ):
        SiteHealthSettings(
            automatic_page_limit=51,
            max_requested_page_limit=50,
        )


def test_full_discovery_cap_scales_with_the_monitored_allowance():
    """An allowance governs how far discovery maps the site, not just analysis.

    Full mode used to project no cap at all, so every entitled workspace
    discovered the flat operational limit regardless of how few URLs it could
    monitor — the crawl kept fetching long after the screen had settled.
    """
    settings = site_health_settings
    free = runtime_policy_for_allowance(FREE_MONITORED_URLS)
    assert free.discovery_mode == "full"
    assert free.discovery_url_cap == max(
        MIN_FULL_DISCOVERY_URL_CAP, FREE_MONITORED_URLS * FULL_DISCOVERY_HEADROOM
    )
    assert free.discovery_url_cap < settings.automatic_page_limit


def test_full_discovery_cap_never_exceeds_the_operational_limit():
    """No allowance widens the crawler past its configured ceiling."""
    policy = runtime_policy_for_allowance(10_000)
    assert policy.discovery_url_cap == site_health_settings.automatic_page_limit


def test_small_allowance_still_maps_past_the_navigation_shell():
    """The floor is what keeps a tiny budget from stopping at category hubs."""
    policy = runtime_policy_for_allowance(1)
    assert policy.discovery_url_cap == MIN_FULL_DISCOVERY_URL_CAP
