"""Component coverage for implementation declarations anchored on Actions."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.actions import TARGET_EARNED_PAGE
from app.core.config.earned_actions import RULE_EARNED_PAGE_ACQUIRE
from app.domain.opportunities.implementation_events import (
    ImplementationConflictError,
    ImplementationDeclaration,
    declare_action_implemented,
)
from app.domain.opportunities.verification import verify_implementation_events
from app.models.agent import AgentChat, AgentOutput, AgentOutputRevision
from app.models.analytics import AnalyticsTask
from app.models.opportunity import (
    Action,
    ActionStatusEvent,
    Opportunity,
    OpportunityImplementationEvent,
    OpportunitySnapshot,
)
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.urls import SiteUrl
from tests.component.opportunity_helpers import (
    Scenario,
    _seed_scenario,
    seed_action_for,
)

pytestmark = pytest.mark.asyncio

_EMAIL = "action-declarations@example.com"
_PUBLISHER_URL = "https://review.example/best-crm-tools"


async def _seed_and_recompute(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[Scenario, Action, SiteUrl]:
    """A recomputed scenario and the Action grouping its Site Health page row."""
    from tests.component.auth_helpers import grant_test_capabilities, register_and_login

    await register_and_login(client, _EMAIL)
    await grant_test_capabilities(_EMAIL)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
    recompute = await client.post(
        f"/api/v1/projects/{scenario.project_id}/opportunities/recompute",
        headers={"X-Workspace-Id": str(scenario.workspace_id)},
    )
    assert recompute.status_code == 200
    async with session_factory() as session:
        opportunity = await session.scalar(
            select(Opportunity).where(
                Opportunity.project_id == scenario.project_id,
                Opportunity.opportunity_type == "site",
                Opportunity.superseded_at.is_(None),
            )
        )
        assert opportunity is not None and opportunity.action_id is not None
        action = await session.get(Action, opportunity.action_id)
        site_url = await session.scalar(
            select(SiteUrl).where(
                SiteUrl.project_id == scenario.project_id,
                SiteUrl.normalized_url == opportunity.target_url,
            )
        )
        assert action is not None and site_url is not None
        session.expunge_all()
    return scenario, action, site_url


def _headers(scenario: Scenario, key: str | None = None) -> dict[str, str]:
    headers = {"X-Workspace-Id": str(scenario.workspace_id)}
    if key:
        headers["Idempotency-Key"] = key
    return headers


async def _seed_revision(
    session_factory: async_sessionmaker[AsyncSession],
    scenario: Scenario,
    *,
    action_id: uuid.UUID | None,
    phase: str,
) -> uuid.UUID:
    """One chat output revision, attached to ``action_id`` when given."""
    async with session_factory() as session:
        scope = {
            "workspace_id": scenario.workspace_id,
            "project_id": scenario.project_id,
        }
        chat = AgentChat(**scope, action_id=action_id, title="Page edits")
        session.add(chat)
        await session.flush()
        output = AgentOutput(
            **scope,
            chat_id=chat.id,
            action_id=action_id,
            kind="page_edits",
            skill_id="gsc_optimize",
            phase=phase,
        )
        session.add(output)
        await session.flush()
        revision = AgentOutputRevision(
            **scope,
            output_id=output.id,
            number=1,
            author="run",
            phase=phase,
            title="Page edits",
            body="Rewrite the title.",
        )
        session.add(revision)
        await session.commit()
        return revision.id


async def test_declaring_an_action_freezes_its_checks_and_status(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, action, site_url = await _seed_and_recompute(client, session_factory)
    revision_id = await _seed_revision(
        session_factory, scenario, action_id=action.id, phase="draft"
    )
    url = f"/api/v1/actions/{action.id}/declaration"
    payload = {
        "output_revision_id": str(revision_id),
        "declared_implemented_at": datetime.now(UTC).isoformat(),
    }

    created = await client.post(url, headers=_headers(scenario, "once"), json=payload)
    replay = await client.post(url, headers=_headers(scenario, "once"), json=payload)
    second = await client.post(url, headers=_headers(scenario, "twice"), json=payload)

    assert created.status_code == 201, created.text
    assert replay.status_code == 200
    assert replay.json() == created.json()
    # One declaration per Action: a second one finds it no longer open.
    assert second.status_code == 409
    body = created.json()
    assert body["output_revision_id"] == str(revision_id)
    assert body["target_site_url_ids"] == [str(site_url.id)]
    assert body["member_opportunity_ids"] == action.member_opportunity_ids
    # Server-owned: the member rules' checks, not the caller's.
    assert {check["kind"] for check in body["expected_checks"]} == {"site_rule"}
    assert body["state"] == "declared"
    # Crawls run when someone starts one: nothing to wait for by date.
    assert [(leg["leg"], leg["state"]) for leg in body["legs"]] == [
        ("next_crawl", "not_scheduled")
    ]
    detail = await client.get(
        f"/api/v1/actions/{action.id}", headers=_headers(scenario)
    )
    assert detail.json()["status"] == "implemented"
    assert detail.json()["declaration"]["id"] == body["id"]
    async with session_factory() as session:
        events = (
            await session.scalars(
                select(ActionStatusEvent.next_status).where(
                    ActionStatusEvent.action_id == action.id
                )
            )
        ).all()
    assert list(events) == ["implemented"]


async def test_a_declaration_names_only_this_actions_shippable_revision(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, action, _site_url = await _seed_and_recompute(client, session_factory)
    foreign = await _seed_revision(
        session_factory, scenario, action_id=None, phase="draft"
    )
    outline = await _seed_revision(
        session_factory, scenario, action_id=action.id, phase="outline"
    )
    url = f"/api/v1/actions/{action.id}/declaration"
    now = datetime.now(UTC).isoformat()

    for key, revision in (("foreign", foreign), ("outline", outline)):
        response = await client.post(
            url,
            headers=_headers(scenario, key),
            json={"output_revision_id": str(revision), "declared_implemented_at": now},
        )
        assert response.status_code == 409, key
        assert response.json()["error"]["code"] == "implementation_target_conflict"
    # A refused declaration leaves the Action open.
    detail = await client.get(
        f"/api/v1/actions/{action.id}", headers=_headers(scenario)
    )
    assert detail.json()["status"] == "in_progress"
    assert detail.json()["declaration"] is None


async def test_caller_supplied_checks_and_targets_are_rejected(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verification intent and targets are server-owned.

    A caller that could name its own expectation could declare itself verified
    against one it knows already holds.
    """
    scenario, action, site_url = await _seed_and_recompute(client, session_factory)

    response = await client.post(
        f"/api/v1/actions/{action.id}/declaration",
        headers=_headers(scenario, "caller-supplied"),
        json={
            "declared_implemented_at": datetime.now(UTC).isoformat(),
            "target_site_url_ids": [str(site_url.id)],
            "expected_checks": [{"kind": "visibility_metric"}],
        },
    )

    assert response.status_code == 422


