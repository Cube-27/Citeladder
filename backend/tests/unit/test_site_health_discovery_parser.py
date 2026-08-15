"""Unit tests for the pure discovery-link parser (handoff finding 5).

``extract_discovery_links`` is a pure, offline function: given a fetched HTML
body it returns the page title plus in-scope canonical anchor links. These
tests focus on the charset-handling hardening — a bogus declared charset must
never raise ``LookupError`` at parser construction; it falls back to lxml
auto-detection instead.
"""

from __future__ import annotations

from app.domain.site_health.discovery import (
    _safe_parser_encoding,
    extract_discovery_links,
)

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
