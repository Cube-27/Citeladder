"""Validation, resolution, and scalar helpers for Performance reads.

Everything a Performance read needs BEFORE it touches a projection: the
request-validation vocabulary (range, compare mode, dimension, sort, page
size, custom window), the window arithmetic that turns a selected range into
a comparison range, the snapshot resolution rules, and the opaque cursor
codec.

Nothing here recomputes a metric. A range resolves to a PERSISTED snapshot or
to nothing at all; an unresolved range is reported as such (invariant 7).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.traffic import (
    PERFORMANCE_COMPARE_MODES,
    PERFORMANCE_COMPARE_NONE,
    PERFORMANCE_COMPARE_PREVIOUS,
    PERFORMANCE_COMPARE_YEAR_OVER_YEAR,
    PERFORMANCE_CUSTOM_RANGE_MAX_DAYS,
    PERFORMANCE_DIMENSIONS,
    PERFORMANCE_EXTENDED_RANGE_DAYS,
    PERFORMANCE_PAGE_SIZE_OPTIONS,
    PERFORMANCE_PRESET_RANGE_DAYS,
    PERFORMANCE_RANGE_LAST_SYNCED,
    PERFORMANCE_RANGES,
    PERFORMANCE_SORT_WHITELIST,
    PERFORMANCE_YEAR_OVER_YEAR_SHIFT_DAYS,
    TRAFFIC_CONSUMED_DATASETS,
    TRAFFIC_DEFAULT_GRANULARITY,
    TRAFFIC_MAX_WINDOW_DAYS,
    TRAFFIC_SNAPSHOT_GRANULARITIES,
)
from app.domain.site_health.normalization import decode_keyset_cursor
from app.models.integrations import IntegrationMetricRow
from app.models.traffic import TrafficSnapshot


class PerformanceQueryError(ValueError):
    """An invalid Performance range, compare mode, dimension, sort, or size."""


class PerformanceCursorError(ValueError):
    """A Performance table cursor failed decode or scope verification."""


# --- Request validation -------------------------------------------------------


def validate_range(value: str | None, default: str) -> str:
    effective = value or default
    if effective not in PERFORMANCE_RANGES:
        raise PerformanceQueryError(f"unknown performance range: {effective!r}")
    return effective


def validate_granularity(
    value: str | None, default: str = TRAFFIC_DEFAULT_GRANULARITY
) -> str:
    """The chart's BUCKET size — day, week or month.

    Distinct from the range, which is the window's LENGTH: "last 28 days"
    charted in weekly buckets is one range and one granularity, not two
    ranges. Every refresh already writes the window at all three, so this
    only chooses which persisted rows the surface reads.

    ``None`` means the parameter was OMITTED and takes the default; an empty
    string means it was SENT empty, which is a malformed request rather than
    an absent one, so it fails validation instead of silently charting days.
    """
    effective = default if value is None else value
    if effective not in TRAFFIC_SNAPSHOT_GRANULARITIES:
        raise PerformanceQueryError(f"unknown performance granularity: {effective!r}")
    return effective


def validate_compare(value: str | None, default: str) -> str:
    effective = value or default
    if effective not in PERFORMANCE_COMPARE_MODES:
        raise PerformanceQueryError(f"unknown performance compare: {effective!r}")
    return effective


def validate_dimension(value: str | None, default: str) -> str:
    effective = value or default
    if effective not in PERFORMANCE_DIMENSIONS:
        raise PerformanceQueryError(f"unknown performance dimension: {effective!r}")
    return effective


def validate_page_size(value: int | None, default: int) -> int:
    """Page size must be one of the offered options — never silently clamped.

    A clamped size would page a different result set than the cursor the
    client already holds was cut against, silently skipping or repeating
    rows. An unoffered size is a 422 instead.
    """
    effective = default if value is None else value
    if effective not in PERFORMANCE_PAGE_SIZE_OPTIONS:
        raise PerformanceQueryError(
            f"page_size must be one of {sorted(PERFORMANCE_PAGE_SIZE_OPTIONS)}"
        )
    return effective


def parse_sort(sort: str | None, *, default: str) -> tuple[str, bool]:
    """``-key`` descending / bare ``key`` ascending, whitelist-guarded."""
    effective = sort if sort else default
    descending = effective.startswith("-")
    key = effective[1:] if descending else effective
    if key not in PERFORMANCE_SORT_WHITELIST:
        raise PerformanceQueryError(f"unknown performance sort: {sort!r}")
    return key, descending


def validate_custom_window(
    from_date: date | None, to_date: date | None
) -> tuple[date, date] | None:
    """Validate an inclusive custom window, or ``None`` when both are absent.

    A half-specified window is rejected outright — the reader never has to
    guess which side was meant.
    """
    if from_date is None and to_date is None:
        return None
    if from_date is None or to_date is None:
        raise PerformanceQueryError("'from' and 'to' must be supplied together")
    if to_date < from_date:
        raise PerformanceQueryError("'to' must not be before 'from'")
    if window_days(from_date, to_date) > PERFORMANCE_CUSTOM_RANGE_MAX_DAYS:
        raise PerformanceQueryError(
            f"window exceeds {PERFORMANCE_CUSTOM_RANGE_MAX_DAYS} days"
        )
    return from_date, to_date


# --- Window arithmetic --------------------------------------------------------


def window_days(window_start: date, window_end: date) -> int:
    """The inclusive length of a window in days."""
    return (window_end - window_start).days + 1


def comparison_window(
    *,
    compare: str,
    selected: tuple[date, date],
    compare_from: date | None,
    compare_to: date | None,
) -> tuple[date, date] | None:
    """The comparison window for a selected window, or ``None`` for no compare.

    ``previous`` is the equal-length window ending the day before the
    selection. ``year_over_year`` shifts the selection back by whole weeks
    (``PERFORMANCE_YEAR_OVER_YEAR_SHIFT_DAYS``) so weekdays still line up —
    search traffic is strongly weekly, and a 365-day shift would compare a
    Monday against a Sunday. ``custom`` takes the caller's explicit window.
    """
    if compare == PERFORMANCE_COMPARE_NONE:
        return None
    window_start, window_end = selected
    if compare == PERFORMANCE_COMPARE_PREVIOUS:
        end = window_start - timedelta(days=1)
        return end - timedelta(days=window_days(window_start, window_end) - 1), end
    if compare == PERFORMANCE_COMPARE_YEAR_OVER_YEAR:
        shift = timedelta(days=PERFORMANCE_YEAR_OVER_YEAR_SHIFT_DAYS)
        return window_start - shift, window_end - shift
    explicit = validate_custom_window(compare_from, compare_to)
    if explicit is None:
        raise PerformanceQueryError(
            "compare=custom requires 'compare_from' and 'compare_to'"
        )
    return explicit


# --- Snapshot resolution ------------------------------------------------------


def _snapshots(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    granularity: str = TRAFFIC_DEFAULT_GRANULARITY,
):
    """The project's snapshots at one BUCKET granularity.

    Every refresh writes the window at all of
    ``TRAFFIC_SNAPSHOT_GRANULARITIES``; the surface picks which buckets to
    chart. Day remains the default, so a caller that names none is served
    exactly what it was before.
    """
    return (
        select(TrafficSnapshot)
        .where(TrafficSnapshot.workspace_id == workspace_id)
        .where(TrafficSnapshot.project_id == project_id)
        .where(TrafficSnapshot.granularity == granularity)
    )


async def resolve_window_snapshot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    window: tuple[date, date],
    granularity: str = TRAFFIC_DEFAULT_GRANULARITY,
) -> TrafficSnapshot | None:
    """The persisted snapshot for an EXACT inclusive window and granularity."""
    window_start, window_end = window
    return await session.scalar(
        _snapshots(workspace_id, project_id, granularity)
        .where(TrafficSnapshot.window_start == window_start)
        .where(TrafficSnapshot.window_end == window_end)
        .limit(1)
    )


async def resolve_preset_snapshot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    range_token: str,
    granularity: str = TRAFFIC_DEFAULT_GRANULARITY,
) -> TrafficSnapshot | None:
    """The NEWEST persisted snapshot of a preset's length.

    Resolving against the persisted family rather than against computed
    calendar dates is what makes a preset survive a sync that ran days ago:
    the refresh anchors the whole family at the latest complete GSC date, so
    the newest snapshot MARKED for this preset is the freshest evidence for
    it. The surface then renders the window it actually got.

    The match is on ``preset_window_days``, not on window length: a custom
    display range can be exactly seven days long, and resolving "Week" to it
    would silently show a window the preset never meant.
    """
    days = PERFORMANCE_PRESET_RANGE_DAYS[range_token]
    return await session.scalar(
        _snapshots(workspace_id, project_id, granularity)
        .where(TrafficSnapshot.preset_window_days == days)
        .order_by(TrafficSnapshot.window_end.desc(), TrafficSnapshot.id.desc())
        .limit(1)
    )


async def resolve_latest_snapshot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    granularity: str = TRAFFIC_DEFAULT_GRANULARITY,
) -> TrafficSnapshot | None:
    """The project's newest snapshot at this granularity — the landing view.

    Ordered by window END first and then by WIDTH, so a project holding the
    whole preset family lands on the widest window at the freshest end date
    rather than on the one-day preset that happens to share that end.
    """
    return await session.scalar(
        _snapshots(workspace_id, project_id, granularity)
        .order_by(
            TrafficSnapshot.window_end.desc(),
            TrafficSnapshot.window_start.asc(),
            TrafficSnapshot.id.desc(),
        )
        .limit(1)
    )


async def load_snapshot_by_id(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
) -> TrafficSnapshot | None:
    """One snapshot by id, scoped to its workspace AND project (invariant 5).

    A snapshot id alone never grants access: a table request naming another
    workspace's (or another project's) snapshot resolves to nothing.
    """
    return await session.scalar(
        select(TrafficSnapshot)
        .where(TrafficSnapshot.workspace_id == workspace_id)
        .where(TrafficSnapshot.project_id == project_id)
        .where(TrafficSnapshot.id == snapshot_id)
        .limit(1)
    )


async def coverage_window(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> tuple[date, date] | None:
    """The FULL window this project has imported evidence for.

    "Last synced" means everything that has landed, not the most recent
    snapshot: a first connect imports a year in chunked windows, and each
    chunk writes a snapshot of its own, so resolving the newest one lands a
    reader on the last few weeks and makes a completed year-long import look
    like it never ran.

    Clamped to ``TRAFFIC_MAX_WINDOW_DAYS`` at the FRESH end, which is the
    budget every served window obeys — a longer history keeps its most
    recent days rather than being refused outright.
    """
    earliest, latest = (
        await session.execute(
            select(
                func.min(IntegrationMetricRow.date),
                func.max(IntegrationMetricRow.date),
            )
            .where(IntegrationMetricRow.workspace_id == workspace_id)
            .where(IntegrationMetricRow.project_id == project_id)
            .where(IntegrationMetricRow.dataset.in_(sorted(TRAFFIC_CONSUMED_DATASETS)))
        )
    ).one()
    if earliest is None or latest is None:
        return None
    floor = latest - timedelta(days=TRAFFIC_MAX_WINDOW_DAYS - 1)
    return max(earliest, floor), latest


async def resolve_selected_window(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    range_token: str,
    custom: tuple[date, date] | None,
    granularity: str = TRAFFIC_DEFAULT_GRANULARITY,
) -> tuple[TrafficSnapshot | None, tuple[date, date] | None]:
    """Resolve the selected range into ``(snapshot, window)``.

    Either half can be absent: an explicit custom range has a window before a
    snapshot for it exists (the caller then queues the range projection), and
    a project with no snapshots at all has neither.
    """
    if custom is not None:
        snapshot = await resolve_window_snapshot(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            window=custom,
            granularity=granularity,
        )
        return snapshot, custom
    elif range_token in PERFORMANCE_PRESET_RANGE_DAYS:
        snapshot = await resolve_preset_snapshot(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            range_token=range_token,
            granularity=granularity,
        )
    elif range_token in PERFORMANCE_EXTENDED_RANGE_DAYS:
        days = PERFORMANCE_EXTENDED_RANGE_DAYS[range_token]
        latest = await resolve_latest_snapshot(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            granularity=granularity,
        )
        if latest is not None and latest.window_end:
            target_window = (
                latest.window_end - timedelta(days=days - 1),
                latest.window_end,
            )
            snapshot = await resolve_window_snapshot(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                window=target_window,
                granularity=granularity,
            )
            return snapshot, target_window
        return None, None
    elif range_token == PERFORMANCE_RANGE_LAST_SYNCED:
        window = await coverage_window(
            session, workspace_id=workspace_id, project_id=project_id
        )
        if window is None:
            return None, None
        snapshot = await resolve_window_snapshot(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            window=window,
            granularity=granularity,
        )
        # The window is stated even with no snapshot for it: the caller then
        # queues the range projection for exactly these dates, which is how a
        # freshly imported year becomes readable at all.
        return snapshot, window
    else:
        snapshot = await resolve_latest_snapshot(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            granularity=granularity,
        )
    if snapshot is None:
        return None, None
    return snapshot, (snapshot.window_start, snapshot.window_end)


# --- Scalar coercion ----------------------------------------------------------


def int_or_none(value: object) -> int | None:
    return int(value) if isinstance(value, (int, float)) else None


def float_or_none(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


def str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


# --- Cursor codec -------------------------------------------------------------


def table_filters(
    *,
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    dimension: str,
    sort: str,
    page_size: int,
) -> dict[str, object]:
    """The cursor's binding fingerprint.

    Every input that changes WHICH rows are returned or IN WHAT ORDER
    participates, so a cursor replayed after a tab, sort, snapshot, or page
    size change is refused rather than silently relabelling another result
    set. The comparison snapshot is deliberately absent: it adds columns to a
    row, never rows or ordering.
    """
    return {
        "project_id": str(project_id),
        "snapshot_id": str(snapshot_id),
        "dimension": dimension,
        "sort": sort,
        "page_size": str(page_size),
    }


def decode_table_cursor(
    cursor: str, *, scope: str, filters: dict[str, object]
) -> tuple[str, uuid.UUID]:
    """Decode an opaque keyset cursor into ``(sort value, row id)``.

    The sort value stays a STRING here; the reader casts it to the type its
    sort key needs. An empty string means the row's sort value was NULL.
    """
    try:
        value_raw, id_raw = decode_keyset_cursor(cursor, scope=scope, filters=filters)
        return value_raw, uuid.UUID(id_raw)
    except ValueError as exc:
        raise PerformanceCursorError(str(exc)) from exc
