"""Component tests for the Performance read API (httpx ASGITransport).

Pins the acceptance of the GSC alignment:
  - the date-only ``gsc_day_daily`` dataset is the SOLE source of headline
    totals and chart series; no dimensional dataset is ever summed into one;
  - each of the six dimension tables reads exactly one dataset, and Search
    Appearance with no rows is an OBSERVED EMPTY table, not a failure;
  - every preset resolves the newest snapshot of its length, and the response
    states the window ACTUALLY covered;
  - the dashboard's ``snapshot_id`` is what every tabular read carries back,
    so a chart and its tables can never read different projections;
  - compare returns a SECOND persisted window, with an unprojected comparison
    reported rather than fabricated;
  - the custom-range task is isolated: it writes one display snapshot and
    enqueues nothing else;
  - contract C4: keyset envelopes with a PERSISTED total, fingerprint-bound
    cursors (replay against different filters -> 400), config-owned page
    sizes (anything else -> 422), and bounded queries;
  - invariant 5: cross-workspace project AND snapshot access reveal nothing.

Requires a real Postgres.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_DEMAND_SNAPSHOT_REFRESH,
    ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
    ANALYTICS_TASK_KIND_PERFORMANCE_RANGE_PROJECTION,
    ANALYTICS_TASK_KIND_TRAFFIC_SNAPSHOT_REFRESH,
)
from app.core.config.integrations_datasets import (
    DATASET_GA4_CHANNEL_DAILY,
    DATASET_GSC_COUNTRY_DAILY,
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_DEVICE_DAILY,
    DATASET_GSC_PAGE_DAILY,
    DATASET_GSC_QUERY_DAILY,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_GA4,
    INTEGRATION_PROVIDER_GSC,
)
from app.core.config.traffic import (
    PERFORMANCE_DIMENSION_ORDER,
    PERFORMANCE_PAGE_SIZE_OPTIONS,
    PERFORMANCE_SNAPSHOT_WINDOW_DAYS,
)
from app.domain.traffic.service import (
    project_performance_range,
    refresh_traffic_snapshot,
)
from app.models.analytics import AnalyticsTask
from app.models.integrations import IntegrationConnection
from app.models.traffic import PerformanceDimensionStat, TrafficSnapshot
from tests.component.analytics_helpers import seed_ga4_import, seed_metric_row

GSC_PROPERTY = "https://example.com/"
GA4_PROPERTY = "properties/123456789"
PAGE_A = "https://example.com/blog"
PAGE_B = "https://example.com/pricing"

# The anchor every preset window ends on, and the sync window that triggers
# the refresh. The family is nested and ends at ANCHOR.
ANCHOR = date(2026, 7, 28)
WINDOW = (ANCHOR - timedelta(days=27), ANCHOR)

# Exact key sets mirroring the frontend zod .strict() schemas.
_DASHBOARD_KEYS = {
    "project_id",
    "range",
    "granularity",
    "compare",
    "selected",
    "comparison",
    "coverage",
    "dimension_counts",
    "unavailable_dimensions",
    "formula_version",
    "normalization_version",
}
_WINDOW_KEYS = {
    "snapshot_id",
    "window_start",
    "window_end",
    "evidence_state",
    "totals",
    "series",
}
_TOTALS_KEYS = {"clicks", "impressions", "ctr", "position", "sessions", "conversions"}
_SERIES_NAMES = {"clicks", "impressions", "ctr", "position"}
_COVERAGE_KEYS = {"earliest_date", "latest_date", "covered_days"}
_TABLE_KEYS = {"dimension", "items", "next_cursor", "total_count", "page_size"}
_ROW_KEYS = {"dimension_key", "display_value", "metrics", "comparison_metrics"}
_METRIC_KEYS = {"clicks", "impressions", "ctr", "position"}


# ---------------------------------------------------------------------------
# API + seed helpers
# ---------------------------------------------------------------------------
async def _register(client: httpx.AsyncClient, email: str) -> None:
    resp = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123"}
    )
    assert resp.status_code == 202
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    assert login.status_code == 200


async def _create_project(client: httpx.AsyncClient) -> tuple[str, str]:
    resp = await client.post("/api/v1/projects", json={"name": "Performance Project"})
    assert resp.status_code == 201
    body = resp.json()
    return body["id"], body["workspace_id"]


def _day_metrics(day_index: int) -> dict[str, float]:
    """Deterministic per-day headline measures, distinct per date."""
    return {
        "clicks": 10 + day_index,
        "impressions": 100 + 10 * day_index,
        "position": 5.0 + day_index,
    }


async def _seed_performance_chain(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> None:
    """Seed the GSC + GA4 import graph the Performance projection consumes.

    One shared Google grant. ``gsc_day_daily`` covers every date in the sync
    window (the headline), and the dimensional reports cover Pages, Queries,
    Countries, and Devices. Search Appearance is deliberately NOT seeded: a
    GSC account with no Search Appearance rows must render an observed-empty
    table, not an error.
    """
    days = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_DAY_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
    )
    window_start, window_end = WINDOW
    span = (window_end - window_start).days + 1
    for offset in range(span):
        row_date = window_start + timedelta(days=offset)
        await seed_metric_row(
            session,
            seed=days,
            row_date=row_date,
            dimension_values=[row_date.isoformat()],
            metrics=_day_metrics(offset),
        )

    gsc_connection = await session.get(IntegrationConnection, days.connection_id)
    assert gsc_connection is not None

    pages = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_PAGE_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
        connection=gsc_connection,
        resync_seq=1,
    )
    for page, clicks in ((PAGE_A, 30), (PAGE_B, 12)):
        await seed_metric_row(
            session,
            seed=pages,
            row_date=ANCHOR,
            dimension_values=[page, ANCHOR.isoformat()],
            metrics={"clicks": clicks, "impressions": clicks * 10, "position": 4.0},
            resync_seq=1,
        )

    queries = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_QUERY_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
        connection=gsc_connection,
        resync_seq=2,
    )
    for text, clicks in (("Best  CRM", 9), ("aeo guide", 5), ("pricing", 2)):
        await seed_metric_row(
            session,
            seed=queries,
            row_date=ANCHOR,
            dimension_values=[text, ANCHOR.isoformat()],
            metrics={"clicks": clicks, "impressions": clicks * 8, "position": 7.0},
            resync_seq=2,
        )

    countries = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_COUNTRY_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
        connection=gsc_connection,
        resync_seq=3,
    )
    for code, clicks in (("ind", 20), ("usa", 14)):
        await seed_metric_row(
            session,
            seed=countries,
            row_date=ANCHOR,
            dimension_values=[code, ANCHOR.isoformat()],
            metrics={"clicks": clicks, "impressions": clicks * 6},
            resync_seq=3,
        )

    devices = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_DEVICE_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
        connection=gsc_connection,
        resync_seq=4,
    )
    await seed_metric_row(
        session,
        seed=devices,
        row_date=ANCHOR,
        dimension_values=["MOBILE", ANCHOR.isoformat()],
        metrics={"clicks": 25, "impressions": 250},
        resync_seq=4,
    )

    ga4_connection = IntegrationConnection(
        workspace_id=workspace_id,
        grant_id=days.grant_id,
        provider=INTEGRATION_PROVIDER_GA4,
        label="ga4 connection",
        account_ref="ga4-account-1",
    )
    session.add(ga4_connection)
    await session.flush()
    channels = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GA4_CHANNEL_DAILY,
        provider=INTEGRATION_PROVIDER_GA4,
        property_ref=GA4_PROPERTY,
        window=WINDOW,
        connection=ga4_connection,
    )
    await seed_metric_row(
        session,
        seed=channels,
        row_date=ANCHOR,
        dimension_values=["Organic Search", ANCHOR.strftime("%Y%m%d")],
        metrics={"sessions": 40, "engagedSessions": 25, "keyEvents": 4},
    )


async def _refresh(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
) -> None:
    """Run the refresh executor for the seeded sync window."""
    task = AnalyticsTask(
        workspace_id=workspace_id,
        project_id=project_id,
        task_kind=ANALYTICS_TASK_KIND_TRAFFIC_SNAPSHOT_REFRESH,
        payload={
            "window_start": WINDOW[0].isoformat(),
            "window_end": WINDOW[1].isoformat(),
        },
        idempotency_key=f"test-refresh-{uuid.uuid4()}",
    )
    await refresh_traffic_snapshot(session_factory, task)


@pytest.fixture
async def seeded(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[str, str]:
    await _register(client, f"perf-{uuid.uuid4().hex[:8]}@example.com")
    project_id, workspace_id = await _create_project(client)
    await _seed_performance_chain(
        db_session,
        workspace_id=uuid.UUID(workspace_id),
        project_id=uuid.UUID(project_id),
    )
    await db_session.commit()
    await _refresh(
        session_factory,
        workspace_id=uuid.UUID(workspace_id),
        project_id=uuid.UUID(project_id),
    )
    return project_id, workspace_id


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
async def test_endpoints_require_auth(client: httpx.AsyncClient) -> None:
    project_id = uuid.uuid4()
    for path in (
        f"/api/v1/projects/{project_id}/performance",
        f"/api/v1/projects/{project_id}/performance/table?snapshot_id={uuid.uuid4()}",
    ):
        assert (await client.get(path)).status_code == 401


async def test_unprojected_range_is_reported_not_fabricated(
    client: httpx.AsyncClient,
) -> None:
    """A project with no snapshot yields an explicit unprojected payload."""
    await _register(client, f"empty-{uuid.uuid4().hex[:8]}@example.com")
    project_id, _ = await _create_project(client)
    resp = await client.get(f"/api/v1/projects/{project_id}/performance")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == _DASHBOARD_KEYS
    assert set(body["selected"]) == _WINDOW_KEYS

    assert body["selected"]["snapshot_id"] is None
    assert body["selected"]["evidence_state"] == "not_run"
    # Never a zero: an unimported window is UNMEASURED.
    assert body["selected"]["totals"]["clicks"] is None
    assert body["selected"]["totals"]["impressions"] is None
    assert body["selected"]["series"]["clicks"] == []
    assert body["comparison"] is None
    assert body["coverage"] == {
        "earliest_date": None,
        "latest_date": None,
        "covered_days": 0,
    }


async def test_search_appearance_is_reported_unavailable_not_empty(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    """The uncollected breakdown is named, so the tab can say why it is empty.

    Search Console refuses ``searchAppearance`` grouped with ``date``, so the
    report is never imported. Rendering that as an observed-empty table would
    claim a measurement nobody made.
    """
    project_id, _workspace_id = seeded
    body = (await client.get(f"/api/v1/projects/{project_id}/performance")).json()
    assert body["unavailable_dimensions"] == ["search_appearance"]
    # Every other tab stays collected.
    for dimension in PERFORMANCE_DIMENSION_ORDER:
        if dimension != "search_appearance":
            assert dimension not in body["unavailable_dimensions"]


async def test_headline_totals_come_only_from_the_date_only_dataset(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    resp = await client.get(
        f"/api/v1/projects/{project_id}/performance", params={"range": "month"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["selected"]["totals"]) == _TOTALS_KEYS
    assert set(body["selected"]["series"]) == _SERIES_NAMES

    span = (WINDOW[1] - WINDOW[0]).days + 1
    expected_clicks = sum(_day_metrics(offset)["clicks"] for offset in range(span))
    expected_impressions = sum(
        _day_metrics(offset)["impressions"] for offset in range(span)
    )
    # The dimensional reports also carry clicks. If ANY of them were summed
    # into the headline the totals would exceed the date-only report.
    assert body["selected"]["totals"]["clicks"] == expected_clicks
    assert body["selected"]["totals"]["impressions"] == expected_impressions
    assert body["selected"]["evidence_state"] == "available"
    # GA4 rides the same payload as a compact summary, not as a series.
    assert body["selected"]["totals"]["sessions"] == 40
    assert body["selected"]["totals"]["conversions"] == 4


async def test_every_preset_resolves_and_states_its_real_window(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    for range_token, days in (
        ("day", 1),
        ("week", 7),
        ("month", 28),
    ):
        assert days in PERFORMANCE_SNAPSHOT_WINDOW_DAYS
        resp = await client.get(
            f"/api/v1/projects/{project_id}/performance",
            params={"range": range_token},
        )
        assert resp.status_code == 200, range_token
        selected = resp.json()["selected"]
        assert selected["snapshot_id"] is not None, range_token
        # The window ACTUALLY covered is returned, anchored at the latest
        # complete GSC date rather than at "today".
        assert selected["window_end"] == ANCHOR.isoformat()
        assert (
            selected["window_start"] == (ANCHOR - timedelta(days=days - 1)).isoformat()
        )
        assert len(selected["series"]["clicks"]) == days


async def test_preset_never_resolves_to_a_same_length_custom_range(
    client: httpx.AsyncClient,
    seeded: tuple[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A 7-day display range must not be mistaken for the Week preset."""
    project_id, _ = seeded
    before = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance", params={"range": "week"}
        )
    ).json()["selected"]

    # A custom range of exactly the preset's length, ending LATER than the
    # anchor, so a length-plus-recency match would prefer it.
    custom = (ANCHOR - timedelta(days=3), ANCHOR + timedelta(days=3))
    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={"from": custom[0].isoformat(), "to": custom[1].isoformat()},
    )
    assert resp.status_code == 202
    async with session_factory() as session:
        task = await session.get(AnalyticsTask, uuid.UUID(resp.json()["task_id"]))
        assert task is not None
    await project_performance_range(session_factory, task)

    after = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance", params={"range": "week"}
        )
    ).json()["selected"]
    # The preset still resolves to the family's own snapshot.
    assert after["snapshot_id"] == before["snapshot_id"]
    assert after["window_end"] == ANCHOR.isoformat()

    async with session_factory() as session:
        custom_snapshot = await session.scalar(
            select(TrafficSnapshot).where(
                TrafficSnapshot.window_start == custom[0],
                TrafficSnapshot.window_end == custom[1],
            )
        )
        assert custom_snapshot is not None
        # A display range is never marked as a preset.
        assert custom_snapshot.preset_window_days is None


