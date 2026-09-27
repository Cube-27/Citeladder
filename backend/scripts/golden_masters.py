"""Golden-master fixtures the TypeScript API service replays.

Each builder runs the real Python implementation over a fixed input set and
returns ``[{"input": ..., "output": ...}]``. The TS runner
(``frontend/services/api/test/golden.test.ts``) feeds every input to its port
and requires byte-identical JSON output, key order included. Inputs must be
deterministic: a builder that depends on the clock or randomness makes the
``--check`` staleness gate fail on every run.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from joserfc import jwt
from joserfc.jwk import OctKey

from app.core.config import secret_is_weak, settings
from app.core.config.errors import (
    CODE_HTTP_ERROR,
    STATUS_DEFAULT_CODE,
    is_retryable_status,
)
from app.core.errors import error_envelope
from app.core.security import TokenDecodeError, decode_access_token
from app.core.telemetry import sanitize_correlation_id
from scripts import golden_masters_analysis as analysis

# A fixture-only signing key; it signs nothing outside these fixtures.
GOLDEN_SESSION_KEY = "golden-session-key-fixture-only-00000"  # pragma: allowlist secret
_OTHER_KEY = "golden-foreign-key-that-must-be-rejected"  # pragma: allowlist secret
_SUBJECT = "6f1c0d2e-9a4b-4c1d-8e2f-3a5b7c9d1e0f"
_YEAR_2000 = 946_684_800
_YEAR_2096 = 4_000_000_000
_YEAR_2100 = 4_102_444_800


def correlation_ids() -> list[dict[str, Any]]:
    inputs = [
        "",
        "   ",
        "abc-DEF_123.xyz",
        "  padded-id  ",
        "0123456789abcdef",
        "a" * 128,
        "a" * 129,
        "bad id",
        "crlf\r\ninjected",
        "semi;colon",
        "unicode-é-ok",
        "\x1cfile-separator-stripped",
        "﻿bom-kept",
        " nbsp-stripped ",
        "٣٤٥-arabic-digits",
    ]
    return [
        {"input": value, "output": sanitize_correlation_id(value)} for value in inputs
    ]


def error_envelopes() -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = [
        {"status": 404, "message": "Workspace not found"},
        {"status": 401, "message": "Invalid token"},
        {"status": 408, "message": "Request Timeout"},
        {"status": 418, "message": "I'm a Teapot"},
        {"status": 429, "message": "Too many requests"},
        {"status": 500, "message": "An unexpected error occurred"},
        {"status": 503, "message": "Service Unavailable"},
        {"status": 599, "message": "Unknown upstream failure"},
        {
            "status": 409,
            "message": "The selection changed since you loaded it.",
            "details": {"current_selection_version": 7},
            "detail": {
                "code": "conflict",
                "message": "The selection changed since you loaded it.",
                "current_selection_version": 7,
            },
        },
    ]
    cases = []
    for case in inputs:
        status = case["status"]
        output = error_envelope(
            code=STATUS_DEFAULT_CODE.get(status, CODE_HTTP_ERROR),
            message=case["message"],
            request_id="0123456789abcdef",
            retryable=is_retryable_status(status),
            details=case.get("details"),
            detail=case.get("detail"),
        )
        cases.append({"input": case, "output": output})
    return cases


def _b64(value: dict[str, Any]) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _signed(
    claims: dict[str, Any], *, key: str = GOLDEN_SESSION_KEY, alg: str = "HS256"
) -> str:
    return jwt.encode({"alg": alg}, claims, OctKey.import_key(key), algorithms=[alg])


def _session_tokens() -> dict[str, str]:
    valid = {"sub": _SUBJECT, "exp": _YEAR_2100, "ver": 3}
    signed_valid = _signed(valid)
    header, payload, signature = signed_valid.split(".")
    flipped = ("A" if signature[0] != "A" else "B") + signature[1:]
    return {
        "valid": signed_valid,
        "valid_without_exp": _signed({"sub": _SUBJECT, "ver": 0}),
        "expired": _signed({**valid, "exp": _YEAR_2000}),
        "not_yet_valid": _signed({**valid, "nbf": _YEAR_2096}),
        "issued_in_future": _signed({**valid, "iat": _YEAR_2096}),
        "string_exp": _signed({**valid, "exp": str(_YEAR_2100)}),
        "foreign_key": _signed(valid, key=_OTHER_KEY),
        "other_algorithm": _signed(valid, alg="HS512"),
        "tampered_signature": f"{header}.{payload}.{flipped}",
        "tampered_payload": f"{header}.{_b64({**valid, 'ver': 4})}.{signature}",
        "unsigned": f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{payload}.",
        "garbage": "not-a-token",
    }


@contextmanager
def _session_key(value: str) -> Iterator[None]:
    previous = settings.jwt_secret_key
    settings.jwt_secret_key = value
    try:
        yield
    finally:
        settings.jwt_secret_key = previous


def session_tokens() -> list[dict[str, Any]]:
    cases = []
    with _session_key(GOLDEN_SESSION_KEY):
        for label, token in _session_tokens().items():
            try:
                output: dict[str, Any] = {"claims": decode_access_token(token)}
            except TokenDecodeError:
                output = {"rejected": True}
            # Stored as dot-separated segments: a whole token literal reads
            # as a leaked credential to secret scanners, which it is not.
            case_input = {
                "label": label,
                "key": GOLDEN_SESSION_KEY,
                "token_segments": token.split("."),
            }
            cases.append({"input": case_input, "output": output})
    return cases


def secret_strength() -> list[dict[str, Any]]:
    inputs = [
        "",
        "short",
        "replace-with-32-byte-minimum-secret",
        "a" * 40,
        "abcdefghijk" * 4,
        "abcdefghijkl" * 3,
        "  PassWord  ",
        "ﬁ" * 11 + "abcdefghijklmnopqrstuvwxyz",
        "correct-horse-battery-staple-4-0-9-x",
    ]
    return [{"input": value, "output": secret_is_weak(value)} for value in inputs]


GOLDEN_MASTERS: dict[str, Callable[[], list[dict[str, Any]]]] = {
    "ai_referral_sources": analysis.ai_referral_sources,
    "brand_identity_keys": analysis.brand_identity_keys,
    "citation_classifications": analysis.citation_classifications,
    "correlation_ids": correlation_ids,
    "domain_matches": analysis.domain_match_pairs,
    "error_envelopes": error_envelopes,
    "grounding_redirects": analysis.grounding_redirects,
    "mention_positions": analysis.mention_positions,
    "metric_series_points": analysis.metric_series,
    "normalized_domains": analysis.normalized_domains,
    "python_int_or_zero": analysis.python_int_or_zero,
    "python_str_or_empty": analysis.python_str_or_empty,
    "python_string_reprs": analysis.python_string_reprs,
    "referral_classifications": analysis.referral_classifications,
    "retrieval_provenance": analysis.retrieval_provenance,
    "secret_strength": secret_strength,
    "session_tokens": session_tokens,
}
