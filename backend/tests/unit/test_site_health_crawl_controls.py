"""Pure request-control tests for value-aware Site Health crawl planning."""

from __future__ import annotations

from types import SimpleNamespace
from typing import ClassVar

import pytest
from pydantic import ValidationError

from app.core.config.entitlements import FREE_MONITORED_URLS
from app.core.config.site_health_contracts import RULE_CATALOG_VERSION
from app.core.config.site_health_crawl_policy import (
    FULL_DISCOVERY_HEADROOM,
    MIN_FULL_DISCOVERY_URL_CAP,
)
from app.core.config.site_health_runtime import (
    SiteHealthSettings,
    runtime_policy_for_allowance,
    site_health_settings,
)
from app.domain.site_health import discovery, frontier
from app.domain.site_health.planner import (
    CrawlPlanError,
    _allowance_discovery_budget,
)
from app.domain.site_health.planner_controls import resolve_controls
from app.domain.site_health.planner_policy import frozen_configuration
from app.domain.site_health.planner_preview import preview_rows
from app.domain.site_health.schemas import FrontierCandidate


def _controls_for_request(**kwargs):
    return resolve_controls(
        **kwargs, error=lambda message, code: CrawlPlanError(message, code=code)
    )


def test_production_controls_keep_the_automatic_page_limit(monkeypatch):
    monkeypatch.setattr(
        "app.domain.site_health.planner.site_health_settings.advanced_controls_enabled",
        False,
    )
    mode, limit, seeds, page_kinds = _controls_for_request(
        input_mode=None,
        requested_page_limit=None,
        seed_urls=None,
        page_kinds=None,
    )
    assert mode == "auto"
    assert limit == site_health_settings.automatic_page_limit
    assert seeds == []
    assert page_kinds == []


def test_production_page_limit_accepts_the_maximum_and_rejects_one_past_it(
    monkeypatch,
):
    monkeypatch.setattr(
        "app.domain.site_health.planner.site_health_settings.advanced_controls_enabled",
        False,
    )
    maximum = site_health_settings.max_requested_page_limit

    assert (
        _controls_for_request(
            input_mode=None,
            requested_page_limit=maximum,
            seed_urls=None,
            page_kinds=None,
        )[1]
        == maximum
    )
    with pytest.raises(CrawlPlanError, match="outside the allowed range"):
        _controls_for_request(
            input_mode=None,
            requested_page_limit=maximum + 1,
            seed_urls=None,
            page_kinds=None,
        )
    with pytest.raises(CrawlPlanError, match="outside the allowed range"):
        _controls_for_request(
            input_mode=None,
            requested_page_limit=0,
            seed_urls=None,
            page_kinds=None,
        )


def test_development_page_limit_uses_technical_ceiling(monkeypatch):
    monkeypatch.setattr(
        "app.domain.site_health.planner.site_health_settings.advanced_controls_enabled",
        True,
    )

    assert (
        _controls_for_request(
            input_mode=None,
            requested_page_limit=500,
            seed_urls=None,
            page_kinds=None,
        )[1]
        == 500
    )
    with pytest.raises(CrawlPlanError, match="outside the allowed range"):
        _controls_for_request(
            input_mode=None,
            requested_page_limit=501,
            seed_urls=None,
            page_kinds=None,
        )


def test_default_host_policy_allows_six_starts_per_second():
    assert site_health_settings.per_host_concurrency >= 6
    assert site_health_settings.per_host_delay_seconds <= 1 / 6


@pytest.mark.parametrize("cooldown", [0, -1])
def test_rate_limit_fallback_cooldown_must_be_positive(cooldown: float) -> None:
    with pytest.raises(ValidationError, match="rate_limit_cooldown_seconds"):
        SiteHealthSettings(rate_limit_cooldown_seconds=cooldown)


def test_automatic_page_limit_must_fit_public_maximum():
    with pytest.raises(
        ValidationError,
        match="automatic_page_limit must not exceed max_requested_page_limit",
    ):
        SiteHealthSettings(
            automatic_page_limit=51,
            max_requested_page_limit=50,
        )


