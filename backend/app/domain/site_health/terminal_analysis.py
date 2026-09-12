"""Publish the immutable terminal page-analysis revision for a crawl."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.site_health.rules import RuleEvaluation
from app.analysis.site_health.scoring import score_analysis
from app.models.site_health.analysis import SitePageAnalysis, SiteRuleEvaluation
from app.models.site_health.crawl import SiteCrawl


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _rule_evaluation(row: SiteRuleEvaluation) -> RuleEvaluation:
    return RuleEvaluation(
        rule_id=row.rule_id,
        rule_version=row.rule_version,
        dimension=row.dimension,
        category=row.category,
        severity=row.severity,
        finding_class=row.finding_class,
        weight=row.weight,
        outcome=row.outcome,
        evidence=dict(row.evidence or {}),
        display_applicability=row.display_applicability,
        score_applicability=row.score_applicability,
        reason_code=row.reason_code,
        score_roles=tuple(row.score_roles or ()),
        readiness_dimension=row.readiness_dimension,
        readiness_weight=row.readiness_weight,
        scope=row.scope,
    )


def _final_analysis(
    initial: SitePageAnalysis,
    source_rows: list[SiteRuleEvaluation],
    crawl: SiteCrawl,
) -> SitePageAnalysis:
    scores = score_analysis(
        [_rule_evaluation(row) for row in source_rows],
        page_kind=initial.page_kind,
        page_traits=tuple(initial.page_traits or ()),
    )
    evaluation_id_by_rule = {row.rule_id: row.id for row in source_rows}
    audit_time = crawl.started_at or crawl.created_at
    checklist = [
        {
            **entry,
            "evaluation_id": str(evaluation_id_by_rule[entry["check_id"]]),
            "audit_time": audit_time.isoformat() if audit_time else None,
        }
        for entry in scores.expected_checkpoint_profile
    ]
    return SitePageAnalysis(
        workspace_id=crawl.workspace_id,
        project_id=crawl.project_id,
        crawl_id=crawl.id,
        site_url_id=initial.site_url_id,
        artifact_id=initial.artifact_id,
        status=initial.status,
        web_fundamentals_score=scores.web_fundamentals_score,
        web_fundamentals_coverage=scores.web_fundamentals_coverage,
        web_fundamentals_state=scores.web_fundamentals_state,
        technical_earned_weight=scores.technical_earned_weight,
        technical_determinate_weight=scores.technical_determinate_weight,
        technical_expected_weight=scores.technical_expected_weight,
        technical_critical_complete=scores.technical_critical_complete,
        aeo_readiness_score=scores.aeo_readiness_score,
        aeo_measurement_coverage=scores.aeo_measurement_coverage,
        aeo_measurement_state=scores.aeo_measurement_state,
        aeo_measurement_reason=scores.aeo_measurement_reason,
        expected_checkpoint_profile=checklist,
        readiness_dimensions=[item.to_dict() for item in scores.readiness_dimensions],
        profile_version=initial.profile_version,
        schema_contract_version=initial.schema_contract_version,
        presentation_version=initial.presentation_version,
        main_content_indexable=scores.main_content_indexable,
        analyzer_version=initial.analyzer_version,
        scoring_version=scores.scoring_version,
        page_kind=initial.page_kind,
        classifier_version=initial.classifier_version,
        page_kind_evidence=initial.page_kind_evidence,
        page_traits=initial.page_traits,
        traits_version=initial.traits_version,
        is_current=True,
        supersedes_analysis_id=initial.id,
        source_evaluation_ids=[row.id for row in source_rows],
        source_artifact_ids=list(initial.source_artifact_ids or [initial.artifact_id]),
        finalized_at=_utcnow(),
    )


async def publish_final_page_analyses(
    session: AsyncSession, *, crawl: SiteCrawl
) -> None:
    """Append one terminal result per current initial analysis.

    Evaluations and issues remain immutable children of the initial analysis.
    The final row freezes their IDs and becomes the sole current result.
    Replays are idempotent because finalized current rows are not selected.
    """
    initial_rows = list(
        await session.scalars(
            select(SitePageAnalysis)
            .where(
                SitePageAnalysis.workspace_id == crawl.workspace_id,
                SitePageAnalysis.project_id == crawl.project_id,
                SitePageAnalysis.crawl_id == crawl.id,
                SitePageAnalysis.is_current.is_(True),
                SitePageAnalysis.finalized_at.is_(None),
            )
            .order_by(SitePageAnalysis.site_url_id, SitePageAnalysis.id)
        )
    )
    if not initial_rows:
        return

    evaluations = list(
        await session.scalars(
            select(SiteRuleEvaluation)
            .where(
                SiteRuleEvaluation.workspace_id == crawl.workspace_id,
                SiteRuleEvaluation.analysis_id.in_([row.id for row in initial_rows]),
            )
            .order_by(SiteRuleEvaluation.analysis_id, SiteRuleEvaluation.rule_id)
        )
    )
    by_analysis: dict[uuid.UUID, list[SiteRuleEvaluation]] = {}
    for evaluation in evaluations:
        by_analysis.setdefault(evaluation.analysis_id, []).append(evaluation)

    await session.execute(
        update(SitePageAnalysis)
        .where(
            SitePageAnalysis.workspace_id == crawl.workspace_id,
            SitePageAnalysis.project_id == crawl.project_id,
            SitePageAnalysis.crawl_id == crawl.id,
            SitePageAnalysis.id.in_([row.id for row in initial_rows]),
        )
        .values(is_current=False)
    )
    await session.flush()

    for initial in initial_rows:
        source_rows = by_analysis.get(initial.id, [])
        session.add(_final_analysis(initial, source_rows, crawl))
    await session.flush()