async def test_coverage_reports_the_imported_extent(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    body = (await client.get(f"/api/v1/projects/{project_id}/performance")).json()
    assert set(body["coverage"]) == _COVERAGE_KEYS
    assert body["coverage"]["earliest_date"] == WINDOW[0].isoformat()
    assert body["coverage"]["latest_date"] == ANCHOR.isoformat()
    assert body["coverage"]["covered_days"] == (WINDOW[1] - WINDOW[0]).days + 1


async def test_cross_workspace_project_is_404(client: httpx.AsyncClient) -> None:
    await _register(client, f"owner-{uuid.uuid4().hex[:8]}@example.com")
    project_id, _ = await _create_project(client)
    await client.post("/api/v1/auth/logout")
    await _register(client, f"other-{uuid.uuid4().hex[:8]}@example.com")
    resp = await client.get(f"/api/v1/projects/{project_id}/performance")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------
async def test_previous_period_returns_a_second_persisted_window(
    client: httpx.AsyncClient,
    seeded: tuple[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    project_id, _workspace_id = seeded
    selected = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance", params={"range": "week"}
        )
    ).json()["selected"]
    previous_start = date.fromisoformat(selected["window_start"]) - timedelta(days=7)
    previous_end = date.fromisoformat(selected["window_start"]) - timedelta(days=1)

    # Before its projection exists, the comparison is reported as unprojected
    # rather than rendered as zero.
    body = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance",
            params={"range": "week", "compare": "previous"},
        )
    ).json()
    assert body["comparison"]["snapshot_id"] is None
    assert body["comparison"]["evidence_state"] == "not_run"
    assert body["comparison"]["window_start"] == previous_start.isoformat()
    assert body["comparison"]["window_end"] == previous_end.isoformat()

    # Materialize exactly that window, the way the surface does.
    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={"from": previous_start.isoformat(), "to": previous_end.isoformat()},
    )
    assert resp.status_code == 202
    task_id = resp.json()["task_id"]
    async with session_factory() as session:
        task = await session.get(AnalyticsTask, uuid.UUID(task_id))
        assert task is not None
    await project_performance_range(session_factory, task)

    body = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance",
            params={"range": "week", "compare": "previous"},
        )
    ).json()
    assert body["comparison"]["snapshot_id"] is not None
    assert body["comparison"]["evidence_state"] == "available"
    # Both windows are real projections with their own absolute totals; no
    # percentage is computed anywhere in the payload.
    assert body["selected"]["totals"]["clicks"] is not None
    assert body["comparison"]["totals"]["clicks"] is not None


