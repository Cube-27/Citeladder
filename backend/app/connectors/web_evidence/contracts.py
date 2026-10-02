"""Retained URL-policy value types and classified suppression failures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class ResolvedTarget:
    """A validated URL and pinned public address, used by URL-policy tests."""

    url: str
    scheme: str
    host: str
    port: int
    connect_ip: str
    resolved_ips: tuple[str, ...] = ()


class FetchError(Exception):
    """A safe classified URL-policy or acquisition-suppression failure."""

    def __init__(self, message: str, *, error_code: str) -> None:
        super().__init__(message)
        self.error_code = error_code


@runtime_checkable
class DnsResolver(Protocol):
    """Async host resolution for the retained URL safety contract."""

    async def resolve(self, host: str, port: int) -> list[str]: ...
