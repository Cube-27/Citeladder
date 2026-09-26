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
# An empty or missing robots file permits access. An unreachable file (429,
# 5xx, network failure) is a temporary complete disallow; an access-restricted
# file (401/403) is a standing refusal CiteLadder never works around. Malformed
# lines are ignored and the parseable rules are honored. A delay exceeding the
# supported ceiling pauses the host. The worker owns the fetch (through the
# SSRF-safe fetcher); this module only parses.
from __future__ import annotations

import math
import re

from protego import Protego

from app.core.config.site_health_runtime import (
    site_health_settings,
)

# A robots record line ("field: value") or a blank/comment line. Anything else
# is malformed and dropped before a second parse attempt.
_ROBOTS_LINE = re.compile(r"^\s*(#.*)?$|^\s*[A-Za-z][A-Za-z-]*\s*:")


class RobotsPolicy:
    """A parsed robots policy for one host, evaluated for a fixed user-agent."""

    __slots__ = ("_allow_all", "_deny_all", "_parser", "_restricted", "_user_agent")

    def __init__(
        self,
        parser: Protego | None,
        *,
        user_agent: str,
        allow_all: bool = False,
        deny_all: bool = False,
        restricted: bool = False,
    ) -> None:
        self._parser = parser
        self._user_agent = user_agent.split("/", 1)[0]
        self._allow_all = allow_all
        self._deny_all = deny_all
        self._restricted = restricted

    @classmethod
    def allow_all(cls, *, user_agent: str) -> RobotsPolicy:
        """A fail-open policy that permits every URL (no robots restrictions)."""
        return cls(None, user_agent=user_agent, allow_all=True)

    @classmethod
    def deny_all(cls, *, user_agent: str) -> RobotsPolicy:
        """A deny-everything policy (RFC 9309: a 5xx robots.txt response is a
        complete, temporary disallow)."""
        return cls(None, user_agent=user_agent, deny_all=True)

    @classmethod
    def access_restricted(cls, *, user_agent: str) -> RobotsPolicy:
        """A standing refusal: robots.txt answered 401/403.

        RFC 9309 would permit crawling here, but an authentication or
        authorization response is an access-control signal, and CiteLadder
        does not circumvent access controls.
        """
        return cls(None, user_agent=user_agent, restricted=True)

    @property
    def unavailable(self) -> bool:
        """Whether robots.txt could not be retrieved or read (temporary disallow)."""
        return self._deny_all

    @property
    def restricted(self) -> bool:
        """Whether robots.txt itself is behind an access control (401/403)."""
        return self._restricted

    @property
    def delay_exceeds_limit(self) -> bool:
        """Whether the declared crawl-delay exceeds what we can honour."""
        return self.crawl_delay() > site_health_settings.max_crawl_delay_seconds

    @classmethod
    def parse(cls, body: str | bytes, *, user_agent: str) -> RobotsPolicy:
        """Parse a robots.txt body. An empty body yields an allow-all policy.

        Malformed lines are ignored and the parseable rules honored (RFC 9309
        §2.2). Only a body that cannot be read even then denies acquisition.
        """
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        text = body or ""
        if not text.strip():
            return cls.allow_all(user_agent=user_agent)
        try:
            parser = Protego.parse(text)
        except Exception:  # noqa: BLE001 - retried below with malformed lines dropped
            wellformed = "\n".join(
                line for line in text.splitlines() if _ROBOTS_LINE.match(line)
            )
            try:
                parser = Protego.parse(wellformed)
            except Exception:  # noqa: BLE001 - an unreadable policy cannot authorize acquisition
                return cls.deny_all(user_agent=user_agent)
        return cls(parser, user_agent=user_agent)

    def can_fetch(self, url: str) -> bool:
        """Whether we may fetch now: rules permit and the host is not paused."""
        return not self.delay_exceeds_limit and self.permits(url)

    def permits(self, url: str) -> bool:
        """Whether the publisher's rules permit ``url``, ignoring crawl-delay."""
        if self._deny_all or self._restricted:
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
        default. Unclamped: ``delay_exceeds_limit`` pauses the host, and
        pacing consumers must clamp to ``max_crawl_delay_seconds``.
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
