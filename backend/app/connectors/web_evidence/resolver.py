"""Production DNS resolver shared by SSRF-safe web fetchers."""

from __future__ import annotations

import asyncio


class SystemDnsResolver:
    """Resolve every address so the URL policy can reject mixed unsafe answers."""

    async def resolve(self, host: str, port: int) -> list[str]:
        loop = asyncio.get_running_loop()
        infos = await loop.getaddrinfo(host, port)
        seen: list[str] = []
        for info in infos:
            ip = str(info[4][0])
            if ip and ip not in seen:
                seen.append(ip)
        return seen
