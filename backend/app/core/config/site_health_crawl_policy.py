"""Shared Site Health model defaults and supported operator policy."""

from __future__ import annotations

from typing import Final, Protocol

DISCOVERY_MODE_SAMPLE: Final = "sample"

DISCOVERY_MODE_FULL: Final = "full"

SAMPLE_URL_LIMIT: Final = 10

SAMPLE_DISCOVERY_URL_CAP: Final = 200

FULL_DISCOVERY_HEADROOM: Final = 5

MIN_FULL_DISCOVERY_URL_CAP: Final = 100

CORPUS_DISPOSITION_ANALYZE: Final = "analyze"

ITEM_KIND_HTML_PAGE: Final = "html_page"

FRONTIER_PENDING: Final = "pending"

SELECTION_SOURCE_USER: Final = "user"

SELECTION_SOURCE_FREE_SAMPLE: Final = "free_sample"

SELECTION_SOURCE_BOOTSTRAP: Final = "bootstrap"


class _RuntimeSettings(Protocol):
    automatic_page_limit: int
    sample_discovery_url_cap: int
    sample_url_limit: int


class SiteHealthRuntimePolicy:
    """Neutral, immutable projection of a resolved monitored-URL allowance."""

    __slots__ = (
        "allows_user_selection",
        "count_disclosure",
        "discovery_mode",
        "discovery_url_cap",
        "monitored_url_limit",
        "sample_url_limit",
    )

    def __init__(
        self,
        *,
        discovery_mode: str,
        discovery_url_cap: int | None,
        sample_url_limit: int,
        monitored_url_limit: int,
        allows_user_selection: bool,
        count_disclosure: bool,
    ) -> None:
        self.discovery_mode = discovery_mode
        self.discovery_url_cap = discovery_url_cap
        self.sample_url_limit = sample_url_limit
        self.monitored_url_limit = monitored_url_limit
        self.allows_user_selection = allows_user_selection
        self.count_disclosure = count_disclosure


def full_discovery_url_cap(
    monitored_urls_allowance: int, *, settings: _RuntimeSettings
) -> int:
    """How many URLs a full crawl on this allowance may discover.

    Bounded above by the operational ``automatic_page_limit`` so no allowance
    can widen the crawler past its configured ceiling, and below by
    ``MIN_FULL_DISCOVERY_URL_CAP`` so a small allowance still maps past the
    site's navigation shell.
    """
    return min(
        int(settings.automatic_page_limit),
        max(
            MIN_FULL_DISCOVERY_URL_CAP,
            int(monitored_urls_allowance) * FULL_DISCOVERY_HEADROOM,
        ),
    )


def runtime_policy_for_allowance(
    monitored_urls_allowance: int, *, settings: _RuntimeSettings
) -> SiteHealthRuntimePolicy:
    """Fail closed to a bounded sample policy for a non-positive allowance."""
    if monitored_urls_allowance > 0:
        return SiteHealthRuntimePolicy(
            discovery_mode=DISCOVERY_MODE_FULL,
            discovery_url_cap=full_discovery_url_cap(
                monitored_urls_allowance, settings=settings
            ),
            sample_url_limit=0,
            monitored_url_limit=monitored_urls_allowance,
            allows_user_selection=True,
            count_disclosure=True,
        )
    return SiteHealthRuntimePolicy(
        discovery_mode=DISCOVERY_MODE_SAMPLE,
        discovery_url_cap=settings.sample_discovery_url_cap,
        sample_url_limit=settings.sample_url_limit,
        monitored_url_limit=0,
        allows_user_selection=False,
        count_disclosure=False,
    )
