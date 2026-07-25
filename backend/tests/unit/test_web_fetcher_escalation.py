"""Offline unit tests for the curl_cffi escalation rung (rung 2, T7).

Every test injects a fake ``DnsResolver`` (safe public IP so the policy's DNS
+ SSRF gate passes), an ``httpx.MockTransport`` for rung 1, and a
``curl_session_factory`` returning a scripted fake curl session for rung 2 —
nothing hits the network. The fake session honors the SAME contract the real
``_HandleAwareCurlSession`` has: it publishes a handle into the
``_CURL_HOLDER`` contextvar before the transfer (mirroring ``pop_curl``),
drives ``content_callback`` per decoded chunk, and turns a
``CURL_WRITEFUNC_ERROR`` return into a code-23 ``RequestException`` — so the
live-cap, precheck, and error-mapping paths are exercised for real.

Covers: signature detection per status/marker/TLS-layer, single-retry-only,
redirect revalidation per hop, both byte caps + Content-Length precheck,
header redaction, trust_env/CA-bundle closure, canonical-URL + pinned-IP
dial, trace ordinals/rungs, trace survival on failure, and the UA-mode knob.
"""

from __future__ import annotations

import certifi
import httpx
import pytest
from curl_cffi import CurlInfo, CurlOpt
from curl_cffi.requests.exceptions import RequestException, Timeout

from app.connectors.web_evidence import fetcher as fetcher_module
from app.connectors.web_evidence.contracts import FetchError, FetchRequest
from app.connectors.web_evidence.fetcher import SecureFetcher
from app.core.config import site_health as sh_config

_PUBLIC_IP = "93.184.216.34"
_HTML = frozenset({"text/html"})


class _ByteStream(httpx.AsyncByteStream):
    def __init__(self, data: bytes) -> None:
        self._data = data

    async def __aiter__(self):
        yield self._data

    async def aclose(self) -> None:
        return None


