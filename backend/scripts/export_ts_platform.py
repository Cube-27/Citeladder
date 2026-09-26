"""Export the Python-owned inputs of the TypeScript API service.

Committed artifacts:

* ``services/api/src/generated/python-config.json`` -- the policy the TS
  service reads. ``app/core/config`` stays the policy authority (TypeScript
  migration D5); TS never restates a default, bound, error code or role matrix.
* ``services/api/golden/*.json`` -- golden masters produced by the Python
  implementation and replayed by the TS test suite, so a port is proven to
  behave the same.
* ``services/api/golden/openapi/parity.json`` -- the OpenAPI fragment
  FastAPI publishes for a fixture family, which proves the TS exporter and
  fragment normalization against Pydantic's schemas.
* ``services/api/src/generated/unicode-casefold.json`` -- where Python's
  ``str.casefold`` departs from lowercasing, which JavaScript lacks.
* ``packages/contracts/src/generated/error-codes.ts`` -- the machine-code
  union: every error code declared by the modules in ``ERROR_CODE_MODULES``.

``--freeze-family <tag>`` writes ``services/api/golden/families/<tag>.json``,
the fragment FastAPI publishes for one route family. It is run while Python
still serves the family, in the PR that moves it to TypeScript; the frozen
file is the parity target after the Python router is deleted, so ``--check``
never regenerates it.

``--check`` regenerates in memory and fails when a committed artifact is
stale, which is how CI keeps the two stacks from drifting.
"""

from __future__ import annotations

import argparse
import json
import sys
import types
import typing
import unicodedata
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic.fields import FieldInfo

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
from app.core.config import errors as error_config
from app.core.config import workspaces as workspace_config
from app.core.config.analysis import (
    VISIBILITY_EVIDENCE_DEFAULT_LIMIT,
    VISIBILITY_EVIDENCE_MAX_LIMIT,
    VISIBILITY_SELECTION_MAX_RUNS,
)
from app.core.config.analytics import (
    AI_REFERRAL_ANALYZER_VERSION,
    AI_REFERRAL_FORMULA_VERSION,
    ANALYTICS_DEFAULT_GRANULARITY,
    ANALYTICS_MAX_WINDOW_DAYS,
    ANALYTICS_PRESET_RANGE_DAYS,
    ANALYTICS_SNAPSHOT_GRANULARITIES,
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
from app.core.config.prompts import (
    ORGANIC_PROMPT_COHORTS,
    PROMPT_COHORT_CORE,
    REQUESTABLE_PROMPT_COHORTS,
)
from app.core.config.provider_catalog import LOGICAL_ENGINES, is_search_surface
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.core.config.workspaces import (
    CAPABILITY_DENIAL_MESSAGES,
    CODE_WORKSPACE_ROLE_FORBIDDEN,
)
from app.domain.workspaces.policy import WORKSPACE_ROLES, effective_capabilities
from scripts.golden_masters import GOLDEN_MASTERS
from scripts.openapi_fragments import family_fragment, parity_fragment

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend"
SERVICE_ROOT = FRONTEND_ROOT / "services" / "api"
CONFIG_PATH = SERVICE_ROOT / "src" / "generated" / "python-config.json"
CASEFOLD_PATH = SERVICE_ROOT / "src" / "generated" / "unicode-casefold.json"
GOLDEN_ROOT = SERVICE_ROOT / "golden"
PARITY_PATH = GOLDEN_ROOT / "openapi" / "parity.json"
FROZEN_FAMILIES_ROOT = GOLDEN_ROOT / "families"
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


def _env_names(name: str, field: FieldInfo) -> list[str]:
    """Environment names pydantic-settings accepts (case-insensitively)."""
    alias = field.validation_alias
    choices = getattr(alias, "choices", None) or [name]
    return list(dict.fromkeys(str(choice).upper() for choice in choices))


def _type_descriptor(annotation: Any) -> dict[str, Any]:
    if typing.get_origin(annotation) is typing.Literal:
        return {"type": "literal", "values": list(typing.get_args(annotation))}
    if isinstance(annotation, types.UnionType) and set(annotation.__args__) == {
        datetime,
        type(None),
    }:
        return {"type": "datetime", "nullable": True}
    for candidate, label in ((bool, "bool"), (int, "int"), (str, "str")):
        if annotation is candidate:
            return {"type": label}
    msg = f"Unsupported exported setting type: {annotation!r}"
    raise TypeError(msg)


def _setting(name: str) -> dict[str, Any]:
    field = Settings.model_fields[name]
    entry: dict[str, Any] = {"env": _env_names(name, field)}
    entry.update(_type_descriptor(field.annotation))
    entry["default"] = field.default
    # Pydantic records ``Field(ge=..., le=...)`` as metadata objects that
    # expose ``ge``/``le`` attributes.
    for constraint in field.metadata:
        if (minimum := getattr(constraint, "ge", None)) is not None:
            entry["minimum"] = minimum
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
    }


