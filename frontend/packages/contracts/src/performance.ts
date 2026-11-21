import { z } from 'zod';

import { integrationProviderSchema } from './integrations.ts';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

export const performanceRangeSchema = z.enum([
  'day',
  'week',
  'month',
  '3_months',
  '6_months',
  'last_synced',
  'custom',
]);
export const performanceCompareSchema = z.enum(['none', 'previous', 'year_over_year', 'custom']);
export const performanceDimensionSchema = z.enum([
  'query',
  'page',
  'country',
  'device',
  'search_appearance',
  'day',
  'bing_query',
  'bing_page',
]);
const evidenceStateSchema = z.enum(['not_run', 'observed_zero', 'available']);
export const performanceGranularitySchema = z.enum(['day', 'week', 'month']);

const performanceSeriesPointSchema = responseObject({
  date: z.string(),
  value: z.number().nullable(),
});

const metricSeries = z.array(performanceSeriesPointSchema);

const performanceTotalsSchema = responseObject({
  clicks: z.number().int().nullable(),
  impressions: z.number().int().nullable(),
  ctr: z.number().nullable(),
  position: z.number().nullable(),
  sessions: z.number().int().nullable(),
  key_events: z.number().nullable(),
});

const performanceSeriesSchema = responseObject({
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

const performanceCoverageSchema = responseObject({
  earliest_date: z.string().nullable(),
  latest_date: z.string().nullable(),
  covered_days: z.number().int(),
  analytics_quality: z
    .record(
      z.string(),
      z.array(
        z.object({ day: z.string(), revision: z.number().nullable(), flags: z.array(z.string()) }),
      ),
    )
    .default({}),
});

const performanceDimensionCountsSchema = responseObject({
  query: z.number().int(),
  page: z.number().int(),
  country: z.number().int(),
  device: z.number().int(),
  search_appearance: z.number().int(),
  day: z.number().int(),
  bing_query: z.number().int(),
  bing_page: z.number().int(),
});

export const projectReadinessStageSchema = z.enum([
  'not_connected',
  'connected',
  'importing',
  'import_failed',
  'core_data_ready',
  'analysis_ready',
]);

export const projectReadinessSchema = responseObject({
  project_id: uuid(),
  stage: projectReadinessStageSchema,
  connection_count: z.number().int(),
  providers: z.array(integrationProviderSchema),
  backfill_state: z.string().nullable(),
  imported_through: z.string().nullable(),
  has_performance_snapshot: z.boolean(),
  has_demand_snapshot: z.boolean(),
  opportunity_count: z.number().int(),
});

export const performanceDashboardSchema = responseObject({
  project_id: uuid(),
  range: performanceRangeSchema,
  granularity: performanceGranularitySchema,
  compare: performanceCompareSchema,
  selected: performanceWindowSchema,
  comparison: performanceWindowSchema.nullable(),
  coverage: performanceCoverageSchema,
  dimension_counts: performanceDimensionCountsSchema,
  unavailable_dimensions: z.array(performanceDimensionSchema),
  formula_version: z.string(),
  normalization_version: z.string(),
});

export const performanceMetricsSchema = responseObject({
  clicks: z.number().int().nullable(),
  impressions: z.number().int().nullable(),
  ctr: z.number().nullable(),
  position: z.number().nullable(),
});

const performanceTableRowSchema = responseObject({
  dimension_key: z.string(),
  display_value: z.string(),
  metrics: performanceMetricsSchema,
  comparison_metrics: performanceMetricsSchema.nullable(),
});

export const performanceTablePageSchema = responseObject({
  dimension: performanceDimensionSchema,
  items: z.array(performanceTableRowSchema),
  next_cursor: z.string().nullable(),
  total_count: z.number().int(),
  page_size: z.number().int(),
});

export const performanceRangeTaskStatusSchema = z.enum([
  'queued',
  'leased',
  'running',
  'retry_wait',
  'succeeded',
  'failed',
  'cancelled',
]);
export type PerformanceRangeTaskStatus = z.infer<typeof performanceRangeTaskStatusSchema>;

export const performanceRangeTaskSchema = responseObject({
  task_id: uuid(),
  status: performanceRangeTaskStatusSchema,
  window_start: z.string(),
  window_end: z.string(),
});
