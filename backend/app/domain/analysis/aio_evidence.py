"""Read the Google AI Overview surface: one execution, or one selection.

Two readers live here because they answer the two questions the surface
raises and nothing else in the analysis layer answers.

``execution_surface_evidence`` composes what ONE overview showed. The three
signals it composes -- mentioned, linked and cited -- come from three
independent tables and are never derived from one another. The committed
sample proves they come apart in both directions: an entity linked inline but
absent from the references, and an entity in the references that no inline
link points at. Using the link rows as the master entity list would quietly
collapse that into one signal.

``surface_rates`` folds a run selection's observations into the five rates in
``aio_rates``, each carrying the denominator it divided by. Failed and pending
observations are excluded from every denominator and counted separately: a
task CiteLadder could not retrieve says nothing about whether Google showed
the brand, and counting it as an absence would publish our own failures as the
brand's.

Nothing here classifies a domain on its own. Link ownership is decided by the
SAME ``classify_citation`` the scorer used on the references, so an owned
domain cannot be owned in one panel and third-party in the next.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.analysis.position import brand_position, competitor_position
from app.analysis.scoring import ScoringConfig, classify_citation
from app.connectors.search_surfaces.contracts import OUTCOME_AI_OVERVIEW_PRESENT
from app.core.config.provider_catalog import LOGICAL_ENGINES, is_search_surface
from app.domain.analysis.aio_rates import (
    AioObservationCounts,
    AioRate,
    brand_mention_rate_when_present,
    competitor_mention_rate,
    count_observations,
    overall_brand_visibility,
    owned_citation_rate_when_present,
    trigger_rate,
)
from app.domain.analysis.aio_schemas import (
    AioCompetitorRate,
    AioLinkEvidence,
    AioRateValue,
    SearchSurfaceEvidence,
    SurfaceEntityEvidence,
    SurfaceRatesResponse,
)
from app.domain.analysis.errors import TrendQueryError
from app.domain.analysis.selection import authorize_run_set
from app.models.analysis import Citation, CompetitorMention, ResponseAnalysis
from app.models.audit import Audit, AuditPromptSnapshot, AuditTask
from app.models.search_surfaces import AioEntityLink, AioObservation

_BRAND = "brand"
_COMPETITOR = "competitor"


# ---------------------------------------------------------------------------
# One execution
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# One selection
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Scope:
    """The run selection every rate below is counted over, resolved once."""

    workspace_id: uuid.UUID
    project_id: uuid.UUID
    audit_id: uuid.UUID | None
    audit_ids: tuple[uuid.UUID, ...]
    cohort: str

    def conditions(self) -> list[ColumnElement[bool]]:
        """Cohort is filtered through the frozen PROMPT SNAPSHOT.

        Not through the analysis row: a failed observation never reaches
        ``analyze_task`` and has no analysis to carry a cohort, so filtering
        there would drop exactly the rows the excluded count exists to report.
        """
        where: list[ColumnElement[bool]] = [
            AioObservation.workspace_id == self.workspace_id,
            Audit.project_id == self.project_id,
            AuditPromptSnapshot.cohort == self.cohort,
        ]
        if self.audit_ids:
            where.append(AioObservation.audit_id.in_(self.audit_ids))
        elif self.audit_id is not None:
            where.append(AioObservation.audit_id == self.audit_id)
        return where


def _scoped(scope: _Scope, *columns: Any) -> Any:
    """Select ``columns`` over the scoped observations and their analyses.

    ``outerjoin`` on the analysis on purpose, for the same reason the cohort
    filter sits on the prompt snapshot: an inner join would silently discard
    every observation CiteLadder failed to retrieve.
    """
    return (
        select(*columns)
        .select_from(AioObservation)
        .join(Audit, Audit.id == AioObservation.audit_id)
        .join(AuditTask, AuditTask.id == AioObservation.task_id)
        .join(
            AuditPromptSnapshot,
            (AuditPromptSnapshot.audit_id == AioObservation.audit_id)
            & (AuditPromptSnapshot.prompt_index == AuditTask.prompt_index),
        )
        .outerjoin(ResponseAnalysis, ResponseAnalysis.task_id == AioObservation.task_id)
        .where(*scope.conditions())
    )


async def surface_rates(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    logical_engine: str,
    audit_id: uuid.UUID | None = None,
    audit_ids: list[uuid.UUID] | None = None,
    cohort: str = "core",
) -> SurfaceRatesResponse:
    """The five labelled rates over one measurement selection.

    An engine that is not an observed surface has no rates rather than empty
    ones: asking an LLM for a trigger rate is a category error, and answering
    with zeroes would look like one that measured nothing. A name that is not
    an engine AT ALL is a different thing again -- a typo, not a question --
    and is rejected rather than answered, so a misspelled filter cannot read
    as a surface that measured nothing.
    """
    if logical_engine not in LOGICAL_ENGINES:
        raise TrendQueryError(f"Unknown logical engine: {logical_engine!r}")
    if not is_search_surface(logical_engine):
        return SurfaceRatesResponse(logical_engine=logical_engine)
    # The single `audit_id` needs authorizing exactly as much as the set does.
    # Left out, an unknown or out-of-scope id simply matched no rows and the
    # caller got zero-denominator rates -- our own 200 reading as a measured
    # absence -- where the run set answers 404. `conditions()` already gives
    # `audit_ids` precedence over `audit_id`, so this mirrors that order.
    await authorize_run_set(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_ids=audit_ids or ([audit_id] if audit_id is not None else None),
    )
    scope = _Scope(
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
        audit_ids=tuple(audit_ids or ()),
        cohort=cohort,
    )
    counts = count_observations(
        [
            (str(outcome), present, bool(mentioned), bool(owned))
            for outcome, present, mentioned, owned in (
                await session.execute(
                    _scoped(
                        scope,
                        AioObservation.outcome,
                        AioObservation.aio_present,
                        ResponseAnalysis.brand_mentioned,
                        ResponseAnalysis.owned_domain_cited,
                    )
                )
            ).all()
        ]
    )
    competitors = await _competitor_counts(session, scope=scope)
    return _rates_response(logical_engine, counts, competitors)


def _rates_response(
    logical_engine: str,
    counts: AioObservationCounts,
    competitors: dict[str, int],
) -> SurfaceRatesResponse:
    return SurfaceRatesResponse(
        logical_engine=logical_engine,
        successful=counts.successful,
        with_overview=counts.with_overview,
        excluded=counts.excluded,
        trigger_rate=_rate_value(trigger_rate(counts)),
        brand_mention_rate_when_present=_rate_value(
            brand_mention_rate_when_present(counts)
        ),
        overall_brand_visibility=_rate_value(overall_brand_visibility(counts)),
        owned_citation_rate_when_present=_rate_value(
            owned_citation_rate_when_present(counts)
        ),
        competitor_mention_rates=[
            AioCompetitorRate(
                name=name,
                rate=_rate_value(
                    competitor_mention_rate(counts, competitor_mentions=total)
                ),
            )
            for name, total in sorted(competitors.items())
        ],
    )


async def _competitor_counts(session: AsyncSession, *, scope: _Scope) -> dict[str, int]:
    """Overviews naming each competitor, over the same scoped observations.

    Counted over DISTINCT observations so a competitor named twice in one
    overview cannot lift its own rate above the denominator.
    """
    rows = (
        await session.execute(
            _scoped(
                scope,
                CompetitorMention.competitor_name,
                func.count(func.distinct(AioObservation.task_id)),
            )
            .join(
                CompetitorMention,
                CompetitorMention.analysis_id == ResponseAnalysis.id,
            )
            .where(AioObservation.outcome == OUTCOME_AI_OVERVIEW_PRESENT)
            .group_by(CompetitorMention.competitor_name)
        )
    ).all()
    return {str(name): int(total) for name, total in rows}


def _rate_value(rate: AioRate) -> AioRateValue:
    """Carry a rate across the API boundary WITH its denominator.

    ``value`` stays ``None`` for unavailable all the way to the renderer. If
    it were coerced to 0.0 anywhere on this path, the distinction the rate
    module exists to keep would be gone by the time anyone read it.
    """
    return AioRateValue(
        numerator=rate.numerator,
        denominator=rate.denominator,
        denominator_kind=rate.denominator_kind,
        value=rate.value,
    )
