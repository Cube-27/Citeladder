"""Defensive sitemap admission tests."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from app.connectors.web_evidence.url_policy import UrlPolicyError
from app.core.config.site_health_runtime import site_health_settings
from app.workers.site_health.phases import discover_stages


class _Collector:
    urls = ("https://example.com/unsafe", "https://example.com/accepted")


def test_sitemap_admission_skips_one_url_when_identity_policy_rejects(
    monkeypatch,
) -> None:
    original = discover_stages.canonical_identity

    def reject_one(url: str):
        if url.endswith("/unsafe"):
            raise UrlPolicyError("unsafe sitemap URL")
        return original(url)

    monkeypatch.setattr(discover_stages, "canonical_identity", reject_one)

    assert discover_stages._admitted_sitemap_urls(
        _Collector(),
        root_registrable_domain="example.com",
        include_globs=None,
        exclude_globs=None,
    ) == ("https://example.com/accepted",)


@pytest.mark.asyncio
async def test_sitemap_fetches_overlap_but_admission_keeps_bfs_order(monkeypatch):
    monkeypatch.setattr(site_health_settings, "sitemap_fetch_concurrency", 2)
    monkeypatch.setattr(site_health_settings, "max_sitemap_documents", 3)
    monkeypatch.setattr(site_health_settings, "max_sitemap_urls", 2)
    root = "https://example.com/index.xml"
    first = "https://example.com/first.xml"
    second = "https://example.com/second.xml"
    later = "https://example.com/later.xml"
    bodies = {
        root: (
            "<sitemapindex>"
            + "".join(
                f"<sitemap><loc>{url}</loc></sitemap>"
                for url in [first, second, first, later]
            )
            + "</sitemapindex>"
        ).encode(),
        first: b"<urlset><url><loc>https://example.com/winner</loc></url></urlset>",
        second: b"<urlset><url><loc>https://example.com/loser</loc></url></urlset>",
    }
    # The document parser also caps index references at max_sitemap_urls.
    # Use a two-URL budget so both children are eligible, then fill it in first.
    bodies[first] = bodies[first].replace(
        b"</urlset>", b"<url><loc>https://example.com/also-first</loc></url></urlset>"
    )
    completed = []
    second_done = asyncio.Event()

    @asynccontextmanager
    async def new_fetcher():
        yield object()

    async def fetch(_ctx, _fetcher, url):
        if url == first:
            await asyncio.wait_for(second_done.wait(), timeout=2)
        completed.append(url)
        if url == second:
            second_done.set()
        return SimpleNamespace(body=bodies[url], content_type="application/xml")

    monkeypatch.setattr(discover_stages, "_fetch_sitemap_document", fetch)
    urls, files = await discover_stages._ingest_sitemaps(
        SimpleNamespace(new_fetcher=new_fetcher),
        [root, root],
        root_registrable_domain="example.com",
        include_globs=None,
        exclude_globs=None,
    )
    assert completed == [root, second, first]
    assert files == (root, first, second)
    assert urls == ("https://example.com/winner", "https://example.com/also-first")
