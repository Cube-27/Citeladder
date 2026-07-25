# SSRF-safe async HTTP fetcher for the Site Health crawler (Task 3), with the
# v2 P3 escalation rung (T7, spec §5.4).
#
# Every safety property the plan requires lives here:
#   - trust_env=False (never read proxy/CA env of the host).
#   - MANUAL redirects only (follow_redirects=False / allow_redirects=False):
#     each hop is re-validated through ``url_policy.resolve_target``
#     (scheme/port/userinfo/scope/DNS/SSRF), so a redirect to a
#     private/loopback/out-of-scope URL is rejected.
#   - A validated connection IP is PINNED for the dial while the original Host
#     header + TLS SNI are preserved (DNS-rebinding protection: we never let
#     the socket re-resolve the hostname).
#   - Independent wire-byte and DECODED-byte caps enforced while streaming, so
#     an oversized response OR a compression bomb aborts before it is buffered
#     or parsed (we decompress incrementally and measure output).
#   - Response headers redacted to the config allowlist (no cookies/auth).
#   - Per-request timeout and a redirect-count cap.
#
# Rung 2 (curl_cffi escalation): when rung 1 ends on a config-owned bot-block
# signature (a status in ``BOT_BLOCK_STATUSES``, a challenge body marker, or a
# TLS-layer block), the SAME request is retried ONCE inside this fetch call
# with a Chrome-impersonating curl_cffi session. Rung 2 preserves every
# property above: per-hop ``resolve_target`` revalidation with manual
# redirects (curl_cffi never follows redirects itself — GHSA-qw2m-4pqf-rmpp),
# pinned-IP dial via ``CurlOpt.RESOLVE``, LIVE wire+decoded byte caps (the D3
# seam: a handle-aware session whose write callback reads
# ``CurlInfo.SIZE_DOWNLOAD_T`` inline with the transfer), header redaction,
# and no env proxy trust. Escalation consumes no extra queue attempt.
#
# Every REAL network call (either rung, every redirect hop) appends one
# ``FetchCallTrace`` entry; the immutable trace is returned on BOTH
# ``FetchResult`` and ``FetchError`` so it survives failure. Persisting one
# ``SiteFetchAttempt`` row per entry is T8's job.
#
# The DNS resolver + (optionally) the httpx transport and the curl session
# factory are injected so tests run entirely offline with a fake resolver,
# ``httpx.MockTransport``, and a fake curl session (no live internet — subplan
# test contract). There is NO raw-body persistence: the decoded bytes are
# handed back in-process for bounded parsing only.
from __future__ import annotations

import contextvars
import time
import zlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from typing import Any, cast
from urllib.parse import urlsplit

import certifi
import httpx
from curl_cffi import Curl, CurlECode, CurlInfo, CurlOpt
from curl_cffi.curl import CURL_WRITEFUNC_ERROR
from curl_cffi.requests import AsyncSession as CurlAsyncSession
from curl_cffi.requests.exceptions import (
    RequestException as CurlRequestException,
)
from curl_cffi.requests.exceptions import (
    Timeout as CurlTimeoutError,
)

from app.connectors.web_evidence.contracts import (
    DnsResolver,
    FetchCallTrace,
    FetchError,
    FetchRequest,
    FetchResult,
    RedirectHop,
    ResolvedTarget,
)
from app.connectors.web_evidence.url_policy import (
    UrlPolicyError,
    resolve_target,
)
from app.core.config.site_health import (
    BOT_BLOCK_BODY_MARKERS,
    BOT_BLOCK_MARKER_SCAN_BYTES,
    BOT_BLOCK_STATUSES,
    BOT_BLOCK_TLS_ERROR_MARKERS,
    CURL_UA_MODE_IMPERSONATE,
    ERROR_CONNECTION_FAILED,
    ERROR_MALFORMED_RESPONSE,
    ERROR_REDIRECT_LIMIT,
    ERROR_RESPONSE_TOO_LARGE,
    ERROR_SSRF_BLOCKED,
    ERROR_TIMEOUT,
    ERROR_UNSUPPORTED_CONTENT_TYPE,
    PERSISTED_RESPONSE_HEADERS,
    SITE_HEALTH_CURL_IMPERSONATE_TARGET,
    SITE_HEALTH_CURL_UA_MODE,
    SITE_HEALTH_USER_AGENT,
    site_health_settings,
)

_REDIRECT_STATUSES: frozenset[int] = frozenset({301, 302, 303, 307, 308})

# Config-owned bot-block body markers as matchable bytes (ASCII-only tokens).
_BOT_BLOCK_MARKER_BYTES: tuple[bytes, ...] = tuple(
    marker.encode("ascii") for marker in BOT_BLOCK_BODY_MARKERS
)


def is_bot_block_result(result: FetchResult) -> bool:
    """Config-owned bot-block signature on a fetch RESULT (spec §5.4).

    True when the terminal status is in ``BOT_BLOCK_STATUSES`` or a challenge
    body marker appears within the first ``BOT_BLOCK_MARKER_SCAN_BYTES`` of
    the decoded body. Shared by the fetcher (rung-1 escalation trigger) and
    the worker (T8: detecting an exhausted both-rungs block) so the signature
    logic lives in exactly one place.
    """
    if result.status_code in BOT_BLOCK_STATUSES:
        return True
    if not _BOT_BLOCK_MARKER_BYTES:
        return False
    prefix = result.body[:BOT_BLOCK_MARKER_SCAN_BYTES].lower()
    return any(marker in prefix for marker in _BOT_BLOCK_MARKER_BYTES)


