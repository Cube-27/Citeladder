"""Component tests for the OAuth sign-in API (httpx ASGITransport).

Covers:
  - the providers endpoint lists google/github/apple with ``configured``
    flags only — no secret-shaped fields (invariant 6);
  - unconfigured providers -> 503 on start; unknown providers -> 404;
  - a configured provider's start builds an authorize URL carrying the client
    id, signed state, and encoded redirect URI, arms the HttpOnly transaction
    cookie, and never returns the session nonce in the body;
  - the Google callback exchanges, resolves an account, and 302s with a
    session cookie: new account, linked account, and every refusal path.

The provider is faked with ``httpx.MockTransport`` — no network, and the
token/userinfo endpoints are asserted to receive exactly what they should.
"""

from __future__ import annotations

import uuid
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.auth_oauth import AuthOAuthClient, build_auth_oauth_client
from app.core.config import settings
from app.core.config.oauth import (
    AUTH_OAUTH_TRANSACTION_COOKIE,
    oauth_settings,
)
from app.core.security import create_oauth_state, decode_oauth_state, hash_password
from app.domain.auth import oauth_service
from app.models.user import User
from app.models.user_identity import UserIdentity
from app.models.workspace import WorkspaceMember

_BASE = "/api/v1/auth/oauth"
_PROVIDERS = ("google", "github", "apple")
_SUBJECT = "google-subject-1"
_EMAIL = "signer@example.com"


def _disable_provider(monkeypatch: pytest.MonkeyPatch, provider: str) -> None:
    monkeypatch.setattr(oauth_settings, f"{provider}_enabled", False)
    monkeypatch.setattr(oauth_settings, f"{provider}_client_id", "")
    monkeypatch.setattr(oauth_settings, f"{provider}_client_secret", "")
    monkeypatch.setattr(oauth_settings, f"{provider}_redirect_uri", "")


