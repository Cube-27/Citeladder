from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.web_evidence.favicon import FetchedBrandLogo
from app.core.config.brand_logos import (
    BRAND_LOGO_STATUS_FAILED,
    BRAND_LOGO_STATUS_READY,
)
from app.domain.projects import logos as logo_service
from app.models.brand import Brand, BrandLogoAsset, Competitor
from app.models.project import Project
from app.models.workspace import Workspace

PNG = b"\x89PNG\r\n\x1a\ncached"


async def _project(db_session: AsyncSession) -> tuple[Workspace, Project]:
    workspace = Workspace(id=uuid.uuid4(), name="Logo workspace")
    db_session.add(workspace)
    await db_session.flush()
    project = Project(
        workspace_id=workspace.id,
        name="Acme",
        brand_name="Acme",
        website_url="https://www.acme.com",
    )
    project.brand = Brand(name="Acme")
    project.competitors = [
        Competitor(name="Acme Other", aliases=[], domains=["acme.com"])
    ]
    db_session.add(project)
    await db_session.commit()
    return workspace, project


async def test_refresh_attaches_ready_db_cache_without_crawling(
    db_session: AsyncSession, monkeypatch
) -> None:
    workspace, project = await _project(db_session)
    asset = BrandLogoAsset(
        domain="acme.com",
        status=BRAND_LOGO_STATUS_READY,
        source_url="https://acme.com/favicon.ico",
        content_type="image/png",
        image_data=PNG,
        byte_size=len(PNG),
        sha256="hash",
        fetched_at=datetime.now(UTC),
    )
    db_session.add(asset)
    await db_session.commit()

    async def fail_if_called(_targets):
        raise AssertionError("crawler must not run for a ready database cache hit")

    monkeypatch.setattr(logo_service, "_fetch_missing", fail_if_called)
    refreshed = await logo_service.refresh_project_logos(
        db_session, workspace_id=workspace.id, project_id=project.id
    )

    assert refreshed.brand is not None
    assert refreshed.brand.logo_asset_id == asset.id
    assert refreshed.competitors[0].logo_asset_id == asset.id
    logo_urls = logo_service.get_project_logo_urls(refreshed)
    assert logo_urls == {
        refreshed.brand.id: f"/api/v1/projects/{project.id}/logo",
        refreshed.competitors[0].id: (
            f"/api/v1/projects/{project.id}/competitors/"
            f"{refreshed.competitors[0].id}/logo"
        ),
    }


async def test_refresh_revalidates_stale_ready_cache(
    db_session: AsyncSession, monkeypatch
) -> None:
    workspace, project = await _project(db_session)
    asset = BrandLogoAsset(
        domain="acme.com",
        status=BRAND_LOGO_STATUS_READY,
        source_url="https://acme.com/old.png",
        content_type="image/png",
        image_data=PNG,
        byte_size=len(PNG),
        sha256="old-hash",
        fetched_at=datetime.now(UTC) - timedelta(days=8),
    )
    db_session.add(asset)
    await db_session.commit()

    async def fetched(targets):
        assert [target.domain for target in targets] == ["acme.com"]
        return {
            "acme.com": FetchedBrandLogo(
                source_url="https://acme.com/new.png",
                content_type="image/png",
                image_data=PNG + b"-new",
            )
        }

    monkeypatch.setattr(logo_service, "_fetch_missing", fetched)
    refreshed = await logo_service.refresh_project_logos(
        db_session, workspace_id=workspace.id, project_id=project.id
    )

    assert refreshed.brand is not None
    assert refreshed.brand.logo_asset_id == asset.id
    assert refreshed.brand.logo_asset is not None
    assert refreshed.brand.logo_asset.source_url == "https://acme.com/new.png"


async def test_refresh_honors_fresh_negative_cache(
    db_session: AsyncSession, monkeypatch
) -> None:
    workspace, project = await _project(db_session)
    db_session.add(
        BrandLogoAsset(
            domain="acme.com",
            status=BRAND_LOGO_STATUS_FAILED,
            retry_after=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    await db_session.commit()

    async def fail_if_called(_targets):
        raise AssertionError("crawler must not run during the negative-cache window")

    monkeypatch.setattr(logo_service, "_fetch_missing", fail_if_called)
    refreshed = await logo_service.refresh_project_logos(
        db_session, workspace_id=workspace.id, project_id=project.id
    )

    assert refreshed.brand is not None
    assert refreshed.brand.logo_asset_id is None


async def test_expired_negative_cache_is_refreshed_and_attached(
    db_session: AsyncSession, monkeypatch
) -> None:
    workspace, project = await _project(db_session)
    db_session.add(
        BrandLogoAsset(
            domain="acme.com",
            status=BRAND_LOGO_STATUS_FAILED,
            retry_after=datetime.now(UTC) - timedelta(seconds=1),
        )
    )
    await db_session.commit()

    async def fetched(targets):
        assert [target.domain for target in targets] == ["acme.com"]
        return {
            "acme.com": FetchedBrandLogo(
                source_url="https://acme.com/icon.png",
                content_type="image/png",
                image_data=PNG,
            )
        }

    monkeypatch.setattr(logo_service, "_fetch_missing", fetched)
    refreshed = await logo_service.refresh_project_logos(
        db_session, workspace_id=workspace.id, project_id=project.id
    )

    assert refreshed.brand is not None
    assert refreshed.brand.logo_asset_id is not None
    assert refreshed.competitors[0].logo_asset_id == refreshed.brand.logo_asset_id
    assert isinstance(refreshed.brand.logo_asset_id, uuid.UUID)


async def test_fetch_missing_isolates_unexpected_target_failure(
    monkeypatch, caplog
) -> None:
    class FakeSecureFetcher:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            pass

    expected = FetchedBrandLogo(
        source_url="https://ok.example/icon.png",
        content_type="image/png",
        image_data=PNG,
    )

    async def fetch(homepage_url, *, fetcher):
        _ = fetcher
        if "broken" in homepage_url:
            raise RuntimeError("unexpected connector failure")
        return expected

    monkeypatch.setattr(logo_service, "SecureFetcher", FakeSecureFetcher)
    monkeypatch.setattr(logo_service, "fetch_brand_logo", fetch)
    caplog.set_level("ERROR", logger=logo_service.__name__)
    targets = [
        logo_service._LogoTarget("broken.example", "https://broken.example/"),
        logo_service._LogoTarget("ok.example", "https://ok.example/"),
    ]

    results = await logo_service._fetch_missing(targets)

    assert results == {"broken.example": None, "ok.example": expected}
    assert "Unexpected brand logo fetch failure" in caplog.text


async def test_fetch_missing_has_a_hard_total_timeout(monkeypatch) -> None:
    class FakeSecureFetcher:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            pass

    async def fetch(_homepage_url, *, fetcher):
        _ = fetcher
        await asyncio.sleep(1)
        return None

    monkeypatch.setattr(logo_service, "SecureFetcher", FakeSecureFetcher)
    monkeypatch.setattr(logo_service, "fetch_brand_logo", fetch)
    monkeypatch.setattr(logo_service, "BRAND_LOGO_REFRESH_TIMEOUT_SECONDS", 0.01)
    target = logo_service._LogoTarget("slow.example", "https://slow.example/")

    results = await logo_service._fetch_missing([target])

    assert results == {"slow.example": None}
