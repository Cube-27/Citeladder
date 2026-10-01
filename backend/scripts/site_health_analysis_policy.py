"""JSON-safe export of the policy the TypeScript page analyzer reads.

One section per concern. Keys already exported elsewhere in ``site_health``
(the rule catalog, route and slug patterns, homepage paths, tracking
parameters, settings, versions and the read policy) are not repeated here.
"""

from __future__ import annotations

import types
from collections.abc import Callable
from typing import Any

from app.core.config import site_health_acquisition as acquisition
from app.core.config import site_health_authorship as authorship
from app.core.config import site_health_company_entity as company
from app.core.config import site_health_contracts as contracts
from app.core.config import site_health_crawl_policy as crawl_policy
from app.core.config import site_health_measurement as measurement
from app.core.config import site_health_page_profiles as profiles
from app.core.config import site_health_rules as rules
from app.core.config import site_health_search_rules as search_rules
from app.core.config import site_health_taxonomy as taxonomy
from app.core.config import site_health_traits as traits
from app.core.config.site_health_taxonomy import PageKindSchemaExpectation

Constants = Callable[[types.ModuleType, str], dict[str, Any]]


def _expectation(expectation: PageKindSchemaExpectation) -> dict[str, Any]:
    return {
        "page_kind": expectation.page_kind,
        "expected_types": list(expectation.expected_types),
        "required": list(expectation.required_properties),
        "recommended": list(expectation.recommended_properties),
        "required_by_type": {
            key: list(value)
            for key, value in sorted(expectation.required_properties_by_type.items())
        },
        "recommended_by_type": {
            key: list(value)
            for key, value in sorted(expectation.recommended_properties_by_type.items())
        },
    }


def _facts_policy(constants: Constants) -> dict[str, Any]:
    return {
        "limits": constants(acquisition, "SITE_HEALTH_MAX_"),
        "cta_button_role_tokens": sorted(acquisition.CTA_BUTTON_ROLE_TOKENS),
        "inline_script_javascript_types": sorted(rules.INLINE_SCRIPT_JAVASCRIPT_TYPES),
        "server_rendered_min_words": rules.SERVER_RENDERED_MIN_WORDS,
        "answer_first_min_words": rules.ANSWER_FIRST_MIN_WORDS,
        "answer_first_max_hops": rules.ANSWER_FIRST_MAX_HOPS,
        "non_navigable_href_prefixes": list(crawl_policy.NON_NAVIGABLE_HREF_PREFIXES),
        "search_robots_header_agents": sorted(search_rules.SEARCH_ROBOTS_HEADER_AGENTS),
        "provider_identity_exclusions": sorted(company.PROVIDER_IDENTITY_EXCLUSIONS),
        "source_support": constants(measurement, "SOURCE_SUPPORT_"),
        "freshness": constants(measurement, "FRESHNESS_"),
        "authorship": {
            name.lower(): sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(authorship).items()
            if name.isupper()
        },
    }


def _regions_policy(constants: Constants) -> dict[str, Any]:
    return {
        **constants(taxonomy, "REGION_"),
        **constants(taxonomy, "CARD_"),
        "content_recommendation_tokens": sorted(taxonomy.CONTENT_RECOMMENDATION_TOKENS),
        "rich_text_container_tokens": sorted(taxonomy.RICH_TEXT_CONTAINER_TOKENS),
        "rich_text_container_tags": sorted(taxonomy.RICH_TEXT_CONTAINER_TAGS),
        "page_owned_text_max_chars": taxonomy.PAGE_OWNED_TEXT_MAX_CHARS,
        "page_owned_max_question_answer_pairs": (
            taxonomy.PAGE_OWNED_MAX_QUESTION_ANSWER_PAIRS
        ),
    }


