# OAuth sign-in router: provider catalog, authorize start, and callback.
#
# Google is implemented; github/apple stay cataloged and 501. The start
# endpoint answers JSON so an unconfigured provider can degrade to a
# "coming soon" notice instead of an error page, but the CALLBACK is a
# full-page navigation and therefore always 302s back into the app -- success
# and failure alike -- exactly like the integrations connect callback.
#
# The state token's session nonce rides a short-lived, HttpOnly, SameSite=Lax
# cookie scoped to this router's path; it is never returned to JS. Every
# callback clears it, as do login and logout, so a transaction cannot survive
# replay or an account switch. Client secrets are never returned or logged
# (invariant 6).
from __future__ import annotations

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_cookies import (
    clear_auth_oauth_cookie,
    clear_integration_oauth_cookie,
    set_auth_oauth_cookie,
    set_session_cookie,
)
from app.api.deps import get_db
from app.api.rate_limit import enforce_limit, trusted_client_identity
from app.core.config import demo_access_expired
from app.core.config.abuse import abuse_settings
from app.core.config.oauth import (
    AUTH_OAUTH_TRANSACTION_COOKIE,
    CODE_OAUTH_CALLBACK_NOT_IMPLEMENTED,
    CODE_OAUTH_PROVIDER_NOT_CONFIGURED,
    CODE_OAUTH_PROVIDER_UNKNOWN,
    CODE_OAUTH_SIGNIN_DISABLED,
    CODE_OAUTH_SIGNIN_EMAIL_UNVERIFIED,
    CODE_OAUTH_SIGNIN_FAILED,
    CODE_OAUTH_SIGNIN_STATE_INVALID,
    OAUTH_AUTHORIZE_URLS,
    OAUTH_PROVIDER_LABELS,
    OAUTH_SCOPES,
    OAUTH_SIGNIN_ERROR_PATH,
    OAUTH_SIGNIN_IMPLEMENTED,
    OAUTH_SIGNIN_LANDING_PATH,
    is_oauth_provider,
    oauth_client_credentials,
    oauth_provider_configured,
    oauth_signin_landing_url,
    oauth_signin_redirect_uri,
)
from app.core.http_errors import raise_api_error
from app.core.security import create_oauth_state
from app.domain.auth.oauth_service import (
    SignInDisabledError,
    SignInEmailUnverifiedError,
    SignInExchangeError,
    SignInStateError,
    complete_signin,
)
from app.domain.auth.schemas import (
    OAuthProviderInfo,
    OAuthProvidersResponse,
    OAuthStartResponse,
)

router = APIRouter(prefix="/auth/oauth", tags=["auth"])

_SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _require_known_provider(provider: str) -> None:
    """404 when ``provider`` is not in the OAuth catalog."""
    if not is_oauth_provider(provider):
        raise_api_error(
            status.HTTP_404_NOT_FOUND,
            f"Unknown OAuth provider {provider!r}",
            code=CODE_OAUTH_PROVIDER_UNKNOWN,
            details={"provider": provider},
            # ``detail`` stays the exact coded dict this endpoint has always
            # returned: no ``message`` key, which its clients do not expect.
            detail={"code": CODE_OAUTH_PROVIDER_UNKNOWN, "provider": provider},
        )


def _require_configured_provider(provider: str) -> None:
    """503 when ``provider`` is known but not enabled + credentialed."""
    if not oauth_provider_configured(provider):
        raise_api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"OAuth provider {provider!r} is not configured",
            code=CODE_OAUTH_PROVIDER_NOT_CONFIGURED,
            details={"provider": provider},
            detail={"code": CODE_OAUTH_PROVIDER_NOT_CONFIGURED, "provider": provider},
        )


def _signin_error_redirect(code: str) -> RedirectResponse:
    """302 back to the login page carrying a coded reason.

    Always clears the transaction cookie: a failed callback must not leave a
    nonce behind for a second attempt to reuse.
    """
    response = RedirectResponse(
        oauth_signin_landing_url(OAUTH_SIGNIN_ERROR_PATH, {"error": code}),
        status_code=status.HTTP_302_FOUND,
    )
    clear_auth_oauth_cookie(response)
    return response


@router.get("/providers", response_model=OAuthProvidersResponse)
async def list_oauth_providers() -> OAuthProvidersResponse:
    """List the OAuth provider catalog — ``configured`` flags only.

    Never exposes client ids, client secrets, or redirect URIs (invariant 6).
    """
    return OAuthProvidersResponse(
        providers=[
            OAuthProviderInfo(
                provider=provider,
                label=label,
                configured=oauth_provider_configured(provider),
            )
            for provider, label in OAUTH_PROVIDER_LABELS.items()
        ]
    )


