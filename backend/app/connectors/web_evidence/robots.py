# robots.txt parsing + politeness for the Site Health crawler (Task 3).
#
# Wraps ``protego`` (modern robots parser: wildcards, allow/disallow ordering,
# crawl-delay, sitemap directives) behind a small deterministic value type so
# the worker never touches the raw parser. A ``RobotsPolicy`` answers three
# questions for the frozen crawl user-agent:
#   - can_fetch(url): is this URL allowed?
#   - crawl_delay(): the per-host delay to honor, falling back to the config
#     default when robots specifies none; excessive delays pause acquisition.
#   - sitemaps(): the sitemap URLs robots declares (seed URLs for discovery).
#
# An empty robots file permits access; network/server failures and parser
# failures deny access. A delay exceeding the supported ceiling pauses the host.
# A policy built from a body that explicitly disallows still denies. The worker owns the
# fetch (through the SSRF-safe fetcher); this module only parses.
from __future__ import annotations

import math

from protego import Protego

from app.core.config.site_health_runtime import (
    site_health_settings,
)


class RobotsPolicy:
    """A parsed robots policy for one host, evaluated for a fixed user-agent."""

    __slots__ = ("_allow_all", "_deny_all", "_parser", "_user_agent")

    def __init__(
        self,
        parser: Protego | None,
        *,
        user_agent: str,
        allow_all: bool = False,
        deny_all: bool = False,
    ) -> None:
        self._parser = parser
        self._user_agent = user_agent.split("/", 1)[0]
        self._allow_all = allow_all
        self._deny_all = deny_all

    @classmethod
    def allow_all(cls, *, user_agent: str) -> RobotsPolicy:
        """A fail-open policy that permits every URL (no robots restrictions)."""
        return cls(None, user_agent=user_agent, allow_all=True)

    @classmethod
    def deny_all(cls, *, user_agent: str) -> RobotsPolicy:
        """A deny-everything policy (RFC 9309: a 5xx robots.txt response is a
        complete, temporary disallow)."""
        return cls(None, user_agent=user_agent, deny_all=True)

    @property
    def unavailable(self) -> bool:
        """Whether this policy is the 5xx temporary-disallow stance."""
        return (
            self._deny_all
            or self.crawl_delay() > site_health_settings.max_crawl_delay_seconds
        )

    @classmethod
    def parse(cls, body: str | bytes, *, user_agent: str) -> RobotsPolicy:
        """Parse a robots.txt body. An empty body yields an allow-all policy."""
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        text = body or ""
        if not text.strip():
            return cls.allow_all(user_agent=user_agent)
        try:
            parser = Protego.parse(text)
        except Exception:  # noqa: BLE001 - an unreadable policy cannot authorize acquisition
            return cls.deny_all(user_agent=user_agent)
        return cls(parser, user_agent=user_agent)

    def can_fetch(self, url: str) -> bool:
        if self.unavailable:
            return False
        if self._allow_all or self._parser is None:
            return True
        try:
            return bool(self._parser.can_fetch(url, self._user_agent))
        except Exception:  # noqa: BLE001 - preserve restrictions when the parser cannot decide
            return False

    def crawl_delay(self) -> float:
        """Per-host declared delay in seconds.

        Uses the robots-declared crawl-delay when present, else the config
        default. An excessive delay makes ``unavailable`` true.
        """
        settings = site_health_settings
        declared: float | None = None
        if not self._allow_all and self._parser is not None:
            try:
                value = self._parser.crawl_delay(self._user_agent)
                declared = float(value) if value is not None else None
            except Exception:  # noqa: BLE001 - third-party Protego read; fall back to the configured default delay
                declared = None
        delay = (
            declared if declared is not None else settings.default_crawl_delay_seconds
        )
        return max(0.0, delay) if math.isfinite(delay) else math.inf

    def sitemaps(self) -> list[str]:
        """The sitemap URLs robots declares (may be empty)."""
        if self._allow_all or self._parser is None:
            return []
        try:
            return list(self._parser.sitemaps or [])
        except Exception:  # noqa: BLE001 - third-party Protego read; no declared sitemaps is a valid outcome
            return []
