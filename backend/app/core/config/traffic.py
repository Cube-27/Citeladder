# Traffic projection configuration (invariant 1: all config lives here).
#
# Owns every tunable knob + vocabulary token for the Traffic surface
# (docs/roadmap/traffic.md section 8): the projection window + granularity
# knobs, the formula/normalization provenance versions stamped on every
# ``TrafficSnapshot`` (invariant 4), the GA4 inclusion-rule vocabularies
# (organic channel groups + the C1 referral-dimension dataset ids the
# AI-referral ingest consumes), and the page/query sort whitelists for the
# paged stat endpoints.
#
# Traffic is a pure PROJECTION over ``IntegrationMetricRow`` (invariant 7):
# it performs NO provider fetch, so no provider-fetch knobs live here —
# those belong to ``config/integrations_datasets.py`` (invariant 2).
from __future__ import annotations

from typing import Final

# The GA4 dataset ids are OWNED by config/integrations_datasets.py (cross-workstream
# contract C1) and imported here — never re-literalized (invariant 2).
from app.core.config.integrations_datasets import (
    DATASET_BING_PAGE_DAILY,
    DATASET_BING_QUERY_DAILY,
    DATASET_GA4_CHANNEL_DAILY,
    DATASET_GA4_LANDING_DAILY,
    DATASET_GA4_REFERRER_DAILY,
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DATASET_GSC_COUNTRY_DAILY,
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_DEVICE_DAILY,
    DATASET_GSC_PAGE_DAILY,
    DATASET_GSC_QUERY_DAILY,
    DATASET_GSC_SEARCH_APPEARANCE_DAILY,
    INTEGRATION_SYNC_EXCLUDED_DATASETS,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_BING,
    INTEGRATION_PROVIDER_GA4,
    INTEGRATION_PROVIDER_GSC,
)

# --- Projection window + granularity ----------------------------------------
# Default trailing window when a request omits ``from``/``to``, and the hard
# cap on any served window.
TRAFFIC_DEFAULT_WINDOW_DAYS: Final = 28
TRAFFIC_MAX_WINDOW_DAYS: Final = 480

# Snapshot bucket granularity vocabulary. Shared with the AI Referrals
# projection (same concept, one owner — invariant 2): ``config/analytics.py``
# aliases this set instead of forking a second ``day|week|month`` vocabulary.
TRAFFIC_GRANULARITY_DAY: Final = "day"
TRAFFIC_GRANULARITY_WEEK: Final = "week"
TRAFFIC_GRANULARITY_MONTH: Final = "month"
TRAFFIC_SNAPSHOT_GRANULARITIES: Final[frozenset[str]] = frozenset(
    {TRAFFIC_GRANULARITY_DAY, TRAFFIC_GRANULARITY_WEEK, TRAFFIC_GRANULARITY_MONTH}
)
# The granularity served when a request omits ``granularity`` — and the
# snapshot the paged stat endpoints read: the per-page/per-query fold is
# granularity-independent (bucketing only shapes the series), so the
# default-granularity snapshot's stat rows serve every table request.
TRAFFIC_DEFAULT_GRANULARITY: Final = TRAFFIC_GRANULARITY_DAY

# --- Provenance versions (invariant 4) ---------------------------------------
# Stamped on ``TrafficSnapshot.formula_version`` / ``.normalization_version``.
# Kept SEPARATE (normalization is NOT folded into a generic analyzer version)
# so a consumer can tell a URL/normalization change apart from an
# analytics-formula change (traffic.md section 8).
TRAFFIC_FORMULA_VERSION: Final = "traffic-formula-2"
TRAFFIC_NORMALIZATION_VERSION: Final = "traffic-normalization-1"

# --- GA4 inclusion rule (organic + AI-driven only; traffic.md section 3) -----
# A GA4 row folds into Traffic totals only when its default channel grouping
# is in this set OR its source/medium dims classify as an AI referral (via
# the deterministic classifier in ``domain/analytics/classification.py``).
TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS: Final[frozenset[str]] = frozenset(
    {"Organic Search"}
)
TRAFFIC_GA4_ORGANIC_MEDIUMS: Final[frozenset[str]] = frozenset({"organic"})
# The C1 GA4 referral-dimension datasets the referral ingest (A5) reads.
TRAFFIC_GA4_REFERRAL_DATASETS: Final[frozenset[str]] = frozenset(
    {DATASET_GA4_REFERRER_DAILY, DATASET_GA4_SOURCE_MEDIUM_DAILY}
)