def _entity_policy() -> dict[str, Any]:
    return {
        "price_pattern": taxonomy.PAGE_KIND_PRICE_PATTERN,
        "result_count_pattern": taxonomy.RESULT_COUNT_PATTERN,
        "cart_markers": sorted(taxonomy.PAGE_KIND_CART_MARKERS),
        "cart_form_action_tokens": sorted(taxonomy.CART_FORM_ACTION_TOKENS),
        "sort_control_tokens": sorted(taxonomy.SORT_CONTROL_TOKENS),
        "filter_control_tokens": sorted(taxonomy.FILTER_CONTROL_TOKENS),
        "sku_attribute_tokens": sorted(taxonomy.SKU_ATTRIBUTE_TOKENS),
        "variant_min_options": taxonomy.VARIANT_MIN_OPTIONS,
        "product_detail_heading_phrases": sorted(
            taxonomy.PRODUCT_DETAIL_HEADING_PHRASES
        ),
        "listing_min_card_items": taxonomy.LISTING_MIN_CARD_ITEMS,
    }


def _structured_data_policy() -> dict[str, Any]:
    return {
        "required_properties": {
            key: list(value)
            for key, value in profiles.STRUCTURED_DATA_REQUIRED_PROPERTIES.items()
        },
        "recognized_types": sorted(
            profiles.STRUCTURED_DATA_RECOGNIZED_TYPES
            | profiles.PRODUCT_RECOGNIZED_SCHEMA_TYPES
        ),
        "property_paths": sorted(
            taxonomy.SCHEMA_PROPERTY_PATHS | profiles.PRODUCT_SCHEMA_PROPERTY_PATHS
        ),
        "product_max_values": profiles.PRODUCT_FACT_MAX_VALUES,
        "product_max_value_chars": profiles.PRODUCT_FACT_MAX_VALUE_CHARS,
        "product_nested_value_keys": list(profiles.PRODUCT_NESTED_VALUE_KEYS),
    }


def _classification_policy() -> dict[str, Any]:
    return {
        "version": contracts.CLASSIFIER_VERSION,
        "page_kinds": list(taxonomy.PAGE_KINDS),
        "faq_min_headings": taxonomy.PAGE_KIND_FAQ_MIN_HEADINGS,
        # Ordered: the first matching type, most specific first, is suggested.
        "schema_type_map": [
            [schema_type, page_kind]
            for schema_type, page_kind in taxonomy.PAGE_KIND_SCHEMA_TYPE_MAP.items()
        ],
        "title_keywords": [list(item) for item in taxonomy.PAGE_KIND_TITLE_KEYWORDS],
        "tiers": list(taxonomy.PAGE_KIND_TIERS),
        "signal_tiers": dict(taxonomy.PAGE_KIND_SIGNAL_TIERS),
        "tier_confidence": dict(taxonomy.PAGE_KIND_TIER_CONFIDENCE),
        "max_alternatives": profiles.CLASSIFICATION_MAX_ALTERNATIVES,
        "other_reasons": {
            "no_signals": profiles.CLASSIFICATION_OTHER_REASON_NO_SIGNALS,
            "schema_only": profiles.CLASSIFICATION_OTHER_REASON_SCHEMA_ONLY,
            "conflict": profiles.CLASSIFICATION_OTHER_REASON_CONFLICT,
        },
    }


def _traits_policy() -> dict[str, Any]:
    return {
        "version": traits.TRAITS_VERSION,
        "order": list(traits.PAGE_TRAITS),
        "route_segments": {
            key: list(value) for key, value in traits.PAGE_TRAIT_ROUTE_SEGMENTS.items()
        },
        "title_phrases": {
            key: list(value) for key, value in traits.PAGE_TRAIT_TITLE_PHRASES.items()
        },
        "schema_types": {
            key: list(value) for key, value in traits.PAGE_TRAIT_SCHEMA_TYPES.items()
        },
        "contact_form_fields": sorted(traits.PAGE_TRAIT_CONTACT_FORM_FIELDS),
        "variant_form_fields": sorted(traits.PAGE_TRAIT_VARIANT_FORM_FIELDS),
        "procedural_min_steps": traits.PAGE_TRAIT_PROCEDURAL_MIN_STEPS,
        "company_profile": {
            "route_segments": list(company.COMPANY_PROFILE_ROUTE_SEGMENTS),
            "title_phrases": list(company.COMPANY_PROFILE_TITLE_PHRASES),
            "excluded_terms": list(company.COMPANY_PROFILE_EXCLUDED_TERMS),
        },
    }