@router.get("/{provider}/start", response_model=OAuthStartResponse)
async def oauth_start(provider: str, response: Response) -> OAuthStartResponse:
    """Build the provider authorize URL and arm the transaction cookie.

    Sign-in asks for identity scopes and nothing else. It deliberately omits
    ``access_type=offline`` (it wants no refresh token) AND
    ``include_granted_scopes`` — the latter would make Google mint a sign-in
    token also covering any Search Console / Analytics scopes the user had
    already granted this client, so a plain login would carry read access to
    their analytics data for no reason. Incremental authorization belongs on
    the CONNECT request, which is where ``start_connect`` sets it.

    The state's session nonce goes into an HttpOnly cookie and is never
    returned in the body — it is the binding secret.
    """
    _require_known_provider(provider)
    _require_configured_provider(provider)
    client_id, _client_secret = oauth_client_credentials(provider)
    state, session_nonce = create_oauth_state(provider)
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": oauth_signin_redirect_uri(provider),
            "response_type": "code",
            "scope": OAUTH_SCOPES[provider],
            "state": state,
        }
    )
    set_auth_oauth_cookie(response, session_nonce)
    return OAuthStartResponse(
        authorize_url=f"{OAUTH_AUTHORIZE_URLS[provider]}?{query}",
        state=state,
    )


def _callback_precondition_error(provider: str, *, code: str, state: str) -> str:
    """The coded reason this callback cannot proceed, or an empty string."""
    if provider not in OAUTH_SIGNIN_IMPLEMENTED:
        return CODE_OAUTH_SIGNIN_DISABLED
    if demo_access_expired():
        return CODE_OAUTH_SIGNIN_DISABLED
    if not code or not state:
        return CODE_OAUTH_SIGNIN_STATE_INVALID
    return ""


@router.get("/{provider}/callback", status_code=status.HTTP_302_FOUND)
async def oauth_callback(
    provider: str,
    request: Request,
    session: _SessionDep,
    transaction_nonce: Annotated[
        str | None, Cookie(alias=AUTH_OAUTH_TRANSACTION_COOKIE)
    ] = None,
    code: Annotated[str, Query()] = "",
    state: Annotated[str, Query()] = "",
    error: Annotated[str, Query()] = "",
) -> RedirectResponse:
    """Handle the provider redirect: verify, resolve an account, sign in.

    Always 302s back into the app because the browser is mid full-page
    navigation — a JSON body would render as text. Failures land on /login
    with a coded ``error``; success lands on the projects list with the
    session cookie set.
    """
    _require_known_provider(provider)
    if not oauth_provider_configured(provider):
        # The provider was configured at start and is not now, or this
        # deployment never had it. Either way there is nothing to exchange.
        return _signin_error_redirect(CODE_OAUTH_SIGNIN_DISABLED)
    if error:
        # The provider reported a consent/authorization failure.
        return _signin_error_redirect(CODE_OAUTH_SIGNIN_FAILED)
    precondition = _callback_precondition_error(provider, code=code, state=state)
    if precondition:
        return _signin_error_redirect(precondition)

    # Metered on the same client budget as password login: the callback
    # creates accounts and mints sessions, so it is an authentication surface.
    await enforce_limit(
        session,
        subject_kind="client",
        subject=trusted_client_identity(request),
        operation="auth.login.client",
        limit=abuse_settings.login_client_limit,
        window=abuse_settings.login_window_seconds,
    )
    try:
        token, _user = await complete_signin(
            session,
            provider=provider,
            code=code,
            state=state,
            session_nonce=transaction_nonce or "",
            redirect_uri=oauth_signin_redirect_uri(provider),
        )
    except SignInStateError:
        return _signin_error_redirect(CODE_OAUTH_SIGNIN_STATE_INVALID)
    except SignInEmailUnverifiedError:
        return _signin_error_redirect(CODE_OAUTH_SIGNIN_EMAIL_UNVERIFIED)
    except SignInDisabledError:
        return _signin_error_redirect(CODE_OAUTH_SIGNIN_DISABLED)
    except SignInExchangeError:
        return _signin_error_redirect(CODE_OAUTH_SIGNIN_FAILED)

    response = RedirectResponse(
        oauth_signin_landing_url(OAUTH_SIGNIN_LANDING_PATH, {}),
        status_code=status.HTTP_302_FOUND,
    )
    clear_auth_oauth_cookie(response)
    clear_integration_oauth_cookie(response)
    set_session_cookie(response, token)
    return response


@router.post("/{provider}/callback")
async def oauth_callback_post(provider: str) -> None:
    """501 for the form_post callback shape (Apple), which is not implemented.

    Google returns the code on the query string, so the GET callback above is
    the only implemented shape.
    """
    _require_known_provider(provider)
    _require_configured_provider(provider)
    raise_api_error(
        status.HTTP_501_NOT_IMPLEMENTED,
        f"The OAuth callback for {provider!r} is not implemented",
        code=CODE_OAUTH_CALLBACK_NOT_IMPLEMENTED,
        details={"provider": provider},
        detail={"code": CODE_OAUTH_CALLBACK_NOT_IMPLEMENTED, "provider": provider},
    )
