"""One credential, independent engine slots, frozen context and authorized rollout."""

import pytest
from sqlalchemy import select

from app.core.config.dataforseo import pack_credential
from app.core.config.provider_catalog import MEASUREMENT_ROUTES
from app.core.config.provider_routes import LOGICAL_ENGINES
from app.core.security import encrypt_secret
from app.domain.audits.creation import create_audit
from app.domain.audits.errors import AuditValidationError
from app.models.audit import AuditTask
from app.models.project import Project
from app.models.provider import ProviderConnection, ProviderRoute
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
        connection = ProviderConnection(
            workspace_id=seed.workspace_id,
            transport_provider="dataforseo",
            api_key_encrypted=encrypt_secret(
                pack_credential(login="test@example.com", password="test")
            ),
            active=True,
        )
        session.add(connection)
        await session.flush()
        for engine, route in MEASUREMENT_ROUTES.items():
            if route.transport_provider == "dataforseo":
                session.add(
                    ProviderRoute(
                        workspace_id=seed.workspace_id,
                        connection_id=connection.id,
                        logical_engine=engine,
                        transport_provider="dataforseo",
                        transport_model=route.transport_model,
                        is_default=True,
                    )
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
async def test_scraper_surfaces_use_the_project_market(session_factory):
    from app.domain.audits.creation import _require_search_context

    engines = ["chatgpt_search", "gemini_consumer", "google_ai_overview"]
    _require_search_context(
        project=Project(serp_location_code=2356, serp_language_code="en"),
        engines=engines,
    )
    with pytest.raises(AuditValidationError, match="not one this deployment"):
        _require_search_context(
            project=Project(serp_location_code=999999, serp_language_code="en"),
            engines=["chatgpt_search"],
        )
