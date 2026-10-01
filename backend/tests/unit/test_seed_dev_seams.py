"""Site Health fixture transport seams retained by the development seeder.
Native audit fixture execution is covered by the TypeScript audit seed test."""

from __future__ import annotations

import pytest

from app.connectors.web_evidence.contracts import (
    AcquisitionTransport,
    FetchRequest,
    ResolvedTarget,
)
from app.core.config.site_health_acquisition import FETCH_PURPOSE_ANALYZE
from scripts.seed_dev_support import (
    _SeedAcquisitionTransport,
    _site_transport,
)


def _target(path: str) -> ResolvedTarget:
    return ResolvedTarget(
        url=f"https://wanderlustgear.com{path}",
        scheme="https",
        host="wanderlustgear.com",
        port=443,
        connect_ip="93.184.216.34",
    )


def _request(path: str) -> FetchRequest:
    return FetchRequest(
        url=f"https://wanderlustgear.com{path}", purpose=FETCH_PURPOSE_ANALYZE
    )


class TestAcquisitionTransportSeam:
    def test_the_seed_transport_satisfies_the_acquisition_contract(self) -> None:
        """``SecureFetcher`` calls ``transport.fetch(request, target, ...)``.

        An ``httpx.MockTransport`` has ``handle_async_request``, not ``fetch``,
        so passing one straight through fails at the first crawl fetch.
        """
        transport = _site_transport()

        assert isinstance(transport, AcquisitionTransport)
        assert hasattr(transport, "fetch")

    async def test_fetch_returns_the_underlying_response_unchanged(self) -> None:
        result = await _site_transport().fetch(
            _request("/backpacks"),
            _target("/backpacks"),
            max_wire_bytes=1_000_000,
            max_decoded_bytes=1_000_000,
            timeout_seconds=5.0,
        )

        assert result.status_code == 200
        assert result.content_type == "text/html"
        assert b"Backpacks Catalog" in result.body
        assert result.requested_url == "https://wanderlustgear.com/backpacks"
        assert result.final_url == "https://wanderlustgear.com/backpacks"
        assert result.wire_bytes == len(result.body)

    async def test_fetch_preserves_the_headers_the_seeded_page_declares(self) -> None:
        """The home page ships gzipped with an HSTS header, on purpose.

        Those headers are what the crawl's delivery-signal rules read, so the
        adapter must pass them through rather than normalizing them away. The
        BODY, though, arrives already decoded: ``httpx`` transparently inflates
        a ``content-encoding: gzip`` response on ``aread()``, so callers see
        markup while the header still advertises the encoding.
        """
        result = await _site_transport().fetch(
            _request("/"),
            _target("/"),
            max_wire_bytes=1_000_000,
            max_decoded_bytes=1_000_000,
            timeout_seconds=5.0,
        )

        assert result.redacted_headers["content-encoding"] == "gzip"
        assert "strict-transport-security" in result.redacted_headers
        assert b"Wanderlust Gear Co. - Home" in result.body

    async def test_an_unseeded_path_comes_back_as_a_404(self) -> None:
        result = await _site_transport().fetch(
            _request("/nope"),
            _target("/nope"),
            max_wire_bytes=1_000_000,
            max_decoded_bytes=1_000_000,
            timeout_seconds=5.0,
        )

        assert result.status_code == 404

    async def test_a_response_over_the_configured_bounds_raises(self) -> None:
        """The bound is a fixture guarantee, not a soft limit.

        A seeded page that outgrows the crawl's byte ceiling must fail the seed
        run loudly rather than being silently truncated into a thin page the
        rules then score as a content gap.
        """
        with pytest.raises(AssertionError, match="exceeded configured crawl bounds"):
            await _site_transport().fetch(
                _request("/backpacks"),
                _target("/backpacks"),
                max_wire_bytes=10,
                max_decoded_bytes=10,
                timeout_seconds=5.0,
            )

    async def test_an_error_from_the_underlying_handler_propagates(self) -> None:
        """A handler fault is a broken fixture; it must not become a 4xx."""

        def _boom(_request: object) -> None:
            raise RuntimeError("offline page handler failed")

        with pytest.raises(RuntimeError, match="offline page handler failed"):
            await _SeedAcquisitionTransport(_boom).fetch(
                _request("/"),
                _target("/"),
                max_wire_bytes=1_000_000,
                max_decoded_bytes=1_000_000,
                timeout_seconds=5.0,
            )
