"""DataForSEO transport for the Google AI Overview surface.

DataForSEO is reached over HTTP Basic with a login/password pair, unlike the
bearer-token LLM transports. The pair is stored as one encrypted secret (see
``core/config/dataforseo``) and is decrypted only to build a short-lived
client — it is never logged, never returned in a DTO and never written into a
snapshot (invariant 6).

The adapter is TWO-PHASE because the surface is. An LLM call is one request
that returns an answer; a SERP observation is a paid submission, a wait, and
a separate retrieval. Modelling that as one ``execute()`` would hide the only
moment that costs money inside a call that might be retried.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Final

import httpx

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.answer_engines.http_client import shared_client
from app.connectors.dataforseo_transport import request_json
from app.connectors.search_surfaces.contracts import (
    SearchSurfaceRequest,
    SearchSurfaceSubmission,
    provider_cost_microusd,
)
from app.core.config import dataforseo as dataforseo_config
from app.core.config.dataforseo import (
    DataForSeoCredential,
    DataForSeoCredentialError,
    dataforseo_settings,
    serialize_keyword,
    unpack_credential,
)
from app.core.config.provider_catalog import (
    ERROR_AUTH,
    ERROR_CLIENT,
    ERROR_PARSE,
)

# DataForSEO answers with its own status code INSIDE a 200 response body. A
# transport-level success therefore proves nothing on its own; this is the
# response-level "everything is fine" code.
RESPONSE_STATUS_OK: int = dataforseo_config.STATUS_OK

# One wording for "the body was not something we could read at all", so a
# caller matching on it cannot accidentally match three of four sites.
_UNREADABLE_RESPONSE: Final = "DataForSEO returned an unreadable response"


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
    payload = await request_json(
        http,
        "GET",
        url,
        credential=credential,
        timeout_seconds=timeout,
        transport_retryable=True,
        error_message=_UNREADABLE_RESPONSE,
    )
    latency_ms = int((time.monotonic() - started) * 1000)
    _require_ok_envelope(payload)
    return DataForSeoProbeResult(latency_ms=latency_ms)


def _require_ok_envelope(payload: dict[str, Any]) -> None:
    """Fail unless the response-level status says the request was accepted.

    DataForSEO returns HTTP 200 with an in-body status code, so an auth
    failure can arrive looking like a success at the transport layer. Reading
    the envelope is what makes a failed probe fail.
    """
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


class DataForSeoSearchSurfaceAdapter:
    """Submit an observation, then retrieve it.

    Two phases, deliberately not one. ``submit`` is the only call that costs
    money, and separating it means a retrieval failure can be retried without
    any chance of paying twice — the worker literally cannot resubmit from the
    fetch path, because the fetch path has no submit in it.

    The adapter is STATELESS between calls. ``provider_submission_ref`` comes
    in as an argument on the request and is never read from the database or
    held on the instance: reconciliation identity depends on that exact value
    surviving unchanged from the committed intent to the wire, and instance
    state is where such a value goes to get quietly replaced.
    """

    def __init__(
        self,
        *,
        secret: str,
        base_url: str = "",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._credential = unpack_credential(secret)
        self._base_url = base_url
        self._client = client

    async def submit(self, request: SearchSurfaceRequest) -> SearchSurfaceSubmission:
        """Create one Standard-queue task. THIS is the billable moment."""
        body = await self._call(
            "POST",
            dataforseo_config.PATH_TASK_POST,
            json=[_task_payload(request)],
            timeout_seconds=request.timeout_seconds,
        )
        # The ENVELOPE first. DataForSEO returns application failures inside
        # HTTP 200, so a rejected submission can arrive looking fine at the
        # transport layer — and can carry a task stub whose status would then
        # be read as authoritative. An auth or payment failure must surface as
        # exactly that, not as a parse error and not as whatever the stub said.
        _require_accepted_envelope(body)
        task = _single_task(body)
        status = _task_status(task)
        if status not in dataforseo_config.ACCEPTED_SUBMISSION_STATUS_CODES:
            raise ProviderError(
                f"DataForSEO refused the submission (status {status})",
                error_code=_submission_error_code(status),
                retryable=False,
            )
        task_id = str(task.get("id") or "").strip()
        if not task_id:
            # An accepted submission with no id is unusable AND already paid
            # for. Failing here sends it to reconciliation, which is the only
            # path that can find it again by tag.
            raise ProviderError(
                "DataForSEO accepted the task but returned no task id",
                error_code=ERROR_PARSE,
                retryable=False,
            )
        return SearchSurfaceSubmission(
            provider_task_id=task_id,
            submitted_at=datetime.now(UTC),
            provider_cost_microusd=provider_cost_microusd(task),
        )

    async def fetch(self, provider_task_id: str) -> dict[str, Any]:
        """Retrieve one task's result. Documented by the provider as free.

        Returns the RAW response. Interpreting it belongs to the pure parser,
        which has no network and can therefore be tested against fixtures
        exhaustively; a transport that also decided outcomes could not.
        """
        path = f"{dataforseo_config.PATH_TASK_GET_ADVANCED}/{provider_task_id}"
        return await self._call(
            "GET", path, timeout_seconds=dataforseo_settings.request_timeout_seconds
        )

    async def list_task_ids(
        self, *, datetime_from: datetime, datetime_to: datetime, offset: int = 0
    ) -> dict[str, Any]:
        """List the bound account's tasks WITH metadata, over a window.

        The reconciliation sweep's endpoint. It returns uncompleted as well as
        completed tasks, which is exactly the case that matters: an orphaned
        submission is by definition one CiteLadder never saw finish.

        ``include_metadata`` is what makes reconciliation possible at all —
        the tag comes back in ``metadata.tag`` and nowhere else on this
        endpoint. Verified live: the provider's published example omits it,
        but it is returned.

        The window is per ACCOUNT, not per task: the provider caps this
        endpoint at ten calls a minute, so one bounded sweep resolves every
        uncertain task it finds. A scan per uncertain task would exhaust the
        budget on the first handful.
        """
        payload = [
            {
                "datetime_from": _window_bound(datetime_from),
                "datetime_to": _window_bound(datetime_to),
                "limit": dataforseo_config.RECONCILE_PAGE_SIZE,
                "offset": offset,
                "include_metadata": True,
            }
        ]
        return await self._call(
            "POST",
            dataforseo_config.PATH_ID_LIST,
            json=payload,
            timeout_seconds=dataforseo_settings.request_timeout_seconds,
        )

    async def _call(
        self,
        method: str,
        path: str,
        *,
        timeout_seconds: float,
        json: Any = None,
    ) -> dict[str, Any]:
        """One authenticated call, classified with the shared vocabulary."""
        http = self._client or shared_client()
        url = _endpoint(self._base_url, path)
        return await request_json(
            http,
            method,
            url,
            credential=self._credential,
            json=json,
            timeout_seconds=timeout_seconds,
            transport_retryable=True,
            error_message=_UNREADABLE_RESPONSE,
        )


def _task_payload(request: SearchSurfaceRequest) -> dict[str, Any]:
    """The submission body.

    Note what is NOT here: no ``target``. The request carries the query and
    the search context and nothing else, so CiteLadder decides owned,
    competitor and third-party identity from project configuration against the
    complete SERP, rather than letting the provider's filtering decide what
    CiteLadder is allowed to see.
    """
    return {
        "keyword": serialize_keyword(request.query),
        "location_code": request.location_code,
        "language_code": request.language_code,
        "device": request.device,
        "os": dataforseo_config.OS_FOR_DEVICE[request.device],
        "depth": request.depth,
        "load_async_ai_overview": request.load_async_ai_overview,
        # Our own correlation identifier, echoed back by the provider. It is
        # what makes an orphaned submission findable, so it goes on the wire
        # verbatim.
        "tag": request.provider_submission_ref[: dataforseo_config.TAG_MAX_CHARS],
    }


def _window_bound(value: datetime) -> str:
    """The provider's window timestamp format.

    ``datetime_to`` must be STRICTLY in the past — a bound at or after "now"
    is refused outright — so the sweep's caller lags its upper bound rather
    than discovering this as a 40501 in production.
    """
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S +00:00")


def _require_accepted_envelope(body: dict[str, Any]) -> None:
    """Fail unless the response-level status accepted the request."""
    status = body.get("status_code")
    if isinstance(status, bool) or not isinstance(status, int):
        raise ProviderError(
            "DataForSEO returned no response status",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    if status in dataforseo_config.ACCEPTED_SUBMISSION_STATUS_CODES:
        return
    message = str(body.get("status_message") or "").strip()[:240]
    suffix = f" ({message})" if message else ""
    raise ProviderError(
        f"DataForSEO rejected the request (status {status}){suffix}",
        error_code=_submission_error_code(status),
        retryable=False,
    )


def _single_task(body: dict[str, Any]) -> dict[str, Any]:
    tasks = body.get("tasks")
    if not isinstance(tasks, list) or not tasks or not isinstance(tasks[0], dict):
        raise ProviderError(
            "DataForSEO returned no task for the submission",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    return tasks[0]


def _task_status(task: dict[str, Any]) -> int:
    status = task.get("status_code")
    if isinstance(status, bool) or not isinstance(status, int):
        raise ProviderError(
            "DataForSEO task carried no status code",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    return status


def _submission_error_code(status: int) -> str:
    """Map a refused submission onto the shared classification tokens.

    Payment-required maps to ``client_error`` rather than ``auth_failure``:
    the credential is valid, the account simply cannot pay, and treating it as
    an auth fault would pause a working connection.
    """
    if status == dataforseo_config.STATUS_UNAUTHORIZED:
        return ERROR_AUTH
    return ERROR_CLIENT
