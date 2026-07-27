from __future__ import annotations

from app.connectors.web_evidence.contracts import FetchRequest, FetchResult
from app.connectors.web_evidence.favicon import (
    detect_logo_content_type,
    discover_icon_urls,
    fetch_brand_logo,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"logo"


def _result(url: str, *, body: bytes, content_type: str, status: int = 200):
    return FetchResult(
        requested_url=url,
        final_url=url,
        status_code=status,
        redacted_headers={},
        content_type=content_type,
        http_version="1.1",
        body=body,
        wire_bytes=len(body),
        decoded_bytes=len(body),
        ttfb_ms=1,
        latency_ms=1,
    )


class _FakeFetcher:
    def __init__(self, results: dict[str, FetchResult]) -> None:
        self.results = results
        self.calls: list[FetchRequest] = []

    async def fetch(self, request: FetchRequest, **_kwargs) -> FetchResult:
        self.calls.append(request)
        return self.results[request.url]


def test_detect_logo_content_type_uses_magic_bytes() -> None:
    assert detect_logo_content_type(PNG) == "image/png"
    assert detect_logo_content_type(b"\x00\x00\x01\x00ico") == "image/x-icon"
    assert detect_logo_content_type(b"<html>not an icon</html>") is None


def test_discover_icon_urls_resolves_links_and_keeps_fallback_last() -> None:
    urls = discover_icon_urls(
        b"""
        <html><head>
          <link rel="apple-touch-icon" href="/apple.png">
          <link rel="shortcut icon" href="icons/site.ico">
          <link rel="stylesheet" href="/ignored.css">
        </head></html>
        """,
        base_url="https://www.example.com/about",
    )
    assert urls == [
        "https://www.example.com/apple.png",
        "https://www.example.com/icons/site.ico",
        "https://www.example.com/favicon.ico",
    ]


async def test_fetch_brand_logo_prefers_declared_valid_raster() -> None:
    page_url = "https://example.com/"
    icon_url = "https://cdn.example.net/brand.png"
    html = f'<link rel="icon" href="{icon_url}">'.encode()
    fetcher = _FakeFetcher(
        {
            page_url: _result(page_url, body=html, content_type="text/html"),
            icon_url: _result(icon_url, body=PNG, content_type="image/png"),
        }
    )

    logo = await fetch_brand_logo(page_url, fetcher=fetcher)

    assert logo is not None
    assert logo.source_url == icon_url
    assert logo.content_type == "image/png"
    assert logo.image_data == PNG
    assert [call.url for call in fetcher.calls] == [page_url, icon_url]
    assert all(call.allow_escalation is False for call in fetcher.calls)


async def test_fetch_brand_logo_rejects_spoofed_image_and_uses_fallback() -> None:
    page_url = "https://example.com/"
    bad_url = "https://example.com/not-an-image.png"
    fallback_url = "https://example.com/favicon.ico"
    fetcher = _FakeFetcher(
        {
            page_url: _result(
                page_url,
                body=f'<link rel="icon" href="{bad_url}">'.encode(),
                content_type="text/html",
            ),
            bad_url: _result(
                bad_url, body=b"<html>spoof</html>", content_type="image/png"
            ),
            fallback_url: _result(fallback_url, body=PNG, content_type="image/x-icon"),
        }
    )

    logo = await fetch_brand_logo(page_url, fetcher=fetcher)

    assert logo is not None
    assert logo.source_url == fallback_url
    assert logo.content_type == "image/png"
