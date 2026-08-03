"""Component coverage for workspace-scoped BrandProfile CRUD."""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
from sqlalchemy import delete, select

import app.api.projects as projects_api
import app.domain.projects.brand_profile_suggestions as brand_profile_suggestions
from app.connectors.agent.client import AgentNotConfiguredError
from app.connectors.web_evidence.brand_evidence import BrandEvidencePage
from app.domain.projects.brand_evidence import BrandEvidence
from app.models.brand import Brand, BrandProfileSuggestion


class FakeAgent:
    model = "fake-profile-model"
    base_url_host = "agent.test"

    def __init__(self) -> None:
        self.response = json.dumps(
            {
                "description": "Australian family retailer.",
                "positioning": "Value-priced everyday family basics.",
                "products_services": ["Clothing", "Homewares"],
                "target_audience": "Budget-conscious Australian families.",
            }
        )
        self.calls: list[dict[str, str]] = []

    async def complete_json(self, *, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self.response


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    agent = FakeAgent()
    monkeypatch.setattr(projects_api, "DefaultAgentClient", lambda: agent)
    return agent


def _evidence(words: int = 200) -> BrandEvidence:
    """Sufficient stub evidence, so tests never touch the network."""
    return BrandEvidence(
        pages=(
            BrandEvidencePage(
                url="https://acme.example/",
                title="Acme",
                meta_description="Australian family retailer.",
                text=" ".join(["retailer"] * words),
            ),
        )
    )


@pytest.fixture
def fake_evidence(monkeypatch: pytest.MonkeyPatch):
    """Stub the brand-website crawl with sufficient evidence.

    The drafter refuses to run without real page content, so every test that
    exercises a successful draft must supply it. Tests asserting the REFUSAL
    deliberately do not use this fixture.
    """

    async def _collect(website_url: str) -> BrandEvidence:
        return _evidence()

    monkeypatch.setattr(brand_profile_suggestions, "collect_brand_evidence", _collect)


async def _register(client: httpx.AsyncClient, email: str) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201


async def _create_project(client: httpx.AsyncClient, name: str = "Acme") -> dict:
    response = await client.post(
        "/api/v1/projects",
        json={
            "name": f"{name} visibility",
            "brand_name": name,
            "website_url": "https://acme.example",
            "country_code": "AU",
            "language_code": "en-AU",
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_project_creation_provisions_empty_brand_profile(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "profile-create@example.com")
    project = await _create_project(client)

    response = await client.get(f"/api/v1/projects/{project['id']}/brand-profile")

    assert response.status_code == 200
    body = response.json()
    assert body["workspace_id"] == project["workspace_id"]
    assert body["project_id"] == project["id"]
    assert body["description"] == ""
    assert body["products_services"] == []
    assert body["sources"] == {
        "description": None,
        "positioning": None,
        "products_services": None,
        "target_audience": None,
    }


@pytest.mark.asyncio
async def test_manual_upsert_marks_supplied_fields_and_preserves_others(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "profile-upsert@example.com")
    project = await _create_project(client)
    url = f"/api/v1/projects/{project['id']}/brand-profile"

    first = await client.put(
        url,
        json={
            "description": "  A practical retailer.  ",
            "positioning": "Value-priced family basics",
            "products_services": [" Clothing ", "Homewares", "clothing"],
        },
    )
    assert first.status_code == 200
    body = first.json()
    assert body["description"] == "A practical retailer."
    assert body["products_services"] == ["Clothing", "Homewares"]
    assert body["sources"]["description"] == "manual"
    assert body["sources"]["positioning"] == "manual"
    assert body["sources"]["products_services"] == "manual"
    assert body["sources"]["target_audience"] is None

    second = await client.put(
        url,
        json={"target_audience": "Budget-conscious families"},
    )
    assert second.status_code == 200
    updated = second.json()
    assert updated["positioning"] == "Value-priced family basics"
    assert updated["target_audience"] == "Budget-conscious families"
    assert updated["sources"]["target_audience"] == "manual"


@pytest.mark.asyncio
async def test_brand_profile_is_workspace_isolated(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "profile-owner@example.com")
    project = await _create_project(client)
    url = f"/api/v1/projects/{project['id']}/brand-profile"

    client.cookies.clear()
    await _register(client, "profile-other@example.com")

    assert (await client.get(url)).status_code == 404
    assert (
        await client.put(url, json={"description": "cross-tenant write"})
    ).status_code == 404


@pytest.mark.asyncio
async def test_suggestion_is_review_only_then_accepts_with_provenance(
    client: httpx.AsyncClient, fake_agent: FakeAgent, fake_evidence: None
) -> None:
    await _register(client, "profile-suggest@example.com")
    project = await _create_project(client, "Best & Less")
    profile_url = f"/api/v1/projects/{project['id']}/brand-profile"

    suggested = await client.post(
        f"{profile_url}/suggest",
        json={"confirm_send_evidence": True},
    )
    assert suggested.status_code == 201
    artifact = suggested.json()
    assert artifact["model_identity"] == {
        "transport_host": "agent.test",
        "transport_model": "fake-profile-model",
    }
    assert artifact["prompt_template_version"] == "brand-profile-suggest-v2"
    assert artifact["draft"]["positioning"].startswith("Value-priced")
    assert "Best & Less" in fake_agent.calls[0]["user"]

    # Drafting is review-only: it must not mutate the curated profile.
    before_accept = (await client.get(profile_url)).json()
    assert before_accept["positioning"] == ""
    assert before_accept["sources"]["positioning"] is None

    accepted = await client.post(
        f"{profile_url}/suggestions/{artifact['id']}/accept",
        json={
            "accepted_fields": ["positioning", "products_services"],
            "manual_overrides": {"description": "Edited by the user during review."},
        },
    )
    assert accepted.status_code == 200
    body = accepted.json()
    assert body["accepted_fields"] == ["positioning", "products_services"]
    assert body["profile"]["sources"]["description"] == "manual"
    assert body["profile"]["sources"]["positioning"] == "ai_suggested"
    assert body["profile"]["source_artifact_ids"]["description"] is None
    assert body["profile"]["source_artifact_ids"]["positioning"] == artifact["id"]


@pytest.mark.asyncio
async def test_later_ai_acceptance_cannot_overwrite_manual_field(
    client: httpx.AsyncClient, fake_agent: FakeAgent, fake_evidence: None
) -> None:
    await _register(client, "profile-manual-wins@example.com")
    project = await _create_project(client)
    profile_url = f"/api/v1/projects/{project['id']}/brand-profile"
    manual_positioning = "User-defined specialist positioning."
    assert (
        await client.put(profile_url, json={"positioning": manual_positioning})
    ).status_code == 200

    artifact = (
        await client.post(
            f"{profile_url}/suggest",
            json={"confirm_send_evidence": True},
        )
    ).json()
    accepted = await client.post(
        f"{profile_url}/suggestions/{artifact['id']}/accept",
        json={"accepted_fields": ["positioning", "target_audience"]},
    )

    assert accepted.status_code == 200
    body = accepted.json()
    assert body["accepted_fields"] == ["target_audience"]
    assert body["skipped_manual_fields"] == ["positioning"]
    assert body["profile"]["positioning"] == manual_positioning
    assert body["profile"]["sources"]["positioning"] == "manual"


@pytest.mark.asyncio
async def test_suggestion_refuses_when_website_yields_no_evidence(
    client: httpx.AsyncClient, fake_agent: FakeAgent, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The core fix: no readable website means no draft, and no agent call.

    Drafting from the brand NAME alone is what produced fabricated
    positioning (and, downstream, fabricated competitors and prompts) for
    brands with no training-data footprint.
    """
    await _register(client, "profile-no-evidence@example.com")
    project = await _create_project(client, "Cube27")

    async def _collect(website_url: str) -> BrandEvidence:
        return BrandEvidence(failure_reason="website_unreachable")

    monkeypatch.setattr(brand_profile_suggestions, "collect_brand_evidence", _collect)
    response = await client.post(
        f"/api/v1/projects/{project['id']}/brand-profile/suggest",
        json={"confirm_send_evidence": True},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "brand_evidence_unavailable"
    assert detail["reason"] == "website_unreachable"
    # The agent must never have been asked to invent a profile.
    assert fake_agent.calls == []


@pytest.mark.asyncio
async def test_curated_description_allows_suggestion_when_site_is_unreadable(
    client: httpx.AsyncClient, fake_agent: FakeAgent, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _register(client, "profile-curated-fallback@example.com")
    project = await _create_project(client, "Cube27")
    profile_url = f"/api/v1/projects/{project['id']}/brand-profile"
    updated = await client.put(
        profile_url,
        json={"description": "A human-authored cloud data consultancy."},
    )
    assert updated.status_code == 200

    async def _collect(website_url: str) -> BrandEvidence:
        return BrandEvidence(failure_reason="website_unreachable")

    monkeypatch.setattr(brand_profile_suggestions, "collect_brand_evidence", _collect)
    response = await client.post(
        f"{profile_url}/suggest", json={"confirm_send_evidence": True}
    )

    assert response.status_code == 201
    assert (
        "human-authored cloud data consultancy" in fake_agent.calls[0]["user"].lower()
    )
    assert "<brand_website_evidence>" not in fake_agent.calls[0]["user"]


@pytest.mark.asyncio
async def test_suggestion_refuses_when_website_content_is_too_thin(
    client: httpx.AsyncClient, fake_agent: FakeAgent, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A JS-shell homepage clears the fetch but not the grounding floor."""
    await _register(client, "profile-thin@example.com")
    project = await _create_project(client, "Cube27")

    async def _collect(website_url: str) -> BrandEvidence:
        return BrandEvidence(
            pages=(
                BrandEvidencePage(
                    url="https://cube27.example/",
                    title="Cube27",
                    meta_description="",
                    text="Loading",
                ),
            ),
            failure_reason="insufficient_website_content",
        )

    monkeypatch.setattr(brand_profile_suggestions, "collect_brand_evidence", _collect)
    response = await client.post(
        f"/api/v1/projects/{project['id']}/brand-profile/suggest",
        json={"confirm_send_evidence": True},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["reason"] == "insufficient_website_content"
    assert fake_agent.calls == []


@pytest.mark.asyncio
async def test_draft_is_grounded_in_fetched_page_content(
    client: httpx.AsyncClient, fake_agent: FakeAgent, fake_evidence: None, db_session
) -> None:
    """The fetched page text must actually reach the agent, framed as data."""
    await _register(client, "profile-grounded@example.com")
    project = await _create_project(client)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/brand-profile/suggest",
        json={"confirm_send_evidence": True},
    )

    assert response.status_code == 201
    sent = fake_agent.calls[0]["user"]
    assert "<brand_website_evidence>" in sent
    assert "retailer" in sent
    # Page bodies are untrusted input, not instructions.
    assert "never" in sent and "instructions" in sent
    assert response.json()["prompt_template_version"] == "brand-profile-suggest-v2"

    # Provenance of what was actually read is persisted on the artifact, so a
    # draft can be traced back to the pages that grounded it. Not exposed on
    # the response DTO, so assert against the stored row.
    row = (
        await db_session.execute(
            select(BrandProfileSuggestion).where(
                BrandProfileSuggestion.id == uuid.UUID(response.json()["id"])
            )
        )
    ).scalar_one()
    provenance = row.input_context_snapshot["website_evidence_provenance"]
    assert provenance["page_urls"] == ["https://acme.example/"]
    assert provenance["word_count"] == 200
    assert provenance["evidence_version"]


@pytest.mark.asyncio
async def test_suggestion_requires_consent_before_agent_resolution(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _register(client, "profile-consent@example.com")
    project = await _create_project(client)

    def _raise() -> None:
        raise AgentNotConfiguredError("no key")

    monkeypatch.setattr(projects_api, "DefaultAgentClient", _raise)
    response = await client.post(
        f"/api/v1/projects/{project['id']}/brand-profile/suggest",
        json={"confirm_send_evidence": False},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "brand_profile_suggestion_invalid"


@pytest.mark.asyncio
async def test_suggestion_artifact_is_workspace_isolated(
    client: httpx.AsyncClient, fake_agent: FakeAgent, fake_evidence: None
) -> None:
    await _register(client, "profile-artifact-owner@example.com")
    project = await _create_project(client)
    profile_url = f"/api/v1/projects/{project['id']}/brand-profile"
    artifact = (
        await client.post(
            f"{profile_url}/suggest",
            json={"confirm_send_evidence": True},
        )
    ).json()

    client.cookies.clear()
    await _register(client, "profile-artifact-other@example.com")
    response = await client.post(
        f"{profile_url}/suggestions/{artifact['id']}/accept",
        json={"accepted_fields": ["description"]},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_suggestion_aborts_when_brand_is_swapped_during_agent_call(
    client: httpx.AsyncClient,
    fake_evidence: None,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A project whose brand row is replaced mid-draft must NOT persist the
    draft under the new brand id — the evidence was read for the OLD brand."""
    await _register(client, "profile-swap@example.com")
    project = await _create_project(client, "SwapMe")

    class _SwappingAgent:
        model = "fake-profile-model"
        base_url_host = "agent.test"
        calls: list[dict[str, str]] = []

        async def complete_json(self, *, system: str, user: str) -> str:
            self.calls.append({"system": system, "user": user})
            # Swap the brand row DURING the network call: delete the original
            # Brand and attach a fresh row to the same project_id.
            await db_session.execute(
                delete(Brand).where(Brand.project_id == uuid.UUID(project["id"]))
            )
            db_session.add(Brand(project_id=uuid.UUID(project["id"]), name="Surprise"))
            await db_session.commit()
            return json.dumps(
                {
                    "description": "Swapped description.",
                    "positioning": "Swapped positioning.",
                    "products_services": ["Widget"],
                    "target_audience": "Swapped audience.",
                }
            )

    agent = _SwappingAgent()
    monkeypatch.setattr(projects_api, "DefaultAgentClient", lambda: agent)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/brand-profile/suggest",
        json={"confirm_send_evidence": True},
    )

    assert response.status_code == 404
    persisted = await db_session.execute(
        select(BrandProfileSuggestion).where(
            BrandProfileSuggestion.project_id == uuid.UUID(project["id"])
        )
    )
    assert persisted.scalars().all() == []
