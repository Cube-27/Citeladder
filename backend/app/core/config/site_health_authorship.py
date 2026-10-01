"""Deterministic visible authorship signal policy.

The patterns are read by both the Python and the TypeScript analyzers. The
publisher is therefore the first capture group (JavaScript has no ``(?P<...>)``)
and name characters list the accented Latin letters that JavaScript's ASCII
``\\w`` omits.
"""

from __future__ import annotations

from typing import Final

# Word characters plus the accented Latin letters (excluding the × and ÷ signs).
_NAME_CHARS = "\\w\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f'’"

BYLINE_PATTERN: Final = (
    r"\b(?:(?i:written|reviewed)\s+(?i:by)|[Bb]y)\s+"
    rf"[A-Z][{_NAME_CHARS}-]+(?:\s+[A-Z][{_NAME_CHARS}-]+){{1,2}}\b"
)
PROFILE_LINK_ATTRIBUTION_PREFIX_PATTERN: Final = (
    r"^(?:(?i:written|reviewed|maintained|published)\s+(?i:by)|[Bb]y)\s+"
)
VISIBLE_AUTHOR_NAME_PATTERN: Final = (
    rf"^[A-Z][{_NAME_CHARS}-]+(?:\s+[A-Z][{_NAME_CHARS}-]+){{0,3}}$"
)
# Group 1 is the publisher.
VISIBLE_PUBLISHER_PATTERN: Final = (
    r"\b(?i:maintained|published)\s+(?i:by)\s+"
    rf"(?:(?i:the)\s+)?([A-Z](?:[{_NAME_CHARS}&-]|\.(?=[{_NAME_CHARS}&-]))*"
    rf"(?:\s+(?:[A-Z](?:[{_NAME_CHARS}&-]|\.(?=[{_NAME_CHARS}&-]))*"
    r"|team|for|of|and|the)){0,4})"
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

# Bare month-first metadata, including Unicode month names and decimal digits.
# A word followed by numbers is otherwise prose, not evidence of a date.
SHORT_DATE_PATTERN: Final = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?"
    r"|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
    r"|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre"
    r"|январ[ья]|феврал[ья]|март(?:а)?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]"
    r"|август(?:а)?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\.?\s+\d{1,2},?\s+\d{4}"
)

VISIBLE_AUTHOR_NODE_TOKENS: Final[frozenset[str]] = frozenset({"author", "byline"})
VISIBLE_AUTHOR_HEADING_EXCLUSIONS: Final[frozenset[str]] = frozenset(
    {"about us", "contact us", "our team", "meet the team"}
)
VISIBLE_DATE_NODE_TOKENS: Final[frozenset[str]] = frozenset(
    {"byline", "date", "datemodified", "datepublished", "published", "updated"}
)
