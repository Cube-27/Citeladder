"""Shared policy for first-party authentication and OAuth cookies."""

from __future__ import annotations

from fastapi import Response

from app.core.config import settings
from app.core.config.integrations_transport import (
    INTEGRATION_OAUTH_TRANSACTION_COOKIE,
    INTEGRATION_OAUTH_TRANSACTION_COOKIE_PATH,
)
from app.core.config.oauth import (
    AUTH_OAUTH_TRANSACTION_COOKIE,
    AUTH_OAUTH_TRANSACTION_COOKIE_PATH,
    oauth_settings,
)

_INSECURE_ENVS = {"", "development", "dev", "local", "test", "testing"}


def browser_cookie_secure() -> bool:
    return str(settings.app_env or "").strip().lower() not in _INSECURE_ENVS


def set_integration_oauth_cookie(response: Response, nonce: str) -> None:
    response.set_cookie(
        INTEGRATION_OAUTH_TRANSACTION_COOKIE,
        nonce,
        httponly=True,
        samesite="lax",
        secure=browser_cookie_secure(),
        path=INTEGRATION_OAUTH_TRANSACTION_COOKIE_PATH,
        max_age=oauth_settings.state_ttl_seconds,
    )


def clear_integration_oauth_cookie(response: Response) -> None:
    response.delete_cookie(
        INTEGRATION_OAUTH_TRANSACTION_COOKIE,
        path=INTEGRATION_OAUTH_TRANSACTION_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=browser_cookie_secure(),
    )


def set_session_cookie(response: Response, token: str) -> None:
    """Deliver the JWT session in a secure HttpOnly cookie.

    Documented policy: HttpOnly so browser JS can never read the token
    (XSS hardening); SameSite=Lax because the browser reaches the backend
    same-origin through the Next ``rewrites()`` proxy, so the cookie is
    first-party and no cross-site POST flow needs None; Secure outside local
    dev; Path=/ so it is sent to the whole same-origin API surface.

    Owned here rather than in the auth router so the OAuth sign-in callback
    can issue a session without importing a sibling router.
    """
    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=browser_cookie_secure(),
        path="/",
        max_age=int(settings.jwt_expire_hours * 3600),
    )


def set_auth_oauth_cookie(response: Response, nonce: str) -> None:
    """Bind a sign-in OAuth transaction to this browser for its short TTL."""
    response.set_cookie(
        AUTH_OAUTH_TRANSACTION_COOKIE,
        nonce,
        httponly=True,
        samesite="lax",
        secure=browser_cookie_secure(),
        path=AUTH_OAUTH_TRANSACTION_COOKIE_PATH,
        max_age=oauth_settings.state_ttl_seconds,
    )


def clear_auth_oauth_cookie(response: Response) -> None:
    """Drop the sign-in transaction cookie so its nonce cannot be replayed."""
    response.delete_cookie(
        AUTH_OAUTH_TRANSACTION_COOKIE,
        path=AUTH_OAUTH_TRANSACTION_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=browser_cookie_secure(),
    )
