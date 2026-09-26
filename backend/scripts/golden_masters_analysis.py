"""Golden masters for the analysis leaves the TypeScript read routes port.

Every builder runs the real Python implementation that stays in service (the
Agent, MCP and the audit pipeline still call it), so ``--check`` keeps the
two stacks from drifting for as long as both run it (TypeScript migration
rule 2). Inputs are fixed; see ``golden_masters`` for the output contract.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.analysis.normalization import domain_matches, normalize_domain
from app.analysis.position import brand_position, competitor_position
from app.analysis.scoring import ScoringConfig, classify_citation
from app.connectors.answer_engines.grounding_redirect import is_grounding_redirect
from app.domain.analysis.brand_identity import identity_key
from app.domain.analytics.schemas import metric_series_points
from app.domain.audits.schemas import execution_frozen_provenance

_REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123"

_URL_SHAPES = [
    "",
    "   ",
    "example.com",
    "WWW.Example.COM",
    "https://www.example.com/path?q=1#frag",
    "http://user:pass@Shop.Example.co.uk:8080/x",
    "https://[2001:db8::1]:443/v",
    "//cdn.example.net/asset.js",
    "https://example.com.",
    "https://münchen.example/straße",
    "ftp://files.example.org",
    "mailto:someone@example.com",
    "https://example.com:notaport/",
    "https://[broken/",
    "example.com/path/only",
    "  https://padded.example.com  ",
    "https://www.www.example.com",
    "HTTPS://EXAMPLE.COM/UPPER",
    "https://example.com\\evil.test/",
    "https://a.b.example.com?x=y",
]


def _raising(function: Any, *arguments: Any) -> Any:
    """The result, or the exception class name when Python raises."""
    try:
        return function(*arguments)
    except ValueError as exc:
        return {"raises": type(exc).__name__}


def normalized_domains() -> list[dict[str, Any]]:
    inputs: list[Any] = [*_URL_SHAPES, None, 42]
    return [
        {"input": value, "output": _raising(normalize_domain, value)}
        for value in inputs
    ]


def domain_match_pairs() -> list[dict[str, Any]]:
    pairs = [
        ("shop.bestandless.com.au", "bestandless.com.au"),
        ("bestandless.com.au", "shop.bestandless.com.au"),
        ("notbestandless.com.au", "bestandless.com.au"),
        ("www.example.com", "https://example.com/"),
        ("", "example.com"),
        ("example.com", ""),
        ("EXAMPLE.com", "example.COM"),
        ("a.example.com.", "example.com"),
        ("[broken", "example.com"),
    ]
    return [
        {
            "input": [candidate, target],
            "output": _raising(domain_matches, candidate, target),
        }
        for candidate, target in pairs
    ]


def grounding_redirects() -> list[dict[str, Any]]:
    inputs: list[Any] = [
        _REDIRECT,
        "https://VERTEXAISEARCH.cloud.google.com./x",
        "https://eu.vertexaisearch.cloud.google.com/x",
        "https://notvertexaisearch.cloud.google.com/x",
        "https://pub.example/a?ref=grounding-api-redirect",
        "https://grounding-api-redirect/token",
        "/grounding-api-redirect/token",
        "grounding-api-redirect",
        "https://pub.example/grounding-api-redirect/story",
        "",
        None,
        "https://[broken/grounding-api-redirect",
    ]
    return [
        {"input": value, "output": is_grounding_redirect(value)} for value in inputs
    ]


_SCORING_CONFIG: dict[str, Any] = {
    "brand_name": "Best & Less",
    "brand_aliases": ["bestandless"],
    "owned_domains": ["bestandless.com.au", "", "https://www.shop.example/"],
    "unintended_domains": ["old-brand.example"],
    "competitors": [
        {"name": "Kmart", "aliases": ["K-Mart"], "domains": ["kmart.com.au"]},
        {"name": "Target", "domains": ["target.com.au", "target.com.au"]},
        {"name": "", "domains": ["nameless.example"]},
        {"name": "Big W", "aliases": None, "domains": None},
    ],
}


def citation_classifications() -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = [
        {"url": "https://www.bestandless.com.au/kids", "title": "Kids"},
        {"url": "https://shop.example/deals", "domain": "ignored.example"},
        {"url": "https://m.kmart.com.au/x", "ordinal": 3},
        {"url": _REDIRECT, "domain": "target.com.au", "title": "Target"},
        {"url": _REDIRECT, "title": "old-brand.example"},
        {"resolved_url": "https://kmart.com.au/r", "url": "https://target.com.au/"},
        {"redirect_url": "https://target.com.au/p", "url": "https://kmart.com.au/"},
        {"url": "", "domain": "", "title": ""},
        {"url": "not a url", "domain": "Nameless.Example"},
        {"url": "https://[broken/", "domain": "bestandless.com.au"},
        {"domain": "WWW.Target.com.au"},
        {"url": "https://unrelated.example/", "is_owned": True, "extra": [1, 2]},
        {"url": "https://[broken/", "domain": "https://[also-broken/"},
    ]
    config = ScoringConfig.from_project(_SCORING_CONFIG)
    return [
        {
            "input": {"citation": citation, "config": _SCORING_CONFIG},
            "output": _raising(classify_citation, citation, config),
        }
        for citation in citations
    ]


def mention_positions() -> list[dict[str, Any]]:
    scores: list[dict[str, Any]] = [
        {"brand_first_offset": 10, "competitor_first_offsets": {"A": 5, "B": 20}},
        {"brand_first_offset": None, "competitor_first_offsets": {"A": 5, "B": 1}},
        {"brand_first_offset": 0, "competitor_first_offsets": {"A": 0, "B": None}},
        {"brand_first_offset": 7, "competitor_first_offsets": None},
        {"competitor_first_offsets": {"A": 3, "B": 3, "C": 2}},
        {"brand_first_offset": 4},
    ]
    cases = []
    for score in scores:
        offsets = dict(score.get("competitor_first_offsets") or {})
        brand = brand_position(score.get("brand_first_offset"), offsets)
        cases.append(
            {
                "input": score,
                "output": {
                    "brand": brand,
                    "competitors": {
                        name: competitor_position(score, name)
                        for name in ("A", "B", "C", "Z")
                    },
                },
            }
        )
    return cases


def retrieval_provenance() -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = [
        {"request": {"retrieval_enabled": True}, "route": {"retrieval_enabled": False}},
        {"request": {"retrieval_enabled": None}, "route": {"retrieval_enabled": 0}},
        {"request": {}, "route": None, "audit": {"measurement_policy": {}}},
        {
            "request": None,
            "route": None,
            "audit": {"measurement_policy": {"retrieval_enabled": "no"}},
        },
        {"request": ["retrieval_enabled"], "route": {"retrieval_enabled": []}},
        {"request": None, "route": None, "audit": {"measurement_policy": [True]}},
        {"request": None, "route": None, "audit": None},
        {"request": {"retrieval_enabled": 0.0}, "route": None},
        {"request": {"retrieval_enabled": {}}, "route": None},
    ]
    return [
        {
            "input": case,
            "output": execution_frozen_provenance(
                request_snapshot=case.get("request"),
                route_snapshot=case.get("route"),
                audit_configuration=case.get("audit"),
            ),
        }
        for case in inputs
    ]


def metric_series() -> list[dict[str, Any]]:
    inputs: list[Any] = [
        None,
        {"date": "2026-01-01"},
        [
            {"date": "2026-01-01", "value": 1.5},
            {"date": None, "value": None},
            {"value": 3},
            "not a point",
            {"date": 20260102, "value": 0},
            {"date": "", "value": 2.25},
        ],
    ]
    return [
        {
            "input": raw,
            "output": [
                point.model_dump(mode="json") for point in metric_series_points(raw)
            ],
        }
        for raw in inputs
    ]


def brand_identity_keys() -> list[dict[str, Any]]:
    inputs = [
        "Wise",
        "  Transfer   Wise ",
        "STRASSE",
        "Straße",
        "ΣΊΣΥΦΟΣ",
        "ﬁnance",
        "tab\tand\nnewline",
        "nbsp space",
        "zero​width",
        "file\x1cseparator",
        "İstanbul",
        "",
    ]
    return [{"input": value, "output": identity_key(value)} for value in inputs]


def python_string_reprs() -> list[dict[str, Any]]:
    inputs = [
        "chatgpt",
        "it's",
        'say "hi"',
        "both ' and \"",
        "tab\tnew\nline\rcr",
        "back\\slash",
        "bell\x07del\x7f",
        "nbsp ",
        "zero​width",
        "é ü 中文",
        "emoji 😀",
        "\U000e0001tag",
        "line sep",
        "",
    ]
    return [{"input": value, "output": repr(value)} for value in inputs]


def python_uuids() -> list[dict[str, Any]]:
    inputs = [
        "6f1c0d2e-9a4b-4c1d-8e2f-3a5b7c9d1e0f",
        "6F1C0D2E9A4B4C1D8E2F3A5B7C9D1E0F",
        "{6f1c0d2e-9a4b-4c1d-8e2f-3a5b7c9d1e0f}",
        "{{6f1c0d2e9a4b4c1d8e2f3a5b7c9d1e0f}}",
        "urn:uuid:6f1c0d2e-9a4b-4c1d-8e2f-3a5b7c9d1e0f",
        "uuid:6f1c0d2e-9a4b-4c1d-8e2f-3a5b7c9d1e0f",
        "6f1c0d2e-9a4b-4c1d-8e2f-3a5b7c9d1e0",
        "6f1c0d2e9a4b4c1d8e2f3a5b7c9d1e0g",
        "+f1c0d2e9a4b4c1d8e2f3a5b7c9d1e0f",
        "-f1c0d2e9a4b4c1d8e2f3a5b7c9d1e0f",
        " f1c0d2e9a4b4c1d8e2f3a5b7c9d1e0f",
        "6f1c_d2e9a4b4c1d8e2f3a5b7c9d1e0f",
        "6f1c__2e9a4b4c1d8e2f3a5b7c9d1e0f",
        "0x1c0d2e9a4b4c1d8e2f3a5b7c9d1e0f",
        "",
        "not-a-uuid",
    ]
    cases = []
    for value in inputs:
        try:
            output: str | None = str(uuid.UUID(value))
        except ValueError:
            output = None
        cases.append({"input": value, "output": output})
    return cases
