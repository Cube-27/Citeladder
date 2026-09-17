"""Reusable curl sessions keyed by the address they are pinned to.

A curl session owns the connection pool and the TLS session cache, so building
one per HTTP hop threw both away every time. A single-host crawl of 500 pages
therefore paid 500+ impersonated TLS handshakes against one server, plus one
more per redirect hop, and that is a large share of per-page latency.

The pool key is the whole reason this is safe. ``CurlOpt.RESOLVE`` -- the DNS
pin the SSRF guarantee rests on -- can only be set when a curl_cffi session is
constructed, not per request (verified against curl_cffi 0.16.3, whose
``AsyncSession.request`` takes no ``curl_options``). Mutating the pin on a
shared session would let two concurrent hops race for it, so instead the
resolved address is part of the key: a session is only ever reused for the
exact address it was pinned to. Every fetch still re-resolves and re-admits its
target before reaching the pool, and the ``primary_ip`` check downstream still
verifies the peer curl actually used, which is what makes reuse observable
rather than assumed.

``max_wire_bytes`` is in the key for the same construction-time reason
(``CurlOpt.MAXFILESIZE_LARGE``): losing it would lose libcurl's own abort, and
with it the response-too-large classification that keeps an oversized homepage
from reading as an unreachable site.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from app.core.config.site_health_runtime import site_health_settings


@dataclass(frozen=True, slots=True)
class SessionKey:
    """Everything a pooled session is fixed to at construction time."""

    host: str
    port: int
    connect_ip: str
    max_wire_bytes: int
    impersonation_profile: str


@dataclass(slots=True)
class _Entry:
    session: Any
    last_used: float = field(default_factory=time.monotonic)
    in_flight: int = 0


class CurlSessionPool:
    """Hand out one curl session per pinned address, closing idle ones.

    ``session_factory`` is injected rather than imported so the transport keeps
    constructing sessions through its own module-level name, which is the seam
    the unit tests replace.
    """

    def __init__(self, *, session_factory: Callable[..., Any]) -> None:
        self._session_factory = session_factory
        self._entries: dict[SessionKey, _Entry] = {}

    @asynccontextmanager
    async def lease(self, key: SessionKey, **kwargs: Any) -> AsyncIterator[Any]:
        """Yield the session for ``key``, building it on first use.

        The lease is what makes eviction safe: a fetch holds a streaming
        response open well past the request call, and closing its session
        underneath it would truncate the body. An entry in flight is never
        evicted.
        """
        entry = self._entries.get(key)
        if entry is None:
            entry = _Entry(session=self._session_factory(**kwargs))
            self._entries[key] = entry
        entry.in_flight += 1
        try:
            yield entry.session
        finally:
            entry.in_flight -= 1
            entry.last_used = time.monotonic()
            await self._prune()

    async def _prune(self) -> None:
        """Evict idle entries past the TTL, then enforce the size ceiling."""
        now = time.monotonic()
        ttl = site_health_settings.curl_session_pool_idle_seconds
        if ttl > 0:
            for key, entry in list(self._entries.items()):
                if entry.in_flight == 0 and now - entry.last_used >= ttl:
                    await self._discard(key)
        cap = site_health_settings.curl_session_pool_max_entries
        if cap <= 0 or len(self._entries) <= cap:
            return
        idle = sorted(
            (item for item in self._entries.items() if item[1].in_flight == 0),
            key=lambda item: item[1].last_used,
        )
        for key, _entry in idle[: len(self._entries) - cap]:
            await self._discard(key)

    async def _discard(self, key: SessionKey) -> None:
        entry = self._entries.pop(key, None)
        if entry is None:
            return
        close = getattr(entry.session, "close", None)
        if close is not None:
            await close()

    async def aclose(self) -> None:
        """Close every pooled session; the pool stays usable afterwards."""
        for key in list(self._entries):
            await self._discard(key)
