"""Configuration-only selection of the model gateway for one call."""

from __future__ import annotations

import httpx

from app.connectors.agent.client import DefaultAgentClient
from app.connectors.agent.gateway import ModelGateway
from app.connectors.app_model import OpenAICompatibleAppModelClient
from app.connectors.app_model_config import AppModelRouteConfig
from app.core.config.agent import DefaultAgentSettings


def create_model_gateway(
    settings: DefaultAgentSettings | None = None,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    app_route: AppModelRouteConfig | None = None,
) -> ModelGateway:
    if app_route is not None:
        return OpenAICompatibleAppModelClient(app_route)
    return DefaultAgentClient(settings, transport=transport)
