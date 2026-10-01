"""Export source inspection and the shared Site Health acquisition catalogs."""

from __future__ import annotations

import types
from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import content_differentiation as differentiation
from app.core.config import site_change_intel as change_intel
from app.core.config import site_health_acquisition as acquisition
from app.core.config import site_health_answer_shapes as answer_shapes
from app.core.config import site_health_archetypes as archetypes
from app.core.config import site_health_contracts as contracts
from app.core.config import site_health_crawl_policy as crawl_policy
from app.core.config import site_health_link_metrics as links
from app.core.config import site_health_measurement as measurement
from app.core.config import site_health_rules as rules
from app.core.config import site_health_runtime as runtime
from app.core.config import site_health_taxonomy as taxonomy
from app.core.config import source_pages
from app.core.config.lexical import STOP_WORDS
from app.core.config.site_health_crawl_policy import (
    INVENTORY_SOURCE_CRAWL_IDS_KEY,
    URL_IDENTITY_IGNORED_QUERY_KEYS,
)
from app.core.config.site_health_page_profiles import (
    ISSUE_HISTORY_TIMELINE_MAX_CRAWLS,
)
from app.core.config.site_health_runtime import (
    ANALYZE_PRIORITY_BOOST,
    SiteHealthSettings,
)
from scripts.site_health_analysis_policy import page_analysis_policy
from scripts.site_health_policy import architecture_policy


def web_evidence_policy(
    constants: Callable[[types.ModuleType, str], dict[str, Any]],
    setting: Callable[[str, type[BaseSettings]], dict[str, Any]],
) -> dict[str, Any]:
    return {
        "source_pages": {
            **constants(source_pages, "SOURCE_PAGE_"),
            "format_method_strength": source_pages.PAGE_FORMAT_METHOD_STRENGTH,
        },
        "content_differentiation": {
            "stop_words": sorted(STOP_WORDS),
            **constants(differentiation, "DIFFERENTIATION_"),
            **constants(differentiation, "SOURCE_PAGE_"),
        },
        "site_health": {
            **architecture_policy(),
            "ts_owned_task_kinds": sorted(contracts.SITE_TS_OWNED_TASK_KINDS),
            "versions": {
                "extractor": contracts.EXTRACTOR_VERSION,
                "analyzer": contracts.ANALYZER_VERSION,
                "rules": contracts.RULE_CATALOG_VERSION,
                "architecture": archetypes.ARCHITECTURE_FORMULA_VERSION,
                "archetype": archetypes.ARCHETYPE_POLICY_VERSION,
            },
            "link_metrics": {
                **constants(links, "LINK_METRIC_"),
                **constants(links, "ANCHOR_"),
                **{
                    key: value
                    for key, value in constants(links, "AUTHORITY_").items()
                    if key != "edge_weights"
                },
                "edge_weights": [
                    {"main": main, "follow": follow, "weight": weight}
                    for (main, follow), weight in links.AUTHORITY_EDGE_WEIGHTS.items()
                ],
            },
            "settings": {
                name: setting(name, SiteHealthSettings)
                for name in SiteHealthSettings.model_fields
            },
            "route_patterns": taxonomy.PAGE_KIND_PATH_PATTERNS,
            "slug_patterns": answer_shapes.PAGE_KIND_SLUG_PATTERNS,
            "homepage_paths": sorted(taxonomy.HOMEPAGE_PATH_EQUIVALENTS),
            "tracking_params": sorted(rules.TRACKING_QUERY_PARAMS),
            "ignored_query_keys": sorted(URL_IDENTITY_IGNORED_QUERY_KEYS),
            "reads": _read_policy(),
            "crawl": _crawl_policy(constants),
            "page_analysis": page_analysis_policy(constants),
            "change_intel": {
                **constants(change_intel, "CHANGE_"),
                **constants(change_intel, "CONTENT_"),
            },
        },
    }


def _crawl_policy(
    constants: Callable[[types.ModuleType, str], dict[str, Any]],
) -> dict[str, Any]:
    """What the TypeScript discovery, site setup and frontier admission read."""
    return {
        "value_priorities": crawl_policy.URL_VALUE_PRIORITIES,
        "value_fallback_tokens": [
            [kind, list(tokens)]
            for kind, tokens in crawl_policy.URL_VALUE_FALLBACK_TOKENS
        ],
        "exclusions": constants(crawl_policy, "URL_EXCLUSION_"),
        "inventory_document_extensions": sorted(
            crawl_policy.INVENTORY_DOCUMENT_EXTENSIONS
        ),
        "document_media_types": sorted(crawl_policy.DOCUMENT_MEDIA_TYPES),
        "disposition_version": crawl_policy.CORPUS_DISPOSITION_VERSION,
        "automatic_monitor_limit_key": crawl_policy.AUTOMATIC_MONITOR_LIMIT_KEY,
        "admission_policy_version": crawl_policy.URL_ADMISSION_POLICY_VERSION,
        "site_setup_priority_boost": runtime.SITE_SETUP_PRIORITY_BOOST,
        "cancel_db_conflict_retries": runtime.CRAWL_CANCEL_DB_CONFLICT_RETRIES,
        "analyze_priority_boost": ANALYZE_PRIORITY_BOOST,
        "link_rewrite": {
            "reason": contracts.LINK_REWRITE_ENCODED_TRACKING_QUERY,
            "version": contracts.LINK_REWRITE_VERSION,
        },
        "robots_path": acquisition.ROBOTS_TXT_PATH,
        "robots_statuses": constants(acquisition, "ROBOTS_STATUS_"),
        "max_declared_sitemaps": acquisition.SITE_HEALTH_MAX_DECLARED_SITEMAPS,
        "max_url_chars": acquisition.SITE_HEALTH_MAX_URL_CHARS,
        "frontier_statuses": constants(crawl_policy, "FRONTIER_"),
        "sample_analysis_selection_sources": sorted(
            crawl_policy.SAMPLE_ANALYSIS_SELECTION_SOURCES
        ),
        "llms_path": acquisition.LLMS_TXT_PATH,
        "sitemap_default_paths": list(acquisition.SITEMAP_DEFAULT_PATHS),
        "sitemap_content_types": sorted(rules.SITEMAP_CONTENT_TYPES),
        "sitemap_path_suffixes": list(acquisition.SITEMAP_PATH_SUFFIXES),
        "crawler_roles": {
            "search_citation": list(acquisition.SEARCH_CITATION_CRAWLER_BOTS),
            "training": list(acquisition.TRAINING_CRAWLER_BOTS),
            "user_triggered": list(acquisition.USER_TRIGGERED_FETCHER_BOTS),
        },
    }


