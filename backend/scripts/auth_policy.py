"""Remaining workspace matrix and schema runtime bounds exported to TypeScript."""

from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import site_health_crawl_policy as crawl_policy
from app.core.config import workspaces as workspace_config
from app.core.config.site_health_runtime import SiteHealthSettings
from app.domain.workspaces.policy import WORKSPACE_ROLES, effective_capabilities

SettingExporter = Callable[[str, type[BaseSettings]], dict[str, Any]]


def site_health_runtime_policy(setting: SettingExporter) -> dict[str, Any]:
    return {
        "settings": {
            name: setting(name, SiteHealthSettings)
            for name in (
                "automatic_page_limit",
                "max_requested_page_limit",
                "max_attempts",
                "sample_discovery_url_cap",
                "sample_url_limit",
            )
        },
        "full_headroom": crawl_policy.FULL_DISCOVERY_HEADROOM,
        "full_minimum": crawl_policy.MIN_FULL_DISCOVERY_URL_CAP,
        "full_mode": crawl_policy.DISCOVERY_MODE_FULL,
        "sample_mode": crawl_policy.DISCOVERY_MODE_SAMPLE,
    }


def workspace_policy() -> dict[str, Any]:
    """Workspace limits and the role matrix the TypeScript owner enforces."""
    return {
        "max_owned": workspace_config.MAX_OWNED_WORKSPACES_PER_USER,
        "roles": {role: list(effective_capabilities(role)) for role in WORKSPACE_ROLES},
    }
