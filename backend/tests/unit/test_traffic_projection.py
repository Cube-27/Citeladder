"""Pure traffic projection math (A7): bucketing, weighted position, CTR,
NFKC/casefold query keys, latest-``resync_seq`` selection, the GA4
inclusion rule, and the shared ``dimension_key`` unpack helper.

No database: every test drives ``domain/traffic/projection.py`` (and the
config-owned ``unpack_dimension_key``) with in-memory row inputs.
"""

from __future__ import annotations

import json
import uuid
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app.core.config.integrations_datasets import (
    DATASET_BING_PAGE_DAILY,
    DATASET_BING_QUERY_DAILY,
    DATASET_GA4_CHANNEL_DAILY,
    DATASET_GA4_LANDING_DAILY,
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DATASET_GSC_COUNTRY_DAILY,
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_DEVICE_DAILY,
    DATASET_GSC_PAGE_DAILY,
    DATASET_GSC_QUERY_DAILY,
    DATASET_GSC_SEARCH_APPEARANCE_DAILY,
    pack_dimension_key,
    unpack_dimension_key,
)
from app.core.config.traffic import TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS
from app.domain.traffic.accumulators import BoundedIds
from app.domain.traffic.projection import (
    TRAFFIC_SERIES_NAMES,
    TrafficMetricRowInput,
    TrafficProjectionBuilder,
    bucket_labels,
    bucket_start,
    build_traffic_projection,
    ga4_channel_included,
    ga4_source_medium_ai_match,
    normalize_query,
    row_identity,
    select_latest_rows,
)

_GSC = "gsc"
_GA4 = "ga4"
_GSC_PROPERTY = "https://example.com/"
_GA4_PROPERTY = "properties/123456789"


def _row(
    *,
    dataset: str,
    row_date: date,
    dimension_values: list[str],
    metrics: dict[str, Any] | None = None,
    resync_seq: int = 0,
    property_ref: str | None = None,
    provider: str | None = None,
    row_id: uuid.UUID | None = None,
    artifact_id: uuid.UUID | None = None,
) -> TrafficMetricRowInput:
    if provider is None:
        provider = _GSC if dataset.startswith("gsc") else _GA4
    if property_ref is None:
        property_ref = _GSC_PROPERTY if provider == _GSC else _GA4_PROPERTY
    return TrafficMetricRowInput(
        id=row_id or uuid.uuid4(),
        property_ref=property_ref,
        provider=provider,
        dataset=dataset,
        date=row_date,
        dimension_key=pack_dimension_key(dimension_values),
        metrics=metrics,
        source_artifact_id=artifact_id or uuid.uuid4(),
        resync_seq=resync_seq,
    )


def _gsc_page(
    url: str,
    row_date: date,
    *,
    clicks: int,
    impressions: int,
    position: float | None = None,
    **kwargs: Any,
) -> TrafficMetricRowInput:
    metrics: dict[str, Any] = {"clicks": clicks, "impressions": impressions}
    if position is not None:
        metrics["position"] = position
    return _row(
        dataset=DATASET_GSC_PAGE_DAILY,
        row_date=row_date,
        dimension_values=[url, row_date.isoformat()],
        metrics=metrics,
        **kwargs,
    )


def _gsc_day(
    row_date: date,
    *,
    clicks: int,
    impressions: int,
    position: float | None = None,
    **kwargs: Any,
) -> TrafficMetricRowInput:
    """One ``gsc_day_daily`` row — the ONLY source of headline totals.

    The date-only report carries Search Console's own overall totals for a
    date, so every totals/series assertion below is driven by these rows. A
    dimensional dataset drops privacy-filtered rows and must never be summed
    into a headline.
    """
    metrics: dict[str, Any] = {"clicks": clicks, "impressions": impressions}
    if position is not None:
        metrics["position"] = position
    return _row(
        dataset=DATASET_GSC_DAY_DAILY,
        row_date=row_date,
        dimension_values=[row_date.isoformat()],
        metrics=metrics,
        **kwargs,
    )


def _totals(rows: list[TrafficMetricRowInput], **kwargs: Any) -> dict[str, Any]:
    projection = build_traffic_projection(rows=rows, **kwargs)
    return projection.metrics["totals"]


