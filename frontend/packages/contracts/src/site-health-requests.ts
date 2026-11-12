/**
 * Request bodies of Site Health crawl control: a new crawl and the crawl
 * schedule. These own the wire shape; the browser types its arguments as
 * `z.input` of them.
 */
import { z } from 'zod';
import { crawlRobotsHandlingSchema, crawlScheduleCadenceSchema } from './site-health/crawl.ts';

/** A new crawl of the project's website; it analyzes up to the plan's page limit. */
export const siteCrawlCreateRequestSchema = z.strictObject({
  project_id: z.uuid(),
  /** Optional deterministic 64-bit seed as a decimal string. */
  seed: z.string().nullable().optional(),
  /**
   * `ignore` fetches the project's own pages despite robots.txt exclusions;
   * sending it confirms the person is authorized to crawl this site. Absent
   * means `respect`.
   */
  robots: crawlRobotsHandlingSchema.nullable().optional(),
});
export type SiteCrawlCreateRequest = z.input<typeof siteCrawlCreateRequestSchema>;

/** Turn the project's scheduled crawl on at a cadence, or off. */
export const crawlScheduleUpdateRequestSchema = z.strictObject({
  enabled: z.boolean(),
  cadence: crawlScheduleCadenceSchema,
});
export type CrawlScheduleUpdateRequest = z.input<typeof crawlScheduleUpdateRequestSchema>;
