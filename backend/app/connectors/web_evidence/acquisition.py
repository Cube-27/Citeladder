"""Pure policy helpers for Site Health's server-owned acquisition ladder.

The fetcher owns URL validation, redirects, bounded streaming, and the actual
network clients. This module owns only deterministic rung selection so no
transport can silently broaden the crawler's security policy.
"""

from __future__ import annotations

import sys

from app.connectors.web_evidence.contracts import FetchResult
from app.core.config.site_health import (
    ACQUISITION_TRIGGER_BLOCK_STATUS,
    ACQUISITION_TRIGGER_CHALLENGE,
    ACQUISITION_TRIGGER_LOW_CONTENT,
)


def curl_cffi_pinned_resolution_supported() -> bool:
    """Whether curl-cffi can meet this process's validated-IP contract.

    The current Windows worker platform cannot reliably bind curl-cffi's DNS
    override, TLS SNI, and peer verification to the IP selected by
    ``resolve_target``. Returning false is intentional and fail-closed: the
    ladder records curl as unavailable and may continue to ScraperAPI; it never
    lets curl-cffi independently resolve a user-supplied hostname.

    A future platform implementation must replace this predicate alongside a
    verified pinned resolver adapter, rather than merely flipping a setting.
    """

    return not sys.platform.startswith("win") and False


def curl_trigger_for_result(
    result: FetchResult,
    *,
    has_challenge_marker: bool,
    trigger_statuses: tuple[int, ...],
    low_content_bytes: int,
) -> str | None:
    """Return the sole configured reason that permits a curl rung.

    Priority is deterministic and evidence-based. A regular timeout, policy
    rejection, redirect issue, or oversized response does not get retried by a
    different transport.
    """

    if has_challenge_marker:
        return ACQUISITION_TRIGGER_CHALLENGE
    if result.status_code in trigger_statuses:
        return ACQUISITION_TRIGGER_BLOCK_STATUS
    if low_content_bytes and 200 <= result.status_code < 300:
        if result.decoded_bytes < low_content_bytes:
            return ACQUISITION_TRIGGER_LOW_CONTENT
    return None