async def test_another_workspaces_action_cannot_be_declared(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, _action, _site_url = await _seed_and_recompute(client, session_factory)
    async with session_factory() as session:
        foreign = await _seed_scenario(session)
        foreign_opportunity = Opportunity(
            workspace_id=foreign.workspace_id,
            project_id=foreign.project_id,
            rule_id="thin_content",
            opportunity_type="site",
            severity="low",
            title="Thin page",
            target_key="foreign",
            target_url="https://acme.test/a",
        )
        session.add(foreign_opportunity)
        await session.commit()
        foreign_action_id = await seed_action_for(
            session, foreign_opportunity, target_kind="page"
        )

    response = await client.post(
        f"/api/v1/actions/{foreign_action_id}/declaration",
        headers=_headers(scenario, "foreign-action"),
        json={"declared_implemented_at": datetime.now(UTC).isoformat()},
    )

    assert response.status_code == 404


async def test_concurrent_declarations_store_exactly_one(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, action, _site_url = await _seed_and_recompute(client, session_factory)
    declared_at = datetime.now(UTC)

    async def declare(key: str) -> str:
        async with session_factory() as session:
            try:
                await declare_action_implemented(
                    session,
                    workspace_id=scenario.workspace_id,
                    actor_user_id=scenario.user_id,
                    idempotency_key=key,
                    declaration=ImplementationDeclaration(
                        action_id=action.id,
                        output_revision_id=None,
                        declared_implemented_at=declared_at,
                    ),
                )
                await session.commit()
            except ImplementationConflictError:
                await session.rollback()
                return "conflict"
            return "declared"

    outcomes = await asyncio.gather(declare("first"), declare("second"))

    assert sorted(outcomes) == ["conflict", "declared"]
    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(OpportunityImplementationEvent).where(
                    OpportunityImplementationEvent.action_id == action.id
                )
            )
        ).all()
    assert len(rows) == 1


