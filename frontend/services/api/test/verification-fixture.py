"""Python producers/readers exercised by the TypeScript verifier's PostgreSQL test."""

import asyncio
import json
import sys
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.domain.opportunities.verification import enqueue_implementation_verification
from app.models.analysis import MetricSnapshot
from app.models.audit import Audit
from app.models.opportunity import (
    Action,
    OpportunityImplementationEvent,
    OpportunitySnapshot,
    OpportunityVerificationEvent,
)
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.analysis import SitePageAnalysis, SiteRuleEvaluation
from app.models.site_health.crawl import SiteCrawl
from app.models.source_pages import PlacementCheck, SourcePage
from app.models.traffic import TrafficSnapshot
from tests.component.opportunity_helpers import _seed_scenario

MOMENT = datetime(2026, 9, 27, 10, 0, 0, 123456, tzinfo=UTC)


async def seed():
    async with SessionLocal() as session:
        scn = await _seed_scenario(session)
        scope = dict(workspace_id=scn.workspace_id, project_id=scn.project_id)
        baseline = OpportunitySnapshot(
            **scope,
            audit_id=scn.audit_id,
            source_mix={"gap_keys": ["a", "b"]},
            created_at=MOMENT - timedelta(days=3),
        )
        session.add(baseline)
        await session.flush()
        analyses = list(
            (
                await session.scalars(
                    select(SitePageAnalysis).where(
                        SitePageAnalysis.project_id == scn.project_id
                    )
                )
            ).all()
        )
        analysis = analyses[0]
        artifact = await session.get(SiteFetchArtifact, analysis.artifact_id)
        artifact.fetched_at = MOMENT
        artifact.normalized_facts = {"secure": True}
        rule = await session.get(SiteRuleEvaluation, analysis.source_evaluation_ids[0])
        rule.outcome = "partial"
        crawl = await session.get(SiteCrawl, scn.crawl_id)
        crawl.completed_at = MOMENT
        audit = await session.get(Audit, scn.audit_id)
        audit.completed_at = MOMENT
        metric = await session.get(MetricSnapshot, scn.metric_snapshot_id)
        metric.created_at = MOMENT
        metric.visibility_score = 80
        traffic = TrafficSnapshot(
            **scope,
            window_start=date(2026, 9, 1),
            window_end=date(2026, 9, 25),
            granularity="day",
            metrics={"totals": {"clicks": 5}},
            created_at=MOMENT,
        )
        session.add(traffic)
        page = SourcePage(
            **scope,
            canonical_url="https://publisher.test/list",
            url_hash=uuid.uuid4().hex,
            registrable_domain="publisher.test",
        )
        session.add(page)
        await session.flush()
        checks = {
            "site": [
                {
                    "kind": "site_rule",
                    "rule_id": rule.rule_id,
                    "expected_outcome": "partial",
                },
                {"kind": "page_fact", "fact_key": "secure", "expected_value": 1},
            ],
            "traffic": [
                {
                    "kind": "traffic_metric",
                    "metric": "clicks",
                    "expected_value": 4,
                    "direction": "increase",
                }
            ],
            "visibility": [
                {
                    "kind": "visibility_metric",
                    "metric": "visibility_score",
                    "baseline_value": 40,
                    "min_delta": 1,
                    "direction": "increase",
                }
            ],
            "missing_prompt": [
                {
                    "kind": "visibility_metric",
                    "target_prompt_id": str(uuid.uuid4()),
                    "baseline_value": 40,
                    "min_delta": 1,
                    "direction": "increase",
                }
            ],
            "placement": [{"kind": "placement"}],
        }
        ids = {}
        for name, expected in checks.items():
            action = Action(
                **scope,
                group_key=f"verification:{name}",
                target_kind="page",
                target_label=name,
                origin="evidence",
                status="implemented",
            )
            session.add(action)
            await session.flush()
            declaration = OpportunityImplementationEvent(
                **scope,
                action_id=action.id,
                opportunity_snapshot_id=baseline.id,
                actor_user_id=scn.user_id,
                declared_implemented_at=MOMENT - timedelta(days=1),
                target_site_url_ids=[str(analysis.site_url_id)]
                if name == "site"
                else [],
                target_external_url=page.canonical_url if name == "placement" else None,
                expected_checks=expected,
                idempotency_key=name,
                request_fingerprint=name,
                created_at=MOMENT - timedelta(days=1),
            )
            session.add(declaration)
            await session.flush()
            ids[name] = str(declaration.id)
            if name == "placement":
                check = PlacementCheck(
                    **scope,
                    source_page_id=page.id,
                    implementation_event_id=declaration.id,
                    opportunity_stable_key="earned:key",
                    rule_id="earned_page_acquire_listing",
                    url_hash=page.url_hash,
                    expected_change="brand_listed",
                    declared_at=declaration.declared_implemented_at,
                    state="satisfied",
                    attempts=1,
                    observed_at=MOMENT,
                    updated_at=MOMENT,
                )
                session.add(check)
                await session.flush()
                ids["placement_check"] = str(check.id)
        for kind, source in [
            ("site_crawl", scn.crawl_id),
            ("audit", scn.audit_id),
            ("traffic_snapshot", traffic.id),
            ("source_page_inspection", scn.audit_id),
        ]:
            await enqueue_implementation_verification(
                session, **scope, trigger_kind=kind, trigger_id=source
            )
        await session.commit()
        return {
            "workspaceId": str(scn.workspace_id),
            "projectId": str(scn.project_id),
            "userId": str(scn.user_id),
            "auditId": str(scn.audit_id),
            "metricId": str(scn.metric_snapshot_id),
            "crawlId": str(scn.crawl_id),
            "trafficId": str(traffic.id),
            "snapshotId": str(baseline.id),
            "analysisId": str(analysis.id),
            "artifactId": str(artifact.id),
            "ruleId": str(rule.id),
            "declarations": ids,
        }


async def read(workspace):
    async with SessionLocal() as session:
        rows = (
            await session.scalars(
                select(OpportunityVerificationEvent).where(
                    OpportunityVerificationEvent.workspace_id == uuid.UUID(workspace)
                )
            )
        ).all()
        return [
            {
                "declaration": str(row.implementation_event_id),
                "kind": row.observation_kind,
                "result": row.result,
                "key": row.idempotency_key,
            }
            for row in rows
        ]


async def main():
    result = await seed() if sys.argv[1] == "seed" else await read(sys.argv[2])
    print(json.dumps(result))
    await engine.dispose()


asyncio.run(main())
