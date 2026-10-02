"""Export the Python-owned inputs of the TypeScript API service.

The shared policy bridge is committed at
``services/api/src/generated/python-config.json``. Python owns only values
still read by its models, operators or bootstrap; TS-only policy and the API
error vocabulary have native owners.

``--check`` regenerates in memory and fails when the committed artifact is
stale, which keeps genuinely shared values from drifting.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path
from typing import Any

from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    SUCCESSFUL_OUTCOMES,
)
from app.core.config import (
    DEVELOPMENT_ENV_NAMES,
    INSECURE_SECRET_DEFAULTS,
    LOGIN_PASSWORD_MAX_CHARS,
    LOGIN_PASSWORD_MIN_CHARS,
    LOGIN_PASSWORD_MIN_UNIQUE_CHARS,
    LOGIN_PASSWORD_WEAK_WORDS,
    SECRET_MIN_BYTES,
    SECRET_MIN_UNIQUE_CHARS,
    WEAK_SECRET_WORDS,
)
from app.core.config import agent as agent_config
from app.core.config import brand_discovery as discovery_config
from app.core.config import commerce_catalog as commerce_config
from app.core.config import dataforseo as search_config
from app.core.config import projects as projects_config
from app.core.config import prompts as prompts_config
from app.core.config import search_intelligence as search_intelligence_config
from app.core.config import site_health_contracts as site_contracts
from app.core.config import site_health_crawl_policy as site_crawl
from app.core.config.analysis import (
    ANALYZER_VERSION,
    VISIBILITY_EVIDENCE_DEFAULT_LIMIT,
    VISIBILITY_EVIDENCE_MAX_LIMIT,
    VISIBILITY_SELECTION_MAX_RUNS,
    VISIBILITY_TREND_DEFAULT_GRANULARITY,
    VISIBILITY_TREND_GRANULARITIES,
    VISIBILITY_TREND_MAX_POINTS,
)
from app.core.config.analytics import (
    AI_REFERRAL_ANALYZER_VERSION,
    AI_REFERRAL_FORMULA_VERSION,
    AI_REFERRAL_HOST_RULES,
    AI_REFERRAL_RULE_VERSION,
    AI_REFERRAL_UA_RULES,
    AI_REFERRAL_UTM_RULES,
    AI_SOURCE_OTHER,
    AI_SOURCE_TO_LOGICAL_ENGINE,
    ANALYTICS_DEFAULT_GRANULARITY,
    ANALYTICS_MAX_WINDOW_DAYS,
    ANALYTICS_PRESET_RANGE_DAYS,
    ANALYTICS_SNAPSHOT_GRANULARITIES,
    ANALYTICS_SNAPSHOT_WINDOW_DAYS,
    ANALYTICS_TASK_KIND_SEARCH_INTELLIGENCE,
    ANALYTICS_TASK_KINDS,
    ANALYTICS_TERMINAL_COMPENSATION_BATCH,
    ANALYTICS_TERMINAL_COMPENSATION_MAX_FAILURES,
    ANALYTICS_TS_OWNED_TASK_KINDS,
    ERROR_EXECUTOR_NOT_WIRED,
    MATCH_SIGNAL_REFERRER,
    MATCH_SIGNAL_USER_AGENT,
    MATCH_SIGNAL_UTM,
    REFERRAL_RAW_ALLOWLIST,
    REFERRAL_RETENTION_DAYS,
    REFERRAL_SANITIZE_VERSION,
    REFERRAL_URL_PARAM_ALLOWLIST,
    REFERRAL_URL_PARAM_ALLOWLIST_PREFIXES,
    AnalyticsSettings,
)
from app.core.config.api import (
    API_V1_PREFIX,
    READINESS_TIMEOUT_SECONDS,
    TS_API_SERVICE_PORT,
)
from app.core.config.audits import (
    AUDIT_SCOPE_BRAND,
    AUDIT_STATUS_COMPLETED,
    AUDIT_STATUS_PARTIALLY_COMPLETED,
    MEASUREMENT_POLICY_KEY,
)
from app.core.config.http import (
    API_REQUEST_BODY_MAX_BYTES,
    IMPORT_BODY_MAX_BYTES,
    PROMPT_IMPORT_MAX_ROWS,
    PROMPT_INTENT_MAX_CHARS,
    PROMPT_TEXT_MAX_CHARS,
    PROMPT_TEXT_MIN_WORDS,
    PROMPT_THEME_MAX_CHARS,
    TOPIC_NAME_MAX_CHARS,
)
from app.core.config.integrations_datasets import (
    DATASET_GA4_REFERRER_DAILY,
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DIMENSION_KEY_SEPARATOR,
    INTEGRATION_DATASET_TEMPLATES,
)
from app.core.config.projects import (
    PROMPT_INTENTS,
    PROMPT_ORIGIN_GENERATED,
    PROMPT_ORIGIN_IMPORTED,
    PROMPT_ORIGIN_MANUAL,
)
from app.core.config.prompts import (
    ORGANIC_PROMPT_COHORTS,
    PROMPT_COHORT_CORE,
    REQUESTABLE_PROMPT_COHORTS,
    PromptGenerationSettings,
)
from app.core.config.provider_catalog import (
    ERROR_UNKNOWN,
    LOGICAL_ENGINES,
    TEST_STATUS_OK,
    TRANSPORT_DATAFORSEO,
    is_search_surface,
)
from app.core.config.site_health_page_kinds import PAGE_KIND_OTHER
from app.core.config.task_queue import (
    DEFAULT_MAX_DRAIN_BATCHES,
    ERROR_MAX_ATTEMPTS,
    TASK_ACTIVE_STATUSES,
    TASK_CLAIMABLE_STATUSES,
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_LEASED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_RETRY_WAIT,
    TASK_STATUS_RUNNING,
    TASK_STATUS_SUCCEEDED,
    TASK_TERMINAL_STATUSES,
)
from scripts.auth_policy import (
    auth_policy,
    site_health_runtime_policy,
    workspace_policy,
)
from scripts.opportunity_policy import opportunity_policy
from scripts.traffic_policy import demand_policy, traffic_policy
from scripts.ts_platform_audits import audit_policy, audit_schedule_policy
from scripts.ts_platform_billing import billing_policy, entitlements_policy
from scripts.ts_platform_costs import costs_policy
from scripts.ts_platform_dataforseo import dataforseo_policy
from scripts.ts_platform_identity import brand_identity_policy
from scripts.ts_platform_integrations import integration_policy
from scripts.ts_platform_providers import provider_policy
from scripts.ts_settings_policy import setting as _setting

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend"
SERVICE_ROOT = FRONTEND_ROOT / "services" / "api"
CONFIG_PATH = SERVICE_ROOT / "src" / "generated" / "python-config.json"
GENERATED_BY = "backend/scripts/export_ts_platform.py"

# Settings the TS service consumes. Secrets are exported only as their
# public placeholder defaults; real values arrive through the environment.
EXPORTED_SETTINGS = (
    "app_name",
    "app_env",
    "database_url",
    "db_pool_size",
    "db_max_overflow",
    "db_pool_recycle_seconds",
    "db_pool_timeout_seconds",
    "db_connect_timeout_seconds",
    "db_command_timeout_seconds",
    "db_statement_timeout_ms",
    "db_lock_timeout_ms",
    "db_idle_transaction_timeout_ms",
    "db_ssl_mode",
    "request_id_header",
    "jwt_secret_key",
    "jwt_algorithm",
    "session_cookie_name",
    "jwt_expire_hours",
    "public_signup_enabled",
    "frontend_url",
    "trusted_proxy_cidrs",
    "integration_google_client_id",
    "integration_google_client_secret",
    "demo_mode",
    "demo_expires_at",
    "encryption_key",
    "referral_hash_salt",
    "integration_microsoft_client_id",
    "integration_microsoft_client_secret",
    "dev_login_email",
    "dev_login_password",
)


def _discovery_policy() -> dict[str, Any]:
    return {
        "settings": {
            name: _setting(name, discovery_config.BrandDiscoverySettings)
            for name in discovery_config.BrandDiscoverySettings.model_fields
        },
        "constants": {
            name.lower(): sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(discovery_config).items()
            if name.isupper()
            and isinstance(value, (str, int, float, tuple, dict, frozenset))
        },
    }


def build_config() -> dict[str, Any]:
    """The policy export, in a stable key order."""
    return {
        "generated_by": GENERATED_BY,
        "settings": {name: _setting(name) for name in EXPORTED_SETTINGS},
        "development_env_names": sorted(DEVELOPMENT_ENV_NAMES),
        "secret_policy": {
            "min_bytes": SECRET_MIN_BYTES,
            "min_unique_chars": SECRET_MIN_UNIQUE_CHARS,
            "insecure_values": sorted(INSECURE_SECRET_DEFAULTS),
            "weak_words": sorted(WEAK_SECRET_WORDS),
            "login_password": {
                "min_chars": LOGIN_PASSWORD_MIN_CHARS,
                "max_chars": LOGIN_PASSWORD_MAX_CHARS,
                "min_unique_chars": LOGIN_PASSWORD_MIN_UNIQUE_CHARS,
                "weak_words": sorted(LOGIN_PASSWORD_WEAK_WORDS),
            },
        },
        "api": {
            "prefix": API_V1_PREFIX,
            "readiness_timeout_seconds": READINESS_TIMEOUT_SECONDS,
            "service_port": TS_API_SERVICE_PORT,
            "request_body_max_bytes": API_REQUEST_BODY_MAX_BYTES,
        },
        "workspaces": workspace_policy(),
        "visibility": _visibility_policy(),
        "analytics": _analytics_policy(),
        "task_queue": _task_queue_policy(),
        "referrals": _referral_policy(),
        "traffic": traffic_policy(),
        "demand": demand_policy(),
        "integrations": integration_policy(_setting),
        "providers": provider_policy(_setting),
        "dataforseo": dataforseo_policy(_setting),
        "costs": costs_policy(),
        "audits": audit_policy(_setting),
        "opportunity": opportunity_policy(),
        "search_intelligence": _search_intelligence_policy(),
        "site_health": {
            "model_defaults": {"page_kind_other": PAGE_KIND_OTHER},
            "crawl": {"frontier_statuses": {"pending": site_crawl.FRONTIER_PENDING}},
            "reads": {
                "terminal_crawl_statuses": sorted(
                    site_contracts.CRAWL_TERMINAL_STATUSES
                )
            },
        },
        "brand_identity": brand_identity_policy(),
        "projects": {
            "default_benchmark_mode": projects_config.DEFAULT_BENCHMARK_MODE,
            "default_repetitions": projects_config.DEFAULT_REPETITIONS,
            "min_repetitions": projects_config.MIN_REPETITIONS,
            "max_repetitions": projects_config.MAX_REPETITIONS,
            "location_codes": search_config.LOCATION_CODES,
            "language_codes": sorted(search_config.LANGUAGE_CODES),
            "prompt_set_name": prompts_config.ONBOARDING_PROMPT_SET_NAME,
        },
        "audit_schedules": audit_schedule_policy(),
        "discovery": _discovery_policy(),
        "commerce": {
            "discovery": {
                "provider_version": (
                    commerce_config.COMMERCE_COMPETITOR_PROVIDER_VERSION
                ),
                "validator_version": (
                    commerce_config.COMMERCE_COMPETITOR_VALIDATOR_VERSION
                ),
            },
            "buyer_prompts": {
                "version": commerce_config.COMMERCE_PROMPT_TEMPLATE_VERSION
            },
            "importer_version": commerce_config.COMMERCE_IMPORTER_VERSION,
            "projector_version": commerce_config.COMMERCE_PROJECTOR_VERSION,
        },
        "auth": auth_policy(_setting),
        "site_health_runtime": site_health_runtime_policy(_setting),
        "entitlements": entitlements_policy(),
        "billing": billing_policy(_setting),
        "prompts": _prompts_policy(),
        "models": {
            "gateway": {
                name: _setting(name, agent_config.DefaultAgentSettings)
                for name in agent_config.DefaultAgentSettings.model_fields
            },
            "max_attempts": agent_config.GENERATION_PROVIDER_MAX_ATTEMPTS,
        },
        "agent": _agent_policy(),
    }


def _agent_policy() -> dict[str, str | int | float]:
    """Agent core bounds and versions; destinations remain model-owner settings."""
    return {
        name.removeprefix("AGENT_").lower(): value
        for name, value in vars(agent_config).items()
        if name.startswith("AGENT_") and isinstance(value, (str, int, float))
    }


# The review and retention knobs the TS prompt owner reads (``GENERATION_*``).
PROMPT_GENERATION_SETTINGS = tuple(PromptGenerationSettings.model_fields)


def _prompts_policy() -> dict[str, Any]:
    """Prompt, topic and candidate vocabulary and bounds for the TS owner."""
    cfg = prompts_config
    return {
        "locks": {
            "project": {
                "namespace": cfg.PROJECT_LOCK_NAMESPACE,
                "person": cfg.PROMPT_LOCK_PERSON,
            },
            "prompt_set": {
                "namespace": cfg.PROMPT_SET_LOCK_NAMESPACE,
                "person": cfg.PROMPT_LOCK_PERSON,
            },
        },
        "trailing_punctuation": cfg.PROMPT_TRAILING_PUNCTUATION,
        "text_max_chars": PROMPT_TEXT_MAX_CHARS,
        "text_min_words": PROMPT_TEXT_MIN_WORDS,
        "theme_max_chars": PROMPT_THEME_MAX_CHARS,
        "intent_max_chars": PROMPT_INTENT_MAX_CHARS,
        "topic_name_max_chars": TOPIC_NAME_MAX_CHARS,
        "import_max_rows": PROMPT_IMPORT_MAX_ROWS,
        "import_max_bytes": IMPORT_BODY_MAX_BYTES,
        "intents": sorted(PROMPT_INTENTS),
        "branded_cohorts": sorted(
            {cfg.PROMPT_COHORT_COMPARISON, cfg.PROMPT_COHORT_BRAND_DIAGNOSTIC}
        ),
        "status_active": cfg.PROMPT_STATUS_ACTIVE,
        "origins": {
            "manual": PROMPT_ORIGIN_MANUAL,
            "imported": PROMPT_ORIGIN_IMPORTED,
            "generated": PROMPT_ORIGIN_GENERATED,
        },
        "topic_origin_manual": cfg.TOPIC_ORIGIN_MANUAL,
        "candidate": {
            "pending": cfg.CANDIDATE_DISPOSITION_PENDING,
            "accepted": cfg.CANDIDATE_DISPOSITION_ACCEPTED,
            "rejected": cfg.CANDIDATE_DISPOSITION_REJECTED,
            "outcomes": sorted(cfg.CANDIDATE_OUTCOME_DISPOSITIONS),
        },
        "generation_settings": {
            name: _setting(name, PromptGenerationSettings)
            for name in PROMPT_GENERATION_SETTINGS
        },
        "binding": {
            "min_token_chars": cfg.TOPICAL_BINDING_MIN_TOKEN_CHARS,
            "min_dense_token_chars": cfg.TOPICAL_BINDING_MIN_DENSE_TOKEN_CHARS,
            "stopwords": sorted(cfg.TOPICAL_BINDING_STOPWORDS),
            "business_context_fields": list(
                cfg.PROMPT_GROUNDING_BUSINESS_CONTEXT_FIELDS
            ),
            "accepted": cfg.BINDING_CODE_ACCEPTED,
            "off_topic": cfg.CODE_PROMPT_OFF_TOPIC,
            "vocabulary_empty": cfg.CODE_BINDING_VOCABULARY_EMPTY,
        },
    }


def _search_intelligence_policy() -> dict[str, Any]:
    """What Search Intelligence confirms, reads and sorts by."""
    si = search_intelligence_config
    return {
        "task_kind": ANALYTICS_TASK_KIND_SEARCH_INTELLIGENCE,
        "price_version": si.PRICE_VERSION,
        "transport_provider": TRANSPORT_DATAFORSEO,
        "connection_test_ok": TEST_STATUS_OK,
        "default_research_scope": si.DEFAULT_RESEARCH_SCOPE,
        "default_depths": dict(si.DEFAULT_DEPTHS),
        "max_depth": si.MAX_SAFE_DEPTH,
        "endpoints": dict(si.ENDPOINTS),
        "broad_endpoints": dict(si.BROAD_ENDPOINTS),
        "list_kinds": sorted(si.LIST_KINDS),
        "labs_kinds": sorted(si.LABS_KINDS),
        "backlink_kinds": sorted(si.BACKLINK_KINDS),
        "parser_version": si.PARSER_VERSION,
        "page_size": si.PROVIDER_PAGE_SIZE,
        "provider_timeout_seconds": si.PROVIDER_TIMEOUT_SECONDS,
        "provider_max_response_bytes": si.PROVIDER_MAX_RESPONSE_BYTES,
        "maintenance_batch_size": si.MAINTENANCE_BATCH_SIZE,
        "backlink_max_offset": si.BACKLINK_MAX_OFFSET,
        "keyword_acquisition_fields": dict(si.KEYWORD_ACQUISITION_FIELDS),
        "history_days": si.HISTORY_DAYS,
        "history_max_observations": si.HISTORY_MAX_OBSERVATIONS,
        "reuse_days": si.REUSE_DAYS,
        "review_ttl_seconds": si.REVIEW_TTL_SECONDS,
        "rate_limit_retries": si.RATE_LIMIT_RETRIES,
        "rate_limit_default_wait_seconds": si.RATE_LIMIT_DEFAULT_WAIT_SECONDS,
        "rate_limit_max_wait_seconds": si.RATE_LIMIT_MAX_WAIT_SECONDS,
        "rates": {
            "labs_task": str(si.LABS_TASK_USD),
            "labs_item": str(si.LABS_ITEM_USD),
            "backlinks_request": str(si.BACKLINKS_REQUEST_USD),
            "backlinks_row": str(si.BACKLINKS_ROW_USD),
        },
        "row_sort_fields": sorted(si.ROW_SORT_FIELDS),
        "auxiliary_sort_fields": sorted(si.AUXILIARY_SORT_FIELDS),
    }


def _visibility_policy() -> dict[str, Any]:
    """What the persisted visibility readers select, filter and bound by."""
    return {
        # Catalog order, which is also the order error messages list them in.
        "logical_engines": list(LOGICAL_ENGINES),
        "search_surface_engines": [
            engine for engine in LOGICAL_ENGINES if is_search_surface(engine)
        ],
        "core_cohort": PROMPT_COHORT_CORE,
        "organic_cohorts": sorted(ORGANIC_PROMPT_COHORTS),
        "requestable_cohorts": sorted(REQUESTABLE_PROMPT_COHORTS),
        "dashboard_audit_statuses": [
            AUDIT_STATUS_COMPLETED,
            AUDIT_STATUS_PARTIALLY_COMPLETED,
        ],
        "brand_audit_scope": AUDIT_SCOPE_BRAND,
        "succeeded_task_status": TASK_STATUS_SUCCEEDED,
        "measurement_policy_key": MEASUREMENT_POLICY_KEY,
        "selection_max_runs": VISIBILITY_SELECTION_MAX_RUNS,
        "evidence_default_limit": VISIBILITY_EVIDENCE_DEFAULT_LIMIT,
        "evidence_max_limit": VISIBILITY_EVIDENCE_MAX_LIMIT,
        "trend_granularities": sorted(VISIBILITY_TREND_GRANULARITIES),
        "trend_default_granularity": VISIBILITY_TREND_DEFAULT_GRANULARITY,
        "trend_max_points": VISIBILITY_TREND_MAX_POINTS,
        "overview_present_outcome": OUTCOME_AI_OVERVIEW_PRESENT,
        "successful_outcomes": sorted(SUCCESSFUL_OUTCOMES),
    }


def _analytics_policy() -> dict[str, Any]:
    """The AI Referrals read vocabulary and the snapshot versions it serves."""
    return {
        "default_granularity": ANALYTICS_DEFAULT_GRANULARITY,
        "snapshot_granularities": sorted(ANALYTICS_SNAPSHOT_GRANULARITIES),
        "max_window_days": ANALYTICS_MAX_WINDOW_DAYS,
        "preset_range_days": dict(ANALYTICS_PRESET_RANGE_DAYS),
        "ai_referral_analyzer_version": AI_REFERRAL_ANALYZER_VERSION,
        "ai_referral_formula_version": AI_REFERRAL_FORMULA_VERSION,
        "snapshot_window_days": list(ANALYTICS_SNAPSHOT_WINDOW_DAYS),
        "ts_owned_task_kinds": sorted(ANALYTICS_TS_OWNED_TASK_KINDS),
        "task_kinds": sorted(ANALYTICS_TASK_KINDS),
        "worker_settings": {
            name: _setting(name, AnalyticsSettings)
            for name in ANALYTICS_WORKER_SETTINGS
        },
        "executor_not_wired_error": ERROR_EXECUTOR_NOT_WIRED,
        "retry_error": ERROR_UNKNOWN,
        "terminal_compensation_batch": ANALYTICS_TERMINAL_COMPENSATION_BATCH,
        "terminal_compensation_max_failures": (
            ANALYTICS_TERMINAL_COMPENSATION_MAX_FAILURES
        ),
    }


def _task_queue_policy() -> dict[str, Any]:
    """The shared queue-row status vocabulary the TS claim and finalize write."""
    return {
        "statuses": {
            "queued": TASK_STATUS_QUEUED,
            "leased": TASK_STATUS_LEASED,
            "running": TASK_STATUS_RUNNING,
            "retry_wait": TASK_STATUS_RETRY_WAIT,
            "succeeded": TASK_STATUS_SUCCEEDED,
            "failed": TASK_STATUS_FAILED,
            "cancelled": TASK_STATUS_CANCELLED,
        },
        "claimable": sorted(TASK_CLAIMABLE_STATUSES),
        "active": sorted(TASK_ACTIVE_STATUSES),
        "terminal": sorted(TASK_TERMINAL_STATUSES),
        "max_attempts_error": ERROR_MAX_ATTEMPTS,
        "max_drain_batches": DEFAULT_MAX_DRAIN_BATCHES,
    }


_REFERRAL_DATASETS = (DATASET_GA4_REFERRER_DAILY, DATASET_GA4_SOURCE_MEDIUM_DAILY)


def _referral_policy() -> dict[str, Any]:
    """The referral chain's rule tables, redaction contract and versions."""
    return {
        "rule_version": AI_REFERRAL_RULE_VERSION,
        "analyzer_version": ANALYZER_VERSION,
        "sanitize_version": REFERRAL_SANITIZE_VERSION,
        "other_source": AI_SOURCE_OTHER,
        "source_to_logical_engine": dict(AI_SOURCE_TO_LOGICAL_ENGINE),
        "match_signals": {
            "referrer": MATCH_SIGNAL_REFERRER,
            "utm": MATCH_SIGNAL_UTM,
            "user_agent": MATCH_SIGNAL_USER_AGENT,
        },
        # Config order is the priority order within each tier.
        "host_rules": [dataclasses.asdict(rule) for rule in AI_REFERRAL_HOST_RULES],
        "utm_rules": [dataclasses.asdict(rule) for rule in AI_REFERRAL_UTM_RULES],
        "ua_rules": [dataclasses.asdict(rule) for rule in AI_REFERRAL_UA_RULES],
        "raw_allowlist": sorted(REFERRAL_RAW_ALLOWLIST),
        "url_param_allowlist": sorted(REFERRAL_URL_PARAM_ALLOWLIST),
        "url_param_allowlist_prefixes": list(REFERRAL_URL_PARAM_ALLOWLIST_PREFIXES),
        "retention_days": REFERRAL_RETENTION_DAYS,
        "datasets": {
            "referrer_daily": DATASET_GA4_REFERRER_DAILY,
            "source_medium_daily": DATASET_GA4_SOURCE_MEDIUM_DAILY,
        },
        "dimension_key_separator": DIMENSION_KEY_SEPARATOR,
        "dimension_arity": {
            dataset: len(INTEGRATION_DATASET_TEMPLATES[dataset].dimensions)
            for dataset in _REFERRAL_DATASETS
        },
    }


