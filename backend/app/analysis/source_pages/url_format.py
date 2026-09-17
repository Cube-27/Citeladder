"""What KIND of page a URL alone says this is.

The sibling of ``page_format``, and deliberately weaker than it. That module
reads an inspected page and answers from its own content; this one reads only
the address, because inspection is budgeted and most cited pages will not have
been read yet. Without it the URL table would report ``unresolved`` for nearly
every row and its source-type ring would be one segment labelled "other" --
technically honest, and useless.

Every verdict here is stamped ``url_pattern`` so the weaker evidence stays
visible downstream. An inspection that later reads the page replaces it; a
URL shape never replaces something read off the page itself.

Patterns are ordered by specificity, not alphabetically: ``/blog/how-to-x`` is
a how-to guide before it is an article, and ``/vs/`` beats ``/compare`` only
because a head-to-head page is the narrower claim.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

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
    PAGE_FORMAT_UNRESOLVED,
)

# Matched against the path with separators normalized to single hyphens, so
# one pattern covers `/best-crm-tools`, `/best_crm_tools` and `/best/crm`.
_PATH_FORMATS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"-vs-|-versus-|-compared-to-|(^|-)compare(-|$)"),
        PAGE_FORMAT_COMPARISON,
    ),
    (
        re.compile(r"(^|-)alternatives?(-|$)|(^|-)competitors?(-|$)"),
        PAGE_FORMAT_ALTERNATIVE,
    ),
    (
        re.compile(r"(^|-)how-to(-|$)|(^|-)guide(s)?(-|$)|(^|-)tutorials?(-|$)"),
        PAGE_FORMAT_HOW_TO,
    ),
    (
        re.compile(r"(^|-)best(-|$)|(^|-)top-\d+(-|$)|(^|-)\d+-best(-|$)"),
        PAGE_FORMAT_LISTICLE,
    ),
    (
        re.compile(
            r"(^|-)(forum|thread|discussion|comments|questions|answers)(-|$)|(^|-)r-[a-z0-9_]+(-|$)"
        ),
        PAGE_FORMAT_DISCUSSION,
    ),
    # A dated path segment is a publication date, and only articles carry one.
    # Ranked above the noun patterns below because a headline slug frequently
    # contains one of their words ("...-item-shortage").
    (re.compile(r"(^|-)\d{4}-\d{2}(-|$)"), PAGE_FORMAT_ARTICLE),
    (
        re.compile(r"(^|-)(profile|company|companies|vendor|listing|directory)(-|$)"),
        PAGE_FORMAT_PROFILE,
    ),
    # Whole words only, and no single-letter abbreviations: `/p/`, `/u/` and
    # `/in/` are common enough shorteners that matching them would classify
    # any slug containing a stray letter segment.
    (
        re.compile(r"(^|-)(product|products|pricing|plans|features|shop|store)(-|$)"),
        PAGE_FORMAT_PRODUCT,
    ),
    (
        re.compile(
            r"(^|-)(category|categories|collections?|topics?|tag|tags|browse)(-|$)"
        ),
        PAGE_FORMAT_CATEGORY,
    ),
    (re.compile(r"(^|-)(blog|news|articles?|posts?)(-|$)"), PAGE_FORMAT_ARTICLE),
)

_SEPARATORS = re.compile(r"[/_+.]+")
_COLLAPSE = re.compile(r"-{2,}")


def _normalized_path(url: str) -> str | None:
    """The path as one hyphen-separated token run, or ``None`` when unusable.

    A query string is dropped on purpose. ``?page=2`` and ``?utm_source=x``
    say nothing about what kind of page this is, and letting them match would
    make the same page classify differently depending on where it was linked
    from.
    """
    try:
        path = urlsplit(url).path
    except ValueError:
        return None
    lowered = _SEPARATORS.sub("-", path.lower()).strip("-")
    # A file extension is not a path segment; `/pricing.html` is `/pricing`.
    lowered = re.sub(r"-(html?|php|aspx?|jsp)$", "", lowered)
    return _COLLAPSE.sub("-", lowered)


def derive_url_format(url: str) -> tuple[str, str]:
    """Return ``(page_format, method)`` for one cited URL, without reading it.

    An empty path is the publisher's front door and is the one verdict here
    that is not a guess at all.
    """
    path = _normalized_path(url)
    if path is None:
        return PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE
    if not path:
        return PAGE_FORMAT_HOMEPAGE, PAGE_FORMAT_METHOD_URL_PATTERN
    for pattern, page_format in _PATH_FORMATS:
        if pattern.search(path):
            return page_format, PAGE_FORMAT_METHOD_URL_PATTERN
    return PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE
