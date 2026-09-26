"""Provider-connection request/response schemas (all ids string UUID).

Invariant 6: the BYOK secret is WRITE-ONLY. ``api_key`` is accepted on
create/update but no response DTO in this module exposes the key or its
ciphertext — only a boolean ``api_key_set`` flag. Whether a key is present is
safe to surface; the value is not.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.connectors.app_model_transport import normalize_app_model_url
from app.core.config.app_models import APP_FEATURES, APP_PROTOCOL_OPENAI_CHAT
from app.core.config.dataforseo import pack_credential
from app.core.config.provider_catalog import TRANSPORT_DATAFORSEO

# Loopback hosts allowed over plain http (local self-hosted proxy in dev). Every
# other host must use https so a stored base_url cannot downgrade a
# bearer-authenticated provider call to cleartext or a non-web scheme.
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _validate_base_url(value: str | None) -> str | None:
    """Reject base_url values with an unsafe scheme (SSRF/downgrade guard).

    Empty / ``None`` means "use the provider default" and is always allowed.
    Otherwise only ``https`` is accepted, except plain ``http`` to a loopback
    host for local self-hosted proxies. A missing scheme or host is rejected so
    the adapter never posts a bearer-authenticated request to an ambiguous URL.
    """
    if value is None or value == "":
        return value
    parts = urlsplit(value)
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise ValueError("base_url must use http or https")
    if not parts.hostname:
        raise ValueError("base_url must include a host")
    if scheme == "http" and parts.hostname.lower() not in _LOOPBACK_HOSTS:
        raise ValueError("base_url must use https (http allowed only for localhost)")
    return value


# Enumerations mirror provider_catalog (kept as Literals so FastAPI validates
# the request body; the service re-validates against the catalog for routes).
#
# ``ActiveTransportProvider`` is the complete write/create transport surface.
ActiveTransportProvider = Literal["openai", "anthropic", "google", "dataforseo"]
TransportProvider = ActiveTransportProvider
# Every engine the analysis side understands, including one whose adapter has
# not shipped: a connection may be CONFIGURED for it before a run may SELECT
# it. ``SELECTABLE_ENGINES`` is what gates selection.
LogicalEngine = Literal["chatgpt", "gemini", "claude", "google_ai_overview"]


class ProviderRouteInput(BaseModel):
    logical_engine: LogicalEngine
    is_default: bool = False


class ProviderAppRouteInput(BaseModel):
    disclosure_accepted: Literal[True]
    feature: Literal["agent"]
    model: str = Field(min_length=1, max_length=255)
    api_base_url: str = Field(min_length=1, max_length=1024)
    protocol: Literal["openai_chat"] = APP_PROTOCOL_OPENAI_CHAT
    active: bool = True

    _check_app_url = field_validator("api_base_url")(normalize_app_model_url)


class ProviderAppRouteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    feature: str
    protocol: str
    model: str
    api_base_url: str
    active: bool
    verified: bool
    probed_at: datetime | None


class ProviderRouteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    logical_engine: str
    transport_provider: str
    transport_model: str
    is_default: bool
    # Whether this route is executable.
    active: bool = True


def _require_credential_shape(
    *,
    transport_provider: str,
    api_key: str,
    api_login: str,
    api_password: str,
    required: bool,
) -> None:
    """Reject a credential that does not match its transport's auth shape.

    Refusing the wrong shape at the edge is what keeps the failure legible: a
    DataForSEO login pasted into ``api_key`` would otherwise be stored happily
    and fail later as an opaque authentication error on a paid task.
    """
    wants_pair = transport_provider == TRANSPORT_DATAFORSEO
    if wants_pair:
        if api_key:
            raise ValueError(
                "DataForSEO uses an API login and password, not a single key"
            )
        if required and not (api_login.strip() and api_password):
            raise ValueError("DataForSEO needs both an API login and an API password")
        if bool(api_login.strip()) != bool(api_password):
            raise ValueError("DataForSEO needs both an API login and an API password")
        return
    if api_login or api_password:
        raise ValueError(
            f"{transport_provider} uses a single API key, not a login and password"
        )
    if required and not api_key.strip():
        raise ValueError("api_key is required")


def _secret_material(
    *,
    transport_provider: str,
    api_key: str,
    api_login: str,
    api_password: str,
) -> str:
    """Collapse either credential shape into the one stored secret."""
    if transport_provider == TRANSPORT_DATAFORSEO:
        return pack_credential(login=api_login, password=api_password)
    return api_key.strip()


class ProviderConnectionCreate(BaseModel):
    """A new BYOK credential.

    Two credential SHAPES exist, and a transport accepts exactly one. The
    bearer-token transports take ``api_key``; DataForSEO authenticates with an
    HTTP Basic login/password pair and takes ``api_login`` + ``api_password``.
    Both are write-only (invariant 6) and neither is echoed in any response.

    The pair is not modelled as a second stored secret — the service packs it
    into the same single encrypted column. Keeping the two shapes distinct
    here, at the edge, is what lets everything downstream keep handling one
    opaque secret.
    """

    label: str = Field(default="", max_length=255)
    transport_provider: TransportProvider
    # WRITE-ONLY BYOK secret (invariant 6). Never echoed in any response.
    api_key: str = Field(default="")
    api_login: str = Field(default="", max_length=255)
    api_password: str = Field(default="")
    base_url: str = Field(default="", max_length=1024)
    active: bool = True
    routes: list[ProviderRouteInput] = Field(default_factory=list)
    app_routes: list[ProviderAppRouteInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def app_routes_need_a_chat_transport(self) -> ProviderConnectionCreate:
        """An observed search surface hosts no app model.

        App routes are an LLM-chat concept and each carries its OWN
        ``api_base_url``. Attaching one to a DataForSEO connection would send
        that connection's login and password to an operator-supplied
        destination, and would make the ``/test`` probe exercise a chat
        protocol this transport does not speak.
        """
        if self.transport_provider == TRANSPORT_DATAFORSEO and self.app_routes:
            raise ValueError("Google AI Overview connections host no app model")
        return self

    @model_validator(mode="after")
    def credential_shape_matches_transport(self) -> ProviderConnectionCreate:
        _require_credential_shape(
            transport_provider=self.transport_provider,
            api_key=self.api_key,
            api_login=self.api_login,
            api_password=self.api_password,
            required=True,
        )
        return self

    def secret_material(self) -> str:
        """The single opaque secret this connection stores."""
        return _secret_material(
            transport_provider=self.transport_provider,
            api_key=self.api_key,
            api_login=self.api_login,
            api_password=self.api_password,
        )

    @model_validator(mode="after")
    def unique_app_features(self) -> ProviderConnectionCreate:
        features = [route.feature for route in self.app_routes]
        if len(features) != len(set(features)) or not set(features).issubset(
            APP_FEATURES
        ):
            raise ValueError("App model features must be unique")
        return self

    _check_base_url = field_validator("base_url")(_validate_base_url)


class ProviderConnectionUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)
    # Optional rotation. Omitted / empty leaves the stored secret unchanged.
    # A DataForSEO rotation supplies BOTH halves of the pair: rotating one
    # half against a remembered other half would leave the stored credential
    # in a state no one entered.
    api_key: str | None = Field(default=None)
    api_login: str | None = Field(default=None, max_length=255)
    api_password: str | None = Field(default=None)
    base_url: str | None = Field(default=None, max_length=1024)
    active: bool | None = None
    routes: list[ProviderRouteInput] | None = None
    app_routes: list[ProviderAppRouteInput] | None = None
    confirm_destination_change: bool = False

    @model_validator(mode="after")
    def credential_shape_is_coherent(self) -> ProviderConnectionUpdate:
        """Shape rules that hold WITHOUT knowing the transport.

        An update does not name its transport — the stored connection does —
        so the transport-specific rule (which shape this connection accepts)
        stays in the service, where the connection is loaded. What can be
        decided here is decided here:

        - supplying both a bearer key and a login/password pair is incoherent
          whatever the transport, and
        - half a pair is never a rotation. Rotating one half against a
          remembered other half would leave the stored credential in a state
          nobody entered.

        Omitting everything stays valid and means "leave the secret alone".
        """
        login = (self.api_login or "").strip()
        password = self.api_password or ""
        key = (self.api_key or "").strip()
        if key and (login or password):
            raise ValueError(
                "Supply either an API key or an API login and password, not both"
            )
        if bool(login) != bool(password):
            raise ValueError("Rotating these credentials needs both halves")
        return self

    @model_validator(mode="after")
    def unique_app_features(self) -> ProviderConnectionUpdate:
        features = [route.feature for route in self.app_routes or []]
        if len(features) != len(set(features)):
            raise ValueError("App model features must be unique")
        return self

    _check_base_url = field_validator("base_url")(_validate_base_url)


class ProviderConnectionResponse(BaseModel):
    """Connection DTO. Deliberately has NO api_key field (invariant 6)."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    label: str
    transport_provider: str
    base_url: str
    active: bool
    # Presence flag only — the key value itself is never serialized.
    api_key_set: bool
    last_tested_at: datetime | None
    last_test_status: str
    routes: list[ProviderRouteResponse] = Field(default_factory=list)
    app_routes: list[ProviderAppRouteResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProviderConnectionTestResponse(BaseModel):
    """Result of a ``POST /provider-connections/{id}/test`` call."""

    connection_id: uuid.UUID
    status: str
    error_code: str = ""
    detail: str = ""
    latency_ms: int | None = None
    logical_engine: str = ""
    transport_provider: str = ""
    transport_model: str = ""
    tested_at: datetime


class ProviderCatalogRoute(BaseModel):
    """One approved route as the settings UI sees it.

    ``retrieval_enabled`` and ``reasoning_effort`` are null on an observed
    search surface, which has no request to pin them on. The client reads
    ``surface_kind`` to know which of the two shapes it is looking at rather
    than inferring it from a missing field.
    """

    transport_provider: str
    transport_model: str
    retrieval_enabled: bool | None = None
    reasoning_effort: str | None = None
    surface_kind: str


class ProviderCatalogEngine(BaseModel):
    logical_engine: str
    routes: list[ProviderCatalogRoute]


class ProviderCatalogResponse(BaseModel):
    transports: list[str]
    engines: list[ProviderCatalogEngine]
