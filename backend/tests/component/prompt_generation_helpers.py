"""Shared fixtures for prompt generation tests.

The default agent is always faked at the API boundary so no test performs
live provider I/O. The TypeScript API owns the prompt library (sets, prompts,
topics and candidate review), so these helpers set up and read that state in
the database directly rather than through Python routes.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.domain.prompts.candidates import review_order
from app.domain.prompts.mappers import (
    active_prompt_counts,
    candidate_to_response,
    prompt_set_to_response,
    prompt_to_response,
    topic_to_response,
)
from app.main import app
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun
from tests.component.auth_helpers import register_and_login as _register
from tests.fixtures.prompt_generation import (
    labelled_row,
    satisfies_slot,
    slot_text,
)

VALID_AGENT_RESPONSE = json.dumps(
    {
        "topics": [
            {
                "name": "Running Shoes",
                "prompts": [
                    {"text": "best running shoes in australia", "intent": "discovery"},
                    {
                        "text": (
                            "affordable running shoes for budget conscious families"
                        ),
                        "intent": "purchase",
                    },
                ],
            },
            {
                "name": "Running Shoes",
                "prompts": [
                    {
                        "text": "how to choose the right running shoe size",
                        "intent": "service",
                    },
                ],
            },
        ]
    }
)


class FakeAgent:
    """Stands in for DefaultAgentClient; records calls, returns a canned body."""

    model = "fake-model"
    base_url_host = "agent.test"

    def __init__(
        self,
        response: str = VALID_AGENT_RESPONSE,
        *,
        fallback_discriminator: str = "",
    ) -> None:
        self.response = response
        self.fallback_discriminator = fallback_discriminator
        self.calls: list[dict[str, str]] = []
        self.schemas: list[tuple[str, dict[str, object]]] = []
        # Business-map suggestion calls, kept apart from prompt-writing calls.
        self.map_calls: list[dict[str, str]] = []
        self.map_response = json.dumps({"offerings": []})

    async def complete_json(self, *, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self._response_for(user)

    async def complete_structured_json(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, object],
    ) -> str:
        if schema_name == "business_map_suggestions":
            self.map_calls.append({"system": system, "user": user})
            return self.map_response
        self.calls.append({"system": system, "user": user})
        self.schemas.append((schema_name, schema))
        return self._response_for(user)

    def _response_for(self, user: str) -> str:
        try:
            payload = json.loads(self.response)
        except json.JSONDecodeError:
            return self.response
        if "prompts" in payload:
            return self.response

        marker = "Buyer-query slots (return one row per slot): "
        slot_line = next(line for line in user.splitlines() if line.startswith(marker))
        slots = json.loads(slot_line.removeprefix(marker))
        candidate_texts: list[str] = []
        for suggested_topic in payload.get("topics", []):
            candidate_texts.extend(
                str(prompt.get("text") or "")
                for prompt in suggested_topic.get("prompts", [])
            )
        return json.dumps(
            {
                "prompts": [
                    labelled_row(
                        slot,
                        _slot_text(
                            slot,
                            candidate_texts[index]
                            if index < len(candidate_texts)
                            else "",
                            index,
                            self.fallback_discriminator,
                        ),
                    )
                    for index, slot in enumerate(slots)
                ]
            }
        )


def _slot_text(
    slot: dict[str, object],
    candidate: str,
    index: int,
    discriminator: str = "",
) -> str:
    """Keep test-supplied text when it does the slot's job; else render one.

    Validity is decided by the production gate rather than a copy of it, so a
    fake agent can never drift into producing text the real generator would
    reject -- which is how the old sentence-frame renderer masked the fact that
    every exemplar in the config would have been thrown away.
    """
    text = " ".join(candidate.split())
    if satisfies_slot(slot, text):
        return text
    fallback_id = f"{discriminator}-{index}" if discriminator else index
    return slot_text(slot, fallback_id)


def project_payload(**overrides: object) -> dict:
    payload = {
        "name": "Acme Visibility",
        "brand_name": "Acme Corp",
        "brand": {"aliases": ["Acme", "ACME Inc"]},
        "website_url": "https://acme.com",
        "owned_domains": ["acme.com"],
        "unintended_domains": [],
        "competitors": [
            {"name": "Globex", "aliases": ["Globex Co"], "domains": ["globex.com"]}
        ],
        "country_code": "AU",
        "language_code": "en-AU",
        "benchmark_mode": "controlled_localized",
        "default_repetitions": 3,
    }
    payload.update(overrides)
    return payload


async def make_project_and_set(
    client: httpx.AsyncClient,
    email: str,
    *,
    create_default_topic: bool = True,
    **profile: object,
) -> tuple[dict, str]:
    """A project, its Default prompt set and (optionally) a Running Shoes topic.

    ``profile`` overrides the brand knowledge seeded at creation. The default
    offering gives topical binding its category identity: unbranded
    generated/manual texts bind through the products_services vocabulary.
    """
    await _register(client, email)
    payload = project_payload(**{"products_services": ["running shoes"], **profile})
    project = (await client.post("/api/v1/projects", json=payload)).json()
    prompt_set_id = await create_prompt_set(project["id"], "Default")
    if create_default_topic:
        await create_topic(project["id"], "Running Shoes")
    return project, prompt_set_id


@asynccontextmanager
async def library_session() -> AsyncIterator[AsyncSession]:
    """A session on the per-test schema the ``client`` fixture binds."""
    sessions = app.dependency_overrides[get_session]()
    session = await anext(sessions)
    try:
        yield session
    finally:
        await sessions.aclose()


def _json(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")


async def create_prompt_set(project_id: str, name: str = "Default") -> str:
    async with library_session() as session:
        prompt_set = PromptSet(project_id=uuid.UUID(project_id), name=name)
        session.add(prompt_set)
        await session.commit()
        return str(prompt_set.id)


async def create_topic(
    project_id: str,
    name: str,
    *,
    description: str = "",
    parent_id: str | None = None,
) -> dict[str, Any]:
    async with library_session() as session:
        topic = Topic(
            project_id=uuid.UUID(project_id),
            name=name,
            description=description,
            parent_id=uuid.UUID(parent_id) if parent_id else None,
        )
        session.add(topic)
        await session.commit()
        return _json(topic_to_response(topic, {}))


async def create_prompt(prompt_set_id: str, text: str, **fields: Any) -> dict[str, Any]:
    """A tracked prompt, inserted as a person's manual prompt would be."""
    async with library_session() as session:
        prompt = Prompt(
            prompt_set_id=uuid.UUID(prompt_set_id), text=text, theme="", **fields
        )
        session.add(prompt)
        await session.commit()
        return _json(prompt_to_response(prompt))