def _read_policy() -> dict[str, Any]:
    """What the TypeScript Site Health read API projects from."""
    return {
        "terminal_crawl_statuses": sorted(contracts.CRAWL_TERMINAL_STATUSES),
        "page_default_limit": runtime.READ_PAGE_DEFAULT_LIMIT,
        "page_max_limit": runtime.READ_PAGE_MAX_LIMIT,
        "terminal_grace_polls": runtime.READ_TERMINAL_GRACE_POLLS,
        "export_page_size": runtime.READ_EXPORT_PAGE_SIZE,
        "max_detail_evaluations": runtime.READ_MAX_DETAIL_EVALUATIONS,
        "scoring_version": contracts.SCORING_VERSION,
        "rule_dimensions": sorted(contracts.RULE_DIMENSIONS),
        "failing_outcomes": sorted(contracts.RULE_FAILING_OUTCOMES),
        "event_count_bearing_keys": sorted(contracts.EVENT_COUNT_BEARING_KEYS),
        "aeo_dimension_labels": contracts.AEO_READINESS_DIMENSION_LABELS,
        "aeo_dimension_descriptions": contracts.AEO_READINESS_DIMENSION_DESCRIPTIONS,
        "policy_blocking_error_codes": sorted(acquisition.POLICY_BLOCKING_ERROR_CODES),
        "corpus_exclusion_error_codes": sorted(
            acquisition.CORPUS_EXCLUSION_ERROR_CODES
        ),
        "non_error_terminal_codes": sorted(acquisition.NON_ERROR_TERMINAL_CODES),
        "fetch_attempt_error_outcome": acquisition.FETCH_ATTEMPT_OUTCOME_ERROR,
        "defect_impact_bands": measurement.DEFECT_IMPACT_BANDS,
        "readiness_dimension_weights": measurement.READINESS_DIMENSION_WEIGHTS,
        "aeo_check_pillar": measurement.AEO_CHECK_PILLAR,
        "unknown_rule_remediation_route": measurement.REMEDIATION_ROUTE_CODE,
        "issue_history_max_crawls": ISSUE_HISTORY_TIMELINE_MAX_CRAWLS,
        "inventory_source_crawl_ids_key": INVENTORY_SOURCE_CRAWL_IDS_KEY,
        "coverage_complete_state": links.COVERAGE_STATE_COMPLETE,
        "coverage_formula_version": links.COVERAGE_FORMULA_VERSION,
        "classification_formula_version": measurement.CLASSIFICATION_FORMULA_VERSION,
        "overview_trend_point_limit": (
            measurement.SITE_HEALTH_OVERVIEW_TREND_POINT_LIMIT
        ),
        "web_fundamentals_areas": list(measurement.WEB_FUNDAMENTALS_AREAS),
        "eligibility_critical_checkpoints": list(
            measurement.SEARCH_ELIGIBILITY_CRITICAL_CHECKPOINTS_1
        ),
        "aeo_max_evaluations": contracts.AEO_READINESS_MAX_EVALUATIONS,
        "aeo_max_evidence_pages": (
            contracts.AEO_READINESS_MAX_EVIDENCE_PAGES_PER_DIMENSION
        ),
        "content_addressable_check_ids": sorted(
            measurement.CONTENT_ADDRESSABLE_CHECK_IDS
        ),
        "content_addressable_check_fields": (
            measurement.CONTENT_ADDRESSABLE_CHECK_FIELDS
        ),
        "partial_reasons": {
            "discovery": contracts.CRAWL_PARTIAL_REASON_DISCOVERY,
            "analysis": contracts.CRAWL_PARTIAL_REASON_ANALYSIS,
            "both": contracts.CRAWL_PARTIAL_REASON_BOTH,
        },
        "measurement_versions": {
            "profile": measurement.PROFILE_VERSION,
            "schema_contract": measurement.SCHEMA_CONTRACT_VERSION,
            "presentation": measurement.PRESENTATION_VERSION,
        },
    }
