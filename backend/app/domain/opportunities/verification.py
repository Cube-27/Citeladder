"""Bounded, append-only verification of implementation declarations."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
    analytics_settings,
)
from app.core.config.opportunities import (
    IMPLEMENTATION_VERIFICATION_BATCH_MAX,
    IMPLEMENTATION_VERIFIER_VERSION,
)
from app.core.config.placement import (
    PLACEMENT_CHECK_KIND,
    PLACEMENT_STATE_PENDING,
    PLACEMENT_STATE_SATISFIED,
    PLACEMENT_STATE_UNMET,
)
from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_PARTIAL,
    RULE_OUTCOME_SATISFIED,
)
from app.core.config.task_queue import TASK_STATUS_QUEUED
from app.domain.opportunities.verification_result import build_verification_result
from app.domain.opportunities.visibility_checks import (
    metric_value,
    resolve_prompt_index,
)
from app.models.analysis import MetricSnapshot
from app.models.analytics import AnalyticsTask
from app.models.audit import Audit
from app.models.opportunity import (
    OpportunityImplementationEvent,
    OpportunityVerificationEvent,
)
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.analysis import SitePageAnalysis, SiteRuleEvaluation
from app.models.site_health.crawl import SiteCrawl
from app.models.source_pages import PlacementCheck
from app.models.traffic import TrafficSnapshot


@dataclass(slots=True)
class _Evaluation:
    observed: int = 0
    matched: int = 0
    contradicted: bool = False
    analysis_ids: set[uuid.UUID] = field(default_factory=set)
    rule_evaluation_ids: set[uuid.UUID] = field(default_factory=set)
    metric_ids: set[uuid.UUID] = field(default_factory=set)
    limitations: list[str] = field(default_factory=list)


# A placement observation comes from an inspection batch, not from an audit or
# a crawl. It gets its own trigger kind so the batch's own observation time --
# not the audit's completion time -- becomes the event's revision, which is
# what keeps a recheck weeks later from colliding with the first reading's
# idempotency key and being silently dropped.
TRIGGER_SOURCE_PAGE = "source_page_inspection"


@dataclass(frozen=True, slots=True)
class _Source:
    kind: str
    id: uuid.UUID
    observed_at: datetime


def _target_id(
    declaration: OpportunityImplementationEvent, check: dict[str, Any]
) -> uuid.UUID | None:
    raw = check.get("target_site_url_id")
    if raw is None and len(declaration.target_site_url_ids or []) == 1:
        raw = declaration.target_site_url_ids[0]
    try:
        return uuid.UUID(str(raw)) if raw is not None else None
    except ValueError:
        return None


def _expected_rule_outcome(value: object) -> object:
    if value == "pass":
        return RULE_OUTCOME_SATISFIED
    if value == "fail":
        return RULE_OUTCOME_MISSING
    return value


async def _evaluate_site_rule(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    analysis: SitePageAnalysis,
    check: dict[str, Any],
    result: _Evaluation,
) -> None:
    evaluation = await session.scalar(
        select(SiteRuleEvaluation).where(
            SiteRuleEvaluation.workspace_id == declaration.workspace_id,
            SiteRuleEvaluation.id.in_(analysis.source_evaluation_ids or []),
            SiteRuleEvaluation.rule_id == check.get("rule_id"),
        )
    )
    if evaluation is None or evaluation.outcome not in {
        RULE_OUTCOME_SATISFIED,
        RULE_OUTCOME_MISSING,
        RULE_OUTCOME_PARTIAL,
    }:
        result.limitations.append("site_rule: no applicable evaluation")
        return
    result.observed += 1
    result.analysis_ids.add(analysis.id)
    result.rule_evaluation_ids.add(evaluation.id)
    if evaluation.outcome == _expected_rule_outcome(check.get("expected_outcome")):
        result.matched += 1
    else:
        result.contradicted = True


async def _evaluate_page_fact(
    session: AsyncSession,
    *,
    analysis: SitePageAnalysis,
    check: dict[str, Any],
    result: _Evaluation,
) -> None:
    artifact = await session.get(SiteFetchArtifact, analysis.artifact_id)
    facts = artifact.normalized_facts if artifact is not None else None
    key = str(check.get("fact_key") or "")
    if not facts or key not in facts:
        result.limitations.append(f"page_fact: {key} unavailable")
        return
    result.observed += 1
    result.analysis_ids.add(analysis.id)
    if facts[key] == check.get("expected_value"):
        result.matched += 1
    else:
        result.contradicted = True


async def _site_evidence(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    crawl_id: uuid.UUID,
) -> _Evaluation:
    result = _Evaluation()
    for check in declaration.expected_checks or []:
        kind = check.get("kind")
        if kind not in {"site_rule", "page_fact"}:
            result.limitations.append(f"{kind}: unavailable from a site crawl")
            continue
        target_id = _target_id(declaration, check)
        if target_id is None:
            result.limitations.append(f"{kind}: no resolved target")
            continue
        analysis = await session.scalar(
            select(SitePageAnalysis)
            .join(
                SiteFetchArtifact,
                SiteFetchArtifact.id == SitePageAnalysis.artifact_id,
            )
            .where(
                SitePageAnalysis.workspace_id == declaration.workspace_id,
                SitePageAnalysis.project_id == declaration.project_id,
                SitePageAnalysis.crawl_id == crawl_id,
                SitePageAnalysis.site_url_id == target_id,
                SitePageAnalysis.is_current.is_(True),
                SitePageAnalysis.finalized_at.is_not(None),
                SiteFetchArtifact.fetched_at > declaration.declared_implemented_at,
            )
            .order_by(SitePageAnalysis.created_at.desc(), SitePageAnalysis.id.desc())
            .limit(1)
        )
        if analysis is None:
            result.limitations.append(f"{kind}: target was not analyzed")
            continue
        if kind == "site_rule":
            await _evaluate_site_rule(
                session,
                declaration=declaration,
                analysis=analysis,
                check=check,
                result=result,
            )
        else:
            await _evaluate_page_fact(
                session, analysis=analysis, check=check, result=result
            )
    return result


async def _audit_evidence(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    audit_id: uuid.UUID,
) -> _Evaluation:
    result = _Evaluation()
    snapshot = await session.scalar(
        select(MetricSnapshot).where(
            MetricSnapshot.workspace_id == declaration.workspace_id,
            MetricSnapshot.project_id == declaration.project_id,
            MetricSnapshot.audit_id == audit_id,
            MetricSnapshot.created_at > declaration.declared_implemented_at,
        )
    )
    for check in declaration.expected_checks or []:
        kind = check.get("kind")
        if kind != "visibility_metric":
            result.limitations.append(f"{kind}: unavailable from an AI audit")
            continue
        # ``prompt_index`` is audit-relative, so a prompt-keyed expectation is
        # located in *this* audit rather than reusing the baseline's position.
        prompt_index = await _check_prompt_index(
            session, audit_id=audit_id, check=check
        )
        if check.get("target_prompt_id") is not None and prompt_index is None:
            # The later audit does not carry this prompt. Its absence is not a
            # decline, and reading the project score instead would let an
            # unrelated gain verify a specific prompt's action -- the exact
            # substitution this check exists to stop.
            result.limitations.append("visibility_metric: target prompt unavailable")
            continue
        _evaluate_visibility_metric(
            snapshot=snapshot,
            check=check,
            prompt_index=prompt_index,
            result=result,
        )
    return result


async def _check_prompt_index(
    session: AsyncSession, *, audit_id: uuid.UUID, check: dict[str, Any]
) -> int | None:
    raw = check.get("target_prompt_id")
    if raw is None:
        return None
    try:
        prompt_id = uuid.UUID(str(raw))
    except ValueError:
        return None
    return await resolve_prompt_index(session, audit_id=audit_id, prompt_id=prompt_id)


async def _traffic_evidence(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    snapshot_id: uuid.UUID,
) -> _Evaluation:
    result = _Evaluation()
    snapshot = await session.scalar(
        select(TrafficSnapshot).where(
            TrafficSnapshot.workspace_id == declaration.workspace_id,
            TrafficSnapshot.project_id == declaration.project_id,
            TrafficSnapshot.id == snapshot_id,
            TrafficSnapshot.created_at > declaration.declared_implemented_at,
        )
    )
    totals = ((snapshot.metrics or {}).get("totals") or {}) if snapshot else {}
    for check in declaration.expected_checks or []:
        if check.get("kind") != "traffic_metric":
            result.limitations.append(
                f"{check.get('kind')}: unavailable from a traffic snapshot"
            )
            continue
        _evaluate_traffic_metric(
            snapshot=snapshot,
            totals=totals,
            check=check,
            result=result,
        )
    return result


def _evaluate_traffic_metric(
    *,
    snapshot: TrafficSnapshot | None,
    totals: dict,
    check: dict[str, Any],
    result: _Evaluation,
) -> None:
    metric_name = str(check.get("metric") or "")
    value = totals.get(metric_name)
    expected = check.get("expected_value")
    if (
        snapshot is None
        or not isinstance(value, (int, float))
        or not isinstance(expected, (int, float))
    ):
        result.limitations.append(f"traffic_metric: {metric_name} unavailable")
        return
    result.observed += 1
    result.metric_ids.add(snapshot.id)
    if _metric_matches(
        direction=check.get("direction"),
        value=float(value),
        expected=float(expected),
        tolerance=float(check.get("tolerance") or 0),
    ):
        result.matched += 1
    else:
        result.contradicted = True


def _metric_matches(
    *, direction: object, value: float, expected: float, tolerance: float
) -> bool:
    if direction == "increase":
        return value >= expected - tolerance
    if direction == "decrease":
        return value <= expected + tolerance
    return direction == "equal" and abs(value - expected) <= tolerance


def _evaluate_visibility_metric(
    *,
    snapshot: MetricSnapshot | None,
    check: dict[str, Any],
    prompt_index: int | None,
    result: _Evaluation,
) -> None:
    """Compare a post-declaration observation against its frozen baseline.

    An expectation without a baseline, or a metric this snapshot cannot
    supply, is unobservable. It is recorded as a limitation and counts as
    neither a match nor a contradiction, so nothing is verified by default.
    """
    if snapshot is None:
        result.limitations.append("visibility_metric: no metric snapshot")
        return
    metric_name = str(check.get("metric") or "")
    baseline = check.get("baseline_value")
    if not isinstance(baseline, (int, float)):
        result.limitations.append(
            f"visibility_metric: {metric_name} has no frozen baseline"
        )
        return
    value = metric_value(snapshot, prompt_index=prompt_index)
    if value is None:
        result.limitations.append(f"visibility_metric: {metric_name} unavailable")
        return
    result.observed += 1
    result.metric_ids.add(snapshot.id)
    if _metric_matches(
        direction=check.get("direction"),
        value=value - float(baseline),
        expected=float(check.get("min_delta") or 0),
        tolerance=float(check.get("tolerance") or 0),
    ):
        result.matched += 1
    else:
        result.contradicted = True


async def _placement_evidence(
    session: AsyncSession, *, declaration: OpportunityImplementationEvent
) -> _Evaluation:
    """What the persisted placement check says about this declaration.

    The comparison itself already happened, against a frozen baseline and for
    the specific expected change, when the inspection batch committed. This
    reads that verdict; it never re-decides one, and it never reaches a
    publisher's page.

    ``unmet`` with readings still to come is an OBSERVATION, not a
    contradiction. A publisher does not act the day somebody emails them, and
    calling the first empty reading a contradiction would report a slow
    editor as a false declaration.
    """
    result = _Evaluation()
    kinds = [check.get("kind") for check in declaration.expected_checks or []]
    for kind in kinds:
        if kind != PLACEMENT_CHECK_KIND:
            result.limitations.append(f"{kind}: unavailable from a page inspection")
    if PLACEMENT_CHECK_KIND not in kinds:
        return result
    # Once, not once per expectation. The evidence is one row per DECLARATION,
    # so looping would count the same verdict twice the day a declaration
    # carries two placement expectations.
    _evaluate_placement_check(
        await session.scalar(
            select(PlacementCheck).where(
                PlacementCheck.workspace_id == declaration.workspace_id,
                PlacementCheck.implementation_event_id == declaration.id,
            )
        ),
        result=result,
    )
    return result


def _evaluate_placement_check(
    check: PlacementCheck | None, *, result: _Evaluation
) -> None:
    if check is None:
        result.limitations.append("placement: no check was opened for this page")
        return
    if check.state == PLACEMENT_STATE_PENDING:
        result.limitations.append("placement: the page has not been read since")
        return
    if check.state not in {PLACEMENT_STATE_SATISFIED, PLACEMENT_STATE_UNMET}:
        result.limitations.append(f"placement: {check.state_reason or check.state}")
        return
    result.observed += 1
    if check.state == PLACEMENT_STATE_SATISFIED:
        result.matched += 1
    elif check.due_at is None:
        # Read as often as this check is going to be, and the change is still
        # not there. That is a contradiction of what was declared.
        result.contradicted = True


def _observation_kind(result: _Evaluation, total_checks: int) -> str | None:
    if result.observed == 0:
        return None
    if result.contradicted:
        return "contradicted"
    if result.observed == total_checks and result.matched == total_checks:
        return "verified"
    return "observed"


async def enqueue_implementation_verification(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    trigger_kind: str,
    trigger_id: uuid.UUID,
    trigger_revision: str | None = None,
    payload_extra: dict[str, Any] | None = None,
) -> None:
    idempotency_key = (
        f"implementation-verification:{trigger_kind}:{trigger_id}:"
        f"{IMPLEMENTATION_VERIFIER_VERSION}:{trigger_revision or 'terminal'}"
    )
    await session.execute(
        pg_insert(AnalyticsTask)
        .values(
            workspace_id=workspace_id,
            project_id=project_id,
            task_kind=ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
            payload={
                "trigger_kind": trigger_kind,
                "trigger_id": str(trigger_id),
                **(payload_extra or {}),
            },
            idempotency_key=idempotency_key,
            status=TASK_STATUS_QUEUED,
            max_attempts=analytics_settings.task_max_attempts,
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )


async def enqueue_audit_opportunity_tasks(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID,
) -> None:
    """Queue both Opportunity consumers of one terminal audit."""
    from app.domain.opportunities.queue import enqueue_opportunity_refresh

    await enqueue_opportunity_refresh(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        trigger_kind="audit",
        trigger_id=audit_id,
    )
    await enqueue_implementation_verification(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        trigger_kind="audit",
        trigger_id=audit_id,
    )


async def _verification_source(
    session: AsyncSession, *, task: AnalyticsTask
) -> _Source:
    payload = task.payload or {}
    trigger_kind = str(payload.get("trigger_kind") or "")
    try:
        trigger_id = uuid.UUID(str(payload.get("trigger_id")))
    except ValueError as exc:
        raise ValueError("Implementation verification trigger is invalid") from exc
    if trigger_kind == "site_crawl":
        source = await session.scalar(
            select(SiteCrawl).where(
                SiteCrawl.workspace_id == task.workspace_id,
                SiteCrawl.project_id == task.project_id,
                SiteCrawl.id == trigger_id,
            )
        )
        observed_at = source.completed_at if source is not None else None
    elif trigger_kind == "audit":
        audit = await session.scalar(
            select(Audit).where(
                Audit.workspace_id == task.workspace_id,
                Audit.project_id == task.project_id,
                Audit.id == trigger_id,
            )
        )
        observed_at = audit.completed_at if audit is not None else None
    elif trigger_kind == "traffic_snapshot":
        snapshot = await session.scalar(
            select(TrafficSnapshot).where(
                TrafficSnapshot.workspace_id == task.workspace_id,
                TrafficSnapshot.project_id == task.project_id,
                TrafficSnapshot.id == trigger_id,
            )
        )
        observed_at = snapshot.created_at if snapshot is not None else None
    elif trigger_kind == TRIGGER_SOURCE_PAGE:
        observed_at = await _batch_observed_at(session, task=task, payload=payload)
    else:
        raise ValueError("Implementation verification trigger kind is invalid")
    if observed_at is None:
        raise ValueError("Implementation verification source is not terminal")
    return _Source(trigger_kind, trigger_id, observed_at)


async def _batch_observed_at(
    session: AsyncSession, *, task: AnalyticsTask, payload: dict[str, Any]
) -> datetime | None:
    """When THIS inspection batch's placement readings were settled.

    A placement observation has no terminal row of its own to read a time
    from, so the batch stamps the moment it settled its checks into the task
    payload and the checks it touched carry that same moment in ``updated_at``.
    Taking the project-wide maximum instead would let a task queued by one
    batch be dated by a reading another batch took, which is how "which
    reading produced this observation" stops being answerable.

    Falls back to the project-wide maximum for a task queued before the batch
    marker existed; an absent marker is the only case that can reach it.
    """
    settled_since = _parsed_datetime(payload.get("settled_since"))
    statement = select(func.max(PlacementCheck.observed_at)).where(
        PlacementCheck.workspace_id == task.workspace_id,
        PlacementCheck.project_id == task.project_id,
    )
    if settled_since is not None:
        statement = statement.where(PlacementCheck.updated_at >= settled_since)
    return await session.scalar(statement)


def _parsed_datetime(value: object) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


async def _eligible_declarations(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    observed_at: datetime,
    after: tuple[datetime, uuid.UUID] | None,
) -> list[OpportunityImplementationEvent]:
    statement = select(OpportunityImplementationEvent).where(
        OpportunityImplementationEvent.workspace_id == task.workspace_id,
        OpportunityImplementationEvent.project_id == task.project_id,
        OpportunityImplementationEvent.declared_implemented_at <= observed_at,
    )
    if after is not None:
        created_at, event_id = after
        statement = statement.where(
            or_(
                OpportunityImplementationEvent.created_at > created_at,
                and_(
                    OpportunityImplementationEvent.created_at == created_at,
                    OpportunityImplementationEvent.id > event_id,
                ),
            )
        )
    return list(
        (
            await session.scalars(
                statement.order_by(
                    OpportunityImplementationEvent.created_at.asc(),
                    OpportunityImplementationEvent.id.asc(),
                ).limit(IMPLEMENTATION_VERIFICATION_BATCH_MAX)
            )
        ).all()
    )


async def _append_observation(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    declaration: OpportunityImplementationEvent,
    result: _Evaluation,
    observation_kind: str,
    source: _Source,
) -> None:
    comparison = await build_verification_result(
        session,
        declaration=declaration,
        post_audit_id=source.id if source.kind == "audit" else None,
    )
    source_revision = int(source.observed_at.timestamp() * 1_000_000)
    event_key = (
        f"verification:{declaration.id}:{source.kind}:{source.id}:"
        f"{source_revision}:{IMPLEMENTATION_VERIFIER_VERSION}"
    )
    await session.execute(
        pg_insert(OpportunityVerificationEvent)
        .values(
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            implementation_event_id=declaration.id,
            observation_kind=observation_kind,
            observed_at=source.observed_at,
            crawl_id=source.id if source.kind == "site_crawl" else None,
            audit_id=source.id if source.kind == "audit" else None,
            source_analysis_ids=[str(item) for item in result.analysis_ids],
            source_rule_evaluation_ids=[
                str(item) for item in result.rule_evaluation_ids
            ],
            source_metric_ids=[str(item) for item in result.metric_ids],
            result=comparison,
            verifier_version=IMPLEMENTATION_VERIFIER_VERSION,
            limitations=result.limitations,
            idempotency_key=event_key,
        )
        .on_conflict_do_nothing(index_elements=["workspace_id", "idempotency_key"])
    )


async def _evidence_for(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    source: _Source,
) -> _Evaluation:
    """Read this trigger's evidence for one declaration's expected checks.

    Every branch records the check kinds it cannot answer as limitations
    rather than skipping them, so a declaration is never reported as verified
    on the strength of a check nobody could observe.
    """
    if source.kind == "site_crawl":
        return await _site_evidence(
            session, declaration=declaration, crawl_id=source.id
        )
    if source.kind == "audit":
        return await _audit_evidence(
            session, declaration=declaration, audit_id=source.id
        )
    if source.kind == TRIGGER_SOURCE_PAGE:
        return await _placement_evidence(session, declaration=declaration)
    return await _traffic_evidence(
        session, declaration=declaration, snapshot_id=source.id
    )


async def verify_implementation_events(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """Append observations for declarations with evidence after their boundary."""
    if task.project_id is None:
        raise ValueError("Implementation verification requires project_id")
    async with session_factory() as session:
        source = await _verification_source(session, task=task)
        after: tuple[datetime, uuid.UUID] | None = None
        while True:
            declarations = await _eligible_declarations(
                session, task=task, observed_at=source.observed_at, after=after
            )
            for declaration in declarations:
                result = await _evidence_for(
                    session, declaration=declaration, source=source
                )
                kind = _observation_kind(result, len(declaration.expected_checks or []))
                if kind is not None:
                    await _append_observation(
                        session,
                        task=task,
                        declaration=declaration,
                        result=result,
                        observation_kind=kind,
                        source=source,
                    )
            if len(declarations) < IMPLEMENTATION_VERIFICATION_BATCH_MAX:
                break
            last = declarations[-1]
            after = (last.created_at, last.id)
        await session.commit()
