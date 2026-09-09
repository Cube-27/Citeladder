"""Folding persisted snapshots into visibility-trend points.

The seam is a natural one: everything here is deterministic and does no I/O,
operating only on values already projected from persisted rows.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import overload

from app.core.config.analysis import VISIBILITY_TRENDS_STRICT_VERSION_BUCKETS
from app.domain.analysis.measurement import (
    competitor_rate,
    measurement_counts,
    observed_rate,
)
from app.domain.analysis.schemas import (
    MeasurementCounts,
    ModelProvenance,
    VisibilityTrendPoint,
    VisibilityTrendRankingRow,
    VisibilityTrendSov,
)
from app.domain.audits.schemas import build_model_provenance


@dataclass
class _RankingAccumulator:
    """Running mention/rate sums for one entity across a bucket's snapshots."""

    name: str
    is_brand: bool
    mention_count: int = 0
    # Completion-weighted rate numerators (rate * completions) with a SEPARATE
    # denominator per rate, so a snapshot that reports one rate but not the
    # other does not dilute the missing one as though it were zero.
    mention_rate_weight: float = 0.0
    mention_rate_denom: int = 0
    citation_rate_weight: float = 0.0
    citation_rate_denom: int = 0


@dataclass
class _RateAccumulator:
    """Completion-weighted numerator/denominator for a single headline rate."""

    weighted: float = 0.0
    weight: int = 0

    def add(self, rate: float | None, completions: int) -> None:
        if rate is None or completions <= 0:
            return
        self.weighted += float(rate) * completions
        self.weight += completions

    def value(self) -> float | None:
        if self.weight <= 0:
            return None
        return self.weighted / self.weight


@overload
def _to_utc(value: datetime) -> datetime: ...


@overload
def _to_utc(value: None) -> None: ...


def _to_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        # Defensive: the query layer already rejects naive datetimes.
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


@dataclass
class _TrendSource:
    """One dashboard-ready snapshot projected into trend-ready primitives.

    A raw point folds exactly one of these; a bucket folds many. ``metrics`` is
    the persisted per-run metrics dict, or the engine slice
    (``metrics.per_engine[engine]``) when the request is engine-filtered.
    ``(transport_model, retrieval_enabled)`` is the frozen folding identity:
    sources may be folded together only when both match.
    """

    snapshot_id: uuid.UUID
    audit_id: uuid.UUID
    completed_at: datetime
    logical_engine: str | None
    transport_model: str | None
    retrieval_enabled: bool | None
    model_provenance: list[ModelProvenance]
    analyzer_version: str
    scoring_rule_version: str
    total_completed: int
    visibility_score: float | None
    metrics: dict
    comparison_key: str | None = None
    prompt_performance_score: float | None = None


@dataclass
class _BucketAccumulators:
    """Mutable pure-fold state for one compatible trend bucket."""

    visibility: _RateAccumulator = field(default_factory=_RateAccumulator)
    brand_rate: _RateAccumulator = field(default_factory=_RateAccumulator)
    owned_rate: _RateAccumulator = field(default_factory=_RateAccumulator)
    response_sov: _RateAccumulator = field(default_factory=_RateAccumulator)
    mention_counts: dict[str, int] = field(default_factory=dict)
    rankings: dict[str, _RankingAccumulator] = field(default_factory=dict)
    brand_names: set[str] = field(default_factory=set)


def _brand_name(counts: dict, metrics: dict) -> str:
    # The SOV block keys the brand by its display name; the first non-competitor
    # entry is the brand. Fall back to a stable label.
    competitor_names = set(metrics.get("competitor_mention_rate") or {})
    for name in counts:
        if name not in competitor_names:
            return name
    return "Brand"


def _response_sov(metrics: dict) -> float | None:
    """Response-level SOV: brand presence share vs competitor presence rates.

    Deterministically derived from the persisted brand/competitor
    response-presence rates already in the snapshot — no re-read of responses.

    This is NOT the mention-level figure beside it: one asks how many answers
    named the brand at all, the other how many namings were the brand's. They
    coincide often enough that computing both from `mention_counts` looked
    right and reported one number twice.
    """
    brand_rate = metrics.get("brand_mention_rate")
    competitor_rate = metrics.get("competitor_mention_rate") or {}
    if brand_rate is None:
        return None
    total = float(brand_rate) + sum(
        float(v) for v in competitor_rate.values() if v is not None
    )
    if total <= 0:
        return 0.0
    return float(brand_rate) / total


