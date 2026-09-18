# DataForSEO search-surface configuration (invariant 1: config lives in
# core/config, never inline in adapter/service code).
#
# Owns the endpoint paths, the search-context vocabulary (location, language,
# device) and the request-shape knobs for the Google AI Overview surface. The
# provider status-code families, poll cadence and task TTL join this module
# with the connector slice; nothing here encodes a numeric RANGE test, because
# DataForSEO's ``4xxxx`` band mixes pending states with failures.
#
# This module is a LEAF: it imports no other config module, so
# ``provider_catalog`` may read its defaults without a cycle.
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Final

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Endpoints ------------------------------------------------------------
# One base; every path below is joined to it. An operator may repoint the base
# at a gateway, exactly as the LLM transports allow.
DATAFORSEO_BASE_URL: Final = "https://api.dataforseo.com"

# Authenticates and returns account metadata WITHOUT creating a billable task.
# This is the connectivity probe, and it is the only endpoint the ``/test``
# path may call — a probe must never submit a SERP task.
PATH_USER_DATA: Final = "/v3/appendix/user_data"

# Standard (submit-then-poll) Google Organic SERP lifecycle.
PATH_TASK_POST: Final = "/v3/serp/google/organic/task_post"
PATH_TASK_GET_ADVANCED: Final = "/v3/serp/google/organic/task_get/advanced"
PATH_TASKS_READY: Final = "/v3/serp/google/organic/tasks_ready"

# The reconciliation sweep's endpoint: the bound account's task ids WITH
# metadata, over a bounded window. It returns uncompleted as well as completed
# tasks, which is exactly the case that matters — an orphaned submission is by
# definition one CiteLadder never saw finish.
#
# Note the path is API-LEVEL, not per-endpoint: the per-endpoint spelling
# ``/v3/serp/google/organic/id_list`` returns HTTP 404 / ``40400``. Verified
# live 2026-09-18. Because it spans every SERP task type, a sweep must
# identify its rows by TAG rather than by assuming the account posts nothing
# else.
PATH_ID_LIST: Final = "/v3/serp/id_list"

# --- Provider status-code families ----------------------------------------
# DataForSEO answers almost everything with HTTP 200 and carries the real
# status in the body, at TWO levels: once for the response envelope and again
# on each task. These families are read from a table, never from an inline
# comparison and never from a numeric RANGE test.
#
# A range test is the specific bug this exists to prevent. Every code below is
# in the ``4xxxx`` band, and that band mixes "still working on it" with
# "definitively failed" — so `code >= 40000` would park a failed task until
# the poll ceiling burned and then report the ceiling as the cause, destroying
# the real one. Confirmed against https://docs.dataforseo.com/v3/appendix/errors/
STATUS_OK: Final = 20000
STATUS_TASK_CREATED: Final = 20100

# "task handed" (received, not yet enqueued) and "task in queue" (enqueued).
# Neither is a result and neither is a failure: re-park and poll again,
# WITHOUT spending an attempt.
STATUS_TASK_HANDED: Final = 40601
STATUS_TASK_IN_QUEUE: Final = 40602
PENDING_TASK_STATUS_CODES: Final[frozenset[int]] = frozenset(
    {STATUS_TASK_HANDED, STATUS_TASK_IN_QUEUE}
)

# Definitively failed. Finalize immediately, preserving the provider's code —
# re-polling a task the provider has already given up on is what turns a real
# cause into a poll-ceiling timeout.
STATUS_TASK_EXECUTION_FAILED: Final = 40103
STATUS_UNAUTHORIZED: Final = 40100
STATUS_PAYMENT_REQUIRED: Final = 40200
STATUS_INVALID_FIELD: Final = 40501
TERMINAL_FAILURE_STATUS_CODES: Final[frozenset[int]] = frozenset(
    {
        STATUS_TASK_EXECUTION_FAILED,
        STATUS_UNAUTHORIZED,
        STATUS_PAYMENT_REQUIRED,
        STATUS_INVALID_FIELD,
    }
)

