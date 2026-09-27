"""Live identities compared against Site Health and retained demand readers."""

from typing import Any

from app.connectors.web_evidence.url_policy import UrlPolicyError, canonicalize
from app.domain.demand.query_classification import normalize_query


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
