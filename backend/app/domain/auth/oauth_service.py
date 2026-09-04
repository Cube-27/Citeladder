# Third-party sign-in service: verify the callback, resolve an account, mint
# a session.
#
# Distinct from the integrations connect flow (`app/domain/integrations`),
# which owns long-lived per-WORKSPACE provider grants. This module owns
# per-USER identity only: it stores no tokens, requests no offline access, and
# writes exactly one `UserIdentity` row.
#
# State is deliberately stateless -- the signed state JWT plus the HttpOnly
# transaction cookie's nonce. Unlike the integrations flow there is no
# workspace or user yet to bind a persisted row to, the router clears the
# cookie on every callback, and the provider's authorization code is
# single-use at its own end, so a replayed callback has nothing left to spend.
from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.auth_oauth import (
    AuthOAuthError,
    SignInIdentity,
    build_auth_oauth_client,
)
from app.core.config import settings
from app.core.config.oauth import OAUTH_SIGNIN_IMPLEMENTED
from app.core.security import (
    TokenDecodeError,
    create_access_token,
    decode_oauth_state,
)
from app.domain.auth.service import get_user_by_email, provision_new_account
from app.models.user import User
from app.models.user_identity import UserIdentity

logger = logging.getLogger("app.auth")


class SignInError(RuntimeError):
    """Base for every sign-in failure the router maps to a coded redirect."""


class SignInStateError(SignInError):
    """The state token, its nonce, or the provider binding did not verify."""


class SignInExchangeError(SignInError):
    """The provider rejected the code, or the identity read failed."""


class SignInEmailUnverifiedError(SignInError):
    """The provider will not vouch for the address, so it cannot be trusted."""


class SignInDisabledError(SignInError):
    """Sign-in is not available for this provider in this deployment."""


async def _identity_row(
    session: AsyncSession, *, provider: str, subject: str
) -> UserIdentity | None:
    """The stored link for one provider account, if it has signed in before."""
    return await session.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == provider,
            UserIdentity.subject == subject,
        )
    )


async def _link_identity(
    session: AsyncSession, *, user: User, provider: str, identity: SignInIdentity
) -> None:
    """Attach a provider account to a local account (idempotent per provider).

    Raises ``SignInStateError`` when the local account already links a
    DIFFERENT account at this provider: silently repointing an existing link
    would let a second Google account take over the first one's CiteLadder
    account.
    """
    existing = await session.scalar(
        select(UserIdentity).where(
            UserIdentity.user_id == user.id,
            UserIdentity.provider == provider,
        )
    )
    if existing is not None:
        if existing.subject != identity.subject:
            raise SignInStateError("account already links a different provider account")
        existing.email = identity.email
        existing.email_verified = identity.email_verified
        return
    session.add(
        UserIdentity(
            user_id=user.id,
            provider=provider,
            subject=identity.subject,
            email=identity.email,
            email_verified=identity.email_verified,
        )
    )


async def _create_account(
    session: AsyncSession, *, provider: str, identity: SignInIdentity
) -> User:
    """Provision a new passwordless account for a provider identity."""
    if settings.demo_mode:
        # Registration is disabled in demo mode, so sign-up must be too.
        # Existing accounts still sign in above this branch.
        raise SignInDisabledError("registration is disabled")
    user = User(email=identity.email, hashed_password=None, role="user")
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        # A concurrent sign-in or registration claimed the address first.
        await session.rollback()
        raise SignInStateError("account creation raced") from exc
    await _link_identity(session, user=user, provider=provider, identity=identity)
    await provision_new_account(session, user)
    logger.info(
        "auth.oauth_registered",
        extra={"user_id": str(user.id), "provider": provider},
    )
    return user


async def _resolve_account(
    session: AsyncSession, *, provider: str, identity: SignInIdentity
) -> User:
    """Find, link, or create the local account for a provider identity.

    Resolution order:
      1. a stored ``UserIdentity`` for this (provider, subject) -- the only
         key that survives an address change at the provider;
      2. an existing local account with the same address, which is LINKED --
         only ever on a provider-verified address, because linking on an
         unverified one is an account-takeover path;
      3. a new passwordless account.
    """
    linked = await _identity_row(session, provider=provider, subject=identity.subject)
    if linked is not None:
        user = await session.scalar(select(User).where(User.id == linked.user_id))
        if user is None or not user.is_active:
            raise SignInStateError("linked account is unavailable")
        linked.email = identity.email
        linked.email_verified = identity.email_verified
        await session.commit()
        return user

    if not identity.email_verified:
        raise SignInEmailUnverifiedError("provider did not verify the address")

    existing = await get_user_by_email(session, identity.email)
    if existing is not None:
        if not existing.is_active:
            raise SignInStateError("account is inactive")
        await _link_identity(
            session, user=existing, provider=provider, identity=identity
        )
        try:
            await session.commit()
        except IntegrityError as exc:
            # Two callbacks for the same account raced past the SELECT in
            # ``_link_identity`` and both inserted. The unique constraint is
            # the real arbiter; the loser re-reads the winner's row rather
            # than escaping as a 500 on an otherwise valid sign-in.
            await session.rollback()
            linked = await _identity_row(
                session, provider=provider, subject=identity.subject
            )
            if linked is None or linked.user_id != existing.id:
                raise SignInStateError("account linking conflicted") from exc
            return existing
        logger.info(
            "auth.oauth_linked",
            extra={"user_id": str(existing.id), "provider": provider},
        )
        return existing

    return await _create_account(session, provider=provider, identity=identity)


async def complete_signin(
    session: AsyncSession,
    *,
    provider: str,
    code: str,
    state: str,
    session_nonce: str,
    redirect_uri: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[str, User]:
    """Verify a sign-in callback and return ``(session_token, user)``.

    ``transport`` is the test seam handed to the provider client.
    """
    if provider not in OAUTH_SIGNIN_IMPLEMENTED:
        raise SignInDisabledError(f"sign-in is not implemented for {provider!r}")
    try:
        decode_oauth_state(state, provider, session_nonce)
    except TokenDecodeError as exc:
        raise SignInStateError(str(exc)) from exc

    client = build_auth_oauth_client(provider, transport=transport)
    try:
        identity = await client.identify(code=code, redirect_uri=redirect_uri)
    except AuthOAuthError as exc:
        raise SignInExchangeError(str(exc)) from exc

    user = await _resolve_account(session, provider=provider, identity=identity)
    token = create_access_token(str(user.id), token_version=user.session_version)
    logger.info(
        "auth.oauth_login_success",
        extra={"user_id": str(user.id), "provider": provider},
    )
    return token, user