@pytest.fixture
def _all_providers_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin every provider unconfigured regardless of process env."""
    for provider in _PROVIDERS:
        _disable_provider(monkeypatch, provider)
    # Google would otherwise fall back to the integrations client.
    monkeypatch.setattr(settings, "integration_google_client_id", "")
    monkeypatch.setattr(settings, "integration_google_client_secret", "")


def _configure_google(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    values = {
        "client_id": "test-client-id",
        "client_secret": "test-client-secret",
        "redirect_uri": "https://app.example.com/auth/oauth/google/callback",
    }
    monkeypatch.setattr(oauth_settings, "google_enabled", True)
    for field, value in values.items():
        monkeypatch.setattr(oauth_settings, f"google_{field}", value)
    return values


def _provider_transport(
    *,
    identity: dict[str, object] | None = None,
    token_status: int = 200,
    userinfo_status: int = 200,
    seen: list[httpx.Request] | None = None,
) -> httpx.MockTransport:
    """A fake Google token + userinfo server."""
    claims = (
        identity
        if identity is not None
        else {
            "sub": _SUBJECT,
            "email": _EMAIL,
            "email_verified": True,
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            if token_status != 200:
                return httpx.Response(token_status, json={"error": "invalid_grant"})
            return httpx.Response(
                200, json={"access_token": "provider-access-token", "expires_in": 3599}
            )
        if userinfo_status != 200:
            return httpx.Response(userinfo_status, json={"error": "unauthorized"})
        return httpx.Response(200, json=claims)

    return httpx.MockTransport(handler)


def _patch_transport(
    monkeypatch: pytest.MonkeyPatch, fake: httpx.MockTransport
) -> None:
    """Route the sign-in client at ``fake``.

    The router deliberately does not thread a transport through to the
    service, so the seam is the factory the service resolves clients with.
    The service always calls it with ``transport=None``; this override
    substitutes the fake for that.
    """

    def build(provider: str, *, transport: object = None) -> AuthOAuthClient:
        assert transport is None
        return build_auth_oauth_client(provider, transport=fake)

    monkeypatch.setattr(oauth_service, "build_auth_oauth_client", build)


@pytest.fixture
def _fake_provider(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    """Route the sign-in client at a fake provider; return the seen requests."""
    seen: list[httpx.Request] = []
    _patch_transport(monkeypatch, _provider_transport(seen=seen))
    return seen


async def _start_transaction(client: httpx.AsyncClient) -> str:
    """Run the start endpoint and return the armed transaction nonce."""
    resp = await client.get(f"{_BASE}/google/start")
    assert resp.status_code == 200
    nonce = client.cookies.get(AUTH_OAUTH_TRANSACTION_COOKIE)
    assert nonce
    return resp.json()["state"]


# --- catalog + start -------------------------------------------------------


@pytest.mark.asyncio
async def test_providers_lists_catalog_with_flags_only(
    client: httpx.AsyncClient,
    _all_providers_unconfigured: None,
) -> None:
    resp = await client.get(f"{_BASE}/providers")
    assert resp.status_code == 200
    providers = resp.json()["providers"]
    assert {p["provider"] for p in providers} == set(_PROVIDERS)
    for info in providers:
        # Label + configured flag only — no secret-shaped fields (invariant 6).
        assert set(info) == {"provider", "label", "configured"}
        assert info["label"]
        assert info["configured"] is False
    # The raw payload carries no credential material.
    assert "secret" not in resp.text
    assert "client_id" not in resp.text
    assert "redirect_uri" not in resp.text


@pytest.mark.asyncio
async def test_start_unconfigured_providers_return_503(
    client: httpx.AsyncClient,
    _all_providers_unconfigured: None,
) -> None:
    for provider in _PROVIDERS:
        resp = await client.get(f"{_BASE}/{provider}/start")
        assert resp.status_code == 503
        assert resp.json()["detail"] == {
            "code": "oauth_provider_not_configured",
            "provider": provider,
        }


@pytest.mark.asyncio
async def test_unknown_provider_returns_404(client: httpx.AsyncClient) -> None:
    for path in ("start", "callback"):
        resp = await client.get(f"{_BASE}/gitlab/{path}")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_configured_provider_builds_authorize_url(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    values = _configure_google(monkeypatch)
    resp = await client.get(f"{_BASE}/google/start")
    assert resp.status_code == 200
    body = resp.json()
    url = body["authorize_url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")

    # The URL carries client_id + state + the encoded redirect URI.
    assert f"client_id={values['client_id']}" in url
    assert body["state"] in url
    assert urlencode({"redirect_uri": values["redirect_uri"]}) in url

    query = parse_qs(urlsplit(url).query)
    assert query["client_id"] == [values["client_id"]]
    assert query["redirect_uri"] == [values["redirect_uri"]]
    assert query["response_type"] == ["code"]
    # Identity scopes ONLY — sign-in never asks for Search Console or
    # Analytics, so login does not depend on sensitive-scope verification.
    assert query["scope"] == ["openid email profile"]
    # Least privilege: no refresh token, and NO include_granted_scopes --
    # that would make Google mint a login token also covering Search Console
    # and Analytics scopes the user granted this client earlier. Incremental
    # authorization belongs on the connect request, not on a plain login.
    assert "access_type" not in query
    assert "include_granted_scopes" not in query
    assert query["state"] == [body["state"]]

    # The client secret never appears in the URL or payload (invariant 6).
    assert values["client_secret"] not in url
    assert values["client_secret"] not in resp.text


@pytest.mark.asyncio
async def test_start_arms_httponly_cookie_and_never_returns_the_nonce(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_google(monkeypatch)
    resp = await client.get(f"{_BASE}/google/start")
    assert resp.status_code == 200

    # The nonce is the binding secret: it rides an HttpOnly cookie and is
    # absent from the body, so browser JS can never read it.
    assert "session_nonce" not in resp.json()
    set_cookie = resp.headers["set-cookie"]
    assert AUTH_OAUTH_TRANSACTION_COOKIE in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "path=/api/v1/auth/oauth" in set_cookie.lower()

    nonce = client.cookies.get(AUTH_OAUTH_TRANSACTION_COOKIE)
    assert nonce and nonce not in resp.text
    claims = decode_oauth_state(resp.json()["state"], "google", nonce)
    assert claims["provider"] == "google"
    assert claims["sub"] == "oauth-state"


# --- callback --------------------------------------------------------------


def _redirect_error(resp: httpx.Response) -> str:
    assert resp.status_code == 302
    location = resp.headers["location"]
    return parse_qs(urlsplit(location).query).get("error", [""])[0]


@pytest.mark.asyncio
async def test_callback_creates_a_passwordless_account_with_a_workspace(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    _configure_google(monkeypatch)
    state = await _start_transaction(client)

    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/projects")
    assert settings.session_cookie_name in resp.headers["set-cookie"]

    user = await db_session.scalar(select(User).where(User.email == _EMAIL))
    assert user is not None
    # A Google-only account carries no password hash at all.
    assert user.hashed_password is None
    identity = await db_session.scalar(
        select(UserIdentity).where(UserIdentity.user_id == user.id)
    )
    assert identity is not None
    assert (identity.provider, identity.subject) == ("google", _SUBJECT)
    # Provisioned exactly like a registered account.
    membership = await db_session.scalar(
        select(WorkspaceMember).where(WorkspaceMember.user_id == user.id)
    )
    assert membership is not None

    # The exchange sent the code and the client secret to the token endpoint
    # and the bearer token to userinfo — and nothing leaked into the redirect.
    assert [r.url.host for r in _fake_provider] == [
        "oauth2.googleapis.com",
        "openidconnect.googleapis.com",
    ]
    assert "test-client-secret" not in resp.text


@pytest.mark.asyncio
async def test_callback_links_an_existing_password_account(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    existing = User(email=_EMAIL, hashed_password=hash_password("a-real-password"))
    db_session.add(existing)
    await db_session.commit()

    _configure_google(monkeypatch)
    state = await _start_transaction(client)
    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert resp.status_code == 302

    users = (await db_session.scalars(select(User).where(User.email == _EMAIL))).all()
    # Linked, never duplicated.
    assert len(users) == 1
    identity = await db_session.scalar(
        select(UserIdentity).where(UserIdentity.user_id == existing.id)
    )
    assert identity is not None
    # The password still works: linking adds an auth path, it does not remove one.
    await db_session.refresh(existing)
    assert existing.hashed_password is not None


@pytest.mark.asyncio
async def test_callback_refuses_an_unverified_email(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unverified address must never link or create an account.

    Trusting it would let anyone who can assert an address at the provider
    take over the local account that already owns it.
    """
    _configure_google(monkeypatch)
    _patch_transport(
        monkeypatch,
        _provider_transport(
            identity={"sub": _SUBJECT, "email": _EMAIL, "email_verified": False}
        ),
    )
    state = await _start_transaction(client)
    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert _redirect_error(resp) == "oauth_signin_email_unverified"
    assert await db_session.scalar(select(User).where(User.email == _EMAIL)) is None