# --- Consumed datasets (the snapshot projection's read set, contract C1) -----
# The dataset ids the ``traffic_snapshot_refresh`` executor reads from
# ``IntegrationMetricRow`` (A7): the GSC page/query dailies (totals + page /
# query stats) and the GA4 channel / source-medium / landing dailies (the
# inclusion rule + page GA4 metrics). ``ga4_referrer_daily`` is OWNED by the
# A5 referral ingest and deliberately absent — folding it in would
# double-count the AI sessions already measured via the source-medium
# dataset.
TRAFFIC_CONSUMED_DATASETS: Final[frozenset[str]] = frozenset(
    {
        DATASET_GSC_DAY_DAILY,
        DATASET_GSC_PAGE_DAILY,
        DATASET_GSC_QUERY_DAILY,
        DATASET_GSC_COUNTRY_DAILY,
        DATASET_GSC_DEVICE_DAILY,
        DATASET_GA4_CHANNEL_DAILY,
        DATASET_GA4_SOURCE_MEDIUM_DAILY,
        DATASET_GA4_LANDING_DAILY,
    }
)

# --- Refresh-trigger datasets (the C5 post-sync hook's traffic routing) ------
# The datasets whose fresh artifacts trigger a ``traffic_snapshot_refresh``
# for their sync window: the consumed read set above PLUS the Bing dailies.
# Bing carries no Traffic-consumed dataset in this pass, but its chain
# already refreshed traffic pre-WS-B and KEEPS that trigger (the mapping is
# additive — no existing dataset loses a trigger it has today).
TRAFFIC_REFRESH_TRIGGER_DATASETS: Final[frozenset[str]] = frozenset(
    TRAFFIC_CONSUMED_DATASETS | {DATASET_BING_PAGE_DAILY, DATASET_BING_QUERY_DAILY}
)

# --- Provenance bounds (invariant 4) -----------------------------------------
# The projection folds one window batch at a time, so its memory bounds on
# DISTINCT keys rather than row count — except for the per-row provenance
# lists, which grow with every contributing metric row. A 480-day window
# over a large property would otherwise persist millions of ids across the
# stat rows.
#
# Each provenance list is therefore capped at this many ids, kept as the
# LOWEST sorted ids so a rebuild of the same window records the same sample.
# A truncated list is never silently short: the row records its full
# contributing count alongside the sample, and the snapshot's own provenance
# says how many of its lists were sampled — a bounded record of the whole,
# not a quiet loss of the rest (invariant 7 — sampled is not complete).
TRAFFIC_PROVENANCE_ID_LIMIT: Final = 500

# --- Sort whitelists (``?sort=`` hits stored aggregates only, invariant 7) ---
# Paging/sorting the /traffic/pages and /traffic/queries endpoints is
# restricted to these persisted aggregate columns — never a free-form column.
TRAFFIC_PAGE_SORT_WHITELIST: Final[frozenset[str]] = frozenset(
    {"impressions", "clicks", "ctr", "position", "sessions", "conversions"}
)
TRAFFIC_QUERY_SORT_WHITELIST: Final[frozenset[str]] = frozenset(
    {"impressions", "clicks", "ctr", "position"}
)
# Sort direction idiom: a leading ``-`` requests descending (what the table
# sends for its default "top rows" view); a bare key is ascending. This is
# the effective sort when ``?sort=`` is omitted.
TRAFFIC_DEFAULT_SORT: Final = "-impressions"
# Page size for the keyset-paged stat tables (contract C4): every page reads
# at most this many persisted stat rows (+1 lookahead row for the
# ``next_cursor``), so a response is always bounded.
TRAFFIC_TABLE_PAGE_SIZE: Final = 50

# --- Sync pass-through (``POST /projects/{id}/performance/sync``) -------------
# The provider vocabulary of the sync fan-out: the project's ACTIVE mapped
# connections of these providers each get one on-demand
# ``IntegrationSyncRun``. The enqueue itself is OWNED by
# ``domain/integrations/sync.py`` (invariant 2) — only the fan-out
# vocabulary lives here.
#
# Bing is included even though no Bing dataset feeds a Performance table:
# the fan-out is what KEEPS a connected provider's evidence current, and
# leaving Bing out meant a connected Bing property silently never imported
# outside its one-time backfill. Its rows land in ``IntegrationMetricRow``
# for the Bing panel to read; the Performance surface stays
# Search-Console-only regardless (a Bing row feeds no GSC total).
TRAFFIC_SYNC_PROVIDERS: Final[frozenset[str]] = frozenset(
    {
        INTEGRATION_PROVIDER_GSC,
        INTEGRATION_PROVIDER_GA4,
        INTEGRATION_PROVIDER_BING,
    }
)