def test_sanitized_cube27_combines_gsc_and_ga4_without_coercing_zero() -> None:
    fixture_path = (
        Path(__file__).resolve().parents[1]
        / "fixtures"
        / "demand"
        / "cube27_combined_projection.json"
    )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    rows = [
        _row(
            provider=item["provider"],
            dataset=item["dataset"],
            row_date=date.fromisoformat(item["date"]),
            dimension_values=item["dimensions"],
            metrics=item["metrics"],
            row_id=uuid.UUID(item["row_id"]),
            artifact_id=uuid.UUID(item["artifact_id"]),
        )
        for item in fixture["rows"]
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date.fromisoformat(fixture["window_start"]),
        window_end=date.fromisoformat(fixture["window_end"]),
        granularity="day",
        project_origin=fixture["site_origin"],
    )
    expected = fixture["expected"]
    assert projection.metrics["totals"] == {
        "impressions": expected["impressions"],
        "clicks": expected["clicks"],
        "ctr": pytest.approx(expected["clicks"] / expected["impressions"]),
        "position": expected["position"] if "position" in expected else 14.2,
        "sessions": expected["sessions"],
        "engaged_sessions": expected["engagedSessions"],
        "key_events": expected["keyEvents"],
        "conversions": expected["keyEvents"],
    }
    assert projection.pages[0].canonical_url == expected["canonical_url"]
    assert len(projection.source_metric_row_ids) == expected["source_row_count"]
    assert len(projection.source_artifact_ids) == expected["source_artifact_count"]


# --- normalize_query ------------------------------------------------------------


def test_normalize_query_nfkc_casefold_whitespace() -> None:
    # Whitespace collapse + strip.
    assert normalize_query("  hello \t world \n") == "hello world"
    # Casefold (German sharp s -> ss).
    assert normalize_query("Straße") == "strasse"
    # NFKC compatibility: full-width latin folds to ASCII.
    assert normalize_query("ＦＵＬＬ ｗｉｄｔｈ") == "full width"
    # Whitespace-only collapses to nothing (caller skips the row).
    assert normalize_query("   ") == ""


# --- Bucketing --------------------------------------------------------------------


def test_bucket_start_day_week_month() -> None:
    wednesday = date(2026, 7, 22)
    assert bucket_start(wednesday, "day") == wednesday
    assert bucket_start(wednesday, "week") == date(2026, 7, 20)  # ISO Monday
    assert bucket_start(date(2026, 7, 26), "week") == date(2026, 7, 20)
    assert bucket_start(wednesday, "month") == date(2026, 7, 1)
    with pytest.raises(ValueError, match="granularity"):
        bucket_start(wednesday, "quarter")


def test_bucket_labels_aligned_to_window() -> None:
    # Day: every date in the inclusive window.
    assert bucket_labels(date(2026, 7, 20), date(2026, 7, 22), "day") == [
        date(2026, 7, 20),
        date(2026, 7, 21),
        date(2026, 7, 22),
    ]
    # Week: a window opening mid-week labels its first partial bucket with
    # the window start; later buckets keep their natural Monday starts.
    assert bucket_labels(date(2026, 7, 22), date(2026, 7, 29), "week") == [
        date(2026, 7, 22),
        date(2026, 7, 27),
    ]
    # Month: first partial bucket clamped, next month on the 1st.
    assert bucket_labels(date(2026, 6, 15), date(2026, 7, 10), "month") == [
        date(2026, 6, 15),
        date(2026, 7, 1),
    ]


# --- CTR / weighted position -----------------------------------------------------


def test_totals_ctr_and_impression_weighted_position() -> None:
    rows = [
        _gsc_day(date(2026, 7, 20), clicks=10, impressions=100, position=10.0),
        _gsc_day(date(2026, 7, 21), clicks=60, impressions=300, position=20.0),
    ]
    totals = _totals(
        rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 21),
        granularity="day",
    )
    assert totals["impressions"] == 400
    assert totals["clicks"] == 70
    assert totals["ctr"] == pytest.approx(70 / 400)
    # (10*100 + 20*300) / (100 + 300) — NOT the mean of the row positions.
    assert totals["position"] == pytest.approx(17.5)


def test_ctr_and_position_none_without_impressions() -> None:
    rows = [
        _gsc_page(
            "https://example.com/a",
            date(2026, 7, 20),
            clicks=0,
            impressions=0,
            position=5.0,
        )
    ]
    totals = _totals(
        rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert totals["ctr"] is None
    # Zero-impression position rows carry no weight: no denominator.
    assert totals["position"] is None


def test_position_ignores_rows_without_position_in_both_terms() -> None:
    rows = [
        _gsc_day(date(2026, 7, 20), clicks=5, impressions=100, position=8.0),
        # No position key: its impressions must NOT enter the denominator.
        _gsc_day(date(2026, 7, 21), clicks=5, impressions=900),
    ]
    totals = _totals(
        rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 21),
        granularity="day",
    )
    assert totals["position"] == pytest.approx(8.0)


# --- Latest-resync_seq selection ---------------------------------------------------


