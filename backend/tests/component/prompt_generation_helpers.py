"""Shared fixtures for prompt generation, candidate review and topic tests.

The default agent is always faked at the API boundary so no test performs
live provider I/O.
"""

from __future__ import annotations

import json

import httpx

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
    client: httpx.AsyncClient, email: str, *, create_default_topic: bool = True
) -> tuple[dict, str]:
    await _register(client, email)
    project = (await client.post("/api/v1/projects", json=project_payload())).json()
    prompt_set_id = (
        await client.post(
            "/api/v1/prompt-sets",
            json={"project_id": project["id"], "name": "Default"},
        )
    ).json()["id"]
    # Category identity for topical binding: unbranded generated/manual texts
    # bind through the products_services vocabulary (a partial upsert, so
    # later per-test brand-profile PUTs keep it).
    profile = await client.put(
        f"/api/v1/projects/{project['id']}/brand-profile",
        json={"products_services": ["running shoes"]},
    )
    assert profile.status_code == 200
    if create_default_topic:
        topic = await client.post(
            f"/api/v1/projects/{project['id']}/topics",
            json={"name": "Running Shoes"},
        )
        assert topic.status_code == 201
    return project, prompt_set_id


async def accept_all(
    client: httpx.AsyncClient, prompt_set_id: str, generate_body: dict
) -> list[dict]:
    """Accept every staged candidate from a generate response."""
    ids = [candidate["id"] for candidate in generate_body["candidates"]]
    if not ids:
        return []
    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/candidates/review",
        json={"accept_ids": ids},
    )
    assert response.status_code == 200, response.text
    return response.json()["accepted"]