def _rung1_response(
    status: int = 200,
    *,
    body: bytes = b"<html></html>",
    content_type: str = "text/html",
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    hdrs = {"content-type": content_type}
    if headers:
        hdrs.update(headers)
    return httpx.Response(status, headers=hdrs, stream=_ByteStream(body))


class _FakeResolver:
    def __init__(self, mapping: dict[str, list[str]] | None = None) -> None:
        self._mapping = mapping or {}
        self.calls: list[tuple[str, int]] = []

    async def resolve(self, host: str, port: int) -> list[str]:
        self.calls.append((host, port))
        return list(self._mapping.get(host, [_PUBLIC_IP]))


class _FakeCurlHandle:
    """Stands in for the ``Curl`` handle: serves scripted ``getinfo`` reads.

    ``wire_sizes`` are the cumulative ``SIZE_DOWNLOAD_T`` samples returned on
    successive calls (the live wire counter); the last value repeats.
    """

    def __init__(
        self,
        *,
        wire_sizes: list[int] | None = None,
        content_length: int = -1,
        content_type: str = "text/html",
    ) -> None:
        self._wire_sizes = list(wire_sizes or [])
        self._content_length = content_length
        self._content_type = content_type
        self._wire_reads = 0

    def getinfo(self, info):
        if info == CurlInfo.SIZE_DOWNLOAD_T:
            self._wire_reads += 1
            if not self._wire_sizes:
                return 0
            idx = min(self._wire_reads - 1, len(self._wire_sizes) - 1)
            return self._wire_sizes[idx]
        if info == CurlInfo.CONTENT_LENGTH_DOWNLOAD_T:
            return self._content_length
        if info == CurlInfo.CONTENT_TYPE:
            # libcurl returns this info as bytes — keep the fake faithful.
            return self._content_type.encode()
        raise KeyError(info)


class _FakeCurlResponse:
    def __init__(self, status: int, headers: dict[str, str] | None = None) -> None:
        self.status_code = status
        self.headers = httpx.Headers(headers or {})
        self.http_version = 2


class _Script:
    """One scripted rung-2 network call."""

    def __init__(
        self,
        status: int = 200,
        *,
        headers: dict[str, str] | None = None,
        chunks: list[bytes] | None = None,
        handle: _FakeCurlHandle | None = None,
        error: Exception | None = None,
    ) -> None:
        self.status = status
        self.headers = headers or {"content-type": "text/html"}
        self.chunks = chunks if chunks is not None else [b"<html>real</html>"]
        self.handle = handle
        self.error = error


class _FakeCurlSession:
    """Stands in for ``curl_cffi.requests.AsyncSession`` on rung 2."""

    def __init__(self, steps: list[_Script], captured: list[dict]) -> None:
        self._steps = steps
        self._captured = captured

    async def __aenter__(self) -> _FakeCurlSession:
        return self

    async def __aexit__(self, *exc) -> None:
        return None

    async def request(self, method, url, **kwargs):
        self._captured.append({"method": method, "url": url, **kwargs})
        step = self._steps.pop(0) if self._steps else _Script()
        if step.error is not None:
            raise step.error
        # Publish the handle through the same contextvar seam pop_curl uses.
        holder = fetcher_module._CURL_HOLDER.get(None)
        if holder is not None and step.handle is not None:
            holder[:] = (step.handle,)
        callback = kwargs.get("content_callback")
        for chunk in step.chunks:
            if callback is None:
                continue
            accepted = callback(chunk)
            if accepted != len(chunk):
                # The write callback aborted -> libcurl dies with error 23.
                raise RequestException(
                    "Failed to perform, curl: (23) client returned ERROR on "
                    f"write of {len(chunk)} bytes.",
                    code=23,
                    response=_FakeCurlResponse(step.status, step.headers),
                )
        return _FakeCurlResponse(step.status, step.headers)


def _escalation_fetcher(
    rung1_handler,
    resolver: _FakeResolver,
    steps: list[_Script],
) -> tuple[SecureFetcher, list[dict], list[dict]]:
    """Build a fetcher with scripted rung 1 + rung 2; return capture lists."""
    requests_captured: list[dict] = []
    factory_captured: list[dict] = []

    def factory(**kwargs):
        factory_captured.append(kwargs)
        return _FakeCurlSession(steps, requests_captured)

    fetcher = SecureFetcher(
        resolver=resolver,
        transport=httpx.MockTransport(rung1_handler),
        curl_session_factory=factory,
    )
    return fetcher, factory_captured, requests_captured


def _request(url: str = "https://example.com/", **overrides) -> FetchRequest:
    base = {"url": url, "purpose": "analyze", "allowed_content_types": _HTML}
    base.update(overrides)
    return FetchRequest(**base)


# --- signature detection: statuses + body markers --------------------------


@pytest.mark.parametrize("status", [401, 403, 503])
async def test_escalates_on_signature_status_and_rung2_result_wins(status):
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(status, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, factory_calls, curl_calls = _escalation_fetcher(
        handler, resolver, [_Script(200, chunks=[b"<html>real page</html>"])]
    )
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert result.status_code == 200
    assert result.body == b"<html>real page</html>"
    # Trace: rung-1 blocked call THEN rung-2 success, ordinals 0,1.
    trace = [(a.rung_number, a.request_ordinal, a.status_code) for a in result.attempts]
    assert trace == [
        (1, 0, status),
        (2, 1, 200),
    ]
    # The impersonated retry went out with full Chrome impersonation and
    # manual redirects.
    assert len(factory_calls) == 1
    assert curl_calls[0]["impersonate"] == "chrome131"
    assert curl_calls[0]["allow_redirects"] is False


async def test_escalates_on_challenge_body_marker_on_200():
    challenge = (
        b"<html><head><title>Just a moment...</title></head>"
        b'<body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate">'
        b"</script></body></html>"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(200, body=challenge)

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(
        handler, resolver, [_Script(200, chunks=[b"<html>real</html>"])]
    )
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert len(factory_calls) == 1
    assert result.body == b"<html>real</html>"


async def test_no_escalation_on_clean_200_with_lookalike_words():
    # Ordinary prose containing "captcha"/"cloudflare" is NOT a signature.
    body = b"<html><body>We wrote about captcha solvers and clouds.</body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(200, body=body)

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(handler, resolver, [])
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert result.status_code == 200
    assert result.body == body
    assert factory_calls == []
    assert [(a.rung_number, a.request_ordinal) for a in result.attempts] == [(1, 0)]


@pytest.mark.parametrize("status", [404, 410, 429, 500, 502])
async def test_no_escalation_on_non_signature_statuses(status):
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(status, body=b"x")

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(handler, resolver, [])
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert result.status_code == status
    assert factory_calls == []


async def test_marker_scan_is_bounded_to_the_config_prefix():
    # The marker sits PAST the scan prefix -> no escalation.
    body = b"x" * (sh_config.BOT_BLOCK_MARKER_SCAN_BYTES + 10) + b"just a moment"

    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(200, body=body)

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(handler, resolver, [])
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert result.status_code == 200
    assert factory_calls == []


# --- signature detection: TLS-layer blocks ---------------------------------


async def test_tls_layer_block_escalates():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE]")

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(
        handler, resolver, [_Script(200, chunks=[b"<html>real</html>"])]
    )
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert len(factory_calls) == 1
    assert result.status_code == 200
    assert [(a.rung_number, a.error_code, a.status_code) for a in result.attempts] == [
        (1, "ssrf_blocked", None),
        (2, None, 200),
    ]


async def test_plain_connect_error_does_not_escalate_and_trace_survives():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(handler, resolver, [])
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request())
    assert exc.value.error_code == "ssrf_blocked"
    assert factory_calls == []
    # The failed rung-1 call is still traced (trace survives failure).
    assert [(a.rung_number, a.error_code) for a in exc.value.attempts] == [
        (1, "ssrf_blocked")
    ]


async def test_url_policy_rejection_never_escalates():
    # Redirect into a private range: ssrf_blocked with a UrlPolicyError cause.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302, headers={"location": "https://internal.example.com/x"}
        )

    resolver = _FakeResolver(
        {"example.com": [_PUBLIC_IP], "internal.example.com": ["10.0.0.5"]}
    )
    fetcher, factory_calls, _ = _escalation_fetcher(handler, resolver, [])
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(
                _request(),
                root_registrable_domain="example.com",
                enforce_scope=True,
            )
    assert exc.value.error_code == "ssrf_blocked"
    assert factory_calls == []


