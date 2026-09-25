"""Strict query-evidence detectors for Demand Intelligence."""

from __future__ import annotations

import math
import statistics
from datetime import date, timedelta
from typing import Any

from app.analysis.lexical import lexical_tokens, normalized_coverage
from app.core.config.demand import (
    DEMAND_CANNIBALIZATION_GAP_WEIGHT,
    DEMAND_CANNIBALIZATION_MIN_PAGE_IMPRESSIONS,
    DEMAND_CANNIBALIZATION_MIN_PAGE_SHARE,
    DEMAND_CTR_GAP_ABSOLUTE_THRESHOLD,
    DEMAND_CTR_GAP_MIN_CANDIDATE_IMPRESSIONS,
    DEMAND_CTR_GAP_MIN_COHORT_IMPRESSIONS,
    DEMAND_CTR_GAP_MIN_COHORT_ROWS,
    DEMAND_CTR_GAP_RELATIVE_THRESHOLD,
    DEMAND_CTR_GAP_WEIGHT,
    DEMAND_QUERY_RELEVANCE_H1_COVERAGE_MAX,
    DEMAND_QUERY_RELEVANCE_MIN_IMPRESSIONS,
    DEMAND_QUERY_RELEVANCE_PRIMARY_COVERAGE_MAX,
    DEMAND_QUERY_RELEVANCE_TITLE_COVERAGE_MAX,
    DEMAND_RULE_VERSION,
    DEMAND_SIGNAL_CANNIBALIZATION,
    DEMAND_SIGNAL_CTR_GAP,
    DEMAND_SIGNAL_DECLINING_QUERY,
    DEMAND_SIGNAL_EMERGING_QUERY,
    DEMAND_SIGNAL_QUERY_PAGE_RELEVANCE,
    DEMAND_SIGNAL_STATE_ACTIVE,
    DEMAND_TREND_DECLINING_RATIO,
    DEMAND_TREND_EMERGING_RATIO,
    DEMAND_TREND_GAP_WEIGHT,
    DEMAND_TREND_MIN_ABSOLUTE_CHANGE,
    DEMAND_TREND_MIN_TOTAL_IMPRESSIONS,
    DEMAND_TREND_MIN_WINDOW_IMPRESSIONS,
    DEMAND_TREND_REQUIRED_DAYS,
    DEMAND_TREND_WINDOW_DAYS,
)
from app.domain.demand.projection import (
    DemandSignalCandidate,
    DetectorEvaluation,
    QueryEvidenceInput,
    _aggregate_query_rows,
    _priority,
    detector_state,
    stable_hash,
)


def detect_cannibalization(rows: list[QueryEvidenceInput]) -> DetectorEvaluation:
    grouped: dict[str, list[QueryEvidenceInput]] = {}
    for row in rows:
        grouped.setdefault(row.normalized_query, []).append(row)
    candidates: list[DemandSignalCandidate] = []
    abstained = 0
    for query in sorted(grouped):
        outcome, candidate = _cannibalization_for_query(query, grouped[query])
        if outcome == "abstained":
            abstained += 1
        if candidate is not None:
            candidates.append(candidate)
    state = detector_state(abstained=abstained, rows=rows)
    return DetectorEvaluation(
        state,
        tuple(candidates),
        _classification_counts(rows),
        (f"{abstained} non-branded queries abstained on unresolved page identity.",)
        if abstained
        else (),
    )


def _cannibalization_for_query(
    query: str, rows: list[QueryEvidenceInput]
) -> tuple[str, DemandSignalCandidate | None]:
    if rows[0].classification != "non_branded":
        return "excluded", None
    if any(row.resolution_outcome not in {"exact", "resolved"} for row in rows):
        return "abstained", None
    by_page: dict[str, list[QueryEvidenceInput]] = {}
    for row in rows:
        by_page.setdefault(row.resolved_page_url, []).append(row)
    page_metrics = {
        page: _aggregate_query_rows(page_rows) for page, page_rows in by_page.items()
    }
    total = sum(item["impressions"] for item in page_metrics.values())
    qualifying = {
        page: item
        for page, item in page_metrics.items()
        if _qualifies_cannibalized_page(item["impressions"], total)
    }
    candidate = (
        _cannibalization_candidate(query, qualifying, total)
        if len(qualifying) >= 2
        else None
    )
    return "evaluated", candidate


