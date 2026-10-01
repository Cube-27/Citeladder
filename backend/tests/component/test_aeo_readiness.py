from __future__ import annotations

import uuid
from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_contracts import (
    AEO_READINESS_DIMENSION_DESCRIPTIONS,
    AEO_READINESS_DIMENSION_LABELS,
    AEO_READINESS_DIMENSIONS,
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_SATISFIED,
)
from app.core.config.site_health_measurement import (
    CHECKPOINT_DIMENSION_BY_ID,
    PRESENTATION_VERSION,
    PROFILE_VERSION,
    SCHEMA_CONTRACT_VERSION,
)
from app.domain.site_health.service import SiteHealthNotFoundError, get_content_handoff
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.analysis import SitePageAnalysis, SiteRuleEvaluation
from app.models.site_health.crawl import SiteCrawl
from tests.component.site_health_api_helpers import _register, _seed_scenario

pytestmark = pytest.mark.asyncio


def _dimension(key: str) -> dict:
    unmeasured = key in {"evidence", "freshness", "provenance"}
    return {
        "key": key,
        "label": AEO_READINESS_DIMENSION_LABELS[key],
        "description": AEO_READINESS_DIMENSION_DESCRIPTIONS[key],
        "dimension_applicability": "applicable",
        "dimension_measurement_state": (
            "not_measured" if unmeasured else "limited_evidence"
        ),
        "score": None if unmeasured else (0.0 if key == "answerability" else 100.0),
        "coverage": 0.0 if unmeasured else 1.0,
        "earned_points": (
            0.0 if key == "answerability" else (0.0 if unmeasured else 1.0)
        ),
        "determinate_points": 0.0 if unmeasured else 1.0,
        "expected_points": 1.0,
        "determinate_checkpoint_ids": [],
        "reason": "no_expected_checkpoint_evaluator" if unmeasured else "",
    }


async def _seed_readiness(session: AsyncSession, *, email: str):
    scenario = await _seed_scenario(session, email=email)
    crawl = await session.get(SiteCrawl, scenario.crawl_id)
    assert crawl is not None
    crawl.analyzer_version = "sh-analyzer-1"
    crawl.extractor_version = "sh-extractor-1"
    crawl.scoring_version = "sh-scoring-1"

    analysis = await session.scalar(
        select(SitePageAnalysis).where(
            SitePageAnalysis.crawl_id == crawl.id,
            SitePageAnalysis.site_url_id == scenario.monitored_url_id,
        )
    )
    assert analysis is not None
    analysis.page_kind = "faq"
    analysis.page_traits = ["has_faq"]
    analysis.profile_version = PROFILE_VERSION
    analysis.schema_contract_version = SCHEMA_CONTRACT_VERSION
    analysis.presentation_version = PRESENTATION_VERSION
    analysis.readiness_dimensions = [
        _dimension(key) for key in AEO_READINESS_DIMENSIONS
    ]

    artifact = await session.get(SiteFetchArtifact, analysis.artifact_id)
    assert artifact is not None
    artifact.extractor_version = "sh-extractor-1"

    evaluation_specs = (
        ("aeo.answer_first", RULE_OUTCOME_MISSING, "advisory", {"opening": "context"}),
        ("aeo.question_headings", RULE_OUTCOME_SATISFIED, "defect", {"questions": 3}),
        (
            "aeo.schema_required_valid",
            RULE_OUTCOME_SATISFIED,
            "advisory",
            {"schema_type": "FAQPage"},
        ),
        ("technical.indexable", RULE_OUTCOME_SATISFIED, "defect", {"noindex": False}),
    )
    evaluations: list[SiteRuleEvaluation] = []
    for rule_id, outcome, finding_class, evidence in evaluation_specs:
        evaluation = SiteRuleEvaluation(
            workspace_id=scenario.workspace_id,
            analysis_id=analysis.id,
            source_artifact_id=analysis.artifact_id,
            rule_id=rule_id,
            dimension="aeo",
            category="content",
            severity="medium",
            finding_class=finding_class,
            weight=1.0,
            outcome=outcome,
            display_applicability=True,
            score_applicability=True,
            score_roles=["aeo_readiness"],
            readiness_dimension=CHECKPOINT_DIMENSION_BY_ID[rule_id],
            readiness_weight=1.0,
            evidence=evidence,
            extractor_version="sh-extractor-1",
            analyzer_version="sh-analyzer-1",
            rule_version="sh-rules-1",
        )
        session.add(evaluation)
        evaluations.append(evaluation)
    metadata_gap = SiteRuleEvaluation(
        workspace_id=scenario.workspace_id,
        analysis_id=analysis.id,
        source_artifact_id=analysis.artifact_id,
        rule_id="technical.meta_description_present",
        dimension="technical",
        category="content",
        severity="low",
        finding_class="advisory",
        weight=0.0,
        outcome=RULE_OUTCOME_MISSING,
        display_applicability=True,
        score_applicability=False,
        score_roles=[],
        readiness_dimension="",
        readiness_weight=0.0,
        evidence={"meta_description": ""},
        extractor_version="sh-extractor-1",
        analyzer_version="sh-analyzer-1",
        rule_version="sh-rules-1",
    )
    session.add(metadata_gap)
    evaluations.append(metadata_gap)
    await session.flush()
    analysis.finalized_at = datetime.now(UTC)
    analysis.source_evaluation_ids = [row.id for row in evaluations]

    await session.commit()
    return scenario, analysis


async def test_content_handoff_returns_exact_authorized_gap(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "handoff@example.com")
    async with session_factory() as session:
        scenario, analysis = await _seed_readiness(session, email="handoff@example.com")
        request = {
            "workspace_id": scenario.workspace_id,
            "project_id": scenario.project_id,
            "crawl_id": scenario.crawl_id,
            "site_url_id": scenario.monitored_url_id,
            "dimension": "metadata",
        }
        body = await get_content_handoff(
            session,
            **request,
            source_analysis_id=analysis.id,
            checkpoint_ids=["technical.meta_description_present"],
        )

        assert body["source_analysis_id"] == analysis.id
        assert body["checkpoint_ids"] == ["technical.meta_description_present"]
        assert body["suggested_skill_id"] == "content_page"
        assert body["observed_evidence"] == [{"meta_description": ""}]
        assert body["target_fields"] == ["meta_description"]
        assert body["normalized_url"].endswith("/a")
        assert body["scoring_policy_version"] == "1"

        # Current-revision requests omit the assertion and drop unsupported ids.
        current = await get_content_handoff(
            session,
            **request,
            checkpoint_ids=[
                "technical.meta_description_present",
                "aeo.answer_first",
            ],
        )
        assert current == body
        with pytest.raises(SiteHealthNotFoundError):
            await get_content_handoff(
                session,
                **request,
                source_analysis_id=uuid.uuid4(),
                checkpoint_ids=["technical.meta_description_present"],
            )


async def test_content_handoff_is_workspace_isolated(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "readiness-owner@example.com")
    await _register(client, "readiness-foreign@example.com")
    async with session_factory() as session:
        owner, analysis = await _seed_readiness(
            session, email="readiness-owner@example.com"
        )
        foreign = await _seed_scenario(session, email="readiness-foreign@example.com")

        with pytest.raises(SiteHealthNotFoundError):
            await get_content_handoff(
                session,
                workspace_id=foreign.workspace_id,
                project_id=owner.project_id,
                crawl_id=owner.crawl_id,
                site_url_id=owner.monitored_url_id,
                source_analysis_id=analysis.id,
                dimension="metadata",
                checkpoint_ids=["technical.meta_description_present"],
            )