# --- single retry only ------------------------------------------------------


async def test_single_retry_only_both_rungs_blocked():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, factory_calls, _ = _escalation_fetcher(
        handler, resolver, [_Script(403, chunks=[b"still blocked"])]
    )
    async with fetcher:
        result = await fetcher.fetch(_request())
    # Rung 2's terminal response is returned (NOT raised) for the caller to
    # classify, exactly like a rung-1 4xx today — and there is no third call.
    assert result.status_code == 403
    assert result.body == b"still blocked"
    assert len(factory_calls) == 1
    trace = [(a.rung_number, a.request_ordinal, a.status_code) for a in result.attempts]
    assert trace == [
        (1, 0, 403),
        (2, 1, 403),
    ]


# --- rung-2 preserved properties --------------------------------------------


async def test_rung2_pins_ip_sends_canonical_url_and_closes_env_trust():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, factory_calls, curl_calls = _escalation_fetcher(
        handler, resolver, [_Script(200)]
    )
    async with fetcher:
        await fetcher.fetch(_request(url="https://example.com/page"))
    # Hostile defaults closed: no env proxy/CA trust, explicit certifi bundle.
    assert factory_calls[0]["trust_env"] is False
    assert factory_calls[0]["verify"] == certifi.where()
    # Pinned-IP dial of the VALIDATED resolver IP...
    assert factory_calls[0]["curl_options"] == {
        CurlOpt.RESOLVE: [f"example.com:443:{_PUBLIC_IP}"]
    }
    # ...while the CANONICAL URL is sent (Host + SNI intact).
    assert curl_calls[0]["url"] == "https://example.com/page"


