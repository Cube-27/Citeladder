"""Audit policy inputs; selection and execution remain application decisions."""

from app.core.config import (
    Settings,
    audits,
    commerce_catalog,
    projects,
    provider_catalog,
)
from app.orchestration.audit_state import _ALLOWED_TRANSITIONS


def audit_policy(setting):
    return {
        "dev_test_allow_platform": setting(
            "dev_test_login_allow_platform_credentials", Settings
        ),
        "transitions": {
            source: sorted(targets) for source, targets in _ALLOWED_TRANSITIONS.items()
        },
        "settings": {
            name: setting(name, audits.AuditSettings)
            for name in audits.AuditSettings.model_fields
            if name != "audit_prompt_count"
        },
        "prompt_count": {
            "env": ["AUDIT_AUDIT_PROMPT_COUNT"],
            "type": "str",
            "default": None,
        },
        "constants": {
            name.lower(): sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(audits).items()
            if name.isupper()
            and not name.startswith("_")
            and isinstance(value, (str, int, float, bool, dict, frozenset))
        },
        "benchmark_modes": sorted(projects.BENCHMARK_MODES),
        "min_repetitions": projects.MIN_REPETITIONS,
        "max_repetitions": projects.MAX_REPETITIONS,
        "selectable_engines": sorted(provider_catalog.SELECTABLE_ENGINES),
        "route_policies": {
            engine: {
                "reasoning_effort": row.reasoning_effort,
                "reasoning_pinnable": row.reasoning_pinnable,
                "representative_status": row.representative_status,
                "batch_enabled": row.batch_enabled,
            }
            for engine, row in provider_catalog.ROUTE_POLICIES.items()
        },
        "commerce_versions": {
            "template_version": commerce_catalog.COMMERCE_PROMPT_TEMPLATE_VERSION,
            "parser_version": commerce_catalog.COMMERCE_RECOMMENDATION_PARSER_VERSION,
            "matcher_version": commerce_catalog.COMMERCE_RECOMMENDATION_MATCHER_VERSION,
            "formula_version": commerce_catalog.COMMERCE_SHELF_FORMULA_VERSION,
        },
    }
