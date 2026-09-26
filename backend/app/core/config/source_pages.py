"""Bounded inspection of third-party pages that AI answers cited.

CiteLadder already captures which URLs an answer cited. This owner governs
*looking at* those pages: what may be fetched, how often, how much, and which
vocabularies describe the result.

Two distinctions here are load-bearing and easy to collapse by accident:

``source_class`` vs ``page_format``
    The first describes a publisher (a review marketplace, an editorial
    outlet). The second describes one page (a comparison, a directory entry).
    A single inspected page establishes its own format; it never promotes the
    classification of every other page on that domain.

page state vs entity presence
    ``not_inspected``, ``blocked`` and ``stale`` are properties of the PAGE and
    are never written as a presence verdict. A presence verdict requires a
    snapshot to have been taken. Collapsing the two is how "we never looked"
    becomes "the brand is absent".
"""

from __future__ import annotations

from typing import Final

# =========================================================================
# Versions (stamped onto every derived row - invariant 4)
# =========================================================================
SOURCE_PAGE_IDENTITY_VERSION: Final = "citation-identity-1"
SOURCE_PAGE_INSPECTOR_VERSION: Final = "source-page-inspector-1"
SOURCE_PAGE_EXTRACTOR_VERSION: Final = "source-page-extractor-2"
SOURCE_PAGE_PRESENCE_VERSION: Final = "source-page-presence-1"
SOURCE_PAGE_FORMAT_VERSION: Final = "source-page-format-1"

# =========================================================================
# Citation URL identity
# =========================================================================
# How a citation's canonical URL was established. ``unresolved`` is a real
# state, not a failure: a grounding-redirect token is not a publisher URL and
# must not be counted as a confidently distinct page until it is resolved.
URL_IDENTITY_VERBATIM: Final = "verbatim"
URL_IDENTITY_UNWRAPPED_REDIRECT: Final = "unwrapped_redirect"
URL_IDENTITY_UNRESOLVED: Final = "unresolved"

# =========================================================================
# Page lifecycle
# =========================================================================
INSPECTION_NOT_INSPECTED: Final = "not_inspected"
INSPECTION_QUEUED: Final = "queued"
INSPECTION_INSPECTED: Final = "inspected"
INSPECTION_BLOCKED: Final = "blocked"
INSPECTION_FAILED: Final = "failed"
INSPECTION_STALE: Final = "stale"

# Why a page is in a non-``inspected`` state. Kept separate from the state so
# "blocked by robots" and "blocked by a bot wall" stay distinguishable.
INSPECTION_REASON_ROBOTS: Final = "robots_disallowed"
# robots.txt could not be read; retryable, never a publisher refusal.
INSPECTION_REASON_ROBOTS_UNAVAILABLE: Final = "robots_unavailable"
INSPECTION_REASON_NON_HTML: Final = "non_html"
INSPECTION_REASON_STATUS: Final = "status_rejected"
INSPECTION_REASON_TRANSPORT: Final = "transport_error"
INSPECTION_REASON_UNRESOLVED_REDIRECT: Final = "unresolved_redirect"

# =========================================================================
# Page format (derived from ONE page, never from its domain)
# =========================================================================
PAGE_FORMAT_COMPARISON: Final = "comparison"
PAGE_FORMAT_LISTICLE: Final = "listicle"
PAGE_FORMAT_REVIEW: Final = "review"
PAGE_FORMAT_DIRECTORY: Final = "directory"
PAGE_FORMAT_DISCUSSION: Final = "discussion"
PAGE_FORMAT_REFERENCE: Final = "reference"
PAGE_FORMAT_ARTICLE: Final = "article"
PAGE_FORMAT_VIDEO: Final = "video"
# Shapes a URL alone can establish. They are page kinds like the rest -- what
# distinguishes them is that the evidence for them is the address, so they are
# available for every cited page rather than only for the inspected ones.
PAGE_FORMAT_HOMEPAGE: Final = "homepage"
PAGE_FORMAT_CATEGORY: Final = "category"
PAGE_FORMAT_PRODUCT: Final = "product"
PAGE_FORMAT_PROFILE: Final = "profile"
PAGE_FORMAT_ALTERNATIVE: Final = "alternative"
PAGE_FORMAT_HOW_TO: Final = "how_to"
PAGE_FORMAT_UNRESOLVED: Final = "unresolved"

PAGE_FORMAT_METHOD_STRUCTURED_DATA: Final = "structured_data"
PAGE_FORMAT_METHOD_HEADING_EVIDENCE: Final = "heading_evidence"
# Derived from the address, with no page read. Ranked BELOW the two above and
# recorded distinctly, so a format read off a URL is never presented to a
# reader as one read off the page.
PAGE_FORMAT_METHOD_URL_PATTERN: Final = "url_pattern"
PAGE_FORMAT_METHOD_NONE: Final = "none"