async def test_rung2_redirect_revalidates_each_hop():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver(
        {"example.com": [_PUBLIC_IP], "cdn.example.com": ["8.8.8.8"]}
    )
    fetcher, factory_calls, curl_calls = _escalation_fetcher(
        handler,
        resolver,
        [
            _Script(
                301, headers={"location": "https://cdn.example.com/new"}, chunks=[]
            ),
            _Script(200, chunks=[b"<html>real</html>"]),
        ],
    )
    async with fetcher:
        result = await fetcher.fetch(
            _request(url="https://example.com/old"),
            root_registrable_domain="example.com",
            enforce_scope=True,
        )
    assert result.status_code == 200
    assert result.final_url == "https://cdn.example.com/new"
    assert len(result.redirect_chain) == 1
    # One session per hop, each pinned to ITS hop's validated IP.
    assert len(factory_calls) == 2
    assert factory_calls[0]["curl_options"][CurlOpt.RESOLVE] == [
        f"example.com:443:{_PUBLIC_IP}"
    ]
    assert factory_calls[1]["curl_options"][CurlOpt.RESOLVE] == [
        "cdn.example.com:443:8.8.8.8"
    ]
    assert [c["url"] for c in curl_calls] == [
        "https://example.com/old",
        "https://cdn.example.com/new",
    ]
    # Each hop was re-resolved through the policy (scope/SSRF gate).
    assert ("cdn.example.com", 443) in resolver.calls
    # Trace: one entry per REAL network call across both rungs.
    trace = [(a.rung_number, a.request_ordinal, a.status_code) for a in result.attempts]
    assert trace == [
        (1, 0, 403),
        (2, 1, 301),
        (2, 2, 200),
    ]


async def test_rung2_redirect_to_private_ip_is_blocked():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver(
        {"example.com": [_PUBLIC_IP], "internal.example.com": ["10.0.0.5"]}
    )
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [
            _Script(
                302,
                headers={"location": "https://internal.example.com/x"},
                chunks=[],
            )
        ],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(
                _request(),
                root_registrable_domain="example.com",
                enforce_scope=True,
            )
    assert exc.value.error_code == "ssrf_blocked"
    # Trace survived: the blocked rung-1 call AND the rung-2 302 hop.
    trace = [(a.rung_number, a.status_code, a.error_code) for a in exc.value.attempts]
    assert trace == [
        (1, 403, None),
        (2, 302, None),
    ]


async def test_rung2_header_redaction_drops_cookies():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [
            _Script(
                200,
                headers={
                    "content-type": "text/html; charset=utf-8",
                    "set-cookie": "session=secret",
                    "server": "cloudflare",
                },
            )
        ],
    )
    async with fetcher:
        result = await fetcher.fetch(_request())
    assert "set-cookie" not in result.redacted_headers
    assert result.redacted_headers.get("server") == "cloudflare"
    assert result.content_type == "text/html"
    assert result.charset == "utf-8"


# --- live byte caps on rung 2 (D3) ------------------------------------------


async def test_rung2_wire_cap_aborts_via_live_counter():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    handle = _FakeCurlHandle(wire_sizes=[600, 1500, 3000])
    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [_Script(200, chunks=[b"a" * 500, b"b" * 500, b"c" * 500], handle=handle)],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request(max_wire_bytes=1000))
    assert exc.value.error_code == "response_too_large"
    last = exc.value.attempts[-1]
    assert (last.rung_number, last.error_code) == (2, "response_too_large")
    assert last.wire_bytes == 1500  # the live SIZE_DOWNLOAD_T sample at abort


async def test_rung2_decoded_cap_aborts_compression_bomb():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    # Wire stays tiny (compressed); decoded accumulates past the cap.
    handle = _FakeCurlHandle(wire_sizes=[10, 20, 30, 40])
    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [
            _Script(
                200,
                chunks=[b"A" * 4000, b"B" * 4000, b"C" * 4000],
                handle=handle,
            )
        ],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(
                _request(max_wire_bytes=1_000_000, max_decoded_bytes=5000)
            )
    assert exc.value.error_code == "response_too_large"
    assert "decoded" in str(exc.value)


async def test_rung2_content_length_precheck_rejects_before_streaming():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    handle = _FakeCurlHandle(content_length=8 * 1024 * 1024)
    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [_Script(200, chunks=[b"a" * 100], handle=handle)],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request(max_wire_bytes=1000))
    assert exc.value.error_code == "response_too_large"
    assert "content-length" in str(exc.value)
    # Aborted at the FIRST chunk having accepted zero decoded bytes.
    assert exc.value.attempts[-1].decoded_bytes in (None, 0)


