"""DataForSEO transport for the Google AI Overview surface.

DataForSEO is reached over HTTP Basic with a login/password pair, unlike the
bearer-token LLM transports. The pair is stored as one encrypted secret (see
``core/config/dataforseo``) and is decrypted only to build a short-lived
client — it is never logged, never returned in a DTO and never written into a
snapshot (invariant 6).

This module currently carries the CONNECTIVITY PROBE only. The two-phase
submit/fetch adapter joins it in the connector slice.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from app.connectors.answer_engines.errors import ProviderError, classify_provider_status
from app.connectors.answer_engines.http_client import shared_client
from app.core.config import dataforseo as dataforseo_config
from app.core.config.dataforseo import (
    DataForSeoCredential,
    DataForSeoCredentialError,
    dataforseo_settings,
    unpack_credential,
)
from app.core.config.provider_catalog import (
    ERROR_AUTH,
    ERROR_CONNECTION,
    ERROR_PARSE,
    ERROR_TIMEOUT,
)

# DataForSEO answers with its own status code INSIDE a 200 response body. A
# transport-level success therefore proves nothing on its own; this is the
# response-level "everything is fine" code.
RESPONSE_STATUS_OK: int = 20000


@dataclass(frozen=True, slots=True)
class DataForSeoProbeResult:
    """The outcome of a non-billable credential check.

    Deliberately carries NO account detail. The probe answers exactly one
    question — can this credential authenticate — and account balance, quota
    and plan are none of the settings UI's business.
    """

    latency_ms: int


async def probe_credential(
    *,
    secret: str,
    base_url: str = "",
    timeout_seconds: float | None = None,
    client: httpx.AsyncClient | None = None,
) -> DataForSeoProbeResult:
    """Authenticate against DataForSEO without creating a billable task.

    ``GET /v3/appendix/user_data`` is the only endpoint this may call. It
    proves the credential works and costs nothing; submitting a SERP task to
    "test" a key would charge the customer for pressing a button labelled
    Test.

    Raises ``ProviderError`` classified with the shared transport vocabulary so
    the connection-test path records it exactly as it records an LLM failure.
    """
    try:
        credential = unpack_credential(secret)
    except DataForSeoCredentialError as exc:
        # The stored blob is unreadable, so there is nothing to authenticate
        # with. This is an auth failure, not a parse failure of a provider
        # response: no call was made.
        raise ProviderError(
            "Stored DataForSEO credential could not be read",
            error_code=ERROR_AUTH,
            retryable=False,
        ) from exc

    url = _endpoint(base_url, dataforseo_config.PATH_USER_DATA)
    timeout = (
        dataforseo_settings.test_timeout_seconds
        if timeout_seconds is None
        else timeout_seconds
    )
    http = client or shared_client()
    started = time.monotonic()
    try:
        response = await http.get(url, auth=credential.basic_auth(), timeout=timeout)
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.PoolTimeout) as exc:
        raise ProviderError(
            "DataForSEO request timed out",
            error_code=ERROR_TIMEOUT,
            retryable=True,
        ) from exc
    except httpx.HTTPError as exc:
        raise ProviderError(
            "Could not reach DataForSEO",
            error_code=ERROR_CONNECTION,
            retryable=True,
        ) from exc
    latency_ms = int((time.monotonic() - started) * 1000)

    if response.status_code != httpx.codes.OK:
        error_code, retryable = classify_provider_status(response.status_code)
        raise ProviderError(
            f"DataForSEO returned HTTP {response.status_code}",
            error_code=error_code,
            retryable=retryable,
        )

    _require_ok_envelope(response)
    return DataForSeoProbeResult(latency_ms=latency_ms)


def _require_ok_envelope(response: httpx.Response) -> None:
    """Fail unless the response-level status says the request was accepted.

    DataForSEO returns HTTP 200 with an in-body status code, so an auth
    failure can arrive looking like a success at the transport layer. Reading
    the envelope is what makes a failed probe fail.
    """
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError(
            "DataForSEO returned an unreadable response",
            error_code=ERROR_PARSE,
            retryable=False,
        ) from exc
    if not isinstance(payload, dict):
        raise ProviderError(
            "DataForSEO returned an unreadable response",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    status_code = payload.get("status_code")
    if status_code == RESPONSE_STATUS_OK:
        return
    # The envelope's own message is safe to surface (it names the fault, e.g.
    # invalid credentials) and is length-capped like every provider detail.
    message = str(payload.get("status_message") or "").strip()[:240]
    suffix = f" ({message})" if message else ""
    raise ProviderError(
        f"DataForSEO rejected the credential{suffix}",
        error_code=ERROR_AUTH,
        retryable=False,
    )


def _endpoint(base_url: str, path: str) -> str:
    """Resolve a path against the approved base, or an operator override."""
    base = (base_url or dataforseo_settings.base_url).strip().rstrip("/")
    return f"{base}{path}"


def credential_from_secret(secret: str) -> DataForSeoCredential:
    """Decrypted-secret entry point for the execution path."""
    return unpack_credential(secret)
