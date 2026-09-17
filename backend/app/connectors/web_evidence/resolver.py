"""Production DNS resolver shared by SSRF-safe web fetchers."""

from __future__ import annotations

import asyncio
import time

from app.core.config.site_health_runtime import site_health_settings


class SystemDnsResolver:
    """Resolve every address so the URL policy can reject mixed unsafe answers.

    Address ORDER is sticky per authority, because the caller pins the first
    safe address it is given and the curl session pool is keyed by that pinned
    address. ``getaddrinfo`` round-robins a multi-A host, so without this every
    hop to a CDN would pick a different address, miss the pool, and handshake
    again -- on exactly the hosts where connection reuse matters most.

    This reorders; it never filters. The resolved SET is unchanged, so the
    policy still sees and validates every address and still rejects an answer
    mixing public and private ranges. A remembered address is only ever moved
    to the front when it is still present in the fresh answer, so a host that
    genuinely moves is followed on its next resolution.

    A preference expires with the pooled session it exists to serve. That
    bound is doing two jobs. It keeps the table from growing one entry per
    authority for the life of the worker, and -- more importantly -- it is how
    a dead address is escaped. The resolver sees only DNS, never whether a
    connection succeeded, so an address that stops accepting connections while
    still being advertised would otherwise be preferred forever, where the
    round-robin order it replaced would have moved off it on the next attempt.
    Expiry restores that recovery, bounded to one idle window.
    """

    def __init__(self) -> None:
        self._preferred: dict[tuple[str, int], tuple[str, float]] = {}

    async def resolve(self, host: str, port: int) -> list[str]:
        loop = asyncio.get_running_loop()
        infos = await loop.getaddrinfo(host, port)
        seen: list[str] = []
        for info in infos:
            ip = str(info[4][0])
            if ip and ip not in seen:
                seen.append(ip)
        if not seen:
            return seen
        self._expire()
        remembered = self._preferred.get((host, port))
        if remembered is not None and remembered[0] in seen:
            preferred = remembered[0]
            seen.remove(preferred)
            seen.insert(0, preferred)
            return seen
        # New, expired, or no longer advertised: take whatever DNS ordered
        # first this time. The stamp is NOT refreshed on a hit, so a preference
        # lives one window from when it was set rather than for as long as the
        # host stays busy -- which is what lets a steadily crawled host move
        # off an address that has stopped accepting connections.
        self._preferred[(host, port)] = (seen[0], time.monotonic())
        # Again after the insert, so the table never sits above the cap. The
        # sweep before the lookup is the one that matters for correctness --
        # it retires a stale preference before it can be used -- but on its
        # own it enforced the ceiling only until the next new authority.
        self._expire()
        return seen

    def _expire(self) -> None:
        """Drop preferences past the pool's idle window, then enforce the cap."""
        ttl = site_health_settings.curl_session_pool_idle_seconds
        if ttl > 0:
            now = time.monotonic()
            for authority, (_ip, stamp) in list(self._preferred.items()):
                if now - stamp >= ttl:
                    self._preferred.pop(authority, None)
        cap = site_health_settings.curl_session_pool_max_entries
        if cap <= 0 or len(self._preferred) <= cap:
            return
        oldest = sorted(self._preferred.items(), key=lambda item: item[1][1])
        for authority, _mark in oldest[: len(self._preferred) - cap]:
            self._preferred.pop(authority, None)