# The analytics worker knobs the TS worker reads (``ANALYTICS_`` env prefix).
ANALYTICS_WORKER_SETTINGS = (
    "lease_ttl_seconds",
    "heartbeat_interval_seconds",
    "task_max_attempts",
    "poll_interval_seconds",
    "retry_delay_seconds",
    "lease_reclaim_batch_size",
    "drain_budget_seconds",
)


def build_artifacts() -> dict[Path, str]:
    """Every artifact path mapped to its exact expected contents."""
    return {
        CONFIG_PATH: json.dumps(build_config(), indent=2, ensure_ascii=False) + "\n",
    }


def _stale_paths(artifacts: dict[Path, str]) -> list[Path]:
    return [
        path
        for path, content in artifacts.items()
        if not path.exists() or path.read_text(encoding="utf-8") != content
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail when a committed artifact differs from a fresh export",
    )
    arguments = parser.parse_args()
    artifacts = build_artifacts()
    if arguments.check:
        stale = _stale_paths(artifacts)
        for path in stale:
            print(f"stale: {path.relative_to(FRONTEND_ROOT)}", file=sys.stderr)
        if stale:
            print(
                "Run `python -m scripts.export_ts_platform` in backend/ and commit.",
                file=sys.stderr,
            )
            return 1
        return 0
    for path, content in artifacts.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
