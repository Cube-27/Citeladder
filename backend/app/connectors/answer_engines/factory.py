"""Adapter resolution for a (logical_engine, transport_provider) route.

Given a decrypted BYOK secret and an approved route, build the concrete
adapter. Key resolution reads the decrypted ``ProviderConnection`` at
execution time and the secret is passed straight into the adapter — never
read from env, never persisted into snapshots/logs (invariant 6).

Dispatch is on ``surface_kind`` FIRST, then transport. That order matters:
the two kinds do not share an adapter protocol. An ``llm`` route returns an
adapter with ``execute()``; a ``search_ai`` route returns a two-phase
``submit()``/``fetch()`` adapter, because the surface is submitted and later
observed rather than asked. Dispatching on transport alone would have to
decide the protocol by guessing from the provider name.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.connectors.answer_engines.anthropic import AnthropicAnswerEngineAdapter
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.answer_engines.gemini import GeminiAnswerEngineAdapter
from app.connectors.answer_engines.openai import OpenAIAnswerEngineAdapter
from app.connectors.search_surfaces.dataforseo import DataForSeoSearchSurfaceAdapter
from app.core.config.provider_catalog import (
    ERROR_INVALID_SURFACE,
    SURFACE_KIND_SEARCH_AI,
    TRANSPORT_ANTHROPIC,
    TRANSPORT_DATAFORSEO,
    TRANSPORT_GOOGLE,
    TRANSPORT_OPENAI,
    is_route_approved,
    surface_kind,
)


def _openai(api_key: str, country_code: str, base_url: str) -> Any:
    return OpenAIAnswerEngineAdapter(
        api_key=api_key, country_code=country_code, base_url=base_url
    )


def _gemini(api_key: str, country_code: str, base_url: str) -> Any:
    return GeminiAnswerEngineAdapter(api_key=api_key, base_url=base_url)


def _anthropic(api_key: str, country_code: str, base_url: str) -> Any:
    return AnthropicAnswerEngineAdapter(
        api_key=api_key, country_code=country_code, base_url=base_url
    )


def _dataforseo(api_key: str, country_code: str, base_url: str) -> Any:
    # ``api_key`` here is the packed login/password pair, not a bearer token.
    # The adapter unpacks it; nothing between here and there knows the shape.
    return DataForSeoSearchSurfaceAdapter(secret=api_key, base_url=base_url)


# A table rather than an if/elif chain. With a fourth member the chain stopped
# being the cheaper option: a missing branch here is a KeyError at the lookup
# instead of a fall-through into the generic "unsupported transport" error,
# which said nothing about which transport had been forgotten.
_LLM_ADAPTERS: dict[str, Callable[[str, str, str], Any]] = {
    TRANSPORT_OPENAI: _openai,
    TRANSPORT_GOOGLE: _gemini,
    TRANSPORT_ANTHROPIC: _anthropic,
}

_SEARCH_ADAPTERS: dict[str, Callable[[str, str, str], Any]] = {
    TRANSPORT_DATAFORSEO: _dataforseo,
}


def build_adapter(
    *,
    logical_engine: str,
    transport_provider: str,
    api_key: str,
    country_code: str = "",
    base_url: str = "",
) -> Any:
    """Construct the adapter for an approved (engine, transport) route.

    Raises ``ProviderError`` with ``invalid_surface`` if the route is not an
    approved active route, or if the transport has no adapter for its kind.
    """
    if not is_route_approved(logical_engine, transport_provider):
        raise ProviderError(
            f"Route not approved: {logical_engine} via {transport_provider}",
            error_code=ERROR_INVALID_SURFACE,
            retryable=False,
        )
    kind = surface_kind(logical_engine)
    table = _SEARCH_ADAPTERS if kind == SURFACE_KIND_SEARCH_AI else _LLM_ADAPTERS
    build = table.get(transport_provider)
    if build is None:
        raise ProviderError(
            f"Unsupported transport provider: {transport_provider}",
            error_code=ERROR_INVALID_SURFACE,
            retryable=False,
        )
    return build(api_key, country_code, base_url)
