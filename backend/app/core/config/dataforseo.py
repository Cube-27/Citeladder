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
# Lists the bound account's task ids WITH metadata, over a bounded time
# window. This is the reconciliation sweep's endpoint: it returns uncompleted
# as well as completed tasks, which is exactly the case that matters.
PATH_TASKS_READY: Final = "/v3/serp/google/organic/tasks_ready"
PATH_TASKS_FIXED: Final = "/v3/serp/google/organic/id_list"

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
        raise DataForSeoCredentialError(
            "stored DataForSEO credential is not readable"
        ) from exc
    if not isinstance(payload, dict):
        raise DataForSeoCredentialError("stored DataForSEO credential is not readable")
    login = payload.get(_CREDENTIAL_LOGIN_KEY)
    password = payload.get(_CREDENTIAL_PASSWORD_KEY)
    if not isinstance(login, str) or not isinstance(password, str):
        raise DataForSeoCredentialError("stored DataForSEO credential is not readable")
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
