"""Fenced OAuth refresh shared by request and sync worker callers."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.integrations import oauth as integration_oauth
from app.core.config.integrations_contracts import (
    ERROR_GRANT_AUTH_FAILED,
    ERROR_PROVIDER_API,
    GRANT_STATUS_CONNECTED,
)
from app.core.config.integrations_settings import integration_settings
from app.core.config.integrations_transport import INTEGRATION_OAUTH_REFRESHABLE
from app.core.security import decrypt_secret, encrypt_secret
from app.models.integrations import IntegrationOAuthGrant


@dataclass(frozen=True, slots=True)
class _RefreshClaim:
    grant_id: uuid.UUID
    workspace_id: uuid.UUID
    claim_id: uuid.UUID
    revision: int
    transport_kind: str
    refresh_token: str


def invalidate_token_claim(grant: IntegrationOAuthGrant) -> None:
    """Fence refresh when consent or revocation changes a grant."""
    grant.token_revision += 1
    grant.refresh_claim_id = None
    grant.refresh_claim_expires_at = None


async def _locked_grant(
    session: AsyncSession, grant_id: uuid.UUID, workspace_id: uuid.UUID
) -> IntegrationOAuthGrant | None:
    return await session.scalar(
        select(IntegrationOAuthGrant)
        .where(
            IntegrationOAuthGrant.id == grant_id,
            IntegrationOAuthGrant.workspace_id == workspace_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def _token_is_fresh(grant: IntegrationOAuthGrant, now: datetime) -> bool:
    return (
        grant.token_expires_at is not None
        and grant.token_expires_at
        > now + timedelta(seconds=integration_settings.token_refresh_skew_seconds)
    )


def _claim_is_active(grant: IntegrationOAuthGrant, now: datetime) -> bool:
    return (
        grant.refresh_claim_id is not None
        and grant.refresh_claim_expires_at is not None
        and grant.refresh_claim_expires_at > now
    )


async def _claim_once(
    session: AsyncSession, grant_id: uuid.UUID, workspace_id: uuid.UUID
) -> str | _RefreshClaim | None:
    grant = await _locked_grant(session, grant_id, workspace_id)
    if grant is None or grant.status != GRANT_STATUS_CONNECTED:
        await session.rollback()
        raise integration_oauth.IntegrationOAuthError(
            "grant is unavailable", error_code=ERROR_GRANT_AUTH_FAILED
        )
    now = datetime.now(UTC)
    if not INTEGRATION_OAUTH_REFRESHABLE.get(grant.transport, True) or _token_is_fresh(
        grant, now
    ):
        token = decrypt_secret(grant.access_token_encrypted)
        await session.commit()
        return token
    if not grant.refresh_token_encrypted:
        await session.rollback()
        raise integration_oauth.IntegrationOAuthError(
            "grant has no refresh token", error_code=ERROR_GRANT_AUTH_FAILED
        )
    if _claim_is_active(grant, now):
        await session.rollback()
        return None
    claim = _RefreshClaim(
        grant_id=grant.id,
        workspace_id=grant.workspace_id,
        claim_id=uuid.uuid4(),
        revision=grant.token_revision,
        transport_kind=grant.transport,
        refresh_token=decrypt_secret(grant.refresh_token_encrypted),
    )
    grant.refresh_claim_id = claim.claim_id
    grant.refresh_claim_expires_at = now + timedelta(
        seconds=integration_settings.token_refresh_claim_seconds
    )
    await session.commit()
    return claim


async def fresh_access_token(
    session: AsyncSession,
    *,
    grant: IntegrationOAuthGrant,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    """Resolve a grant token without holding a transaction during OAuth I/O."""
    grant_id = grant.id
    workspace_id = grant.workspace_id
    deadline = time.monotonic() + integration_settings.token_refresh_wait_seconds
    while True:
        claimed = await _claim_once(session, grant_id, workspace_id)
        if isinstance(claimed, str):
            return claimed
        if claimed is not None:
            bundle = await _exchange_claim(session, claimed, transport)
            return await _persist_refresh(session, claimed, bundle)
        if time.monotonic() >= deadline:
            raise integration_oauth.IntegrationOAuthError(
                "grant refresh is busy", error_code=ERROR_GRANT_AUTH_FAILED
            )
        await asyncio.sleep(integration_settings.token_refresh_poll_seconds)


async def _exchange_claim(
    session: AsyncSession,
    claim: _RefreshClaim,
    transport: httpx.AsyncBaseTransport | None,
) -> integration_oauth.OAuthTokenBundle:
    try:
        client = integration_oauth.build_oauth_client(
            claim.transport_kind, transport=transport
        )
        return await asyncio.wait_for(
            client.refresh(refresh_token=claim.refresh_token),
            timeout=integration_settings.sync_request_timeout_seconds,
        )
    except TimeoutError as exc:
        await _clear_claim(session, claim)
        raise integration_oauth.IntegrationOAuthError(
            "grant refresh timed out", error_code=ERROR_PROVIDER_API
        ) from exc
    except BaseException:
        await _clear_claim(session, claim)
        raise


def _claim_matches(grant: IntegrationOAuthGrant | None, claim: _RefreshClaim) -> bool:
    return (
        grant is not None
        and grant.status == GRANT_STATUS_CONNECTED
        and grant.refresh_claim_id == claim.claim_id
        and grant.token_revision == claim.revision
        and grant.refresh_claim_expires_at is not None
        and grant.refresh_claim_expires_at > datetime.now(UTC)
    )


async def _persist_refresh(
    session: AsyncSession,
    claim: _RefreshClaim,
    bundle: integration_oauth.OAuthTokenBundle,
) -> str:
    grant = await _locked_grant(session, claim.grant_id, claim.workspace_id)
    if not _claim_matches(grant, claim):
        await session.rollback()
        raise integration_oauth.IntegrationOAuthError(
            "grant changed during refresh", error_code=ERROR_GRANT_AUTH_FAILED
        )
    grant = cast(IntegrationOAuthGrant, grant)
    grant.access_token_encrypted = encrypt_secret(bundle.access_token)
    if bundle.refresh_token:
        grant.refresh_token_encrypted = encrypt_secret(bundle.refresh_token)
    grant.token_expires_at = (
        datetime.now(UTC) + timedelta(seconds=bundle.expires_in)
        if bundle.expires_in is not None
        else None
    )
    if bundle.granted_scopes:
        grant.granted_scopes = list(bundle.granted_scopes)
    invalidate_token_claim(grant)
    await session.commit()
    return bundle.access_token


async def _clear_claim(session: AsyncSession, claim: _RefreshClaim) -> None:
    await session.rollback()
    grant = await _locked_grant(session, claim.grant_id, claim.workspace_id)
    if grant is not None and grant.refresh_claim_id == claim.claim_id:
        grant.refresh_claim_id = None
        grant.refresh_claim_expires_at = None
    await session.commit()
