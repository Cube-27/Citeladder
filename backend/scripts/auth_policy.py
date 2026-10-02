"""Python-owned auth and bootstrap policy consumed by the TypeScript owner."""

from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import auth as auth_config
from app.core.config import legal as legal_config
from app.core.config import site_health_crawl_policy as crawl_policy
from app.core.config import workspaces as workspace_config
from app.core.config.site_health_runtime import SiteHealthSettings
from app.domain.workspaces.policy import WORKSPACE_ROLES, effective_capabilities

SettingExporter = Callable[[str, type[BaseSettings]], dict[str, Any]]


def auth_policy() -> dict[str, Any]:
    return {
        "password": {
            "memoryCost": auth_config.ARGON2_MEMORY_COST,
            "timeCost": auth_config.ARGON2_TIME_COST,
            "parallelism": auth_config.ARGON2_PARALLELISM,
            "outputLen": auth_config.ARGON2_HASH_LENGTH,
        },
        "terms_revision": legal_config.TERMS_REVISION,
        "privacy_revision": legal_config.PRIVACY_NOTICE_REVISION,
    }


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
        "invitation_ttl_hours": workspace_config.INVITATION_TTL_HOURS,
        "max_pending_invitations": (
            workspace_config.MAX_PENDING_INVITATIONS_PER_WORKSPACE
        ),
        "roles": {role: list(effective_capabilities(role)) for role in WORKSPACE_ROLES},
        "forbidden_code": workspace_config.CODE_WORKSPACE_ROLE_FORBIDDEN,
        "denial_messages": dict(workspace_config.CAPABILITY_DENIAL_MESSAGES),
    }