# Codes that mean the submission landed and a task now exists.
ACCEPTED_SUBMISSION_STATUS_CODES: Final[frozenset[int]] = frozenset(
    {STATUS_OK, STATUS_TASK_CREATED}
)


def is_pending_status(status_code: int) -> bool:
    """True when the provider says the task has not finished yet."""
    return status_code in PENDING_TASK_STATUS_CODES


def is_terminal_failure_status(status_code: int) -> bool:
    """True when the provider has definitively given up on the task."""
    return status_code in TERMINAL_FAILURE_STATUS_CODES


def is_complete_status(status_code: int) -> bool:
    """True when the task carries a usable result."""
    return status_code == STATUS_OK


# --- Poll cadence and bounds ---------------------------------------------
# DataForSEO's Standard queue normally settles within a few minutes. The
# interval is the re-park delay; the ceiling bounds how long a task may stay
# in flight before it terminates as an honest local failure rather than
# quietly becoming "no AI Overview".
# A live Standard task with ``load_async_ai_overview`` completed in ~13
# seconds (verified 2026-09-18), so the first poll is deliberately sooner than
# the steady interval: waiting a full minute on a task that finished in
# thirteen seconds is latency the customer pays for nothing.
FIRST_POLL_DELAY_SECONDS: Final = 15.0
POLL_INTERVAL_SECONDS: Final = 60.0
POLL_CEILING: Final = 30
# How far back a reconciliation sweep looks for an orphaned submission.
RECONCILE_WINDOW_HOURS: Final = 24
# Provider caps the id-list endpoint at 10 calls/minute and 1,000 ids/call, so
# reconciliation sweeps per ACCOUNT rather than per task.
RECONCILE_PAGE_SIZE: Final = 1000
# ``datetime_to`` must be STRICTLY in the past: a window ending at or after
# "now" is refused with ``40501 Invalid Field: datetime_to - must be earlier
# than present date``. Verified live 2026-09-18. The sweep therefore ends its
# window this far back, which also means a submission newer than this is not
# yet reconcilable and must simply be polled again.
RECONCILE_WINDOW_LAG_SECONDS: Final = 60
# How many tasks one submission or collection pass handles.
BATCH_SIZE: Final = 100
# The provider's own limit on the correlation tag sent at submission.
TAG_MAX_CHARS: Final = 255

# --- Request shape --------------------------------------------------------
# The provider documents a 700-character ``keyword`` limit. A tracked prompt
# longer than this AFTER transport escaping is rejected by name; it is never
# truncated, because a truncated query measures something else.
KEYWORD_MAX_CHARS: Final = 700

# How many organic results the task returns alongside the AI Overview block.
# The AI Overview is what CiteLadder measures; depth exists because the block
# is positioned RELATIVE to the organic results and a depth of zero would make
# ``rank_absolute`` meaningless.
DEFAULT_DEPTH: Final = 10

# Asks Google to load the AI Overview even when it renders asynchronously.
# The provider charges a surcharge for this and refunds it in full when the
# element is absent or carries ``asynchronous_ai_overview: false``.
LOAD_ASYNC_AI_OVERVIEW: Final = True

# Observed Standard-queue charge for one such task: $0.0012, which is the
# $0.0006 base plus the $0.0006 asynchronous-AI-Overview surcharge (verified
# live 2026-09-18). Recorded here as OBSERVATION ONLY — it is not a rate card
# and nothing prices from it. The provider reports the real charge on every
# submission and ``ExecutionCostProjection`` reconciles against that.
OBSERVED_STANDARD_TASK_COST_MICROUSD: Final = 1200
ASYNC_AI_OVERVIEW_SURCHARGE_MICROUSD: Final = 600

# --- Search context vocabulary -------------------------------------------
# One location, one language, one device per project. These are the values a
# project may be configured with; the task freezes the resolved triple into
# ``request_snapshot`` at admission so a queued execution never re-reads
# mutable project settings.
DEVICE_DESKTOP: Final = "desktop"
DEVICE_MOBILE: Final = "mobile"
SUPPORTED_DEVICES: Final[frozenset[str]] = frozenset({DEVICE_DESKTOP, DEVICE_MOBILE})

