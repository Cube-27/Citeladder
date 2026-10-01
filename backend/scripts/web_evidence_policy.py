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
from app.core.config import site_health_link_metrics as links
from app.core.config import site_health_measurement as measurement
from app.core.config import site_health_rules as rules
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
from app.core.config.site_health_runtime import SiteHealthSettings
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
        },
    }


def _read_policy() -> dict[str, Any]:
    """What the TypeScript Site Health read API projects from."""
    return {
        "terminal_crawl_statuses": sorted(contracts.CRAWL_TERMINAL_STATUSES),
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
        "content_addressable_check_ids": sorted(
            measurement.CONTENT_ADDRESSABLE_CHECK_IDS
        ),
        "measurement_versions": {
            "profile": measurement.PROFILE_VERSION,
            "schema_contract": measurement.SCHEMA_CONTRACT_VERSION,
            "presentation": measurement.PRESENTATION_VERSION,
        },
        "changes": {
            "analyzer_version": change_intel.CHANGE_ANALYZER_VERSION,
            "default_limit": change_intel.CHANGE_DEFAULT_LIMIT,
            "max_limit": change_intel.CHANGE_MAX_LIMIT,
            "unavailable_state": change_intel.CHANGE_STATE_UNAVAILABLE,
        },
    }
