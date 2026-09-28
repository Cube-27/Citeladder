import { z } from 'zod';

export const contentPassageSchema = z.object({
  locator: z.string(),
  heading: z.string(),
  text: z.string(),
  linked_ranges: z.array(z.object({ start: z.number().int(), end: z.number().int() })),
});

export const contentPageSchema = z.object({
  analysis_id: z.uuid(),
  artifact_id: z.uuid(),
  site_url_id: z.uuid(),
  url: z.string(),
  title: z.string(),
  excerpt: z.string(),
  headings: z.array(z.string()),
  passages: z.array(contentPassageSchema),
  contextual_targets: z.array(z.string()),
  navigation_targets: z.array(z.string()),
  links_complete: z.boolean(),
  eligible_target: z.boolean(),
  extractor_version: z.string(),
});

export const contentLinkSchema = z.object({
  id: z.uuid(),
  source: contentPageSchema.omit({ passages: true }),
  target: contentPageSchema.omit({ passages: true }),
  passage: contentPassageSchema,
  anchor: z.object({ text: z.string(), start: z.number().int(), end: z.number().int() }),
  usefulness: z.number().min(0).max(1),
  anchor_confidence: z.number().min(0).max(1),
  action_id: z.uuid().nullable(),
  action_status: z.string().nullable(),
});

export const contentTopicSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  source_analysis_id: z.uuid(),
  page_ids: z.array(z.uuid()),
  contextual_links: z.number().int().nonnegative(),
  recommendation_ids: z.array(z.uuid()),
});

export const contentStructureSchema = z.object({
  id: z.uuid(),
  crawl_id: z.uuid(),
  created_at: z.string(),
  state: z.enum(['queued', 'running', 'completed', 'partial', 'unavailable', 'cancelled', 'failed']),
  page_count: z.number().int(),
  omitted_pages: z.number().int(),
  omitted_candidates: z.number().int(),
  unassigned_pages: z.number().int(),
  unavailable_judgments: z.number().int(),
  stale: z.boolean(),
  recommendations: z.array(contentLinkSchema),
  topics: z.array(contentTopicSchema),
  pages: z.array(contentPageSchema.omit({ passages: true })),
});

export const contentStructureReadSchema = z.object({
  analysis: contentStructureSchema.nullable(),
  crawl_id: z.uuid().nullable(),
  availability: z.enum(['ready', 'crawl_required', 'fresh_crawl_required', 'unavailable']),
});

export const contentStructureInputSchema = z.object({
  crawl_id: z.uuid(),
  idempotency_key: z.uuid(),
});

export type ContentPage = z.infer<typeof contentPageSchema>;
export type ContentLink = z.infer<typeof contentLinkSchema>;
export type ContentTopic = z.infer<typeof contentTopicSchema>;
export type ContentStructure = z.infer<typeof contentStructureSchema>;