async def test_rung2_genuine_curl_error_never_maps_to_too_large():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [
            _Script(
                error=RequestException(
                    "Failed to perform, curl: (7) Could not connect", code=7
                )
            )
        ],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request(max_wire_bytes=10, max_decoded_bytes=10))
    # A real connect error stays a generic connection error even with tiny
    # caps configured — error 23 + the intentional-abort flag is the ONLY
    # path to response_too_large.
    assert exc.value.error_code == "connection_failed"
    assert exc.value.retryable is True
    # The trace carries BOTH rungs' failures.
    assert [(a.rung_number, a.error_code) for a in exc.value.attempts] == [
        (1, None),
        (2, "connection_failed"),
    ]


async def test_rung2_timeout_maps_to_timeout_token():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [_Script(error=Timeout("Failed to perform, curl: (28) timed out", code=28))],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request())
    assert exc.value.error_code == "timeout"
    assert exc.value.retryable is True
    trace = [(a.rung_number, a.error_code, a.status_code) for a in exc.value.attempts]
    assert trace == [
        (1, None, 403),
        (2, "timeout", None),
    ]


# --- content-type gate on rung 2 ---------------------------------------------


async def test_rung2_content_type_gate_aborts_at_first_chunk():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    handle = _FakeCurlHandle(content_type="application/pdf")
    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [
            _Script(
                200,
                headers={"content-type": "application/pdf"},
                chunks=[b'%PDF'],
                handle=handle,
            )
        ],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request())
    assert exc.value.error_code == "unsupported_content_type"


async def test_rung2_content_type_post_check_on_empty_body():
    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    # Empty body -> the callback never runs -> the post-transfer gate fires.
    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler,
        resolver,
        [_Script(200, headers={"content-type": "application/pdf"}, chunks=[])],
    )
    async with fetcher:
        with pytest.raises(FetchError) as exc:
            await fetcher.fetch(_request())
    assert exc.value.error_code == "unsupported_content_type"
    assert [(a.rung_number, a.error_code) for a in exc.value.attempts] == [
        (1, None),
        (2, "unsupported_content_type"),
    ]


# --- UA-mode knob (D2 reversibility) -----------------------------------------


async def test_site_bot_ua_mode_sends_crawler_ua_without_impersonation(monkeypatch):
    monkeypatch.setattr(
        fetcher_module, "SITE_HEALTH_CURL_UA_MODE", sh_config.CURL_UA_MODE_SITE_BOT
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, _, curl_calls = _escalation_fetcher(handler, resolver, [_Script(200)])
    async with fetcher:
        await fetcher.fetch(_request())
    assert "impersonate" not in curl_calls[0]
    assert curl_calls[0]["headers"]["user-agent"] == sh_config.SITE_HEALTH_USER_AGENT


# --- trace completeness -------------------------------------------------------


async def test_trace_covers_rung1_redirect_hops_before_escalation():
    # Rung 1: /old -> 301 -> /blocked -> 403 -> escalate -> rung 2 succeeds.
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/old":
            return httpx.Response(
                301, headers={"location": "https://example.com/blocked"}
            )
        return _rung1_response(403, body=b"blocked")

    resolver = _FakeResolver()
    fetcher, _, _ = _escalation_fetcher(
        handler, resolver, [_Script(200, chunks=[b"<html>real</html>"])]
    )
    async with fetcher:
        result = await fetcher.fetch(
            _request(url="https://example.com/old"),
            root_registrable_domain="example.com",
            enforce_scope=True,
        )
    assert result.status_code == 200
    # Rung 2 retries the SAME FetchRequest from the ORIGINAL URL and follows
    # redirects itself; the returned result's chain is rung 2's own (the
    # rung-1 hops live on in the trace).
    assert [
        (a.request_ordinal, a.rung_number, a.status_code, a.url)
        for a in result.attempts
    ] == [
        (0, 1, 301, "https://example.com/old"),
        (1, 1, 403, "https://example.com/blocked"),
        (2, 2, 200, "https://example.com/old"),
    ]
    assert result.final_url == "https://example.com/old"
    assert result.redirect_chain == ()


async def test_fetch_error_attempts_default_empty_for_direct_construction():
    err = FetchError("x", error_code="timeout")
    assert err.attempts == ()
