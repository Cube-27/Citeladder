"""OAuth provider catalog + settings: defaults, flags, configured matrix."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.core.config.oauth import (
    OAUTH_APPLE,
    OAUTH_APPROVED_ENDPOINT_HOSTS,
    OAUTH_AUTHORIZE_URLS,
    OAUTH_GITHUB,
    OAUTH_GOOGLE,
    OAUTH_PROVIDER_LABELS,
    OAUTH_PROVIDERS,
    OAUTH_SCOPES,
    OAUTH_SIGNIN_IMPLEMENTED,
    OAUTH_TOKEN_URLS,
    OAUTH_USERINFO_URLS,
    OAuthSettings,
    is_oauth_provider,
    oauth_client_credentials,
    oauth_provider_configured,
    oauth_settings,
    oauth_signin_landing_url,
    oauth_signin_redirect_uri,
)

_PROVIDERS = (OAUTH_GOOGLE, OAUTH_GITHUB, OAUTH_APPLE)
_FIELDS = ("client_id", "client_secret", "redirect_uri", "enabled")


@pytest.fixture
def _clean_oauth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate defaults tests from any developer OAUTH_* process env."""
    for provider in _PROVIDERS:
        for field in _FIELDS:
            monkeypatch.delenv(f"OAUTH_{provider}_{field}".upper(), raising=False)
    monkeypatch.delenv("OAUTH_STATE_TTL_SECONDS", raising=False)


def test_provider_catalog_covers_google_github_apple() -> None:
    assert OAUTH_PROVIDERS == frozenset({"google", "github", "apple"})
    # Labels + endpoint/scope defaults cover exactly the catalog.
    assert set(OAUTH_PROVIDER_LABELS) == set(OAUTH_PROVIDERS)
    assert set(OAUTH_AUTHORIZE_URLS) == set(OAUTH_PROVIDERS)
    assert set(OAUTH_TOKEN_URLS) == set(OAUTH_PROVIDERS)
    assert set(OAUTH_SCOPES) == set(OAUTH_PROVIDERS)
    for provider in OAUTH_PROVIDERS:
        assert OAUTH_PROVIDER_LABELS[provider]
        assert OAUTH_AUTHORIZE_URLS[provider].startswith("https://")
        assert OAUTH_TOKEN_URLS[provider].startswith("https://")
        assert OAUTH_SCOPES[provider]


def test_defaults_are_empty_and_disabled(_clean_oauth_env: None) -> None:
    fresh = OAuthSettings()
    for provider in _PROVIDERS:
        assert getattr(fresh, f"{provider}_client_id") == ""
        assert getattr(fresh, f"{provider}_client_secret") == ""
        assert getattr(fresh, f"{provider}_redirect_uri") == ""
        assert getattr(fresh, f"{provider}_enabled") is False
    assert fresh.state_ttl_seconds == 600


def test_is_oauth_provider() -> None:
    for provider in _PROVIDERS:
        assert is_oauth_provider(provider) is True
    assert is_oauth_provider("gitlab") is False
    assert is_oauth_provider("") is False


def test_oauth_provider_configured_matrix(monkeypatch: pytest.MonkeyPatch) -> None:
    # Enabled without credentials -> not configured.
    monkeypatch.setattr(oauth_settings, "github_enabled", True)
    monkeypatch.setattr(oauth_settings, "github_client_id", "")
    monkeypatch.setattr(oauth_settings, "github_client_secret", "")
    assert oauth_provider_configured("github") is False

    # Credentialed + enabled -> configured. The redirect URI is NOT part of
    # this test: it is derived from ``frontend_url`` when unset, so it is
    # always present.
    monkeypatch.setattr(oauth_settings, "github_client_id", "id")
    monkeypatch.setattr(oauth_settings, "github_client_secret", "secret")
    assert oauth_provider_configured("github") is True

    # Dropping either credential flips it back to not configured.
    for field in ("client_id", "client_secret"):
        monkeypatch.setattr(oauth_settings, f"github_{field}", "")
        assert oauth_provider_configured("github") is False
        monkeypatch.setattr(oauth_settings, f"github_{field}", "restored")

    # Credentialed but not enabled -> not configured.
    monkeypatch.setattr(oauth_settings, "github_enabled", False)
    assert oauth_provider_configured("github") is False