# CURLINFO_HTTP_VERSION values -> FetchResult.http_version strings.
_CURL_HTTP_VERSIONS: dict[int, str] = {1: "1.0", 2: "1.1", 3: "2", 30: "3"}

# Per-request-context holder for the in-flight Curl handle. The write
# callback closure captures the list; ``pop_curl`` overwrites its single
# slot. Contextvars scoping keeps the seam safe even on a shared session
# (D3 spike verdict, /var/tmp/d3-spike/REPORT.md).
_CURL_HOLDER: contextvars.ContextVar[list] = contextvars.ContextVar(
    "site_health_curl_holder"
)


class _HandleAwareCurlSession(CurlAsyncSession):
    """curl_cffi AsyncSession that publishes the Curl handle it drives.

    ``pop_curl()`` is a public method curl_cffi's ``_request_once`` calls
    BEFORE ``set_curl_options()``/perform, so by the time any write callback
    fires the holder is populated. This seam is what lets the write callback
    read the LIVE wire-byte counter (``CurlInfo.SIZE_DOWNLOAD_T``) inline
    with the transfer — the D3 gating-spike verdict. It is the ONLY override.
    """

    async def pop_curl(self) -> Curl:
        curl = await super().pop_curl()
        holder = _CURL_HOLDER.get(None)
        if holder is not None:
            holder[:] = (curl,)
        return curl


def _default_curl_session_factory(
    *, trust_env: bool, verify: str, curl_options: dict
) -> CurlAsyncSession:
    """Build the production rung-2 session for ONE escalation network call.

    ``trust_env=False`` AND an explicit certifi CA bundle close BOTH hostile
    curl_cffi defaults (it otherwise reads proxy env vars AND
    ``REQUESTS_CA_BUNDLE``/``CURL_CA_BUNDLE`` when verify is True/None). The
    per-hop pinned IP arrives via ``curl_options[CurlOpt.RESOLVE]``.
    """
    return _HandleAwareCurlSession(
        trust_env=trust_env,
        # curl_cffi's stubs type ``verify`` as bool-only, but a CA bundle
        # PATH is the documented runtime input (and the whole point here).
        verify=verify,  # type: ignore[arg-type]
        curl_options=curl_options,
    )


@dataclass
class _CurlHopState:
    """Mutable per-hop counters for rung 2's LIVE dual byte cap (D3)."""

    chunks: int = 0
    wire_bytes: int = 0
    decoded_bytes: int = 0
    # -1 = unknown (e.g. chunked transfer-encoding).
    content_length: int = -1
    # Intentional-abort flags: curl error 23 is only ever mapped to
    # ``response_too_large`` / ``unsupported_content_type`` when one of these
    # is set — a genuine write failure never aliases to them.
    aborted_by_cap: bool = False
    abort_reason: str = ""
    aborted_for_content_type: bool = False
    rejected_content_type: str = ""
    ttfb_ms: int | None = None


def _curl_http_version(response: Any) -> str:
    return _CURL_HTTP_VERSIONS.get(getattr(response, "http_version", 0) or 0, "")


def _curl_info_int(curl: Curl, info: CurlInfo) -> int:
    """Read a numeric CURLINFO counter as int (stubs over-widen the return)."""
    return int(cast("int | float", curl.getinfo(info)))


def redact_headers(headers: httpx.Headers | dict) -> dict[str, str]:
    """Keep only the config-allowlisted response headers (lowercased keys).

    Everything else (Set-Cookie, Authorization echoes, etc.) is dropped so no
    sensitive header is ever persisted or logged.
    """
    out: dict[str, str] = {}
    items: Iterable[tuple[str, str]] = (
        headers.items() if hasattr(headers, "items") else []
    )
    for key, value in items:
        lk = str(key).lower()
        if lk in PERSISTED_RESPONSE_HEADERS:
            out[lk] = str(value)
    return out


def _content_type(headers: httpx.Headers) -> str:
    raw = headers.get("content-type", "")
    return str(raw).split(";", 1)[0].strip().lower()


def _charset(headers: httpx.Headers) -> str:
    """Return the lowercased ``charset`` parameter of Content-Type, if any.

    Preserved separately from ``_content_type()`` (which intentionally strips
    parameters) so downstream HTML parsing can honor a non-UTF-8 charset
    instead of hard-coding UTF-8.
    """
    raw = str(headers.get("content-type", ""))
    for part in raw.split(";")[1:]:
        key, _, value = part.strip().partition("=")
        if key.strip().lower() == "charset":
            return value.strip().strip('"').strip("'").lower()
    return ""


def _incremental_decoder(content_encoding: str):
    """Return ``(decode_chunk, decompressor)`` for the wire encoding.

    ``decode_chunk`` is a ``callable(chunk)->bytes`` that feeds a chunk into the
    decompressor. ``decompressor`` is the underlying ``zlib`` object (``None``
    for identity/unknown encodings) so the caller can, after the stream ends,
    flush any buffered tail and inspect ``.eof`` — a gzip/deflate stream that
    was cut off mid-way never sets ``eof``, which is how a truncated response is
    detected (a truncated stream does not necessarily raise ``zlib.error``).

    Supports gzip and deflate (the encodings a compression bomb would use);
    ``identity``/unknown pass bytes through unchanged. brotli is not a
    dependency, so a ``br`` body is treated as opaque wire bytes (the wire cap
    still bounds it).
    """
    enc = str(content_encoding or "").strip().lower()
    if enc == "gzip":
        obj = zlib.decompressobj(16 + zlib.MAX_WBITS)
        return (lambda chunk: obj.decompress(chunk)), obj
    if enc == "deflate":
        obj = zlib.decompressobj()
        return (lambda chunk: obj.decompress(chunk)), obj
    return (lambda chunk: chunk), None


