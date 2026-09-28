"""Component tests for audit admission of persisted prompts.

Covers, against real Postgres (service level) and the API envelope:
  - audit launch consumes persisted active prompts without a second lexical
    gate, including in a project with no identity vocabulary;
  - the funded/trial prompt-count policy: unset fails closed with
    ``prompt_count_policy_unconfigured``, a configured count is enforced,
    and BYOK audit creation is never gated by the knob.

Prompt writers and generation are TypeScript-owned and tested there.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.audits import (
    AUDIT_TRIGGER_MANUAL,
    AUDIT_TRIGGER_TRIAL,
    CODE_PROMPT_COUNT_EXCEEDED,
    CODE_PROMPT_COUNT_POLICY_UNCONFIGURED,
    audit_settings,
)
from app.core.config.entitlements import (
    CREDENTIAL_MODE_BYOK,
    CREDENTIAL_MODE_FUNDED,
    KEY_AUDIT_CREDITS,
)
from app.core.config.projects import PROMPT_ORIGIN_GENERATED
from app.core.config.provider_catalog import ENGINE_CLAUDE
from app.core.security import encrypt_secret
from app.domain.audits.creation import create_audit
from app.domain.audits.errors import PromptCountPolicyError
from app.domain.entitlements.types import GrantSpec
from app.models.brand import Brand, OwnedDomain
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.provider import ProviderConnection, ProviderRoute
from tests.component.audit_helpers import (
    _mark_connection_probed,
    seed_audit_fixtures,
    seed_platform_connection,
)
from tests.component.auth_helpers import register_and_login as _register
from tests.component.occupancy_helpers import seed_occupancy_grants

# ---------------------------------------------------------------------------
# Shared API seed helpers (project identity: Acme Corp / acme.com, competitor
# Globex — never part of the positive vocabulary).
# ---------------------------------------------------------------------------


def _project_payload() -> dict:
    return {
        "name": "Acme Visibility",
        "brand_name": "Acme Corp",
        "brand": {"aliases": ["Acme"]},
        "website_url": "https://acme.com",
        "owned_domains": ["acme.com"],
        "competitors": [
            {"name": "Globex", "aliases": ["Globex Co"], "domains": ["globex.com"]}
        ],
        "country_code": "AU",
        "language_code": "en-AU",
    }


async def _create_prompt_set(
    session_factory: async_sessionmaker[AsyncSession], project_id: str
) -> str:
    async with session_factory() as session:
        prompt_set = PromptSet(project_id=uuid.UUID(project_id), name="Default")
        session.add(prompt_set)
        await session.commit()
        return str(prompt_set.id)


async def _make_project_and_set(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    email: str,
) -> tuple[dict, str]:
    await _register(client, email)
    project = (await client.post("/api/v1/projects", json=_project_payload())).json()
    return project, await _create_prompt_set(session_factory, project["id"])


# ---------------------------------------------------------------------------
# Audit admission
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_audit_launch_does_not_revalidate_active_prompt_text(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Launch consumes the persisted active portfolio admission decision."""
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)
        session.add(Topic(project_id=seed.project_id, name="Digital marketing"))
        session.add(
            Prompt(
                prompt_set_id=seed.prompt_set_id,
                text="Which agencies improve experimentation outcomes?",
                status="active",
                origin=PROMPT_ORIGIN_GENERATED,
            )
        )
        await session.commit()

    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        assert audit.id is not None


@pytest.mark.asyncio
async def test_audit_admission_honors_persisted_generated_provenance(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A generated neutral synonym is not rejected by a second lexical gate."""
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=0)
        # Activates the lexical project gate. The generated prompt is a valid
        # neutral synonym but intentionally shares no literal category token.
        session.add(Topic(project_id=seed.project_id, name="Digital marketing"))
        session.add(
            Prompt(
                prompt_set_id=seed.prompt_set_id,
                text="Which agencies improve experimentation outcomes?",
                status="active",
                origin=PROMPT_ORIGIN_GENERATED,
            )
        )
        await session.commit()

    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        assert audit.id is not None


@pytest.mark.asyncio
async def test_audit_launch_api_passes_active_prompt_to_later_admission_gates(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """POST /audits does not reject active text at the lexical gate."""
    project, prompt_set_id = await _make_project_and_set(
        client, session_factory, "bind-audit@example.com"
    )
    workspace_id = uuid.UUID(project["workspace_id"])
    async with session_factory() as session:
        # Persisted generated prompt whose neutral synonym has no lexical
        # overlap with the project's current category vocabulary.
        session.add(
            Topic(project_id=uuid.UUID(project["id"]), name="Digital marketing")
        )
        prompt = Prompt(
            prompt_set_id=uuid.UUID(prompt_set_id),
            text="Which agencies improve experimentation outcomes?",
            status="active",
            origin=PROMPT_ORIGIN_GENERATED,
        )
        session.add(prompt)
        await session.flush()
        # One approved BYOK route so audit creation can complete.
        connection = ProviderConnection(
            workspace_id=workspace_id,
            label="gemini key",
            transport_provider="google",
            api_key_encrypted=encrypt_secret("secret-test-key"),
            active=True,
        )
        session.add(connection)
        await session.flush()
        session.add(
            ProviderRoute(
                workspace_id=workspace_id,
                connection_id=connection.id,
                logical_engine="gemini",
                transport_provider="google",
                transport_model="gemini-flash-latest",
                is_default=True,
            )
        )
        await session.commit()
        prompt_id = str(prompt.id)

    resp = await client.post(
        "/api/v1/audits",
        json={
            "project_id": project["id"],
            "engines": ["gemini"],
            "prompt_ids": [prompt_id],
            "repetitions": 1,
        },
    )
    # This API fixture has no funded platform credential, so execution is
    # denied later. Reaching that gate proves prompt_off_topic no longer makes
    # the already-active prompt impossible to launch.
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "execution_credentials_unavailable"


# ---------------------------------------------------------------------------
# Empty vocabulary fails closed
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_empty_vocabulary_does_not_block_audit(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A persisted prompt in a project with no identity can still be measured.

    The TypeScript prompt writers refuse new free text there; setup should
    nudge the user to add identity, not make the visibility run unreachable.
    """
    await _register(client, "bind-empty@example.com")
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "No Identity", "website_url": "", "brand_name": ""},
        )
    ).json()
    prompt_set_id = await _create_prompt_set(session_factory, project["id"])

    async with session_factory() as session:
        workspace_id = uuid.UUID(project["workspace_id"])
        session.add(
            Prompt(
                prompt_set_id=uuid.UUID(prompt_set_id),
                text="anything at all",
                status="active",
                origin="manual",
            )
        )
        # One approved BYOK route so admission reaches the binding gate.
        connection = ProviderConnection(
            workspace_id=workspace_id,
            label="gemini key",
            transport_provider="google",
            api_key_encrypted=encrypt_secret("secret-test-key"),
            active=True,
        )
        session.add(connection)
        await session.flush()
        _mark_connection_probed(session, connection=connection, engine="gemini")
        session.add(
            ProviderRoute(
                workspace_id=workspace_id,
                connection_id=connection.id,
                logical_engine="gemini",
                transport_provider="google",
                transport_model="gemini-flash-latest",
                is_default=True,
            )
        )
        await session.commit()
    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=uuid.UUID(project["workspace_id"]),
            project_id=uuid.UUID(project["id"]),
            engines=["gemini"],
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=uuid.UUID(prompt_set_id),
            repetitions=1,
        )
        assert audit.id is not None


