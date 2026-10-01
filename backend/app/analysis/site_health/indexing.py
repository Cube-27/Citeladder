"""Canonical-vs-final URL comparison form shared by Python Opportunity actions."""

from __future__ import annotations

from urllib.parse import SplitResult, parse_qsl, urlencode, urlsplit

from app.core.config.site_health_rules import TRACKING_QUERY_PARAMS


def _split_compare_url(raw: str) -> tuple[SplitResult, int | None] | None:
    """``(parts, port)`` for a parseable URL, or None when it is not one.

    ``urlsplit`` is lazy about the port: it succeeds on
    ``https://x.example:notaport/`` and only raises when ``.port`` is read.
    Catching that and substituting ``None`` made a malformed authority look
    like a clean one -- the port simply vanished, so
    ``https://x.example:99999/a`` normalized to ``https://x.example/a`` and
    compared EQUAL to the page it was supposed to be a broken canonical for.

    An unreadable port means the URL did not parse, and it is reported as such.
    """
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        # ``urlsplit`` and ``.port`` raise only ValueError, and only on a
        # genuinely unparseable URL (a bad IPv6 literal, a non-numeric or
        # out-of-range port). Anything else out of here is a bug and must not
        # be turned into "no URL".
        return None
    return parts, port


def _compare_netloc(scheme: str, host: str, port: int | None) -> str:
    default_port = (scheme == "http" and port == 80) or (
        scheme == "https" and port == 443
    )
    return f"{host}:{port}" if port is not None and not default_port else host


def _compare_path(path: str) -> str:
    normalized = path or ""
    while len(normalized) > 1 and normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized or "/"


def _compare_query(query: str) -> str:
    """Drop campaign/click parameters before comparing two URLs.

    A page reached from a newsletter or an ad arrives with the tracking
    parameters still on its final URL while its canonical is, correctly, the
    clean address. Comparing the query verbatim made every one of those visits
    a canonical conflict -- a finding about how the crawler arrived, not about
    the page.

    Only the config-owned tracking set is dropped. Every other parameter is
    preserved, because a parameter that genuinely selects different content is
    exactly what a canonical is resolving.
    """
    if not query:
        return ""
    pairs = [
        (key, value)
        for key, value in parse_qsl(query, keep_blank_values=True)
        if key.casefold() not in TRACKING_QUERY_PARAMS
    ]
    return urlencode(pairs)


def normalized_url_for_compare(url: str) -> str:
    """Canonical-vs-final comparison form; never crawler identity."""
    raw = str(url or "").strip()
    parsed = _split_compare_url(raw)
    if parsed is None:
        return raw.lower()
    parts, port = parsed
    scheme = (parts.scheme or "").lower()
    host = (parts.hostname or "").lower()
    if not scheme or not host:
        return raw.lower()
    out = f"{scheme}://{_compare_netloc(scheme, host, port)}{_compare_path(parts.path)}"
    query = _compare_query(parts.query)
    if query:
        return f"{out}?{query}"
    return out
