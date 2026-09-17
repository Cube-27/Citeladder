"""What KIND of page this is, judged from the page itself.

Kept strictly separate from the publisher taxonomy in
``core/config/source_patterns``. That answers "what sort of outlet is this";
this answers "what sort of page is this one". A publisher runs comparisons,
news, profiles and forums under one domain, so promoting either answer into
the other is wrong in both directions -- and the tempting direction, letting a
single inspected page reclassify its whole domain, is the one that silently
mislabels every other page on it.

``unresolved`` is a real outcome. A page whose kind is not evident should reach
a human as a research candidate, not be assigned a plausible guess.
"""

from __future__ import annotations

import re

from app.analysis.source_pages.contracts import ExtractedPage
from app.core.config.source_pages import (
    PAGE_FORMAT_ARTICLE,
    PAGE_FORMAT_COMPARISON,
    PAGE_FORMAT_DIRECTORY,
    PAGE_FORMAT_DISCUSSION,
    PAGE_FORMAT_LISTICLE,
    PAGE_FORMAT_METHOD_HEADING_EVIDENCE,
    PAGE_FORMAT_METHOD_NONE,
    PAGE_FORMAT_METHOD_STRUCTURED_DATA,
    PAGE_FORMAT_REFERENCE,
    PAGE_FORMAT_REVIEW,
    PAGE_FORMAT_UNRESOLVED,
    PAGE_FORMAT_VIDEO,
)

# schema.org types the publisher declared about its own page. Strongest
# available evidence: it is the publisher's own statement, not our inference.
_SCHEMA_FORMATS: tuple[tuple[str, str], ...] = (
    ("discussionforumposting", PAGE_FORMAT_DISCUSSION),
    ("qapage", PAGE_FORMAT_DISCUSSION),
    ("videoobject", PAGE_FORMAT_VIDEO),
    ("review", PAGE_FORMAT_REVIEW),
    ("localbusiness", PAGE_FORMAT_DIRECTORY),
    ("organization", PAGE_FORMAT_DIRECTORY),
    ("itemlist", PAGE_FORMAT_LISTICLE),
    ("faqpage", PAGE_FORMAT_REFERENCE),
    ("newsarticle", PAGE_FORMAT_ARTICLE),
    ("blogposting", PAGE_FORMAT_ARTICLE),
    ("article", PAGE_FORMAT_ARTICLE),
)

# Title and heading shapes, in precedence order. Matched on word boundaries so
# "vs" does not fire inside "versatile" and "top" not inside "topic".
_HEADING_FORMATS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"\bvs\.?\b|\bversus\b|\bcompared?\s+to\b", re.I),
        PAGE_FORMAT_COMPARISON,
    ),
    (re.compile(r"\balternatives?\b|\bcompetitors?\b", re.I), PAGE_FORMAT_COMPARISON),
    (re.compile(r"\bbest\b|\btop\s+\d+\b|\b\d+\s+best\b", re.I), PAGE_FORMAT_LISTICLE),
    (re.compile(r"\breviews?\b|\bhands[- ]on\b", re.I), PAGE_FORMAT_REVIEW),
    (
        re.compile(r"\bdirectory\b|\bprofile\b|\blistings?\b", re.I),
        PAGE_FORMAT_DIRECTORY,
    ),
    (re.compile(r"\bforum\b|\bthread\b|\bdiscussion\b", re.I), PAGE_FORMAT_DISCUSSION),
)


def _from_schema(page: ExtractedPage) -> str:
    declared = {str(value).strip().lower() for value in page.structured_types}
    for token, page_format in _SCHEMA_FORMATS:
        if token in declared:
            return page_format
    return PAGE_FORMAT_UNRESOLVED


def _from_headings(page: ExtractedPage) -> str:
    haystack = " ".join((page.title, *page.headings)).strip()
    if not haystack:
        return PAGE_FORMAT_UNRESOLVED
    for pattern, page_format in _HEADING_FORMATS:
        if pattern.search(haystack):
            return page_format
    return PAGE_FORMAT_UNRESOLVED


def derive_page_format(page: ExtractedPage) -> tuple[str, str]:
    """Return ``(page_format, method)`` for one inspected page.

    Structured data wins over heading shape: a publisher declaring
    ``DiscussionForumPosting`` outranks a thread title that happens to read
    like a listicle.
    """
    if not page.parsed:
        return PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE
    schema_format = _from_schema(page)
    if schema_format != PAGE_FORMAT_UNRESOLVED:
        return schema_format, PAGE_FORMAT_METHOD_STRUCTURED_DATA
    heading_format = _from_headings(page)
    if heading_format != PAGE_FORMAT_UNRESOLVED:
        return heading_format, PAGE_FORMAT_METHOD_HEADING_EVIDENCE
    return PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE
