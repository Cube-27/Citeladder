"""Unit tests for the pure discovery-link parser (handoff finding 5).

``extract_discovery_links`` is a pure, offline function: given a fetched HTML
body it returns the page title plus in-scope canonical anchor links. These
tests focus on the charset-handling hardening — a bogus declared charset must
never raise ``LookupError`` at parser construction; it falls back to lxml
auto-detection instead.
"""

from __future__ import annotations

import pytest

from app.analysis.site_health import dom
from app.analysis.site_health.dom import _safe_parser_encoding
from app.analysis.site_health.parser import extract_page_facts
from app.connectors.web_evidence.contracts import FetchResult
from app.core.config.site_health_runtime import site_health_settings
from app.domain.site_health.discovery import (
    build_frontier_candidates,
    extract_discovery_links,
)
from app.workers.site_health.phases.discover import _parse_discover_result

_PAGE = (
    b"<html><head><title>Home</title></head>"
    b'<body><a href="https://acme.example.com/about">About</a></body></html>'
)


def test_safe_parser_encoding_valid():
    assert _safe_parser_encoding("UTF-8") == "utf-8"
    assert _safe_parser_encoding("ISO-8859-1") == "iso-8859-1"


def test_safe_parser_encoding_bogus_returns_none():
    assert _safe_parser_encoding("totally-not-a-charset") is None
    assert _safe_parser_encoding("") is None
    assert _safe_parser_encoding("   ") is None


def test_extract_discovery_links_bogus_charset_never_crashes():
    title, links = extract_discovery_links(
        _PAGE,
        base_url="https://acme.example.com/",
        root_registrable_domain="acme.example.com",
        charset="totally-not-a-charset",
    )
    assert title == "Home"
    assert any(link.url == "https://acme.example.com/about" for link in links)


def test_extract_discovery_links_valid_charset_honored():
    body = (
        "<html><head><title>Caf\u00e9</title></head>"
        '<body><a href="https://acme.example.com/x">X</a></body></html>'
    ).encode("latin-1")
    title, _links = extract_discovery_links(
        body,
        base_url="https://acme.example.com/",
        root_registrable_domain="acme.example.com",
        charset="ISO-8859-1",
    )
    assert title == "Caf\u00e9"


def test_encoded_tracking_query_delimiter_is_repaired_at_extraction():
    body = b'<a href="/men%3Fintpromo%3Dhomepage%26utm_source%3Dhero">Men</a>'
    _title, links = extract_discovery_links(
        body,
        base_url="https://shop.example.com/",
        root_registrable_domain="example.com",
    )
    assert [link.url for link in links] == ["https://shop.example.com/men"]
    assert links[0].rewrite_reason == "encoded_tracking_query_delimiter"
    assert links[0].rewrite_version == "sh-link-rewrite-1"


def test_reserved_path_escapes_survive_without_positive_query_evidence():
    encoded = ("%3Ffaq", "%26terms", "%2Fpart", "%25value", "%3Fsku%3D42")
    body = "".join(
        f'<a href="/items/{value}">{value}</a>' for value in encoded
    ).encode()
    _title, links = extract_discovery_links(
        body,
        base_url="https://shop.example.com/",
        root_registrable_domain="example.com",
    )
    assert [link.url for link in links] == [
        f"https://shop.example.com/items/{value}" for value in encoded
    ]
    assert all(not link.rewrite_reason and not link.rewrite_version for link in links)


def _result(body: bytes) -> FetchResult:
    return FetchResult(
        requested_url="https://example.com/",
        final_url="https://example.com/",
        status_code=200,
        redacted_headers={"X-Robots-Tag": "noindex"},
        content_type="text/html",
        http_version="HTTP/2",
        body=body,
        wire_bytes=len(body),
        decoded_bytes=len(body),
        ttfb_ms=12,
        latency_ms=24,
        charset="ISO-8859-1",
    )


@pytest.mark.parametrize("body", [b"", b"\x00", b"<title>Caf\xe9</title><p>Hello</p>"])
def test_shared_discovery_document_preserves_facts(body, monkeypatch):
    result = _result(body)
    expected = extract_page_facts(
        body,
        final_url=result.final_url,
        content_type=result.content_type,
        charset=result.charset,
        status_code=result.status_code,
        redacted_headers=result.redacted_headers,
        http_version=result.http_version,
        ttfb_ms=result.ttfb_ms,
        latency_ms=result.latency_ms,
        wire_bytes=result.wire_bytes,
        decoded_bytes=result.decoded_bytes,
    )
    parse = dom.lxml_html.document_fromstring
    calls = []

    def record_parse(*args, **kwargs):
        calls.append(args[0])
        return parse(*args, **kwargs)

    monkeypatch.setattr(dom.lxml_html, "document_fromstring", record_parse)
    outcome = _parse_discover_result(
        result,
        root_registrable_domain="example.com",
        include_globs=None,
        exclude_globs=None,
    )
    assert outcome.facts == expected
    assert len(calls) == int(bool(body))


def test_discovery_links_keep_their_own_cap_and_pre_pruning_dom(monkeypatch):
    monkeypatch.setattr(site_health_settings, "max_links_per_page", 3)
    body = (
        b'<a href="https://external.org/a">external</a>'
        b'<a href="https://external.org/b">external</a>'
        b'<a href="https://external.org/c">external</a>'
        b'<a hidden href="/hidden">hidden</a>'
        b'<template><a href="/template">template</a></template>'
        b'<a href="/paper.pdf">paper</a><a href="/overflow">overflow</a>'
    )
    outcome = _parse_discover_result(
        _result(body),
        root_registrable_domain="example.com",
        include_globs=None,
        exclude_globs=None,
    )
    assert outcome.output is not None
    assert [link.url for link in outcome.output.links] == [
        "https://example.com/hidden",
        "https://example.com/template",
        "https://example.com/paper.pdf",
    ]
    candidates = build_frontier_candidates(outcome.output, parent_position=4, depth=1)
    assert [candidate.analyzable for candidate in candidates] == [True, True, False]
    assert candidates[-1].item_kind == "document"


def test_shared_document_cannot_bypass_fact_byte_limit(monkeypatch):
    prefix = b"<html><body><p>within budget</p>"
    monkeypatch.setattr(site_health_settings, "max_html_bytes", len(prefix))
    outcome = _parse_discover_result(
        _result(prefix + b'<a href="/beyond">outside budget</a></body></html>'),
        root_registrable_domain="example.com",
        include_globs=None,
        exclude_globs=None,
    )
    assert outcome.output is not None and outcome.facts is not None
    assert [link.url for link in outcome.output.links] == ["https://example.com/beyond"]
    assert outcome.facts["extraction"]["truncated"] is True
    assert "outside budget" not in outcome.facts["body"]["text"]