# =========================================================================
# Performance surface (the GSC-aligned read surface over this projection)
# =========================================================================
# Performance is the BROWSER + REST surface; the Traffic domain above stays
# the one persisted-projection owner. Everything the surface can be asked
# for lives here (invariant 1) — service code reads these, never literals.

# --- Range vocabulary --------------------------------------------------------
# The four selectable RANGES (not bucket granularities: every Performance
# chart is bucketed by day). Each preset resolves the newest persisted
# snapshot of its length, anchored to the latest complete GSC evidence date;
# ``custom`` carries an explicit inclusive ``from``/``to``.
PERFORMANCE_RANGE_DAY: Final = "day"
PERFORMANCE_RANGE_WEEK: Final = "week"
PERFORMANCE_RANGE_MONTH: Final = "month"
PERFORMANCE_RANGE_3_MONTHS: Final = "3_months"
PERFORMANCE_RANGE_6_MONTHS: Final = "6_months"
PERFORMANCE_RANGE_LAST_SYNCED: Final = "last_synced"
PERFORMANCE_RANGE_CUSTOM: Final = "custom"
# Preset -> inclusive window length in days.
PERFORMANCE_PRESET_RANGE_DAYS: Final[dict[str, int]] = {
    PERFORMANCE_RANGE_DAY: 1,
    PERFORMANCE_RANGE_WEEK: 7,
    PERFORMANCE_RANGE_MONTH: 28,
}
# Extended preset lengths (for dynamic on-demand projection).
PERFORMANCE_EXTENDED_RANGE_DAYS: Final[dict[str, int]] = {
    PERFORMANCE_RANGE_3_MONTHS: 90,
    PERFORMANCE_RANGE_6_MONTHS: 180,
}
PERFORMANCE_RANGES: Final[frozenset[str]] = frozenset(
    set(PERFORMANCE_PRESET_RANGE_DAYS)
    | set(PERFORMANCE_EXTENDED_RANGE_DAYS)
    | {PERFORMANCE_RANGE_LAST_SYNCED, PERFORMANCE_RANGE_CUSTOM}
)
# The range served when a request names none: the newest persisted snapshot
# for the project, whatever window the last sync covered.
PERFORMANCE_DEFAULT_RANGE: Final = PERFORMANCE_RANGE_LAST_SYNCED
# The snapshot family every refresh derives, anchored at the latest complete
# GSC evidence date. Day granularity only — the surface has no bucket
# control, so week/month snapshot rows for these windows would never be read.
PERFORMANCE_SNAPSHOT_WINDOW_DAYS: Final[tuple[int, ...]] = tuple(
    sorted(PERFORMANCE_PRESET_RANGE_DAYS.values())
)

# --- Dimension vocabulary (the six tables) -----------------------------------
# ``PerformanceDimensionStat.dimension`` values, in TAB ORDER. Each maps to
# exactly ONE consumed dataset: a headline number is never the sum of a
# dimensional dataset, and a dimensional table never mixes two datasets.
PERFORMANCE_DIMENSION_QUERY: Final = "query"
PERFORMANCE_DIMENSION_PAGE: Final = "page"
PERFORMANCE_DIMENSION_COUNTRY: Final = "country"
PERFORMANCE_DIMENSION_DEVICE: Final = "device"
PERFORMANCE_DIMENSION_SEARCH_APPEARANCE: Final = "search_appearance"
PERFORMANCE_DIMENSION_DAY: Final = "day"
PERFORMANCE_DIMENSION_ORDER: Final[tuple[str, ...]] = (
    PERFORMANCE_DIMENSION_QUERY,
    PERFORMANCE_DIMENSION_PAGE,
    PERFORMANCE_DIMENSION_COUNTRY,
    PERFORMANCE_DIMENSION_DEVICE,
    PERFORMANCE_DIMENSION_SEARCH_APPEARANCE,
    PERFORMANCE_DIMENSION_DAY,
)
PERFORMANCE_DIMENSIONS: Final[frozenset[str]] = frozenset(PERFORMANCE_DIMENSION_ORDER)
PERFORMANCE_DEFAULT_DIMENSION: Final = PERFORMANCE_DIMENSION_QUERY
# dimension -> the single dataset whose rows fold into it.
PERFORMANCE_DIMENSION_DATASETS: Final[dict[str, str]] = {
    PERFORMANCE_DIMENSION_QUERY: DATASET_GSC_QUERY_DAILY,
    PERFORMANCE_DIMENSION_PAGE: DATASET_GSC_PAGE_DAILY,
    PERFORMANCE_DIMENSION_COUNTRY: DATASET_GSC_COUNTRY_DAILY,
    PERFORMANCE_DIMENSION_DEVICE: DATASET_GSC_DEVICE_DAILY,
    PERFORMANCE_DIMENSION_SEARCH_APPEARANCE: DATASET_GSC_SEARCH_APPEARANCE_DAILY,
    PERFORMANCE_DIMENSION_DAY: DATASET_GSC_DAY_DAILY,
}
# The dimensions whose dataset the sync worker never pages, so their table
# is UNAVAILABLE rather than empty. Derived from the exclusion set, so a
# dataset that becomes collectable lights its tab up with no further change.
PERFORMANCE_UNAVAILABLE_DIMENSIONS: Final[tuple[str, ...]] = tuple(
    dimension
    for dimension in PERFORMANCE_DIMENSION_ORDER
    if PERFORMANCE_DIMENSION_DATASETS[dimension] in INTEGRATION_SYNC_EXCLUDED_DATASETS
)

