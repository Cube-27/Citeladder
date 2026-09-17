"""Reading one audit's persisted visibility evidence for the detectors.

Split out of ``recompute.py``, which orchestrates the whole recompute and had
reached its module ceiling. What lives here is the read half of that: the
queries that turn persisted analyses, citations, mentions and prompt snapshots
into the frozen ``VisibilityEvidence`` bundle the pure detectors consume.

Nothing here detects, scores or writes. Every function is a projection of rows
that already exist.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.opportunities.detectors import (
    AnalysisEvidence,
    PromptSnapshotEvidence,
    VisibilityEvidence,
)
from app.analysis.opportunities.source_patterns import CitationEvidence
from app.core.config.opportunities import RECOMPUTE_MAX_ANALYSES
from app.models.analysis import (
    Citation,
    CompetitorMention,
    MetricSnapshot,
    ResponseAnalysis,
)
from app.models.audit import Audit, AuditPromptSnapshot
from app.models.brand import OwnedDomain

__all__ = ["load_visibility_evidence"]


def _visibility_credits(
    citations: list[Citation], mentions: list[CompetitorMention]
) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, set[str]]]:
    """Fold owned citations and competitor identities by analysis."""
    owned_counts: dict[uuid.UUID, int] = {}
    competitor_names: dict[uuid.UUID, set[str]] = {}
    for citation in citations:
        if citation.is_owned:
            owned_counts[citation.analysis_id] = (
                owned_counts.get(citation.analysis_id, 0) + 1
            )
        if citation.matched_competitor:
            competitor_names.setdefault(citation.analysis_id, set()).add(
                citation.matched_competitor
            )
    for mention in mentions:
        if mention.competitor_name:
            competitor_names.setdefault(mention.analysis_id, set()).add(
                mention.competitor_name
            )
    return owned_counts, competitor_names


def _citations_by_analysis(
    citations: list[Citation],
) -> dict[uuid.UUID, tuple[CitationEvidence, ...]]:
    """Project persisted citations into detector evidence, keyed by analysis.

    Carries the analyzer's OWN identity verdicts (``is_owned`` /
    ``matched_competitor``) forward untouched — the source-pattern taxonomy
    classifies only what the analyzer already left as third party. Input order
    is the caller's query order (analysis, then ordinal), which is what makes
    the summarized representative citation per domain deterministic.
    """
    grouped: dict[uuid.UUID, list[CitationEvidence]] = {}
    for citation in citations:
        grouped.setdefault(citation.analysis_id, []).append(
            CitationEvidence(
                domain=citation.domain or "",
                url=citation.url or "",
                title=citation.title or "",
                is_owned=citation.is_owned,
                matched_competitor=citation.matched_competitor,
            )
        )
    return {analysis_id: tuple(rows) for analysis_id, rows in grouped.items()}


async def owned_domain_list(
    session: AsyncSession, *, project_id: uuid.UUID
) -> list[str]:
    """The project's reviewed owned domains, in one deterministic order.

    The ORDER is the point: a placement check freezes this list into its
    expectation, so two callers ordering it differently would freeze two
    different-looking records of the same fact.
    """
    return list(
        (
            await session.scalars(
                select(OwnedDomain.domain)
                .where(OwnedDomain.project_id == project_id)
                .order_by(OwnedDomain.domain.asc())
            )
        ).all()
    )


async def load_visibility_evidence(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit: Audit
) -> tuple[VisibilityEvidence, MetricSnapshot | None]:
    """Load analyses/citations/mentions/snapshots + the metric snapshot."""
    analyses = list(
        (
            await session.scalars(
                select(ResponseAnalysis)
                .where(
                    ResponseAnalysis.audit_id == audit.id,
                    ResponseAnalysis.workspace_id == workspace_id,
                )
                .order_by(
                    ResponseAnalysis.prompt_index.asc(),
                    ResponseAnalysis.id.asc(),
                )
                .limit(RECOMPUTE_MAX_ANALYSES)
            )
        ).all()
    )
    analysis_ids = [a.id for a in analyses]

    owned_counts: dict[uuid.UUID, int] = {}
    competitor_names: dict[uuid.UUID, set[str]] = {}
    citation_evidence: dict[uuid.UUID, tuple[CitationEvidence, ...]] = {}
    if analysis_ids:
        citations = list(
            (
                await session.scalars(
                    select(Citation)
                    .where(Citation.analysis_id.in_(analysis_ids))
                    .order_by(Citation.analysis_id.asc(), Citation.ordinal.asc())
                )
            ).all()
        )
        mentions = list(
            (
                await session.scalars(
                    select(CompetitorMention)
                    .where(CompetitorMention.analysis_id.in_(analysis_ids))
                    .order_by(
                        CompetitorMention.created_at.asc(), CompetitorMention.id.asc()
                    )
                )
            ).all()
        )
        owned_counts, competitor_names = _visibility_credits(citations, mentions)
        citation_evidence = _citations_by_analysis(citations)

    snapshots = list(
        (
            await session.scalars(
                select(AuditPromptSnapshot)
                .where(AuditPromptSnapshot.audit_id == audit.id)
                .order_by(AuditPromptSnapshot.prompt_index.asc())
            )
        ).all()
    )
    owned_domains = await owned_domain_list(session, project_id=audit.project_id)
    metric_snapshot = await session.scalar(
        select(MetricSnapshot).where(
            MetricSnapshot.audit_id == audit.id,
            MetricSnapshot.workspace_id == workspace_id,
        )
    )
    evidence = VisibilityEvidence(
        audit_id=audit.id,
        analyses=tuple(
            AnalysisEvidence(
                analysis_id=a.id,
                prompt_index=a.prompt_index,
                logical_engine=a.logical_engine or "",
                owned_citation_count=owned_counts.get(a.id, 0),
                brand_mentioned=bool(a.brand_mentioned),
                competitor_names=tuple(sorted(competitor_names.get(a.id, ()))),
                citations=citation_evidence.get(a.id, ()),
                artifact_id=a.artifact_id,
                entity_assessments=tuple(a.entity_assessments or []),
            )
            for a in analyses
        ),
        prompt_snapshots=tuple(
            PromptSnapshotEvidence(
                prompt_index=s.prompt_index,
                prompt_id=s.prompt_id,
                text=s.text or "",
                theme=s.theme or "",
                intent=s.intent or "",
                buyer_stage=s.buyer_stage or "",
                prompt_intent=s.prompt_intent or "",
                snapshot_id=s.id,
            )
            for s in snapshots
        ),
        owned_domains=tuple(sorted(owned_domains)),
    )
    return evidence, metric_snapshot