@pytest.mark.asyncio
async def test_empty_vocabulary_after_identity_removal_keeps_audit_available(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Deleting identity rows does not strand an already-configured audit."""
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)
        await session.execute(delete(Brand).where(Brand.project_id == seed.project_id))
        await session.execute(
            delete(OwnedDomain).where(OwnedDomain.project_id == seed.project_id)
        )
        await session.commit()

    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        assert audit.id is not None


# ---------------------------------------------------------------------------
# Funded/trial prompt-count policy
# ---------------------------------------------------------------------------
async def _seed_funded_workspace(
    session: AsyncSession, *, prompt_count: int
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, list[str]]:
    # Tenant connection stays unprobed (BYOK precedence must not claim funded
    # tasks); the platform credential backs funded credential resolution.
    seed = await seed_audit_fixtures(
        session, prompt_count=prompt_count, engines=["claude"], probed=False
    )
    await seed_platform_connection(session, engines=(ENGINE_CLAUDE,))
    await seed_occupancy_grants(
        session,
        workspace_id=seed.workspace_id,
        grants=(GrantSpec(key=KEY_AUDIT_CREDITS, value=100_000),),
    )
    await session.commit()
    return seed.workspace_id, seed.project_id, seed.prompt_set_id, seed.engines


@pytest.mark.asyncio
async def test_unset_prompt_count_policy_blocks_funded_and_trial(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audit_settings, "audit_prompt_count", None)
    async with session_factory() as session:
        workspace_id, project_id, prompt_set_id, engines = await _seed_funded_workspace(
            session, prompt_count=2
        )

    for trigger, credential_mode in (
        (AUDIT_TRIGGER_MANUAL, CREDENTIAL_MODE_FUNDED),
        (AUDIT_TRIGGER_TRIAL, CREDENTIAL_MODE_BYOK),
    ):
        async with session_factory() as session:
            with pytest.raises(PromptCountPolicyError) as exc_info:
                await create_audit(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    engines=engines,
                    trigger=trigger,
                    credential_mode=credential_mode,
                    prompt_set_id=prompt_set_id,
                    repetitions=1,
                )
            assert exc_info.value.code == CODE_PROMPT_COUNT_POLICY_UNCONFIGURED
            await session.rollback()


@pytest.mark.asyncio
async def test_unset_prompt_count_policy_does_not_gate_byok(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """BYOK manual runs stay governed by their existing product limits."""
    monkeypatch.setattr(audit_settings, "audit_prompt_count", None)
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=2)

    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            credential_mode=CREDENTIAL_MODE_BYOK,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        assert audit.id is not None


@pytest.mark.asyncio
async def test_configured_prompt_count_is_enforced(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audit_settings, "audit_prompt_count", 1)
    async with session_factory() as session:
        workspace_id, project_id, prompt_set_id, engines = await _seed_funded_workspace(
            session, prompt_count=2
        )

    # 2 selected active prompts > configured 1: funded and trial both stop.
    for trigger, credential_mode in (
        (AUDIT_TRIGGER_MANUAL, CREDENTIAL_MODE_FUNDED),
        (AUDIT_TRIGGER_TRIAL, CREDENTIAL_MODE_BYOK),
    ):
        async with session_factory() as session:
            with pytest.raises(PromptCountPolicyError) as exc_info:
                await create_audit(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    engines=engines,
                    trigger=trigger,
                    credential_mode=credential_mode,
                    prompt_set_id=prompt_set_id,
                    repetitions=1,
                )
            assert exc_info.value.code == CODE_PROMPT_COUNT_EXCEEDED
            assert exc_info.value.details == {"selected": 2, "limit": 1}
            await session.rollback()

    # At or under the configured count the funded run is admitted.
    monkeypatch.setattr(audit_settings, "audit_prompt_count", 2)
    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            engines=engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            credential_mode=CREDENTIAL_MODE_FUNDED,
            prompt_set_id=prompt_set_id,
            repetitions=1,
        )
        assert audit.id is not None
