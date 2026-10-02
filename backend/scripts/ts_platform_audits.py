"""Shared audit model defaults and supported operator security."""

from app.core.config import (
    Settings,
    analysis,
    audit_schedules,
    audits,
    commerce_catalog,
)


def audit_policy(setting):
    return {
        "dev_test_allow_platform": setting(
            "dev_test_login_allow_platform_credentials", Settings
        ),
        "analysis": {"analyzer_version": analysis.ANALYZER_VERSION},
        "constants": {
            "audit_scope_brand": audits.AUDIT_SCOPE_BRAND,
            "audit_status_draft": audits.AUDIT_STATUS_DRAFT,
        },
        "commerce_versions": {
            "template_version": commerce_catalog.COMMERCE_PROMPT_TEMPLATE_VERSION,
            "parser_version": commerce_catalog.COMMERCE_RECOMMENDATION_PARSER_VERSION,
            "matcher_version": commerce_catalog.COMMERCE_RECOMMENDATION_MATCHER_VERSION,
            "formula_version": commerce_catalog.COMMERCE_SHELF_FORMULA_VERSION,
        },
    }


def audit_schedule_policy():
    return {"default_timezone": audit_schedules.DEFAULT_AUDIT_SCHEDULE_TIMEZONE}