# The inverse routing the projection folds by (one dataset -> one dimension).
PERFORMANCE_DATASET_DIMENSIONS: Final[dict[str, str]] = {
    dataset: dimension for dimension, dataset in PERFORMANCE_DIMENSION_DATASETS.items()
}
# --- Table sort + pagination (contract C4) -----------------------------------
# Sorting hits persisted aggregates only. ``dimension_key`` is the row's own
# key (the ISO date for DAYS, the query/page/country/device/appearance value
# elsewhere) and is the only non-metric sort.
PERFORMANCE_SORT_METRICS: Final[tuple[str, ...]] = (
    "clicks",
    "impressions",
    "ctr",
    "position",
)
PERFORMANCE_SORT_KEY_DIMENSION: Final = "dimension_key"
PERFORMANCE_SORT_WHITELIST: Final[frozenset[str]] = frozenset(
    set(PERFORMANCE_SORT_METRICS) | {PERFORMANCE_SORT_KEY_DIMENSION}
)
# Rows-per-page options offered by the shared cursor-table footer, and the
# selection a request that names none gets. A request outside the options is
# a 422 — never silently clamped to a different page than the cursor encodes.
PERFORMANCE_PAGE_SIZE_OPTIONS: Final[tuple[int, ...]] = (10, 25, 50, 100)
PERFORMANCE_DEFAULT_PAGE_SIZE: Final = PERFORMANCE_PAGE_SIZE_OPTIONS[0]
PERFORMANCE_MAX_PAGE_SIZE: Final = max(PERFORMANCE_PAGE_SIZE_OPTIONS)
# DAYS reads chronologically; every other table defaults to clicks descending.
PERFORMANCE_DIMENSION_DEFAULT_SORT: Final[dict[str, str]] = {
    dimension: (
        PERFORMANCE_SORT_KEY_DIMENSION
        if dimension == PERFORMANCE_DIMENSION_DAY
        else "-clicks"
    )
    for dimension in PERFORMANCE_DIMENSION_ORDER
}

# --- Custom-range projection task --------------------------------------------
# The inclusive span a custom range may ask for. Bounded by the same
# ``TRAFFIC_MAX_WINDOW_DAYS`` budget every served window obeys.
PERFORMANCE_CUSTOM_RANGE_MAX_DAYS: Final = TRAFFIC_MAX_WINDOW_DAYS


# --- Compare vocabulary (the GSC Filter/Compare date dialog) -----------------
# A comparison is a SECOND persisted snapshot, never a derived delta: the
# response carries both windows' absolute totals and series, and the surface
# renders them side by side. Nothing here computes a percentage.
PERFORMANCE_COMPARE_NONE: Final = "none"
PERFORMANCE_COMPARE_PREVIOUS: Final = "previous"
PERFORMANCE_COMPARE_YEAR_OVER_YEAR: Final = "year_over_year"
PERFORMANCE_COMPARE_CUSTOM: Final = "custom"
PERFORMANCE_COMPARE_MODES: Final[frozenset[str]] = frozenset(
    {
        PERFORMANCE_COMPARE_NONE,
        PERFORMANCE_COMPARE_PREVIOUS,
        PERFORMANCE_COMPARE_YEAR_OVER_YEAR,
        PERFORMANCE_COMPARE_CUSTOM,
    }
)
PERFORMANCE_DEFAULT_COMPARE: Final = PERFORMANCE_COMPARE_NONE
# ``year_over_year`` shifts the selected window back by this many days. A
# fixed 364 (52 whole weeks) keeps weekday alignment, which is what makes a
# search-traffic year-over-year comparison legible; a 365-day shift would
# compare a Monday against a Sunday.
PERFORMANCE_YEAR_OVER_YEAR_SHIFT_DAYS: Final = 364