def _mention_sov_of(counts: dict, names: set[str]) -> float | None:
    """Mention-level SOV summed over every brand key present in the bucket.

    Brand naming can change across snapshots in one bucket, so the numerator
    aggregates counts across all brand keys rather than a single name.
    """
    total = sum(int(v or 0) for v in counts.values())
    if total <= 0:
        return None
    brand_total = sum(int(counts.get(name, 0) or 0) for name in names)
    return brand_total / total


def _trend_rankings(metrics: dict) -> list[VisibilityTrendRankingRow]:
    """Brand-vs-competitor ranking rows for a raw point (persisted counts)."""
    sov = metrics.get("share_of_voice") or {}
    counts = sov.get("mention_counts") or {}
    total_presences = sum(counts.values())
    share = {
        name: count / total_presences if total_presences else None
        for name, count in counts.items()
    }
    brand_name = _brand_name(counts, metrics)
    competitor_mention = metrics.get("competitor_mention_rate") or {}

    rows: list[VisibilityTrendRankingRow] = [
        VisibilityTrendRankingRow(
            name=brand_name,
            is_brand=True,
            mention_rate=observed_rate(metrics, "brand_mention_rate"),
            citation_rate=observed_rate(metrics, "owned_citation_rate"),
            share_of_voice=share.get(brand_name),
            mention_count=int(counts.get(brand_name, 0) or 0),
        )
    ]
    for name in competitor_mention:
        rows.append(
            VisibilityTrendRankingRow(
                name=name,
                is_brand=False,
                mention_rate=competitor_rate(metrics, "competitor_mention_rate", name),
                citation_rate=competitor_rate(
                    metrics, "competitor_citation_rate", name
                ),
                share_of_voice=share.get(name),
                mention_count=int(counts.get(name, 0) or 0),
            )
        )
    rows.sort(key=lambda r: (-(r.share_of_voice or 0.0), r.name))
    return rows


def _raw_point(source: _TrendSource) -> VisibilityTrendPoint:
    metrics = source.metrics
    sov = metrics.get("share_of_voice") or {}
    counts = sov.get("mention_counts") or {}
    brand_name = _brand_name(counts, metrics)
    return VisibilityTrendPoint(
        audit_id=source.audit_id,
        completed_at=source.completed_at,
        logical_engine=source.logical_engine,
        visibility_score=source.visibility_score,
        visibility_rate=observed_rate(metrics, "brand_mention_rate"),
        prompt_performance_score=source.prompt_performance_score,
        counts=measurement_counts(metrics),
        comparison_key=source.comparison_key,
        source_audit_ids=[source.audit_id],
        brand_mention_rate=observed_rate(metrics, "brand_mention_rate"),
        owned_citation_rate=observed_rate(metrics, "owned_citation_rate"),
        sov=VisibilityTrendSov(
            response=_response_sov(metrics),
            mention=_mention_sov_of(counts, {brand_name}),
        ),
        rankings=_trend_rankings(metrics),
        sentiment=None,
        avg_position=None,
        transport_model=source.transport_model,
        retrieval_enabled=source.retrieval_enabled,
        model_provenance=source.model_provenance,
        source_snapshot_ids=[source.snapshot_id],
        analyzer_versions=[source.analyzer_version],
        scoring_rule_versions=[source.scoring_rule_version],
        spans_version_boundary=False,
    )


def _bucket_key(completed_at: datetime, granularity: str) -> datetime:
    """UTC bucket-start boundary for a completion timestamp."""
    at = _to_utc(completed_at)
    if granularity == "month":
        return datetime(at.year, at.month, 1, tzinfo=UTC)
    # Week: ISO Monday 00:00 UTC.
    day = datetime(at.year, at.month, at.day, tzinfo=UTC)
    return day - timedelta(days=at.weekday())


# Folding identity: ``(transport_model, retrieval_enabled)``.
# Raw, weekly, and monthly folding may combine sources ONLY inside one
# identity partition (invariant 7): no point or bucket ever mixes different
# models or retrieval states.
_TrendIdentity = tuple[str, str, str]


def _identity_of(source: _TrendSource) -> _TrendIdentity:
    return (
        source.comparison_key or str(source.snapshot_id),
        source.analyzer_version,
        source.scoring_rule_version,
    )


def _bucket_order(boundary: datetime, bucket: list[_TrendSource]) -> tuple:
    """Order for partitions that share one bucket boundary.

    By the identity a reader can SEE — the transport model and whether
    retrieval was on — not by `_TrendIdentity`, whose first element is a
    SHA-256 comparison key. Sorting on that hash is deterministic for one
    dataset and meaningless across any two, so two weeks holding the same
    pair of models could order them differently with nothing to explain it.
    Every source in a bucket shares one folding identity by construction.
    """
    source = bucket[0]
    return (boundary, source.transport_model or "", str(source.retrieval_enabled))


