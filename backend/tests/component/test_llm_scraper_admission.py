"""One credential, independent engine slots, frozen context and authorized rollout."""

import uuid

import pytest
from sqlalchemy import select

from app.core.config.provider_routes import LOGICAL_ENGINES
from app.domain.audits.creation import create_audit
from app.domain.audits.errors import AuditValidationError
from app.domain.providers.schemas import ProviderConnectionCreate
from app.domain.providers.service import (
    ProviderConnectionNotFoundError,
    create_connection,
    provision_dataforseo_routes,
)
from app.models.audit import AuditTask
from app.models.project import Project
from app.models.provider import ProviderRoute
from tests.component.audit_helpers import _mark_connection_probed, seed_audit_fixtures


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "engines",
    [list(LOGICAL_ENGINES), ["chatgpt_search"], ["gemini", "gemini_consumer"]],
)
async def test_independent_slots_and_frozen_context(session_factory, engines):
    async with session_factory() as session:
        seed = await seed_audit_fixtures(
            session, prompt_count=1, engines=["chatgpt", "gemini", "claude"]
        )
        connection = await create_connection(
            session,
            workspace_id=seed.workspace_id,
            payload=ProviderConnectionCreate(
                transport_provider="dataforseo",
                label="Shared account",
                api_login="test@example.com",
                api_password="test",
                routes=[],
            ),
        )
        _mark_connection_probed(
            session, connection=connection, engine="google_ai_overview"
        )
        project = await session.get(Project, seed.project_id)
        project.serp_location_code = 2840
        project.serp_language_code = "en"
        await session.commit()
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=engines,
            trigger="manual",
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        tasks = (
            await session.scalars(
                select(AuditTask).where(AuditTask.audit_id == audit.id)
            )
        ).all()
        assert {task.logical_engine for task in tasks} == set(engines)
        assert len(tasks) == len(engines)
        project.serp_location_code = 2356
        await session.commit()
        for task in tasks:
            if task.logical_engine in ("chatgpt_search", "gemini_consumer"):
                assert task.request_snapshot["location_code"] == 2840
                assert task.provider_route_snapshot["connection_id"] == str(
                    connection.id
                )


@pytest.mark.asyncio
async def test_rollout_is_idempotent_scoped_and_keeps_disabled_route(session_factory):
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)
        connection = await create_connection(
            session,
            workspace_id=seed.workspace_id,
            payload=ProviderConnectionCreate(
                transport_provider="dataforseo",
                label="Shared",
                api_login="test@example.com",
                api_password="test",
                routes=[],
            ),
        )
        route = next(
            route
            for route in connection.routes
            if route.logical_engine == "chatgpt_search"
        )
        route.active = False
        route.deactivation_reason = "operator_disabled"
        missing = next(
            route
            for route in connection.routes
            if route.logical_engine == "gemini_consumer"
        )
        connection.routes.remove(missing)
        ciphertext = connection.api_key_encrypted
        await session.commit()
        for _ in range(2):
            connection = await provision_dataforseo_routes(
                session, workspace_id=seed.workspace_id, connection_id=connection.id
            )
            await session.commit()
        routes = (
            await session.scalars(
                select(ProviderRoute).where(
                    ProviderRoute.connection_id == connection.id
                )
            )
        ).all()
        assert len(routes) == 3
        assert not next(
            route for route in routes if route.logical_engine == "chatgpt_search"
        ).active
        assert connection.api_key_encrypted == ciphertext
        with pytest.raises(ProviderConnectionNotFoundError):
            await provision_dataforseo_routes(
                session, workspace_id=uuid.uuid4(), connection_id=connection.id
            )


@pytest.mark.asyncio
async def test_unsupported_market_is_rejected_before_tasks(session_factory):
    from app.domain.audits.creation import _require_search_context

    project = Project(serp_location_code=2356, serp_language_code="en")
    with pytest.raises(AuditValidationError, match="Unsupported"):
        _require_search_context(project=project, engines=["chatgpt_search"])