async def test_compare_custom_requires_both_bounds(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    resp = await client.get(
        f"/api/v1/projects/{project_id}/performance",
        params={"range": "week", "compare": "custom"},
    )
    assert resp.status_code == 422


async def test_invalid_range_and_compare_are_422(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    for params in (
        {"range": "quarter"},
        {"compare": "sideways"},
        {"from": "2026-07-01"},  # half-specified window
        {"from": "2026-07-10", "to": "2026-07-01"},  # inverted
    ):
        resp = await client.get(
            f"/api/v1/projects/{project_id}/performance", params=params
        )
        assert resp.status_code == 422, params


# ---------------------------------------------------------------------------
# Dimension tables
# ---------------------------------------------------------------------------
async def _snapshot_id(client: httpx.AsyncClient, project_id: str) -> str:
    body = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance", params={"range": "month"}
        )
    ).json()
    return body["selected"]["snapshot_id"]


async def test_every_dimension_table_serves_its_own_dataset(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    expected_counts = {
        "query": 3,
        "page": 2,
        "country": 2,
        "device": 1,
        # Not seeded: a GSC account with no Search Appearance rows.
        "search_appearance": 0,
        "day": (WINDOW[1] - WINDOW[0]).days + 1,
    }
    for dimension in PERFORMANCE_DIMENSION_ORDER:
        resp = await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={"snapshot_id": snapshot_id, "dimension": dimension},
        )
        assert resp.status_code == 200, dimension
        body = resp.json()
        assert set(body) == _TABLE_KEYS
        assert body["dimension"] == dimension
        # The exact total is the snapshot's PERSISTED per-dimension count.
        assert body["total_count"] == expected_counts[dimension], dimension
        for row in body["items"]:
            assert set(row) == _ROW_KEYS
            assert set(row["metrics"]) == _METRIC_KEYS
            assert row["comparison_metrics"] is None


