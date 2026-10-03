import { z } from 'zod';

import { metricSeriesSchema, snapshotGranularitySchema } from './analytics.ts';
import { crawlerPurposeSchema, crawlerResourceClassSchema } from './site-health.ts';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

export const aiSourceSchema = z.enum([
  'chatgpt',
  'gemini',
  'claude',
  'perplexity',
  'copilot',
  'google_ai_overview',
  'other',
]);

export const aiReferralSourceRowSchema = responseObject({
  ai_source: aiSourceSchema.exclude(['other']),
  sessions: z.number().int().nonnegative(),
  share: z.number().min(0).max(1).nullable(),
});

/** Persisted AI-referral measurements from the canonical GA4 source/medium report. */
export const aiReferralsSchema = responseObject({
  project_id: uuid(),
  window_start: z.string(),
  window_end: z.string(),
  granularity: snapshotGranularitySchema,
  referral_volume: metricSeriesSchema,
  referral_share: metricSeriesSchema,
  sources: z.array(aiReferralSourceRowSchema),
  analyzer_version: z.string(),
  formula_version: z.string(),
});

/** Shared UA matcher: browser pre-filtering and trusted admission use identical rules. */
export function matchesCrawlerUserAgent(
  bot: { ua_patterns: readonly string[] },
  userAgent: string,
) {
  const value = userAgent.toLowerCase();
  return bot.ua_patterns.some((pattern) => value.includes(pattern.toLowerCase()));
}
export const verificationSchema = z.enum(['verified', 'unverifiable', 'failed_verification']);
const coverageSchema = z.enum(['complete', 'declared_complete', 'partial', 'unknown']);
const crawlConnectionSchema = z.enum(['not_connected', 'awaiting_data', 'connected']);
const crawlSamplingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('sampled'), rate: z.number().gt(0).max(1) }),
  z.object({ kind: z.literal('filtered'), description: z.string() }),
]);
export const crawlSourceSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['webhook', 'upload']),
  setup: z.enum(['cloudflare_worker', 'cloudflare_logpush', 'custom', 'upload']),
  preset: z.string(),
  format: z.string(),
  collection_point: z.string(),
  sampling: crawlSamplingSchema,
  origin: z.string(),
  host: z.string(),
  status: z.enum(['active', 'revoked']),
  token_prefix: z.string().nullable(),
  connection: crawlConnectionSchema,
  last_accepted_batch: z.string().nullable(),
  last_processed_at: z.string().nullable(),
  rejected_lines: z.number(),
  overlapping_lines: z.number(),
  unsupported_uploads: z.number(),
  unsupported_batches: z.number(),
});
export const crawlSourceListSchema = z.object({
  ingestion_enabled: z.boolean(),
  items: z.array(crawlSourceSchema),
});
export const crawlTokenSchema = z.object({ id: z.uuid(), token: z.string().nullable() });
export const crawlReceiptSchema = z.object({
  id: z.uuid(),
  lines_received: z.number(),
  lines_parsed: z.number(),
  lines_matched: z.number(),
  lines_unmatched: z.number(),
  lines_out_of_scope: z.number(),
  lines_rejected: z.number(),
  lines_duplicate: z.number(),
  lines_overlapping: z.number(),
  heartbeat: z.boolean(),
});
export const crawlUploadSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  size_bytes: z.number(),
  status: z.string(),
  last_ack_seq: z.number(),
  scanned_lines: z.number(),
  missing_fields: z.array(z.string()),
});
export const crawlCatalogSchema = z.object({
  catalog_version: z.string(),
  bots: z.array(
    z.object({
      bot_id: z.string(),
      label: z.string(),
      purpose: crawlerPurposeSchema,
      ua_patterns: z.array(z.string()),
    }),
  ),
  presets: z.record(
    z.string(),
    z.object({
      collection_point: z.string(),
      sampling: crawlSamplingSchema,
      timestamp: z.string(),
      host: z.string(),
      path: z.string(),
      method: z.string(),
      status: z.string(),
      user_agent: z.string(),
      client_ip: z.string(),
      request_id: z.string(),
      timestamp_unit: z.enum(['iso', 'seconds', 'milliseconds', 'nanoseconds']),
    }),
  ),
  max_batch_bytes: z.number(),
  max_lines_per_batch: z.number(),
  upload_sample_lines: z.number(),
  max_line_bytes: z.number(),
  worker_timeout_ms: z.number(),
});
const crawlCoverageDaySchema = z.object({
  source_id: z.uuid(),
  reporting_date: z.string(),
  reporting_timezone: z.string(),
  coverage: coverageSchema,
  reason: z.string(),
  batch_count: z.number(),
  heartbeat_count: z.number(),
  max_gap_minutes: z.number(),
});
export const crawlCoverageResponseSchema = z.object({
  items: z.array(crawlCoverageDaySchema),
  sources: z.array(crawlSourceSchema),
  next_cursor: z.string().nullable(),
});
const botRequestSchema = z.object({
  id: z.uuid(),
  source_id: z.uuid(),
  batch_id: z.uuid(),
  occurred_at: z.string(),
  host: z.string(),
  display_path: z.string(),
  identity: z.enum(['exact', 'non_joinable']),
  identity_reason: z.string().nullable(),
  url_hash: z.string().nullable(),
  folder: z.string(),
  resource_class: crawlerResourceClassSchema,
  method: z.string(),
  status_code: z.number(),
  bot_id: z.string(),
  catalog_version: z.string(),
  verification: verificationSchema,
  verification_reason: z.string().nullable(),
  verification_basis: z.string().nullable(),
  ip_range_snapshot_id: z.uuid().nullable(),
});
export const botActivityResponseSchema = z.object({
  items: z.array(botRequestSchema),
  next_cursor: z.string().nullable(),
});
const botCrawlerRowSchema = z.object({
  bot_id: z.string(),
  label: z.string(),
  purpose: crawlerPurposeSchema,
  requests: z.number(),
  pages: z.number().nullable(),
  last_seen: z.string(),
  status_codes: z.record(z.string(), z.number()),
  verification: z.record(z.string(), z.number()),
  verification_reasons: z.record(z.string(), z.number()),
  folders: z.record(z.string(), z.number()),
  resources: z.record(z.string(), z.number()),
});
export const botCrawlersResponseSchema = z.object({
  items: z.array(botCrawlerRowSchema),
  next_cursor: z.string().nullable(),
});
export const crawlSummarySchema = z.object({
  unit: z.literal('requests'),
  identity_level: z.literal('path'),
  connection: crawlConnectionSchema,
  coverage: coverageSchema,
  reporting_timezone: z.string(),
  last_processed_at: z.string().nullable(),
  requests: z.number().nullable(),
  pages: z.number().nullable(),
  active_bots: z.number().nullable(),
  error_share: z.number().nullable(),
  failed_verification_requests: z.number(),
  series: z.array(
    z.object({ date: z.string(), purpose: crawlerPurposeSchema, requests: z.number() }),
  ),
});
export const aiTrafficOverviewSchema = z.object({
  crawl: crawlSummarySchema,
  referrals: aiReferralsSchema,
  citations: z.object({
    unit: z.literal('tracked_citations'),
    count: z.number().nullable(),
    label: z.string(),
  }),
});
