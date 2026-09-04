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
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import urljoin, urlsplit


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


@dataclass
class GscAccum:
    """Running GSC aggregate (clicks/impressions sums + weighted position)."""

    impressions: int = 0
    clicks: int = 0
    position_weighted_sum: float = 0.0
    position_impressions: int = 0
    has_rows: bool = False
    row_ids: set[str] = field(default_factory=set)
    artifact_ids: set[str] = field(default_factory=set)

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
    row_ids: set[str] = field(default_factory=set)
    artifact_ids: set[str] = field(default_factory=set)

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


def absolute_page_value(raw_page_value: str, project_origin: str | None) -> str:
    value = raw_page_value.strip()
    if urlsplit(value).scheme or not project_origin:
        return value
    return urljoin(project_origin.rstrip("/") + "/", value)