def test_select_latest_rows_keeps_highest_resync_seq_per_identity() -> None:
    shared_id = uuid.uuid4()
    stale = _gsc_day(
        date(2026, 7, 20), clicks=5, impressions=50, resync_seq=0, row_id=shared_id
    )
    fresh = _gsc_day(date(2026, 7, 20), clicks=9, impressions=90, resync_seq=1)
    other_identity = _gsc_day(date(2026, 7, 21), clicks=1, impressions=10, resync_seq=0)
    latest = select_latest_rows([stale, fresh, other_identity])
    assert len(latest) == 2
    assert stale.id not in {row.id for row in latest}

    projection = build_traffic_projection(
        rows=[stale, fresh],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert projection.metrics["totals"]["clicks"] == 9
    # The superseded row is not folded in and not in the provenance.
    assert str(stale.id) not in projection.source_metric_row_ids
    assert str(fresh.id) in projection.source_metric_row_ids


def test_select_latest_rows_treats_property_ref_as_identity() -> None:
    # Same page/date under TWO mapped properties are distinct identities.
    first = _gsc_page(
        "https://example.com/a",
        date(2026, 7, 20),
        clicks=1,
        impressions=10,
        property_ref="https://example.com/",
    )
    second = _gsc_page(
        "https://example.com/a",
        date(2026, 7, 20),
        clicks=2,
        impressions=20,
        property_ref="sc-domain:example.com",
    )
    assert len(select_latest_rows([first, second])) == 2


def test_relative_ga4_landing_resolves_against_project_origin() -> None:
    row = _row(
        dataset=DATASET_GA4_LANDING_DAILY,
        row_date=date(2026, 7, 20),
        dimension_values=[
            "/admissions?utm_source=ignored",
            "chatgpt.com",
            "referral",
            "20260720",
        ],
        metrics={"sessions": 3, "conversions": 1},
    )
    projection = build_traffic_projection(
        rows=[row],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
        project_origin="https://example.com",
    )
    assert len(projection.pages) == 1
    assert projection.pages[0].canonical_url == "https://example.com/admissions"
    assert projection.pages[0].metrics["sessions"] == 3


def test_ga4_uses_engaged_sessions_and_stable_key_events() -> None:
    row = _row(
        dataset=DATASET_GA4_CHANNEL_DAILY,
        row_date=date(2026, 7, 20),
        dimension_values=["Organic Search", "20260720"],
        metrics={"sessions": 7, "engagedSessions": 5, "keyEvents": 2},
    )
    totals = _totals(
        [row],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert totals["engaged_sessions"] == 5
    assert totals["key_events"] == 2
    assert totals["conversions"] == 2


# --- GA4 inclusion rule ---------------------------------------------------------------


def test_ga4_channel_inclusion_is_exactly_the_config_groups() -> None:
    assert "Organic Search" in TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS
    assert ga4_channel_included("Organic Search") is True
    assert ga4_channel_included("Paid Search") is False
    assert ga4_channel_included("Direct") is False
    assert ga4_channel_included("Referral") is False
    # Near-miss casings are NOT admitted — the config vocabulary is exact.
    assert ga4_channel_included("organic search") is False


def test_ga4_source_medium_inclusion_via_ai_classifier() -> None:
    assert ga4_source_medium_ai_match("chatgpt.com", "referral") is True
    assert ga4_source_medium_ai_match("perplexity.ai", "referral") is True
    # Organic/direct source-mediums are not AI referrals.
    assert ga4_source_medium_ai_match("google", "organic") is False
    assert ga4_source_medium_ai_match("newsletter", "email") is False


def test_ga4_totals_include_only_organic_channel_and_ai_source_medium() -> None:
    rows = [
        _row(
            dataset=DATASET_GA4_CHANNEL_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["Organic Search", "20260720"],
            metrics={"sessions": 7, "conversions": 2},
        ),
        _row(
            dataset=DATASET_GA4_CHANNEL_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["Paid Search", "20260720"],
            metrics={"sessions": 100, "conversions": 50},
        ),
        _row(
            dataset=DATASET_GA4_SOURCE_MEDIUM_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["chatgpt.com", "referral", "20260720"],
            metrics={"sessions": 4, "conversions": 1},
        ),
        _row(
            dataset=DATASET_GA4_SOURCE_MEDIUM_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["google", "organic", "20260720"],
            metrics={"sessions": 999, "conversions": 99},
        ),
    ]
    totals = _totals(
        rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    # 7 organic-channel + 4 AI sessions; paid + google/organic excluded.
    assert totals["sessions"] == 11
    assert totals["conversions"] == 3


def test_sessions_and_conversions_null_without_included_ga4_rows() -> None:
    rows = [
        _gsc_page(
            "https://example.com/a",
            date(2026, 7, 20),
            clicks=1,
            impressions=10,
        )
    ]
    totals = _totals(
        rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    # Null — never an invented zero when no GA4 connection feeds the window.
    assert totals["sessions"] is None
    assert totals["conversions"] is None


# --- build_traffic_projection: pages / queries / series / provenance ------------------


def test_query_rows_feed_query_stats_but_never_totals() -> None:
    rows = [
        _gsc_day(date(2026, 7, 20), clicks=10, impressions=100),
        _row(
            dataset=DATASET_GSC_QUERY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["Best  CRM\tTools ", "2026-07-20"],
            metrics={"clicks": 7, "impressions": 70, "position": 4.0},
        ),
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    # Totals come from the date-only dataset alone — no double counting.
    assert projection.metrics["totals"]["clicks"] == 10
    assert [q.normalized_query for q in projection.queries] == ["best crm tools"]
    assert projection.queries[0].metrics["clicks"] == 7
    # The query row IS provenance (it fed a query stat).
    assert str(rows[1].id) in projection.source_metric_row_ids


def test_page_key_canonicalizes_tracking_params_fragment_and_case() -> None:
    rows = [
        _gsc_page(
            "https://EXAMPLE.com:443/blog?utm_source=nl#top",
            date(2026, 7, 20),
            clicks=3,
            impressions=30,
        ),
        _gsc_page(
            "https://example.com/blog",
            date(2026, 7, 21),
            clicks=4,
            impressions=40,
        ),
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 21),
        granularity="day",
    )
    assert len(projection.pages) == 1
    page = projection.pages[0]
    assert page.canonical_url == "https://example.com/blog"
    assert page.metrics["clicks"] == 7
    assert len(page.source_metric_row_ids) == 2


def test_page_ga4_landing_metrics_and_exclusion_rule() -> None:
    page_url = "https://example.com/blog"
    rows = [
        _row(
            dataset=DATASET_GA4_LANDING_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=[page_url, "chatgpt.com", "referral", "20260720"],
            metrics={"sessions": 2, "conversions": 0},
        ),
        _row(
            dataset=DATASET_GA4_LANDING_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=[page_url, "google", "organic", "20260720"],
            metrics={"sessions": 50, "conversions": 5},
        ),
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert len(projection.pages) == 1
    page = projection.pages[0]
    # Page identity combines the configured organic and classified AI scope.
    assert page.metrics["sessions"] == 52
    assert page.metrics["conversions"] == 5
    # Landing rows feed page stats ONLY — never the snapshot totals.
    assert projection.metrics["totals"]["sessions"] is None


def test_page_without_ga4_rows_has_null_sessions() -> None:
    rows = [
        _gsc_page(
            "https://example.com/a",
            date(2026, 7, 20),
            clicks=1,
            impressions=10,
        )
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert projection.pages[0].metrics["sessions"] is None
    assert projection.pages[0].metrics["conversions"] is None


def test_uncanonicalizable_page_skipped_from_stats_but_totals_unaffected() -> None:
    day = _gsc_day(date(2026, 7, 20), clicks=6, impressions=60)
    broken_page = _gsc_page(
        "not a url",
        date(2026, 7, 20),
        clicks=6,
        impressions=60,
    )
    projection = build_traffic_projection(
        rows=[day, broken_page],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    # No page key could be formed, so the row appears in neither the page
    # stats nor the PAGES dimension table.
    assert projection.pages == ()
    assert projection.dimension_counts["page"] == 0
    # The headline is unaffected either way: it reads the date-only dataset,
    # never the page report, so a page that cannot be keyed can neither add
    # to nor subtract from the total.
    assert projection.metrics["totals"]["clicks"] == 6
    assert str(day.id) in projection.source_metric_row_ids


def test_unmappable_dimension_key_is_skipped() -> None:
    row = _row(
        dataset=DATASET_GSC_PAGE_DAILY,
        row_date=date(2026, 7, 20),
        dimension_values=["https://example.com/a", "2026-07-20"],
        metrics={"clicks": 5, "impressions": 50},
    )
    broken = TrafficMetricRowInput(
        **{**row.__dict__, "dimension_key": "https://example.com/a"}
    )
    projection = build_traffic_projection(
        rows=[broken],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    # Skipping the only row leaves the window with NO date-only evidence, so
    # the headline is unmeasured (null) rather than an observed zero.
    assert projection.metrics["totals"]["clicks"] is None
    assert projection.source_metric_row_ids == []


def test_out_of_window_rows_are_ignored() -> None:
    rows = [_gsc_day(date(2026, 7, 19), clicks=9, impressions=90)]
    totals = _totals(
        rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 22),
        granularity="day",
    )
    # Nothing measured the window, so the totals are null — an unimported
    # window and a window that measured zero are different states.
    assert totals["clicks"] is None
    assert totals["impressions"] is None


def test_series_buckets_render_gaps_for_rows_free_buckets() -> None:
    rows = [
        _gsc_day(date(2026, 7, 21), clicks=4, impressions=40, position=6.0),
        _row(
            dataset=DATASET_GA4_CHANNEL_DAILY,
            row_date=date(2026, 7, 21),
            dimension_values=["Organic Search", "20260721"],
            metrics={
                "sessions": 3,
                "engagedSessions": 2,
                "keyEvents": 1,
            },
        ),
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 22),
        granularity="day",
    )
    series = projection.metrics["series"]
    assert [p["date"] for p in series["clicks"]] == [
        "2026-07-20",
        "2026-07-21",
        "2026-07-22",
    ]
    # Rows-free buckets are gaps (None), never coerced zeros.
    assert [p["value"] for p in series["impressions"]] == [None, 40, None]
    assert [p["value"] for p in series["clicks"]] == [None, 4, None]
    assert [p["value"] for p in series["sessions"]] == [None, 3, None]
    assert [p["value"] for p in series["engaged_sessions"]] == [None, 2, None]
    assert [p["value"] for p in series["key_events"]] == [None, 1, None]
    assert [p["value"] for p in series["conversions"]] == [None, 1, None]
    # CTR/position computed per bucket.
    assert [p["value"] for p in series["ctr"]] == [None, 0.1, None]
    assert [p["value"] for p in series["position"]] == [None, 6.0, None]


def test_empty_window_projects_unmeasured_totals_and_gap_series() -> None:
    projection = build_traffic_projection(
        rows=[],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 21),
        granularity="day",
    )
    totals = projection.metrics["totals"]
    # Every measure is NULL: no evidence reached this window at all. Zero
    # would assert an observation that was never made.
    assert totals == {
        "impressions": None,
        "clicks": None,
        "ctr": None,
        "position": None,
        "sessions": None,
        "engaged_sessions": None,
        "key_events": None,
        "conversions": None,
    }
    assert projection.pages == ()
    assert projection.queries == ()
    assert projection.dimensions == ()
    assert projection.dimension_counts == dict.fromkeys(
        (
            "query",
            "page",
            "country",
            "device",
            "search_appearance",
            "day",
            "bing_query",
            "bing_page",
        ),
        0,
    )
    assert projection.source_metric_row_ids == []
    assert projection.source_artifact_ids == []
    assert len(projection.metrics["series"]["clicks"]) == 2
    assert set(projection.metrics["series"]) == set(TRAFFIC_SERIES_NAMES)
    assert all(
        point["value"] is None
        for series in projection.metrics["series"].values()
        for point in series
    )


def test_projection_is_order_independent() -> None:
    rows = [
        _gsc_page(
            "https://example.com/a",
            date(2026, 7, 20),
            clicks=3,
            impressions=30,
            position=1.5,
        ),
        _gsc_page(
            "https://example.com/b",
            date(2026, 7, 21),
            clicks=7,
            impressions=70,
            position=2.5,
        ),
        _row(
            dataset=DATASET_GSC_QUERY_DAILY,
            row_date=date(2026, 7, 21),
            dimension_values=["crm", "2026-07-21"],
            metrics={"clicks": 2, "impressions": 20, "position": 9.0},
        ),
    ]
    kwargs = {
        "window_start": date(2026, 7, 20),
        "window_end": date(2026, 7, 21),
        "granularity": "week",
    }
    forward = build_traffic_projection(rows=rows, **kwargs)
    reverse = build_traffic_projection(rows=list(reversed(rows)), **kwargs)
    assert forward.metrics == reverse.metrics
    assert forward.source_metric_row_ids == reverse.source_metric_row_ids
    assert forward.pages == reverse.pages
    assert forward.queries == reverse.queries
    # A week-granularity window inside one ISO week yields a single bucket.
    assert len(forward.metrics["series"]["clicks"]) == 1


def test_invalid_granularity_and_window_fail_loud() -> None:
    with pytest.raises(ValueError, match="granularity"):
        build_traffic_projection(
            rows=[],
            window_start=date(2026, 7, 20),
            window_end=date(2026, 7, 21),
            granularity="quarter",
        )
    with pytest.raises(ValueError, match="window_end"):
        build_traffic_projection(
            rows=[],
            window_start=date(2026, 7, 22),
            window_end=date(2026, 7, 21),
            granularity="day",
        )


# --- unpack_dimension_key (config-owned inverse of pack_dimension_key) -----


def test_unpack_dimension_key_round_trips_declared_arity() -> None:
    key = pack_dimension_key(["https://example.com/a", "2026-07-20"])
    assert unpack_dimension_key(DATASET_GSC_PAGE_DAILY, key) == (
        "https://example.com/a",
        "2026-07-20",
    )


def test_unpack_dimension_key_right_peels_separator_inside_leading_value() -> None:
    # A " | " inside the page value must survive: the split peels only the
    # trailing date dimension (declared arity 2).
    key = pack_dimension_key(["https://example.com/a | b", "2026-07-20"])
    assert unpack_dimension_key(DATASET_GSC_PAGE_DAILY, key) == (
        "https://example.com/a | b",
        "2026-07-20",
    )
    key = pack_dimension_key(
        ["https://example.com/lp", "chatgpt.com", "referral", "20260720"]
    )
    assert unpack_dimension_key(DATASET_GA4_LANDING_DAILY, key) == (
        "https://example.com/lp",
        "chatgpt.com",
        "referral",
        "20260720",
    )


def test_unpack_dimension_key_rejects_wrong_arity_and_unknown_dataset() -> None:
    assert unpack_dimension_key(DATASET_GSC_PAGE_DAILY, "https://example.com/a") is None
    assert unpack_dimension_key("bing_unknown_daily", "a | b") is None


# --- Performance dimension fold ------------------------------------------------


def test_each_gsc_dataset_folds_into_exactly_one_dimension() -> None:
    """One dataset feeds one table — never a headline, never a second table."""
    rows = [
        _gsc_day(date(2026, 7, 20), clicks=10, impressions=100, position=5.0),
        _gsc_day(date(2026, 7, 21), clicks=20, impressions=300, position=7.0),
        _gsc_page("https://example.com/a", date(2026, 7, 20), clicks=6, impressions=60),
        _row(
            dataset=DATASET_GSC_QUERY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["Blue  Widgets", "2026-07-20"],
            metrics={"clicks": 3, "impressions": 30, "position": 3.0},
        ),
        _row(
            dataset=DATASET_GSC_COUNTRY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["ind", "2026-07-20"],
            metrics={"clicks": 4, "impressions": 40},
        ),
        _row(
            dataset=DATASET_GSC_DEVICE_DAILY,
            row_date=date(2026, 7, 21),
            dimension_values=["MOBILE", "2026-07-21"],
            metrics={"clicks": 9, "impressions": 90},
        ),
        _row(
            dataset=DATASET_GSC_SEARCH_APPEARANCE_DAILY,
            row_date=date(2026, 7, 21),
            dimension_values=["AMP_BLUE_LINK", "2026-07-21"],
            metrics={"clicks": 1, "impressions": 10},
        ),
    ]
    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 21),
        granularity="day",
        project_origin="https://example.com",
    )

    # The headline is the date-only dataset ALONE. Summing the dimensional
    # reports beside it would report 33 clicks for a 30-click window.
    assert projection.metrics["totals"]["clicks"] == 30
    assert projection.metrics["totals"]["impressions"] == 400

    assert projection.dimension_counts == {
        "query": 1,
        "page": 1,
        "country": 1,
        "device": 1,
        "search_appearance": 1,
        "day": 2,
        # No Bing row was offered, so its panel is genuinely empty.
        "bing_query": 0,
        "bing_page": 0,
    }
    by_dimension = {
        (row.dimension, row.dimension_key): row.metrics for row in projection.dimensions
    }
    assert by_dimension[("query", "blue widgets")]["clicks"] == 3
    assert by_dimension[("page", "https://example.com/a")]["clicks"] == 6
    assert by_dimension[("country", "ind")]["clicks"] == 4
    assert by_dimension[("device", "MOBILE")]["clicks"] == 9
    assert by_dimension[("search_appearance", "AMP_BLUE_LINK")]["clicks"] == 1
    # DAYS keys by the row's own date and matches the series exactly.
    assert by_dimension[("day", "2026-07-20")]["clicks"] == 10
    assert by_dimension[("day", "2026-07-21")]["clicks"] == 20


def test_search_appearance_absence_is_an_observed_empty_table() -> None:
    """A GSC response with no Search Appearance rows is empty, not broken."""
    projection = build_traffic_projection(
        rows=[_gsc_day(date(2026, 7, 20), clicks=5, impressions=50)],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert projection.dimension_counts["search_appearance"] == 0
    assert not [
        row for row in projection.dimensions if row.dimension == "search_appearance"
    ]
    # The rest of the projection is unaffected — an empty breakdown is not a
    # failed connection.
    assert projection.metrics["totals"]["clicks"] == 5


def test_dimension_rows_carry_their_own_provenance() -> None:
    country = _row(
        dataset=DATASET_GSC_COUNTRY_DAILY,
        row_date=date(2026, 7, 20),
        dimension_values=["usa", "2026-07-20"],
        metrics={"clicks": 2, "impressions": 20},
    )
    projection = build_traffic_projection(
        rows=[country],
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    (row,) = projection.dimensions
    assert row.source_metric_row_ids == [str(country.id)]
    assert row.source_artifact_ids == [str(country.source_artifact_id)]
    # The snapshot's provenance is the union of every contributing row.
    assert str(country.id) in projection.source_metric_row_ids


def test_dimension_fold_is_deterministic() -> None:
    rows = [
        _gsc_day(date(2026, 7, 20), clicks=1, impressions=10),
        _row(
            dataset=DATASET_GSC_COUNTRY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["zaf", "2026-07-20"],
            metrics={"clicks": 1, "impressions": 10},
        ),
        _row(
            dataset=DATASET_GSC_COUNTRY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["ind", "2026-07-20"],
            metrics={"clicks": 2, "impressions": 20},
        ),
    ]
    first = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    second = build_traffic_projection(
        rows=list(reversed(rows)),
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )
    assert [
        (row.dimension, row.dimension_key, row.metrics) for row in first.dimensions
    ] == [(row.dimension, row.dimension_key, row.metrics) for row in second.dimensions]


# --- TrafficProjectionBuilder: the streaming fold -----------------------------
# The builder is the contract ``build_traffic_projection`` is now a door onto,
# so these assert the two properties the batch API cannot: that batching
# changes nothing, and that a caller promising identity order gets the same
# latest-revision selection while the builder retires each observation.


def _stream(
    rows: list[TrafficMetricRowInput],
    *,
    batch_size: int,
    ordered: bool,
    **kwargs: Any,
) -> Any:
    """Feed ``rows`` through the builder in batches of ``batch_size``."""
    ordered_rows = (
        sorted(rows, key=lambda row: (row_identity(row), row.resync_seq))
        if ordered
        else rows
    )
    builder = TrafficProjectionBuilder(**kwargs)
    for start in range(0, len(ordered_rows), batch_size):
        builder.add_batch(
            ordered_rows[start : start + batch_size], ordered_by_identity=ordered
        )
    return builder.build()


def _mixed_rows() -> list[TrafficMetricRowInput]:
    """Rows spanning every fold path, including a superseded revision."""
    return [
        _gsc_day(date(2026, 7, 20), clicks=5, impressions=100, position=3.0),
        _gsc_day(date(2026, 7, 21), clicks=7, impressions=140, position=2.0),
        _gsc_page("https://example.com/a", date(2026, 7, 20), clicks=3, impressions=60),
        _gsc_page("https://example.com/b", date(2026, 7, 21), clicks=1, impressions=25),
        _row(
            dataset=DATASET_GSC_QUERY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["crm software", "2026-07-20"],
            metrics={"clicks": 2, "impressions": 30, "position": 8.0},
        ),
        _row(
            dataset=DATASET_GSC_COUNTRY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["usa", "2026-07-20"],
            metrics={"clicks": 4, "impressions": 50},
        ),
        _row(
            dataset=DATASET_GSC_DEVICE_DAILY,
            row_date=date(2026, 7, 21),
            dimension_values=["MOBILE", "2026-07-21"],
            metrics={"clicks": 2, "impressions": 22},
        ),
        _row(
            dataset=DATASET_GA4_CHANNEL_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=[
                next(iter(TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS)),
                "2026-07-20",
            ],
            metrics={"sessions": 40, "engagedSessions": 25, "keyEvents": 4},
        ),
    ]


def _superseded_pair() -> list[TrafficMetricRowInput]:
    """Two revisions of ONE observation — only the later may fold."""
    shared = {
        "dataset": DATASET_GSC_DAY_DAILY,
        "row_date": date(2026, 7, 22),
        "dimension_values": ["2026-07-22"],
    }
    return [
        _row(**shared, metrics={"clicks": 1, "impressions": 10}, resync_seq=0),
        _row(**shared, metrics={"clicks": 9, "impressions": 90}, resync_seq=1),
    ]


_STREAM_WINDOW = {
    "window_start": date(2026, 7, 20),
    "window_end": date(2026, 7, 22),
    "granularity": "day",
}


@pytest.mark.parametrize("batch_size", [1, 2, 3, 100])
@pytest.mark.parametrize("ordered", [False, True])
def test_streaming_fold_matches_the_batch_projection(
    batch_size: int, ordered: bool
) -> None:
    """Batching is invisible: any batch size yields the one-shot result.

    This is the property the executor relies on when it stops materializing
    a window — the fold must not depend on how the rows were delivered.
    """
    rows = [*_mixed_rows(), *_superseded_pair()]
    expected = build_traffic_projection(rows=rows, **_STREAM_WINDOW)
    streamed = _stream(rows, batch_size=batch_size, ordered=ordered, **_STREAM_WINDOW)

    assert streamed.metrics == expected.metrics
    assert streamed.pages == expected.pages
    assert streamed.queries == expected.queries
    assert streamed.dimensions == expected.dimensions
    assert streamed.dimension_counts == expected.dimension_counts
    assert streamed.source_metric_row_ids == expected.source_metric_row_ids
    assert streamed.source_artifact_ids == expected.source_artifact_ids


@pytest.mark.parametrize("ordered", [False, True])
def test_streaming_fold_drops_superseded_revisions_across_batches(
    ordered: bool,
) -> None:
    """A stale revision split across batches must still never fold in.

    The revisions are delivered in SEPARATE batches, so the builder cannot
    see them together at ``add_batch`` time — it has to carry the pending
    candidate across the boundary.
    """
    rows = _superseded_pair()
    streamed = _stream(rows, batch_size=1, ordered=ordered, **_STREAM_WINDOW)
    totals = streamed.metrics["totals"]
    # Only resync_seq=1 contributes: 9/90, never the superseded 1/10 or 10/100.
    assert totals["clicks"] == 9
    assert totals["impressions"] == 90
    assert streamed.source_metric_row_ids == [str(rows[1].id)]


def test_ordered_streaming_retires_each_observation_immediately() -> None:
    """The ordered mode's whole point: the buffer holds ONE identity.

    That bound is what makes a long window affordable, so it is asserted
    directly rather than inferred from the output.
    """
    rows = sorted(
        [*_mixed_rows(), *_superseded_pair()],
        key=lambda row: (row_identity(row), row.resync_seq),
    )
    builder = TrafficProjectionBuilder(**_STREAM_WINDOW)
    for row in rows:
        builder.add_batch([row], ordered_by_identity=True)
        assert len(builder._pending) <= 1
    assert builder.build().metrics["totals"]["clicks"] == 9 + 5 + 7


def test_unordered_streaming_still_dedups_a_late_superseding_revision() -> None:
    """An out-of-order caller keeps the safe (buffered) behavior.

    ``ordered_by_identity`` is a promise about delivery, not a mode switch:
    a caller that does not make it must still get correct dedup, whatever
    order the revisions arrive in.
    """
    older, newer = _superseded_pair()
    streamed = _stream([newer, older], batch_size=1, ordered=False, **_STREAM_WINDOW)
    assert streamed.metrics["totals"]["clicks"] == 9


def test_bounded_ids_retains_only_the_sample_it_reports() -> None:
    """Provenance accumulation is bounded by the LIMIT, not by row count.

    ``bounded_provenance`` always kept the lowest sorted ids, but the
    accumulators used to hold every id until finalization, so streaming
    memory still grew with the window. Retaining the sample as it folds
    gives the identical answer at a fixed ceiling.
    """
    limit = 10
    ids = BoundedIds(limit=limit)
    offered = [f"id-{index:04d}" for index in range(500)]
    for value in reversed(offered):  # worst case: every add displaces
        ids.add(value)

    provenance = ids.provenance()
    # Same answer a full-set cap would give: the lowest ``limit`` ids...
    assert provenance.ids == sorted(offered)[:limit]
    # ...an honest distinct total, and therefore a sampled row.
    assert provenance.total == len(offered)
    assert provenance.sampled is True
    # The bound that matters: the retained sample never exceeds the limit.
    assert len(list(ids)) == limit


def test_bounded_ids_counts_repeats_once() -> None:
    """``total`` is a DISTINCT count, including ids already discarded."""
    ids = BoundedIds(limit=2)
    for value in ("id-a", "id-b", "id-c", "id-c", "id-a"):
        ids.add(value)
    provenance = ids.provenance()
    assert provenance.ids == ["id-a", "id-b"]
    assert provenance.total == 3


def test_bounded_ids_union_merges_both_samples_and_totals() -> None:
    """A union caps the merged sample and keeps the distinct total."""
    left, right = BoundedIds(limit=2), BoundedIds(limit=2)
    left.update(["id-a", "id-c"])
    right.update(["id-b", "id-d"])
    merged = (left | right).provenance()
    assert merged.ids == ["id-a", "id-b"]
    assert merged.total == 4


def test_bing_fills_its_own_panel_and_never_a_search_console_number() -> None:
    """Bing is a SECOND engine, so it is a second panel — never a summand.

    Adding Bing impressions to Search Console impressions would silently
    change what every existing chart means, and would leave CTR and average
    position undefined across two engines that do not measure the same
    population. The projection therefore routes Bing rows to their own two
    dimensions and to nothing else.
    """
    rows = [
        _gsc_day(date(2026, 7, 20), clicks=10, impressions=100, position=5.0),
        _row(
            dataset=DATASET_GSC_QUERY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["blue widgets", "2026-07-20"],
            metrics={"clicks": 3, "impressions": 30},
        ),
        _row(
            dataset=DATASET_BING_QUERY_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["blue widgets", "2026-07-20"],
            metrics={"clicks": 7, "impressions": 70},
            provider="bing",
            property_ref="https://example.com/",
        ),
        _row(
            dataset=DATASET_BING_PAGE_DAILY,
            row_date=date(2026, 7, 20),
            dimension_values=["https://example.com/a", "2026-07-20"],
            metrics={"clicks": 2, "impressions": 20},
            provider="bing",
            property_ref="https://example.com/",
        ),
    ]

    projection = build_traffic_projection(
        rows=rows,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 20),
        granularity="day",
    )

    # The headline stays exactly the Search Console day report.
    assert projection.metrics["totals"]["clicks"] == 10
    assert projection.metrics["totals"]["impressions"] == 100
    by_dimension = {
        (row.dimension, row.dimension_key): row.metrics for row in projection.dimensions
    }
    # The SAME query text in both engines stays two rows with two totals.
    assert by_dimension[("query", "blue widgets")]["clicks"] == 3
    assert by_dimension[("bing_query", "blue widgets")]["clicks"] == 7
    assert by_dimension[("bing_page", "https://example.com/a")]["clicks"] == 2
    assert projection.dimension_counts["bing_query"] == 1
    assert projection.dimension_counts["bing_page"] == 1
    assert projection.dimension_counts["page"] == 0
