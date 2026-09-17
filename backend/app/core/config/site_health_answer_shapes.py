"""The page shapes AI answers lean on, named as first-class page kinds.

Three shapes carry disproportionate weight in what an answer engine quotes: a
ranking, a how-to, and a head-to-head. Left inside ``article`` and ``guide``
they are invisible, and a reader cannot see that every page an engine cited on
their topic was a listicle they have no entry in.

They live here rather than in ``site_health_taxonomy`` for one reason: they are
SHARED. Site Health classifies an owned page with them and AI Visibility
classifies a cited third-party page with them, off the same catalog. A second
definition for either side is a second place the two drift apart.

Nothing here imports the taxonomy, so the taxonomy can import this.
"""

from __future__ import annotations

from typing import Final

from app.core.config.site_health_page_kinds import (
    PAGE_KIND_ARTICLE,
    PAGE_KIND_COMPARISON,
    PAGE_KIND_GUIDE,
)

PAGE_KIND_LISTICLE: Final = "listicle"

PAGE_KIND_HOW_TO: Final = "how_to"

PAGE_KIND_ALTERNATIVE: Final = "alternative"

# Shapes that live INSIDE a slug rather than as a path segment of their own.
# `/blog/revolut-vs-wise` is a comparison filed under a blog, and a catalog
# that only reads path segments can only see `blog`.
#
# Deliberately narrow: each marker is a whole word a publisher chose on
# purpose, because a substring rule here would classify "versatile" as a
# comparison and "newsletter" as news. Ranked ABOVE the segment catalog,
# because where a publisher files a page says less about what it is than what
# the publisher called it.
PAGE_KIND_SLUG_PATTERNS: Final[tuple[tuple[str, str], ...]] = (
    (PAGE_KIND_COMPARISON, r"(^|-)(vs|versus|compared-to|comparison)(-|$)"),
    (PAGE_KIND_ALTERNATIVE, r"(^|-)(alternatives?|competitors?|substitutes?)(-|$)"),
    # An explicit how-to outranks "best" appearing later in the same slug:
    # "how to choose the best CRM" is a guide, not a ranking.
    (PAGE_KIND_HOW_TO, r"(^|-)(how-to|tutorials?)(-|$)"),
    (PAGE_KIND_LISTICLE, r"(^|-)(best|top-\d+|\d+-best)(-|$)"),
)


# The kinds whose job is to explain something in prose. Every rule, archetype
# and readiness profile that applied to `article` and `guide` applies to all of
# these: a listicle is an article with a numbered spine, and naming the kind
# separately must not drop it from the rules that already covered it.
EDITORIAL_PAGE_KINDS: Final[frozenset[str]] = frozenset(
    {
        PAGE_KIND_ARTICLE,
        PAGE_KIND_GUIDE,
        PAGE_KIND_HOW_TO,
        PAGE_KIND_LISTICLE,
        PAGE_KIND_COMPARISON,
        PAGE_KIND_ALTERNATIVE,
    }
)