async def test_search_appearance_absence_is_an_observed_empty_table(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/performance/table",
        params={"snapshot_id": snapshot_id, "dimension": "search_appearance"},
    )
    # 200 with an empty page — not a 404 and not an error. The rest of the
    # snapshot is unaffected.
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total_count"] == 0
    assert body["next_cursor"] is None


async def test_days_table_reads_chronologically(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    body = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={
                "snapshot_id": snapshot_id,
                "dimension": "day",
                "page_size": 100,
            },
        )
    ).json()
    keys = [row["dimension_key"] for row in body["items"]]
    assert keys == sorted(keys)
    assert keys[0] == WINDOW[0].isoformat()
    # Each DAYS row matches the headline series for that date exactly — they
    # read the same dataset.
    assert body["items"][0]["metrics"]["clicks"] == _day_metrics(0)["clicks"]


async def test_table_defaults_to_clicks_descending(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    body = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={"snapshot_id": snapshot_id, "dimension": "query"},
        )
    ).json()
    clicks = [row["metrics"]["clicks"] for row in body["items"]]
    assert clicks == sorted(clicks, reverse=True)


async def test_table_pages_by_keyset_with_a_persisted_total(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    params = {
        "snapshot_id": snapshot_id,
        "dimension": "day",
        "page_size": PERFORMANCE_PAGE_SIZE_OPTIONS[0],
    }
    first = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance/table", params=params
        )
    ).json()
    assert len(first["items"]) == PERFORMANCE_PAGE_SIZE_OPTIONS[0]
    assert first["next_cursor"] is not None
    # The total describes the whole result set, not the page.
    assert first["total_count"] == (WINDOW[1] - WINDOW[0]).days + 1

    second = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={**params, "cursor": first["next_cursor"]},
        )
    ).json()
    first_keys = {row["dimension_key"] for row in first["items"]}
    second_keys = {row["dimension_key"] for row in second["items"]}
    # No overlap and no skipped rows across the boundary.
    assert not (first_keys & second_keys)
    assert second["total_count"] == first["total_count"]