def _bucket_points(
    sources: list[_TrendSource], granularity: str
) -> list[VisibilityTrendPoint]:
    """Fold sources into deterministic UTC week/month identity partitions.

    Sources are grouped by ``(bucket boundary, folding identity)`` so a bucket
    never blends unlike identities; unlike identities in the same week/month
    emit separate ordered points. Under strict version bucketing, if any
    partition in the selected range would mix analyzer/scoring versions the
    whole range falls back to raw points so no bucket ever blends incompatible
    formulas.
    """
    grouped: dict[tuple[datetime, _TrendIdentity], list[_TrendSource]] = {}
    for source in sources:
        key = (_bucket_key(source.completed_at, granularity), _identity_of(source))
        grouped.setdefault(key, []).append(source)

    if VISIBILITY_TRENDS_STRICT_VERSION_BUCKETS and any(
        _is_mixed_version(bucket) for bucket in grouped.values()
    ):
        return [_raw_point(source) for source in sources]

    return [
        _fold_bucket(key[0], bucket)
        for key, bucket in sorted(
            grouped.items(),
            key=lambda entry: _bucket_order(entry[0][0], entry[1]),
        )
    ]


def _is_mixed_version(bucket: list[_TrendSource]) -> bool:
    analyzers = {s.analyzer_version for s in bucket}
    scorings = {s.scoring_rule_version for s in bucket}
    return len(analyzers) > 1 or len(scorings) > 1


def _bucket_provenance(bucket: list[_TrendSource]) -> list[ModelProvenance]:
    """The deduped, stable-ordered union of a partition's route provenance."""
    return build_model_provenance(
        item for source in bucket for item in source.model_provenance
    )


def _stored_mention_count(counts: dict, name: str) -> int:
    return int(counts.get(name, 0) or 0)


def _accumulate_bucket_ranking(
    accumulators: _BucketAccumulators,
    *,
    name: str,
    is_brand: bool,
    mention_count: int,
    mention_rate: float | None,
    citation_rate: float | None,
    completions: int,
) -> None:
    _accumulate_entity(
        accumulators.rankings,
        name=name,
        is_brand=is_brand,
        mention_count=mention_count,
        mention_rate=mention_rate,
        citation_rate=citation_rate,
        completions=completions,
    )
    accumulators.mention_counts[name] = (
        accumulators.mention_counts.get(name, 0) + mention_count
    )


def _accumulate_bucket_source(
    accumulators: _BucketAccumulators, source: _TrendSource
) -> None:
    """Add one persisted source without substituting for unknown rates."""
    metrics = source.metrics
    completions = source.total_completed
    accumulators.visibility.add(source.visibility_score, completions)
    accumulators.brand_rate.add(
        observed_rate(metrics, "brand_mention_rate"), completions
    )
    accumulators.owned_rate.add(
        observed_rate(metrics, "owned_citation_rate"), completions
    )
    accumulators.response_sov.add(_response_sov(metrics), completions)

    sov = metrics.get("share_of_voice") or {}
    counts = sov.get("mention_counts") or {}
    brand_name = _brand_name(counts, metrics)
    accumulators.brand_names.add(brand_name)
    _accumulate_bucket_ranking(
        accumulators,
        name=brand_name,
        is_brand=True,
        mention_count=_stored_mention_count(counts, brand_name),
        mention_rate=observed_rate(metrics, "brand_mention_rate"),
        citation_rate=observed_rate(metrics, "owned_citation_rate"),
        completions=completions,
    )

    competitor_mention = metrics.get("competitor_mention_rate") or {}
    competitor_citation = metrics.get("competitor_citation_rate") or {}
    for name in competitor_mention:
        _accumulate_bucket_ranking(
            accumulators,
            name=name,
            is_brand=False,
            mention_count=_stored_mention_count(counts, name),
            mention_rate=competitor_mention.get(name),
            citation_rate=competitor_citation.get(name),
            completions=completions,
        )


def _folded_response_sov(brand_rate, ranking_rows) -> float | None:
    """Response-level SOV for a folded bucket.

    The same definition `_response_sov` applies to a raw point — the brand's
    share of response PRESENCE against its competitors' — computed from the
    folded rates rather than from counts. Both fields were previously the
    mention-level figure, so a bucket reported one number under two names.
    """
    if brand_rate is None:
        return None
    total = float(brand_rate) + sum(
        float(row.mention_rate)
        for row in ranking_rows
        if not row.is_brand and row.mention_rate is not None
    )
    if total <= 0:
        return 0.0
    return float(brand_rate) / total