async def prompt_set_view(prompt_set_id: str) -> dict[str, Any]:
    async with library_session() as session:
        prompt_set = await session.get(PromptSet, uuid.UUID(prompt_set_id))
        assert prompt_set is not None
        await session.refresh(prompt_set, ["prompts"])
        return _json(prompt_set_to_response(prompt_set))


async def project_topics(project_id: str) -> list[dict[str, Any]]:
    async with library_session() as session:
        topics = (
            await session.scalars(
                select(Topic)
                .where(Topic.project_id == uuid.UUID(project_id))
                .order_by(Topic.name)
            )
        ).all()
        counts = await active_prompt_counts(session, project_id=uuid.UUID(project_id))
        return [_json(topic_to_response(topic, counts)) for topic in topics]


async def pending_candidates(prompt_set_id: str) -> list[dict[str, Any]]:
    """The review list: pending, unexpired candidates in review order."""
    async with library_session() as session:
        candidates = (
            await session.scalars(
                select(PromptCandidate).where(
                    PromptCandidate.prompt_set_id == uuid.UUID(prompt_set_id),
                    PromptCandidate.disposition == "pending",
                    PromptCandidate.expires_at > datetime.now(UTC),
                )
            )
        ).all()
        gates: dict[uuid.UUID, str | None] = {}
        for candidate in candidates:
            run = await session.get(PromptGenerationRun, candidate.run_id)
            gates[candidate.run_id] = (
                (run.provenance or {}).get("quality_gate") if run else None
            )
        return [
            _json(candidate_to_response(candidate, gates[candidate.run_id]))
            for candidate in review_order(list(candidates))
        ]


async def staged_candidate(candidate_id: str) -> tuple[PromptCandidate, dict[str, Any]]:
    """A staged candidate row and its generation run's provenance."""
    async with library_session() as session:
        candidate = await session.get(PromptCandidate, uuid.UUID(candidate_id))
        assert candidate is not None
        run = await session.get(PromptGenerationRun, candidate.run_id)
        assert run is not None
        return candidate, dict(run.provenance or {})


async def accept_candidates(
    prompt_set_id: str, candidate_ids: list[str]
) -> list[dict[str, Any]]:
    """Track candidates as the review accept does: active, generated prompts
    carrying the run's provenance; the candidates are marked accepted."""
    async with library_session() as session:
        accepted: list[Prompt] = []
        for candidate_id in candidate_ids:
            candidate = await session.get(PromptCandidate, uuid.UUID(candidate_id))
            assert candidate is not None
            run = await session.get(PromptGenerationRun, candidate.run_id)
            assert run is not None
            prompt = Prompt(
                prompt_set_id=uuid.UUID(prompt_set_id),
                topic_id=candidate.topic_id,
                text=candidate.text,
                theme="",
                intent=candidate.intent,
                buyer_stage=candidate.buyer_stage,
                prompt_intent=candidate.prompt_intent,
                cohort=candidate.cohort,
                branded=candidate.cohort in {"comparison", "brand_diagnostic"},
                origin="generated",
                generation_evidence={
                    **(run.provenance or {}),
                    "candidate_id": str(candidate.id),
                },
            )
            session.add(prompt)
            await session.flush()
            candidate.disposition = "accepted"
            candidate.prompt_id = prompt.id
            accepted.append(prompt)
        await session.commit()
        return [_json(prompt_to_response(prompt)) for prompt in accepted]


async def accept_all(
    client: httpx.AsyncClient, prompt_set_id: str, generate_body: dict
) -> list[dict]:
    """Accept every staged candidate from a generate response."""
    del client
    ids = [candidate["id"] for candidate in generate_body["candidates"]]
    return await accept_candidates(prompt_set_id, ids) if ids else []