async def test_cursor_replay_against_different_filters_is_refused(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    base = {"snapshot_id": snapshot_id, "dimension": "day", "page_size": 10}
    cursor = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance/table", params=base
        )
    ).json()["next_cursor"]
    assert cursor is not None

    # Each of these changes the result set or its order, so the bound cursor
    # must be refused rather than silently relabelling other rows.
    for changed in (
        {"dimension": "query"},
        {"sort": "-impressions"},
        {"page_size": 25},
    ):
        resp = await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={**base, **changed, "cursor": cursor},
        )
        assert resp.status_code == 400, changed

    malformed = await client.get(
        f"/api/v1/projects/{project_id}/performance/table",
        params={**base, "cursor": "not-a-cursor"},
    )
    assert malformed.status_code == 400


async def test_page_size_outside_the_offered_options_is_422(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    for page_size in (7, 1000, 0):
        resp = await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={"snapshot_id": snapshot_id, "page_size": page_size},
        )
        # Never silently clamped: a clamped size would page a different set
        # than the cursor the client holds was cut against.
        assert resp.status_code == 422, page_size


async def test_unknown_dimension_and_sort_are_422(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    for params in ({"dimension": "browser"}, {"sort": "-revenue"}):
        resp = await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={"snapshot_id": snapshot_id, **params},
        )
        assert resp.status_code == 422, params


