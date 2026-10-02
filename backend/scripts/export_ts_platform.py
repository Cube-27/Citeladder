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
    AI_REFERRAL_RULE_VERSION,
    AI_SOURCE_OTHER,
    ANALYTICS_TASK_KIND_INGEST_REFERRALS,
    ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH,
    REFERRAL_SANITIZE_VERSION,
    AnalyticsSettings,
)
from app.core.config.audits import (
    AUDIT_SCOPE_BRAND,
    AUDIT_STATUS_COMPLETED,
    AUDIT_STATUS_PARTIALLY_COMPLETED,
    MEASUREMENT_POLICY_KEY,
)
from app.core.config.provider_catalog import (
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
    "demo_mode",
    "demo_expires_at",
    "encryption_key",
    "referral_hash_salt",
    "dev_login_email",
    "dev_login_password",
)


def _discovery_policy() -> dict[str, Any]:
    return {
        "settings": {
            "maximum_attempts": _setting(
                "maximum_attempts", discovery_config.BrandDiscoverySettings
            )
        },
        "constants": {
            "discovery_status_queued": discovery_config.DISCOVERY_STATUS_QUEUED,
            "task_kind_brand_discovery": discovery_config.TASK_KIND_BRAND_DISCOVERY,
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
        "auth": auth_policy(),
        "site_health_runtime": site_health_runtime_policy(_setting),
        "entitlements": entitlements_policy(),
        "billing": billing_policy(_setting),
        "prompts": _prompts_policy(),
        "agent": {"run_max_attempts": agent_config.AGENT_RUN_MAX_ATTEMPTS},
    }


def _prompts_policy() -> dict[str, Any]:
    return {
        "trailing_punctuation": prompts_config.PROMPT_TRAILING_PUNCTUATION,
        "status_active": prompts_config.DEFAULT_PROMPT_STATUS,
        "topic_origin_manual": prompts_config.TOPIC_ORIGIN_MANUAL,
        "candidate": {"pending": prompts_config.CANDIDATE_DISPOSITION_PENDING},
        "origins": {"manual": projects_config.DEFAULT_PROMPT_ORIGIN},
    }


def _search_intelligence_policy() -> dict[str, Any]:
    return {
        "parser_version": search_intelligence_config.PARSER_VERSION,
        "price_version": search_intelligence_config.PRICE_VERSION,
        "transport_provider": TRANSPORT_DATAFORSEO,
        "connection_test_ok": TEST_STATUS_OK,
    }


def _visibility_policy() -> dict[str, Any]:
    """What the persisted visibility readers select, filter and bound by."""
    return {
        # Catalog order, which is also the order error messages list them in.
        "logical_engines": list(LOGICAL_ENGINES),
        "search_surface_engines": [
            engine for engine in LOGICAL_ENGINES if is_search_surface(engine)
        ],
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
    return {
        "ai_referral_analyzer_version": AI_REFERRAL_ANALYZER_VERSION,
        "ai_referral_formula_version": AI_REFERRAL_FORMULA_VERSION,
        "tasks": {
            "ingest_referrals": ANALYTICS_TASK_KIND_INGEST_REFERRALS,
            "opportunity_refresh": ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH,
        },
        "worker_settings": {
            "task_max_attempts": _setting("task_max_attempts", AnalyticsSettings)
        },
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


def _referral_policy() -> dict[str, Any]:
    return {
        "rule_version": AI_REFERRAL_RULE_VERSION,
        "analyzer_version": ANALYZER_VERSION,
        "sanitize_version": REFERRAL_SANITIZE_VERSION,
        "other_source": AI_SOURCE_OTHER,
    }


# The analytics worker knobs the TS worker reads (``ANALYTICS_`` env prefix).


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
