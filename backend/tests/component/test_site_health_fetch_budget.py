"""Site Health page fetches are reserved per crawl and settled on terminal."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import (
    KEY_PROJECT_SLOTS,
    KEY_SITE_HEALTH_PAGE_FETCHES,
)
from app.domain.entitlements.grants import issue_grant_bundle
from app.domain.entitlements.types import GrantSpec
from app.domain.site_health.fetch_budget import (
    available_page_fetches,
    settle_crawl_fetches,
)
from app.models.billing import BillingAccount
from app.models.site_health.crawl import SiteCrawl
from tests.component.auth_helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def _available(db_session: AsyncSession, workspace_id) -> int | None:
    """Read the balance, then end the transaction so its row locks never
    block the next API request."""
    value = await available_page_fetches(
        db_session, workspace_id=workspace_id, at=datetime.now(UTC)
    )
    await db_session.rollback()
    return value


async def _project(client: httpx.AsyncClient, name: str) -> str:
    response = await client.post(
        "/api/v1/projects",
        json={
            "name": name,
            "brand_name": name,
            "website_url": f"https://{name.lower()}.example.com",
            "competitors": [{"name": "Rival", "aliases": [], "domains": []}],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _grant_fetches(db_session: AsyncSession, units: int) -> None:
    account = (await db_session.scalars(select(BillingAccount))).one()
    await issue_grant_bundle(
        db_session,
        account_id=account.id,
        source_kind="override",
        source_ref="test:fetch-allowance",
        grants=(
            GrantSpec(key=KEY_SITE_HEALTH_PAGE_FETCHES, value=units),
            GrantSpec(key=KEY_PROJECT_SLOTS, value=2),
        ),
        catalog_revision="test",
        idempotency_key="test-fetch-allowance",
        valid_from=datetime(2026, 1, 1, tzinfo=UTC),
        valid_until=None,
    )
    await db_session.commit()


async def test_crawls_share_one_allowance_and_pay_only_for_analyzed_pages(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register_and_login(client, "fetch-budget@example.com")
    await _grant_fetches(db_session, 3)
    first_project = await _project(client, "Alpha")
    second_project = await _project(client, "Bravo")

    created = await client.post(
        "/api/v1/site-crawls", json={"project_id": first_project}
    )
    assert created.status_code in {200, 201, 202}
    crawl = await db_session.get(SiteCrawl, created.json()["id"])
    assert crawl is not None
    crawl_id, workspace_id = crawl.id, crawl.workspace_id
    # The crawl plans no more pages than the allowance has left, and holds them.
    assert crawl.discovery_requested_count == 3
    assert await _available(db_session, workspace_id) == 0

    # A second crawl finds nothing left and is refused before any fetch.
    refused = await client.post(
        "/api/v1/site-crawls", json={"project_id": second_project}
    )
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "site_health_fetches_exhausted"

    # Terminal settlement debits the analyzed pages and releases the rest;
    # a repeat settlement changes nothing.
    crawl = await db_session.get(SiteCrawl, crawl_id)
    assert crawl is not None
    crawl.analyzed_url_count = 2
    now = datetime.now(UTC)
    await settle_crawl_fetches(db_session, crawl=crawl, at=now)
    await settle_crawl_fetches(db_session, crawl=crawl, at=now)
    await db_session.commit()
    assert await _available(db_session, workspace_id) == 1


async def test_accounts_without_a_fetch_grant_are_not_metered(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register_and_login(client, "fetch-unmetered@example.com")
    project = await _project(client, "Charlie")
    created = await client.post("/api/v1/site-crawls", json={"project_id": project})
    assert created.status_code in {200, 201, 202}
    crawl = await db_session.get(SiteCrawl, created.json()["id"])
    assert crawl is not None
    assert await _available(db_session, crawl.workspace_id) is None
