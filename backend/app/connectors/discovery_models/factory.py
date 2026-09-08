"""Discovery-model client factory.

Builds a fresh client per attempt, resolving the ``SecretStr`` key at call
time so a live env change applies and the key never lives on a long-lived
object.

The transport is OpenAI-compatible and provider-neutral, so there is no
provider allowlist: the model is swapped entirely from ``.env`` via
``CONTENT_PROVIDER`` / ``CONTENT_MODEL`` / ``CONTENT_PROVIDER_ENDPOINT`` /
``CONTENT_API_KEY``. A missing key still raises ``ERROR_AUTH`` in the client.
"""

from __future__ import annotations

import httpx

from app.connectors.app_model import OpenAICompatibleAppModelClient
from app.connectors.app_model_config import AppModelRouteConfig
from app.connectors.discovery_models.contracts import DiscoveryModelClient
from app.connectors.discovery_models.openai_compatible import (
    OpenAICompatibleDiscoveryClient,
)
from app.core.config.content import content_settings


def build_discovery_client(
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    app_route: AppModelRouteConfig | None = None,
) -> DiscoveryModelClient:
    """Build the configured content client (fresh per attempt).

    ``transport`` is a test seam (``httpx.MockTransport``); production passes
    nothing and the client uses the real network.
    """
    if app_route is not None:
        return OpenAICompatibleAppModelClient(app_route)
    return OpenAICompatibleDiscoveryClient(
        provider=content_settings.provider,
        api_key=content_settings.resolved_api_key,
        endpoint=content_settings.resolved_endpoint,
        transport=transport,
    )
