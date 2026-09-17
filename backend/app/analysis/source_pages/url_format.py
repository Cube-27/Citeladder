"""What KIND of page a cited URL is, judged from its address.

The sibling of ``page_format``, and deliberately weaker than it. That module
reads a page that was actually fetched and answers from its own content; this
one reads only the address, because fetching third-party pages is budgeted and
most cited pages will never be fetched. Without it the URL table would report
``unresolved`` for nearly every row and its type ring would be one segment
labelled "Other" -- technically honest, and useless.

**No classification happens here.** Site Health owns the page-kind catalog --
the slug shapes, the route segments, locale prefixes, index documents, the
nearest-to-root tie-break -- and `listicle`, `how_to`, `comparison` and
`alternative` live in that same catalog precisely so an owned page and a cited
third-party page are read the same way. This module is the translation between
that shared vocabulary and the one the Sources tables speak, plus the two
shapes that genuinely only a third-party source has.

Those two are `discussion` and `profile`: a forum thread and a marketplace
directory entry. An owned site does not publish its competitors' listings, and
Site Health has no reason to name either kind.

Every verdict is stamped ``url_pattern`` so the weaker evidence stays visible
downstream. A fetch that later reads the page replaces it; a URL shape never
replaces something read off the page itself.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from app.analysis.site_health.page_kinds import route_page_kind
from app.core.config.site_health_taxonomy import (
    PAGE_KIND_ABOUT_CONTACT,
    PAGE_KIND_ALTERNATIVE,
    PAGE_KIND_ARTICLE,
    PAGE_KIND_CASE_STUDY_REVIEW,
    PAGE_KIND_CATEGORY,
    PAGE_KIND_COMPARISON,
    PAGE_KIND_DOCS,
    PAGE_KIND_FAQ,
    PAGE_KIND_GUIDE,
    PAGE_KIND_HOMEPAGE,
    PAGE_KIND_HOW_TO,
    PAGE_KIND_LISTICLE,
    PAGE_KIND_LOCAL,
    PAGE_KIND_PRICING,
    PAGE_KIND_PRODUCT,
    PAGE_KIND_SERVICE,
)
from app.core.config.source_pages import (
    PAGE_FORMAT_ALTERNATIVE,
    PAGE_FORMAT_ARTICLE,
    PAGE_FORMAT_CATEGORY,
    PAGE_FORMAT_COMPARISON,
    PAGE_FORMAT_DISCUSSION,
    PAGE_FORMAT_HOMEPAGE,
    PAGE_FORMAT_HOW_TO,
    PAGE_FORMAT_LISTICLE,
    PAGE_FORMAT_METHOD_NONE,
    PAGE_FORMAT_METHOD_URL_PATTERN,
    PAGE_FORMAT_PRODUCT,
    PAGE_FORMAT_PROFILE,
    PAGE_FORMAT_REFERENCE,
    PAGE_FORMAT_REVIEW,
    PAGE_FORMAT_UNRESOLVED,
)

# Site Health's vocabulary, in the Sources tables' words.
#
# Several kinds collapse on purpose. A reader scanning cited sources asks "what
# kind of page did the engine quote", and `pricing` and `service` are both a
# vendor describing its own offer; `docs` and `faq` are both a reference a
# model lifts an answer from. A kind with no useful reading here is absent, and
# an absent kind falls through to ``unresolved`` rather than being forced into
# a neighbour.
_KIND_TO_FORMAT: dict[str, str] = {
    PAGE_KIND_HOMEPAGE: PAGE_FORMAT_HOMEPAGE,
    PAGE_KIND_COMPARISON: PAGE_FORMAT_COMPARISON,
    PAGE_KIND_ALTERNATIVE: PAGE_FORMAT_ALTERNATIVE,
    PAGE_KIND_LISTICLE: PAGE_FORMAT_LISTICLE,
    PAGE_KIND_HOW_TO: PAGE_FORMAT_HOW_TO,
    PAGE_KIND_GUIDE: PAGE_FORMAT_HOW_TO,
    PAGE_KIND_ARTICLE: PAGE_FORMAT_ARTICLE,
    PAGE_KIND_CASE_STUDY_REVIEW: PAGE_FORMAT_REVIEW,
    PAGE_KIND_CATEGORY: PAGE_FORMAT_CATEGORY,
    PAGE_KIND_PRODUCT: PAGE_FORMAT_PRODUCT,
    PAGE_KIND_PRICING: PAGE_FORMAT_PRODUCT,
    PAGE_KIND_SERVICE: PAGE_FORMAT_PRODUCT,
    PAGE_KIND_DOCS: PAGE_FORMAT_REFERENCE,
    PAGE_KIND_FAQ: PAGE_FORMAT_REFERENCE,
    PAGE_KIND_LOCAL: PAGE_FORMAT_PROFILE,
    PAGE_KIND_ABOUT_CONTACT: PAGE_FORMAT_PROFILE,
}

# The two shapes only a third-party source publishes. Checked BEFORE the shared
# catalog, because a forum thread filed under `/community/questions/...` would
# otherwise resolve to whatever segment sits nearest the root.
_SOURCE_ONLY_FORMATS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Threads and Q&A, including Reddit's `/r/<sub>/comments/...` shape.
    (
        re.compile(
            r"(^|-)(forum|forums|thread|threads|discussion|discussions"
            r"|comments|questions|answers)(-|$)|(^|-)r-[a-z0-9_]+(-|$)"
        ),
        PAGE_FORMAT_DISCUSSION,
    ),
    # A directory entry for one company, which is what a marketplace listing is.
    (
        re.compile(
            r"(^|-)(profile|profiles|vendor|vendors|listing|listings"
            r"|directory|supplier|suppliers)(-|$)"
        ),
        PAGE_FORMAT_PROFILE,
    ),
)

# A dated path segment is a publication date, and only articles carry one.
# Applied last, so a dated comparison stays a comparison.
_DATED = re.compile(r"(^|-)\d{4}-\d{2}(-|$)")

_SEPARATORS = re.compile(r"[/_+.]+")
_COLLAPSE = re.compile(r"-{2,}")
_PATH_EXTENSION = re.compile(r"\.(html?|php|aspx?|jsp)$", re.IGNORECASE)


def _slug(url: str) -> str | None:
    """The path as one hyphen-separated token run, or ``None`` when unusable.

    A query string is dropped on purpose. ``?page=2`` and ``?utm_source=x`` say
    nothing about what kind of page this is, and letting them match would make
    one page classify differently depending on where it was linked from.
    """
    try:
        path = urlsplit(url).path
    except ValueError:
        return None
    lowered = _SEPARATORS.sub("-", path.lower()).strip("-")
    return _COLLAPSE.sub("-", lowered)


def _without_extension(url: str) -> str:
    """The same URL with a trailing document extension removed from its path.

    ``/pricing.html`` and ``/pricing`` are the same route, and the shared
    catalog matches path SEGMENTS -- none of its patterns match a segment
    carrying a document suffix.
    """
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    return parts._replace(path=_PATH_EXTENSION.sub("", parts.path)).geturl()


def derive_url_format(url: str) -> tuple[str, str]:
    """Return ``(page_format, method)`` for one cited URL, without fetching it."""
    slug = _slug(url)
    if slug is None:
        return PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE
    for pattern, page_format in _SOURCE_ONLY_FORMATS:
        if pattern.search(slug):
            return page_format, PAGE_FORMAT_METHOD_URL_PATTERN
    shared = _KIND_TO_FORMAT.get(route_page_kind(_without_extension(url)) or "")
    if shared:
        return shared, PAGE_FORMAT_METHOD_URL_PATTERN
    if _DATED.search(slug):
        return PAGE_FORMAT_ARTICLE, PAGE_FORMAT_METHOD_URL_PATTERN
    return PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE
