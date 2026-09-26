"""Composing one overview's evidence, for the Python copy MCP still reads.

Mentioned / linked / cited stay THREE signals. The plan's acceptance fixtures
are three rows that each light exactly one of them, and they are the whole
reason ``AioEntityLink`` exists as a separate table. A reader who sees them
collapse into one "appeared" column has lost the finding.

The selection's rates and the HTTP routes moved to the TypeScript API service,
whose suite (``frontend/services/api/test/visibility-routes.test.ts``) carries
their tests, including that a failed retrieval never reaches a denominator.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    OUTCOME_NO_AI_OVERVIEW,
)
from app.core.config.audits import AUDIT_STATUS_COMPLETED
from app.core.config.provider_catalog import (
    ENGINE_GOOGLE_AI_OVERVIEW,
    TRANSPORT_DATAFORSEO,
)
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.domain.analysis.aio_evidence import execution_surface_evidence
from app.domain.analysis.aio_schemas import (
    SearchSurfaceEvidence,
    SurfaceEntityEvidence,
)
from app.models.analysis import Citation, CompetitorMention, ResponseAnalysis
from app.models.audit import (
    Audit,
    AuditEngineSnapshot,
    AuditPromptSnapshot,
    AuditTask,
    RawResponseArtifact,
)
from app.models.search_surfaces import AioEntityLink, AioObservation
from tests.component.audit_helpers import seed_audit_fixtures

_CONFIGURATION = {
    "brand_name": "Acme Corp",
    "brand_aliases": ["Acme"],
    "owned_domains": ["acme.example"],
    "competitors": [
        {"name": "Globex", "aliases": ["Globex"], "domains": ["globex.example"]}
    ],
}


class _Fixture:
    """The ids a test needs back after seeding."""

    def __init__(self, *, workspace_id: uuid.UUID, project_id: uuid.UUID) -> None:
        self.workspace_id = workspace_id
        self.project_id = project_id
        self.audit_id: uuid.UUID | None = None
        # One per (audit, engine) by unique constraint, so it is seeded with
        # the audit rather than with each task.
        self.engine_snapshot_id: uuid.UUID | None = None


async def _seed_audit(session: AsyncSession) -> _Fixture:
    seed = await seed_audit_fixtures(session, prompt_count=1)
    fixture = _Fixture(workspace_id=seed.workspace_id, project_id=seed.project_id)
    audit = Audit(
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        status=AUDIT_STATUS_COMPLETED,
        trigger="manual",
        configuration=_CONFIGURATION,
        completed_at=datetime.now(UTC),
    )
    session.add(audit)
    await session.flush()
    engine_snapshot = AuditEngineSnapshot(
        audit_id=audit.id,
        logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
        transport_provider=TRANSPORT_DATAFORSEO,
        transport_model="google-organic-serp",
    )
    session.add(engine_snapshot)
    await session.flush()
    fixture.audit_id = audit.id
    fixture.engine_snapshot_id = engine_snapshot.id
    return fixture


async def _seed_observation(
    session: AsyncSession,
    fixture: _Fixture,
    *,
    prompt_index: int = 0,
    outcome: str = OUTCOME_AI_OVERVIEW_PRESENT,
    aio_present: bool | None = True,
    cohort: str = "core",
    analysis: bool = True,
    brand_mentioned: bool = False,
    brand_first_offset: int | None = None,
    owned_cited: bool = False,
    competitor_named: bool = False,
    link_urls: tuple[str, ...] = (),
    citation_urls: tuple[tuple[str, bool, str | None], ...] = (),
) -> uuid.UUID:
    """One observation with whichever of the three signals the test needs."""
    assert fixture.audit_id is not None
    prompt_snapshot = AuditPromptSnapshot(
        audit_id=fixture.audit_id,
        prompt_index=prompt_index,
        text=f"prompt {prompt_index}",
        cohort=cohort,
    )
    session.add(prompt_snapshot)
    await session.flush()
    task = AuditTask(
        audit_id=fixture.audit_id,
        workspace_id=fixture.workspace_id,
        project_id=fixture.project_id,
        prompt_snapshot_id=prompt_snapshot.id,
        engine_snapshot_id=fixture.engine_snapshot_id,
        prompt_index=prompt_index,
        repetition=0,
        logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
        transport_provider=TRANSPORT_DATAFORSEO,
        transport_model="google-organic-serp",
        prompt_text=f"prompt {prompt_index}",
        idempotency_key=f"{fixture.audit_id}:{prompt_index}:0:aio",
        status=TASK_STATUS_SUCCEEDED,
    )
    session.add(task)
    await session.flush()

    observation = AioObservation(
        workspace_id=fixture.workspace_id,
        audit_id=fixture.audit_id,
        task_id=task.id,
        outcome=outcome,
        aio_present=aio_present,
        aio_serp_position=1 if aio_present else None,
        location_code=2036,
        language_code="en",
        device="desktop",
        element_count=3,
        reference_count=len(citation_urls),
    )
    session.add(observation)
    await session.flush()
    for index, url in enumerate(link_urls):
        session.add(
            AioEntityLink(
                workspace_id=fixture.workspace_id,
                observation_id=observation.id,
                url=url,
                domain=url.split("/")[2],
                title="",
                element_index=index,
            )
        )
    if analysis:
        await _seed_analysis(
            session,
            fixture,
            task_id=task.id,
            brand_mentioned=brand_mentioned,
            brand_first_offset=brand_first_offset,
            owned_cited=owned_cited,
            competitor_named=competitor_named,
            citation_urls=citation_urls,
        )
    return task.id


async def _seed_analysis(
    session: AsyncSession,
    fixture: _Fixture,
    *,
    task_id: uuid.UUID,
    brand_mentioned: bool,
    brand_first_offset: int | None,
    owned_cited: bool,
    competitor_named: bool,
    citation_urls: tuple[tuple[str, bool, str | None], ...],
) -> None:
    assert fixture.audit_id is not None
    artifact = RawResponseArtifact(
        audit_id=fixture.audit_id,
        task_id=task_id,
        logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
        transport_provider=TRANSPORT_DATAFORSEO,
        transport_model="google-organic-serp",
        answer_text="",
    )
    session.add(artifact)
    await session.flush()
    analysis = ResponseAnalysis(
        workspace_id=fixture.workspace_id,
        audit_id=fixture.audit_id,
        task_id=task_id,
        artifact_id=artifact.id,
        analyzer_version="test",
        scoring_rule_version="test",
        logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
        transport_provider=TRANSPORT_DATAFORSEO,
        brand_mentioned=brand_mentioned,
        brand_first_offset=brand_first_offset,
        owned_domain_cited=owned_cited,
        owned_citation_count=1 if owned_cited else 0,
        citation_count=len(citation_urls),
        score={
            "brand_first_offset": brand_first_offset,
            "competitor_first_offsets": {"Globex": 5} if competitor_named else {},
        },
    )
    session.add(analysis)
    await session.flush()
    if competitor_named:
        session.add(
            CompetitorMention(
                workspace_id=fixture.workspace_id,
                audit_id=fixture.audit_id,
                artifact_id=artifact.id,
                analyzer_version="test",
                analysis_id=analysis.id,
                competitor_name="Globex",
                first_offset=5,
            )
        )
    for ordinal, (url, is_owned, matched) in enumerate(citation_urls):
        session.add(
            Citation(
                workspace_id=fixture.workspace_id,
                audit_id=fixture.audit_id,
                artifact_id=artifact.id,
                analyzer_version="test",
                analysis_id=analysis.id,
                ordinal=ordinal,
                url=url,
                domain=url.split("/")[2],
                is_owned=is_owned,
                matched_competitor=matched,
            )
        )


async def _brand_row(
    session: AsyncSession, *, workspace_id: uuid.UUID, task_id: uuid.UUID
) -> tuple[SearchSurfaceEvidence, SurfaceEntityEvidence]:
    """Read one execution's surface evidence and pick out the brand's row."""
    analysis = await session.scalar(
        select(ResponseAnalysis).where(ResponseAnalysis.task_id == task_id)
    )
    evidence = await execution_surface_evidence(
        session, workspace_id=workspace_id, task_id=task_id, analysis=analysis
    )
    assert evidence is not None
    brand = next(entity for entity in evidence.entities if entity.kind == "brand")
    return evidence, brand


class TestTheThreeSignalsStayThree:
    """The plan's acceptance fixtures: each lights exactly one signal."""

    @pytest.mark.asyncio
    async def test_named_in_the_answer_only(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(
                session, fixture, brand_mentioned=True, brand_first_offset=0
            )
            await session.commit()
        async with session_factory() as session:
            _, brand = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        assert (brand.mentioned, brand.linked, brand.cited) == (True, False, False)

    @pytest.mark.asyncio
    async def test_cited_in_the_references_only(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(
                session,
                fixture,
                owned_cited=True,
                citation_urls=(("https://acme.example/pricing", True, None),),
            )
            await session.commit()
        async with session_factory() as session:
            _, brand = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        assert (brand.mentioned, brand.linked, brand.cited) == (False, False, True)

    @pytest.mark.asyncio
    async def test_linked_inline_only(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        """An inline link with no textual mention and no reference.

        This is the row that a link-rows-as-master-list implementation would
        get wrong in the other direction, so it is asserted whole rather than
        on ``linked`` alone.
        """
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(
                session, fixture, link_urls=("https://acme.example/guide",)
            )
            await session.commit()
        async with session_factory() as session:
            evidence, brand = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        assert (brand.mentioned, brand.linked, brand.cited) == (False, True, False)
        assert [link.url for link in evidence.links] == ["https://acme.example/guide"]

    @pytest.mark.asyncio
    async def test_a_competitor_can_be_linked_without_being_named(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(
                session, fixture, link_urls=("https://globex.example/compare",)
            )
            await session.commit()
        async with session_factory() as session:
            evidence, _ = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        competitor = next(
            entity for entity in evidence.entities if entity.kind == "competitor"
        )
        assert competitor.name == "Globex"
        assert (competitor.mentioned, competitor.linked, competitor.cited) == (
            False,
            True,
            False,
        )


class TestMentionOrderIsDerived:
    @pytest.mark.asyncio
    async def test_an_unnamed_brand_has_no_order_rather_than_last_place(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(session, fixture, competitor_named=True)
            await session.commit()
        async with session_factory() as session:
            evidence, brand = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        competitor = next(
            entity for entity in evidence.entities if entity.kind == "competitor"
        )
        assert brand.mention_order is None
        assert competitor.mention_order == 1

    @pytest.mark.asyncio
    async def test_the_brand_ranks_ahead_of_a_later_competitor(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(
                session,
                fixture,
                brand_mentioned=True,
                brand_first_offset=0,
                competitor_named=True,
            )
            await session.commit()
        async with session_factory() as session:
            evidence, brand = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        competitor = next(
            entity for entity in evidence.entities if entity.kind == "competitor"
        )
        assert brand.mention_order == 1
        assert competitor.mention_order == 2


class TestSurfaceEvidencePresence:
    @pytest.mark.asyncio
    async def test_an_llm_execution_has_no_surface_evidence(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        """No observation row means None, not an empty observation."""
        async with session_factory() as session:
            evidence = await execution_surface_evidence(
                session,
                workspace_id=uuid.uuid4(),
                task_id=uuid.uuid4(),
                analysis=None,
            )
        assert evidence is None

    @pytest.mark.asyncio
    async def test_a_measured_absence_keeps_aio_present_false(
        self, session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        async with session_factory() as session:
            fixture = await _seed_audit(session)
            task_id = await _seed_observation(
                session,
                fixture,
                outcome=OUTCOME_NO_AI_OVERVIEW,
                aio_present=False,
            )
            await session.commit()
        async with session_factory() as session:
            evidence, _ = await _brand_row(
                session, workspace_id=fixture.workspace_id, task_id=task_id
            )
        assert evidence.aio_present is False
        assert evidence.outcome == OUTCOME_NO_AI_OVERVIEW
