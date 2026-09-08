"""Transactional mutation helpers for customer provider connections."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_secret
from app.models.provider import ProviderAppRoute, ProviderConnection
from app.models.workspace import Workspace


class InvalidAppModelDestinationError(ValueError):
    """An app-model destination change lacks fresh confirmed custody."""


async def ensure_app_features_available(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    items: list[Any],
    connection_id: uuid.UUID | None = None,
) -> None:
    """Serialize and reject a feature already owned by another connection."""
    await session.get(Workspace, workspace_id, with_for_update=True)
    features = {item.feature for item in items}
    if not features:
        return
    query = select(ProviderAppRoute.feature).where(
        ProviderAppRoute.workspace_id == workspace_id,
        ProviderAppRoute.feature.in_(features),
    )
    if connection_id is not None:
        query = query.where(ProviderAppRoute.connection_id != connection_id)
    conflict = await session.scalar(query.limit(1))
    if conflict is not None:
        raise InvalidAppModelDestinationError(
            f"App model feature {conflict!r} already belongs to another connection"
        )


def build_app_routes(
    *, workspace_id: uuid.UUID, items: list[Any] | None
) -> list[ProviderAppRoute]:
    return [
        ProviderAppRoute(
            workspace_id=workspace_id,
            feature=item.feature,
            protocol=item.protocol,
            model=item.model.strip(),
            api_base_url=item.api_base_url,
            active=item.active,
        )
        for item in items or []
    ]


def apply_scalar_updates(connection: ProviderConnection, payload: Any) -> None:
    if payload.label is not None:
        connection.label = payload.label
    if payload.active is not None:
        connection.active = payload.active
    if payload.api_key is not None and payload.api_key.strip():
        connection.api_key_encrypted = encrypt_secret(payload.api_key.strip())
        connection.credential_revision = uuid.uuid4()


def _route_changed(route: ProviderAppRoute, item: Any) -> bool:
    return (
        route.api_base_url != item.api_base_url
        or route.model != item.model.strip()
        or route.protocol != item.protocol
    )


def _invalidate_probe(route: ProviderAppRoute) -> None:
    route.revision = uuid.uuid4()
    route.probed_revision = None
    route.probed_credential_revision = None
    route.probed_at = None


def _update_existing_route(
    route: ProviderAppRoute, item: Any, *, fresh_key: bool, confirmed: bool
) -> None:
    destination_changed = route.api_base_url != item.api_base_url
    if destination_changed and (not fresh_key or not confirmed):
        raise InvalidAppModelDestinationError(
            "Changing an app model destination requires a fresh API key "
            "and confirmation"
        )
    changed = _route_changed(route, item)
    route.model = item.model.strip()
    route.protocol = item.protocol
    route.api_base_url = item.api_base_url
    route.active = item.active
    if changed:
        _invalidate_probe(route)


async def replace_app_routes(
    session: AsyncSession,
    *,
    connection: ProviderConnection,
    items: list[Any],
    fresh_key: bool,
    confirmed: bool,
) -> None:
    await ensure_app_features_available(
        session,
        workspace_id=connection.workspace_id,
        items=items,
        connection_id=connection.id,
    )
    locked_routes = list(
        (
            await session.scalars(
                select(ProviderAppRoute)
                .where(
                    ProviderAppRoute.workspace_id == connection.workspace_id,
                    ProviderAppRoute.connection_id == connection.id,
                )
                .with_for_update()
            )
        ).all()
    )
    existing_by_feature = {route.feature: route for route in locked_routes}
    for item in items:
        existing = existing_by_feature.get(item.feature)
        if existing is None:
            connection.app_routes.extend(
                build_app_routes(workspace_id=connection.workspace_id, items=[item])
            )
        else:
            _update_existing_route(
                existing, item, fresh_key=fresh_key, confirmed=confirmed
            )
    requested_features = {item.feature for item in items}
    for existing in locked_routes:
        if existing.feature not in requested_features:
            await session.delete(existing)