async def test_snapshot_id_alone_never_grants_access(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    await client.post("/api/v1/auth/logout")
    await _register(client, f"intruder-{uuid.uuid4().hex[:8]}@example.com")
    other_project_id, _ = await _create_project(client)
    resp = await client.get(
        f"/api/v1/projects/{other_project_id}/performance/table",
        params={"snapshot_id": snapshot_id},
    )
    # The snapshot resolves to nothing outside its own workspace/project.
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["total_count"] == 0


async def test_comparison_columns_join_by_key_and_stay_null_when_unobserved(
    client: httpx.AsyncClient,
    seeded: tuple[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    project_id, _workspace_id = seeded
    snapshot_id = await _snapshot_id(client, project_id)
    # Project a comparison window covering only the first half of the month,
    # so some DAYS keys exist in the selection but not in the comparison.
    comparison_window = (WINDOW[0], WINDOW[0] + timedelta(days=6))
    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={
            "from": comparison_window[0].isoformat(),
            "to": comparison_window[1].isoformat(),
        },
    )
    assert resp.status_code == 202
    async with session_factory() as session:
        task = await session.get(AnalyticsTask, uuid.UUID(resp.json()["task_id"]))
        assert task is not None
    await project_performance_range(session_factory, task)
    comparison_id = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance",
            params={
                "from": comparison_window[0].isoformat(),
                "to": comparison_window[1].isoformat(),
            },
        )
    ).json()["selected"]["snapshot_id"]
    assert comparison_id is not None

    body = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance/table",
            params={
                "snapshot_id": snapshot_id,
                "dimension": "day",
                "page_size": 100,
                "compare_snapshot_id": comparison_id,
            },
        )
    ).json()
    by_key = {row["dimension_key"]: row for row in body["items"]}
    covered = comparison_window[0].isoformat()
    uncovered = ANCHOR.isoformat()
    assert by_key[covered]["comparison_metrics"] is not None
    # A key the comparison period never observed is NULL, not zero.
    assert by_key[uncovered]["comparison_metrics"] is None