def _qualifies_cannibalized_page(impressions: int, total: int) -> bool:
    return (
        impressions >= DEMAND_CANNIBALIZATION_MIN_PAGE_IMPRESSIONS
        and total > 0
        and impressions / total >= DEMAND_CANNIBALIZATION_MIN_PAGE_SHARE
    )


def _cannibalization_candidate(
    query: str, pages: dict[str, dict[str, Any]], total: int
) -> DemandSignalCandidate:
    all_rows = sorted(
        {source for item in pages.values() for source in item["source_metric_row_ids"]}
    )
    artifacts = sorted(
        {source for item in pages.values() for source in item["source_artifact_ids"]}
    )
    page_evidence = [
        {
            "url": page,
            "impressions": item["impressions"],
            "share": item["impressions"] / total,
        }
        for page, item in sorted(pages.items())
    ]
    return _custom_query_candidate(
        signal_type=DEMAND_SIGNAL_CANNIBALIZATION,
        query=query,
        page_url=page_evidence[0]["url"],
        metrics={"impressions": total, "qualifying_page_count": len(pages)},
        evidence={
            "pages": page_evidence,
            "classifier_versions": sorted(
                {
                    version
                    for item in pages.values()
                    for version in item["classifier_versions"]
                }
            ),
            "classification_override_ids": sorted(
                {
                    override
                    for item in pages.values()
                    for override in item["classification_override_ids"]
                }
            ),
        },
        source_metric_row_ids=all_rows,
        source_artifact_ids=artifacts,
        gap_weight=DEMAND_CANNIBALIZATION_GAP_WEIGHT,
    )


def detect_property_relative_ctr_gap(
    rows: list[QueryEvidenceInput],
) -> DetectorEvaluation:
    eligible = [row for row in rows if _eligible_ctr_row(row)]
    grouped = _group_aggregates(eligible, include_property=True)
    cohorts: dict[tuple[str, int], list[tuple[tuple[str, ...], dict[str, Any]]]] = {}
    for key, aggregate in grouped.items():
        band = _position_band(aggregate)
        if band is None:
            continue
        cohorts.setdefault((key[0], band), []).append((key, aggregate))
    candidates: list[DemandSignalCandidate] = []
    usable_cohorts = 0
    for cohort_key in sorted(cohorts):
        cohort = cohorts[cohort_key]
        if not _usable_ctr_cohort(cohort):
            continue
        usable_cohorts += 1
        median_ctr = statistics.median(float(item[1]["ctr"] or 0.0) for item in cohort)
        candidates.extend(_ctr_candidates(cohort, median_ctr))
    state = "available" if usable_cohorts else "unavailable"
    return DetectorEvaluation(
        state,
        tuple(candidates),
        _classification_counts(rows),
        ()
        if usable_cohorts
        else ("No property/position cohort met minimum coverage.",),
    )


def _eligible_ctr_row(row: QueryEvidenceInput) -> bool:
    return (
        row.classification == "non_branded"
        and row.resolution_outcome in {"exact", "resolved"}
        and row.position is not None
        and row.impressions > 0
    )


def _usable_ctr_cohort(
    cohort: list[tuple[tuple[str, ...], dict[str, Any]]],
) -> bool:
    impressions = sum(item[1]["impressions"] for item in cohort)
    return (
        len(cohort) >= DEMAND_CTR_GAP_MIN_COHORT_ROWS
        and impressions >= DEMAND_CTR_GAP_MIN_COHORT_IMPRESSIONS
    )


