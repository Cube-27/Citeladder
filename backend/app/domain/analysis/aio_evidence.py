"""Read what one Google AI Overview execution showed.

``execution_surface_evidence`` composes what ONE overview showed. The three
signals it composes -- mentioned, linked and cited -- come from three
independent tables and are never derived from one another. The committed
sample proves they come apart in both directions: an entity linked inline but
absent from the references, and an entity in the references that no inline
link points at. Using the link rows as the master entity list would quietly
collapse that into one signal.

MCP's execution reader calls it through ``get_execution_evidence``. The HTTP
execution route and the selection's rates moved to the TypeScript API service
(``frontend/services/api/src/visibility/surface.ts``); this copy stays until
its last Python caller moves (TypeScript migration rule 2).

Nothing here classifies a domain on its own. Link ownership is decided by the
SAME ``classify_citation`` the scorer used on the references, so an owned
domain cannot be owned in one panel and third-party in the next.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.analysis.position import brand_position, competitor_position
from app.analysis.scoring import ScoringConfig, classify_citation
from app.domain.analysis.aio_schemas import (
    AioLinkEvidence,
    SearchSurfaceEvidence,
    SurfaceEntityEvidence,
)
from app.models.analysis import Citation, CompetitorMention, ResponseAnalysis
from app.models.audit import Audit
from app.models.search_surfaces import AioEntityLink, AioObservation

_BRAND = "brand"
_COMPETITOR = "competitor"


async def execution_surface_evidence(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    task_id: uuid.UUID,
    analysis: ResponseAnalysis | None,
) -> SearchSurfaceEvidence | None:
    """The observed-surface evidence for one execution, or None.

    None means this execution has no observation row: either it is an LLM
    execution, or it is a search execution that never reached a terminal
    outcome. Neither is a measured absence, and the caller must not render one.
    """
    observation = await session.scalar(
        select(AioObservation)
        .where(
            AioObservation.task_id == task_id,
            AioObservation.workspace_id == workspace_id,
        )
        .options(selectinload(AioObservation.entity_links))
    )
    if observation is None:
        return None
    links = sorted(
        observation.entity_links, key=lambda link: (link.element_index, link.url)
    )
    return SearchSurfaceEvidence(
        outcome=observation.outcome,
        aio_present=observation.aio_present,
        aio_serp_position=observation.aio_serp_position,
        provider_status_code=observation.provider_status_code,
        error_code=observation.error_code,
        element_count=observation.element_count,
        reference_count=observation.reference_count,
        location_code=observation.location_code,
        language_code=observation.language_code,
        device=observation.device,
        observed_at=observation.observed_at,
        retrieved_at=observation.retrieved_at,
        links=[AioLinkEvidence.model_validate(link) for link in links],
        entities=await _composed_entities(
            session,
            analysis=analysis,
            links=links,
            audit_id=observation.audit_id,
        ),
    )


async def _composed_entities(
    session: AsyncSession,
    *,
    analysis: ResponseAnalysis | None,
    links: list[AioEntityLink],
    audit_id: uuid.UUID,
) -> list[SurfaceEntityEvidence]:
    """Every TRACKED entity, with its three signals read independently.

    The entity list comes from the run's frozen scoring configuration, not
    from any one signal. An entity that was only linked, or only cited, still
    gets a row; an entity that appears in none of the three is still listed,
    because "we looked and it was not there" is itself the finding.

    No analysis means no answer was ever scored, so there is nothing to
    compose and an empty list is the honest answer.
    """
    audit = await session.scalar(select(Audit).where(Audit.id == audit_id))
    if analysis is None or audit is None:
        return []
    config = ScoringConfig.from_project(dict(audit.configuration or {}))
    score = dict(analysis.score or {})
    offsets = dict(score.get("competitor_first_offsets") or {})
    brand_cited, cited_competitors = await _cited_entities(
        session, analysis_id=analysis.id
    )
    mentioned = await _mentioned_competitors(session, analysis_id=analysis.id)
    brand_linked, linked_competitors = _linked_entities(links, config)

    rows = [
        SurfaceEntityEvidence(
            name=config.brand_name or "Brand",
            kind=_BRAND,
            mentioned=analysis.brand_mentioned,
            linked=brand_linked,
            cited=brand_cited,
            first_offset=analysis.brand_first_offset,
            mention_order=brand_position(analysis.brand_first_offset, offsets),
        )
    ]
    rows.extend(
        SurfaceEntityEvidence(
            name=competitor.name,
            kind=_COMPETITOR,
            mentioned=competitor.name in mentioned,
            linked=competitor.name in linked_competitors,
            cited=competitor.name in cited_competitors,
            first_offset=offsets.get(competitor.name),
            mention_order=competitor_position(score, competitor.name),
        )
        for competitor in config.competitors
    )
    return rows


def _linked_entities(
    links: list[AioEntityLink], config: ScoringConfig
) -> tuple[bool, set[str]]:
    """Which tracked entities an INLINE link pointed at.

    Classified by the scorer's own rule rather than a second domain match, so
    a link and a reference to the same host cannot disagree about who owns it.
    """
    brand = False
    competitors: set[str] = set()
    for link in links:
        classified = classify_citation({"url": link.url, "domain": link.domain}, config)
        brand = brand or bool(classified["is_owned"])
        matched = classified["matched_competitor"]
        if matched:
            competitors.add(str(matched))
    return brand, competitors


async def _cited_entities(
    session: AsyncSession, *, analysis_id: uuid.UUID
) -> tuple[bool, set[str]]:
    """Which tracked entities a ROOT reference cited, by URL identity.

    The brand comes back as its own flag rather than a name in the set: a
    competitor may legitimately be called "Brand", and a token sharing the
    namespace would make that competitor read as the tracked brand.
    """
    rows = (
        await session.execute(
            select(Citation.is_owned, Citation.matched_competitor).where(
                Citation.analysis_id == analysis_id
            )
        )
    ).all()
    competitors = {str(matched) for _, matched in rows if matched}
    return any(is_owned for is_owned, _ in rows), competitors


async def _mentioned_competitors(
    session: AsyncSession, *, analysis_id: uuid.UUID
) -> set[str]:
    """Competitor names the ANSWER TEXT named, from the persisted rows."""
    return set(
        (
            await session.scalars(
                select(CompetitorMention.competitor_name).where(
                    CompetitorMention.analysis_id == analysis_id
                )
            )
        ).all()
    )
