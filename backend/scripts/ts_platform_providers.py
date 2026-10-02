"""Shared provider route identity and supported public catalog."""

import dataclasses

from app.core.config.provider_catalog import (
    ACTIVE_TRANSPORTS,
    MEASUREMENT_ROUTES,
    PUBLIC_PROVIDER_CATALOG,
)


def provider_policy():
    return {
        "routes": {
            engine: dataclasses.asdict(route)
            for engine, route in MEASUREMENT_ROUTES.items()
        },
        "catalog": [dataclasses.asdict(row) for row in PUBLIC_PROVIDER_CATALOG],
        "transports": sorted(ACTIVE_TRANSPORTS),
    }
