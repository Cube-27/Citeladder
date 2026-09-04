"""Third-party sign-in OAuth transport (google today; catalog-driven).

Performs the authorization-code exchange and the userinfo read behind
``/api/v1/auth/oauth/{provider}/callback``. Hand-rolled over ``httpx`` with
an injected transport (test seam), matching the integrations OAuth client
(``app/connectors/integrations/oauth.py``) contract-for-contract.

This is the SIGN-IN transport only. It reads an identity and nothing else:
it never requests offline access, never receives a refresh token, and never
persists anything. Long-lived provider grants for Search Console, Analytics,
and Bing belong to the integrations subsystem and stay there.

Identity comes from the provider's userinfo endpoint rather than the
``id_token``, which keeps JWKS fetching, caching, and key rotation out of the
codebase at the cost of one extra HTTPS call.

Invariant 6: the authorization code, the access token, and the env-injected
client secret pass through this module but are NEVER logged -- raised errors
carry only HTTP status codes and the provider's capped error text. Endpoints
come from ``app.core.config.oauth`` and every URL is checked against that
module's approved-host allow-list before a request is issued (SSRF policy).
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

from app.connectors.integrations._http import (
    IntegrationApiError,
    classify_status,
    oauth_error_detail,
)
from app.core.config.integrations_contracts import (
    ERROR_PROVIDER_API,
    ERROR_UNAPPROVED_ENDPOINT,
)
from app.core.config.oauth import (
    OAUTH_APPROVED_ENDPOINT_HOSTS,
    OAUTH_TOKEN_URLS,
    OAUTH_USERINFO_URLS,
    oauth_client_credentials,
)

# Sign-in is a foreground, user-blocking round trip; it never queues or
# retries, so a short ceiling is the right failure mode.
SIGNIN_REQUEST_TIMEOUT_SECONDS = 15.0


class AuthOAuthError(IntegrationApiError):
    """A sign-in OAuth call failed; carries a config-owned error token."""


@dataclass(frozen=True)
class SignInIdentity:
    """The provider's claim about who just signed in.

    ``subject`` is the provider's immutable account id (Google's ``sub``) and
    is the identity key; ``email`` is display + ``login_hint`` material only.
    ``email_verified`` gates linking to a pre-existing local account.
    """

    subject: str
    email: str
    email_verified: bool


def _assert_approved_url(url: str) -> None:
    """SSRF guard: the sign-in transport only calls allow-listed hosts."""
    host = (urlsplit(url).hostname or "").lower()
    if host not in OAUTH_APPROVED_ENDPOINT_HOSTS:
        raise AuthOAuthError(
            f"sign-in endpoint host is not approved: {host or 'unset'}",
            error_code=ERROR_UNAPPROVED_ENDPOINT,
        )


def _json_object_or_raise(response: httpx.Response, *, action: str) -> dict:
    """Validate a sign-in response and return its JSON object body."""
    if response.status_code != 200:
        error_code, retryable = classify_status(response.status_code)
        try:
            detail = oauth_error_detail(response.json())
        except ValueError:
            detail = ""
        suffix = f" ({detail})" if detail else ""
        raise AuthOAuthError(
            f"sign-in {action} returned HTTP {response.status_code}{suffix}",
            error_code=error_code,
            retryable=retryable,
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise AuthOAuthError(
            f"sign-in {action} returned a non-JSON body",
            error_code=ERROR_PROVIDER_API,
        ) from exc
    if not isinstance(payload, dict):
        raise AuthOAuthError(
            f"sign-in {action} returned an unexpected body",
            error_code=ERROR_PROVIDER_API,
        )
    return payload


# Matches the String(255) columns on ``UserIdentity`` that store these
# values, so an over-long claim is refused here rather than passing the
# connector and failing as a database error mid-sign-in. (An address is at
# most 254 octets per RFC 5321; a Google ``sub`` is ~21 characters.)
#
# Rejected outright rather than truncated: a truncated subject is a DIFFERENT
# identity, and silently shortening one would be a way to aim a sign-in at
# the wrong account.
_IDENTITY_FIELD_MAX_LEN = 255


def _identity_field(value: object) -> str:
    """Read one identity claim, or the empty string if it is unusable."""
    if not isinstance(value, str):
        return ""
    text = value.strip()
    return text if len(text) <= _IDENTITY_FIELD_MAX_LEN else ""


def _coerce_verified(value: object) -> bool:
    """Read the provider's verification claim.

    Google sends a JSON boolean at the userinfo endpoint but the string
    ``"true"`` in some id_token spellings. Anything else is treated as NOT
    verified -- this flag gates account linking, so it fails closed.
    """
    if isinstance(value, bool):
        return value
    return isinstance(value, str) and value.strip().lower() == "true"


class AuthOAuthClient:
    """Sign-in OAuth client for one provider.

    ``transport`` is the test seam (``httpx.MockTransport``); production
    passes nothing and the client uses the real network.
    """

    def __init__(
        self,
        provider: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if provider not in OAUTH_TOKEN_URLS or provider not in OAUTH_USERINFO_URLS:
            raise AuthOAuthError(
                f"unknown sign-in provider: {provider!r}",
                error_code=ERROR_PROVIDER_API,
            )
        self._provider = provider
        self._transport = transport

    def _http_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=self._transport,
            timeout=SIGNIN_REQUEST_TIMEOUT_SECONDS,
        )

    async def _exchange_code(self, *, code: str, redirect_uri: str) -> str:
        """Trade the authorization code for an access token."""
        url = OAUTH_TOKEN_URLS[self._provider]
        _assert_approved_url(url)
        client_id, client_secret = oauth_client_credentials(self._provider)
        form = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
        try:
            async with self._http_client() as client:
                response = await client.post(url, data=form)
        except httpx.HTTPError as exc:
            raise AuthOAuthError(
                f"sign-in code exchange request failed: {type(exc).__name__}",
                error_code=ERROR_PROVIDER_API,
                retryable=True,
            ) from exc
        payload = _json_object_or_raise(response, action="code exchange")
        access_token = str(payload.get("access_token") or "")
        if not access_token:
            raise AuthOAuthError(
                "sign-in code exchange returned no access_token",
                error_code=ERROR_PROVIDER_API,
            )
        return access_token

    async def _userinfo(self, *, access_token: str) -> SignInIdentity:
        """Read the signed-in account's subject + email."""
        url = OAUTH_USERINFO_URLS[self._provider]
        _assert_approved_url(url)
        try:
            async with self._http_client() as client:
                response = await client.get(
                    url,
                    # Set per-request and never logged (invariant 6).
                    headers={"Authorization": f"Bearer {access_token}"},
                )
        except httpx.HTTPError as exc:
            raise AuthOAuthError(
                f"sign-in userinfo request failed: {type(exc).__name__}",
                error_code=ERROR_PROVIDER_API,
                retryable=True,
            ) from exc
        payload = _json_object_or_raise(response, action="userinfo")
        subject = _identity_field(payload.get("sub"))
        email = _identity_field(payload.get("email")).lower()
        if not subject or not email:
            raise AuthOAuthError(
                "sign-in userinfo returned no subject or email",
                error_code=ERROR_PROVIDER_API,
            )
        return SignInIdentity(
            subject=subject,
            email=email,
            email_verified=_coerce_verified(payload.get("email_verified")),
        )

    async def identify(self, *, code: str, redirect_uri: str) -> SignInIdentity:
        """Exchange the code and return who the provider says signed in."""
        access_token = await self._exchange_code(code=code, redirect_uri=redirect_uri)
        return await self._userinfo(access_token=access_token)


def build_auth_oauth_client(
    provider: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> AuthOAuthClient:
    """Build a sign-in OAuth client (``transport`` = test seam).

    The domain service resolves clients through this factory so component
    tests can inject an ``httpx.MockTransport`` fake provider.
    """
    return AuthOAuthClient(provider, transport=transport)
