# GSC Performance Alignment

**Status:** implemented 2026-09-04.

## Summary

Replace Traffic with a Google Search Console-aligned **Performance** surface.
This is a greenfield cutover: the browser route and REST contract move from
`/traffic` to `/performance`, with no redirect or compatibility route. The
existing Traffic domain remains the one persisted-projection owner internally.

Reset the disposable database before reconnecting Cube27. Its first property
selection imports one year of history (365 days) using the normal initial-import
flow. There is no legacy-data migration or special re-backfill. The 16-month
preset remains visibly unavailable until the connection accumulates 480 days of
evidence; it must never appear as an observed zero.

## Collection and persisted projections

- Add a date-only `gsc_day_daily` integration dataset (`dimensions=("date",)`).
  It is the sole source for headline totals, chart series, and the **DAYS**
  table, giving Performance the closest available parity with GSC's overall
  report totals.
- Retain `gsc_page_daily` only for Pages, `gsc_query_daily` only for Queries,
  and their dedicated country, device, and search-appearance datasets only for
  their matching tables. Never add dimensional datasets together for a
  headline total.
- Remove `gsc_search_appearance_daily` from
  `INTEGRATION_SYNC_EXCLUDED_DATASETS`; add it, `gsc_day_daily`, Countries, and
  Devices to the Traffic projection's consumed and refresh-trigger datasets.
  A successful GSC response with no Search Appearance rows is an observed empty
  state, not a failed connection.
- Extend the existing Traffic snapshot write to persist generic GSC dimension
  rows for Queries, Pages, Countries, Devices, Search Appearance, and Days.
  Each row records the contributing immutable metric-row and artifact IDs.
  Persist the row count for every dimension with the snapshot.
- Derive a snapshot family for 1, 7, 28, 90, 180, and 365-day windows, each
  anchored to the latest complete GSC date. Do not materialize the 480-day
  window until evidence covers it.

## Performance API and dates

- Rename browser navigation, frontend page, API client, REST paths, contracts,
  tests, and documentation from Traffic to Performance. The public browser
  destination is `/performance`; APIs are under
  `/api/v1/projects/{project_id}/performance`. Delete `/traffic` and do not
  redirect it. Update the canonical route table in `docs/frontend-architecture.md`.
- The dashboard contract returns a `snapshot_id`, selected range identity,
  actual `window_start` / `window_end`, coverage state, exact date-only GSC
  totals and series, plus a compact GA4 summary. Every tabular request carries
  that returned snapshot identity rather than locally recomputed calendar
  bounds, so a chart and its tables always read the same persisted projection.
- Date controls offer latest complete day (labelled **24 hours**), 7/28/90
  days, More options for 6/12/16 months, and an inclusive custom range capped
  at 480 days. Presets resolve the newest completed snapshot for that window;
  the UI always displays the actual covered dates.
- A custom range invokes a dedicated, authorized Performance projection task
  over already-persisted evidence. It returns a task ID, is idempotent on the
  project and inclusive date range, and the UI polls its persisted task state.
  It writes only the requested display snapshot: it must not sync a provider,
  replace a preset/current snapshot, refresh Demand, enqueue Opportunities or
  verification, change AI Referrals, or mutate any other product projection.

## Performance UI

- Replace the mixed cards and mini charts with four selectable GSC metrics:
  Clicks, Impressions, Average CTR, and Average position. Cards show exact
  selected-range values only—remove all prior-bucket delta copy.
- Render one combined, hoverable chart for the selected GSC metrics. Chart
  points come exclusively from the selected snapshot; missing buckets remain
  explicit gaps. Position retains its inverted improvement direction.
- Render Sessions and Conversions in one compact, non-interactive GA4 summary
  row below the GSC metric row. It uses the same selected snapshot range and
  shows percentage change against the immediately preceding equal-length
  persisted range. If either comparison range has no GA4 evidence, show an
  explicit unavailable label; never derive the percentage from chart buckets.
- Use accessible, uppercase tabs in this order: `QUERIES`, `PAGES`,
  `COUNTRIES`, `DEVICES`, `SEARCH APPEARANCE`, `DAYS`; Queries is the default.
  The first table header is `Top queries`, `Top pages`, and so on, with the
  active sort indicator. Days is chronological; the other views default to
  clicks descending. Remove the ranking explanation, table titles/subtitles,
  and sort-copy footer. GSC columns are Clicks, Impressions, CTR, and Position.

## Reusable, performance-safe pagination

- Replace the current Traffic-only footer with a shared cursor-table footer,
  then migrate Website Pages and other compatible large tables. It renders
  rows-per-page, visible range/total, and compact previous/next arrows.
- Keep opaque, filter-bound keyset cursors. Never use `OFFSET`, a full-result
  fetch, or a `COUNT(*)` query on every page navigation. Page-size options are
  config-owned, validated, and capped.
- Performance tables return their snapshot-persisted `total_count`. Website
  Pages consumes a crawl-persisted count for its exact unfiltered inventory;
  filtered Website views either receive their own persisted count projection or
  omit the exact total rather than issuing an unbounded live count.
