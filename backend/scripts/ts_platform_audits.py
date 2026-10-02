"""Audit policy inputs; selection and execution remain application decisions."""

from app.core.config import (
    Settings,
    analysis,
    audits,
    commerce_catalog,
    observed_competitors,
    projects,
    provider_catalog,
)
from app.core.config import audit_schedules as audit_schedule_config
from app.core.config.provider_catalog import SELECTABLE_ENGINES
from app.orchestration.audit_state import _ALLOWED_TRANSITIONS
from scripts.ts_platform_constants import constants


def audit_policy(setting):
    return {
        "dev_test_allow_platform": setting(
            "dev_test_login_allow_platform_credentials", Settings
        ),
        "transitions": {
            source: sorted(targets) for source, targets in _ALLOWED_TRANSITIONS.items()
        },
        "analysis": constants(analysis, (str, int, float, dict, frozenset)),
        "observed_competitors": constants(observed_competitors, (str, int, frozenset)),
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
        "constants": constants(audits, (str, int, float, bool, dict, frozenset)),
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


def audit_schedule_policy():
    """Only model defaults and the shared provider catalog remain Python-owned."""
    return {
        "default_timezone": audit_schedule_config.DEFAULT_AUDIT_SCHEDULE_TIMEZONE,
        "selectable_engines": sorted(SELECTABLE_ENGINES),
    }
