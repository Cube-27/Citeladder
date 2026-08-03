"""Pinned curl-cffi acquisition transport for Site Health.

The transport performs exactly one network request. Redirect orchestration and
URL admission remain owned by ``SecureFetcher`` so every hop is resolved and
validated before curl receives it.
"""

from __future__ import annotations

import time
from collections.abc import Mapping

from curl_cffi import CurlOpt
from curl_cffi.requests import AsyncSession
from curl_cffi.requests.exceptions import RequestException, Timeout

from app.connectors.web_evidence.contracts import (
    FetchError,
    FetchRequest,
    FetchResult,
    ResolvedTarget,
)
from app.core.config.site_health import (
    ERROR_ACQUISITION_UNAVAILABLE,
    ERROR_CONNECTION_FAILED,
    ERROR_RESPONSE_TOO_LARGE,
    ERROR_TIMEOUT,
    ERROR_UNSUPPORTED_CONTENT_TYPE,
    PERSISTED_RESPONSE_HEADERS,
    SITE_HEALTH_USER_AGENT,
)


def _header_items(headers: object) -> list[tuple[str, str]]:
    if not isinstance(headers, Mapping) and not hasattr(headers, "items"):
        return []
    return [(str(key), str(value)) for key, value in headers.items()]


def _header_value(headers: object, name: str) -> str:
    wanted = name.lower()
    for key, value in _header_items(headers):
        if key.lower() == wanted:
            return value
    return ""


def _redacted_headers(headers: object) -> dict[str, str]:
    return {
        key.lower(): value
        for key, value in _header_items(headers)
        if key.lower() in PERSISTED_RESPONSE_HEADERS
    }


def _content_type(headers: object) -> str:
    return _header_value(headers, "content-type").split(";", 1)[0].strip().lower()


def _charset(headers: object) -> str:
    content_type = _header_value(headers, "content-type")
    for part in content_type.split(";")[1:]:
        key, _, value = part.strip().partition("=")
        if key.lower() == "charset":
            return value.strip().strip('"').strip("'").lower()
    return ""


def _curl_resolve_entry(target: ResolvedTarget) -> str:
    address = (
        f"[{target.connect_ip}]" if ":" in target.connect_ip else target.connect_ip
    )
    return f"{target.host}:{target.port}:{address}"


class CurlCffiTransport:
    """One-hop curl request pinned to a previously validated address."""

    def __init__(
        self,
        *,
        impersonation_profile: str,
        user_agent: str = SITE_HEALTH_USER_AGENT,
    ) -> None:
        self._impersonation_profile = impersonation_profile
        self._user_agent = user_agent

    async def fetch(
        self,
        request: FetchRequest,
        target: ResolvedTarget,
        *,
        max_wire_bytes: int,
        max_decoded_bytes: int,
        timeout_seconds: float,
    ) -> FetchResult:
        """Fetch one admitted target with DNS pinning and bounded streaming."""

        started = time.monotonic()
        headers = {"user-agent": self._user_agent, **request.headers}
        options = {
            CurlOpt.RESOLVE: [_curl_resolve_entry(target)],
            CurlOpt.MAXFILESIZE_LARGE: max_wire_bytes,
        }
        try:
            async with AsyncSession(
                trust_env=False,
                verify=True,
                allow_redirects=False,
                timeout=timeout_seconds,
                impersonate=self._impersonation_profile,
                headers=headers,
                curl_options=options,
            ) as session:
                response = await session.request(
                    request.method,
                    target.url,
                    stream=True,
                    allow_redirects=False,
                    timeout=timeout_seconds,
                )
                ttfb_ms = int((time.monotonic() - started) * 1000)
                body = await self._bounded_body(response, max_decoded_bytes)
        except Timeout as exc:
            raise FetchError(
                "curl acquisition timed out",
                error_code=ERROR_TIMEOUT,
                retryable=True,
            ) from exc
        except RequestException as exc:
            raise FetchError(
                "curl acquisition connection failed",
                error_code=ERROR_CONNECTION_FAILED,
                retryable=True,
            ) from exc

        if response.primary_ip != target.connect_ip:
            raise FetchError(
                "curl acquisition did not use the validated address",
                error_code=ERROR_ACQUISITION_UNAVAILABLE,
                retryable=False,
            )
        wire_bytes = int(response.download_size or len(body))
        if wire_bytes > max_wire_bytes:
            raise FetchError(
                "curl response exceeded wire byte cap",
                error_code=ERROR_RESPONSE_TOO_LARGE,
            )
        content_type = _content_type(response.headers)
        if (
            request.allowed_content_types
            and content_type
            and content_type not in request.allowed_content_types
            and 200 <= response.status_code < 300
        ):
            raise FetchError(
                f"unsupported content type: {content_type}",
                error_code=ERROR_UNSUPPORTED_CONTENT_TYPE,
                status_code=response.status_code,
            )
        latency_ms = int((time.monotonic() - started) * 1000)
        return FetchResult(
            requested_url=request.url,
            final_url=target.url,
            status_code=response.status_code,
            redacted_headers=_redacted_headers(response.headers),
            content_type=content_type,
            http_version=str(response.http_version or ""),
            body=body,
            wire_bytes=wire_bytes,
            decoded_bytes=len(body),
            ttfb_ms=ttfb_ms,
            latency_ms=latency_ms,
            charset=_charset(response.headers),
        )

    @staticmethod
    async def _bounded_body(response, max_decoded_bytes: int) -> bytes:
        chunks: list[bytes] = []
        total = 0
        try:
            async for chunk in response.aiter_content():
                total += len(chunk)
                if total > max_decoded_bytes:
                    if response.quit_now is not None:
                        response.quit_now.set()
                    raise FetchError(
                        "curl response exceeded decoded byte cap",
                        error_code=ERROR_RESPONSE_TOO_LARGE,
                    )
                chunks.append(chunk)
        finally:
            await response.aclose()
        return b"".join(chunks)
