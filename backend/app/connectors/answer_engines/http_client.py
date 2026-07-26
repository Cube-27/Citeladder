"""Shared pooled HTTP client for the answer-engine adapters.

Every adapter used to open ``httpx.AsyncClient`` inside ``execute()``, so each
provider call paid a fresh TCP connect + TLS handshake and then threw the
connection away. A single free-tier run is 10 prompts x 3 providers = 30 calls,
so that is 30 handshakes per run against three TLS endpoints — pure overhead on
top of provider time.

One pooled client per event loop fixes it: keep-alive means only the first call
to each provider host handshakes, and the rest reuse the connection. The worker
is a single-loop process, so in practice this is one client for the process
lifetime.

Keyed by the running loop rather than a bare module global because a client's
connection pool belongs to the loop it was created on — a module-level singleton
would leak sockets across the fresh loop each test gets. Adapters also take an
explicit ``client=`` for tests, which bypasses this cache entirely.

Timeouts stay per-request: the pool default below is only a floor, and every
adapter passes its own ``request.timeout_seconds`` on the call itself.
"""

from __future__ import annotations

import asyncio
import logging
import weakref

import httpx

from app.core.config.provider_catalog import provider_catalog_settings

logger = logging.getLogger(__name__)

# Sized for a full free-tier run in flight at once (10 prompts x 3 providers)
# plus headroom, so the pool never becomes the bottleneck the worker queues on.
_LIMITS = httpx.Limits(
    max_connections=100,
    max_keepalive_connections=30,
    # Providers keep idle sockets alive for well over a minute; holding them for
    # the length of a run is what makes the reuse actually land.
    keepalive_expiry=90.0,
)

# Weakly keyed on the loop so a discarded loop's entry is reclaimed by GC without
# waiting for an explicit ``aclose_shared_clients()``. Long-lived processes have
# exactly one loop, but a test suite creates many — a strong dict would pin every
# retired loop and its client for the life of the process.
_clients: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, httpx.AsyncClient] = (
    weakref.WeakKeyDictionary()
)


def shared_client() -> httpx.AsyncClient:
    """The pooled client for the running event loop (created on first use)."""
    loop = asyncio.get_running_loop()
    client = _clients.get(loop)
    if client is None or client.is_closed:
        client = httpx.AsyncClient(
            timeout=provider_catalog_settings.request_timeout_seconds,
            limits=_LIMITS,
        )
        _clients[loop] = client
    return client


async def aclose_shared_clients() -> None:
    """Close every pooled client. For worker/app shutdown and test teardown.

    Idempotent and safe to call concurrently: each entry is dropped from the
    cache before it is awaited, so a second caller cannot double-close the same
    client, and ``httpx.AsyncClient.aclose()`` tolerates being called on an
    already-closed client anyway. The ``list()`` snapshot is load-bearing — the
    cache is mutated here and is weakly keyed, so entries can also vanish
    mid-iteration.
    """
    for loop, client in list(_clients.items()):
        # Pop first: whoever removes the entry owns closing it.
        if _clients.pop(loop, None) is None:
            continue
        try:
            await client.aclose()
        except Exception:  # pragma: no cover - shutdown best effort
            logger.debug("failed closing pooled answer-engine client", exc_info=True)
