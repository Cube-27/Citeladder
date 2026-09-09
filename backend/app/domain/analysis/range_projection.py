"""Pool one frozen configuration within an explicitly selected period."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.config.analysis import VISIBILITY_SELECTION_MAX_RUNS
from app.domain.analysis.errors import AnalysisNotFoundError, TrendQueryError
from app.domain.analysis.schemas import (
    EngineComparisonRow,
    RankingRow,
    VisibilityComparison,
)
from app.domain.analysis.trend_folding import _TrendSource


async def get_range_visibility(
    session,
    *,
    workspace_id,
    project_id,
    engine,
    cohort,
    from_at,
    to_at,
    configuration_key=None,
):
    from app.domain.analysis.trend_folding import _fold_bucket
    from app.domain.analysis.trends import (
        _load_trend_rows,
        validate_engine_and_range,
    )
    from app.domain.analysis.visibility import (
        apply_ranking_comparison,
        competitor_gaps,
        get_visibility,
    )

    to_at = to_at or datetime.now(UTC)
    validate_engine_and_range(logical_engine=engine, from_at=from_at, to_at=to_at)
    rows = await _load_trend_rows(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        from_at=from_at,
        to_at=to_at,
    )
    groups, key, sources = _range_groups(rows, engine, cohort, configuration_key)
    selected = await get_visibility(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=sources[-1].audit_id,
        cohort=cohort,
        logical_engine=engine,
    )
    point = _fold_bucket(sources[-1].completed_at, sources)
    _apply_range_values(selected, point, sources, groups, key, from_at, to_at)
    selected.per_engine = _range_engines(
        rows, sources, selected.source_audit_ids, point.completed_at, engine, cohort
    )
    selected.comparison = await _compare_period(
        session,
        workspace_id,
        project_id,
        sources,
        point,
        engine,
        cohort,
        from_at,
        to_at,
    )
    gaps = await competitor_gaps(
        session,
        workspace_id=workspace_id,
        audit_ids=selected.source_audit_ids,
        cohort=cohort,
        logical_engine=engine,
    )
    apply_ranking_comparison(selected.rankings, selected.comparison, gaps)
    return selected


async def _compare_period(
    session, workspace_id, project_id, sources, point, engine, cohort, from_at, to_at
):
    from app.domain.analysis.trend_folding import _fold_bucket
    from app.domain.analysis.trends import _load_trend_rows

    if from_at is None or not sources[0].comparison_key:
        return VisibilityComparison()
    rows = await _load_trend_rows(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        from_at=from_at - (to_at - from_at),
        to_at=from_at - timedelta(microseconds=1),
    )
    before = _compatible_period_sources(rows, sources[0], engine, cohort)
    if not before:
        return VisibilityComparison()
    previous = _fold_bucket(from_at, before)
    result = VisibilityComparison(
        status="comparable",
        baseline_at=from_at - (to_at - from_at),
        baseline_counts=previous.counts,
        baseline_audit_ids=[source.audit_id for source in before],
        current_counts=point.counts,
        rankings=[RankingRow(**row.model_dump()) for row in previous.rankings],
    )
    if not all(item.counts.is_complete for item in (previous, point)):
        result.status = "partial_coverage"
        return result
    result.deltas = {
        key: (after - baseline) * 100
        if after is not None and baseline is not None
        else None
        for key, after, baseline in (
            ("visibility", point.visibility_rate, previous.visibility_rate),
            ("sov", point.sov.mention, previous.sov.mention),
            ("owned_citation", point.owned_citation_rate, previous.owned_citation_rate),
        )
    }
    return result


def _range_groups(rows, engine, cohort, configuration_key):
    from app.domain.analysis.trends import _trend_source

    groups: dict[str, list[_TrendSource]] = {}
    for snapshot, audit in rows:
        source = _trend_source(snapshot, audit, engine, cohort)
        if source:
            groups.setdefault(_configuration_group(source), []).append(source)
    if not groups:
        raise AnalysisNotFoundError("No measurements in the selected period")
    key = configuration_key or max(
        groups, key=lambda group: groups[group][-1].completed_at
    )
    if key not in groups:
        raise TrendQueryError("Configuration is not present in the selected period")
    sources = groups[key]
    if len(sources) > VISIBILITY_SELECTION_MAX_RUNS:
        raise TrendQueryError(
            "Select a narrower period: at most "
            f"{VISIBILITY_SELECTION_MAX_RUNS} runs per selection"
        )
    return groups, key, sources


def _apply_range_values(selected, point, sources, groups, key, from_at, to_at):
    selected.selection_mode = "range"
    selected.source_audit_ids = [source.audit_id for source in sources]
    selected.configuration_groups = {
        group: len(items) for group, items in groups.items()
    }
    selected.comparison_key = key
    selected.from_at, selected.to_at = from_at, to_at
    selected.counts = point.counts
    selected.total_completed = point.counts.responses
    selected.total_failed = point.counts.failed or 0
    selected.coverage = {
        "requested": point.counts.expected,
        "completed": point.counts.responses,
        "failed": point.counts.failed,
        "not_run": point.counts.not_run,
        "rate": point.counts.responses / point.counts.expected
        if point.counts.expected
        else None,
    }
    selected.visibility_rate = point.visibility_rate
    selected.owned_citation_rate = point.owned_citation_rate
    selected.prompt_performance_score = None
    selected.visibility_score = None
    logos = {row.name: row for row in selected.rankings}
    selected.rankings = [RankingRow(**row.model_dump()) for row in point.rankings]
    for row in selected.rankings:
        if row.name in logos:
            row.logo_url, row.website_url = (
                logos[row.name].logo_url,
                logos[row.name].website_url,
            )


def _configuration_group(source) -> str:
    """The frozen configuration a source belongs to.

    Identity first, then the versions that computed it: two runs of the same
    route are only one configuration while the analyzer and scoring rules
    behind them also match.
    """
    identity = source.comparison_key or source.audit_id
    return f"{identity}:{source.analyzer_version}:{source.scoring_rule_version}"


def _range_engines(rows, sources, audit_ids, completed_at, engine, cohort):
    from app.domain.analysis.trend_folding import _fold_bucket
    from app.domain.analysis.trends import _trend_source

    result = []
    for logical_engine in sorted(
        {item.logical_engine for source in sources for item in source.model_provenance}
    ):
        if engine and logical_engine != engine:
            continue
        engine_sources = [
            source
            for snapshot, audit in rows
            if audit.id in audit_ids
            and (source := _trend_source(snapshot, audit, logical_engine, cohort))
        ]
        if not engine_sources:
            # The frozen route names this engine, but nothing in the selected
            # set produced a metric for it — an engine configured and never
            # answered, or answered only outside this cohort. That is an
            # UNAVAILABLE row, which is what the default counts say; folding an
            # empty bucket would read its first source and raise instead.
            result.append(
                EngineComparisonRow(logical_engine=logical_engine, total_completed=0)
            )
            continue
        engine_point = _fold_bucket(completed_at, engine_sources)
        result.append(
            EngineComparisonRow(
                logical_engine=logical_engine,
                total_completed=engine_point.counts.responses,
                counts=engine_point.counts,
                brand_mention_rate=engine_point.visibility_rate,
                owned_citation_rate=engine_point.owned_citation_rate,
            )
        )
    return result


def _compatible_period_sources(rows, reference, engine, cohort):
    from app.domain.analysis.trends import _trend_source

    return [
        source
        for snapshot, audit in rows
        if (source := _trend_source(snapshot, audit, engine, cohort))
        and source.comparison_key == reference.comparison_key
        and (source.analyzer_version, source.scoring_rule_version)
        == (reference.analyzer_version, reference.scoring_rule_version)
    ]
