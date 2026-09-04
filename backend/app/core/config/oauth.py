# OAuth provider catalog + settings for third-party sign-in (invariant 1:
# config lives in core/config, never inline in service/router code).
#
# Owns the approved OAuth provider set (google | github | apple), the
# per-provider authorize/token endpoint defaults and scopes, and the
# env-driven client credentials + enablement flags. Routers READ these
# values; they never hard-code them. Client secrets are never logged or
# returned to callers (invariant 6).
from __future__ import annotations

from typing import Final
from urllib.parse import urlencode

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources

# --- OAuth providers (third-party sign-in surface) ------------------------
# Coded API errors this subsystem returns. Owned here, not spelled inline in
# the router (invariant 1) — these strings are the machine-readable half of
# the OAuth contract and clients branch on them.
CODE_OAUTH_PROVIDER_UNKNOWN: Final = "oauth_provider_unknown"
CODE_OAUTH_PROVIDER_NOT_CONFIGURED: Final = "oauth_provider_not_configured"
CODE_OAUTH_CALLBACK_NOT_IMPLEMENTED: Final = "oauth_callback_not_implemented"
# Sign-in callback outcomes. The callback is a full-page navigation, so
# these travel as a query parameter on the /login redirect rather than in a
# JSON error body.
CODE_OAUTH_SIGNIN_STATE_INVALID: Final = "oauth_signin_state_invalid"
CODE_OAUTH_SIGNIN_FAILED: Final = "oauth_signin_failed"
CODE_OAUTH_SIGNIN_EMAIL_UNVERIFIED: Final = "oauth_signin_email_unverified"
CODE_OAUTH_SIGNIN_DISABLED: Final = "oauth_signin_disabled"

OAUTH_GOOGLE: Final = "google"
OAUTH_GITHUB: Final = "github"
OAUTH_APPLE: Final = "apple"
OAUTH_PROVIDERS: Final[frozenset[str]] = frozenset(
    {OAUTH_GOOGLE, OAUTH_GITHUB, OAUTH_APPLE}
)

# Human-facing labels for UI buttons / provider listings, in catalog order.
OAUTH_PROVIDER_LABELS: Final[dict[str, str]] = {
    OAUTH_GOOGLE: "Google",
    OAUTH_GITHUB: "GitHub",
    OAUTH_APPLE: "Apple",
}

# --- Per-provider endpoint + scope defaults -------------------------------
# Token URLs are cataloged now so the callback token exchange (lands when
# real credentials exist) reads them from here instead of hard-coding them.
OAUTH_AUTHORIZE_URLS: Final[dict[str, str]] = {
    OAUTH_GOOGLE: "https://accounts.google.com/o/oauth2/v2/auth",
    OAUTH_GITHUB: "https://github.com/login/oauth/authorize",
    OAUTH_APPLE: "https://appleid.apple.com/auth/authorize",
}
OAUTH_TOKEN_URLS: Final[dict[str, str]] = {
    OAUTH_GOOGLE: "https://oauth2.googleapis.com/token",
    OAUTH_GITHUB: "https://github.com/login/oauth/access_token",
    OAUTH_APPLE: "https://appleid.apple.com/auth/token",
}
OAUTH_SCOPES: Final[dict[str, str]] = {
    OAUTH_GOOGLE: "openid email profile",
    OAUTH_GITHUB: "read:user user:email",
    OAUTH_APPLE: "name email",
}

# Userinfo endpoints. Reading the profile from userinfo with the freshly
# issued access token avoids fetching and caching the provider's JWKS to
# verify an ``id_token`` signature — one extra HTTPS call in exchange for no
# key-rotation surface. Only Google is implemented.
OAUTH_USERINFO_URLS: Final[dict[str, str]] = {
    OAUTH_GOOGLE: "https://openidconnect.googleapis.com/v1/userinfo",
}

# The only providers whose callback is implemented. Everything else in the
# catalog still lists and still 501s.
OAUTH_SIGNIN_IMPLEMENTED: Final[frozenset[str]] = frozenset({OAUTH_GOOGLE})

# SSRF allow-list for the sign-in transport (mirrors the integrations
# allow-list; deliberately exact-match, no wildcard or suffix).
OAUTH_APPROVED_ENDPOINT_HOSTS: Final[frozenset[str]] = frozenset(
    {
        "accounts.google.com",
        "oauth2.googleapis.com",
        "openidconnect.googleapis.com",
    }
)

# Callback path + post-callback landing paths. The callback is a full-page
# navigation, so it always 302s back into the app (never returns JSON).
OAUTH_SIGNIN_CALLBACK_PATH: Final = "/api/v1/auth/oauth/{provider}/callback"
OAUTH_SIGNIN_LANDING_PATH: Final = "/projects"
OAUTH_SIGNIN_ERROR_PATH: Final = "/login"

