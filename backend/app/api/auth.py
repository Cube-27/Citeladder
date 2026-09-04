# Auth router: register / login / logout / me.
#
# The JWT session is delivered in a secure HttpOnly cookie so browser JS can
# never read it; the cookie policy itself is owned by
# ``app.api.browser_cookies.set_session_cookie``, which the OAuth sign-in
# router shares.
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_cookies import (
    clear_auth_oauth_cookie,
    clear_integration_oauth_cookie,
    set_session_cookie,
)
from app.api.deps import get_current_user, get_db
from app.api.rate_limit import enforce_limit, trusted_client_identity
from app.core.config import demo_access_expired, settings
from app.core.config.abuse import abuse_settings
from app.core.http_errors import raise_api_error
from app.domain.auth.schemas import (
    AuthResponse,
    Credentials,
    RegistrationResponse,
    SessionUser,
)
from app.domain.auth.service import authenticate_user, register_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("app.auth")


@router.post(
    "/register",
    response_model=RegistrationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register(
    payload: Credentials,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RegistrationResponse:
    if settings.demo_mode:
        raise_api_error(status.HTTP_403_FORBIDDEN, "Registration is disabled")
    await enforce_limit(
        session,
        subject_kind="client",
        subject=trusted_client_identity(request),
        operation="auth.register.client",
        limit=abuse_settings.register_client_limit,
        window=abuse_settings.register_window_seconds,
    )
    await register_user(session, payload.email, payload.password)
    return RegistrationResponse(
        message="If the address is eligible, the account is ready. Sign in to continue."
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: Credentials,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    if demo_access_expired():
        raise_api_error(status.HTTP_401_UNAUTHORIZED, "Demo access has expired")
    await enforce_limit(
        session,
        subject_kind="client",
        subject=trusted_client_identity(request),
        operation="auth.login.client",
        limit=abuse_settings.login_client_limit,
        window=abuse_settings.login_window_seconds,
    )
    authenticated = await authenticate_user(session, payload.email, payload.password)
    if authenticated is None:
        # Account/email counters are failure-only. Successful credentials must
        # not be blocked because an attacker deliberately exhausted a victim's
        # identifier budget.
        await enforce_limit(
            session,
            subject_kind="email",
            subject=payload.email,
            operation="auth.login.email_failure",
            limit=abuse_settings.login_email_limit,
            window=abuse_settings.login_window_seconds,
        )
        raise_api_error(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token, user = authenticated
    clear_integration_oauth_cookie(response)
    clear_auth_oauth_cookie(response)
    set_session_cookie(response, token)
    logger.info("auth.login_success", extra={"user_id": str(user.id)})
    return AuthResponse(user=SessionUser.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    user.session_version += 1
    await session.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    clear_integration_oauth_cookie(response)
    clear_auth_oauth_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=AuthResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> AuthResponse:
    return AuthResponse(user=SessionUser.model_validate(user))
