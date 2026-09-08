"""Deterministic visible authorship signal policy."""

from __future__ import annotations

from typing import Final

BYLINE_PATTERN: Final = (
    r"\b(?:(?i:written|reviewed)\s+(?i:by)|[Bb]y)\s+"
    r"[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){1,2}\b"
)
PROFILE_LINK_ATTRIBUTION_PREFIX_PATTERN: Final = (
    r"^(?:(?i:written|reviewed|maintained|published)\s+(?i:by)|[Bb]y)\s+"
)
VISIBLE_AUTHOR_NAME_PATTERN: Final = r"^[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3}$"
VISIBLE_PUBLISHER_PATTERN: Final = (
    r"\b(?i:maintained|published)\s+(?i:by)\s+"
    r"(?:(?i:the)\s+)?(?P<publisher>[A-Z](?:[\w'’&-]|\.(?=[\w'’&-]))*"
    r"(?:\s+(?:[A-Z](?:[\w'’&-]|\.(?=[\w'’&-]))*|team|for|of|and|the)){0,4})"
    r"(?=\s*(?:\s+(?i:from)\b|[.,;]|$))"
)

# ISO, month-first, and day-first publication-shaped dates.
DATE_PATTERN: Final = (
    r"(?:\b\d{4}-\d{2}-\d{2}\b"
    r"|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
    r"[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b"
    r"|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
    r"[a-z]*\.?,?\s+\d{4}\b)"
)
BYLINE_METADATA_SUFFIX_PATTERN: Final = (
    rf"[,;·—-]?\s*(?:(?i:published|updated)\s+)?(?:{DATE_PATTERN})[.]?"
)

VISIBLE_AUTHOR_NODE_TOKENS: Final[frozenset[str]] = frozenset({"author", "byline"})
VISIBLE_AUTHOR_HEADING_EXCLUSIONS: Final[frozenset[str]] = frozenset(
    {"about us", "contact us", "our team", "meet the team"}
)
VISIBLE_DATE_NODE_TOKENS: Final[frozenset[str]] = frozenset(
    {"byline", "date", "datemodified", "datepublished", "published", "updated"}
)
