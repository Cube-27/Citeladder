"""What a URL's own address says about the page, with nothing fetched.

The URL-only slice of ``page_kinds``. Split out because it has a caller
outside Site Health: cited third-party pages are mostly never fetched -- the
inspection budget is small and the publishers are not ours -- so the only
evidence available for most of them is the address.

Nothing here reads a page's content. That is ``page_kinds``' job, and it ranks
above everything in this file.

Only the slug catalog lives here. ``route_page_kind`` stays beside the segment
catalog it also consults, because splitting those two apart would have them
importing each other.
"""

from __future__ import annotations

import re
from typing import Any

from app.core.config import site_health_acquisition as _acquisition
from app.core.config import site_health_taxonomy as _config
from app.core.config.site_health_answer_shapes import PAGE_KIND_SLUG_PATTERNS

_MAX_SIGNAL_DETAIL_CHARS = _acquisition.SITE_HEALTH_MAX_SIGNAL_DETAIL_CHARS

_SLUG_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (page_kind, re.compile(pattern)) for page_kind, pattern in PAGE_KIND_SLUG_PATTERNS
)


def signal(signal: str, page_kind: str, detail: str) -> dict[str, Any]:
    """One bounded matched-signal record, tagged with its evidence tier."""
    return {
        "signal": signal,
        "page_kind": page_kind,
        # ``.get`` with the weakest tier as default: a signal constant added
        # without a tier should contribute the least, not raise KeyError and
        # fail the whole classification of an otherwise analyzable page.
        "tier": _config.PAGE_KIND_SIGNAL_TIERS.get(
            signal, _config.PAGE_KIND_TIER_SEMANTIC
        ),
        "detail": detail[:_MAX_SIGNAL_DETAIL_CHARS],
    }


_SLUG_SEPARATORS = re.compile(r"[/_+.]+")
_SLUG_COLLAPSE = re.compile(r"-{2,}")


def slug_signals(path: str) -> list[dict[str, Any]]:
    """Tier B — a shape named INSIDE the slug rather than by a segment.

    Ranked above the segment catalog because it is the more specific claim.
    ``/blog/revolut-vs-wise`` is filed under a blog and IS a comparison; the
    segment nearest the root only knows where the publisher files it.
    """
    slug = _SLUG_COLLAPSE.sub("-", _SLUG_SEPARATORS.sub("-", path).strip("-"))
    if not slug:
        return []
    for page_kind, pattern in _SLUG_PATTERNS:
        if pattern.search(slug):
            return [
                signal(
                    _config.PAGE_KIND_SIGNAL_PATH_PATTERN, page_kind, pattern.pattern
                )
            ]
    return []