def test_google_credentials_fall_back_to_the_integration_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sign-in shares the integrations Google client unless overridden.

    Not a convenience: incremental authorization only composes within one
    ``client_id``, so a split would cost the one-click GSC/GA4 connect.
    """
    monkeypatch.setattr(oauth_settings, "google_client_id", "")
    monkeypatch.setattr(oauth_settings, "google_client_secret", "")
    monkeypatch.setattr(settings, "integration_google_client_id", "integration-id")
    monkeypatch.setattr(
        settings, "integration_google_client_secret", "integration-secret"
    )
    assert oauth_client_credentials(OAUTH_GOOGLE) == (
        "integration-id",
        "integration-secret",
    )

    # An explicit OAUTH_GOOGLE_* pair wins.
    monkeypatch.setattr(oauth_settings, "google_client_id", "signin-id")
    monkeypatch.setattr(oauth_settings, "google_client_secret", "signin-secret")
    assert oauth_client_credentials(OAUTH_GOOGLE) == ("signin-id", "signin-secret")

    # A half-set pair is not a usable override; it falls back rather than
    # sending an empty secret to Google.
    monkeypatch.setattr(oauth_settings, "google_client_secret", "")
    assert oauth_client_credentials(OAUTH_GOOGLE) == (
        "integration-id",
        "integration-secret",
    )


def test_non_google_credentials_never_fall_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(oauth_settings, "github_client_id", "")
    monkeypatch.setattr(oauth_settings, "github_client_secret", "")
    monkeypatch.setattr(settings, "integration_google_client_id", "integration-id")
    assert oauth_client_credentials(OAUTH_GITHUB) == ("", "")


def test_signin_redirect_uri_is_anchored_on_the_app_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Derived from ``frontend_url``, never from the incoming request.

    The browser reaches the backend through the Next rewrites() proxy, so a
    request-derived URI would send the post-consent navigation at the backend
    origin, which is not browser-reachable in production and carries no
    host-only transaction cookie.
    """
    monkeypatch.setattr(oauth_settings, "google_redirect_uri", "")
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.com/")
    assert (
        oauth_signin_redirect_uri(OAUTH_GOOGLE)
        == "https://app.example.com/api/v1/auth/oauth/google/callback"
    )

    # An explicit override still wins (staging / bespoke proxies).
    monkeypatch.setattr(oauth_settings, "google_redirect_uri", "https://x.test/cb")
    assert oauth_signin_redirect_uri(OAUTH_GOOGLE) == "https://x.test/cb"


def test_signin_landing_url_is_absolute(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.com")
    assert (
        oauth_signin_landing_url("/projects", {}) == "https://app.example.com/projects"
    )
    assert (
        oauth_signin_landing_url("/login", {"error": "oauth_signin_failed"})
        == "https://app.example.com/login?error=oauth_signin_failed"
    )


def test_signin_transport_catalog_covers_only_implemented_providers() -> None:
    assert OAUTH_SIGNIN_IMPLEMENTED == frozenset({OAUTH_GOOGLE})
    # Userinfo is required to identify a signer, so every implemented
    # provider must have one and its host must be allow-listed (SSRF).
    assert set(OAUTH_USERINFO_URLS) >= OAUTH_SIGNIN_IMPLEMENTED
    for provider in OAUTH_SIGNIN_IMPLEMENTED:
        for url in (OAUTH_TOKEN_URLS[provider], OAUTH_USERINFO_URLS[provider]):
            assert url.startswith("https://")
            host = url.split("/")[2]
            assert host in OAUTH_APPROVED_ENDPOINT_HOSTS


def test_oauth_provider_configured_unknown_provider() -> None:
    assert oauth_provider_configured("gitlab") is False
