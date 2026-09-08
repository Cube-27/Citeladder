"""Live probes for customer-configured Content and Growth Agent routes."""

from __future__ import annotations

import time
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.app_model_transport import (
    AppModelJsonTransport,
    AppModelTransportError,
    chat_completions_url,
    resolve_app_model_target,
)
from app.core.config.app_models import (
    APP_MODEL_PROBE_MAX_OUTPUT_TOKENS,
    APP_MODEL_PROBE_PROMPT,
    APP_MODEL_PROBE_TIMEOUT_SECONDS,
    APP_MODEL_SUCCESS_DETAIL,
)
from app.core.config.provider_catalog import (
    ERROR_PARSE,
    TEST_STATUS_FAILED,
    TEST_STATUS_OK,
)
from app.core.security import decrypt_secret
from app.domain.providers.schemas import ProviderConnectionTestResponse
from app.models.provider import (
    ProviderAppRoute,
    ProviderConnection,
    ProviderConnectionTest,
)


async def probe_app_routes(
    session: AsyncSession,
    *,
    connection: ProviderConnection,
    app_transport: AppModelJsonTransport,
) -> ProviderConnectionTestResponse | None:
    responses = [
        await _probe_one(
            session,
            connection=connection,
            route=route,
            app_transport=app_transport,
        )
        for route in sorted(connection.app_routes, key=lambda item: item.feature)
        if route.active
    ]
    if not responses:
        return None
    failed = next(
        (response for response in responses if response.status != TEST_STATUS_OK), None
    )
    if failed is not None:
        connection.last_test_status = TEST_STATUS_FAILED
        connection.last_tested_at = failed.tested_at
        await session.commit()
        return failed
    return responses[-1]


async def _probe_one(
    session: AsyncSession,
    *,
    connection: ProviderConnection,
    route: ProviderAppRoute,
    app_transport: AppModelJsonTransport,
) -> ProviderConnectionTestResponse:
    tested_route_revision = route.revision
    tested_credential_revision = connection.credential_revision
    started = time.monotonic()
    status = TEST_STATUS_OK
    error_code = ""
    detail = APP_MODEL_SUCCESS_DETAIL
    latency_ms: int | None = None
    try:
        target = await resolve_app_model_target(
            chat_completions_url(route.api_base_url)
        )
        response = await app_transport.post(
            target=target,
            api_key=decrypt_secret(connection.api_key_encrypted),
            payload={
                "model": route.model,
                "messages": [{"role": "user", "content": APP_MODEL_PROBE_PROMPT}],
                "max_tokens": APP_MODEL_PROBE_MAX_OUTPUT_TOKENS,
                "stream": False,
            },
            timeout_seconds=APP_MODEL_PROBE_TIMEOUT_SECONDS,
            max_response_bytes=16_384,
        )
        latency_ms = response.latency_ms
    except AppModelTransportError as exc:
        status = TEST_STATUS_FAILED
        error_code = exc.code[:32]
        detail = str(exc)
        latency_ms = int((time.monotonic() - started) * 1000)
    except Exception as exc:  # noqa: BLE001 - every probe fault is a safe failure
        status = TEST_STATUS_FAILED
        error_code = ERROR_PARSE
        detail = f"Unexpected error: {type(exc).__name__}"
        latency_ms = int((time.monotonic() - started) * 1000)
    tested_at = datetime.now(UTC)
    await session.refresh(connection)
    await session.refresh(route)
    current = (
        route.revision == tested_route_revision
        and connection.credential_revision == tested_credential_revision
    )
    if status == TEST_STATUS_OK and current:
        route.probed_revision = tested_route_revision
        route.probed_credential_revision = tested_credential_revision
        route.probed_at = tested_at
        connection.last_test_status = TEST_STATUS_OK
        connection.last_tested_at = tested_at
    elif status == TEST_STATUS_OK:
        status = TEST_STATUS_FAILED
        error_code = "revision_changed"
        detail = "Connection changed during probe"
    if status != TEST_STATUS_OK:
        connection.last_test_status = TEST_STATUS_FAILED
        connection.last_tested_at = tested_at
    session.add(
        ProviderConnectionTest(
            workspace_id=connection.workspace_id,
            connection_id=connection.id,
            status=status,
            error_code=error_code,
            detail=detail[:1024],
            latency_ms=latency_ms,
            logical_engine=route.feature,
            transport_provider=route.protocol,
            transport_model=route.model,
        )
    )
    await session.commit()
    return ProviderConnectionTestResponse(
        connection_id=connection.id,
        status=status,
        error_code=error_code,
        detail=detail,
        latency_ms=latency_ms,
        logical_engine=route.feature,
        transport_provider=route.protocol,
        transport_model=route.model,
        tested_at=tested_at,
    )