def _rules_policy() -> dict[str, Any]:
    return {
        "applicability_prefixes": {
            "page_kind": taxonomy.PAGE_KIND_APPLICABILITY_PREFIX,
            "page_kind_html": taxonomy.PAGE_KIND_HTML_APPLICABILITY_PREFIX,
            "page_kind_content": taxonomy.PAGE_KIND_CONTENT_APPLICABILITY_PREFIX,
            "page_trait": traits.PAGE_TRAIT_APPLICABILITY_PREFIX,
            "page_trait_content": traits.PAGE_TRAIT_CONTENT_APPLICABILITY_PREFIX,
            "page_kind_or_trait_content": (
                traits.PAGE_KIND_OR_TRAIT_CONTENT_APPLICABILITY_PREFIX
            ),
        },
        "weight_overrides": {
            kind: dict(profile.rule_weight_overrides)
            for kind, profile in taxonomy.PAGE_KIND_PROFILES.items()
            if profile.rule_weight_overrides
        },
        "expected_schema": {
            kind: _expectation(expectation)
            for kind, expectation in taxonomy.PAGE_KIND_EXPECTED_SCHEMA.items()
        },
        "product_schema_expectation": _expectation(profiles.PRODUCT_SCHEMA_EXPECTATION),
        "organization_bearing_schema_types": list(
            taxonomy.ORGANIZATION_BEARING_SCHEMA_TYPES
        ),
        "schema_content_match_min_token_overlap": (
            profiles.SCHEMA_CONTENT_MATCH_MIN_TOKEN_OVERLAP
        ),
        "schema_content_match_max_candidates": (
            profiles.SCHEMA_CONTENT_MATCH_MAX_CANDIDATES
        ),
        "ttfb_warn_ms": rules.TTFB_WARN_MS,
        "ai_crawler_bots": list(acquisition.AI_CRAWLER_BOTS),
        "search_citation_crawler_bots": list(acquisition.SEARCH_CITATION_CRAWLER_BOTS),
        "web_check_ids": sorted(measurement.WEB_CHECK_IDS),
        "aeo_dimensions": list(contracts.AEO_READINESS_DIMENSIONS),
        "structural_na_reasons": sorted(measurement.STRUCTURAL_NA_REASONS),
        "unavailable_reasons": sorted(measurement.UNAVAILABLE_REASONS),
        "unknown_reasons": sorted(measurement.UNKNOWN_REASONS),
    }


def _acquisition_policy(constants: Constants) -> dict[str, Any]:
    return {
        "error_codes": constants(acquisition, "ERROR_"),
        "provenance": constants(acquisition, "ACQUISITION_"),
        "bot_block_body_markers": list(acquisition.BOT_BLOCK_BODY_MARKERS),
        "bot_block_marker_scan_bytes": acquisition.BOT_BLOCK_MARKER_SCAN_BYTES,
        "bodyless_status_codes": sorted(
            acquisition.CLASSIFICATION_BODYLESS_STATUS_CODES
        ),
        "html_content_types": sorted(rules.HTML_CONTENT_TYPES),
        "persisted_response_headers": sorted(rules.PERSISTED_RESPONSE_HEADERS),
        "hard_exclusion_path_patterns": list(
            crawl_policy.URL_HARD_EXCLUSION_PATH_PATTERNS
        ),
        "hard_exclusion_host_labels": sorted(
            crawl_policy.URL_HARD_EXCLUSION_HOST_LABELS
        ),
        "hard_exclusion_query_keys": sorted(crawl_policy.URL_HARD_EXCLUSION_QUERY_KEYS),
        "hard_exclusion_extensions": sorted(crawl_policy.URL_HARD_EXCLUSION_EXTENSIONS),
    }


def page_analysis_policy(constants: Constants) -> dict[str, Any]:
    """Everything the TypeScript analyze executor reads beyond shared keys."""
    return {
        "facts": _facts_policy(constants),
        "regions": _regions_policy(constants),
        "entity": _entity_policy(),
        "structured_data": _structured_data_policy(),
        "classification": _classification_policy(),
        "traits": _traits_policy(),
        "rules": _rules_policy(),
        "acquisition": _acquisition_policy(constants),
    }