# The config modules whose error codes a TypeScript owner may emit: the
# generic envelope vocabulary and the workspace authorization codes. A PR that
# ports a route family adds that family's owning config module here.
ERROR_CODE_MODULES: tuple[types.ModuleType, ...] = (error_config, workspace_config)
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


def casefold_exceptions() -> dict[str, str]:
    """Characters whose ``str.casefold`` differs from ``str.lower``.

    JavaScript has no case folding, only lowercasing, so the TS service folds
    a character through this table and lowercases every other one. Keyed by
    code point (hex) so the file stays readable ASCII.
    """
    folds: dict[str, str] = {}
    for code_point in range(sys.maxunicode + 1):
        if 0xD800 <= code_point <= 0xDFFF:
            continue
        character = chr(code_point)
        if character.casefold() != character.lower():
            folds[f"{code_point:x}"] = character.casefold()
    return folds


def build_artifacts() -> dict[Path, str]:
    """Every artifact path mapped to its exact expected contents."""
    artifacts = {
        CONFIG_PATH: _render(build_config()),
        # ASCII, so the table survives any editor or encoding it passes through.
        CASEFOLD_PATH: json.dumps(
            {
                "generated_by": GENERATED_BY,
                "unicode_version": unicodedata.unidata_version,
                "folds": casefold_exceptions(),
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        ERROR_CODES_PATH: render_error_codes(),
        PARITY_PATH: _render({"generated_by": GENERATED_BY, **parity_fragment()}),
    }
    for name, build in GOLDEN_MASTERS.items():
        payload = {"name": name, "generated_by": GENERATED_BY, "cases": build()}
        artifacts[GOLDEN_ROOT / f"{name}.json"] = _render(payload)
    return artifacts


def _stale_paths(artifacts: dict[Path, str]) -> list[Path]:
    stale = [
        path
        for path, content in artifacts.items()
        if not path.exists() or path.read_text(encoding="utf-8") != content
    ]
    orphans = set(GOLDEN_ROOT.glob("*.json")) - set(artifacts)
    return stale + sorted(orphans)


def freeze_family(family: str) -> Path:
    """Write the family's current FastAPI fragment as its frozen golden."""
    # Imported here: only freezing needs the full application.
    from app.main import app

    fragment = family_fragment(app.openapi(), family)
    path = FROZEN_FAMILIES_ROOT / f"{family}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"generated_by": GENERATED_BY, **fragment}
    path.write_text(_render(payload), encoding="utf-8", newline="\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail when a committed artifact differs from a fresh export",
    )
    parser.add_argument(
        "--freeze-family",
        metavar="TAG",
        help="freeze one route family's FastAPI fragment for the parity gate",
    )
    arguments = parser.parse_args()
    if arguments.freeze_family:
        path = freeze_family(arguments.freeze_family)
        print(f"froze {path.relative_to(FRONTEND_ROOT)}")
        return 0
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
    for orphan in set(GOLDEN_ROOT.glob("*.json")) - set(artifacts):
        orphan.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
