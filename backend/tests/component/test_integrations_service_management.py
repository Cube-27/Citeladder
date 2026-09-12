"""Component tests for the integrations connection-management service.

``app/domain/integrations/service.py`` sat at 43% line coverage, and the
uncovered half was the management surface: workspace-scoped reads, the probe,
and — most importantly — ``delete_connection``, whose whole reason to exist is
that credentials live on a SHARED grant. Its three outcomes each carry a
different security consequence:

- a sibling connection still uses the grant → tokens retained, nothing revoked;
- last connection, remote revoke succeeds → grant revoked, tokens destroyed;
- last connection, remote revoke FAILS → tokens deliberately RETAINED and the
  grant parked in ``pending_revocation`` so a retry can finish the job.

Destroying tokens on the failure path would orphan a live grant at the
provider, which is exactly the bug an untested branch hides. Grants and
connections are seeded through the ORM so each test targets one branch; the
OAuth client is always a fake, so nothing here reaches a provider.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.integrations import oauth as integration_oauth
from app.connectors.integrations._http import IntegrationApiError
from app.core.config.integrations_clients import INTEGRATION_CLIENT_BUILDERS
from app.core.config.integrations_contracts import (
    ERROR_GRANT_AUTH_FAILED,
    ERROR_PROPERTY_NOT_ACCESSIBLE,
    ERROR_PROVIDER_API,
    ERROR_TOKEN_REFRESH_FAILED,
    EVENT_INTEGRATION_DISCONNECTED,
    EVENT_INTEGRATION_REVOKE_FAILED,
    EVENT_INTEGRATION_REVOKED,
    EVENT_INTEGRATION_TESTED,
    GRANT_STATUS_CONNECTED,
    GRANT_STATUS_PENDING_REVOCATION,
    GRANT_STATUS_REVOKED,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_BING,
    INTEGRATION_PROVIDER_GA4,
    INTEGRATION_PROVIDER_GSC,
    INTEGRATION_TRANSPORT_GOOGLE,
    INTEGRATION_TRANSPORT_MICROSOFT,
)
from app.core.config.provider_catalog import TEST_STATUS_FAILED, TEST_STATUS_OK
from app.core.security import decrypt_secret, encrypt_secret
from app.domain.integrations import service as integrations_service
from app.domain.integrations.errors import (
    IntegrationConnectionNotFoundError,
    PropertyDiscoveryUnsupportedError,
)
from app.domain.integrations.service import (
    delete_connection,
    get_connection,
    list_available_properties,
    list_connections,
    run_connection_test,
)
from app.models.integrations import (
    IntegrationConnection,
    IntegrationEvent,
    IntegrationOAuthGrant,
)
from app.models.workspace import Workspace

_ACCESS_TOKEN = "access-token-value"  # pragma: allowlist secret
_REFRESH_TOKEN = "refresh-token-value"  # pragma: allowlist secret


# The property the seeded connections select, and which the fake provider
# lists. The test now verifies the SELECTED property is readable.
_PROBE_PROPERTY_REF = "sc-domain:example.com"


class _FakeOAuthClient:
    """Records revoke calls; raises the fault a test asks for."""

    def __init__(self, *, fault: Exception | None = None) -> None:
        self.fault = fault
        self.revoked: list[str] = []

    async def revoke(self, *, token: str) -> None:
        self.revoked.append(token)
        if self.fault is not None:
            raise self.fault


class _FakeDataClient:
    """Answers ``list_properties`` — what the connection test now probes."""

    def __init__(self) -> None:
        self.fault: Exception | None = None
        self.listed: list[str] = []
        self.properties: list[str] = [_PROBE_PROPERTY_REF]

    async def list_properties(self, *, access_token: str):
        self.listed.append(access_token)
        if self.fault is not None:
            raise self.fault
        return [SimpleNamespace(property_ref=ref, label=ref) for ref in self.properties]


@pytest.fixture
def fake_oauth_client(monkeypatch: pytest.MonkeyPatch) -> _FakeOAuthClient:
    client = _FakeOAuthClient()
    monkeypatch.setattr(
        integration_oauth,
        "build_oauth_client",
        lambda *_args, **_kwargs: client,
    )
    return client


@pytest.fixture
def fake_data_client(monkeypatch: pytest.MonkeyPatch) -> _FakeDataClient:
    """The connection test reads the connection's OWN provider.

    It used to issue the shared Google OAuth probe (a Search Console call)
    whatever the connection was, so a GA4 connection was never actually
    tested. The probe now goes through the config-owned client registry.
    """
    client = _FakeDataClient()
    for provider in INTEGRATION_CLIENT_BUILDERS:
        monkeypatch.setitem(
            INTEGRATION_CLIENT_BUILDERS, provider, lambda **_kwargs: client
        )
    return client


async def _workspace(session: AsyncSession, name: str) -> uuid.UUID:
    workspace = Workspace(name=name)
    session.add(workspace)
    await session.flush()
    return workspace.id


async def _grant(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    transport: str = INTEGRATION_TRANSPORT_GOOGLE,
    refresh_token: str | None = _REFRESH_TOKEN,
    token_expires_at: datetime | None = None,
) -> IntegrationOAuthGrant:
    grant = IntegrationOAuthGrant(
        workspace_id=workspace_id,
        transport=transport,
        status=GRANT_STATUS_CONNECTED,
        access_token_encrypted=encrypt_secret(_ACCESS_TOKEN),
        refresh_token_encrypted=(
            encrypt_secret(refresh_token) if refresh_token else ""
        ),
        granted_scopes=["scope-a"],
        # A live token by default. Callers that want the refresh path say so;
        # leaving this null made EVERY caller take it.
        token_expires_at=token_expires_at or datetime.now(UTC) + timedelta(hours=1),
    )
    session.add(grant)
    await session.flush()
    return grant


async def _connection(
    session: AsyncSession,
    grant: IntegrationOAuthGrant,
    *,
    provider: str = INTEGRATION_PROVIDER_GSC,
    account_ref: str = _PROBE_PROPERTY_REF,
) -> IntegrationConnection:
    connection = IntegrationConnection(
        workspace_id=grant.workspace_id,
        grant_id=grant.id,
        provider=provider,
        account_ref=account_ref,
    )
    session.add(connection)
    await session.flush()
    return connection


async def _events(session: AsyncSession, grant_id: uuid.UUID) -> list[IntegrationEvent]:
    rows = await session.scalars(
        select(IntegrationEvent)
        .where(IntegrationEvent.grant_id == grant_id)
        .order_by(IntegrationEvent.created_at.asc())
    )
    return list(rows)


# --- workspace-scoped reads ----------------------------------------------


@pytest.mark.asyncio
async def test_get_connection_from_another_workspace_is_not_found(
    db_session: AsyncSession,
) -> None:
    mine = await _workspace(db_session, "Mine")
    theirs = await _workspace(db_session, "Theirs")
    connection = await _connection(db_session, await _grant(db_session, mine))

    # Knowing the ID is not authorization.
    with pytest.raises(IntegrationConnectionNotFoundError):
        await get_connection(
            db_session, workspace_id=theirs, connection_id=connection.id
        )


@pytest.mark.asyncio
async def test_get_connection_with_an_unknown_id_is_not_found(
    db_session: AsyncSession,
) -> None:
    mine = await _workspace(db_session, "Mine")

    with pytest.raises(IntegrationConnectionNotFoundError):
        await get_connection(db_session, workspace_id=mine, connection_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_list_connections_joins_grant_state_and_never_leaks_a_token(
    db_session: AsyncSession,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    await _connection(db_session, grant, provider=INTEGRATION_PROVIDER_GSC)
    await _connection(db_session, grant, provider=INTEGRATION_PROVIDER_GA4)
    await db_session.commit()

    rows = await list_connections(db_session, workspace_id=mine)

    assert {row.provider for row in rows} == {
        INTEGRATION_PROVIDER_GSC,
        INTEGRATION_PROVIDER_GA4,
    }
    assert all(row.grant_status == GRANT_STATUS_CONNECTED for row in rows)
    assert all(row.granted_scopes == ["scope-a"] for row in rows)
    # Invariant 6: no token, encrypted or otherwise, reaches a DTO.
    serialized = " ".join(row.model_dump_json() for row in rows)
    assert _ACCESS_TOKEN not in serialized
    assert _REFRESH_TOKEN not in serialized


@pytest.mark.asyncio
async def test_list_connections_excludes_other_workspaces(
    db_session: AsyncSession,
) -> None:
    mine = await _workspace(db_session, "Mine")
    theirs = await _workspace(db_session, "Theirs")
    await _connection(db_session, await _grant(db_session, mine))
    await _connection(db_session, await _grant(db_session, theirs))
    await db_session.commit()

    rows = await list_connections(db_session, workspace_id=mine)

    assert len(rows) == 1
    assert rows[0].workspace_id == mine


# --- probe ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_successful_probe_records_an_append_only_ok_event(
    db_session: AsyncSession,
    fake_data_client: _FakeDataClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()

    result = await run_connection_test(
        db_session, workspace_id=mine, connection_id=connection.id
    )

    assert (result.status, result.error_code, result.detail) == (
        TEST_STATUS_OK,
        "",
        "Connection succeeded",
    )
    # One read against the connection's own provider, with a usable token.
    assert fake_data_client.listed == [_ACCESS_TOKEN]
    events = await _events(db_session, grant.id)
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_TESTED]
    assert _ACCESS_TOKEN not in str(events[0].payload)


@pytest.mark.asyncio
async def test_a_provider_fault_fails_the_probe_with_its_error_code(
    db_session: AsyncSession,
    fake_data_client: _FakeDataClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()
    fake_data_client.fault = IntegrationApiError(
        "provider said no", error_code=ERROR_GRANT_AUTH_FAILED
    )

    result = await run_connection_test(
        db_session, workspace_id=mine, connection_id=connection.id
    )

    assert result.status == TEST_STATUS_FAILED
    assert result.error_code == ERROR_GRANT_AUTH_FAILED
    assert "provider said no" in result.detail
    # A failed probe is NOT a rotation: the grant keeps its credentials.
    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_CONNECTED
    assert decrypt_secret(grant.access_token_encrypted) == _ACCESS_TOKEN


@pytest.mark.asyncio
async def test_an_unexpected_fault_fails_the_probe_without_leaking_its_message(
    db_session: AsyncSession,
    fake_data_client: _FakeDataClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()
    fake_data_client.fault = RuntimeError(_ACCESS_TOKEN)

    result = await run_connection_test(
        db_session, workspace_id=mine, connection_id=connection.id
    )

    assert result.status == TEST_STATUS_FAILED
    assert result.error_code == ERROR_PROVIDER_API
    # Only the exception TYPE is reported: an arbitrary exception message can
    # carry the credential that caused it.
    assert result.detail == "Unexpected error: RuntimeError"
    assert _ACCESS_TOKEN not in result.detail


@pytest.mark.asyncio
async def test_a_near_expiry_token_is_refreshed_before_the_probe(
    db_session: AsyncSession,
    fake_data_client: _FakeDataClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A healthy grant an hour old must not report FAILED.

    The probe read the encrypted access token directly. Google's lives about
    an hour, so "Test connection" failed on a grant connected yesterday while
    the property picker beside it — which refreshes — worked fine.
    """
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(
        db_session, mine, token_expires_at=datetime.now(UTC) - timedelta(minutes=5)
    )
    connection = await _connection(db_session, grant)
    await db_session.commit()

    refreshed_token = "refreshed-access-token"  # pragma: allowlist secret
    calls: list[str] = []

    async def _fake_refresh(session, *, grant, transport=None):
        calls.append(decrypt_secret(grant.refresh_token_encrypted))
        return refreshed_token

    monkeypatch.setattr(
        "app.domain.integrations.service.fresh_access_token", _fake_refresh
    )

    result = await run_connection_test(
        db_session, workspace_id=mine, connection_id=connection.id
    )

    assert result.status == TEST_STATUS_OK
    assert calls == [_REFRESH_TOKEN]
    # The probe used the REFRESHED token, not the stale stored one.
    assert fake_data_client.listed == [refreshed_token]