class SecureFetcher:
    """Shared SSRF-safe fetcher: rung 1 (httpx) + rung 2 (curl_cffi).

    Construct with the injected DNS ``resolver`` and, optionally, an httpx
    ``transport`` (tests pass ``httpx.MockTransport``). When a transport is
    injected the rung-1 fetcher sends to the canonical URL as-is (so the mock
    can match it); in production (no transport) it pins the validated
    connection IP while preserving Host + SNI.

    ``curl_session_factory`` builds the curl_cffi session for ONE rung-2
    network call (tests inject a fake session). Unlike the httpx test seam,
    it changes NOTHING about what is dialed: rung 2 ALWAYS pins the validated
    ``connect_ip`` via ``CurlOpt.RESOLVE`` and ALWAYS sends the canonical URL
    — the factory only swaps how the session object is created, so injected
    tests still exercise the real production escalation path.
    """

    def __init__(
        self,
        *,
        resolver: DnsResolver,
        transport: httpx.AsyncBaseTransport | None = None,
        settings=site_health_settings,
        user_agent: str = SITE_HEALTH_USER_AGENT,
        curl_session_factory: Callable[..., Any] | None = None,
    ) -> None:
        self._resolver = resolver
        self._settings = settings
        self._user_agent = user_agent
        self._injected_transport = transport
        self._curl_session_factory = (
            curl_session_factory or _default_curl_session_factory
        )
        # In production we pin the IP ourselves, so the transport must never
        # re-resolve or read the host environment (invariant: trust_env=False).
        self._client = httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            trust_env=False,
            timeout=httpx.Timeout(settings.request_timeout_seconds),
            headers={"user-agent": user_agent},
        )
        self._pin_ip = transport is None

    async def __aenter__(self) -> SecureFetcher:
        return self

    async def __aexit__(self, *exc) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    def _limits(self, request: FetchRequest) -> tuple[int, int, float, int]:
        s = self._settings
        return (
            request.max_wire_bytes or s.max_response_wire_bytes,
            request.max_decoded_bytes or s.max_response_decoded_bytes,
            request.timeout_seconds or s.request_timeout_seconds,
            request.max_redirects
            if request.max_redirects is not None
            else s.max_redirects,
        )

    def _build_httpx_request(
        self,
        *,
        method: str,
        target: ResolvedTarget,
        extra_headers: dict[str, str],
        timeout: float,
    ) -> httpx.Request:
        headers = dict(extra_headers)
        if self._pin_ip:
            # Dial the pinned, validated IP but keep Host + SNI = original host
            # (DNS-rebinding protection). httpcore uses the sni_hostname
            # extension for the TLS handshake.
            parts = urlsplit(target.url)
            host_header = target.host
            if target.port not in (80, 443):
                host_header = f"{target.host}:{target.port}"
            ip_literal = (
                f"[{target.connect_ip}]"
                if ":" in target.connect_ip
                else target.connect_ip
            )
            dial_url = parts._replace(netloc=f"{ip_literal}:{target.port}").geturl()
            headers["host"] = host_header
            return self._client.build_request(
                method,
                dial_url,
                headers=headers,
                timeout=timeout,
                extensions={"sni_hostname": target.host},
            )
        return self._client.build_request(
            method, target.url, headers=headers, timeout=timeout
        )

    async def fetch(
        self,
        request: FetchRequest,
        *,
        root_registrable_domain: str | None = None,
        include_globs: list[str] | None = None,
        exclude_globs: list[str] | None = None,
        enforce_scope: bool = False,
    ) -> FetchResult:
        """Fetch ``request.url`` with full SSRF + size + redirect enforcement.

        Re-validates the initial URL and every redirect hop. Returns a bounded,
        redacted ``FetchResult`` (including 4xx/5xx — the caller classifies the
        status); raises ``FetchError`` with a safe token for SSRF, redirect
        limit, oversize, unsupported content type, or timeout.

        Escalation (T7, spec §5.4): when rung 1 (httpx) ends on a config-owned
        bot-block signature — a status in ``BOT_BLOCK_STATUSES``, a challenge
        body marker, or a TLS-layer block — the SAME request is retried ONCE
        with impersonated curl_cffi (rung 2), inside this single call (no
        extra queue attempt). A rung-2 terminal response is returned even when
        it is itself blocked (the trace keeps both rungs' calls); a rung-2
        ``FetchError`` propagates. The per-network-call trace is carried on
        the returned ``FetchResult.attempts`` AND on any raised
        ``FetchError.attempts`` (dual-field design), so the trace survives
        failure; the entry describing a returned result is always the last.

        ``request.allow_escalation=False`` (the crawl's frozen ``http_only``
        fetch mode) disables rung 2 entirely: a bot-block signature never
        triggers an impersonated retry and the rung-1 outcome stands.
        """
        limits = self._limits(request)
        attempts: list[FetchCallTrace] = []
        try:
            result = await self._fetch_httpx_rung(
                request,
                root_registrable_domain=root_registrable_domain,
                include_globs=include_globs,
                exclude_globs=exclude_globs,
                enforce_scope=enforce_scope,
                limits=limits,
                attempts=attempts,
            )
        except FetchError as exc:
            if not exc.attempts:
                exc.attempts = tuple(attempts)
            if request.allow_escalation and self._is_tls_block_signature(exc):
                return await self._escalate(
                    request,
                    root_registrable_domain=root_registrable_domain,
                    include_globs=include_globs,
                    exclude_globs=exclude_globs,
                    enforce_scope=enforce_scope,
                    limits=limits,
                    attempts=attempts,
                )
            raise
        if not request.allow_escalation or not self._is_bot_block_result(result):
            return replace(result, attempts=tuple(attempts))
        return await self._escalate(
            request,
            root_registrable_domain=root_registrable_domain,
            include_globs=include_globs,
            exclude_globs=exclude_globs,
            enforce_scope=enforce_scope,
            limits=limits,
            attempts=attempts,
        )

    def _trace(
        self,
        attempts: list[FetchCallTrace],
        *,
        rung_number: int,
        url: str,
        method: str,
        status_code: int | None,
        error_code: str | None,
        wire_bytes: int | None,
        decoded_bytes: int | None,
        ttfb_ms: int | None,
        started: float,
    ) -> None:
        """Append ONE immutable trace entry for ONE real network call."""
        attempts.append(
            FetchCallTrace(
                request_ordinal=len(attempts),
                rung_number=rung_number,
                url=url,
                method=method,
                status_code=status_code,
                error_code=error_code,
                wire_bytes=wire_bytes,
                decoded_bytes=decoded_bytes,
                ttfb_ms=ttfb_ms,
                latency_ms=int((time.monotonic() - started) * 1000),
            )
        )

    def _is_bot_block_result(self, result: FetchResult) -> bool:
        """Config-owned bot-block signature on a rung-1 RESULT (spec §5.4)."""
        return is_bot_block_result(result)

    def _is_tls_block_signature(self, exc: FetchError) -> bool:
        """TLS-layer bot block: rung 1's SEND-PHASE transport failure only.

        Scoped to the exact send-phase mapping (``ssrf_blocked`` + retryable)
        so URL-policy rejections (``UrlPolicyError`` causes), timeouts, and
        mid-body read failures never trigger an impersonated retry.
        """
        if exc.error_code != ERROR_SSRF_BLOCKED or not exc.retryable:
            return False
        cause = exc.__cause__
        if cause is None or isinstance(cause, UrlPolicyError):
            return False
        text = repr(cause).lower()
        return any(marker in text for marker in BOT_BLOCK_TLS_ERROR_MARKERS)

    async def _escalate(
        self,
        request: FetchRequest,
        *,
        root_registrable_domain: str | None,
        include_globs: list[str] | None,
        exclude_globs: list[str] | None,
        enforce_scope: bool,
        limits: tuple[int, int, float, int],
        attempts: list[FetchCallTrace],
    ) -> FetchResult:
        """Run rung 2 exactly once; keep the whole-call trace either way."""
        try:
            result = await self._fetch_curl_rung(
                request,
                root_registrable_domain=root_registrable_domain,
                include_globs=include_globs,
                exclude_globs=exclude_globs,
                enforce_scope=enforce_scope,
                limits=limits,
                attempts=attempts,
            )
        except FetchError as exc:
            if not exc.attempts:
                exc.attempts = tuple(attempts)
            raise
        return replace(result, attempts=tuple(attempts))

    async def _fetch_httpx_rung(
        self,
        request: FetchRequest,
        *,
        root_registrable_domain: str | None,
        include_globs: list[str] | None,
        exclude_globs: list[str] | None,
        enforce_scope: bool,
        limits: tuple[int, int, float, int],
        attempts: list[FetchCallTrace],
    ) -> FetchResult:
        """Rung 1: the httpx fetch. One trace entry per real network call."""
        (
            max_wire,
            max_decoded,
            timeout,
            max_redirects,
        ) = limits

        current_url = request.url
        redirect_chain: list[RedirectHop] = []
        started = time.monotonic()

        for hop in range(max_redirects + 1):
            target = await self._resolve(
                current_url,
                root_registrable_domain=root_registrable_domain,
                include_globs=include_globs,
                exclude_globs=exclude_globs,
                enforce_scope=enforce_scope,
            )
            httpx_request = self._build_httpx_request(
                method=request.method,
                target=target,
                extra_headers=request.headers,
                timeout=timeout,
            )
            hop_started = time.monotonic()
            try:
                response = await self._client.send(httpx_request, stream=True)
            except httpx.TimeoutException as exc:
                self._trace(
                    attempts,
                    rung_number=1,
                    url=target.url,
                    method=request.method,
                    status_code=None,
                    error_code=ERROR_TIMEOUT,
                    wire_bytes=None,
                    decoded_bytes=None,
                    ttfb_ms=None,
                    started=hop_started,
                )
                raise FetchError(
                    "request timed out",
                    error_code=ERROR_TIMEOUT,
                    retryable=True,
                ) from exc
            except httpx.HTTPError as exc:
                # Network-level failure: classify as SSRF-adjacent connection
                # error but keep the message safe.
                self._trace(
                    attempts,
                    rung_number=1,
                    url=target.url,
                    method=request.method,
                    status_code=None,
                    error_code=ERROR_SSRF_BLOCKED,
                    wire_bytes=None,
                    decoded_bytes=None,
                    ttfb_ms=None,
                    started=hop_started,
                )
                raise FetchError(
                    f"connection error: {type(exc).__name__}",
                    error_code=ERROR_SSRF_BLOCKED,
                    retryable=True,
                ) from exc

            if response.status_code in _REDIRECT_STATUSES:
                location = response.headers.get("location")
                await response.aclose()
                if not location:
                    # A redirect status without a target: treat as final.
                    self._trace(
                        attempts,
                        rung_number=1,
                        url=target.url,
                        method=request.method,
                        status_code=response.status_code,
                        error_code=None,
                        wire_bytes=0,
                        decoded_bytes=0,
                        ttfb_ms=None,
                        started=hop_started,
                    )
                    return self._finalize_no_body(
                        request, target, response, redirect_chain, started
                    )
                if hop >= max_redirects:
                    self._trace(
                        attempts,
                        rung_number=1,
                        url=target.url,
                        method=request.method,
                        status_code=response.status_code,
                        error_code=ERROR_REDIRECT_LIMIT,
                        wire_bytes=None,
                        decoded_bytes=None,
                        ttfb_ms=None,
                        started=hop_started,
                    )
                    raise FetchError(
                        "too many redirects",
                        error_code=ERROR_REDIRECT_LIMIT,
                    )
                next_url = self._resolve_location(target.url, location)
                redirect_chain.append(
                    RedirectHop(
                        from_url=target.url,
                        to_url=next_url,
                        status_code=response.status_code,
                    )
                )
                self._trace(
                    attempts,
                    rung_number=1,
                    url=target.url,
                    method=request.method,
                    status_code=response.status_code,
                    error_code=None,
                    # Redirect bodies are deliberately unread.
                    wire_bytes=None,
                    decoded_bytes=None,
                    ttfb_ms=None,
                    started=hop_started,
                )
                current_url = next_url
                continue

            # Terminal response: stream body under both caps.
            try:
                result = await self._read_body(
                    request=request,
                    target=target,
                    response=response,
                    redirect_chain=redirect_chain,
                    started=started,
                    max_wire=max_wire,
                    max_decoded=max_decoded,
                )
            except FetchError as exc:
                self._trace(
                    attempts,
                    rung_number=1,
                    url=target.url,
                    method=request.method,
                    status_code=response.status_code,
                    error_code=exc.error_code,
                    wire_bytes=None,
                    decoded_bytes=None,
                    ttfb_ms=None,
                    started=hop_started,
                )
                raise
            self._trace(
                attempts,
                rung_number=1,
                url=target.url,
                method=request.method,
                status_code=result.status_code,
                error_code=None,
                wire_bytes=result.wire_bytes,
                decoded_bytes=result.decoded_bytes,
                ttfb_ms=result.ttfb_ms,
                started=hop_started,
            )
            return result

        raise FetchError("too many redirects", error_code=ERROR_REDIRECT_LIMIT)

    async def _resolve(
        self,
        url: str,
        *,
        root_registrable_domain: str | None,
        include_globs: list[str] | None,
        exclude_globs: list[str] | None,
        enforce_scope: bool,
    ) -> ResolvedTarget:
        try:
            return await resolve_target(
                url,
                resolver=self._resolver,
                root_registrable_domain=root_registrable_domain,
                include_globs=include_globs,
                exclude_globs=exclude_globs,
                enforce_scope=enforce_scope,
            )
        except UrlPolicyError as exc:
            # Out-of-scope / disallowed scheme-port-userinfo on a redirect hop.
            raise FetchError(str(exc), error_code=ERROR_SSRF_BLOCKED) from exc

    def _resolve_location(self, base_url: str, location: str) -> str:
        from urllib.parse import urljoin

        return urljoin(base_url, location)

    def _finalize_no_body(
        self,
        request: FetchRequest,
        target: ResolvedTarget,
        response: httpx.Response,
        redirect_chain: list[RedirectHop],
        started: float,
    ) -> FetchResult:
        latency = int((time.monotonic() - started) * 1000)
        return FetchResult(
            requested_url=request.url,
            final_url=target.url,
            status_code=response.status_code,
            redacted_headers=redact_headers(response.headers),
            content_type=_content_type(response.headers),
            http_version=response.http_version or "",
            body=b"",
            wire_bytes=0,
            decoded_bytes=0,
            ttfb_ms=latency,
            latency_ms=latency,
            redirect_chain=tuple(redirect_chain),
            charset=_charset(response.headers),
        )

    async def _read_body(
        self,
        *,
        request: FetchRequest,
        target: ResolvedTarget,
        response: httpx.Response,
        redirect_chain: list[RedirectHop],
        started: float,
        max_wire: int,
        max_decoded: int,
    ) -> FetchResult:
        ttfb = int((time.monotonic() - started) * 1000)
        content_type = _content_type(response.headers)
        allowed = request.allowed_content_types
        # An empty status body (204/304) or HEAD carries no content-type; only
        # enforce the allowlist when one is set on the request.
        if allowed and content_type and content_type not in allowed:
            await response.aclose()
            raise FetchError(
                f"unsupported content type: {content_type}",
                error_code=ERROR_UNSUPPORTED_CONTENT_TYPE,
            )

        decode, decompressor = _incremental_decoder(
            response.headers.get("content-encoding", "")
        )
        wire_total = 0
        decoded_total = 0
        decoded_chunks: list[bytes] = []
        try:
            async for raw in response.aiter_raw():
                wire_total += len(raw)
                if wire_total > max_wire:
                    raise FetchError(
                        "response exceeded wire byte cap",
                        error_code=ERROR_RESPONSE_TOO_LARGE,
                    )
                try:
                    out = decode(raw)
                except zlib.error as exc:
                    # Malformed gzip/deflate: never mix raw wire bytes into a
                    # partially-decoded body (that would silently corrupt
                    # ``FetchResult.body``). Fail the fetch instead.
                    raise FetchError(
                        "malformed compressed response body",
                        error_code=ERROR_MALFORMED_RESPONSE,
                    ) from exc
                if out:
                    decoded_total += len(out)
                    if decoded_total > max_decoded:
                        raise FetchError(
                            "response exceeded decoded byte cap (compression bomb)",
                            error_code=ERROR_RESPONSE_TOO_LARGE,
                        )
                    decoded_chunks.append(out)
            if decompressor is not None:
                # Flush any tail buffered inside the decompressor, then confirm
                # the stream actually ended. A truncated gzip/deflate body
                # (connection cut before the final block) yields fewer bytes
                # WITHOUT raising ``zlib.error`` and leaves ``eof`` False; if
                # we accepted it we would silently persist a partial page as if
                # it were complete. The flushed tail is still subject to the
                # decoded cap so a bomb cannot smuggle bytes past the loop.
                try:
                    tail = decompressor.flush()
                except zlib.error as exc:
                    raise FetchError(
                        "malformed compressed response body",
                        error_code=ERROR_MALFORMED_RESPONSE,
                    ) from exc
                if tail:
                    decoded_total += len(tail)
                    if decoded_total > max_decoded:
                        raise FetchError(
                            "response exceeded decoded byte cap (compression bomb)",
                            error_code=ERROR_RESPONSE_TOO_LARGE,
                        )
                    decoded_chunks.append(tail)
                if not decompressor.eof:
                    raise FetchError(
                        "truncated compressed response body",
                        error_code=ERROR_MALFORMED_RESPONSE,
                        retryable=True,
                    )
        except httpx.TimeoutException as exc:
            raise FetchError(
                "request timed out",
                error_code=ERROR_TIMEOUT,
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            # A stream-read failure (e.g. connection reset mid-body) after
            # ``send()`` succeeded: classify it the same way as the request
            # phase instead of letting it propagate as an unclassified error.
            raise FetchError(
                f"connection error: {type(exc).__name__}",
                error_code=ERROR_CONNECTION_FAILED,
                retryable=True,
            ) from exc
        finally:
            await response.aclose()

        latency = int((time.monotonic() - started) * 1000)
        return FetchResult(
            requested_url=request.url,
            final_url=target.url,
            status_code=response.status_code,
            redacted_headers=redact_headers(response.headers),
            content_type=content_type,
            http_version=response.http_version or "",
            body=b"".join(decoded_chunks),
            wire_bytes=wire_total,
            decoded_bytes=decoded_total,
            ttfb_ms=ttfb,
            latency_ms=latency,
            redirect_chain=tuple(redirect_chain),
            charset=_charset(response.headers),
        )

    # --- rung 2: curl_cffi escalation (T7, spec §5.4) ----------------------

    async def _fetch_curl_rung(
        self,
        request: FetchRequest,
        *,
        root_registrable_domain: str | None,
        include_globs: list[str] | None,
        exclude_globs: list[str] | None,
        enforce_scope: bool,
        limits: tuple[int, int, float, int],
        attempts: list[FetchCallTrace],
    ) -> FetchResult:
        """Rung 2: ONE impersonated curl_cffi retry of the same request.

        Every rung-1 safety property is preserved: manual redirects with
        per-hop ``resolve_target`` revalidation (curl_cffi NEVER follows
        redirects itself — GHSA-qw2m-4pqf-rmpp), pinned-IP dial via
        ``CurlOpt.RESOLVE`` against the already-validated ``connect_ip``
        while the canonical URL keeps Host + TLS SNI, LIVE wire+decoded byte
        caps (the D3 seam — see ``_make_curl_cap_callback``), the
        ``PERSISTED_RESPONSE_HEADERS`` redaction, and no env proxy trust
        (``trust_env=False`` + explicit certifi bundle, both set by the
        session factory call below). Politeness is preserved structurally:
        escalation stays inside this fetch call, so the worker's per-host
        semaphore/delay slot spans both rungs, and robots was evaluated
        before the fetch started — rung 2 cannot bypass it.
        """
        (
            max_wire,
            max_decoded,
            timeout,
            max_redirects,
        ) = limits

        current_url = request.url
        redirect_chain: list[RedirectHop] = []
        rung_started = time.monotonic()

        for hop in range(max_redirects + 1):
            target = await self._resolve(
                current_url,
                root_registrable_domain=root_registrable_domain,
                include_globs=include_globs,
                exclude_globs=exclude_globs,
                enforce_scope=enforce_scope,
            )
            hop_started = time.monotonic()
            holder: list[Curl] = []
            _CURL_HOLDER.set(holder)
            state = _CurlHopState()
            sink = bytearray()
            session = self._curl_session_factory(
                trust_env=False,
                verify=certifi.where(),
                curl_options={
                    CurlOpt.RESOLVE: [
                        f"{target.host}:{target.port}:{target.connect_ip}"
                    ]
                },
            )
            headers = dict(request.headers)
            request_kwargs: dict[str, Any] = {}
            if (
                SITE_HEALTH_CURL_UA_MODE == CURL_UA_MODE_IMPERSONATE
                and SITE_HEALTH_CURL_IMPERSONATE_TARGET
            ):
                # Full Chrome impersonation (UA + TLS fingerprint) — the
                # settled D2 decision, one config constant to revert.
                request_kwargs["impersonate"] = SITE_HEALTH_CURL_IMPERSONATE_TARGET
            else:
                headers.setdefault("user-agent", self._user_agent)
            try:
                async with session:
                    response = await session.request(
                        cast("Any", request.method),
                        target.url,
                        headers=headers,
                        allow_redirects=False,
                        timeout=timeout,
                        content_callback=_make_curl_cap_callback(
                            holder=holder,
                            state=state,
                            sink=sink,
                            max_wire=max_wire,
                            max_decoded=max_decoded,
                            allowed_content_types=request.allowed_content_types,
                            hop_started=hop_started,
                        ),
                        **request_kwargs,
                    )
            except CurlTimeoutError as exc:
                self._trace(
                    attempts,
                    rung_number=2,
                    url=target.url,
                    method=request.method,
                    status_code=None,
                    error_code=ERROR_TIMEOUT,
                    wire_bytes=None,
                    decoded_bytes=None,
                    ttfb_ms=None,
                    started=hop_started,
                )
                raise FetchError(
                    "request timed out",
                    error_code=ERROR_TIMEOUT,
                    retryable=True,
                ) from exc
            except CurlRequestException as exc:
                fetch_error = self._map_curl_error(exc, state)
                self._trace(
                    attempts,
                    rung_number=2,
                    url=target.url,
                    method=request.method,
                    status_code=fetch_error.status_code,
                    error_code=fetch_error.error_code,
                    wire_bytes=state.wire_bytes or None,
                    decoded_bytes=state.decoded_bytes or None,
                    ttfb_ms=state.ttfb_ms,
                    started=hop_started,
                )
                raise fetch_error from exc

            # Wire-byte accounting: curl_cffi's ``release_curl`` RESETS the
            # handle inside ``_request_once`` before returning, so no
            # post-transfer getinfo is possible and the callback's last live
            # sample stands. For an UNENCODED body wire == decoded exactly
            # (the live sample can lag one chunk); a compressed body keeps
            # the final live sample, which can understate the true wire
            # total by at most one callback chunk (<= 16 KiB) — a documented
            # diagnostic bound. Cap ENFORCEMENT used the live samples
            # mid-transfer and is unaffected by this.
            encoding = str(response.headers.get("content-encoding", ""))
            if encoding.strip().lower() in ("", "identity"):
                state.wire_bytes = state.decoded_bytes

            if response.status_code in _REDIRECT_STATUSES:
                location = response.headers.get("location")
                if not location:
                    # A redirect status without a target: treat as final
                    # (rung-1 parity: the body is not returned).
                    self._trace(
                        attempts,
                        rung_number=2,
                        url=target.url,
                        method=request.method,
                        status_code=response.status_code,
                        error_code=None,
                        wire_bytes=state.wire_bytes,
                        decoded_bytes=state.decoded_bytes,
                        ttfb_ms=state.ttfb_ms,
                        started=hop_started,
                    )
                    return self._finalize_curl_no_body(
                        request, target, response, redirect_chain, rung_started
                    )
                self._trace(
                    attempts,
                    rung_number=2,
                    url=target.url,
                    method=request.method,
                    status_code=response.status_code,
                    error_code=None,
                    wire_bytes=state.wire_bytes,
                    decoded_bytes=state.decoded_bytes,
                    ttfb_ms=state.ttfb_ms,
                    started=hop_started,
                )
                if hop >= max_redirects:
                    raise FetchError(
                        "too many redirects",
                        error_code=ERROR_REDIRECT_LIMIT,
                    )
                next_url = self._resolve_location(target.url, location)
                redirect_chain.append(
                    RedirectHop(
                        from_url=target.url,
                        to_url=next_url,
                        status_code=response.status_code,
                    )
                )
                current_url = next_url
                continue

            # Terminal response. The content-type gate already fired inline
            # at the first body byte (early abort); re-check here for the
            # empty-body case where the callback never ran.
            content_type = _content_type(response.headers)
            allowed = request.allowed_content_types
            if allowed and content_type and content_type not in allowed:
                self._trace(
                    attempts,
                    rung_number=2,
                    url=target.url,
                    method=request.method,
                    status_code=response.status_code,
                    error_code=ERROR_UNSUPPORTED_CONTENT_TYPE,
                    wire_bytes=state.wire_bytes,
                    decoded_bytes=state.decoded_bytes,
                    ttfb_ms=state.ttfb_ms,
                    started=hop_started,
                )
                raise FetchError(
                    f"unsupported content type: {content_type}",
                    error_code=ERROR_UNSUPPORTED_CONTENT_TYPE,
                    status_code=response.status_code,
                )
            self._trace(
                attempts,
                rung_number=2,
                url=target.url,
                method=request.method,
                status_code=response.status_code,
                error_code=None,
                wire_bytes=state.wire_bytes,
                decoded_bytes=state.decoded_bytes,
                ttfb_ms=state.ttfb_ms,
                started=hop_started,
            )
            latency = int((time.monotonic() - rung_started) * 1000)
            ttfb = state.ttfb_ms
            if ttfb is not None:
                # state.ttfb_ms is relative to the FINAL hop; anchor it to
                # the rung start (rung-1 ttfb semantics are whole-call).
                ttfb += int((hop_started - rung_started) * 1000)
            return FetchResult(
                requested_url=request.url,
                final_url=target.url,
                status_code=response.status_code,
                redacted_headers=redact_headers(response.headers),
                content_type=content_type,
                http_version=_curl_http_version(response),
                body=bytes(sink),
                wire_bytes=state.wire_bytes,
                decoded_bytes=state.decoded_bytes,
                ttfb_ms=ttfb,
                latency_ms=latency,
                redirect_chain=tuple(redirect_chain),
                charset=_charset(response.headers),
            )

        raise FetchError("too many redirects", error_code=ERROR_REDIRECT_LIMIT)

    def _map_curl_error(
        self, exc: CurlRequestException, state: _CurlHopState
    ) -> FetchError:
        """Translate a curl_cffi failure into a safe, classified FetchError.

        The intentional-abort flags are what make curl error 23
        (``CURL_WRITEFUNC_ERROR``) meaningful: it maps to
        ``response_too_large`` / ``unsupported_content_type`` ONLY when our
        own callback set the flag — a genuine write failure (verified: real
        connect errors surface as code 7) stays a generic connection error.
        """
        response = getattr(exc, "response", None)
        status = getattr(response, "status_code", None) if response else None
        code = getattr(exc, "code", None)
        if code == CurlECode.WRITE_ERROR:
            if state.aborted_by_cap:
                return FetchError(
                    f"response exceeded byte cap ({state.abort_reason})",
                    error_code=ERROR_RESPONSE_TOO_LARGE,
                    status_code=status or None,
                )
            if state.aborted_for_content_type:
                return FetchError(
                    f"unsupported content type: {state.rejected_content_type}",
                    error_code=ERROR_UNSUPPORTED_CONTENT_TYPE,
                    status_code=status or None,
                )
        if code == CurlECode.OPERATION_TIMEDOUT:
            return FetchError(
                "request timed out",
                error_code=ERROR_TIMEOUT,
                status_code=status or None,
                retryable=True,
            )
        if code in (CurlECode.BAD_CONTENT_ENCODING, CurlECode.PARTIAL_FILE):
            # libcurl-level gzip/chunked validation — the rung-1 zlib-eof
            # parity: never accept a corrupt/partial body as complete.
            return FetchError(
                "malformed or truncated compressed response body",
                error_code=ERROR_MALFORMED_RESPONSE,
                status_code=status or None,
                retryable=code == CurlECode.PARTIAL_FILE,
            )
        return FetchError(
            f"connection error: {type(exc).__name__}",
            error_code=ERROR_CONNECTION_FAILED,
            status_code=status or None,
            retryable=True,
        )

    def _finalize_curl_no_body(
        self,
        request: FetchRequest,
        target: ResolvedTarget,
        response: Any,
        redirect_chain: list[RedirectHop],
        started: float,
    ) -> FetchResult:
        """Redirect-status-without-Location on rung 2 (rung-1 parity)."""
        latency = int((time.monotonic() - started) * 1000)
        return FetchResult(
            requested_url=request.url,
            final_url=target.url,
            status_code=response.status_code,
            redacted_headers=redact_headers(response.headers),
            content_type=_content_type(response.headers),
            http_version=_curl_http_version(response),
            body=b"",
            wire_bytes=0,
            decoded_bytes=0,
            ttfb_ms=latency,
            latency_ms=latency,
            redirect_chain=tuple(redirect_chain),
            charset=_charset(response.headers),
        )


def _make_curl_cap_callback(
    *,
    holder: list[Curl],
    state: _CurlHopState,
    sink: bytearray,
    max_wire: int,
    max_decoded: int,
    allowed_content_types: frozenset[str],
    hop_started: float,
) -> Callable[[bytes], int]:
    """Build the rung-2 write callback enforcing the LIVE dual byte cap (D3).

    Wired to ``CURLOPT_WRITEFUNCTION`` by curl_cffi, so it fires INLINE with
    the transfer (no background reader — this is exactly why rung 2 does not
    use ``stream=True``, whose reader buffers unboundedly ahead of the
    consumer) and receives DECODED chunks (impersonation sets
    ``Accept-Encoding``; libcurl transparently decompresses). Per chunk it
    samples BOTH counters — live wire bytes via
    ``handle.getinfo(CurlInfo.SIZE_DOWNLOAD_T)`` and the accumulated decoded
    length — and aborts on whichever trips first by returning
    ``CURL_WRITEFUNC_ERROR`` (curl error 23), with the intentional-abort flag
    set so ``_map_curl_error`` can classify it. Overshoot beyond a cap is at
    most one callback chunk (<= 16 KiB; libcurl's max write size).
    """

    def on_chunk(chunk: bytes) -> int:
        state.chunks += 1
        if state.ttfb_ms is None:
            state.ttfb_ms = int((time.monotonic() - hop_started) * 1000)
        try:
            curl = holder[0] if holder else None
            if curl is not None and state.chunks == 1:
                # Headers are fully parsed by libcurl at the first body byte.
                # Content-type gate FIRST (never override HEADERFUNCTION for
                # this — it breaks curl_cffi's response parsing).
                if allowed_content_types:
                    raw_ct: object = curl.getinfo(CurlInfo.CONTENT_TYPE)
                    # libcurl returns this info as BYTES.
                    if isinstance(raw_ct, bytes):
                        raw_ct = raw_ct.decode("latin-1")
                    ct = str(raw_ct or "").split(";", 1)[0].strip().lower()
                    if ct and ct not in allowed_content_types:
                        state.aborted_for_content_type = True
                        state.rejected_content_type = ct
                        return CURL_WRITEFUNC_ERROR
                # Content-Length precheck: reject BEFORE streaming when the
                # declared length already exceeds the wire cap. -1 = unknown
                # (chunked) — the live counters below still bound it.
                cl = _curl_info_int(curl, CurlInfo.CONTENT_LENGTH_DOWNLOAD_T)
                state.content_length = cl
                if 0 < cl and cl > max_wire:
                    state.aborted_by_cap = True
                    state.abort_reason = (
                        f"declared content-length {cl} exceeds wire cap {max_wire}"
                    )
                    return CURL_WRITEFUNC_ERROR
            state.decoded_bytes += len(chunk)
            if curl is not None:
                state.wire_bytes = _curl_info_int(curl, CurlInfo.SIZE_DOWNLOAD_T)
            if state.wire_bytes > max_wire:
                state.aborted_by_cap = True
                state.abort_reason = f"wire {state.wire_bytes} > {max_wire}"
                return CURL_WRITEFUNC_ERROR
            if state.decoded_bytes > max_decoded:
                state.aborted_by_cap = True
                state.abort_reason = (
                    f"decoded {state.decoded_bytes} > {max_decoded}"
                    " (compression bomb)"
                )
                return CURL_WRITEFUNC_ERROR
        except Exception:
            # A cffi extern callback must NEVER raise: abort the transfer and
            # let the error mapping classify it as a generic connection error
            # (no intentional-abort flag — never TOO_LARGE).
            return CURL_WRITEFUNC_ERROR
        sink.extend(chunk)
        return len(chunk)

    return on_chunk