async def test_observations_derive_measuring_and_done(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The verifier appends observations; the Action status is read from them."""
    scenario, action, site_url = await _seed_and_recompute(client, session_factory)
    async with session_factory() as session:
        crawl = await session.get(SiteCrawl, scenario.crawl_id)
        assert crawl is not None and crawl.completed_at is not None
        boundary = crawl.completed_at - timedelta(minutes=1)
        snapshot_id = await session.scalar(
            select(OpportunitySnapshot.id).where(
                OpportunitySnapshot.project_id == scenario.project_id
            )
        )
        assert snapshot_id is not None
        rule_id = (
            await session.scalar(
                select(Opportunity.evidence).where(
                    Opportunity.id == uuid.UUID(action.member_opportunity_ids[0])
                )
            )
        )["issue_rule_id"]

    # Expected checks are server-owned, so differing check OUTCOMES cannot be
    # driven through the API. Seed one implemented Action per declaration:
    # what is under test is how observations project onto the Action.
    async def declare(key: str, checks: list[dict]) -> uuid.UUID:
        async with session_factory() as session:
            declared = Action(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                group_key=f"test:{key}",
                target_kind="page",
                target_label=key,
                origin="evidence",
                status="implemented",
            )
            session.add(declared)
            await session.flush()
            session.add(
                OpportunityImplementationEvent(
                    workspace_id=scenario.workspace_id,
                    project_id=scenario.project_id,
                    action_id=declared.id,
                    opportunity_snapshot_id=snapshot_id,
                    target_site_url_ids=[str(site_url.id)],
                    declared_implemented_at=boundary,
                    expected_checks=checks,
                    actor_user_id=scenario.user_id,
                    idempotency_key=key,
                    request_fingerprint=key,
                )
            )
            await session.commit()
            return declared.id

    site_check = {
        "kind": "site_rule",
        "target_site_url_id": str(site_url.id),
        "rule_id": rule_id,
    }
    traffic_check = {
        "kind": "traffic_metric",
        "metric": "clicks",
        "direction": "increase",
        "expected_value": 1,
    }
    awaiting = await declare("awaiting", [traffic_check])
    verified = await declare("verified", [{**site_check, "expected_outcome": "fail"}])
    contradicted = await declare(
        "contradicted", [{**site_check, "expected_outcome": "pass"}]
    )
    partial = await declare(
        "partial", [{**site_check, "expected_outcome": "fail"}, traffic_check]
    )

    await verify_implementation_events(
        session_factory,
        AnalyticsTask(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            task_kind="opportunity_verification",
            payload={
                "trigger_kind": "site_crawl",
                "trigger_id": str(scenario.crawl_id),
            },
            idempotency_key="test-verifier",
        ),
    )

    async def read(action_id: uuid.UUID) -> dict:
        response = await client.get(
            f"/api/v1/actions/{action_id}", headers=_headers(scenario)
        )
        assert response.status_code == 200
        return response.json()

    assert (await read(awaiting))["status"] == "implemented"
    assert (await read(verified))["status"] == "done"
    assert (await read(contradicted))["status"] == "measuring"
    partial_detail = await read(partial)
    assert partial_detail["status"] == "measuring"
    declaration = partial_detail["declaration"]
    assert declaration["state"] == "observed"
    assert declaration["limitations"] == [
        "traffic_metric: unavailable from a site crawl"
    ]
    legs = {leg["leg"]: leg for leg in declaration["legs"]}
    assert legs["next_crawl"]["state"] == "observed"
    # The window after an old boundary has closed with nothing synced.
    assert legs["next_search_console_window"]["state"] in {"waiting", "sync_needed"}
    observation = declaration["verification_events"][0]
    assert observation["crawl_id"] == str(scenario.crawl_id)
    assert "caused" in observation["result"]["causality_notice"]


async def _seed_earned_page_action(
    session_factory: async_sessionmaker[AsyncSession], scenario: Scenario
) -> uuid.UUID:
    """One page-keyed earned Opportunity, grouped into its Action."""
    async with session_factory() as session:
        row = Opportunity(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            rule_id=RULE_EARNED_PAGE_ACQUIRE,
            opportunity_type="visibility",
            severity="high",
            priority_score=30.0,
            title="Competitors listed on a cited page you are absent from",
            remediation="Ask the publisher to include you.",
            target_key=f"earned-page:{'a' * 64}",
            target_url=_PUBLISHER_URL,
            evidence={},
            source_analysis_ids=[],
            source_issue_ids=[],
            source_metric_ids=[],
            analyzer_version="opp-analyzer-2",
            rule_version="opp-rules-2",
            formula_version="opp-formula-2",
        )
        session.add(row)
        await session.commit()
        return await seed_action_for(session, row, target_kind=TARGET_EARNED_PAGE)


async def test_an_earned_action_declares_against_the_publisher_page(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A third-party target never routes through the owned-page resolver."""
    scenario, _action, _site_url = await _seed_and_recompute(client, session_factory)
    action_id = await _seed_earned_page_action(session_factory, scenario)

    response = await client.post(
        f"/api/v1/actions/{action_id}/declaration",
        headers=_headers(scenario, "external-placement"),
        json={"declared_implemented_at": datetime.now(UTC).isoformat()},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["target_external_url"] == _PUBLISHER_URL
    assert body["target_site_url_ids"] == []
    # A PLACEMENT check, not the baseline-anchored visibility one: a listing
    # going live and the project score moving are different observations.
    assert [check["kind"] for check in body["expected_checks"]] == ["placement"]
    assert body["expected_checks"][0]["rule_id"] == RULE_EARNED_PAGE_ACQUIRE
    assert [leg["leg"] for leg in body["legs"]] == ["placement_recheck"]


async def test_the_database_refuses_a_row_claiming_both_target_kinds(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An owned change and an external placement verify against different
    evidence, so a row claiming both would report two outcomes as one."""
    scenario, action, site_url = await _seed_and_recompute(client, session_factory)
    async with session_factory() as session:
        snapshot_id = await session.scalar(
            select(OpportunitySnapshot.id).where(
                OpportunitySnapshot.project_id == scenario.project_id
            )
        )
        session.add(
            OpportunityImplementationEvent(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                action_id=action.id,
                opportunity_snapshot_id=snapshot_id,
                target_site_url_ids=[str(site_url.id)],
                target_external_url=_PUBLISHER_URL,
                declared_implemented_at=datetime.now(UTC),
                expected_checks=[],
                actor_user_id=scenario.user_id,
                idempotency_key="both-targets",
                request_fingerprint="f" * 64,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
