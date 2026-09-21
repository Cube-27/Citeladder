"""Credential-only liveness probe for search-surface connections."""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.dataforseo import probe_credential
from app.core.config.provider_catalog import (
    ERROR_PARSE,
    TEST_STATUS_FAILED,
    TEST_STATUS_OK,
)
from app.core.security import decrypt_secret
from app.domain.providers.schemas import ProviderConnectionTestResponse
from app.models.provider import ProviderConnection, ProviderConnectionTest


async def run_search_surface_test(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    connection: ProviderConnection,
    logical_engine: str,
    model: str,
) -> ProviderConnectionTestResponse:
    status = TEST_STATUS_OK
    error_code = ""
    detail = "Connection succeeded"
    latency_ms: int | None = None
    connection_id = connection.id
    transport = connection.transport_provider
    revision = connection.credential_revision
    secret = decrypt_secret(connection.api_key_encrypted)
    base_url = connection.base_url
    await session.rollback()

    started = time.monotonic()
    try:
        result = await probe_credential(secret=secret, base_url=base_url)
        latency_ms = result.latency_ms
    except ProviderError as exc:
        status = TEST_STATUS_FAILED
        error_code = exc.error_code
        detail = str(exc)
        latency_ms = int((time.monotonic() - started) * 1000)
    except Exception as exc:  # noqa: BLE001 - any transport fault is a failure
        status = TEST_STATUS_FAILED
        error_code = ERROR_PARSE
        detail = f"Unexpected error: {type(exc).__name__}"
        latency_ms = int((time.monotonic() - started) * 1000)

    tested_at = datetime.now(UTC)
    current_connection = await session.get(
        ProviderConnection, connection_id, with_for_update=True
    )
    if current_connection is None or current_connection.credential_revision != revision:
        status = TEST_STATUS_FAILED
        error_code = "revision_changed"
        detail = "Connection changed during probe"
    if current_connection is not None:
        session.add(
            ProviderConnectionTest(
                workspace_id=workspace_id,
                connection_id=connection_id,
                status=status,
                error_code=error_code,
                detail=detail[:1024],
                latency_ms=latency_ms,
                logical_engine=logical_engine,
                transport_provider=transport,
                transport_model=model,
            )
        )
        current_connection.last_tested_at = tested_at
        current_connection.last_test_status = status
    await session.commit()

    return ProviderConnectionTestResponse(
        connection_id=connection_id,
        status=status,
        error_code=error_code,
        detail=detail,
        latency_ms=latency_ms,
        logical_engine=logical_engine,
        transport_provider=transport,
        transport_model=model,
        tested_at=tested_at,
    )