# Operating system sent alongside the device. The provider requires one, and
# it is not a measurement choice the customer makes.
OS_FOR_DEVICE: Final[dict[str, str]] = {
    DEVICE_DESKTOP: "windows",
    DEVICE_MOBILE: "android",
}

# DataForSEO location codes for the markets CiteLadder configures. This is a
# deliberately small allow-list, not a mirror of the provider's full catalog:
# an unknown code must fail at configuration time, not at submission time.
LOCATION_CODES: Final[dict[str, int]] = {
    "US": 2840,
    "GB": 2826,
    "AU": 2036,
    "CA": 2124,
    "IN": 2356,
    "NZ": 2554,
    "IE": 2372,
    "SG": 2702,
    "ZA": 2710,
    "DE": 2276,
    "FR": 2250,
    "NL": 2528,
    "AE": 2784,
}

SUPPORTED_LOCATION_CODES: Final[frozenset[int]] = frozenset(LOCATION_CODES.values())

LANGUAGE_CODES: Final[frozenset[str]] = frozenset(
    {"en", "de", "fr", "nl", "es", "it", "pt"}
)

DEFAULT_LOCATION_CODE: Final = LOCATION_CODES["US"]
DEFAULT_LANGUAGE_CODE: Final = "en"
DEFAULT_DEVICE: Final = DEVICE_DESKTOP


class KeywordTooLongError(ValueError):
    """A tracked prompt cannot be represented within the keyword limit."""


def serialize_keyword(prompt: str) -> str:
    """Put a tracked prompt on the wire without changing what it asks.

    Two different things must not be conflated.

    SEMANTIC rewriting is forbidden. No keyword translation, no stop-word
    stripping, no SEO reformulation, no truncation — a changed query measures
    something the customer is not tracking, and reports the result as though
    they were.

    TRANSPORT escaping is required. The provider reads a literal ``%`` and a
    literal ``+`` as encoding syntax, so those two characters are percent-
    escaped to survive the wire intact. ``C++`` and ``50% off`` are therefore
    ordinary prompts, not rejection cases: they round-trip losslessly.

    Only a prompt that exceeds the limit AFTER escaping is rejected, and it is
    rejected by name rather than silently shortened.
    """
    escaped = prompt.replace("%", "%25").replace("+", "%2B")
    if len(escaped) > KEYWORD_MAX_CHARS:
        raise KeywordTooLongError(
            f"prompt is {len(escaped)} characters after escaping, over the "
            f"{KEYWORD_MAX_CHARS}-character provider limit"
        )
    return escaped


def deserialize_keyword(keyword: str) -> str:
    """Read a wire keyword back as the prompt it was made from.

    The inverse of ``serialize_keyword``, used to verify a recovered provider
    task really carries the query CiteLadder submitted. Order matters: ``%25``
    is unescaped last, so an escaped ``%2B`` never decodes into a literal
    ``+`` that was not there.
    """
    return keyword.replace("%2B", "+").replace("%25", "%")


def location_code_for_country(country_code: str) -> int | None:
    """Seed a project's SERP location from its configured market, or None.

    Returns ``None`` rather than a default for an unmapped market: silently
    measuring the United States for a project configured for another country
    would be a wrong measurement presented as a right one.
    """
    return LOCATION_CODES.get(country_code.strip().upper())


def is_supported_search_context(
    *, location_code: int, language_code: str, device: str
) -> bool:
    """True when a search context is one this deployment may submit."""
    return (
        location_code in SUPPORTED_LOCATION_CODES
        and language_code in LANGUAGE_CODES
        and device in SUPPORTED_DEVICES
    )


class DataForSeoSettings(BaseSettings):
    """Env-overridable DataForSEO knobs (invariant 1).

    ``platform_*`` credentials are DECLARED but unused on the execution path:
    the shipped credential model is BYOK, resolved through
    ``resolve_execution_credentials``. They exist so platform funding can be
    switched on later without a migration or a second code path, and so
    development can verify provider behaviour against a real account.
    """

    model_config = SettingsConfigDict(env_prefix="DATAFORSEO_", extra="ignore")

    base_url: str = DATAFORSEO_BASE_URL
    # Opaque non-secret reference an operator-provisioned platform connection
    # stores in the database; the secret itself never reaches a DB column.
    platform_credential_ref: str = ""
    api_login: SecretStr = SecretStr("")
    api_password: SecretStr = SecretStr("")
    # HTTP timeout for one submission or one poll.
    request_timeout_seconds: float = 60.0
    # Shorter timeout for the non-billable connectivity probe.
    test_timeout_seconds: float = 20.0


