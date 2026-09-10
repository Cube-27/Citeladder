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

# A non-secret companion to the HttpOnly session cookie, deliberately readable
# by browser JavaScript. It carries no token and no identity — only the fact
# that a session was issued — and the browser expires it on exactly the same
# schedule as the session it shadows.
#
# It exists because the marketing pages are statically rendered: their HTML
# always carries the anonymous "Log in" actions, so a signed-in visitor saw
# those swap to "Dashboard" after hydration. The session cookie is HttpOnly and
# cannot answer "is there a session?" before paint; a localStorage trace can,
# but outlives the session it stands for, which turns the flash around into
# "Dashboard" swapping to "Log in". Only a cookie shares the session's own
# lifetime, so only a cookie can be right at first paint.
SESSION_HINT_COOKIE = "citeladder_session_hint"


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
    max_age = int(settings.jwt_expire_hours * 3600)
    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=browser_cookie_secure(),
        path="/",
        max_age=max_age,
    )
    # Same max_age, so the browser drops the hint at the same instant the
    # session stops being honoured. `httponly=False` is the whole point.
    response.set_cookie(
        SESSION_HINT_COOKIE,
        "1",
        httponly=False,
        samesite="lax",
        secure=browser_cookie_secure(),
        path="/",
        max_age=max_age,
    )


def clear_session_cookie(response: Response) -> None:
    """Drop the session and the hint together, so neither can outlive the other."""
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie(
        SESSION_HINT_COOKIE,
        path="/",
        samesite="lax",
        secure=browser_cookie_secure(),
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
