"""Resolve the nearest compatible persisted run baseline."""

from __future__ import annotations

from app.analysis.comparison import frozen_comparison_key
from app.core.config.analysis import VISIBILITY_SELECTION_MAX_RUNS
from app.domain.analysis.measurement import (
    measurement_counts,
    observed_rate,
    prompt_performance,
    response_sov,
)
from app.domain.analysis.projection_common import load_run_snapshots
from app.domain.analysis.schemas import VisibilityComparison


async def compare_selection(
    session,
    *,
    workspace_id,
    project_id,
    audit,
    snapshot,
    metrics,
    cohort,
    engine,
):
    key = frozen_comparison_key(audit.configuration, engine=engine)
    if key is None:
        return VisibilityComparison(status="identity_unavailable")
    # Walking backwards from the selected run, the search stops at the first
    # compatible baseline, so only the recent end of the history is reachable
    # and bounding the read keeps this off a project's whole snapshot table;
    # `skipped_runs` reports how far it looked.
    candidates = await load_run_snapshots(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        to_at=audit.completed_at,
        newest=VISIBILITY_SELECTION_MAX_RUNS,
    )
    skipped = 0
    for prior, previous in reversed(candidates):
        if previous.id == audit.id or previous.completed_at >= audit.completed_at:
            continue
        comparison = await _candidate_comparison(
            session, audit, snapshot, metrics, prior, previous, cohort, engine, key
        )
        if comparison is not None:
            comparison.skipped_runs = skipped
            return comparison
        skipped += 1
    return VisibilityComparison(skipped_runs=skipped)


def metric_values(metrics):
    return {
        "visibility": observed_rate(metrics, "brand_mention_rate"),
        "owned_citation": observed_rate(metrics, "owned_citation_rate"),
        "sov": response_sov(metrics),
        "prompt_performance": prompt_performance(metrics),
    }


def metric_deltas(current, baseline):
    after, before = metric_values(current), metric_values(baseline)
    return {
        key: (value - before[key]) * (1 if key == "prompt_performance" else 100)
        if value is not None and before[key] is not None
        else None
        for key, value in after.items()
    }


async def _candidate_comparison(
    session, audit, snapshot, metrics, prior, previous, cohort, engine, key
):
    from app.domain.analysis.matched_comparison import matched_comparison

    same_versions = (prior.analyzer_version, prior.scoring_rule_version) == (
        snapshot.analyzer_version,
        snapshot.scoring_rule_version,
    )
    if not same_versions:
        return None
    if frozen_comparison_key(previous.configuration, engine=engine) != key:
        return await matched_comparison(
            session, audit=audit, previous=previous, cohort=cohort, engine=engine
        )
    comparison = _exact_comparison(metrics, prior, previous, cohort, engine)
    if comparison.status == "partial_coverage":
        subset = await matched_comparison(
            session, audit=audit, previous=previous, cohort=cohort, engine=engine
        )
        if subset:
            return subset
    return comparison


def _exact_comparison(metrics, prior, previous, cohort, engine):
    from app.domain.analysis.visibility import _cohort_metrics, _rankings

    before = _cohort_metrics(prior, cohort)
    if engine:
        before = (before.get("per_engine") or {}).get(engine) or {}
    current_counts, previous_counts = (
        measurement_counts(metrics),
        measurement_counts(before),
    )
    comparison = VisibilityComparison(
        status="comparable",
        baseline_audit_id=previous.id,
        baseline_audit_ids=[previous.id],
        baseline_at=previous.completed_at,
        baseline_counts=previous_counts,
        current_counts=current_counts,
        rankings=_rankings(before),
    )
    if not current_counts.responses or not previous_counts.responses:
        comparison.status = "no_observations"
    elif current_counts.expected is None or previous_counts.expected is None:
        comparison.status = "coverage_unavailable"
    elif not (current_counts.is_complete and previous_counts.is_complete):
        comparison.status = "partial_coverage"
    if comparison.status == "comparable":
        comparison.deltas = metric_deltas(metrics, before)
    return comparison
