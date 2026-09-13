"""Version-1 Site Health measurement, checkpoint, and presentation policy."""

from __future__ import annotations

from typing import Final

# Public checklist membership is declared directly, independently of outcomes.
#
# MEMBERSHIP IS THE SCORE'S HONESTY. A check that runs, produces a determinate
# verdict, and describes something the owner can change belongs in a score. The
# first cut of this table held ten ids, which left the site score blind to the
# failures the Issues tab was simultaneously reporting: a catalogue with no
# canonical on any page, no Open Graph on any page, no structured data on 83%
# of them and a missing meta description on half still scored 88.9 "Web
# Fundamentals". A score that cannot move when the site is broken is not a
# score. Every page-scope check whose outcome is determinate and actionable is
# therefore a member; applicability (below) is what removes the ones that do
# not apply to a given page, and that is the ONLY thing that removes them.
WEB_CHECK_IDS: Final[frozenset[str]] = frozenset(
    {
        # Retrieval and identity
        "technical.title_present",
        "technical.meta_description_present",
        "technical.canonical_present",
        "technical.canonical_integrity",
        "technical.indexable",
        "technical.soft_error",
        # Transport and delivery
        "technical.https",
        "technical.hsts_present",
        "technical.uncompressed_html",
        "technical.ttfb_band",
        "web.security_mixed_content",
        # Accessibility and device reach
        "web.accessibility_image_alt",
        "web.accessibility_form_names",
        "web.accessibility_document_language",
        "web.accessibility_heading_order",
        "web.mobile_viewport",
    }
)

#: The single AEO pillar a page check contributes to. A check absent here is
#: evidence the panels can still show, but it earns no readiness credit.
AEO_CHECK_PILLAR: Final[dict[str, str]] = {
    # Can an engine reach and quote the page at all?
    "technical.indexable": "crawlability",
    "search.crawler_access": "crawlability",
    "search.snippet_access": "crawlability",
    # Does the page answer the question it is for?
    "aeo.product_answer_facts": "answerability",
    "aeo.listing_answer_set": "answerability",
    "aeo.answer_first": "answerability",
    # Can an engine find the part that answers it?
    "aeo.heading_hierarchy": "structure",
    "aeo.listing_item_facts": "structure",
    "aeo.question_headings": "structure",
    # Are the claims backed by something a reader can follow?
    "aeo.source_support_present": "evidence",
    "aeo.product_evidence_facts": "evidence",
    # Does the page state what it is, in machine-readable form?
    "aeo.structured_data_present": "machine-readability",
    "aeo.schema_required_valid": "machine-readability",
    "aeo.schema_matches_content": "machine-readability",
    "aeo.open_graph_present": "machine-readability",
    "aeo.server_rendered_content": "machine-readability",
    # Who is responsible for it?
    "aeo.product_brand_identity": "provenance",
    "aeo.visible_attribution": "provenance",
    # When was it written or last true?
    "aeo.content_date_present": "freshness",
    "aeo.offer_freshness_signal": "freshness",
}

#: Checks a Content draft can actually resolve, and the field each one writes.
#:
#: This is the ONE list behind the Site Health → Content hand-off: the rule
#: catalog's ``content_addressable`` flag is projected from it, the readiness
#: and issue surfaces render their "Improve with Content" action from it, and
#: the hand-off endpoint authorizes against it. Holding it in three places is
#: how every rendered hand-off button came to 404 — the catalog flagged AEO
#: rules the endpoint had stopped serving.
CONTENT_ADDRESSABLE_CHECK_FIELDS: Final[dict[str, str]] = {
    "technical.title_present": "title",
    "technical.meta_description_present": "meta_description",
}
CONTENT_ADDRESSABLE_CHECK_IDS: Final[frozenset[str]] = frozenset(
    CONTENT_ADDRESSABLE_CHECK_FIELDS
)

#: Who can actually resolve a failing check.
#:
#: DERIVED from the catalog's own `dimension`, `category` and `scope`, because
#: a hand-kept list of rule ids is a guess that rots: the first attempt routed
#: `architecture.duplicate_metadata_in_page_kind` — a cluster-scope technical
#: finding — to the editorial agent, and put template concerns like offer
#: freshness beside genuinely editorial ones. The three routes are:
#:
#:   content — a Content draft writes the fix. The backend's own hand-off
#:             allowlist decides this, so the UI cannot offer a draft the
#:             endpoint would refuse.
#:   agent   — the fix is a judgement about what the page SAYS. Page-scope AEO
#:             checks in the content and citability categories: answers,
#:             question structure, visible dates, attribution, sources, brand
#:             and item facts. A developer cannot decide these.
#:   code    — a template, header, markup or config change. Everything else,
#:             including every `technical` check (accessibility markup,
#:             indexability, security, performance), structured data, Open
#:             Graph, and every site- or graph-scope finding.
REMEDIATION_ROUTE_CONTENT: Final = "content"
REMEDIATION_ROUTE_AGENT: Final = "agent"
REMEDIATION_ROUTE_CODE: Final = "code"

#: AEO categories whose remedy is editorial rather than structural.
_EDITORIAL_AEO_CATEGORIES: Final[frozenset[str]] = frozenset({"content", "citability"})

#: Page-scope AEO content checks that are nonetheless a BUILD concern. Server
#: rendering is decided by the framework, not by an author, so it is named here
#: rather than left to the category to imply.
_BUILD_AEO_CHECK_IDS: Final[frozenset[str]] = frozenset({"aeo.server_rendered_content"})


