"""Shared credential capability provisioning; explicit writes only."""

import uuid

from app.core.config.provider_catalog import (
    TRANSPORT_DATAFORSEO,
    engines_for_transport,
    measurement_route,
)
from app.models.provider import ProviderRoute


def add_missing_dataforseo_routes(
    routes: list[ProviderRoute],
    *,
    workspace_id: uuid.UUID,
) -> None:
    """Provision missing capabilities without reactivating an existing route."""
    existing = {route.logical_engine for route in routes}
    for engine in engines_for_transport(TRANSPORT_DATAFORSEO):
        if engine not in existing:
            route = measurement_route(engine)
            routes.append(
                ProviderRoute(
                    workspace_id=workspace_id,
                    logical_engine=engine,
                    transport_provider=TRANSPORT_DATAFORSEO,
                    transport_model=route.transport_model,
                    is_default=False,
                )
            )
