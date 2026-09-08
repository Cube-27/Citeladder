"""Shared explicit Content/Growth customer model route resolution."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.app_model_config import AppModelRouteConfig
from app.core.config.app_models import APP_FEATURES
from app.core.security import decrypt_secret
from app.domain.providers.credentials import connection_paused
from app.models.provider import ProviderAppRoute, ProviderConnection


class AppModelRouteUnavailableError(RuntimeError):
    """No exact, active, probed customer route exists; never fallback."""


async def resolve_app_model_route(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    feature: str,
    at: datetime,
) -> AppModelRouteConfig:
    if feature not in APP_FEATURES:
        raise AppModelRouteUnavailableError("Unsupported app model feature")
    row = (
        await session.execute(
            select(ProviderAppRoute, ProviderConnection)
            .join(
                ProviderConnection,
                ProviderConnection.id == ProviderAppRoute.connection_id,
            )
            .where(
                ProviderAppRoute.workspace_id == workspace_id,
                ProviderAppRoute.feature == feature,
                ProviderAppRoute.active.is_(True),
                ProviderConnection.workspace_id == workspace_id,
                ProviderConnection.active.is_(True),
                ProviderConnection.api_key_encrypted != "",
            )
        )
    ).one_or_none()
    if row is None:
        raise AppModelRouteUnavailableError("No verified app model route is configured")
    route, connection = row
    verified = (
        route.probed_revision == route.revision
        and route.probed_credential_revision == connection.credential_revision
        and route.probed_at is not None
    )
    if not verified or connection_paused(connection, at=at):
        raise AppModelRouteUnavailableError("No verified app model route is configured")
    return AppModelRouteConfig(
        feature=route.feature,
        connection_id=connection.id,
        route_id=route.id,
        credential_revision=connection.credential_revision,
        route_revision=route.revision,
        protocol=route.protocol,
        model=route.model,
        api_base_url=route.api_base_url,
        api_key=decrypt_secret(connection.api_key_encrypted),
    )
