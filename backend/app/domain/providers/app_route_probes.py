"""Live probes for customer-configured Agent model routes."""

from __future__ import annotations

import time
import uuid
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


def _matches_revision(
    route: ProviderAppRoute | None,
    connection: ProviderConnection | None,
    route_revision,
    credential_revision,
) -> bool:
    return (
        route is not None
        and connection is not None
        and route.revision == route_revision
        and connection.credential_revision == credential_revision
    )


async def _mark_aggregate_failure(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    credential_revision: uuid.UUID,
    route_id: uuid.UUID,
    route_revision: uuid.UUID,
    response: ProviderConnectionTestResponse,
) -> None:
    current_connection = await session.get(
        ProviderConnection, connection_id, with_for_update=True
    )
    current_route = await session.get(ProviderAppRoute, route_id, with_for_update=True)
    if (
        response.error_code != "revision_changed"
        and _matches_revision(
            current_route, current_connection, route_revision, credential_revision
        )
        and current_connection is not None
    ):
        current_connection.last_test_status = TEST_STATUS_FAILED
        current_connection.last_tested_at = response.tested_at
    await session.commit()


async def probe_app_routes(
    session: AsyncSession,
    *,
    connection: ProviderConnection,
    app_transport: AppModelJsonTransport,
) -> ProviderConnectionTestResponse | None:
    connection_id = connection.id
    credential_revision = connection.credential_revision
    route_ids = [
        route.id
        for route in sorted(connection.app_routes, key=lambda item: item.feature)
        if route.active
    ]
    responses = []
    for route_id in route_ids:
        current_connection = await session.get(ProviderConnection, connection_id)
        route = await session.get(ProviderAppRoute, route_id)
        if current_connection is None or route is None or not route.active:
            continue
        response = await _probe_one(
            session,
            connection=current_connection,
            route=route,
            app_transport=app_transport,
        )
        responses.append((route_id, route.revision, response))
    if not responses:
        return None
    failed = next(
        (item for item in responses if item[2].status != TEST_STATUS_OK), None
    )
    if failed is not None:
        route_id, route_revision, response = failed
        await _mark_aggregate_failure(
            session,
            connection_id=connection_id,
            credential_revision=credential_revision,
            route_id=route_id,
            route_revision=route_revision,
            response=response,
        )
        return response
    return responses[-1][2]


async def _probe_one(
    session: AsyncSession,
    *,
    connection: ProviderConnection,
    route: ProviderAppRoute,
    app_transport: AppModelJsonTransport,
) -> ProviderConnectionTestResponse:
    tested_route_revision = route.revision
    tested_credential_revision = connection.credential_revision
    route_id = route.id
    connection_id = connection.id
    workspace_id = connection.workspace_id
    feature = route.feature
    protocol = route.protocol
    model = route.model
    api_base_url = route.api_base_url
    api_key = decrypt_secret(connection.api_key_encrypted)
    await session.rollback()
    started = time.monotonic()
    status = TEST_STATUS_OK
    error_code = ""
    detail = APP_MODEL_SUCCESS_DETAIL
    latency_ms: int | None = None
    try:
        target = await resolve_app_model_target(chat_completions_url(api_base_url))
        response = await app_transport.post(
            target=target,
            api_key=api_key,
            payload={
                "model": model,
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
    current_connection = await session.get(
        ProviderConnection, connection_id, with_for_update=True
    )
    current_route = await session.get(ProviderAppRoute, route_id, with_for_update=True)
    current = _matches_revision(
        current_route,
        current_connection,
        tested_route_revision,
        tested_credential_revision,
    )
    if not current:
        status = TEST_STATUS_FAILED
        error_code = "revision_changed"
        detail = "Connection changed during probe"
    elif (
        status == TEST_STATUS_OK
        and current_route is not None
        and current_connection is not None
    ):
        current_route.probed_revision = tested_route_revision
        current_route.probed_credential_revision = tested_credential_revision
        current_route.probed_at = tested_at
        current_connection.last_test_status = TEST_STATUS_OK
        current_connection.last_tested_at = tested_at
    if status != TEST_STATUS_OK and current and current_connection is not None:
        current_connection.last_test_status = TEST_STATUS_FAILED
        current_connection.last_tested_at = tested_at
    if current_connection is not None:
        session.add(
            ProviderConnectionTest(
                workspace_id=workspace_id,
                connection_id=connection_id,
                status=status,
                error_code=error_code,
                detail=detail[:1024],
                latency_ms=latency_ms,
                logical_engine=feature,
                transport_provider=protocol,
                transport_model=model,
            )
        )
    await session.commit()
    return ProviderConnectionTestResponse(
        connection_id=connection_id,
        status=status,
        error_code=error_code,
        detail=detail,
        latency_ms=latency_ms,
        logical_engine=feature,
        transport_provider=protocol,
        transport_model=model,
        tested_at=tested_at,
    )
