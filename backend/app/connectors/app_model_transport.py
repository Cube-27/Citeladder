"""Authenticated, DNS-pinned JSON POST boundary for customer app models."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit

from curl_cffi import CurlOpt
from curl_cffi.requests import AsyncSession
from curl_cffi.requests.exceptions import RequestException, Timeout

from app.connectors.web_evidence.contracts import DnsResolver, ResolvedTarget
from app.connectors.web_evidence.resolver import SystemDnsResolver
from app.connectors.web_evidence.targets import validate_resolved_target
from app.connectors.web_evidence.url_policy import pick_connect_ip
from app.core.config.app_models import (
    APP_MODEL_ALLOWED_PORTS,
    APP_MODEL_MAX_REQUEST_BYTES,
    APP_MODEL_MAX_RESPONSE_BYTES,
    APP_MODEL_TIMEOUT_SECONDS,
)


class AppModelTransportError(RuntimeError):
    """Safe classified failure; never includes URLs, keys, or provider bodies."""

    def __init__(
        self, code: str, message: str, *, status_code: int | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class AppModelJsonResponse:
    status_code: int
    body: dict[str, Any]
    latency_ms: int


class AppModelJsonTransport(Protocol):
    async def post(
        self,
        *,
        target: ResolvedTarget,
        api_key: str,
        payload: dict[str, Any],
        timeout_seconds: float,
        max_response_bytes: int,
    ) -> AppModelJsonResponse: ...


def _parse_app_model_url(value: str):
    try:
        parts = urlsplit(value.strip())
        port = 443 if parts.port is None else parts.port
    except ValueError as exc:
        raise ValueError("App model URL is invalid") from exc
    return parts, port


def _validate_app_model_authority(parts: Any, port: int) -> None:
    if parts.scheme.casefold() != "https":
        raise ValueError("App model URL must use HTTPS")
    if not parts.hostname or parts.username is not None or parts.password is not None:
        raise ValueError("App model URL must have a safe host")
    if parts.query or parts.fragment:
        raise ValueError("App model URL cannot contain a query or fragment")
    if port not in APP_MODEL_ALLOWED_PORTS:
        raise ValueError("App model URL port is not allowed")


def _normalize_app_model_host(hostname: str) -> str:
    try:
        host = hostname.encode("idna").decode("ascii").casefold().rstrip(".")
    except UnicodeError as exc:
        raise ValueError("App model URL host is invalid") from exc
    if not host or any(char.isspace() for char in host):
        raise ValueError("App model URL host is invalid")
    return host


def _normalize_app_model_path(path: str) -> str:
    normalized = "/" + "/".join(segment for segment in path.split("/") if segment)
    return "/v1" if normalized == "/" else normalized.rstrip("/")


def normalize_app_model_url(value: str) -> str:
    """Normalize a strict HTTPS API base with no secret-bearing URL parts."""
    parts, port = _parse_app_model_url(value)
    _validate_app_model_authority(parts, port)
    host = _normalize_app_model_host(parts.hostname)
    path = _normalize_app_model_path(parts.path)
    return urlunsplit(("https", host, path, "", ""))


def chat_completions_url(api_base_url: str) -> str:
    base = normalize_app_model_url(api_base_url)
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


async def resolve_app_model_target(
    url: str, *, resolver: DnsResolver | None = None
) -> ResolvedTarget:
    normalized = normalize_app_model_url(url)
    parts = urlsplit(normalized)
    host = parts.hostname or ""
    active_resolver = resolver or SystemDnsResolver()
    try:
        addresses = await active_resolver.resolve(host, 443)
    except Exception as exc:
        raise AppModelTransportError(
            "dns_resolution_failed", "Model host resolution failed"
        ) from exc
    try:
        connect_ip, safe_ips = pick_connect_ip(addresses)
    except Exception as exc:
        raise AppModelTransportError(
            "ssrf_blocked", "Model destination is not allowed"
        ) from exc
    return ResolvedTarget(
        url=normalized,
        scheme="https",
        host=host,
        port=443,
        connect_ip=connect_ip,
        resolved_ips=safe_ips,
    )


def _resolve_entry(target: ResolvedTarget) -> str:
    address = (
        f"[{target.connect_ip}]" if ":" in target.connect_ip else target.connect_ip
    )
    return f"{target.host}:{target.port}:{address}"


class CurlAppModelJsonTransport:
    """One bounded JSON POST pinned to the already-validated address."""

    async def post(
        self,
        *,
        target: ResolvedTarget,
        api_key: str,
        payload: dict[str, Any],
        timeout_seconds: float = APP_MODEL_TIMEOUT_SECONDS,
        max_response_bytes: int = APP_MODEL_MAX_RESPONSE_BYTES,
    ) -> AppModelJsonResponse:
        validate_resolved_target(target)
        encoded = json.dumps(payload, separators=(",", ":")).encode()
        if len(encoded) > APP_MODEL_MAX_REQUEST_BYTES:
            raise AppModelTransportError(
                "request_too_large", "Model request exceeded its limit"
            )
        started = time.monotonic()
        try:
            async with AsyncSession(
                trust_env=False,
                verify=True,
                allow_redirects=False,
                timeout=timeout_seconds,
                headers={
                    "authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                    "accept": "application/json",
                },
                curl_options={
                    CurlOpt.RESOLVE: [_resolve_entry(target)],
                    CurlOpt.MAXFILESIZE_LARGE: max_response_bytes,
                },
            ) as session:
                response = await session.post(
                    target.url,
                    data=encoded,
                    allow_redirects=False,
                    timeout=timeout_seconds,
                )
                body = bytes(response.content)
        except Timeout as exc:
            raise AppModelTransportError("timeout", "Model request timed out") from exc
        except RequestException as exc:
            raise AppModelTransportError(
                "connection", "Model connection failed"
            ) from exc
        if response.primary_ip != target.connect_ip:
            raise AppModelTransportError(
                "address_mismatch", "Model connection was not pinned"
            )
        if 300 <= response.status_code < 400:
            raise AppModelTransportError(
                "redirect_refused",
                "Model redirect was refused",
                status_code=response.status_code,
            )
        if len(body) > max_response_bytes:
            raise AppModelTransportError(
                "response_too_large", "Model response exceeded its limit"
            )
        if not 200 <= response.status_code < 300:
            raise AppModelTransportError(
                "provider_error",
                f"Model provider returned HTTP {response.status_code}",
                status_code=response.status_code,
            )
        try:
            decoded = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AppModelTransportError(
                "invalid_json", "Model provider returned invalid JSON"
            ) from exc
        if not isinstance(decoded, dict):
            raise AppModelTransportError(
                "invalid_json", "Model provider returned invalid JSON"
            )
        return AppModelJsonResponse(
            status_code=response.status_code,
            body=decoded,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
