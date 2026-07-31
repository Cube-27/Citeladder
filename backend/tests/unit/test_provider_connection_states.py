"""Unit tests for ``derive_connection_state`` (pure, fail closed).

Precedence under test: ``unavailable`` (no adapter ships) > ``missing`` (no
active connection, or a configured key that was never successfully probed) >
``failed`` (latest attempted probe failed) > ``connected`` (successful probe
while the connection remains active). An unprobed key is NEVER connected.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ERROR_AUTH,
    ERROR_UNKNOWN,
    PROVIDER_GROK,
    PUBLIC_PROVIDER_CATALOG,
    REASON_PROVIDER_UNAVAILABLE,
    REASON_VERIFICATION_REQUIRED,
    TEST_STATUS_FAILED,
    TEST_STATUS_OK,
)
from app.domain.providers.service import derive_connection_state
from app.models.provider import ProviderConnection, ProviderConnectionTest

_ENTRIES = {entry.key: entry for entry in PUBLIC_PROVIDER_CATALOG}
_CHATGPT = _ENTRIES[ENGINE_CHATGPT]
_GROK = _ENTRIES[PROVIDER_GROK]
_T0 = datetime(2026, 7, 31, 12, 0, 0, tzinfo=UTC)


def _connection(*, active: bool = True) -> ProviderConnection:
    return ProviderConnection(
        workspace_id=uuid.uuid4(),
        transport_provider="openai",
        active=active,
    )


def _probe(
    status: str,
    *,
    error_code: str = "",
    detail: str = "internal note — never serialized",
    latency_ms: int | None = 37,
    model: str = "gpt-5.4",
) -> ProviderConnectionTest:
    return ProviderConnectionTest(
        workspace_id=uuid.uuid4(),
        connection_id=uuid.uuid4(),
        status=status,
        error_code=error_code,
        detail=detail,
        latency_ms=latency_ms,
        logical_engine="chatgpt",
        transport_provider="openai",
        transport_model=model,
        created_at=_T0,
    )


def test_unavailable_entry_ignores_connection_and_probe() -> None:
    state = derive_connection_state(_GROK, _connection(), _probe(TEST_STATUS_OK))
    assert state.state == "unavailable"
    assert state.safe_reason == REASON_PROVIDER_UNAVAILABLE
    assert state.latest_probe is None
    assert state.key == _GROK.key
    assert state.label == _GROK.label
    assert state.grant_key == _GROK.grant_key


def test_missing_without_connection() -> None:
    state = derive_connection_state(_CHATGPT, None, None)
    assert state.state == "missing"
    assert state.safe_reason == REASON_VERIFICATION_REQUIRED
    assert state.latest_probe is None


def test_missing_with_unprobed_connection_fails_closed() -> None:
    state = derive_connection_state(_CHATGPT, _connection(), None)
    assert state.state == "missing"
    assert state.safe_reason == REASON_VERIFICATION_REQUIRED
    assert state.latest_probe is None


def test_missing_when_connection_no_longer_active() -> None:
    state = derive_connection_state(
        _CHATGPT, _connection(active=False), _probe(TEST_STATUS_OK)
    )
    assert state.state == "missing"
    assert state.safe_reason == REASON_VERIFICATION_REQUIRED
    assert state.latest_probe is None


def test_connected_after_successful_probe() -> None:
    state = derive_connection_state(_CHATGPT, _connection(), _probe(TEST_STATUS_OK))
    assert state.state == "connected"
    assert state.safe_reason is None
    probe = state.latest_probe
    assert probe is not None
    assert probe.status == TEST_STATUS_OK
    assert probe.safe_reason is None
    assert probe.tested_at == _T0
    assert probe.model == "gpt-5.4"
    assert probe.latency_ms == 37


def test_failed_probe_uses_classification_token_only() -> None:
    state = derive_connection_state(
        _CHATGPT, _connection(), _probe(TEST_STATUS_FAILED, error_code=ERROR_AUTH)
    )
    assert state.state == "failed"
    assert state.safe_reason == ERROR_AUTH
    probe = state.latest_probe
    assert probe is not None
    assert probe.status == TEST_STATUS_FAILED
    assert probe.safe_reason == ERROR_AUTH
    assert probe.tested_at == _T0


def test_failed_probe_without_token_falls_back_to_unknown() -> None:
    state = derive_connection_state(
        _CHATGPT, _connection(), _probe(TEST_STATUS_FAILED, error_code="")
    )
    assert state.state == "failed"
    assert state.safe_reason == ERROR_UNKNOWN
    assert state.latest_probe is not None
    assert state.latest_probe.safe_reason == ERROR_UNKNOWN


def test_probe_dto_never_carries_internal_detail() -> None:
    state = derive_connection_state(
        _CHATGPT,
        _connection(),
        _probe(TEST_STATUS_FAILED, error_code=ERROR_AUTH, detail="raw provider msg"),
    )
    assert "detail" not in state.latest_probe.model_dump()
    assert "raw provider msg" not in state.model_dump_json()