def _fold_bucket(key: datetime, bucket: list[_TrendSource]) -> VisibilityTrendPoint:
    logical_engine = bucket[0].logical_engine
    accumulators = _BucketAccumulators()
    for source in bucket:
        _accumulate_bucket_source(accumulators, source)

    total_mentions = sum(accumulators.mention_counts.values())
    ranking_rows = _fold_ranking_rows(
        accumulators.rankings, accumulators.mention_counts, total_mentions
    )
    # Aggregate every brand key seen in the bucket for mention-level SOV so a
    # brand rename across snapshots does not undercount brand share.
    brand_keys = accumulators.brand_names or {"Brand"}

    # Every source in the bucket shares one folding identity by construction.
    transport_model = bucket[0].transport_model
    retrieval_enabled = bucket[0].retrieval_enabled
    counts = [measurement_counts(source.metrics) for source in bucket]
    return VisibilityTrendPoint(
        audit_id=None,
        completed_at=key,
        logical_engine=logical_engine,
        visibility_score=None,
        visibility_rate=accumulators.brand_rate.value(),
        comparison_key=bucket[0].comparison_key,
        run_count=len(bucket),
        source_audit_ids=[source.audit_id for source in bucket],
        counts=MeasurementCounts(
            state="measured"
            if sum(row.responses for row in counts)
            else "no_observations",
            responses=sum(row.responses for row in counts),
            brand_responses=_sum_known(counts, "brand_responses"),
            owned_citation_responses=_sum_known(counts, "owned_citation_responses"),
            entity_presences=_sum_known(counts, "entity_presences"),
            expected=_sum_known(counts, "expected"),
            failed=_sum_known(counts, "failed"),
            not_run=_sum_known(counts, "not_run"),
        ),
        brand_mention_rate=accumulators.brand_rate.value(),
        owned_citation_rate=accumulators.owned_rate.value(),
        sov=VisibilityTrendSov(
            response=_folded_response_sov(
                accumulators.brand_rate.value(), ranking_rows
            ),
            mention=_mention_sov_of(accumulators.mention_counts, brand_keys),
        ),
        rankings=ranking_rows,
        sentiment=None,
        avg_position=None,
        transport_model=transport_model,
        retrieval_enabled=retrieval_enabled,
        model_provenance=_bucket_provenance(bucket),
        source_snapshot_ids=[source.snapshot_id for source in bucket],
        analyzer_versions=sorted({s.analyzer_version for s in bucket}),
        scoring_rule_versions=sorted({s.scoring_rule_version for s in bucket}),
        spans_version_boundary=_is_mixed_version(bucket),
    )


def _sum_known(rows: list[MeasurementCounts], field: str) -> int | None:
    values = [getattr(row, field) for row in rows]
    return sum(values) if all(value is not None for value in values) else None


def _accumulate_entity(
    rankings: dict[str, _RankingAccumulator],
    *,
    name: str,
    is_brand: bool,
    mention_count: int,
    mention_rate: float | None,
    citation_rate: float | None,
    completions: int,
) -> None:
    acc = rankings.get(name)
    if acc is None:
        acc = _RankingAccumulator(name=name, is_brand=is_brand)
        rankings[name] = acc
    acc.is_brand = acc.is_brand or is_brand
    acc.mention_count += mention_count
    if completions > 0:
        if mention_rate is not None:
            acc.mention_rate_weight += float(mention_rate) * completions
            acc.mention_rate_denom += completions
        if citation_rate is not None:
            acc.citation_rate_weight += float(citation_rate) * completions
            acc.citation_rate_denom += completions


def _fold_ranking_rows(
    rankings: dict[str, _RankingAccumulator],
    mention_counts: dict[str, int],
    total_mentions: int,
) -> list[VisibilityTrendRankingRow]:
    rows: list[VisibilityTrendRankingRow] = []
    for name, acc in rankings.items():
        share = (
            mention_counts.get(name, 0) / total_mentions if total_mentions > 0 else None
        )
        rows.append(
            VisibilityTrendRankingRow(
                name=name,
                is_brand=acc.is_brand,
                mention_rate=(
                    acc.mention_rate_weight / acc.mention_rate_denom
                    if acc.mention_rate_denom > 0
                    else None
                ),
                citation_rate=(
                    acc.citation_rate_weight / acc.citation_rate_denom
                    if acc.citation_rate_denom > 0
                    else None
                ),
                share_of_voice=share,
                mention_count=acc.mention_count,
            )
        )
    rows.sort(key=lambda r: (-(r.share_of_voice or 0.0), r.name))
    return rows