# ---------------------------------------------------------------------------
# Range projection task isolation
# ---------------------------------------------------------------------------
async def test_range_task_is_idempotent_on_its_window(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    params = {"from": "2026-06-01", "to": "2026-06-07"}
    first = await client.post(
        f"/api/v1/projects/{project_id}/performance/range", params=params
    )
    second = await client.post(
        f"/api/v1/projects/{project_id}/performance/range", params=params
    )
    assert first.status_code == second.status_code == 202
    # The same range asked twice is the SAME task, so the client polls one
    # identity whether it queued the work or joined a request in flight.
    assert first.json()["task_id"] == second.json()["task_id"]

    poll = await client.get(
        f"/api/v1/projects/{project_id}/performance/range/{first.json()['task_id']}"
    )
    assert poll.status_code == 200
    assert poll.json()["window_start"] == params["from"]


async def test_range_task_writes_only_its_display_snapshot(
    client: httpx.AsyncClient,
    seeded: tuple[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    project_id, _workspace_id = seeded
    window = (ANCHOR - timedelta(days=13), ANCHOR - timedelta(days=7))

    async with session_factory() as session:
        before_snapshots = set(
            (await session.scalars(select(TrafficSnapshot.id))).all()
        )
        before_tasks = set((await session.scalars(select(AnalyticsTask.id))).all())

    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={"from": window[0].isoformat(), "to": window[1].isoformat()},
    )
    assert resp.status_code == 202
    async with session_factory() as session:
        task = await session.get(AnalyticsTask, uuid.UUID(resp.json()["task_id"]))
        assert task is not None
    await project_performance_range(session_factory, task)

    async with session_factory() as session:
        added = [
            row
            for row in (await session.scalars(select(TrafficSnapshot))).all()
            if row.id not in before_snapshots
        ]
        # EXACTLY one new snapshot: the requested display window, day-grained.
        assert len(added) == 1
        assert (added[0].window_start, added[0].window_end) == window
        assert added[0].granularity == "day"
        # Its dimension rows landed in the same transaction.
        dimension_rows = (
            await session.scalars(
                select(PerformanceDimensionStat).where(
                    PerformanceDimensionStat.snapshot_id == added[0].id
                )
            )
        ).all()
        assert dimension_rows

        new_tasks = [
            row
            for row in (await session.scalars(select(AnalyticsTask))).all()
            if row.id not in before_tasks
        ]
        # The ONLY task created is the range projection itself: no Demand
        # refresh, no opportunity verification, no other product projection.
        assert {row.task_kind for row in new_tasks} == {
            ANALYTICS_TASK_KIND_PERFORMANCE_RANGE_PROJECTION
        }
        assert ANALYTICS_TASK_KIND_DEMAND_SNAPSHOT_REFRESH not in {
            row.task_kind for row in new_tasks
        }
        assert ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION not in {
            row.task_kind for row in new_tasks
        }


async def test_range_task_never_replaces_an_existing_snapshot(
    client: httpx.AsyncClient,
    seeded: tuple[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A display request must not overwrite a preset another surface reads."""
    project_id, _ = seeded
    preset = (
        await client.get(
            f"/api/v1/projects/{project_id}/performance", params={"range": "week"}
        )
    ).json()["selected"]
    async with session_factory() as session:
        original = await session.get(TrafficSnapshot, uuid.UUID(preset["snapshot_id"]))
        assert original is not None
        created_at = original.created_at

    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={"from": preset["window_start"], "to": preset["window_end"]},
    )
    async with session_factory() as session:
        task = await session.get(AnalyticsTask, uuid.UUID(resp.json()["task_id"]))
        assert task is not None
    await project_performance_range(session_factory, task)

    async with session_factory() as session:
        after = await session.get(TrafficSnapshot, uuid.UUID(preset["snapshot_id"]))
        assert after is not None
        # Left exactly as it was.
        assert after.created_at == created_at


async def test_range_task_rejects_an_over_long_window(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={"from": "2020-01-01", "to": "2026-01-01"},
    )
    assert resp.status_code == 422


async def test_range_task_is_workspace_scoped(
    client: httpx.AsyncClient, seeded: tuple[str, str]
) -> None:
    project_id, _ = seeded
    resp = await client.post(
        f"/api/v1/projects/{project_id}/performance/range",
        params={"from": "2026-06-10", "to": "2026-06-16"},
    )
    task_id = resp.json()["task_id"]
    await client.post("/api/v1/auth/logout")
    await _register(client, f"other-{uuid.uuid4().hex[:8]}@example.com")
    other_project_id, _ = await _create_project(client)
    poll = await client.get(
        f"/api/v1/projects/{other_project_id}/performance/range/{task_id}"
    )
    assert poll.status_code == 404


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------
async def test_dimension_rows_carry_provenance_to_raw_evidence(
    seeded: tuple[str, str], session_factory: async_sessionmaker[AsyncSession]
) -> None:
    _, workspace_id = seeded
    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(PerformanceDimensionStat).where(
                    PerformanceDimensionStat.workspace_id == uuid.UUID(workspace_id)
                )
            )
        ).all()
        assert rows
        for row in rows:
            assert row.source_metric_row_ids
            assert row.source_artifact_ids


@pytest.mark.asyncio
async def test_granularity_selects_the_bucket_size(
    client: httpx.AsyncClient,
) -> None:
    """The chart's bucket size is a request parameter, not a hardcoded day.

    Every refresh already writes the window at day, week AND month
    granularity; the surface simply never read anything but day. The
    response echoes what it resolved, so the client renders the buckets it
    actually got.
    """
    await _register(client, f"granularity-{uuid.uuid4().hex[:8]}@example.com")
    project_id, _ = await _create_project(client)
    endpoint = f"/api/v1/projects/{project_id}/performance"

    default = (await client.get(endpoint)).json()
    assert default["granularity"] == "day"

    for granularity in ("day", "week", "month"):
        resp = await client.get(endpoint, params={"granularity": granularity})
        assert resp.status_code == 200
        assert resp.json()["granularity"] == granularity

    # An unknown bucket size is refused rather than silently served as day.
    bad = await client.get(endpoint, params={"granularity": "fortnight"})
    assert bad.status_code == 422
    # An explicitly EMPTY value is malformed, not absent: only omitting the
    # parameter takes the default.
    empty = await client.get(endpoint, params={"granularity": ""})
    assert empty.status_code == 422
