"""Persisted OAuth 2.1 provider for the remote MCP server."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    IdentityAssertionParams,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl
from sqlalchemy import delete, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import demo_access_expired, legal, settings
from app.core.config.mcp import (
    MCP_MAX_CLIENT_NAME_LENGTH,
    MCP_MAX_REDIRECT_URI_LENGTH,
    MCP_MAX_REDIRECT_URIS,
    MCP_READ_SCOPE,
    MCP_SUPPORTED_GRANT_TYPES,
    MCP_SUPPORTED_RESPONSE_TYPES,
    MCP_UNUSED_CLIENT_PRUNE_BATCH,
    mcp_public_origin,
    mcp_settings,
)
from app.core.database import SessionLocal
from app.core.security import decrypt_secret, encrypt_secret
from app.domain.auth.security_events import record_security_event
from app.domain.workspaces.policy import WorkspaceCapability, roles_with
from app.models.mcp import (
    McpAuthorizationCode,
    McpAuthorizationRequest,
    McpOAuthClient,
    McpOAuthGrant,
)
from app.models.policy_acceptance import PolicyAcceptance
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


async def _consentable_workspaces(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[str, str]]:
    """Readable workspaces whose current Terms revision the user has accepted."""
    accepted = (
        select(PolicyAcceptance.id)
        .where(
            PolicyAcceptance.actor_id == user_id,
            PolicyAcceptance.workspace_id == Workspace.id,
            PolicyAcceptance.terms_revision == legal.TERMS_REVISION,
        )
        .exists()
    )
    rows = await session.execute(
        select(Workspace.id, Workspace.name)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.role.in_(roles_with(WorkspaceCapability.READ)),
            Workspace.is_system.is_(False),
            accepted,
        )
        .order_by(Workspace.name, Workspace.id)
    )
    return [(str(row.id), row.name) for row in rows]


class CiteLadderAuthorizationCode(AuthorizationCode):
    row_id: uuid.UUID
    user_id: uuid.UUID


class CiteLadderRefreshToken(RefreshToken):
    grant_id: uuid.UUID
    user_id: uuid.UUID
    resource: str


def public_base_url() -> str:
    return mcp_public_origin()


def resource_url() -> str:
    return f"{public_base_url()}/mcp"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _token_hash(value: str) -> str:
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def consent_csrf_token(session_token: str, transaction: str) -> str:
    """Derive the consent form's CSRF token from the browser session.

    Bound to both the session and the transaction, so a token is useless in
    another browser and cannot be replayed onto a different authorization
    request. Derived rather than stored: it needs no state and dies with the
    session it was minted from.
    """
    return _token_hash(f"mcp-consent:{session_token}:{transaction}")


def consent_csrf_valid(session_token: str, transaction: str, supplied: str) -> bool:
    return hmac.compare_digest(consent_csrf_token(session_token, transaction), supplied)


@dataclass(frozen=True, slots=True)
class PendingAuthorization:
    """What the consent page shows the account holder before they approve."""

    client_name: str
    scopes: tuple[str, ...]
    redirect_uri: str


def _account_allowed(user: User) -> bool:
    if not mcp_settings.enabled or demo_access_expired():
        return False
    allowed = mcp_settings.allowed_account_email.strip().casefold()
    if settings.demo_mode:
        return bool(allowed) and user.email.casefold() == allowed
    return not allowed or user.email.casefold() == allowed


def _registration_error(description: str) -> RegistrationError:
    return RegistrationError(
        error="invalid_client_metadata", error_description=description
    )


def _validate_client_metadata(client_info: OAuthClientInformationFull) -> None:
    """Accept only what this server can actually honor (RFC 7591 §3.2.2).

    The SDK already requires ``authorization_code``/``code`` and refuses the
    identity-assertion grant; anything beyond the supported sets would register
    a client for a flow no endpoint here serves.
    """
    unsupported_grants = set(client_info.grant_types) - MCP_SUPPORTED_GRANT_TYPES
    if unsupported_grants:
        raise _registration_error(
            "Unsupported grant_types: " + ", ".join(sorted(unsupported_grants))
        )
    if not set(client_info.response_types) <= MCP_SUPPORTED_RESPONSE_TYPES:
        raise _registration_error("response_types must be exactly ['code']")
    if len(client_info.client_name or "") > MCP_MAX_CLIENT_NAME_LENGTH:
        raise _registration_error("client_name is too long")
    redirect_uris = client_info.redirect_uris or []
    if not redirect_uris or len(redirect_uris) > MCP_MAX_REDIRECT_URIS:
        raise _registration_error(
            f"Between one and {MCP_MAX_REDIRECT_URIS} redirect URIs are required"
        )
    for redirect_uri in redirect_uris:
        _validate_redirect_uri(redirect_uri)


def _validate_redirect_uri(uri: AnyUrl) -> None:
    raw = str(uri)
    parsed = urlsplit(raw)
    loopback = parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if len(raw) > MCP_MAX_REDIRECT_URI_LENGTH:
        raise RegistrationError(
            error="invalid_redirect_uri",
            error_description="Redirect URI is too long",
        )
    # Redirects are matched exactly at /authorize, so a wildcard host would
    # only ever be a confused or hostile registration.
    if not parsed.hostname or "*" in parsed.netloc:
        raise RegistrationError(
            error="invalid_redirect_uri",
            error_description="Redirect URIs need one concrete host",
        )
    if parsed.fragment or parsed.username or parsed.password:
        raise RegistrationError(
            error="invalid_redirect_uri",
            error_description="Redirect URIs cannot contain credentials or fragments",
        )
    if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
        raise RegistrationError(
            error="invalid_redirect_uri",
            error_description="Redirect URIs must use HTTPS or loopback HTTP",
        )


async def _prune_unused_clients(session: AsyncSession) -> None:
    """Delete a bounded batch of stale registrations that never earned a grant.

    Registration is the only writer of client rows, so pruning here keeps the
    table proportional to real use even under sustained anonymous traffic.
    A client with a live authorization request or code is still mid-flow and
    is kept; one that has ever held a grant is never touched.
    """
    now = _utcnow()
    cutoff = now - timedelta(seconds=mcp_settings.unused_client_ttl_seconds)
    client_id = McpOAuthClient.client_id
    stale = (
        select(McpOAuthClient.id)
        .where(
            McpOAuthClient.created_at < cutoff,
            ~exists().where(McpOAuthGrant.client_id == client_id),
            ~exists().where(
                McpAuthorizationRequest.client_id == client_id,
                McpAuthorizationRequest.expires_at > now,
            ),
            ~exists().where(
                McpAuthorizationCode.client_id == client_id,
                McpAuthorizationCode.expires_at > now,
            ),
        )
        .order_by(McpOAuthClient.created_at)
        .limit(MCP_UNUSED_CLIENT_PRUNE_BATCH)
    )
    await session.execute(delete(McpOAuthClient).where(McpOAuthClient.id.in_(stale)))


class CiteLadderOAuthProvider:
    """SDK provider backed by PostgreSQL; no product data is stored here."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
    ) -> None:
        self._session_factory = session_factory

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async with self._session_factory() as session:
            row = await session.scalar(
                select(McpOAuthClient).where(McpOAuthClient.client_id == client_id)
            )
            if row is None:
                return None
            secret = (
                decrypt_secret(row.client_secret_encrypted)
                if row.client_secret_encrypted
                else None
            )
            return OAuthClientInformationFull.model_validate(
                {
                    **row.client_metadata,
                    "client_id": row.client_id,
                    "client_secret": secret,
                }
            )

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        # ``authorize`` and ``_account_allowed`` already fail closed when MCP is
        # off; registration is the one entry point that persisted a row without
        # asking, so it refuses too rather than relying on the HTTP dispatcher
        # to be the only thing standing in front of it.
        if not mcp_settings.enabled:
            raise RegistrationError(
                error="invalid_client_metadata",
                error_description="MCP access is not enabled",
            )
        _validate_client_metadata(client_info)
        try:
            uuid.UUID(client_info.client_id)
        except ValueError as exc:
            raise RegistrationError(
                error="invalid_client_metadata",
                error_description="Client IDs must be UUIDs",
            ) from exc
        metadata = client_info.model_dump(
            mode="json", exclude={"client_id", "client_secret"}
        )
        async with self._session_factory() as session:
            await _prune_unused_clients(session)
            session.add(
                McpOAuthClient(
                    client_id=client_info.client_id,
                    client_secret_encrypted=(
                        encrypt_secret(client_info.client_secret)
                        if client_info.client_secret
                        else ""
                    ),
                    client_metadata=metadata,
                )
            )
            await session.commit()

    async def authorize(
        self,
        client: OAuthClientInformationFull,
        params: AuthorizationParams,
    ) -> str:
        expected_resource = resource_url()
        if params.resource and params.resource.rstrip("/") != expected_resource:
            raise AuthorizeError(
                error="invalid_target",
                error_description="The requested resource is not this MCP server",
            )
        if not mcp_settings.enabled:
            raise AuthorizeError(
                error="temporarily_unavailable",
                error_description="MCP access is not enabled",
            )
        transaction = secrets.token_urlsafe(32)
        now = _utcnow()
        async with self._session_factory() as session:
            session.add(
                McpAuthorizationRequest(
                    transaction_hash=_token_hash(transaction),
                    client_id=client.client_id,
                    state=params.state or "",
                    scopes=params.scopes or [MCP_READ_SCOPE],
                    code_challenge=params.code_challenge,
                    redirect_uri=str(params.redirect_uri),
                    redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
                    resource=expected_resource,
                    expires_at=now
                    + timedelta(seconds=mcp_settings.authorization_request_ttl_seconds),
                )
            )
            await session.commit()
        browser_origin = settings.frontend_url.rstrip("/")
        return f"{browser_origin}/mcp/oauth/consent?transaction={transaction}"

    async def describe_authorization_request(
        self, transaction: str
    ) -> PendingAuthorization | None:
        """Read a live transaction for display, leaving it unconsumed."""
        now = _utcnow()
        async with self._session_factory() as session:
            # The client name is joined in rather than fetched through
            # ``get_client``: that opens a second session inside this one and
            # decrypts a client secret the consent page never shows.
            row = (
                await session.execute(
                    select(McpAuthorizationRequest, McpOAuthClient.client_metadata)
                    .join(
                        McpOAuthClient,
                        McpOAuthClient.client_id == McpAuthorizationRequest.client_id,
                    )
                    .where(
                        McpAuthorizationRequest.transaction_hash
                        == _token_hash(transaction),
                        McpAuthorizationRequest.consumed_at.is_(None),
                        McpAuthorizationRequest.expires_at > now,
                    )
                )
            ).first()
        if row is None:
            return None
        request, metadata = row
        return PendingAuthorization(
            client_name=str((metadata or {}).get("client_name") or request.client_id),
            scopes=tuple(request.scopes),
            redirect_uri=request.redirect_uri,
        )

    async def consent_workspaces(self, user_id: uuid.UUID) -> list[tuple[str, str]]:
        async with self._session_factory() as session:
            return await _consentable_workspaces(session, user_id)

    async def complete_authorization(
        self, transaction: str, user_id: uuid.UUID, workspace_ids: list[str]
    ) -> str:
        selected = sorted(set(workspace_ids))
        now = _utcnow()
        async with self._session_factory() as session:
            request = await session.scalar(
                select(McpAuthorizationRequest)
                .where(
                    McpAuthorizationRequest.transaction_hash
                    == _token_hash(transaction),
                    McpAuthorizationRequest.consumed_at.is_(None),
                    McpAuthorizationRequest.expires_at > now,
                )
                .with_for_update()
            )
            user = await session.scalar(select(User).where(User.id == user_id))
            if request is None or user is None or not user.is_active:
                raise PermissionError("Authorization request is invalid or expired")
            if not _account_allowed(user):
                raise PermissionError("This account is not enabled for MCP access")
            # Checked in the consuming transaction, not a separate read.
            consentable = await _consentable_workspaces(session, user.id)
            allowed = {identifier for identifier, _name in consentable}
            if not selected or not set(selected).issubset(allowed):
                raise PermissionError(
                    "Select at least one currently accessible workspace"
                )
            code = secrets.token_urlsafe(32)
            session.add(
                McpAuthorizationCode(
                    workspace_ids=selected,
                    code_hash=_token_hash(code),
                    client_id=request.client_id,
                    user_id=user.id,
                    scopes=request.scopes,
                    code_challenge=request.code_challenge,
                    redirect_uri=request.redirect_uri,
                    redirect_uri_provided_explicitly=request.redirect_uri_provided_explicitly,
                    resource=request.resource,
                    expires_at=now
                    + timedelta(seconds=mcp_settings.authorization_code_ttl_seconds),
                )
            )
            request.consumed_at = now
            for workspace_id in selected:
                record_security_event(
                    session,
                    event="mcp.consent",
                    actor_id=user.id,
                    workspace_id=uuid.UUID(workspace_id),
                )
            await session.commit()
            return construct_redirect_uri(
                request.redirect_uri,
                code=code,
                state=request.state or None,
            )

    async def deny_authorization(self, transaction: str) -> str:
        """Consume one validated pending request and return its fixed redirect."""

        now = _utcnow()
        async with self._session_factory() as session:
            request = await session.scalar(
                select(McpAuthorizationRequest)
                .where(
                    McpAuthorizationRequest.transaction_hash
                    == _token_hash(transaction),
                    McpAuthorizationRequest.consumed_at.is_(None),
                    McpAuthorizationRequest.expires_at > now,
                )
                .with_for_update()
            )
            if request is None:
                raise PermissionError("Authorization request is invalid or expired")
            request.consumed_at = now
            await session.commit()
            return construct_redirect_uri(
                request.redirect_uri,
                error="access_denied",
                error_description="The account owner denied access",
                state=request.state or None,
            )

    async def load_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: str,
    ) -> CiteLadderAuthorizationCode | None:
        now = _utcnow()
        async with self._session_factory() as session:
            row = await session.scalar(
                select(McpAuthorizationCode).where(
                    McpAuthorizationCode.code_hash == _token_hash(authorization_code),
                    McpAuthorizationCode.client_id == client.client_id,
                    McpAuthorizationCode.consumed_at.is_(None),
                    McpAuthorizationCode.expires_at > now,
                )
            )
            return _authorization_code(row, authorization_code) if row else None

    async def exchange_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: CiteLadderAuthorizationCode,
    ) -> OAuthToken:
        now = _utcnow()
        access_token = secrets.token_urlsafe(32)
        refresh_token = secrets.token_urlsafe(48)
        async with self._session_factory() as session:
            result = await session.execute(
                select(McpAuthorizationCode, User)
                .join(User, User.id == McpAuthorizationCode.user_id)
                .where(
                    McpAuthorizationCode.id == authorization_code.row_id,
                    McpAuthorizationCode.client_id == client.client_id,
                    McpAuthorizationCode.consumed_at.is_(None),
                    McpAuthorizationCode.expires_at > now,
                )
                .with_for_update()
            )
            pair = result.one_or_none()
            if (
                pair is None
                or not pair.User.is_active
                or not _account_allowed(pair.User)
            ):
                raise TokenError(
                    error="invalid_grant", error_description="Code is invalid"
                )
            row = pair.McpAuthorizationCode
            row.consumed_at = now
            session.add(
                McpOAuthGrant(
                    workspace_ids=row.workspace_ids,
                    client_id=client.client_id,
                    user_id=row.user_id,
                    access_token_hash=_token_hash(access_token),
                    refresh_token_hash=_token_hash(refresh_token),
                    scopes=row.scopes,
                    resource=row.resource,
                    access_expires_at=now
                    + timedelta(seconds=mcp_settings.access_token_ttl_seconds),
                    refresh_expires_at=now
                    + timedelta(seconds=mcp_settings.refresh_token_ttl_seconds),
                )
            )
            await session.commit()
        return _oauth_token(access_token, refresh_token, authorization_code.scopes)

    async def load_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: str,
    ) -> CiteLadderRefreshToken | None:
        now = _utcnow()
        async with self._session_factory() as session:
            row = await session.scalar(
                select(McpOAuthGrant).where(
                    McpOAuthGrant.refresh_token_hash == _token_hash(refresh_token),
                    McpOAuthGrant.client_id == client.client_id,
                    McpOAuthGrant.revoked_at.is_(None),
                    McpOAuthGrant.refresh_expires_at > now,
                )
            )
            if row is None or not row.workspace_ids:
                return None
            return CiteLadderRefreshToken(
                token=refresh_token,
                client_id=row.client_id,
                scopes=row.scopes,
                expires_at=int(row.refresh_expires_at.timestamp()),
                subject=str(row.user_id),
                grant_id=row.id,
                user_id=row.user_id,
                resource=row.resource,
            )

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: CiteLadderRefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        granted_scopes = scopes or refresh_token.scopes
        if not set(granted_scopes).issubset(refresh_token.scopes):
            raise TokenError(
                error="invalid_scope",
                error_description="Refresh cannot expand the original grant",
            )
        now = _utcnow()
        new_access = secrets.token_urlsafe(32)
        new_refresh = secrets.token_urlsafe(48)
        async with self._session_factory() as session:
            result = await session.execute(
                select(McpOAuthGrant, User)
                .join(User, User.id == McpOAuthGrant.user_id)
                .where(
                    McpOAuthGrant.id == refresh_token.grant_id,
                    McpOAuthGrant.client_id == client.client_id,
                    McpOAuthGrant.refresh_token_hash
                    == _token_hash(refresh_token.token),
                    McpOAuthGrant.revoked_at.is_(None),
                    McpOAuthGrant.refresh_expires_at > now,
                )
                .with_for_update()
            )
            pair = result.one_or_none()
            if (
                pair is None
                or not pair.User.is_active
                or not _account_allowed(pair.User)
            ):
                raise TokenError(
                    error="invalid_grant", error_description="Refresh token is invalid"
                )
            row = pair.McpOAuthGrant
            if not row.workspace_ids:
                raise TokenError(
                    error="invalid_grant", error_description="Renew workspace consent"
                )
            row.access_token_hash = _token_hash(new_access)
            row.refresh_token_hash = _token_hash(new_refresh)
            row.scopes = granted_scopes
            row.access_expires_at = now + timedelta(
                seconds=mcp_settings.access_token_ttl_seconds
            )
            row.refresh_expires_at = now + timedelta(
                seconds=mcp_settings.refresh_token_ttl_seconds
            )
            await session.commit()
        return _oauth_token(new_access, new_refresh, granted_scopes)

    async def load_access_token(self, token: str) -> AccessToken | None:
        now = _utcnow()
        async with self._session_factory() as session:
            result = await session.execute(
                select(McpOAuthGrant, User)
                .join(User, User.id == McpOAuthGrant.user_id)
                .where(
                    McpOAuthGrant.access_token_hash == _token_hash(token),
                    McpOAuthGrant.revoked_at.is_(None),
                    McpOAuthGrant.access_expires_at > now,
                )
            )
            pair = result.one_or_none()
            if pair is None:
                return None
            grant, user = pair
            if (
                not user.is_active
                or not _account_allowed(user)
                or not grant.workspace_ids
            ):
                return None
            return AccessToken(
                token=token,
                client_id=grant.client_id,
                scopes=grant.scopes,
                expires_at=int(grant.access_expires_at.timestamp()),
                resource=grant.resource,
                subject=str(grant.user_id),
                claims={
                    "iss": public_base_url(),
                    "grant_id": str(grant.id),
                    "token_hash": grant.access_token_hash,
                },
            )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        now = _utcnow()
        token_digest = _token_hash(token.token)
        async with self._session_factory() as session:
            row = await session.scalar(
                select(McpOAuthGrant).where(
                    McpOAuthGrant.client_id == token.client_id,
                    McpOAuthGrant.revoked_at.is_(None),
                    or_(
                        McpOAuthGrant.access_token_hash == token_digest,
                        McpOAuthGrant.refresh_token_hash == token_digest,
                    ),
                )
            )
            if row is not None:
                row.revoked_at = now
                record_security_event(
                    session, event="mcp.revoke", actor_id=row.user_id, target_id=row.id
                )
                await session.commit()

    async def exchange_identity_assertion(
        self,
        client: OAuthClientInformationFull,
        params: IdentityAssertionParams,
    ) -> OAuthToken:
        del client, params
        raise TokenError(
            error="unsupported_grant_type",
            error_description="Identity assertions are not supported",
        )


def _authorization_code(
    row: McpAuthorizationCode,
    raw_code: str,
) -> CiteLadderAuthorizationCode:
    return CiteLadderAuthorizationCode(
        code=raw_code,
        scopes=row.scopes,
        expires_at=row.expires_at.timestamp(),
        client_id=row.client_id,
        code_challenge=row.code_challenge,
        redirect_uri=AnyUrl(row.redirect_uri),
        redirect_uri_provided_explicitly=row.redirect_uri_provided_explicitly,
        resource=row.resource,
        subject=str(row.user_id),
        row_id=row.id,
        user_id=row.user_id,
    )


def _oauth_token(
    access_token: str, refresh_token: str, scopes: list[str]
) -> OAuthToken:
    return OAuthToken(
        access_token=access_token,
        token_type="Bearer",
        expires_in=mcp_settings.access_token_ttl_seconds,
        scope=" ".join(scopes),
        refresh_token=refresh_token,
    )