def _ctr_candidates(
    cohort: list[tuple[tuple[str, ...], dict[str, Any]]], median_ctr: float
) -> list[DemandSignalCandidate]:
    candidates: list[DemandSignalCandidate] = []
    for key, aggregate in cohort:
        ctr = float(aggregate["ctr"] or 0.0)
        if _is_ctr_gap(aggregate["impressions"], ctr, median_ctr):
            candidate = _ctr_gap_candidate(key, aggregate, median_ctr, cohort)
            if candidate is not None:
                candidates.append(candidate)
    return candidates


def _is_ctr_gap(impressions: int, ctr: float, median_ctr: float) -> bool:
    return (
        impressions >= DEMAND_CTR_GAP_MIN_CANDIDATE_IMPRESSIONS
        and ctr <= median_ctr * (1 - DEMAND_CTR_GAP_RELATIVE_THRESHOLD)
        and median_ctr - ctr >= DEMAND_CTR_GAP_ABSOLUTE_THRESHOLD
    )


def _relevance_scope(aggregate: dict[str, Any]) -> dict[str, Any]:
    observed_start = aggregate.get("observed_start")
    observed_end = aggregate.get("observed_end")
    return {
        "property_ref": aggregate.get("property_ref"),
        "country": "all",
        "device": "all",
        "date_start": observed_start.isoformat() if observed_start else None,
        "date_end": observed_end.isoformat() if observed_end else None,
    }


def _unknown_relevance(reason: str, scope: dict[str, Any]) -> dict[str, Any]:
    return {
        "signal_type": DEMAND_SIGNAL_QUERY_PAGE_RELEVANCE,
        "state": "unknown",
        "reason": reason,
        "signal_active": False,
        "scope": scope,
    }


def _relevance_coverages(
    terms: set[str], aggregate: dict[str, Any]
) -> tuple[float, float, float]:
    h1_text = " ".join(aggregate.get("page_h1_texts") or ())
    return (
        float(normalized_coverage(terms, aggregate.get("page_title")) or 0.0),
        float(normalized_coverage(terms, h1_text) or 0.0),
        float(normalized_coverage(terms, aggregate.get("page_primary_content")) or 0.0),
    )


def _relevance_active(
    aggregate: dict[str, Any], coverages: tuple[float, float, float]
) -> bool:
    title, h1, primary = coverages
    return (
        int(aggregate["impressions"]) >= DEMAND_QUERY_RELEVANCE_MIN_IMPRESSIONS
        and title <= DEMAND_QUERY_RELEVANCE_TITLE_COVERAGE_MAX
        and h1 <= DEMAND_QUERY_RELEVANCE_H1_COVERAGE_MAX
        and primary <= DEMAND_QUERY_RELEVANCE_PRIMARY_COVERAGE_MAX
    )


def _query_relevance(query: str, aggregate: dict[str, Any]) -> dict[str, Any]:
    terms = lexical_tokens(query, min_length=1)
    scope = _relevance_scope(aggregate)
    if not terms:
        return _unknown_relevance("no_usable_query_terms", scope)
    if not aggregate.get("page_content_usable"):
        return _unknown_relevance("page_content_unavailable", scope)
    title_terms = lexical_tokens(aggregate.get("page_title"), min_length=1)
    h1_terms = lexical_tokens(
        " ".join(aggregate.get("page_h1_texts") or ()), min_length=1
    )
    title_coverage, h1_coverage, primary_coverage = _relevance_coverages(
        terms, aggregate
    )
    active = _relevance_active(
        aggregate, (title_coverage, h1_coverage, primary_coverage)
    )
    statement = None
    if active:
        statement = (
            "This query underperforms its CTR baseline, and important query terms "
            "are poorly represented in the inspected page."
        )
    return {
        "signal_type": DEMAND_SIGNAL_QUERY_PAGE_RELEVANCE,
        "state": "measured",
        "signal_active": active,
        "title_coverage": round(title_coverage, 6),
        "h1_coverage": round(h1_coverage, 6),
        "primary_content_coverage": round(primary_coverage, 6),
        "absent_from_title": sorted(terms - title_terms),
        "absent_from_h1": sorted(terms - h1_terms),
        "page_analysis_id": aggregate.get("page_analysis_id"),
        "page_artifact_id": aggregate.get("page_artifact_id"),
        "scope": scope,
        "statement": statement,
    }