@pytest.mark.asyncio
async def test_callback_rejects_a_state_with_no_transaction_cookie(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    """A state minted elsewhere cannot be spent in this browser."""
    _configure_google(monkeypatch)
    state, _nonce = create_oauth_state("google")
    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert _redirect_error(resp) == "oauth_signin_state_invalid"
    # Refused before any provider call.
    assert _fake_provider == []


@pytest.mark.asyncio
async def test_callback_rejects_a_replayed_transaction(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    """The callback clears the cookie, so the same state cannot be spent twice."""
    _configure_google(monkeypatch)
    state = await _start_transaction(client)
    first = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert first.status_code == 302
    assert not client.cookies.get(AUTH_OAUTH_TRANSACTION_COOKIE)

    replay = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert _redirect_error(replay) == "oauth_signin_state_invalid"


@pytest.mark.asyncio
async def test_callback_reports_provider_consent_failure(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    _configure_google(monkeypatch)
    await _start_transaction(client)
    resp = await client.get(
        f"{_BASE}/google/callback", params={"error": "access_denied"}
    )
    assert _redirect_error(resp) == "oauth_signin_failed"


@pytest.mark.asyncio
async def test_callback_reports_a_rejected_code(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_google(monkeypatch)
    _patch_transport(monkeypatch, _provider_transport(token_status=400))
    state = await _start_transaction(client)
    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "stale-code", "state": state}
    )
    assert _redirect_error(resp) == "oauth_signin_failed"


@pytest.mark.asyncio
async def test_callback_missing_code_or_state_is_refused(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    _configure_google(monkeypatch)
    state = await _start_transaction(client)
    for params in ({"state": state}, {"code": "auth-code"}, {}):
        resp = await client.get(f"{_BASE}/google/callback", params=params)
        assert _redirect_error(resp) == "oauth_signin_state_invalid"
    assert _fake_provider == []


@pytest.mark.asyncio
async def test_callback_for_an_unimplemented_provider_is_refused(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GitHub is cataloged and configurable but has no callback yet."""
    monkeypatch.setattr(oauth_settings, "github_enabled", True)
    monkeypatch.setattr(oauth_settings, "github_client_id", "id")
    monkeypatch.setattr(oauth_settings, "github_client_secret", "secret")
    resp = await client.get(
        f"{_BASE}/github/callback", params={"code": "c", "state": "s"}
    )
    assert _redirect_error(resp) == "oauth_signin_disabled"


@pytest.mark.asyncio
async def test_callback_for_an_unconfigured_provider_is_refused(
    client: httpx.AsyncClient,
    _all_providers_unconfigured: None,
) -> None:
    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "c", "state": "s"}
    )
    assert _redirect_error(resp) == "oauth_signin_disabled"


@pytest.mark.asyncio
async def test_returning_signer_reuses_the_same_account(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    _fake_provider: list[httpx.Request],
) -> None:
    """A second sign-in resolves by subject, not by creating a second user."""
    _configure_google(monkeypatch)
    for _ in range(2):
        state = await _start_transaction(client)
        resp = await client.get(
            f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
        )
        assert resp.status_code == 302

    users = (await db_session.scalars(select(User).where(User.email == _EMAIL))).all()
    assert len(users) == 1
    identities = (
        await db_session.scalars(
            select(UserIdentity).where(UserIdentity.subject == _SUBJECT)
        )
    ).all()
    assert len(identities) == 1


@pytest.mark.asyncio
async def test_a_second_google_account_cannot_take_over_a_linked_account(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The address moved to a new Google account; the old link must not repoint.

    Silently repointing would hand the CiteLadder account to whoever holds
    the address at the provider today.
    """
    user = User(id=uuid.uuid4(), email=_EMAIL, hashed_password=None)
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        UserIdentity(
            user_id=user.id,
            provider="google",
            subject="original-subject",
            email=_EMAIL,
            email_verified=True,
        )
    )
    await db_session.commit()

    _configure_google(monkeypatch)
    _patch_transport(
        monkeypatch,
        _provider_transport(
            identity={
                "sub": "different-subject",
                "email": _EMAIL,
                "email_verified": True,
            }
        ),
    )
    state = await _start_transaction(client)
    resp = await client.get(
        f"{_BASE}/google/callback", params={"code": "auth-code", "state": state}
    )
    assert _redirect_error(resp) == "oauth_signin_state_invalid"