@pytest.mark.asyncio
async def test_an_inaccessible_property_does_not_pass(
    db_session: AsyncSession,
    fake_data_client: _FakeDataClient,
) -> None:
    """Enumerating the account is not evidence the property is readable.

    The old probe only asked whether the token worked at all, so a connection
    pointed at a property the account had lost access to still reported OK —
    and the next sync failed with a confusing provider error instead.
    """
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(
        db_session, grant, account_ref="sc-domain:not-mine.example"
    )
    await db_session.commit()

    result = await run_connection_test(
        db_session, workspace_id=mine, connection_id=connection.id
    )

    assert result.status == TEST_STATUS_FAILED
    assert result.error_code == ERROR_PROPERTY_NOT_ACCESSIBLE
    assert "not-mine.example" in result.detail
    # The account listing itself succeeded — this is a property fault, not an
    # authorization fault, and the two carry different remedies.
    assert fake_data_client.listed == [_ACCESS_TOKEN]


@pytest.mark.asyncio
async def test_a_connection_with_no_property_reports_the_grant_is_valid(
    db_session: AsyncSession,
    fake_data_client: _FakeDataClient,
) -> None:
    """Nothing selected yet is not a failure."""
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant, account_ref="")
    await db_session.commit()

    result = await run_connection_test(
        db_session, workspace_id=mine, connection_id=connection.id
    )

    assert result.status == TEST_STATUS_OK
    assert "No property selected" in result.detail


