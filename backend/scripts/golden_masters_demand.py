"""Live goldens for shared identity readers; projection goldens freeze at cutover."""

import json
from dataclasses import asdict
from typing import Any
from uuid import UUID

from app.connectors.web_evidence.url_policy import UrlPolicyError, canonicalize
from app.domain.demand.page_equivalence import PageCandidate, _resolve_from_artifacts
from app.domain.demand.query_classification import normalize_query
from app.models.site_health.acquisition import SiteFetchArtifact


def canonical_pages() -> list[dict[str, Any]]:
    cases = []
    for url, origin in [
        ("https://EXAMPLE.com:443/a%2fb/%7e?utm_source=x&b=2&a=1#part", None),
        ("https://example.com/Kelvin/ſ?blank=&q=two words", None),
        ("https://münchen.example/straße", None),
        ("https://faß.de/", None),
        ("https://example.com/a/../b", None),
        ("https://user:pass@example.com/", None),
        ("https://example.com:9000/", None),
        ("/pricing?utm_medium=chatgpt", "https://example.com"),
        ("../pricing", "https://example.com/docs/"),
        ("https://example.com/?\ue000=1&😀=2", None),
    ]:
        try:
            output = canonicalize(url, base_url=origin)
        except UrlPolicyError:
            output = None
        cases.append({"input": {"url": url, "origin": origin}, "output": output})
    return cases


def query_normalizations() -> list[dict[str, Any]]:
    return [
        {"input": query, "output": normalize_query(query)}
        for query in [
            "Acme tools",
            "  ＡＣＭＥ  ",
            "Straße Σίσυφος",
            "İSTANBUL",
            "!!!",
            "a_b x²",
            "a\u001cb",
            "e\u0301",
        ]
    ]


def page_equivalence() -> list[dict[str, Any]]:
    candidates = [
        PageCandidate(UUID(int=1), "https://example.com/page", sitemap_member=True),
        PageCandidate(
            UUID(int=2), "https://www.example.com/page/", preferred_origin=True
        ),
    ]
    requested = "http://example.com/page/"
    cases = []
    for proofs in [
        [],
        [(requested, candidates[0].normalized_url, "")],
        [(requested, requested, candidates[1].normalized_url)],
        [(requested, candidates[0].normalized_url, candidates[1].normalized_url)],
    ]:
        artifacts = [
            SiteFetchArtifact(
                requested_url=start,
                final_url=end,
                normalized_facts={"canonical_url": canonical},
            )
            for start, end, canonical in proofs
        ]
        result = _resolve_from_artifacts(
            requested, tuple(candidates), [(artifact, None) for artifact in artifacts]
        )
        payload = {
            "requested": requested,
            "candidates": [asdict(c) for c in candidates],
            "artifacts": [
                {
                    "requested_url": a.requested_url,
                    "final_url": a.final_url,
                    "normalized_facts": a.normalized_facts,
                    "site_url_id": None,
                }
                for a in artifacts
            ],
        }
        cases.append(
            json.loads(
                json.dumps({"input": payload, "output": asdict(result)}, default=str)
            )
        )
    return cases
