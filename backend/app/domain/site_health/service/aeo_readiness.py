"""Bounded Content hand-off evidence for one page's readiness gap (Agent bridge)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_PARTIAL,
)
from app.core.config.site_health_measurement import (
    CONTENT_ADDRESSABLE_CHECK_FIELDS,
    CONTENT_ADDRESSABLE_CHECK_IDS,
)
from app.domain.site_health.aeo_readiness_projection import rule_guidance
from app.domain.site_health.service.common import (
    SiteHealthNotFoundError,
)
from app.models.site_health.analysis import SitePageAnalysis, SiteRuleEvaluation
from app.models.site_health.urls import SiteUrl


def _allowed_content_checkpoints(dimension: str, checkpoint_ids: list[str]) -> set[str]:
    """The requested checks a Content draft can resolve.

    Two rules used to be spelled here as a literal, which put a tunable set in
    service code and let it drift from the catalog flag the UI rendered links
    from. The set now comes from config, and an unsupported id is DROPPED
    rather than failing the whole request: a page missing its title and three
    things Content cannot write should still open a title draft.
    """
    del dimension
    allowed = set(checkpoint_ids) & CONTENT_ADDRESSABLE_CHECK_IDS
    if allowed:
        return allowed
    raise SiteHealthNotFoundError("Content-addressable readiness gap not found")


async def _handoff_analysis(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    crawl_id: uuid.UUID,
    site_url_id: uuid.UUID,
    source_analysis_id: uuid.UUID | None,
) -> tuple[SitePageAnalysis, SiteUrl]:
    """The page's CURRENT terminal analysis for this crawl.

    Addressed by crawl and URL, not by a revision id. Terminalization appends
    a new current analysis, so an id a surface captured while the crawl was
    running names a superseded row — and the hand-off answered 404 for it. A
    supplied ``source_analysis_id`` is honoured only as an assertion.
    """
    analysis_row = await session.execute(
        select(SitePageAnalysis, SiteUrl)
        .join(SiteUrl, SiteUrl.id == SitePageAnalysis.site_url_id)
        .where(
            SitePageAnalysis.workspace_id == workspace_id,
            SitePageAnalysis.project_id == project_id,
            SitePageAnalysis.crawl_id == crawl_id,
            SitePageAnalysis.site_url_id == site_url_id,
            SitePageAnalysis.is_current.is_(True),
            SitePageAnalysis.finalized_at.is_not(None),
        )
    )
    found = analysis_row.one_or_none()
    if (
        found is not None
        and source_analysis_id is not None
        and found[0].id != source_analysis_id
        and found[0].supersedes_analysis_id != source_analysis_id
    ):
        found = None
    if found is None:
        raise SiteHealthNotFoundError("Site Health handoff evidence not found")
    analysis, site_url = found
    return analysis, site_url


async def _handoff_evaluations(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    allowed: set[str],
    source_evaluation_ids: list[uuid.UUID],
) -> list[SiteRuleEvaluation]:
    rows = list(
        await session.scalars(
            select(SiteRuleEvaluation)
            .where(
                SiteRuleEvaluation.workspace_id == workspace_id,
                SiteRuleEvaluation.id.in_(source_evaluation_ids),
                SiteRuleEvaluation.rule_id.in_(allowed),
                SiteRuleEvaluation.outcome.in_(
                    (RULE_OUTCOME_MISSING, RULE_OUTCOME_PARTIAL)
                ),
            )
            .order_by(SiteRuleEvaluation.rule_id)
        )
    )
    if rows:
        return rows
    raise SiteHealthNotFoundError("Content-addressable readiness gap not found")


async def get_content_handoff(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    crawl_id: uuid.UUID,
    site_url_id: uuid.UUID,
    dimension: str,
    checkpoint_ids: list[str],
    source_analysis_id: uuid.UUID | None = None,
) -> dict:
    analysis, site_url = await _handoff_analysis(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        crawl_id=crawl_id,
        site_url_id=site_url_id,
        source_analysis_id=source_analysis_id,
    )
    allowed = _allowed_content_checkpoints(dimension, checkpoint_ids)
    evaluations = await _handoff_evaluations(
        session,
        workspace_id=workspace_id,
        allowed=allowed,
        source_evaluation_ids=list(analysis.source_evaluation_ids or []),
    )
    return _content_handoff_payload(
        analysis=analysis,
        site_url=site_url,
        evaluations=evaluations,
        project_id=project_id,
        crawl_id=crawl_id,
        site_url_id=site_url_id,
        source_analysis_id=analysis.id,
    )


def _target_field(row: SiteRuleEvaluation) -> str:
    return CONTENT_ADDRESSABLE_CHECK_FIELDS.get(row.rule_id, "")


def _captured_value(row: SiteRuleEvaluation) -> str:
    evidence = row.evidence or {}
    return str(evidence.get("title") or evidence.get("meta_description") or "")


def _content_handoff_payload(
    *,
    analysis: SitePageAnalysis,
    site_url: SiteUrl,
    evaluations: list[SiteRuleEvaluation],
    project_id: uuid.UUID,
    crawl_id: uuid.UUID,
    site_url_id: uuid.UUID,
    source_analysis_id: uuid.UUID,
) -> dict:
    return {
        "project_id": project_id,
        "crawl_id": crawl_id,
        "site_url_id": site_url_id,
        "source_analysis_id": source_analysis_id,
        "dimension": "metadata",
        "checkpoint_ids": sorted({row.rule_id for row in evaluations}),
        "suggested_skill_id": "content_page",
        "finding_class": evaluations[0].finding_class,
        "observed_evidence": [row.evidence or {} for row in evaluations],
        "source_evaluation_ids": [row.id for row in evaluations],
        "source_artifact_ids": list(analysis.source_artifact_ids or []),
        "target_fields": [_target_field(row) for row in evaluations],
        "captured_values": [_captured_value(row) for row in evaluations],
        "expected_capability": [rule_guidance(row.rule_id)[0] for row in evaluations],
        "remediation": [rule_guidance(row.rule_id)[1] for row in evaluations],
        "page_kind": analysis.page_kind,
        "page_traits": analysis.page_traits or [],
        "normalized_url": site_url.normalized_url,
        "scoring_policy_version": "1",
        "limitations": [
            "Crawl observations are untrusted evidence and remain subject to "
            "Content grounding and claim validation."
        ],
    }


__all__ = ["get_content_handoff"]