# --- property discovery ---------------------------------------------------


@pytest.mark.asyncio
async def test_property_discovery_is_refused_rather_than_returning_nothing(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Discovery fails closed for a provider that is not on the allow-list.

    Every shipped provider is discoverable, so the guard is exercised by
    removing one from the config set rather than by pretending a real one is
    unsupported. It must refuse before touching the grant or the network: an
    empty list would read as "you own nothing".
    """
    monkeypatch.setattr(
        integrations_service,
        "INTEGRATION_PROPERTY_DISCOVERY_PROVIDERS",
        frozenset({INTEGRATION_PROVIDER_GSC, INTEGRATION_PROVIDER_GA4}),
    )
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine, transport=INTEGRATION_TRANSPORT_MICROSOFT)
    connection = await _connection(
        db_session, grant, provider=INTEGRATION_PROVIDER_BING
    )
    await db_session.commit()

    with pytest.raises(PropertyDiscoveryUnsupportedError):
        await list_available_properties(
            db_session, workspace_id=mine, connection_id=connection.id
        )


@pytest.mark.asyncio
async def test_property_discovery_from_another_workspace_is_not_found(
    db_session: AsyncSession,
) -> None:
    mine = await _workspace(db_session, "Mine")
    theirs = await _workspace(db_session, "Theirs")
    connection = await _connection(db_session, await _grant(db_session, mine))
    await db_session.commit()

    with pytest.raises(IntegrationConnectionNotFoundError):
        await list_available_properties(
            db_session, workspace_id=theirs, connection_id=connection.id
        )


# --- delete: the shared-grant contract ------------------------------------


@pytest.mark.asyncio
async def test_deleting_one_of_two_connections_retains_the_shared_grant(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    gsc = await _connection(db_session, grant, provider=INTEGRATION_PROVIDER_GSC)
    ga4 = await _connection(db_session, grant, provider=INTEGRATION_PROVIDER_GA4)
    await db_session.commit()

    await delete_connection(db_session, workspace_id=mine, connection_id=gsc.id)

    survivors = await list_connections(db_session, workspace_id=mine)
    assert [row.id for row in survivors] == [ga4.id]
    await db_session.refresh(grant)
    # Revoking here would silently break the sibling connection.
    assert grant.status == GRANT_STATUS_CONNECTED
    assert decrypt_secret(grant.access_token_encrypted) == _ACCESS_TOKEN
    assert fake_oauth_client.revoked == []
    events = await _events(db_session, grant.id)
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_DISCONNECTED]
    assert events[0].payload["grant_retained"] is True


@pytest.mark.asyncio
async def test_deleting_the_last_connection_revokes_the_grant_and_drops_tokens(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()

    await delete_connection(db_session, workspace_id=mine, connection_id=connection.id)

    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_REVOKED
    assert grant.access_token_encrypted == ""
    assert grant.refresh_token_encrypted == ""
    assert grant.token_expires_at is None
    # The refresh token is the long-lived credential, so that is what gets
    # revoked at the provider.
    assert fake_oauth_client.revoked == [_REFRESH_TOKEN]
    events = await _events(db_session, grant.id)
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_REVOKED]
    assert events[0].payload["remote_revoke"] is True


@pytest.mark.asyncio
async def test_the_access_token_is_revoked_when_there_is_no_refresh_token(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine, refresh_token=None)
    connection = await _connection(db_session, grant)
    await db_session.commit()

    await delete_connection(db_session, workspace_id=mine, connection_id=connection.id)

    assert fake_oauth_client.revoked == [_ACCESS_TOKEN]


@pytest.mark.asyncio
async def test_a_failed_remote_revoke_retains_the_tokens_for_a_retry(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()
    fake_oauth_client.fault = integration_oauth.IntegrationOAuthError(
        "revoke refused", error_code=ERROR_TOKEN_REFRESH_FAILED
    )

    await delete_connection(db_session, workspace_id=mine, connection_id=connection.id)

    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_PENDING_REVOCATION
    # Destroying the tokens here would orphan a grant that is still LIVE at the
    # provider, with nothing left locally able to revoke it.
    assert decrypt_secret(grant.refresh_token_encrypted) == _REFRESH_TOKEN
    events = await _events(db_session, grant.id)
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_REVOKE_FAILED]
    assert events[0].payload["error_code"] == fake_oauth_client.fault.error_code
    # The local disconnect still happened: it commits before the remote call.
    assert await list_connections(db_session, workspace_id=mine) == []


@pytest.mark.asyncio
async def test_an_unexpected_revoke_fault_also_retains_the_tokens(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()
    fake_oauth_client.fault = RuntimeError("socket died")

    await delete_connection(db_session, workspace_id=mine, connection_id=connection.id)

    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_PENDING_REVOCATION
    assert decrypt_secret(grant.refresh_token_encrypted) == _REFRESH_TOKEN
    events = await _events(db_session, grant.id)
    assert events[0].payload["error_code"] == ERROR_PROVIDER_API


@pytest.mark.asyncio
async def test_a_transport_with_no_revoke_endpoint_revokes_locally(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    grant = await _grant(db_session, mine, transport=INTEGRATION_TRANSPORT_MICROSOFT)
    connection = await _connection(
        db_session, grant, provider=INTEGRATION_PROVIDER_BING
    )
    await db_session.commit()

    await delete_connection(db_session, workspace_id=mine, connection_id=connection.id)

    await db_session.refresh(grant)
    # Microsoft exposes no revocation endpoint, so this is a documented
    # local-only path — not a silent failure.
    assert grant.status == GRANT_STATUS_REVOKED
    assert grant.access_token_encrypted == ""
    assert fake_oauth_client.revoked == []
    events = await _events(db_session, grant.id)
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_REVOKED]
    assert events[0].payload["remote_revoke"] is False


@pytest.mark.asyncio
async def test_delete_from_another_workspace_leaves_the_connection_intact(
    db_session: AsyncSession,
    fake_oauth_client: _FakeOAuthClient,
) -> None:
    mine = await _workspace(db_session, "Mine")
    theirs = await _workspace(db_session, "Theirs")
    grant = await _grant(db_session, mine)
    connection = await _connection(db_session, grant)
    await db_session.commit()

    with pytest.raises(IntegrationConnectionNotFoundError):
        await delete_connection(
            db_session, workspace_id=theirs, connection_id=connection.id
        )

    assert [
        row.id for row in await list_connections(db_session, workspace_id=mine)
    ] == [connection.id]
    assert fake_oauth_client.revoked == []
