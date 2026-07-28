"""Dashboard projection + authenticated PDF endpoint coverage."""

from __future__ import annotations

import httpx
import pytest


async def _register(client: httpx.AsyncClient, email: str) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201


def _project_payload() -> dict[str, object]:
    return {
        "name": "Acme",
        "brand_name": "Acme",
        "website_url": "https://acme.com",
        "country_code": "US",
        "language_code": "en",
        "benchmark_mode": "consumer_like",
    }


@pytest.mark.asyncio
async def test_dashboard_empty_projection_and_pdf_are_workspace_scoped(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "dashboard-owner@example.com")
    project = (await client.post("/api/v1/projects", json=_project_payload())).json()
    assert project["default_repetitions"] == 1

    response = await client.get(f"/api/v1/projects/{project['id']}/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["project"]["id"] == project["id"]
    assert body["active_work"] == ["site_health"]
    assert [section["id"] for section in body["analyze"]] == [
        "visibility",
        "answers",
        "traffic",
        "prompts",
        "commerce",
        "runs",
    ]
    health = next(
        section for section in body["improve"] if section["id"] == "site_health"
    )
    assert health["state"] == "running"

    report = await client.get(f"/api/v1/projects/{project['id']}/dashboard/report.pdf")
    assert report.status_code == 200
    assert report.headers["content-type"].startswith("application/pdf")
    assert "attachment; filename=" in report.headers["content-disposition"]
    assert report.content.startswith(b"%PDF")

    client.cookies.clear()
    await _register(client, "dashboard-outsider@example.com")
    dashboard = await client.get(f"/api/v1/projects/{project['id']}/dashboard")
    assert dashboard.status_code == 404
    assert (
        await client.get(f"/api/v1/projects/{project['id']}/dashboard/report.pdf")
    ).status_code == 404
