# Shared pure primitives of the traffic projection (no DB, no network, no
# clock; invariants 7 + 9).
#
# The reduced metric-row input every projection reads, the deterministic key
# normalizers, and the two running aggregates — GSC (clicks/impressions plus
# the impression-weighted position) and GA4 (sessions/engaged/key events).
#
# These live apart from ``projection.py`` because BOTH halves of the fold
# need them: the headline/series/page/query half and the per-dimension half
# (``dimensions.py``). One owner each (invariant 2), so a measure can never
# be summed one way for a headline and another way for a table.
from __future__ import annotations

import unicodedata
import uuid
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import urljoin, urlsplit

from app.core.config.traffic import TRAFFIC_PROVENANCE_ID_LIMIT


@dataclass(frozen=True)
class TrafficMetricRowInput:
    """One ``IntegrationMetricRow`` reduced to what the projection reads.

    The executor fills this from the ORM row; the pure math never sees the
    model. ``metrics`` carries the provider metric keys declared by the C1
    dataset template (GSC: clicks/impressions/ctr/position; GA4:
    sessions/engagedSessions/conversions).
    """

    id: uuid.UUID
    property_ref: str
    provider: str
    dataset: str
    date: date
    dimension_key: str
    metrics: Mapping[str, Any] | None
    source_artifact_id: uuid.UUID
    resync_seq: int
    importer_version: str = ""


def normalize_query(raw: str) -> str:
    """The ``TrafficQueryStat`` key: NFKC, casefold, whitespace collapse.

    Deterministic and locale-independent (invariant 9): the same raw GSC
    query string always keys to the same stat row. An input that collapses
    to nothing returns ``""`` (the caller skips it — a stat row needs a
    non-empty key).
    """
    return " ".join(unicodedata.normalize("NFKC", raw).casefold().split())


def metric_count(metrics: Mapping[str, Any] | None, key: str) -> int:
    """An additive measure: a missing/non-numeric key counts as 0."""
    value = (metrics or {}).get(key)
    return int(value) if isinstance(value, (int, float)) else 0


def number_or_none(metrics: Mapping[str, Any] | None, key: str) -> float | None:
    """A non-additive measure (position): absent when not numeric."""
    value = (metrics or {}).get(key)
    return float(value) if isinstance(value, (int, float)) else None


class BoundedIds:
    """A provenance id set that stays bounded WHILE accumulating.

    ``bounded_provenance`` keeps the lowest sorted ids, so an accumulator
    never needs to hold more than the limit to produce the same answer: any
    id above the current cut can never enter the kept sample. Retaining the
    full set instead made streaming memory proportional to the window's row
    count -- the very bound the batch-by-batch fold exists to establish.

    ``total`` counts every DISTINCT id offered, so ``sampled`` stays honest
    (invariant 7) even though only a bounded sample is retained. Distinctness
    beyond the cut is decided against the kept sample plus the ids already
    discarded as too large, which is exact: a discarded id is always greater
    than the cut, so re-offering it is recognized without storing it.
    """

    __slots__ = ("_kept", "_limit", "_over_cut")

    def __init__(self, limit: int = TRAFFIC_PROVENANCE_ID_LIMIT) -> None:
        self._kept: set[str] = set()
        # Ids seen that sorted ABOVE the cut. Bounded in practice by the
        # distinct ids a single fold offers past the limit; held only to keep
        # ``total`` a distinct count rather than an occurrence count.
        self._over_cut: set[str] = set()
        self._limit = limit

    def add(self, value: str) -> None:
        if value in self._kept or value in self._over_cut:
            return
        self._kept.add(value)
        if len(self._kept) > self._limit:
            # Evict the largest: the kept sample is the lowest ``limit`` ids.
            largest = max(self._kept)
            self._kept.discard(largest)
            self._over_cut.add(largest)

    def update(self, values: Iterable[str]) -> None:
        for value in values:
            self.add(value)

    def __len__(self) -> int:
        """The DISTINCT count offered, not the retained sample size."""
        return len(self._kept) + len(self._over_cut)

    def __iter__(self) -> Iterator[str]:
        return iter(self._kept)

    def __or__(self, other: BoundedIds) -> BoundedIds:
        merged = BoundedIds(self._limit)
        merged.update(self._kept)
        merged.update(other._kept)
        # Preserve both sides' discarded ids so the union's ``total`` counts
        # every distinct id either side ever saw.
        merged._over_cut |= (self._over_cut | other._over_cut) - merged._kept
        return merged

    def provenance(self) -> Provenance:
        return Provenance(ids=sorted(self._kept), total=len(self))


