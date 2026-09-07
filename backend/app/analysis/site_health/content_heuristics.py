"""Content-derived page-kind signals.

This leaf owns only the bounded FAQ/product/article heuristic.  URL and
structured-data signals remain in the classifier coordinator, so precedence is
still resolved in one place.
"""

from __future__ import annotations

import re
from typing import Any

from app.analysis.site_health.fact_questions import observed_question_count
from app.core.config import site_health_authorship as _authorship_config
from app.core.config import site_health_taxonomy as _config

_BYLINE_RE = re.compile(_authorship_config.BYLINE_PATTERN)
_AUTHOR_NAME_RE = re.compile(_authorship_config.VISIBLE_AUTHOR_NAME_PATTERN)
_DATE_RE = re.compile(_authorship_config.DATE_PATTERN, re.IGNORECASE)


def visible_byline(text: str) -> str:
    """The first visible "By <Name>" byline in ``text``, or "".

    Shared with the extractor's author fact so the classifier's notion of a
    byline and the analyzer's notion of one cannot drift apart.
    """
    match = _BYLINE_RE.search(str(text or ""))
    return match.group(0).strip() if match else ""


def visible_author_name(text: str) -> str:
    """A short person/organization name from an explicitly authored node."""
    candidate = " ".join(str(text or "").split())
    return candidate if _AUTHOR_NAME_RE.fullmatch(candidate) else ""


def visible_date(text: str) -> str:
    """The first visible publication-shaped date in ``text``, or ""."""
    match = _DATE_RE.search(str(text or ""))
    return match.group(0).strip() if match else ""


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _faq_signal(facts: dict[str, Any]) -> dict[str, Any] | None:
    relationships = facts.get("question_answer_relationships")
    question_count = observed_question_count(relationships)
    if question_count < _config.PAGE_KIND_FAQ_MIN_HEADINGS:
        return None
    return {
        "signal": _config.PAGE_KIND_SIGNAL_CONTENT_HEURISTIC,
        "page_kind": _config.PAGE_KIND_FAQ,
        "detail": f"question_answer_relationships:{question_count}",
    }


def _article_signal(facts: dict[str, Any]) -> dict[str, Any] | None:
    authorship = _mapping(facts.get("authorship"))
    if not (authorship.get("visible_byline") and authorship.get("visible_date")):
        return None
    return {
        "signal": _config.PAGE_KIND_SIGNAL_CONTENT_HEURISTIC,
        "page_kind": _config.PAGE_KIND_ARTICLE,
        "detail": "byline_and_date",
    }


def content_heuristic(facts: dict[str, Any]) -> dict[str, Any] | None:
    """Return the first FAQ or article content signal.

    The product heuristic that lived here read the WHOLE body for a price plus
    a cart marker. On a real store that fired on a returns-policy page, because
    its "You May Also Like" carousel carries both. Product evidence now comes
    from ``fact_entity``, scoped to the page's own region and to structures
    outside every repeated card list, so this leaf keeps only the two signals
    that were never region-sensitive: question-answer relationships and a
    byline plus date.
    """
    return _faq_signal(facts) or _article_signal(facts)