# Methods in strength order, strongest first. An inspection may only REPLACE a
# format established by a method at or below its own strength, which is what
# stops a URL-shape guess from overwriting the publisher's own declaration.
PAGE_FORMAT_METHOD_STRENGTH: Final[tuple[str, ...]] = (
    PAGE_FORMAT_METHOD_STRUCTURED_DATA,
    PAGE_FORMAT_METHOD_HEADING_EVIDENCE,
    PAGE_FORMAT_METHOD_URL_PATTERN,
    PAGE_FORMAT_METHOD_NONE,
)


# =========================================================================
# Entity presence on an inspected page
# =========================================================================
# Every value here REQUIRES a snapshot. A page that was never fetched has no
# presence row at all.
PRESENCE_PRESENT: Final = "present"
PRESENCE_NOT_DETECTED: Final = "not_detected"
PRESENCE_AMBIGUOUS: Final = "ambiguous"
PRESENCE_PARTIAL: Final = "partial"

PRESENCE_MATCH_EXACT_ALIAS: Final = "exact_alias"
PRESENCE_MATCH_NORMALIZED_ALIAS: Final = "normalized_alias"
PRESENCE_MATCH_NONE: Final = "none"

ENTITY_KIND_BRAND: Final = "brand"
ENTITY_KIND_COMPETITOR: Final = "competitor"

# =========================================================================
# Extraction bounds
# =========================================================================
# Each passage carries its own self-contained quoted window because the
# normalized text it was cut from is NOT retained. Offsets are provenance and
# ordering only; they cannot be used to re-slice anything later.
SOURCE_PAGE_PASSAGE_CHARS: Final = 300
SOURCE_PAGE_MAX_PASSAGES: Final = 8
SOURCE_PAGE_MAX_TEXT_CHARS: Final = 400_000
SOURCE_PAGE_MAX_HEADINGS: Final = 24
SOURCE_PAGE_MAX_OUTBOUND_DOMAINS: Final = 64
SOURCE_PAGE_MAX_STRUCTURED_TYPES: Final = 16
SOURCE_PAGE_TITLE_MAX_CHARS: Final = 500
# Below this much extracted text an absence is not evidence of absence.
SOURCE_PAGE_MIN_COVERAGE_CHARS: Final = 600

# =========================================================================
# Fetch policy - stricter than owned-site crawling on purpose
# =========================================================================
# These are publishers whose goodwill is the product being pursued. A page we
# are about to ask for a listing is the last place to be impolite.
SOURCE_PAGE_REQUEST_TIMEOUT_SECONDS: Final = 15
SOURCE_PAGE_MAX_REDIRECTS: Final = 5
SOURCE_PAGE_MAX_WIRE_BYTES: Final = 3_000_000
SOURCE_PAGE_MAX_DECODED_BYTES: Final = 10_000_000
SOURCE_PAGE_PER_HOST_DELAY_SECONDS: Final = 1.0
SOURCE_PAGE_FETCH_CONCURRENCY: Final = 4
SOURCE_PAGE_ALLOWED_CONTENT_TYPES: Final[tuple[str, ...]] = (
    "text/html",
    "application/xhtml+xml",
)

# =========================================================================
# Admission and budget
# =========================================================================
# The budget is enforced by ATOMIC ADMISSION, not by counting finished work:
# two workers reading the same remaining allowance would both proceed, and a
# worker that fetches and then crashes would leave no record of what it spent.
# Claiming a page (``not_inspected`` -> ``queued``) is the unit of spend, and a
# redirect resolution costs the same as a page.
SOURCE_PAGE_BUDGET_WINDOW_HOURS: Final = 24
SOURCE_PAGE_BUDGET_PER_WINDOW: Final = 120
SOURCE_PAGE_BATCH_MAX: Final = 25
SOURCE_PAGE_STALE_AFTER_HOURS: Final = 24 * 14
# One publisher must not consume the window through unresolved redirect tokens,
# which look distinct until they are resolved.
SOURCE_PAGE_MAX_REDIRECTS_PER_DOMAIN: Final = 3
SOURCE_PAGE_CLAIM_LEASE_MINUTES: Final = 30
# An inspection this recent is reused rather than repeated. Without it a page
# already read in this run -- from a redirect body, say -- stays claimable and
# is fetched and charged a second time for the same reading.
SOURCE_PAGE_REUSE_WITHIN_HOURS: Final = 12
