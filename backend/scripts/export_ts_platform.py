"""Export the Python-owned inputs of the TypeScript API service.

Committed artifacts:

* ``services/api/src/generated/python-config.json`` -- the policy the TS
  service reads. ``app/core/config`` stays the policy authority (TypeScript
  migration D5); TS never restates a default, bound, error code or role matrix.
* ``packages/contracts/src/generated/error-codes.ts`` -- the machine-code
  union: every error code declared by the modules in ``ERROR_CODE_MODULES``.

``--check`` regenerates in memory and fails when a committed artifact is
stale, which is how CI keeps the two stacks from drifting.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
import types
import typing
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic.fields import FieldInfo
from pydantic_settings import BaseSettings

from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    SUCCESSFUL_OUTCOMES,
)
from app.core.config import (
    DEVELOPMENT_ENV_NAMES,
    INSECURE_SECRET_DEFAULTS,
    SECRET_MIN_BYTES,
    SECRET_MIN_UNIQUE_CHARS,
    WEAK_SECRET_WORDS,
    Settings,
)
from app.core.config import brand_logos as brand_logo_config
from app.core.config import brand_profile as brand_profile_config
from app.core.config import commerce_catalog as commerce_config
from app.core.config import demand as demand_config
from app.core.config import errors as error_config
from app.core.config import observed_competitors as observed_config
from app.core.config import opportunities as opportunities_config
from app.core.config import search_intelligence as search_intelligence_config
from app.core.config import site_health_content_structure as content_structure_config
from app.core.config import workspaces as workspace_config
from app.core.config.abuse import AbuseSettings
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
    ANALYTICS_PYTHON_TASK_KINDS,
    ANALYTICS_SNAPSHOT_GRANULARITIES,
    ANALYTICS_SNAPSHOT_WINDOW_DAYS,
    ANALYTICS_TASK_KIND_SEARCH_INTELLIGENCE,
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
from app.core.config.errors import (
    CODE_HTTP_ERROR,
    CODE_INTERNAL_ERROR,
    RETRYABLE_STATUSES,
    STATUS_DEFAULT_CODE,
)
from app.core.config.integrations_datasets import (
    DATASET_GA4_REFERRER_DAILY,
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DIMENSION_KEY_SEPARATOR,
    INTEGRATION_DATASET_TEMPLATES,
)
from app.core.config.projects import MAX_PROJECT_COMPETITORS
from app.core.config.prompts import (
    ORGANIC_PROMPT_COHORTS,
    PROMPT_COHORT_CORE,
    REQUESTABLE_PROMPT_COHORTS,
)
from app.core.config.provider_catalog import (
    ERROR_UNKNOWN,
    LOGICAL_ENGINES,
    TEST_STATUS_OK,
    TRANSPORT_DATAFORSEO,
    is_search_surface,
)
from app.core.config.task_queue import (
    ERROR_MAX_ATTEMPTS,
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
from app.core.config.workspaces import (
    CAPABILITY_DENIAL_MESSAGES,
    CODE_WORKSPACE_ROLE_FORBIDDEN,
)
from app.domain.workspaces.policy import WORKSPACE_ROLES, effective_capabilities
from scripts.opportunity_policy import opportunity_policy
from scripts.traffic_policy import demand_policy, traffic_policy

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend"
SERVICE_ROOT = FRONTEND_ROOT / "services" / "api"
CONFIG_PATH = SERVICE_ROOT / "src" / "generated" / "python-config.json"
CONTRACTS_ROOT = FRONTEND_ROOT / "packages" / "contracts"
ERROR_CODES_PATH = CONTRACTS_ROOT / "src" / "generated" / "error-codes.ts"
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
    "demo_mode",
    "demo_expires_at",
)


def _env_names(name: str, field: FieldInfo, prefix: str = "") -> list[str]:
    """Environment names pydantic-settings accepts (case-insensitively)."""
    alias = field.validation_alias
    choices = getattr(alias, "choices", None) or [f"{prefix}{name}"]
    return list(dict.fromkeys(str(choice).upper() for choice in choices))


def _type_descriptor(annotation: Any) -> dict[str, Any]:
    if typing.get_origin(annotation) is typing.Literal:
        return {"type": "literal", "values": list(typing.get_args(annotation))}
    if isinstance(annotation, types.UnionType) and set(annotation.__args__) == {
        datetime,
        type(None),
    }:
        return {"type": "datetime", "nullable": True}
    for candidate, label in (
        (bool, "bool"),
        (int, "int"),
        (float, "float"),
        (str, "str"),
    ):
        if annotation is candidate:
            return {"type": label}
    msg = f"Unsupported exported setting type: {annotation!r}"
    raise TypeError(msg)


def _setting(name: str, model: type[BaseSettings] = Settings) -> dict[str, Any]:
    field = model.model_fields[name]
    prefix = str(model.model_config.get("env_prefix") or "")
    entry: dict[str, Any] = {"env": _env_names(name, field, prefix)}
    entry.update(_type_descriptor(field.annotation))
    entry["default"] = field.default
    # Pydantic records ``Field(ge=..., gt=..., le=...)`` as metadata objects
    # that expose those attributes.
    for constraint in field.metadata:
        if (minimum := getattr(constraint, "ge", None)) is not None:
            entry["minimum"] = minimum
        if (exclusive := getattr(constraint, "gt", None)) is not None:
            entry["exclusive_minimum"] = exclusive
        if (maximum := getattr(constraint, "le", None)) is not None:
            entry["maximum"] = maximum
    return entry


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
        },
        "api": {
            "prefix": API_V1_PREFIX,
            "readiness_timeout_seconds": READINESS_TIMEOUT_SECONDS,
            "service_port": TS_API_SERVICE_PORT,
        },
        "errors": {
            "status_default_code": {
                str(status): code
                for status, code in sorted(STATUS_DEFAULT_CODE.items())
            },
            "fallback_code": CODE_HTTP_ERROR,
            "internal_error_code": CODE_INTERNAL_ERROR,
            "retryable_statuses": sorted(RETRYABLE_STATUSES),
        },
        "workspaces": {
            "roles": {
                role: list(effective_capabilities(role)) for role in WORKSPACE_ROLES
            },
            "forbidden_code": CODE_WORKSPACE_ROLE_FORBIDDEN,
            "denial_messages": dict(CAPABILITY_DENIAL_MESSAGES),
        },
        "visibility": _visibility_policy(),
        "analytics": _analytics_policy(),
        "task_queue": _task_queue_policy(),
        "referrals": _referral_policy(),
        "traffic": traffic_policy(),
        "demand": demand_policy(),
        "opportunity": opportunity_policy(),
        "search_intelligence": _search_intelligence_policy(),
        "content_structure": {
            name.removeprefix("CONTENT_STRUCTURE_").lower(): value
            for name, value in vars(content_structure_config).items()
            if name.startswith("CONTENT_STRUCTURE_")
        },
        "brand_identity": _brand_identity_policy(),
        "commerce": {
            "import_max_bytes": commerce_config.COMMERCE_IMPORT_MAX_BYTES,
            "import_max_rows": commerce_config.COMMERCE_IMPORT_MAX_ROWS,
            "import_error_limit": commerce_config.COMMERCE_IMPORT_ERROR_LIMIT,
            "importer_version": commerce_config.COMMERCE_IMPORTER_VERSION,
            "projector_version": commerce_config.COMMERCE_PROJECTOR_VERSION,
            "breadcrumb_index_names": sorted(
                commerce_config.COMMERCE_BREADCRUMB_INDEX_NAMES
            ),
            "price_markers": commerce_config.COMMERCE_VISIBLE_PRICE_CURRENCY_MARKERS,
            "ambiguous_price_tokens": (
                commerce_config.COMMERCE_VISIBLE_PRICE_AMBIGUOUS_TOKENS
            ),
        },
        "abuse": {
            "active_job_retry_after_seconds": _setting(
                "active_job_retry_after_seconds", AbuseSettings
            )
        },
    }


def _brand_identity_policy() -> dict[str, Any]:
    """Bounds and tokens for brand-profile, business-map and suggestion writes."""
    profile = brand_profile_config
    return {
        "profile_fields": list(profile.BRAND_PROFILE_FIELDS),
        "profile_text_max_chars": profile.BRAND_PROFILE_TEXT_MAX_CHARS,
        "profile_product_max_chars": profile.BRAND_PROFILE_PRODUCT_MAX_CHARS,
        "profile_products_max_count": profile.BRAND_PROFILE_PRODUCTS_MAX_COUNT,
        "profile_source_manual": profile.BRAND_PROFILE_SOURCE_MANUAL,
        "profile_review_confirmed": profile.BRAND_PROFILE_REVIEW_CONFIRMED,
        "profile_review_edited": profile.BRAND_PROFILE_REVIEW_EDITED,
        "map_value_max_chars": profile.BUSINESS_MAP_VALUE_MAX_CHARS,
        "map_max_entries_per_dimension": (
            profile.BUSINESS_MAP_MAX_ENTRIES_PER_DIMENSION
        ),
        "map_max_exclusions": profile.BUSINESS_MAP_MAX_EXCLUSIONS,
        "max_project_competitors": MAX_PROJECT_COMPETITORS,
        "suggestion_pending": observed_config.STATUS_PENDING,
        "suggestion_accepted": observed_config.STATUS_ACCEPTED,
        "logo_ready": brand_logo_config.BRAND_LOGO_STATUS_READY,
        "logo_cache_max_age_seconds": (
            brand_logo_config.BRAND_LOGO_CACHE_MAX_AGE_SECONDS
        ),
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
        "python_task_kinds": sorted(ANALYTICS_PYTHON_TASK_KINDS),
        "worker_settings": {
            name: _setting(name, AnalyticsSettings)
            for name in ANALYTICS_WORKER_SETTINGS
        },
        "executor_not_wired_error": ERROR_EXECUTOR_NOT_WIRED,
        "retry_error": ERROR_UNKNOWN,
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
        "terminal": sorted(TASK_TERMINAL_STATUSES),
        "max_attempts_error": ERROR_MAX_ATTEMPTS,
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
)


# The config modules whose error codes a TypeScript owner may emit: the
# generic envelope vocabulary and the workspace authorization codes. A PR that
# ports a route family adds that family's owning config module here.
ERROR_CODE_MODULES: tuple[types.ModuleType, ...] = (
    error_config,
    workspace_config,
    demand_config,
    opportunities_config,
    search_intelligence_config,
    commerce_config,
)
_ERROR_CODE_PREFIXES = ("CODE_", "ERROR_")


def error_codes(modules: Iterable[types.ModuleType] = ERROR_CODE_MODULES) -> list[str]:
    """Every ``CODE_*``/``ERROR_*`` string constant the modules declare."""
    codes = {
        value
        for module in modules
        for name, value in vars(module).items()
        if name.startswith(_ERROR_CODE_PREFIXES) and isinstance(value, str)
    }
    return sorted(codes)


def render_error_codes() -> str:
    """The union as TypeScript source (excluded from formatting, byte-checked)."""
    modules = ", ".join(f"`{module.__name__}`" for module in ERROR_CODE_MODULES)
    lines = [
        f"// Generated by {GENERATED_BY}; do not edit.",
        f"// Error codes declared by {modules}.",
        "export const API_ERROR_CODES = [",
        *(f"  {json.dumps(code)}," for code in error_codes()),
        "] as const;",
        "",
        "export type ApiErrorCode = (typeof API_ERROR_CODES)[number];",
    ]
    return "\n".join(lines) + "\n"


def _render(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def build_artifacts() -> dict[Path, str]:
    """Every artifact path mapped to its exact expected contents."""
    artifacts = {
        CONFIG_PATH: _render(build_config()),
        ERROR_CODES_PATH: render_error_codes(),
    }
    return artifacts


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
