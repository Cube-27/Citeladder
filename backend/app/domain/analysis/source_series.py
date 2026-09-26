"""How often each source was used, bucketed over the selected period.

The Sources tables answer "how much, in total, over this window". This answers
"and was that steady". They are separate reads on purpose: a table row folds
the whole window into one number, and re-deriving a series from paginated rows
would chart whichever page the reader happened to be on.

The time axis is ``Audit.completed_at``, not ``Citation.created_at``. Every
citation in one execution is written in the same instant, so analysis time
measures when the pipeline ran; run completion is when the answers were
observed, and it is the axis every other cross-run surface already uses.

Only the leading sources get a line. A chart with one line per cited domain is
not a chart, and the table below it is where the full inventory lives.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select

from app.core.config.analysis import VISIBILITY_EVIDENCE_DEFAULT_LIMIT
from app.domain.analysis.errors import TrendQueryError
from app.domain.analysis.evidence import (
    _authorized_selection,
    _evidence_statement,
)
from app.domain.analysis.schemas import (
    SourceSeries,
    SourceSeriesPoint,
    SourceSeriesResponse,
)
from app.domain.analysis.selection import RunSelection
from app.models.analysis import Citation, ResponseAnalysis
from app.models.audit import Audit
from app.models.source_pages import SourcePage

# Lines a reader can actually tell apart, and the number of categorical chart
# tokens the design system defines.
SOURCE_SERIES_MAX_SERIES = 5

_BUCKETS = {"day": "day", "week": "week", "month": "month"}


async def get_visibility_source_series(
    session,
    selection: RunSelection,
    *,
    dimension: str = "domain",
    granularity: str = "day",
    domain: str | None = None,
    source_class: str | None = None,
    limit: int = SOURCE_SERIES_MAX_SERIES,
) -> SourceSeriesResponse:
    """Top-N sources by citations, as a share of the responses in each bucket."""
    if dimension not in {"domain", "url"}:
        raise TrendQueryError("'dimension' must be 'domain' or 'url'")
    truncation = _BUCKETS.get(granularity)
    if truncation is None:
        raise TrendQueryError("'granularity' must be 'day', 'week' or 'month'")
    selection = await _authorized_selection(
        session, selection, limit=VISIBILITY_EVIDENCE_DEFAULT_LIMIT
    )
    statement = _evidence_statement(selection)
    bucket = func.date_trunc(
        truncation, func.coalesce(Audit.completed_at, Audit.created_at)
    )
    scope = (
        statement.with_only_columns(
            ResponseAnalysis.id.label("analysis_id"),
            bucket.label("bucket"),
        )
        .order_by(None)
        .subquery()
    )
    # The denominator per bucket: every response observed in it, whether or not
    # it cited anything. Dividing by "responses that cited something" would
    # make a run where the engines cited nothing look like a full-share run.
    totals = dict(
        (row.bucket, int(row.responses))
        for row in (
            await session.execute(
                select(
                    scope.c.bucket.label("bucket"),
                    func.count(func.distinct(scope.c.analysis_id)).label("responses"),
                ).group_by(scope.c.bucket)
            )
        ).all()
    )
    if not totals:
        return SourceSeriesResponse(
            dimension=dimension, granularity=granularity, buckets=[], series=[]
        )
    # A URL series is keyed by page, and a page is filtered by its own format
    # exactly as the URL table is. Applying the table's filter value as a
    # publisher class would match nothing and draw an empty chart under a full
    # table.
    pages = dimension == "url" or bool(domain)
    key = Citation.url if dimension == "url" else Citation.domain
    counted = (
        select(
            key.label("key"),
            scope.c.bucket.label("bucket"),
            func.count(func.distinct(Citation.analysis_id)).label("responses"),
            func.count(Citation.id).label("citations"),
        )
        .join(scope, scope.c.analysis_id == Citation.analysis_id)
        .where(
            Citation.workspace_id == selection.workspace_id, key.is_not(None), key != ""
        )
    )
    if domain:
        counted = counted.where(Citation.domain == domain)
    if source_class:
        counted = (
            counted.join(
                SourcePage,
                (SourcePage.url_hash == Citation.url_hash)
                & (SourcePage.workspace_id == selection.workspace_id)
                & (SourcePage.project_id == selection.project_id),
            ).where(SourcePage.page_format == source_class)
            if pages
            else counted.where(Citation.source_class == source_class)
        )
    rows = (await session.execute(counted.group_by(key, scope.c.bucket))).all()
    return _assemble(
        rows,
        totals=totals,
        dimension=dimension,
        granularity=granularity,
        limit=max(1, min(limit, SOURCE_SERIES_MAX_SERIES)),
    )


def _assemble(rows, *, totals, dimension, granularity, limit) -> SourceSeriesResponse:
    """Fold the grouped rows into one dense series per leading source.

    Dense, not sparse: a bucket where a source was cited zero times is a real
    zero and has to be drawn as one. Leaving it out would let the line skip the
    gap and read as continuous use.
    """
    buckets = sorted(totals)
    ranked: dict[str, int] = {}
    for row in rows:
        ranked[row.key] = ranked.get(row.key, 0) + int(row.citations)
    leading = [
        key
        for key, _ in sorted(ranked.items(), key=lambda item: (-item[1], item[0]))[
            :limit
        ]
    ]
    by_key: dict[str, dict[datetime, int]] = {key: {} for key in leading}
    for row in rows:
        if row.key in by_key:
            by_key[row.key][row.bucket] = int(row.responses)
    return SourceSeriesResponse(
        dimension=dimension,
        granularity=granularity,
        buckets=[_utc(value) for value in buckets],
        series=[
            SourceSeries(
                key=key,
                citations=ranked[key],
                points=[
                    SourceSeriesPoint(
                        at=_utc(at),
                        responses=by_key[key].get(at, 0),
                        share=(by_key[key].get(at, 0) / totals[at])
                        if totals[at]
                        else None,
                    )
                    for at in buckets
                ],
            )
            for key in leading
        ],
    )


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)
