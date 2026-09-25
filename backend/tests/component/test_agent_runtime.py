"""The Agent runtime end to end: admission, the bounded loop, outputs, funding.

Runs the real worker, runtime, tool catalog and persistence against Postgres.
Only the model is scripted: a fake gateway returns a fixed sequence of JSON
steps and records what it was asked, so no provider is ever contacted.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.agent.gateway import ModelResult
from app.core.config.agent import default_agent_settings
from app.core.config.app_models import APP_FEATURE_AGENT
from app.core.config.entitlements import KEY_AI_CREDITS
from app.core.security import encrypt_secret
from app.domain.agent import model_calls, service
from app.domain.billing.accounts import billing_account_id_for
from app.domain.entitlements.ledger import consumable_usage
from app.models.agent import (
    AgentModelAttempt,
    AgentOutputRevision,
    AgentRun,
    AgentToolAttempt,
)
from app.models.opportunity import Action
from app.models.project import Project
from app.models.provider import ProviderAppRoute, ProviderConnection
from app.models.workspace import WorkspaceMember
from app.workers.agent_worker import AgentWorker
from tests.component.auth_helpers import grant_test_capabilities, register_and_login

_SITE = "https://acme.example"
_PAGE = f"{_SITE}/pricing"
_INVENTED_REF = "citeladder://opportunity/00000000-0000-4000-8000-00000000dead"


class ScriptedGateway:
    """A model that answers with a fixed list of steps, in order."""

    def __init__(self, steps: list[dict[str, Any]]) -> None:
        self._steps = iter(steps)
        self.prompts: list[tuple[str, str]] = []

    adapter_name = "scripted"
    model = "fixture-model"
    base_url_host = "provider.invalid"

    async def complete_structured(
        self, *, system: str, user: str, schema_name: str, schema: dict[str, Any]
    ) -> ModelResult:
        del schema_name, schema
        self.prompts.append((system, user))
        step = next(self._steps)
        return ModelResult(
            content=json.dumps(_full_step(step)),
            provider_adapter=self.adapter_name,
            endpoint_host=self.base_url_host,
            requested_model=self.model,
            returned_model=self.model,
            finish_status="stop",
            usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )

    @staticmethod
    def classify_error(exc: Exception) -> dict[str, Any]:
        return {"code": "provider_error", "retryable": False}


def _full_step(step: dict[str, Any]) -> dict[str, Any]:
    empty = {
        "skill_id": None,
        "tool": None,
        "arguments": None,
        "reply": None,
        "evidence": None,
        "output": None,
    }
    return {**empty, **step}


def _output(
    body: str, *, phase: str = "final", target: str | None = _PAGE
) -> dict[str, Any]:
    return {
        "title": "Pricing page edits",
        "body": body,
        "phase": phase,
        "target_kind": "page" if target else None,
        "target": target,
        "format_id": None,
    }


def _worker(
    session_factory: async_sessionmaker[AsyncSession], gateway: ScriptedGateway
) -> AgentWorker:
    return AgentWorker(
        session_factory=session_factory,
        owner="agent-w",
        gateway_for=lambda _route: gateway,
    )


async def _project(client: httpx.AsyncClient, email: str) -> str:
    await register_and_login(client, email)
    await grant_test_capabilities(email)
    response = await client.post(
        "/api/v1/projects",
        json={
            "name": "Acme",
            "brand_name": "Acme",
            "website_url": _SITE,
            "country_code": "AU",
            "language_code": "en-AU",
            "benchmark_mode": "consumer_like",
            "default_repetitions": 1,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _verified_route(
    session_factory: async_sessionmaker[AsyncSession], project_id: str
) -> None:
    async with session_factory() as session:
        project = await session.get(Project, uuid.UUID(project_id))
        assert project is not None
        connection = ProviderConnection(
            workspace_id=project.workspace_id,
            label="Agent fixture",
            transport_provider="openai",
            base_url="https://provider.invalid/v1/chat/completions",
            api_key_encrypted=encrypt_secret("fixture-secret"),
            active=True,
        )
        session.add(connection)
        await session.flush()
        route = ProviderAppRoute(
            workspace_id=project.workspace_id,
            connection_id=connection.id,
            feature=APP_FEATURE_AGENT,
            model="fixture-model",
            api_base_url=connection.base_url,
            active=True,
        )
        session.add(route)
        await session.flush()
        route.probed_revision = route.revision
        route.probed_credential_revision = connection.credential_revision
        route.probed_at = datetime.now(UTC)
        await session.commit()


async def _start(
    client: httpx.AsyncClient, project_id: str, message: str, **extra: Any
) -> str:
    response = await client.post(
        f"/api/v1/projects/{project_id}/agent/chats",
        json={"message": message, **extra},
    )
    assert response.status_code == 202, response.text
    return response.json()["chat_id"]


async def _detail(client: httpx.AsyncClient, chat_id: str) -> dict[str, Any]:
    response = await client.get(f"/api/v1/agent/chats/{chat_id}")
    assert response.status_code == 200, response.text
    return response.json()


async def test_a_turn_reads_evidence_and_saves_an_output_attached_to_its_page(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-turn@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(client, project_id, "Improve our pricing page snippet.")
    gateway = ScriptedGateway(
        [
            {"action": "select_skill", "skill_id": "gsc_optimize"},
            {"action": "call_tool", "tool": "read_integration_status", "arguments": {}},
            {
                "action": "respond",
                "reply": f"Snippet edits per {_INVENTED_REF}.",
                "evidence": [_INVENTED_REF],
                "output": _output(f"## Edit 1\n\nNew title ({_INVENTED_REF})."),
            },
        ]
    )

    assert await _worker(session_factory, gateway).run_once() == 1

    detail = await _detail(client, chat_id)
    assert [message["role"] for message in detail["messages"]] == ["user", "agent"]
    reply = detail["messages"][1]
    assert reply["skill_id"] == "gsc_optimize"
    # A reference no tool returned is never cited: not in the evidence list,
    # and not in the visible reply or the saved output either.
    assert reply["evidence_refs"] == []
    assert _INVENTED_REF not in reply["content"]
    assert _INVENTED_REF not in detail["output"]["latest_revision"]["body"]
    assert [step["kind"] for step in reply["steps"]] == ["skill", "tool"]
    assert detail["latest_run"]["status"] == "succeeded"
    output = detail["output"]
    assert (output["kind"], output["phase"], output["target_kind"]) == (
        "page_edits",
        "final",
        "page",
    )
    assert output["latest_revision"]["number"] == 1
    # The tool ran inside the chat's project; the system prompt carried the
    # chosen methodology only after the skill was selected.
    assert "# Skill:" not in gateway.prompts[0][0]
    assert "# Skill: Search Console optimization" in gateway.prompts[1][0]
    async with session_factory() as session:
        action = await session.get(Action, uuid.UUID(output["action_id"]))
        attempts = (await session.scalars(select(AgentToolAttempt))).all()
        model_attempts = (await session.scalars(select(AgentModelAttempt))).all()
    assert action is not None
    assert (action.origin, action.target_url) == ("agent", _PAGE)
    assert [(row.tool_name, row.status) for row in attempts] == [
        ("read_integration_status", "completed")
    ]
    assert {row.settlement_status for row in model_attempts} == {"zero_debit"}
    # The Action reads in progress because a linked chat has an output; the
    # Agent stored no status, and the chat is listed as the Action's work.
    action_view = await client.get(f"/api/v1/actions/{output['action_id']}")
    assert action_view.json()["status"] == "in_progress"
    assert action.status == "open"
    linked = await client.get(
        f"/api/v1/projects/{project_id}/agent/chats",
        params={"action_id": output["action_id"]},
    )
    assert [(item["id"], item["target_label"]) for item in linked.json()["items"]] == [
        (chat_id, _PAGE)
    ]


async def test_a_follow_up_revises_the_users_edit_instead_of_starting_over(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-revise@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(client, project_id, "Draft a plan.", skill_id="growth_plan")
    first = ScriptedGateway(
        [
            {
                "action": "respond",
                "reply": "Plan ready.",
                "output": _output("Plan v1", target=None),
            }
        ]
    )
    await _worker(session_factory, first).run_once()
    revision_1 = (await _detail(client, chat_id))["output"]["latest_revision"]

    edited = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/revisions",
        json={
            "base_revision_id": revision_1["id"],
            "title": "Plan",
            "body": "Plan v1 (edited)",
        },
    )
    assert edited.status_code == 201, edited.text
    stale = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/revisions",
        json={"base_revision_id": revision_1["id"], "title": "Plan", "body": "lost"},
    )
    assert stale.status_code == 409

    sent = await client.post(
        f"/api/v1/agent/chats/{chat_id}/messages", json={"message": "Make it shorter."}
    )
    assert sent.status_code == 202, sent.text
    # While the turn is queued the output is frozen, so the run can never
    # finish on top of an edit it did not read.
    user_edit = edited.json()
    during_run = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/revisions",
        json={"base_revision_id": user_edit["id"], "title": "Plan", "body": "racing"},
    )
    assert during_run.status_code == 409
    assert during_run.json()["error"]["code"] == "agent_run_active"
    second = ScriptedGateway(
        [
            {
                "action": "respond",
                "reply": "Shorter.",
                "output": _output("Plan v2", target=None),
            }
        ]
    )
    await _worker(session_factory, second).run_once()

    # The model saw the user's edit as the current output, and the new
    # revision's parent is that edit.
    assert "Plan v1 (edited)" in second.prompts[0][1]
    history = await client.get(f"/api/v1/agent/chats/{chat_id}/output/revisions")
    items = history.json()["items"]
    assert [(item["number"], item["author"]) for item in items] == [
        (3, "agent"),
        (2, "user"),
        (1, "agent"),
    ]
    assert items[0]["parent_revision_id"] == items[1]["id"]

    # The chat owns a plan; switching it to long-form content (which would
    # otherwise skip outline approval) needs a new chat.
    switched = await client.post(
        f"/api/v1/agent/chats/{chat_id}/messages",
        json={"message": "Now write the article.", "skill_id": "content_create"},
    )
    assert switched.status_code == 409
    assert switched.json()["error"]["code"] == "agent_skill_kind_conflict"


async def test_long_form_content_is_outlined_before_an_approved_draft(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-outline@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(
        client,
        project_id,
        "Write a school-uniform checklist.",
        skill_id="content_create",
    )
    # The model tries to skip straight to a draft; the runtime keeps it an outline.
    await _worker(
        session_factory,
        ScriptedGateway(
            [
                {
                    "action": "respond",
                    "reply": "Outline.",
                    "output": _output("1. A\n2. B", phase="draft", target=None),
                }
            ]
        ),
    ).run_once()
    outline = (await _detail(client, chat_id))["output"]
    assert outline["phase"] == "outline"

    refused = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/approve-outline",
        json={"revision_id": str(uuid.uuid4())},
    )
    assert refused.status_code == 409
    approved = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/approve-outline",
        json={"revision_id": outline["latest_revision"]["id"]},
    )
    assert approved.status_code == 202, approved.text
    assert approved.json()["run"]["mode"] == "draft_from_outline"
    await _worker(
        session_factory,
        ScriptedGateway(
            [
                {
                    "action": "respond",
                    "reply": "Draft.",
                    "output": _output("# Checklist", phase="draft", target=None),
                }
            ]
        ),
    ).run_once()

    output = (await _detail(client, chat_id))["output"]
    assert (output["phase"], output["latest_revision"]["number"]) == ("draft", 2)
    async with session_factory() as session:
        first = await session.scalar(
            select(AgentOutputRevision).where(AgentOutputRevision.number == 1)
        )
    assert first is not None
    assert first.approved_at is not None


async def test_the_turn_stops_at_its_step_budget_without_saving(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(service, "AGENT_MAX_STEPS", 2)
    project_id = await _project(client, "agent-budget@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(
        client, project_id, "Investigate everything.", skill_id="growth_plan"
    )
    gateway = ScriptedGateway(
        [
            {"action": "call_tool", "tool": "read_site_health", "arguments": {}},
            {"action": "call_tool", "tool": "read_demand", "arguments": {}},
        ]
    )

    await _worker(session_factory, gateway).run_once()

    detail = await _detail(client, chat_id)
    assert detail["latest_run"]["status"] == "failed"
    assert detail["latest_run"]["error_code"] == "stopped_at_limit"
    assert detail["output"] is None
    assert detail["messages"][-1]["role"] == "agent"
    async with session_factory() as session:
        statuses = [
            row.status
            for row in (
                await session.scalars(
                    select(AgentToolAttempt).order_by(AgentToolAttempt.ordinal)
                )
            ).all()
        ]
    # The last step may not spend a tool call; the budget forces a response.
    assert statuses == ["unavailable", "refused"]


async def test_the_agent_cannot_choose_its_project_or_an_unknown_tool(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-refuse@example.com")
    await _verified_route(session_factory, project_id)
    await _start(client, project_id, "Show me another project.", skill_id="growth_plan")
    gateway = ScriptedGateway(
        [
            {
                "action": "call_tool",
                "tool": "read_demand",
                "arguments": {"project_id": str(uuid.uuid4())},
            },
            {"action": "call_tool", "tool": "update_prompts", "arguments": {}},
            {"action": "respond", "reply": "I can only read this project."},
        ]
    )

    await _worker(session_factory, gateway).run_once()

    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(AgentToolAttempt).order_by(AgentToolAttempt.ordinal)
            )
        ).all()
    assert [(row.tool_name, row.status) for row in rows] == [
        ("read_demand", "refused"),
        ("update_prompts", "refused"),
    ]


async def test_admission_refuses_a_second_turn_while_one_is_running(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-active@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(client, project_id, "First question.")

    second = await client.post(
        f"/api/v1/agent/chats/{chat_id}/messages", json={"message": "Second question."}
    )

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "agent_run_active"


async def test_a_repeated_idempotency_key_replays_the_same_turn(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-idem@example.com")
    await _verified_route(session_factory, project_id)
    headers = {"Idempotency-Key": "start-1"}
    body = {"message": "What should we focus on?"}
    url = f"/api/v1/projects/{project_id}/agent/chats"

    first = await client.post(url, json=body, headers=headers)
    replay = await client.post(url, json=body, headers=headers)
    changed = await client.post(
        url, json={"message": "Something else entirely."}, headers=headers
    )

    assert first.status_code == replay.status_code == 202
    assert first.json()["run"]["id"] == replay.json()["run"]["id"]
    # The key is bound to the request, not just to the workspace.
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "agent_idempotency_conflict"


async def test_admission_needs_a_funding_route(client: httpx.AsyncClient) -> None:
    project_id = await _project(client, "agent-unfunded@example.com")

    response = await client.post(
        f"/api/v1/projects/{project_id}/agent/chats", json={"message": "Hello"}
    )

    # No customer route and no configured platform model: refused, never queued.
    assert response.status_code == 402
    assert response.json()["error"]["code"] == "agent_funding_unavailable"


async def test_chats_are_invisible_to_another_workspace(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-owner@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(client, project_id, "Private question.")

    await _project(client, "agent-intruder@example.com")
    response = await client.get(f"/api/v1/agent/chats/{chat_id}")

    assert response.status_code == 404


class CancellingGateway(ScriptedGateway):
    """Answers its first step, but the user cancels the run while it thinks."""

    def __init__(self, steps: list[dict[str, Any]], cancel: Any) -> None:
        super().__init__(steps)
        self._cancel = cancel

    async def complete_structured(self, **kwargs: Any) -> ModelResult:
        result = await super().complete_structured(**kwargs)
        await self._cancel()
        return result


async def test_a_cancelled_turn_stops_before_its_next_step_and_saves_nothing(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-cancel@example.com")
    await _verified_route(session_factory, project_id)
    started = await client.post(
        f"/api/v1/projects/{project_id}/agent/chats",
        json={"message": "Audit everything.", "skill_id": "growth_plan"},
    )
    chat_id, run_id = started.json()["chat_id"], started.json()["run"]["id"]

    async def cancel() -> None:
        response = await client.post(
            f"/api/v1/agent/chats/{chat_id}/runs/{run_id}/cancel"
        )
        assert response.status_code == 200, response.text

    gateway = CancellingGateway(
        [
            {"action": "call_tool", "tool": "read_site_health", "arguments": {}},
            {"action": "respond", "reply": "Too late.", "output": _output("x")},
        ],
        cancel,
    )

    await _worker(session_factory, gateway).run_once()

    detail = await _detail(client, chat_id)
    assert detail["latest_run"]["status"] == "cancelled"
    assert [message["role"] for message in detail["messages"]] == ["user"]
    assert detail["output"] is None
    assert len(gateway.prompts) == 1  # the step after cancellation never ran
    async with session_factory() as session:
        tools = (await session.scalars(select(AgentToolAttempt))).all()
        dispatched = (await session.scalars(select(AgentModelAttempt))).all()
    assert tools == []
    # The one call that did happen keeps its evidence and is settled.
    assert [(row.outcome, row.settlement_status) for row in dispatched] == [
        ("completed", "zero_debit")
    ]


async def test_a_customer_route_revoked_after_admission_is_never_used(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-route-revoked@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(client, project_id, "Summarize.", skill_id="growth_plan")
    async with session_factory() as session:
        route = await session.scalar(select(ProviderAppRoute))
        assert route is not None
        route.active = False  # the customer disabled their model route
        await session.commit()
    gateway = ScriptedGateway([{"action": "respond", "reply": "Summary."}])

    await _worker(session_factory, gateway).run_once()

    detail = await _detail(client, chat_id)
    assert (detail["latest_run"]["status"], detail["latest_run"]["error_code"]) == (
        "failed",
        "route_unavailable",
    )
    # Never sent anywhere, and never silently moved to platform funding.
    assert gateway.prompts == []


async def test_a_member_who_loses_run_access_never_reaches_the_model(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-revoked@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(client, project_id, "Summarize our pricing page.")
    async with session_factory() as session:
        project = await session.get(Project, uuid.UUID(project_id))
        assert project is not None
        member = await session.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == project.workspace_id
            )
        )
        assert member is not None
        member.role = "viewer"  # read-only now: may not run generated work
        await session.commit()
    gateway = ScriptedGateway([{"action": "respond", "reply": "Leaked summary."}])

    await _worker(session_factory, gateway).run_once()

    assert gateway.prompts == []  # the frozen context was never sent
    async with session_factory() as session:
        run = await session.scalar(
            select(AgentRun).where(AgentRun.chat_id == uuid.UUID(chat_id))
        )
        dispatched = (await session.scalars(select(AgentModelAttempt))).all()
    assert run is not None
    assert (run.status, run.error_code) == ("failed", "access_revoked")
    assert dispatched == []


@pytest.fixture
def _platform_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    """A published platform rate: 2 credits per call, 10 held, 4 if unknown."""
    rate = SimpleNamespace(
        call_credit_cap=10, unknown_usage_charge=4, charge=lambda _usage: 2
    )
    policy = SimpleNamespace(rate=lambda **_kwargs: rate)

    async def published(_session: AsyncSession) -> tuple[str, SimpleNamespace]:
        return "rev-1", policy

    async def for_revision(_session: AsyncSession, _revision: str) -> SimpleNamespace:
        return policy

    monkeypatch.setattr(service, "published_ai_credit_policy", published)
    monkeypatch.setattr(model_calls, "published_ai_credit_policy", published)
    monkeypatch.setattr(model_calls, "ai_credit_policy_for_revision", for_revision)
    monkeypatch.setattr(default_agent_settings, "api_key", "platform-fixture")
    monkeypatch.setattr(
        default_agent_settings, "base_url", "https://provider.invalid/v1"
    )
    monkeypatch.setattr(default_agent_settings, "model", "fixture-model")


async def _ai_credit_usage(
    session_factory: async_sessionmaker[AsyncSession], project_id: str
) -> tuple[int, int]:
    async with session_factory() as session:
        project = await session.get(Project, uuid.UUID(project_id))
        assert project is not None
        account = await billing_account_id_for(session, project.workspace_id)
        assert account is not None
        usage = await consumable_usage(
            session,
            account_id=account,
            capability_key=KEY_AI_CREDITS,
            at=datetime.now(UTC),
        )
    return usage.reserved, usage.debited


@pytest.mark.usefixtures("_platform_policy")
async def test_platform_funded_steps_settle_each_call_against_the_rate(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-platform@example.com")
    await _start(client, project_id, "Summarize our data.", skill_id="growth_plan")
    gateway = ScriptedGateway(
        [
            {"action": "call_tool", "tool": "read_site_health", "arguments": {}},
            {"action": "respond", "reply": "Summary."},
        ]
    )

    await _worker(session_factory, gateway).run_once()

    assert await _ai_credit_usage(session_factory, project_id) == (0, 4)


@pytest.mark.usefixtures("_platform_policy")
async def test_a_changed_platform_model_neither_runs_nor_charges(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-model-drift@example.com")
    chat_id = await _start(client, project_id, "Summarize.", skill_id="growth_plan")
    # A deploy switched the default model after this turn was admitted.
    gateway = ScriptedGateway([{"action": "respond", "reply": "Summary."}])
    gateway.model = "replacement-model"

    await _worker(session_factory, gateway).run_once()

    assert gateway.prompts == []
    async with session_factory() as session:
        run = await session.scalar(
            select(AgentRun).where(AgentRun.chat_id == uuid.UUID(chat_id))
        )
    assert run is not None
    assert (run.status, run.error_code) == ("failed", "model_changed")
    assert await _ai_credit_usage(session_factory, project_id) == (0, 0)


@pytest.mark.usefixtures("_platform_policy")
async def test_a_lost_dispatch_settles_once_as_unknown_usage(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-lost@example.com")
    chat_id = await _start(client, project_id, "Anything.", skill_id="growth_plan")
    worker = _worker(session_factory, ScriptedGateway([]))
    async with session_factory() as session:
        run_id = await session.scalar(
            select(AgentRun.id).where(AgentRun.chat_id == uuid.UUID(chat_id))
        )
    assert run_id is not None
    await worker._queue.claim(owner=worker.owner, limit=1)
    assert await worker._start(run_id) == 1
    async with session_factory() as session:
        await model_calls.start_model_attempt(
            session,
            run_id=run_id,
            owner=worker.owner,
            ordinal=1,
            gateway=ScriptedGateway([]),  # type: ignore[arg-type]
            app_route=None,
            request_text="lost",
        )
    assert await _ai_credit_usage(session_factory, project_id) == (10, 0)

    for _ in range(2):  # recovery is idempotent
        async with session_factory() as session:
            await session.get(AgentRun, run_id, with_for_update=True)
            await model_calls.reconcile_stale_model_attempts(
                session, run_id=run_id, now=datetime.now(UTC)
            )
            await session.commit()

    assert await _ai_credit_usage(session_factory, project_id) == (0, 4)


@pytest.mark.usefixtures("_platform_policy")
async def test_the_sweeper_reclaims_a_lost_turn_without_recounting_its_attempt(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-reclaim@example.com")
    chat_id = await _start(client, project_id, "Anything.", skill_id="growth_plan")
    worker = _worker(session_factory, ScriptedGateway([]))
    async with session_factory() as session:
        run_id = await session.scalar(
            select(AgentRun.id).where(AgentRun.chat_id == uuid.UUID(chat_id))
        )
    assert run_id is not None
    await worker._queue.claim(owner=worker.owner, limit=1)
    assert await worker._start(run_id) == 1
    async with session_factory() as session:
        await model_calls.start_model_attempt(
            session,
            run_id=run_id,
            owner=worker.owner,
            ordinal=1,
            gateway=ScriptedGateway([]),  # type: ignore[arg-type]
            app_route=None,
            request_text="lost",
        )
    # The worker died mid-dispatch: its lease lapses with the hold open.
    async with session_factory() as session:
        run = await session.get(AgentRun, run_id)
        assert run is not None
        counted = run.attempt_count
        run.lease_expires_at = datetime(2000, 1, 1, tzinfo=UTC)
        await session.commit()

    assert await worker._queue.release_expired() == 1

    async with session_factory() as session:
        run = await session.get(AgentRun, run_id)
    assert run is not None
    assert (run.status, run.attempt_count) == ("retry_wait", counted)
    assert await _ai_credit_usage(session_factory, project_id) == (0, 4)


async def test_restoring_an_approved_outline_needs_a_fresh_approval_record(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project_id = await _project(client, "agent-restore-outline@example.com")
    await _verified_route(session_factory, project_id)
    chat_id = await _start(
        client, project_id, "Write a buying guide.", skill_id="content_create"
    )
    outline_step = {
        "action": "respond",
        "reply": "Outline.",
        "output": _output("1. A\n2. B", phase="outline", target=None),
    }
    await _worker(session_factory, ScriptedGateway([outline_step])).run_once()
    outline = (await _detail(client, chat_id))["output"]["latest_revision"]
    approved = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/approve-outline",
        json={"revision_id": outline["id"]},
    )
    assert approved.status_code == 202, approved.text
    draft_step = {
        "action": "respond",
        "reply": "Draft.",
        "output": _output("# Guide", phase="draft", target=None),
    }
    await _worker(session_factory, ScriptedGateway([draft_step])).run_once()

    restored = await client.post(
        f"/api/v1/agent/chats/{chat_id}/output/revisions/{outline['id']}/restore"
    )

    assert restored.status_code == 201, restored.text
    body = restored.json()
    assert (body["number"], body["phase"], body["approved_at"]) == (3, "outline", None)