def test_production_rejects_development_only_exact_mode(monkeypatch):
    monkeypatch.setattr(
        "app.domain.site_health.planner.site_health_settings.advanced_controls_enabled",
        False,
    )
    with pytest.raises(CrawlPlanError, match="advanced crawl controls"):
        _controls_for_request(
            input_mode="exact_urls",
            requested_page_limit=None,
            seed_urls=["https://example.com/products/widget"],
            page_kinds=None,
        )


def test_development_allows_exact_mode_with_frozen_requested_limit(monkeypatch):
    monkeypatch.setattr(
        "app.domain.site_health.planner.site_health_settings.advanced_controls_enabled",
        True,
    )
    mode, limit, seeds, page_kinds = _controls_for_request(
        input_mode="exact_urls",
        requested_page_limit=3,
        seed_urls=["https://example.com/products/widget"],
        page_kinds=["product"],
    )
    assert (mode, limit, seeds, page_kinds) == (
        "exact_urls",
        3,
        ["https://example.com/products/widget"],
        ["product"],
    )


def test_preview_parses_csv_text_and_json_without_creating_a_crawl():
    raw = "https://example.com/a\nhttps://example.com/b"

    def preview(content: str, format: str) -> list[str]:
        return preview_rows(
            content,
            format,
            max_bytes=site_health_settings.max_preview_input_bytes,
            error=CrawlPlanError,
        )

    assert preview(raw, "text") == [
        "https://example.com/a",
        "https://example.com/b",
    ]
    assert preview(raw, "csv") == [
        "https://example.com/a",
        "https://example.com/b",
    ]
    assert preview('{"urls":["https://example.com/a"]}', "json") == [
        "https://example.com/a"
    ]


@pytest.mark.parametrize(
    "content",
    [
        ["https://example.com/one", "https://example.com/two"],
        {"urls": ["https://example.com/one", "https://example.com/two"]},
    ],
)
def test_preview_rejects_oversized_structured_input_before_building_rows(content):
    with pytest.raises(CrawlPlanError, match="preview input is too large"):
        preview_rows(content, "json", max_bytes=20, error=CrawlPlanError)


def test_frozen_configuration_stamps_supplemental_page_profile_rule_version():
    class Runtime:
        discovery_mode = "sample"
        count_disclosure = False
        sample_url_limit = 10
        monitored_url_limit = 0
        discovery_url_cap = 10
        resolved_registry_revision = "registry-v1"
        resolved_entitlement_lifecycle_version = 1

    configuration = frozen_configuration(
        root_registrable_domain="example.com",
        include_globs=[],
        exclude_globs=[],
        runtime=Runtime(),
    )

    assert configuration["page_profile_rule_version"] == RULE_CATALOG_VERSION


async def test_hard_excluded_candidate_never_reaches_enqueue_or_fetch(monkeypatch):
    class Crawl:
        configuration: ClassVar[dict[str, object]] = {
            "root_registrable_domain": "example.com",
            "include_globs": [],
            "exclude_globs": [],
            "requested_page_limit": 10,
        }
        sample_mode = False
        admitted_url_count = 0

    async def fail_if_admitted(*_args, **_kwargs):
        raise AssertionError("hard-excluded URL reached admission/enqueue")

    pending_frontier_checked = False

    async def no_automatic_selection(*_args, **_kwargs):
        return None

    async def empty_pending_frontier(*_args, **_kwargs):
        nonlocal pending_frontier_checked
        pending_frontier_checked = True
        return []

    monkeypatch.setattr(frontier, "_upsert_site_url", fail_if_admitted)
    monkeypatch.setattr(frontier, "_automatic_remaining", no_automatic_selection)
    monkeypatch.setattr(frontier, "_pending_frontier", empty_pending_frontier)
    result = await discovery.admit_candidates(
        None,
        crawl=Crawl(),
        candidates=[
            FrontierCandidate(
                url="https://example.com/checkout",
                url_hash="blocked",
                depth=1,
                source_kind="link",
            )
        ],
    )
    assert result.admitted == 0
    assert pending_frontier_checked is True


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


@pytest.mark.parametrize(
    ("page_limit", "cap", "expected"),
    [(500, 100, 100), (50, 100, 50), (500, None, 500)],
)
def test_allowance_budget_only_ever_narrows(page_limit, cap, expected):
    """A runtime with no projected cap leaves the validated limit untouched."""
    runtime = SimpleNamespace(discovery_url_cap=cap)
    assert _allowance_discovery_budget(page_limit, runtime=runtime) == expected