def remediation_route(
    rule_id: str, *, dimension: str, category: str, scope: str
) -> str:
    """Return the route that can actually resolve ``rule_id``."""
    if rule_id in CONTENT_ADDRESSABLE_CHECK_IDS:
        return REMEDIATION_ROUTE_CONTENT
    editorial = (
        dimension == "aeo"
        and category in _EDITORIAL_AEO_CATEGORIES
        # A site- or graph-scope finding is about the SITE, not about what one
        # page says, so it is never an editorial rewrite of a page.
        and scope == "page"
        and rule_id not in _BUILD_AEO_CHECK_IDS
    )
    return REMEDIATION_ROUTE_AGENT if editorial else REMEDIATION_ROUTE_CODE


def public_check_membership(
    rule_id: str, page_kind: str
) -> tuple[tuple[str, ...], str]:
    """Return configured roles and pillar; rules own page-kind applicability."""
    del page_kind
    roles: list[str] = []
    if rule_id in WEB_CHECK_IDS:
        roles.append("web_fundamentals")
    pillar = AEO_CHECK_PILLAR.get(rule_id, "")
    if pillar:
        roles.append("aeo_readiness")
    return tuple(roles), pillar


CHECKPOINT_DIMENSION_BY_ID: Final[dict[str, str]] = dict(AEO_CHECK_PILLAR)

PROFILE_VERSION: Final = "sh-profiles-1"
SCHEMA_CONTRACT_VERSION: Final = "sh-schema-1"
PRESENTATION_VERSION: Final = "sh-presentation-1"
SITE_HEALTH_OVERVIEW_TREND_POINT_LIMIT: Final = 12
CLASSIFICATION_FORMULA_VERSION: Final = "sh-classification-1"
CLASSIFICATION_STATE_COMPLETE: Final = "complete"
CLASSIFICATION_STATE_PARTIAL: Final = "partial"
CLASSIFICATION_STATE_NOT_MEASURED: Final = "not_measured"
SOURCE_SUPPORT_MAX_ITEMS: Final = 24
SOURCE_SUPPORT_SECTION_HEADINGS: Final[frozenset[str]] = frozenset(
    {"methodology", "references", "sources"}
)
SOURCE_SUPPORT_ATTRIBUTION_PATTERN: Final = (
    r"(?:\b(?:according to|data from|reported by|research from)\b|\bsource\s*:)"
)
SOURCE_SUPPORT_CITATION_MARKER_PATTERN: Final = (
    r"(?:\[[0-9]{1,3}\]|\([A-Z][A-Za-z& .'-]{1,80},?\s+[12][0-9]{3}\)|"
    r"\b(?:cite|citation|reference)\b)"
)
FRESHNESS_ROUTE_SEGMENTS: Final[frozenset[str]] = frozenset(
    {"changelog", "news", "release", "releases"}
)
FRESHNESS_IDENTITY_PATTERN: Final = (
    r"\b(?:v(?:ersion)?\s*\d+(?:\.\d+)*|(?:19|20)\d{2})\b"
)
FRESHNESS_PURPOSE_PATTERN: Final = (
    r"\b(?:annual report|changelog|current event|news|quarterly report|"
    r"release notes|state of|what(?:'|’)s new)\b"
)

MEASUREMENT_STATE_MEASURED: Final = "measured"
MEASUREMENT_STATE_LIMITED: Final = "limited_evidence"
MEASUREMENT_STATE_NOT_MEASURED: Final = "not_measured"
MEASUREMENT_STATE_EXCLUDED: Final = "excluded"

DIMENSION_APPLICABLE: Final = "applicable"
DIMENSION_NOT_APPLICABLE: Final = "not_applicable"
MEASURED_AT_SITE_SCOPE_REASON: Final = "measured_at_site_scope"

TECHNICAL_MEASURED_MIN_COVERAGE: Final = 0.80

READINESS_DIMENSION_WEIGHTS: Final[dict[str, float]] = {
    "answerability": 0.20,
    "structure": 0.15,
    "evidence": 0.15,
    "machine-readability": 0.20,
    "provenance": 0.10,
    "freshness": 0.05,
    "crawlability": 0.15,
}

# Search eligibility intentionally uses only the two determinate checks below.
# Crawler and snippet observations remain supplemental until a later explicit
# contract change supplies determinate healthy and blocker evidence.
SEARCH_ELIGIBILITY_CRITICAL_CHECKPOINTS_1: Final[tuple[str, ...]] = (
    "acquisition.public_representation",
    "search.indexability",
)

WEB_FUNDAMENTALS_AREAS: Final[tuple[str, ...]] = (
    "accessibility",
    "mobile",
    "security",
    "lab",
)


STRUCTURAL_NA_REASONS: Final[frozenset[str]] = frozenset(
    {
        "no_canonical",
        "quote_led_offer",
        "expiry_not_declared",
        "explicit_empty_collection",
        "empty_title",
        "empty_meta_description",
        "no_product_schema",
        "no_expected_type_block",
        "no_required_properties",
        "no_recommended_properties",
        "no_schema_names",
        "no_sitemap",
        "no_hreflang",
        "no_html",
        "format_has_no_html",
        "other_page_kind",
        "trait_not_observed",
        "not_site_root",
        "crawl_finalize_scope",
        "content_not_server_rendered",
        "intentional_non_indexing",
    }
)

UNAVAILABLE_REASONS: Final[frozenset[str]] = frozenset(
    {"coverage_not_complete", "no_checkable_alternates", "no_ttfb_measurement"}
)
UNKNOWN_REASONS: Final[frozenset[str]] = frozenset(
    {
        "insufficient_evidence",
        "question_answers_unavailable",
        "question_relationships_unavailable",
        "robots_not_fetched",
        "unknown_applicability",
    }
)
