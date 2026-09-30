"""Python-owned auth and bootstrap policy consumed by the TypeScript owner."""

from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import auth as auth_config
from app.core.config import integrations_transport as transport_config
from app.core.config import legal as legal_config
from app.core.config import oauth as oauth_config
from app.core.config import site_health_crawl_policy as crawl_policy
from app.core.config.site_health_runtime import SiteHealthSettings

SettingExporter = Callable[[str, type[BaseSettings]], dict[str, Any]]


def auth_policy(setting: SettingExporter) -> dict[str, Any]:
    return {
        "password": {
            "memoryCost": auth_config.ARGON2_MEMORY_COST,
            "timeCost": auth_config.ARGON2_TIME_COST,
            "parallelism": auth_config.ARGON2_PARALLELISM,
            "outputLen": auth_config.ARGON2_HASH_LENGTH,
        },
        "terms_revision": legal_config.TERMS_REVISION,
        "privacy_revision": legal_config.PRIVACY_NOTICE_REVISION,
        "oauth": {
            "settings": {
                name: setting(name, oauth_config.OAuthSettings)
                for name in oauth_config.OAuthSettings.model_fields
            },
            "labels": oauth_config.OAUTH_PROVIDER_LABELS,
            "authorize_urls": oauth_config.OAUTH_AUTHORIZE_URLS,
            "token_urls": oauth_config.OAUTH_TOKEN_URLS,
            "userinfo_urls": oauth_config.OAUTH_USERINFO_URLS,
            "scopes": oauth_config.OAUTH_SCOPES,
            "implemented": sorted(oauth_config.OAUTH_SIGNIN_IMPLEMENTED),
            "approved_hosts": sorted(oauth_config.OAUTH_APPROVED_ENDPOINT_HOSTS),
            "cookie_name": oauth_config.AUTH_OAUTH_TRANSACTION_COOKIE,
            "cookie_path": oauth_config.AUTH_OAUTH_TRANSACTION_COOKIE_PATH,
            "integration_cookie_name": (
                transport_config.INTEGRATION_OAUTH_TRANSACTION_COOKIE
            ),
            "integration_cookie_path": (
                transport_config.INTEGRATION_OAUTH_TRANSACTION_COOKIE_PATH
            ),
            "callback_path": oauth_config.OAUTH_SIGNIN_CALLBACK_PATH,
            "landing_path": oauth_config.OAUTH_SIGNIN_LANDING_PATH,
            "error_path": oauth_config.OAUTH_SIGNIN_ERROR_PATH,
            "timeout_seconds": oauth_config.SIGNIN_REQUEST_TIMEOUT_SECONDS,
            "response_max_bytes": oauth_config.SIGNIN_RESPONSE_MAX_BYTES,
        },
    }


def site_health_runtime_policy(setting: SettingExporter) -> dict[str, Any]:
    return {
        "settings": {
            name: setting(name, SiteHealthSettings)
            for name in (
                "automatic_page_limit",
                "sample_discovery_url_cap",
                "sample_url_limit",
            )
        },
        "full_headroom": crawl_policy.FULL_DISCOVERY_HEADROOM,
        "full_minimum": crawl_policy.MIN_FULL_DISCOVERY_URL_CAP,
        "full_mode": crawl_policy.DISCOVERY_MODE_FULL,
        "sample_mode": crawl_policy.DISCOVERY_MODE_SAMPLE,
    }