dataforseo_settings = DataForSeoSettings()


# --- Credential shape -----------------------------------------------------
# DataForSEO authenticates with an HTTP Basic login/password PAIR, while
# ``ProviderConnection`` holds a SINGLE encrypted secret. Rather than adding a
# second secret column and a second decryption path — doubling the surface
# that must never leak — the pair is serialised into one compact JSON object
# and encrypted into the existing column.
#
# These two functions are the only code that knows that shape. Everything else
# handles a ``DataForSeoCredential`` or an opaque blob, so the column contract
# (one Fernet blob, never returned to the client) is unchanged.
# One wording for an unreadable stored blob. It deliberately says nothing
# about WHY — never a fragment of the secret, never its length.
_UNREADABLE_CREDENTIAL: Final = "stored DataForSEO credential is not readable"
_CREDENTIAL_LOGIN_KEY: Final = "login"
_CREDENTIAL_PASSWORD_KEY: Final = "password"


class DataForSeoCredentialError(ValueError):
    """A stored DataForSEO secret is not a well-formed login/password pair."""


@dataclass(frozen=True, slots=True)
class DataForSeoCredential:
    """One DataForSEO HTTP Basic identity."""

    login: str
    password: str

    def basic_auth(self) -> tuple[str, str]:
        """The pair in the form an HTTP client's basic auth expects."""
        return (self.login, self.password)


def pack_credential(*, login: str, password: str) -> str:
    """Serialise a login/password pair into the single-secret storage shape.

    Raises rather than storing a half-credential: a connection that cannot
    authenticate should fail when it is saved, not on its first paid task.
    """
    clean_login = login.strip()
    if not clean_login or not password:
        raise DataForSeoCredentialError(
            "DataForSEO needs both an API login and an API password"
        )
    return json.dumps(
        {_CREDENTIAL_LOGIN_KEY: clean_login, _CREDENTIAL_PASSWORD_KEY: password},
        separators=(",", ":"),
        sort_keys=True,
    )


def unpack_credential(secret: str) -> DataForSeoCredential:
    """Read a stored DataForSEO secret back into its pair.

    The error carries no fragment of the secret — only that it is unreadable.
    """
    try:
        payload = json.loads(secret)
    except json.JSONDecodeError as exc:
        raise DataForSeoCredentialError(_UNREADABLE_CREDENTIAL) from exc
    if not isinstance(payload, dict):
        raise DataForSeoCredentialError(_UNREADABLE_CREDENTIAL)
    login = payload.get(_CREDENTIAL_LOGIN_KEY)
    password = payload.get(_CREDENTIAL_PASSWORD_KEY)
    if not isinstance(login, str) or not isinstance(password, str):
        raise DataForSeoCredentialError(_UNREADABLE_CREDENTIAL)
    if not login or not password:
        raise DataForSeoCredentialError("stored DataForSEO credential is incomplete")
    return DataForSeoCredential(login=login, password=password)


def platform_credential_secret() -> SecretStr:
    """The operator-configured pair in the same shape a BYOK secret uses.

    Empty when the deployment configures no platform DataForSEO account, which
    is the shipped state: the credential model is BYOK.
    """
    login = dataforseo_settings.api_login.get_secret_value().strip()
    password = dataforseo_settings.api_password.get_secret_value()
    if not login or not password:
        return SecretStr("")
    return SecretStr(pack_credential(login=login, password=password))


def configured_base_url() -> str:
    """The single approved DataForSEO destination, normalised."""
    return dataforseo_settings.base_url.strip().rstrip("/")


def endpoint(path: str) -> str:
    """Absolute URL for one DataForSEO path."""
    return f"{configured_base_url()}{path}"