- Reset a cursor stack whenever its project, snapshot/range, tab, filters,
  sort, or page size changes. Scope keys and query keys include all of those
  values, preventing a cursor or placeholder result from being relabelled for
  a different result set.

## Persistence and tests

- Fold the new generic GSC dimension-stat projection and snapshot count fields
  into `migrations/versions/0001_initial.py`; rebuild the disposable database
  and run migration drift checks before reconnecting Cube27.
- Update `docs/plans/citeladder-data-pipeline-rebuild.md` and
  `docs/frontend-architecture.md` in the same implementation so no active
  documentation continues to describe `/traffic` or conflicting range rules.
- Test a fresh 365-day Cube27 import; date-only totals; each of the six tables;
  Search Appearance's observed-empty state; all available presets; the
  16-month unavailable state; and custom-range task isolation.
- Test exact snapshot identity across dashboard and table reads, GA4
  equal-length comparison states, workspace isolation, provenance, invalid
  ranges/page sizes, cursor replay refusal, pagination resets, and bounded
  keyset queries.
- Run `./scripts/check.ps1` and `./scripts/test.ps1` after the complete
  implementation.

## What shipped, and where it differs from the plan above

The plan was implemented with these decisions taken during the work. Where a
decision changed the plan, the reason is recorded here rather than silently
diverging.

**Date controls are four RANGES, not seven presets.** Day (latest complete
day), Week (7 days), Month (28 days), and Custom, all charted by day. The
24-hour label, the 6/12/16-month presets, and the 16-month evidence gate are
NOT built: the preset family is `PERFORMANCE_SNAPSHOT_WINDOW_DAYS = (1, 7, 28)`
and anything longer is reached through Custom, which the range task
materializes on demand. The bucket-granularity control is gone; the family is
day-granularity only, since the surface offers no bucket choice.

**Comparison is Search Console's, not a percentage delta.** No percentage
change is computed anywhere. A comparison is a SECOND persisted window: cards
show both absolute values, the chart draws the comparison dashed on a
positional (day 1..N) axis, and every dimension table widens to
selected/comparison/difference columns per metric, scrolling horizontally with
the dimension column pinned. Compare modes are previous period, year over year
(52 whole weeks back, so weekdays align), and custom-vs-custom. Year over year
renders disabled with its reason until more than a year of history exists —
never as an observed zero. The table joins the comparison by dimension key for
the CURRENT page only, because two independently ordered result sets cannot be
keyset-paged in parallel; a key the comparison never observed is null, not zero.

**The projection fold stays in memory.** `build_traffic_projection` still
materializes its window. That is defect 6 of the pipeline-rebuild plan and its
streaming fix stays in that plan's Slice 2. The preset family tops out at 28
days, so the automatic cost is bounded; a long custom range is the exception
and is user-initiated.

**Pages and queries are persisted twice, deliberately.** `TrafficPageStat` and
`TrafficQueryStat` keep their contract because Demand reads them, they carry
the crawled `SiteUrl` join, and they are the only per-page rows combining GSC
with GA4. `PerformanceDimensionStat` is additive and GSC-only, so all six
tables share one keyset/sort/count implementation instead of six near-identical
ones.

**Sync is incremental.** `enqueue_sync_run` resolves an absent on-demand window
from what the connection already imported, pulled back by
`sync_late_data_revision_days`, so "Sync now" extends coverage instead of
re-fetching a fixed trailing window while still picking up Search Console's
revisions to recent days.

**The shared footer covers four surfaces.** `components/ui/cursor-table-footer.tsx`
plus `lib/table/use-cursor-table.ts` back Performance, Website Pages,
Opportunities, and Website Changes, with config-owned page sizes (10/25/50/100).
Only the unfiltered page inventory states an exact total, from the crawl's own
persisted count; filtered views show the range alone rather than issuing an
unbounded live count. `lib/site-health/use-cursor-stack.ts` was removed once it
had no callers.

**Search Appearance is UNAVAILABLE, not empty.** The plan asked for the
dataset to leave `INTEGRATION_SYNC_EXCLUDED_DATASETS`, but the Search
Analytics API refuses `searchAppearance` grouped with any other dimension,
so the pinned `("searchAppearance", "date")` template is not a query Google
answers — it fails the whole run. That is why the dataset was excluded in
the first place. It stays excluded; the dashboard returns
`unavailable_dimensions` and the tab says the breakdown is not imported,
which is a different state from a breakdown that measured nothing.

Collecting it properly needs Google's two-step protocol — query the
appearance types alone, then re-query filtered by each type to regain a date
breakdown — plus derivation support for a date-less report, since
`derive.py` currently requires a `date` dimension. That is follow-up work.

**Not verified here.** The database reset and the live Cube27 reconnect were
not run: the reset is destructive and needs explicit approval. `alembic check`
against a freshly migrated database, and the fresh 365-day import, remain
outstanding. The Search Appearance constraint above was found by review, not
by a live sync — a reminder that the provider-shaped failures in this area do
not surface in CI, whose GSC stub answers any dimension tuple.
