"""Pooled answer-engine HTTP client lifecycle.

The adapters share one ``httpx.AsyncClient`` per event loop so a run's provider
calls reuse keep-alive connections instead of handshaking per call. That cache is
process-global mutable state, so its contract is worth pinning directly: reuse
within a loop, recreation after a close, and an ``aclose_shared_clients()`` that
is idempotent and safe under concurrency.
"""

from __future__ import annotations

import asyncio
import weakref

import pytest

from app.connectors.answer_engines import http_client as http_client_mod
from app.connectors.answer_engines.http_client import (
    aclose_shared_clients,
    shared_client,
)


@pytest.mark.asyncio
async def test_shared_client_is_reused_within_one_event_loop() -> None:
    await aclose_shared_clients()
    first = shared_client()
    second = shared_client()
    assert first is second, "the same loop must reuse one pooled client"
    assert not first.is_closed


@pytest.mark.asyncio
async def test_shared_client_is_recreated_after_close() -> None:
    await aclose_shared_clients()
    first = shared_client()
    await first.aclose()
    assert first.is_closed

    # A closed client must not be handed out again — the next caller would get a
    # RuntimeError on the first request instead of a working connection.
    second = shared_client()
    assert second is not first
    assert not second.is_closed


@pytest.mark.asyncio
async def test_aclose_shared_clients_is_idempotent() -> None:
    client = shared_client()
    await aclose_shared_clients()
    assert client.is_closed
    # Second and third calls are no-ops rather than errors.
    await aclose_shared_clients()
    await aclose_shared_clients()


@pytest.mark.asyncio
async def test_aclose_shared_clients_is_safe_concurrently() -> None:
    client = shared_client()

    # Whoever pops an entry owns closing it, so racing closers must not
    # double-close or raise — the pool is emptied exactly once.
    await asyncio.gather(*(aclose_shared_clients() for _ in range(5)))

    assert client.is_closed
    assert len(http_client_mod._clients) == 0


@pytest.mark.asyncio
async def test_clients_cache_is_weakly_keyed_on_the_loop() -> None:
    # A retired loop must not pin its client for the life of the process. Only
    # the weak key makes that reclaimable without an explicit close.
    assert isinstance(http_client_mod._clients, weakref.WeakKeyDictionary)
