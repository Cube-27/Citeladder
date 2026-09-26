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
* ``packages/contracts/src/generated/error-codes.ts`` -- the machine-code
  union: every error code declared by the modules in ``ERROR_CODE_MODULES``.

``--check`` regenerates in memory and fails when a committed artifact is
stale, which is how CI keeps the two stacks from drifting.
"""

from __future__ import annotations

import argparse
import json
import sys
import types
import typing
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic.fields import FieldInfo

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
from app.core.config.api import (
    API_V1_PREFIX,
    READINESS_TIMEOUT_SECONDS,
    TS_API_SERVICE_PORT,
)
from app.core.config.errors import (
    CODE_HTTP_ERROR,
    CODE_INTERNAL_ERROR,
    RETRYABLE_STATUSES,
    STATUS_DEFAULT_CODE,
)
from app.core.config.workspaces import (
    CAPABILITY_DENIAL_MESSAGES,
    CODE_WORKSPACE_ROLE_FORBIDDEN,
)
from app.domain.workspaces.policy import WORKSPACE_ROLES, effective_capabilities
from scripts.golden_masters import GOLDEN_MASTERS
from scripts.openapi_fragments import parity_fragment

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend"
SERVICE_ROOT = FRONTEND_ROOT / "services" / "api"
CONFIG_PATH = SERVICE_ROOT / "src" / "generated" / "python-config.json"
GOLDEN_ROOT = SERVICE_ROOT / "golden"
PARITY_PATH = GOLDEN_ROOT / "openapi" / "parity.json"
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


def build_artifacts() -> dict[Path, str]:
    """Every artifact path mapped to its exact expected contents."""
    artifacts = {
        CONFIG_PATH: _render(build_config()),
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
    for orphan in set(GOLDEN_ROOT.glob("*.json")) - set(artifacts):
        orphan.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