def _ctr_gap_candidate(
    key: tuple[str, ...],
    aggregate: dict[str, Any],
    median_ctr: float,
    cohort: list[tuple[tuple[str, ...], dict[str, Any]]],
) -> DemandSignalCandidate | None:
    property_ref, query, page_url = key
    position_band = _position_band(aggregate)
    if position_band is None:
        return None
    aggregate = {**aggregate, "property_ref": property_ref}
    return _custom_query_candidate(
        signal_type=DEMAND_SIGNAL_CTR_GAP,
        query=query,
        page_url=page_url,
        metrics={
            **{
                name: aggregate[name]
                for name in ("impressions", "clicks", "ctr", "position")
            },
            "cohort_median_ctr": median_ctr,
            "cohort_row_count": len(cohort),
            "cohort_impressions": sum(item[1]["impressions"] for item in cohort),
        },
        evidence={
            "property_ref": property_ref,
            "position_band": position_band,
            "classifier_versions": aggregate["classifier_versions"],
            "classification_override_ids": aggregate["classification_override_ids"],
            "query_relevance": _query_relevance(query, aggregate),
        },
        source_metric_row_ids=aggregate["source_metric_row_ids"],
        source_artifact_ids=aggregate["source_artifact_ids"],
        gap_weight=DEMAND_CTR_GAP_WEIGHT,
    )


def detect_query_trends(
    rows: list[QueryEvidenceInput], *, window_end: date
) -> DetectorEvaluation:
    coverage_start = window_end - timedelta(days=DEMAND_TREND_REQUIRED_DAYS - 1)
    expected_dates = {
        coverage_start + timedelta(days=offset)
        for offset in range(DEMAND_TREND_REQUIRED_DAYS)
    }
    covered_dates = {row.observed_date for row in rows} & expected_dates
    if covered_dates != expected_dates:
        return DetectorEvaluation(
            "insufficient_history",
            (),
            _classification_counts(rows),
            (f"At least {DEMAND_TREND_REQUIRED_DAYS} days of coverage are required.",),
        )
    recent_start = window_end - timedelta(days=DEMAND_TREND_WINDOW_DAYS - 1)
    prior_start = recent_start - timedelta(days=DEMAND_TREND_WINDOW_DAYS)
    grouped: dict[str, list[QueryEvidenceInput]] = {}
    for row in rows:
        if row.classification == "non_branded":
            grouped.setdefault(row.normalized_query, []).append(row)
    candidates: list[DemandSignalCandidate] = []
    for query in sorted(grouped):
        query_rows = grouped[query]
        prior, recent = _trend_counts(query_rows, prior_start, recent_start, window_end)
        signal_type = _trend_signal_type(prior, recent)
        if signal_type:
            candidates.append(
                _trend_candidate(signal_type, query, query_rows, prior, recent)
            )
    return DetectorEvaluation(
        "available", tuple(candidates), _classification_counts(rows), ()
    )


def _trend_counts(
    rows: list[QueryEvidenceInput],
    prior_start: date,
    recent_start: date,
    window_end: date,
) -> tuple[int, int]:
    prior = 0
    recent = 0
    for row in rows:
        if prior_start <= row.observed_date < recent_start:
            prior += row.impressions
        elif recent_start <= row.observed_date <= window_end:
            recent += row.impressions
    return prior, recent


