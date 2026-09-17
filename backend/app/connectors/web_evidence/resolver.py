"""Production DNS resolver shared by SSRF-safe web fetchers."""

from __future__ import annotations

import asyncio


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
    """

    def __init__(self) -> None:
        self._preferred: dict[tuple[str, int], str] = {}

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
        preferred = self._preferred.get((host, port))
        if preferred is not None and preferred in seen:
            seen.remove(preferred)
            seen.insert(0, preferred)
        else:
            self._preferred[(host, port)] = seen[0]
        return seen
