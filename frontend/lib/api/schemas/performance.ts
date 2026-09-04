import { z } from 'zod';

// ---------------------------------------------------------------------------
// Performance (projection over persisted TrafficSnapshot / dimension stat rows
// — no read-time recomputation and no provider calls anywhere, invariant 7)
//
// Every nullable field below is contractual, and each null means "not
// measured" rather than a zero a reader could mistake for an observation:
//   - a null series value is an unmeasured bucket (a chart gap);
//   - null clicks/impressions mean the window has no `gsc_day_daily` evidence
//     at all, not that nobody clicked;
//   - null ctr/position mean the aggregate had zero impressions;
//   - null sessions/conversions mean no included GA4 row fed the window;
//   - a null `comparison` means none was requested, and a comparison block
//     with a null `snapshot_id` means one was requested but is not projected.
// ---------------------------------------------------------------------------

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

export const performanceRangeSchema = z.enum(['day', 'week', 'month', 'custom']);
export const performanceCompareSchema = z.enum(['none', 'previous', 'year_over_year', 'custom']);
export const performanceDimensionSchema = z.enum([
  'query',
  'page',
  'country',
  'device',
  'search_appearance',
  'day',
]);
export const evidenceStateSchema = z.enum(['not_run', 'observed_zero', 'available']);

export const performanceSeriesPointSchema = responseObject({
  date: z.string(),
  value: z.number().nullable(),
});

const metricSeries = z.array(performanceSeriesPointSchema);

export const performanceTotalsSchema = responseObject({
  clicks: z.number().int().nullable(),
  impressions: z.number().int().nullable(),
  ctr: z.number().nullable(),
  position: z.number().nullable(),
  sessions: z.number().int().nullable(),
  conversions: z.number().int().nullable(),
});

// GA4 is deliberately absent from the series: it renders as a compact,
// non-interactive summary row, so all four chart metrics come from one
// provider and one dataset.
export const performanceSeriesSchema = responseObject({
  clicks: metricSeries,
  impressions: metricSeries,
  ctr: metricSeries,
  position: metricSeries,
});

export const performanceWindowSchema = responseObject({
  snapshot_id: uuid().nullable(),
  window_start: z.string(),
  window_end: z.string(),
  evidence_state: evidenceStateSchema,
  totals: performanceTotalsSchema,
  series: performanceSeriesSchema,
});

export const performanceCoverageSchema = responseObject({
  earliest_date: z.string().nullable(),
  latest_date: z.string().nullable(),
  covered_days: z.number().int(),
});

export const performanceDimensionCountsSchema = responseObject({
  query: z.number().int(),
  page: z.number().int(),
  country: z.number().int(),
  device: z.number().int(),
  search_appearance: z.number().int(),
  day: z.number().int(),
});

// `GET /projects/{id}/performance`
export const performanceDashboardSchema = responseObject({
  project_id: uuid(),
  range: performanceRangeSchema,
  compare: performanceCompareSchema,
  selected: performanceWindowSchema,
  comparison: performanceWindowSchema.nullable(),
  coverage: performanceCoverageSchema,
  dimension_counts: performanceDimensionCountsSchema,
  // Dimensions whose provider report is never collected. Their table renders
  // as UNAVAILABLE, never as an observed-empty result.
  unavailable_dimensions: z.array(performanceDimensionSchema),
  formula_version: z.string(),
  normalization_version: z.string(),
});

export const performanceMetricsSchema = responseObject({
  clicks: z.number().int(),
  impressions: z.number().int(),
  ctr: z.number().nullable(),
  position: z.number().nullable(),
});

// A key absent from the comparison period was NOT observed there, which is
// different from having been observed at zero — so `comparison_metrics` is
// null and the difference column renders unavailable.
export const performanceTableRowSchema = responseObject({
  dimension_key: z.string(),
  display_value: z.string(),
  metrics: performanceMetricsSchema,
  comparison_metrics: performanceMetricsSchema.nullable(),
});

// `total_count` is the snapshot's persisted per-dimension count — never a
// `COUNT(*)` issued per page navigation.
export const performanceTablePageSchema = responseObject({
  dimension: performanceDimensionSchema,
  items: z.array(performanceTableRowSchema),
  next_cursor: z.string().nullable(),
  total_count: z.number().int(),
  page_size: z.number().int(),
});

export const performanceRangeTaskSchema = responseObject({
  task_id: uuid(),
  status: z.string(),
  window_start: z.string(),
  window_end: z.string(),
});