def _trend_signal_type(prior: int, recent: int) -> str | None:
    if (
        prior + recent < DEMAND_TREND_MIN_TOTAL_IMPRESSIONS
        or prior < DEMAND_TREND_MIN_WINDOW_IMPRESSIONS
        or recent < DEMAND_TREND_MIN_WINDOW_IMPRESSIONS
    ):
        return None
    change = recent - prior
    if (
        recent >= prior * DEMAND_TREND_EMERGING_RATIO
        and change >= DEMAND_TREND_MIN_ABSOLUTE_CHANGE
    ):
        return DEMAND_SIGNAL_EMERGING_QUERY
    if (
        recent <= prior * DEMAND_TREND_DECLINING_RATIO
        and -change >= DEMAND_TREND_MIN_ABSOLUTE_CHANGE
    ):
        return DEMAND_SIGNAL_DECLINING_QUERY
    return None


def _trend_candidate(
    signal_type: str,
    query: str,
    rows: list[QueryEvidenceInput],
    prior: int,
    recent: int,
) -> DemandSignalCandidate:
    resolved_pages = sorted(
        {
            row.resolved_page_url
            for row in rows
            if row.resolution_outcome in {"exact", "resolved"}
        }
    )
    return _custom_query_candidate(
        signal_type=signal_type,
        query=query,
        page_url=resolved_pages[0] if len(resolved_pages) == 1 else "",
        metrics={
            "impressions": prior + recent,
            "prior_impressions": prior,
            "recent_impressions": recent,
        },
        evidence={
            "resolved_pages": resolved_pages,
            "classifier_versions": sorted({row.classifier_version for row in rows}),
            "classification_override_ids": sorted(
                {
                    row.classification_override_id
                    for row in rows
                    if row.classification_override_id
                }
            ),
        },
        source_metric_row_ids=sorted({row.source_metric_row_id for row in rows}),
        source_artifact_ids=sorted({row.source_artifact_id for row in rows}),
        gap_weight=DEMAND_TREND_GAP_WEIGHT,
    )


def _group_aggregates(
    rows: list[QueryEvidenceInput], *, include_property: bool
) -> dict[tuple[str, ...], dict[str, Any]]:
    grouped: dict[tuple[str, ...], list[QueryEvidenceInput]] = {}
    for row in rows:
        key: tuple[str, ...] = (row.normalized_query, row.resolved_page_url)
        if include_property:
            key = (row.property_ref, *key)
        grouped.setdefault(key, []).append(row)
    return {key: _aggregate_query_rows(group) for key, group in grouped.items()}


def _classification_counts(rows: list[QueryEvidenceInput]) -> dict[str, int]:
    counts = {"branded": 0, "non_branded": 0, "ambiguous": 0}
    for row in rows:
        counts[row.classification] = counts.get(row.classification, 0) + 1
    return counts


def _position_band(aggregate: dict[str, Any]) -> int | None:
    position = aggregate.get("position")
    return math.floor(float(position)) if isinstance(position, int | float) else None


def _custom_query_candidate(
    *,
    signal_type: str,
    query: str,
    page_url: str,
    metrics: dict[str, Any],
    evidence: dict[str, Any],
    source_metric_row_ids: list[str],
    source_artifact_ids: list[str],
    gap_weight: float,
) -> DemandSignalCandidate:
    ctr = metrics.get("ctr")
    priority, inputs = _priority(
        impressions=int(metrics["impressions"]),
        ctr=float(ctr) if isinstance(ctr, int | float) else None,
        gap=gap_weight,
    )
    return DemandSignalCandidate(
        identity_hash=stable_hash(
            {
                "type": signal_type,
                "query": query,
                "page_url": page_url,
                "rule_version": DEMAND_RULE_VERSION,
            }
        ),
        signal_type=signal_type,
        state=DEMAND_SIGNAL_STATE_ACTIVE,
        topic_cluster=query,
        page_url=page_url,
        evidence={
            "target_kind": "query",
            "target": query,
            "resolved_page_url": page_url,
            "source_metric_row_ids": source_metric_row_ids,
            "source_artifact_ids": source_artifact_ids,
            **evidence,
        },
        metrics=metrics,
        coverage={"query_evidence": "observed"},
        limitations=["GSC detail rows may omit privacy-filtered queries."],
        priority_score=priority,
        priority_inputs=inputs,
    )
