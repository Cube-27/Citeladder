"""Frozen lower-layer configuration for a verified customer app-model route."""

from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AppModelRouteConfig:
    feature: str
    connection_id: uuid.UUID
    route_id: uuid.UUID
    credential_revision: uuid.UUID
    route_revision: uuid.UUID
    protocol: str
    model: str
    api_base_url: str
    api_key: str
