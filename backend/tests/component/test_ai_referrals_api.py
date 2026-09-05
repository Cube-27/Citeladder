"""Component contracts for the focused persisted AI Referrals endpoint."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import httpx
import pytest

from app.core.config.analytics import ANALYTICS_DEFAULT_GRANULARITY
from app.models.analytics import AiReferralsSnapshot

WINDOW = (date(2026, 7, 20), date(2026, 7, 22))


async def _register(client: httpx.AsyncClient, email: str) -> None:
    assert (
        await client.post(
            "/api/v1/auth/register", json={"email": email, "password": "password123"}
        )
    ).status_code == 202
    assert (
        await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "password123"}
        )
    ).status_code == 200


async def _create_project(client: httpx.AsyncClient) -> tuple[str, str]:
    response = await client.post("/api/v1/projects", json={"name": "AI Referrals"})
    assert response.status_code == 201
    body = response.json()
    return body["id"], body["workspace_id"]


@pytest.mark.asyncio
async def test_ai_referrals_requires_auth(
    client: httpx.AsyncClient,
) -> None:
    project_id = uuid.uuid4()
    endpoint = f"/api/v1/projects/{project_id}/ai-referrals"
    assert (await client.get(endpoint)).status_code == 401


@pytest.mark.asyncio
async def test_ai_referrals_empty_projection_and_workspace_isolation(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "ai-referrals-owner@example.com")
    project_id, _ = await _create_project(client)
    endpoint = f"/api/v1/projects/{project_id}/ai-referrals"

    response = await client.get(endpoint)
    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == project_id
    assert body["referral_volume"] == []
    assert body["referral_share"] == []
    assert body["sources"] == []

    client.cookies.clear()
    await _register(client, "ai-referrals-outsider@example.com")
    assert (await client.get(endpoint)).status_code == 404


async def _seed_snapshot(
    session_factory,
    *,
    project_id: str,
    workspace_id: str,
    window_start: date,
    window_end: date,
    sessions: int,
    preset_window_days: int | None = None,
) -> None:
    """One persisted AI Referrals snapshot for an exact window.

    ``preset_window_days`` marks the row as the refresh's preset family would:
    a preset read matches that marker, not the window's length, so a row
    seeded without it is a sync-window snapshot and answers no preset.
    """
    async with session_factory() as session:
        session.add(
            AiReferralsSnapshot(
                workspace_id=uuid.UUID(workspace_id),
                project_id=uuid.UUID(project_id),
                window_start=window_start,
                window_end=window_end,
                granularity=ANALYTICS_DEFAULT_GRANULARITY,
                preset_window_days=preset_window_days,
                metrics={
                    "referral_volume": [
                        {"date": window_end.isoformat(), "value": sessions}
                    ],
                    "referral_share": [],
                    "sources": [{"ai_source": "chatgpt", "sessions": sessions}],
                },
                source_classification_ids=[],
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_range_preset_resolves_a_snapshot_the_client_clock_would_miss(
    client: httpx.AsyncClient,
    session_factory,
) -> None:
    """Defect 4: a preset resolves its MARKED snapshot, not client dates.

    Provider data lags, so the persisted window ends well before today. The
    old contract asked for an exact ``from``/``to`` anchored on the browser's
    today, which no sync window ever matches — every bounded preset rendered
    empty. Seeded here at a deliberately stale end date to prove the preset
    still finds it.
    """
    await _register(client, "ai-referrals-preset@example.com")
    project_id, workspace_id = await _create_project(client)
    stale_end = date.today() - timedelta(days=9)
    stale_start = stale_end - timedelta(days=29)  # inclusive 30-day window
    await _seed_snapshot(
        session_factory,
        project_id=project_id,
        workspace_id=workspace_id,
        window_start=stale_start,
        window_end=stale_end,
        sessions=42,
        preset_window_days=30,
    )
    endpoint = f"/api/v1/projects/{project_id}/ai-referrals"

    body = (await client.get(endpoint, params={"range": "30d"})).json()
    assert body["window_start"] == stale_start.isoformat()
    assert body["window_end"] == stale_end.isoformat()
    assert body["sources"] == [{"ai_source": "chatgpt", "sessions": 42, "share": None}]

    # The window the OLD client would have sent still matches nothing — the
    # preset works because the server resolves it, not because the window
    # widened.
    today = date.today()
    stale = await client.get(
        endpoint,
        params={
            "from": (today - timedelta(days=29)).isoformat(),
            "to": today.isoformat(),
        },
    )
    assert stale.json()["sources"] == []


@pytest.mark.asyncio
async def test_range_preset_matches_only_its_own_length(
    client: httpx.AsyncClient,
    session_factory,
) -> None:
    """A 90-day preset must not resolve a 30-day snapshot.

    The preset's identity is the MARKER the refresh wrote, so another
    preset's window is a DIFFERENT range — reporting it under "Last 90 days"
    would misdescribe the evidence rather than admit the range is
    unprojected.
    """
    await _register(client, "ai-referrals-preset-length@example.com")
    project_id, workspace_id = await _create_project(client)
    end = date.today() - timedelta(days=3)
    await _seed_snapshot(
        session_factory,
        project_id=project_id,
        workspace_id=workspace_id,
        window_start=end - timedelta(days=29),
        window_end=end,
        sessions=7,
        preset_window_days=30,
    )
    endpoint = f"/api/v1/projects/{project_id}/ai-referrals"

    assert (await client.get(endpoint, params={"range": "30d"})).json()["sources"] != []
    assert (await client.get(endpoint, params={"range": "90d"})).json()["sources"] == []
    assert (await client.get(endpoint, params={"range": "1y"})).json()["sources"] == []


@pytest.mark.asyncio
async def test_unknown_range_is_422(client: httpx.AsyncClient) -> None:
    await _register(client, "ai-referrals-bad-range@example.com")
    project_id, _ = await _create_project(client)
    response = await client.get(
        f"/api/v1/projects/{project_id}/ai-referrals", params={"range": "7d"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_unmarked_window_of_preset_length_does_not_answer_the_preset(
    client: httpx.AsyncClient,
    session_factory,
) -> None:
    """A sync window that happens to be 30 days long is not "Last 30 days".

    Matching on inclusive LENGTH alone could not tell the two apart, so a
    sync-run window of the right size silently answered a preset it was never
    derived for. Only the refresh's preset family writes
    ``preset_window_days``, and that marker is what the read matches.
    """
    await _register(client, "ai-referrals-unmarked@example.com")
    project_id, workspace_id = await _create_project(client)
    end = date.today() - timedelta(days=3)
    await _seed_snapshot(
        session_factory,
        project_id=project_id,
        workspace_id=workspace_id,
        window_start=end - timedelta(days=29),
        window_end=end,
        sessions=11,
        # No marker: this is a sync-window snapshot, exactly 30 days wide.
        preset_window_days=None,
    )
    endpoint = f"/api/v1/projects/{project_id}/ai-referrals"

    assert (await client.get(endpoint, params={"range": "30d"})).json()["sources"] == []
    # It is still readable as the exact window it actually is.
    exact = await client.get(
        endpoint,
        params={
            "from": (end - timedelta(days=29)).isoformat(),
            "to": end.isoformat(),
        },
    )
    assert exact.json()["sources"] != []
