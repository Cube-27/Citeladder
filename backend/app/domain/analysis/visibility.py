"""Persisted selected-run visibility projections."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.analysis.comparison import frozen_comparison_key
from app.analysis.normalization import normalize_domain
from app.core.config.audits import AUDIT_SCOPE_BRAND
from app.core.config.prompts import REQUESTABLE_PROMPT_COHORTS
from app.domain.analysis.errors import AnalysisNotFoundError, TrendQueryError
from app.domain.analysis.measurement import (
    competitor_rate,
    measurement_counts,
    observed_rate,
    prompt_performance,
)
from app.domain.analysis.projection_common import (
    _AUDIT_NOT_FOUND,
    aggregate_provenance,
    latest_dashboard_audit_id,
    load_snapshot,
)
from app.domain.analysis.schemas import (
    EngineComparisonRow,
    RankingRow,
    VisibilityResponse,
)
from app.domain.analysis.trend_folding import _brand_name
from app.domain.projects.logos import get_project_logo_urls
from app.domain.projects.service import get_project
from app.models.analysis import CompetitorMention, MetricSnapshot, ResponseAnalysis
from app.models.audit import Audit
from app.models.project import Project


async def get_visibility(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID | None = None,
    cohort: str = "core",
    logical_engine: str | None = None,
    baseline_id: uuid.UUID | None = None,
    selection_mode: str = "latest",
    from_at=None,
    to_at=None,
    configuration_key: str | None = None,
) -> VisibilityResponse:
    """Serve the selected-run dashboard projection for a project.

    Defaults to the project's latest completed/partially-completed audit when
    ``audit_id`` is omitted. Computed server-side from the persisted snapshot;
    no provider call (invariant 7).
    """
    from app.domain.analysis.trends import validate_engine_and_range

    validate_engine_and_range(
        logical_engine=logical_engine, from_at=from_at, to_at=to_at
    )
    resolved_mode = "run" if audit_id else "latest"
    if selection_mode == "run" and audit_id is None:
        raise TrendQueryError("A specific run selection requires audit_id")
    if selection_mode == "range":
        from app.domain.analysis.range_projection import get_range_visibility

        return await get_range_visibility(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            engine=logical_engine,
            cohort=cohort,
            from_at=from_at,
            to_at=to_at,
            configuration_key=configuration_key,
        )
    audit_id, audit = await _selected_audit(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
    )
    snapshot = await load_snapshot(
        session, workspace_id=workspace_id, audit_id=audit_id
    )
    metrics = _cohort_metrics(snapshot, cohort)
    if logical_engine is not None:
        metrics = dict((metrics.get("per_engine") or {}).get(logical_engine) or {})
    logo_urls, logo_identity_ids, website_urls = await _project_logo_context(
        session, workspace_id=workspace_id, project_id=project_id
    )
    model_provenance = aggregate_provenance(audit)
    from app.domain.analysis.comparison_projection import compare_selection

    comparison = await compare_selection(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit=audit,
        snapshot=snapshot,
        metrics=metrics,
        cohort=cohort,
        engine=logical_engine,
        baseline_id=baseline_id,
    )
    rankings = _rankings(
        metrics,
        logo_urls=logo_urls,
        logo_identity_ids=logo_identity_ids,
        website_urls=website_urls,
    )
    gaps = await competitor_gaps(
        session,
        workspace_id=workspace_id,
        audit_ids=[audit_id],
        cohort=cohort,
        logical_engine=logical_engine,
    )
    apply_ranking_comparison(rankings, comparison, gaps)
    counts = measurement_counts(metrics)
    return VisibilityResponse(
        project_id=project_id,
        audit_id=audit_id,
        audit_status=audit.status,
        selection_mode=resolved_mode,
        source_audit_ids=[audit_id],
        analyzer_version=snapshot.analyzer_version,
        scoring_rule_version=snapshot.scoring_rule_version,
        cohort=cohort,
        coverage=dict(metrics.get("coverage") or {}),
        total_completed=counts.responses,
        total_failed=counts.failed or 0,
        visibility_score=selected_score(snapshot, metrics, cohort, logical_engine),
        visibility_rate=observed_rate(metrics, "brand_mention_rate"),
        owned_citation_rate=observed_rate(metrics, "owned_citation_rate"),
        # The preserved prompt composite, which is a DIFFERENT measure from the
        # selected score above. Deriving both from `selected_score` reported one
        # of them twice — the separation this rework exists to make.
        prompt_performance_score=prompt_performance(metrics),
        counts=measurement_counts(metrics),
        comparison_key=frozen_comparison_key(
            audit.configuration, engine=logical_engine
        ),
        comparison=comparison,
        model_provenance=model_provenance,
        rankings=rankings,
        per_engine=_engine_rows({"per_engine": {logical_engine: metrics}})
        if logical_engine
        else _engine_rows(metrics),
        sentiment=metrics.get("sentiment"),
        avg_position=metrics.get("avg_position"),
        created_at=snapshot.created_at,
    )


async def _selected_audit(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID | None,
) -> tuple[uuid.UUID, Audit]:
    selected_id = audit_id or await latest_dashboard_audit_id(
        session, workspace_id=workspace_id, project_id=project_id
    )
    if selected_id is None:
        raise AnalysisNotFoundError("No completed audit for project")
    audit = await session.scalar(
        select(Audit)
        .options(selectinload(Audit.engine_snapshots))
        .where(
            Audit.id == selected_id,
            Audit.workspace_id == workspace_id,
            Audit.project_id == project_id,
            Audit.audit_scope == AUDIT_SCOPE_BRAND,
        )
    )
    if audit is None:
        raise AnalysisNotFoundError(_AUDIT_NOT_FOUND)
    return selected_id, audit


def _cohort_metrics(snapshot: MetricSnapshot, cohort: str) -> dict:
    if cohort not in REQUESTABLE_PROMPT_COHORTS:
        raise TrendQueryError(f"Unknown prompt cohort: {cohort!r}")
    stored_metrics = snapshot.metrics or {}
    return (
        stored_metrics
        if cohort == "core"
        else dict(stored_metrics.get("comparison") or {})
    )


async def _project_logo_context(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
) -> tuple[
    dict[uuid.UUID, str],
    dict[tuple[bool, str], uuid.UUID],
    dict[tuple[bool, str], str],
]:
    project = await get_project(
        session, workspace_id=workspace_id, project_id=project_id
    )
    logo_urls = get_project_logo_urls(project)
    identity_ids: dict[tuple[bool, str], uuid.UUID] = {}
    if project.brand is not None:
        identity_ids[(True, project.brand.name)] = project.brand.id
    for competitor in project.competitors:
        identity_ids[(False, competitor.name)] = competitor.id
    return logo_urls, identity_ids, _project_website_urls(project)


def _project_website_urls(project: Project) -> dict[tuple[bool, str], str]:
    website_urls: dict[tuple[bool, str], str] = {}
    if project.brand is not None:
        brand_website = _normalized_logo_website_url(
            project.website_url
            or next((item.domain for item in project.owned_domains if item.domain), "")
        )
        if brand_website:
            website_urls[(True, project.brand.name)] = brand_website
    for competitor in project.competitors:
        competitor_website = _normalized_logo_website_url(
            next(
                (str(domain) for domain in competitor.domains or [] if str(domain)),
                "",
            )
        )
        if competitor_website:
            website_urls[(False, competitor.name)] = competitor_website
    return website_urls


def _rankings(
    metrics: dict,
    *,
    logo_urls: dict[uuid.UUID, str] | None = None,
    logo_identity_ids: dict[tuple[bool, str], uuid.UUID] | None = None,
    website_urls: dict[tuple[bool, str], str] | None = None,
) -> list[RankingRow]:
    """Build the brand-vs-competitor rankings table from the aggregate.

    Visibility % (mention rate) + SOV are populated; sentiment + average
    position are present but null (decision B-2).
    """
    sov = metrics.get("share_of_voice") or {}
    counts = sov.get("mention_counts") or {}
    total_presences = sum(counts.values())
    share = {
        name: count / total_presences if total_presences else None
        for name, count in counts.items()
    }
    brand_name = _brand_name(counts, metrics)
    competitor_mention = metrics.get("competitor_mention_rate") or {}

    rows = [
        _ranking_row(
            name=brand_name,
            is_brand=True,
            mention_rate=observed_rate(metrics, "brand_mention_rate"),
            citation_rate=observed_rate(metrics, "owned_citation_rate"),
            share=share,
            counts=counts,
            logo_urls=logo_urls or {},
            identity_ids=logo_identity_ids or {},
            website_urls=website_urls,
        ),
        *[
            _ranking_row(
                name=name,
                is_brand=False,
                mention_rate=competitor_rate(metrics, "competitor_mention_rate", name),
                citation_rate=competitor_rate(
                    metrics, "competitor_citation_rate", name
                ),
                share=share,
                counts=counts,
                logo_urls=logo_urls or {},
                identity_ids=logo_identity_ids or {},
                website_urls=website_urls,
            )
            for name in competitor_mention
        ],
    ]
    # Deterministic order: highest SOV first, then name for stable ties.
    rows.sort(key=lambda r: (-(r.share_of_voice or 0.0), r.name))
    return rows


def _ranking_row(
    *,
    name: str,
    is_brand: bool,
    mention_rate: object,
    citation_rate: object,
    share: dict,
    counts: dict,
    logo_urls: dict[uuid.UUID, str],
    identity_ids: dict[tuple[bool, str], uuid.UUID],
    website_urls: dict[tuple[bool, str], str] | None,
) -> RankingRow:
    return RankingRow(
        name=name,
        is_brand=is_brand,
        logo_url=_logo_url_for_name(name, is_brand, logo_urls, identity_ids),
        website_url=_website_url_for_name(name, is_brand, website_urls),
        mention_rate=mention_rate,
        citation_rate=citation_rate,
        share_of_voice=share.get(name),
        mention_count=int(counts.get(name, 0) or 0),
    )


def _logo_url_for_name(
    name: str,
    is_brand: bool,
    logo_urls: dict[uuid.UUID, str],
    identity_ids: dict[tuple[bool, str], uuid.UUID],
) -> str | None:
    identity_id = identity_ids.get((is_brand, name))
    return logo_urls.get(identity_id) if identity_id is not None else None


def _website_url_for_name(
    name: str,
    is_brand: bool,
    website_urls: dict[tuple[bool, str], str] | None,
) -> str | None:
    return website_urls.get((is_brand, name)) if website_urls is not None else None


def _normalized_logo_website_url(value: object) -> str | None:
    domain = normalize_domain(value)
    return f"https://{domain}" if domain else None


def _engine_rows(metrics: dict) -> list[EngineComparisonRow]:
    per_engine = metrics.get("per_engine") or {}
    rows: list[EngineComparisonRow] = []
    for engine, agg in sorted(per_engine.items()):
        rate = observed_rate(agg, "brand_mention_rate")
        rows.append(
            EngineComparisonRow(
                logical_engine=engine,
                total_completed=int(agg.get("total_completed", 0) or 0),
                brand_mention_rate=rate,
                owned_citation_rate=observed_rate(agg, "owned_citation_rate"),
                counts=measurement_counts(agg),
                search_use_rate=agg.get("search_use_rate"),
                visibility_score=prompt_performance(agg),
            )
        )
    return rows


# --- Cross-run Visibility trend projection helpers (pure, invariant 7) -----
#
# Every helper below reads only the already-persisted ``MetricSnapshot.metrics``
# dict (the same shape the single-run dashboard reads) and the owning ``Audit``
# timestamp/status. None of them re-score, re-extract, or call a provider.


async def competitor_gaps(session, *, workspace_id, audit_ids, cohort, logical_engine):
    gap_query = (
        select(
            CompetitorMention.competitor_name,
            func.count(func.distinct(ResponseAnalysis.id)),
        )
        .join(
            ResponseAnalysis,
            ResponseAnalysis.id == CompetitorMention.analysis_id,
        )
        .where(
            ResponseAnalysis.workspace_id == workspace_id,
            ResponseAnalysis.audit_id.in_(audit_ids),
            ResponseAnalysis.brand_mentioned.is_(False),
            ResponseAnalysis.cohort == cohort,
        )
    )
    if logical_engine:
        gap_query = gap_query.where(ResponseAnalysis.logical_engine == logical_engine)
    gaps = {
        name: count
        for name, count in (
            await session.execute(gap_query.group_by(CompetitorMention.competitor_name))
        ).all()
    }
    return gaps


def apply_ranking_comparison(rankings, comparison, gaps):
    baseline_rows = {row.name: row for row in comparison.rankings}
    matched_rows = {row.name: row for row in comparison.current_rankings}
    for row in rankings:
        row.gap_count = gaps.get(row.name, 0) if not row.is_brand else None
        before = baseline_rows.get(row.name)
        if (
            comparison.status == "comparable"
            and before
            and before.mention_rate is not None
            and row.mention_rate is not None
        ):
            row.visibility_delta = (row.mention_rate - before.mention_rate) * 100
        if comparison.status == "matched_subset" and before:
            _matched_ranking_change(
                row, matched_rows.get(row.name), before, comparison.matched_cells
            )


def _matched_ranking_change(row, matched, before, count):
    if matched and matched.mention_rate is not None and before.mention_rate is not None:
        row.matched_visibility_rate = matched.mention_rate
        row.matched_visibility_delta = (
            matched.mention_rate - before.mention_rate
        ) * 100
        row.matched_response_count = count


def selected_score(snapshot, metrics, cohort, engine):
    if not metrics.get("total_completed"):
        return None
    if cohort == "core" and engine is None:
        return snapshot.visibility_score
    return prompt_performance(metrics)
