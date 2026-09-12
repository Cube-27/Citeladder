"""Version-1 Site Health measurement, checkpoint, and presentation policy."""

from __future__ import annotations

from typing import Final

# Public checklist membership is declared directly, independently of outcomes.
WEB_CHECK_IDS: Final[frozenset[str]] = frozenset(
    {
        "technical.title_present",
        "technical.indexable",
        "technical.https",
        "technical.canonical_integrity",
        "web.accessibility_image_alt",
        "web.accessibility_form_names",
        "web.accessibility_document_language",
        "web.mobile_viewport",
        "web.security_mixed_content",
        "technical.soft_error",
    }
)

AEO_CHECK_PILLAR: Final[dict[str, str]] = {
    "technical.indexable": "crawlability",
    "search.crawler_access": "crawlability",
    "search.snippet_access": "crawlability",
    "aeo.heading_hierarchy": "structure",
    "aeo.content_date_present": "freshness",
    "aeo.product_answer_facts": "answerability",
    "aeo.product_brand_identity": "provenance",
    "aeo.offer_freshness_signal": "freshness",
    "aeo.listing_answer_set": "answerability",
    "aeo.listing_item_facts": "structure",
    "aeo.schema_required_valid": "machine-readability",
    "aeo.schema_matches_content": "machine-readability",
    "aeo.visible_attribution": "provenance",
    "aeo.source_support_present": "evidence",
    "aeo.answer_first": "answerability",
    "aeo.question_headings": "structure",
}

SUPPORTED_AEO_CHECKS_BY_PAGE_KIND: Final[dict[str, frozenset[str]]] = {
    "article": frozenset(
        {
            "technical.indexable",
            "search.snippet_access",
            "aeo.heading_hierarchy",
            "aeo.content_date_present",
            "aeo.visible_attribution",
            "aeo.source_support_present",
            "aeo.schema_required_valid",
            "aeo.schema_matches_content",
        }
    ),
    "product": frozenset(
        {
            "technical.indexable",
            "search.snippet_access",
            "aeo.product_answer_facts",
            "aeo.product_brand_identity",
            "aeo.offer_freshness_signal",
            "aeo.schema_required_valid",
            "aeo.schema_matches_content",
        }
    ),
    "category": frozenset(
        {
            "technical.indexable",
            "search.snippet_access",
            "aeo.listing_answer_set",
            "aeo.listing_item_facts",
            "aeo.schema_required_valid",
            "aeo.schema_matches_content",
        }
    ),
    "faq": frozenset(
        {
            "technical.indexable",
            "search.snippet_access",
            "aeo.answer_first",
            "aeo.question_headings",
            "aeo.schema_required_valid",
            "aeo.schema_matches_content",
        }
    ),
    "docs": frozenset(
        {
            "technical.indexable",
            "search.snippet_access",
            "aeo.heading_hierarchy",
            "aeo.content_date_present",
            "aeo.source_support_present",
            "aeo.schema_required_valid",
            "aeo.schema_matches_content",
        }
    ),
}


def public_check_membership(
    rule_id: str, page_kind: str
) -> tuple[tuple[str, ...], str]:
    """Return direct score roles and optional AEO pillar for one page check."""
    roles: list[str] = []
    if rule_id in WEB_CHECK_IDS:
        roles.append("web_fundamentals")
    supported = SUPPORTED_AEO_CHECKS_BY_PAGE_KIND.get(page_kind, frozenset())
    pillar = AEO_CHECK_PILLAR.get(rule_id, "") if rule_id in supported else ""
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
