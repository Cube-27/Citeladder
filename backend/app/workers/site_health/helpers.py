"""Pure helpers shared by the worker loop and explicit phase modules.

Module-level and side-effect free: HTTP-status classification, robots denial
tokens, and the Free-tier count-disclosure rule. They live outside
``site_health_worker`` because the phase modules use them and the worker
imports the phases — the other direction
would be a cycle.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.connectors.web_evidence.contracts import FetchResult
from app.connectors.web_evidence.fetcher_body import is_bot_block_result
from app.connectors.web_evidence.robots import RobotsPolicy
from app.core.config.site_health_acquisition import (
    ERROR_ACCESS_BLOCKED,
    ERROR_HTTP_4XX,
    ERROR_HTTP_5XX,
    ERROR_ROBOTS_DENIED,
    ERROR_ROBOTS_UNAVAILABLE,
)
from app.models.site_health.crawl import SiteCrawl


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _classify_http_error(status: int) -> tuple[str, bool] | None:
    """Map an HTTP status the fetcher returned (not raised) to (code, retry).

    Returns ``None`` for a non-error status. A 4xx is terminal except 429
    (rate limit, retryable); every 5xx is retryable. Shared by the discover
    and analyze fetch paths so the classification stays in one place.
    """
    if 400 <= status < 500:
        return ERROR_HTTP_4XX, status == 429
    if status >= 500:
        return ERROR_HTTP_5XX, True
    return None


def _is_bot_block(result: FetchResult) -> bool:
    """Whether this fetch came back as a bot-protection challenge (T8).

    Thin pass-through to the fetcher's marker-based signature so the phases
    depend on one predicate. A match is terminal: the crawler makes a plain,
    honestly-identified request, so a site that answers with a challenge is
    reported as ``blocked`` rather than retried.
    """
    return is_bot_block_result(result)


def _count_disclosure(crawl: SiteCrawl) -> bool:
    """Whether this crawl opted into exact-count disclosure in its config."""
    return bool((crawl.configuration or {}).get("count_disclosure", False))


def _serialize_redirect_chain(result: FetchResult) -> list[dict]:
    """Serialize a fetch result's redirect hops to plain JSON-safe dicts."""
    return [
        {
            "from_url": hop.from_url,
            "to_url": hop.to_url,
            "status_code": hop.status_code,
        }
        for hop in result.redirect_chain
    ]


def _robots_denial_error(policy: RobotsPolicy) -> tuple[str, str]:
    """The (error_code, detail) for a robots-denied fetch.

    An unreachable robots.txt (network error, 429, 5xx or redirect failure)
    or an unsupported crawl-delay surfaces as ``robots_unavailable`` — distinct
    from a real robots-rule disallow so the UI can explain the pause rather
    than claim the site blocks crawlers. A 401/403 robots.txt is a standing
    access restriction, ``access_blocked``: re-crawling cannot fix it.
    """
    if policy.unavailable:
        return (
            ERROR_ROBOTS_UNAVAILABLE,
            "robots.txt could not be retrieved; fetches paused for this site",
        )
    if policy.restricted:
        return (
            ERROR_ACCESS_BLOCKED,
            "robots.txt is access-blocked (401/403); the crawler does not "
            "bypass access controls",
        )
    if policy.delay_exceeds_limit:
        return (
            ERROR_ROBOTS_UNAVAILABLE,
            "robots.txt crawl-delay exceeds the supported maximum; "
            "fetches paused for this site",
        )
    return (
        ERROR_ROBOTS_DENIED,
        "robots.txt disallows the crawler user-agent for this URL",
    )
