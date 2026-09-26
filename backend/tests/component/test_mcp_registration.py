"""Abuse controls on anonymous MCP dynamic client registration."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.config.abuse import abuse_settings
from app.core.config.mcp import (
    MCP_READ_SCOPE,
    MCP_REGISTRATION_MAX_BODY_BYTES,
    mcp_settings,
)
from app.domain.mcp import oauth_provider
from app.domain.mcp.server import (
    MCP_REGISTRATION_PATH,
    mcp_oauth_provider,
    mcp_registration_guard,
)
from app.models.mcp import McpAuthorizationRequest, McpOAuthClient
from app.models.user import User
from tests.component.mcp_helpers import read_grant


def _metadata(**overrides: object) -> dict[str, object]:
    return {
        "client_name": "Registration test client",
        "redirect_uris": ["http://127.0.0.1/callback"],
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "scope": MCP_READ_SCOPE,
        **overrides,
    }


@pytest.fixture
def registration(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> httpx.AsyncClient:
    """Enabled MCP behind a trusted proxy, so X-Forwarded-For names the client."""
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "127.0.0.0/8")
    monkeypatch.setattr(mcp_oauth_provider, "_session_factory", session_factory)
    monkeypatch.setattr(mcp_registration_guard, "_session_factory", session_factory)
    client.headers["Host"] = "127.0.0.1:3000"
    return client


async def _register(client: httpx.AsyncClient, source_ip: str) -> httpx.Response:
    return await client.post(
        MCP_REGISTRATION_PATH,
        json=_metadata(),
        headers={"X-Forwarded-For": source_ip},
    )


async def _client_count(session_factory: async_sessionmaker[AsyncSession]) -> int:
    async with session_factory() as session:
        return int(
            await session.scalar(select(func.count()).select_from(McpOAuthClient)) or 0
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "budget", ["mcp_register_burst_limit", "mcp_register_client_limit"]
)
async def test_registration_is_throttled_per_forwarded_client(
    registration: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    budget: str,
) -> None:
    monkeypatch.setattr(abuse_settings, budget, 2)

    for _ in range(2):
        assert (await _register(registration, "198.51.100.7")).status_code == 201
    refused = await _register(registration, "198.51.100.7")

    assert refused.status_code == 429
    assert int(refused.headers["retry-after"]) >= 1
    assert refused.headers["access-control-allow-origin"] == "*"
    assert refused.json()["error"] == "temporarily_unavailable"
    # Another client behind the same proxy keeps its own budget.
    assert (await _register(registration, "203.0.113.9")).status_code == 201
    assert await _client_count(session_factory) == 3


@pytest.mark.asyncio
async def test_global_budget_caps_distributed_registration(
    registration: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(abuse_settings, "mcp_register_client_limit", 1)
    monkeypatch.setattr(abuse_settings, "mcp_register_global_limit", 2)

    assert (await _register(registration, "198.51.100.1")).status_code == 201
    # Refused by its own budget, so it must not spend the shared one.
    assert (await _register(registration, "198.51.100.1")).status_code == 429
    assert (await _register(registration, "198.51.100.2")).status_code == 201
    assert (await _register(registration, "198.51.100.3")).status_code == 429
    assert await _client_count(session_factory) == 2


@pytest.mark.asyncio
async def test_registration_preflight_is_not_metered(
    registration: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(abuse_settings, "mcp_register_client_limit", 1)
    for _ in range(3):
        preflight = await registration.options(
            MCP_REGISTRATION_PATH,
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert preflight.status_code == 200
    assert (await _register(registration, "198.51.100.7")).status_code == 201


@pytest.mark.asyncio
async def test_registration_body_is_held_to_a_registration_size(
    registration: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    padded = _metadata(
        client_uri="https://example.test/" + "a" * MCP_REGISTRATION_MAX_BODY_BYTES
    )
    response = await registration.post(MCP_REGISTRATION_PATH, json=padded)
    assert response.status_code == 413
    assert await _client_count(session_factory) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"grant_types": ["authorization_code", "client_credentials"]},
        {"response_types": ["code", "token"]},
        {"redirect_uris": ["https://*.example.test/callback"]},
        {"redirect_uris": ["https://example.test/" + "a" * 2_100]},
        {"redirect_uris": ["myapp://callback"]},
        {"redirect_uris": [f"https://example.test/{index}" for index in range(11)]},
        {"client_name": "x" * 201},
    ],
    ids=[
        "grant",
        "response-type",
        "wildcard-host",
        "long-redirect",
        "custom-scheme",
        "too-many-redirects",
        "long-name",
    ],
)
async def test_registration_refuses_metadata_it_cannot_honor(
    registration: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    overrides: dict[str, object],
) -> None:
    response = await registration.post(
        MCP_REGISTRATION_PATH, json=_metadata(**overrides)
    )
    assert response.status_code == 400
    assert response.json()["error"] in {
        "invalid_client_metadata",
        "invalid_redirect_uri",
    }
    assert await _client_count(session_factory) == 0


@pytest.mark.asyncio
async def test_registration_prunes_only_stale_clients_that_never_earned_a_grant(
    registration: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # One slot, taken by the oldest rows first: kept clients must not occupy
    # the batch, or pruning would stall behind them forever.
    monkeypatch.setattr(oauth_provider, "MCP_UNUSED_CLIENT_PRUNE_BATCH", 1)
    stale = datetime.now(UTC) - timedelta(
        seconds=mcp_settings.unused_client_ttl_seconds + 60
    )
    abandoned, mid_flow, fresh = (str(uuid.uuid4()) for _ in range(3))
    async with session_factory() as session:
        user = User(email="granted@example.test", hashed_password="unused-test-hash")
        session.add(user)
        session.add_all(
            [
                McpOAuthClient(
                    client_id=abandoned, created_at=stale + timedelta(seconds=30)
                ),
                McpOAuthClient(client_id=mid_flow, created_at=stale),
                McpOAuthClient(client_id=fresh),
            ]
        )
        await session.flush()
        session.add(
            McpAuthorizationRequest(
                transaction_hash=uuid.uuid4().hex,
                client_id=mid_flow,
                code_challenge="C" * 43,
                redirect_uri="http://127.0.0.1/callback",
                redirect_uri_provided_explicitly=True,
                resource="http://127.0.0.1:3000/mcp",
                expires_at=datetime.now(UTC) + timedelta(minutes=5),
            )
        )
        await session.commit()
        granted = (await read_grant(session, user.id, [])).client_id
    async with session_factory() as session:
        row = await session.scalar(
            select(McpOAuthClient).where(McpOAuthClient.client_id == granted)
        )
        assert row is not None
        row.created_at = stale
        await session.commit()

    assert (await _register(registration, "198.51.100.7")).status_code == 201

    async with session_factory() as session:
        remaining = set(await session.scalars(select(McpOAuthClient.client_id)))
    assert abandoned not in remaining
    assert {mid_flow, fresh, granted} <= remaining
    assert len(remaining) == 4