@dataclass
class GscAccum:
    """Running GSC aggregate (clicks/impressions sums + weighted position)."""

    impressions: int = 0
    clicks: int = 0
    position_weighted_sum: float = 0.0
    position_impressions: int = 0
    has_rows: bool = False
    row_ids: BoundedIds = field(default_factory=BoundedIds)
    artifact_ids: BoundedIds = field(default_factory=BoundedIds)

    def add(self, row: TrafficMetricRowInput) -> None:
        self.has_rows = True
        impressions = metric_count(row.metrics, "impressions")
        self.impressions += impressions
        self.clicks += metric_count(row.metrics, "clicks")
        position = number_or_none(row.metrics, "position")
        if position is not None:
            self.position_weighted_sum += position * impressions
            self.position_impressions += impressions
        self.row_ids.add(str(row.id))
        self.artifact_ids.add(str(row.source_artifact_id))

    def ctr(self) -> float | None:
        # ctr = clicks / impressions; undefined with zero impressions.
        if self.impressions == 0:
            return None
        return self.clicks / self.impressions

    def position(self) -> float | None:
        # Impression-weighted mean over position-bearing rows only.
        if self.position_impressions == 0:
            return None
        return self.position_weighted_sum / self.position_impressions

    def measures(self) -> dict[str, Any]:
        return {
            "impressions": self.impressions,
            "clicks": self.clicks,
            "ctr": self.ctr(),
            "position": self.position(),
        }

    def observed_measures(self) -> dict[str, Any]:
        """Headline shape: every measure NULL when no row fed this accumulator.

        A dimension/page/query row exists only because rows fed it, so those
        keep :meth:`measures`. The headline total is different: with no
        ``gsc_day_daily`` evidence the window is UNMEASURED, and reporting
        zero clicks there would be a fabricated observation.
        """
        if not self.has_rows:
            return {
                "impressions": None,
                "clicks": None,
                "ctr": None,
                "position": None,
            }
        return self.measures()


@dataclass
class Ga4Accum:
    """Running GA4 aggregate using the stable key-events contract."""

    sessions: int = 0
    engaged_sessions: int = 0
    key_events: int = 0
    has_rows: bool = False
    row_ids: BoundedIds = field(default_factory=BoundedIds)
    artifact_ids: BoundedIds = field(default_factory=BoundedIds)

    @staticmethod
    def _key_events(metrics: Mapping[str, Any] | None) -> int:
        key = (
            "keyEvents"
            if metrics is not None and "keyEvents" in metrics
            else "conversions"
        )
        return metric_count(metrics, key)

    def _observed(self, value: int) -> int | None:
        return value if self.has_rows else None

    def add(self, row: TrafficMetricRowInput) -> None:
        self.has_rows = True
        self.sessions += metric_count(row.metrics, "sessions")
        self.engaged_sessions += metric_count(row.metrics, "engagedSessions")
        # ``conversions`` supports already-persisted pre-Demand rows.
        self.key_events += self._key_events(row.metrics)
        self.row_ids.add(str(row.id))
        self.artifact_ids.add(str(row.source_artifact_id))

    def measures(self) -> dict[str, Any]:
        # Null (not 0) when no included GA4 row fed this total/bucket.
        return {
            "sessions": self._observed(self.sessions),
            "engaged_sessions": self._observed(self.engaged_sessions),
            "key_events": self._observed(self.key_events),
            # One compatibility window for the existing Traffic wire contract.
            "conversions": self._observed(self.key_events),
        }


@dataclass(frozen=True)
class Provenance:
    """One row's source ids, bounded, plus how many actually contributed.

    ``ids`` is at most ``TRAFFIC_PROVENANCE_ID_LIMIT`` entries — the lowest
    sorted ids, so re-running the same window records the same sample rather
    than an arbitrary one. ``total`` is the true contributing count, so a
    ``len(ids) < total`` row is READABLE as sampled instead of appearing
    complete (invariant 7: a sample is not the whole).
    """

    ids: list[str]
    total: int

    @property
    def sampled(self) -> bool:
        return len(self.ids) < self.total


def bounded_provenance(ids: set[str] | BoundedIds) -> Provenance:
    """Cap a provenance id set at the config-owned limit, deterministically."""
    if isinstance(ids, BoundedIds):
        return ids.provenance()
    total = len(ids)
    if total <= TRAFFIC_PROVENANCE_ID_LIMIT:
        return Provenance(ids=sorted(ids), total=total)
    return Provenance(ids=sorted(ids)[:TRAFFIC_PROVENANCE_ID_LIMIT], total=total)


def absolute_page_value(raw_page_value: str, project_origin: str | None) -> str:
    value = raw_page_value.strip()
    if urlsplit(value).scheme or not project_origin:
        return value
    return urljoin(project_origin.rstrip("/") + "/", value)