# Short-lived transaction cookie carrying the state token's session nonce.
# Scoped to the sign-in callback path so it is never sent anywhere else.
AUTH_OAUTH_TRANSACTION_COOKIE: Final = "citeladder_auth_oauth"
AUTH_OAUTH_TRANSACTION_COOKIE_PATH: Final = "/api/v1/auth/oauth"


def is_oauth_provider(provider: str) -> bool:
    """True when ``provider`` names a cataloged OAuth provider."""
    return provider in OAUTH_PROVIDERS


class OAuthSettings(BaseSettings):
    """OAuth client credentials + enablement flags (env-overridable).

    Every provider ships disabled with empty credentials: a provider is only
    usable when explicitly enabled AND fully configured. Values are read from
    the process environment (``OAUTH_`` prefix); they are never logged or
    returned to clients (invariant 6).
    """

    model_config = SettingsConfigDict(
        env_prefix="OAUTH_",
        # ``config/dotenv.py`` owns the .env decision for every settings
        # class here. Without it these values were readable ONLY as real
        # process env vars, so a developer running on the host could not
        # enable sign-in from .env at all (Compose worked because its
        # env_file injects the same keys into the process environment).
        env_file=dotenv_sources(),
        extra="ignore",
    )

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    google_enabled: bool = False

    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = ""
    github_enabled: bool = False

    apple_client_id: str = ""
    apple_client_secret: str = ""
    apple_redirect_uri: str = ""
    apple_enabled: bool = False

    # Lifetime of the signed, stateless OAuth state/nonce token.
    state_ttl_seconds: int = 600


oauth_settings = OAuthSettings()


def oauth_client_credentials(provider: str) -> tuple[str, str]:
    """Resolve the provider's sign-in client id/secret (never logged).

    Google falls back to the INTEGRATION Google client when the ``OAUTH_``
    pair is unset, and that fallback is the intended default rather than a
    convenience: sign-in and the GSC/GA4 connect flow MUST share one
    ``client_id``. Google's ``include_granted_scopes`` incremental
    authorization only composes within a single client, so a second client
    would make connecting Search Console a fresh account chooser plus a fresh
    consent — and would need its own consent screen and its own verification
    submission.
    """
    client_id = str(getattr(oauth_settings, f"{provider}_client_id", "") or "")
    client_secret = str(getattr(oauth_settings, f"{provider}_client_secret", "") or "")
    if provider == OAUTH_GOOGLE and not (client_id and client_secret):
        # Imported lazily: ``app.core.config`` builds the Settings singleton at
        # module scope, so a top-level import here would run during that build.
        from app.core.config import settings

        return (
            settings.integration_google_client_id,
            settings.integration_google_client_secret,
        )
    return client_id, client_secret


def oauth_signin_redirect_uri(provider: str) -> str:
    """Absolute sign-in callback URL registered with the provider.

    Anchored on ``frontend_url`` — the APP origin — never on the incoming
    request's base URL, for the same reason as the integrations callback
    (``integration_oauth_redirect_uri``): the browser reaches the backend
    through the Next ``rewrites()`` proxy, so a request-derived redirect URI
    sends the provider's post-consent navigation straight at the backend
    origin, which is not browser-reachable in production and would arrive
    without the host-only transaction cookie. The configured
    ``OAUTH_<PROVIDER>_REDIRECT_URI`` stays an explicit override.
    """
    configured = str(getattr(oauth_settings, f"{provider}_redirect_uri", "") or "")
    if configured:
        return configured
    from app.core.config import settings

    base = settings.frontend_url.rstrip("/")
    return f"{base}{OAUTH_SIGNIN_CALLBACK_PATH.format(provider=provider)}"


def oauth_signin_landing_url(path: str, params: dict[str, str]) -> str:
    """Absolute frontend URL the sign-in callback 302s to.

    The provider sends the browser straight at the backend callback, so the
    redirect target must be absolute and point at the frontend origin: a bare
    path would resolve against the backend origin, which serves no ``/login``
    or ``/projects`` route.
    """
    from app.core.config import settings

    base = settings.frontend_url.rstrip("/")
    query = f"?{urlencode(params)}" if params else ""
    return f"{base}{path}{query}"


def oauth_provider_configured(provider: str) -> bool:
    """True only when the provider is enabled AND fully credentialed.

    Requires the enablement flag plus a resolvable client id and secret. The
    redirect URI is no longer part of this test: it is derived from
    ``frontend_url`` when unset, so it is always present.
    Never logs the underlying values (invariant 6).
    """
    if not is_oauth_provider(provider):
        return False
    if not getattr(oauth_settings, f"{provider}_enabled"):
        return False
    client_id, client_secret = oauth_client_credentials(provider)
    return bool(client_id and client_secret)
