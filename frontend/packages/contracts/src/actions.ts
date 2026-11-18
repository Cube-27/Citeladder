import { z } from 'zod';

import {
  expectedCheckSchema,
  implementationStateSchema,
  opportunitySchema,
  verificationEventSchema,
} from './opportunities.ts';
import { agentRunSchema } from './agent.ts';
import {
  contentGapFindingEvidenceSchema,
  issueFamilyCohortSchema,
} from './opportunity-evidence.ts';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

import { actionMeasurementSchema, actionStatusSchema } from './action-status.ts';

export {
  ACTION_STATUS_ANY,
  actionMeasurementSchema,
  actionStatusSchema,
  type ActionMeasurement,
  type ActionStatus,
} from './action-status.ts';

// How the Action hands off into the Agent (AS3): the message a new chat opens
// with, filled from the Action's own evidence, and a workflow (`workflows.json`
// id) with the finding's Opportunity or with the Action's page URL. `action`
// hands off with the Action alone.
export const actionHandoffSchema = z.discriminatedUnion('context', [
  responseObject({ context: z.literal('action'), message: z.string() }),
  responseObject({
    context: z.literal('opportunity'),
    workflow_id: z.string(),
    opportunity_id: uuid(),
    message: z.string(),
  }),
  responseObject({ context: z.literal('page_url'), workflow_id: z.string(), message: z.string() }),
]);
export type ActionHandoff = z.infer<typeof actionHandoffSchema>;

// The Actions page's goals, in their fixed order, and the groupings under them
// (plan v3, owner 2026-11-16), persisted on each Action at sync
// (services/api config `ACTION_GOALS`). No producer files `wrong_claims` yet.
export const actionGoalSchema = z.enum(['read_site', 'own_pages', 'mentions', 'wrong_claims']);
export type ActionGoal = z.infer<typeof actionGoalSchema>;
export const actionGroupingSchema = z.enum([
  'seo',
  'aeo',
  'content',
  'prompts',
  'create_content',
  'improve_pages',
  'search_queries',
  'internal_links',
  'regressed',
  'product_pages',
  'editorial',
  'ugc',
  'references',
  'other_sources',
]);
export type ActionGrouping = z.infer<typeof actionGroupingSchema>;

// What an Action is about (docs/opportunities.md#actions). Several Opportunity
// targets map to one kind; services/api `opportunities/targets/` owns each.
export const actionTargetKindSchema = z.enum([
  'page',
  'earned_page',
  'product',
  'category',
  'query',
  'prompt',
  'planned_page',
  'issue_family',
]);
export type ActionTargetKind = z.infer<typeof actionTargetKindSchema>;

// The band a priority score falls in; the score itself only ranks.
export const actionPriorityBandSchema = z.enum(['high', 'medium', 'low']);
export type ActionPriorityBand = z.infer<typeof actionPriorityBandSchema>;

// One unit of work per target, projected from persisted Action rows.
export const actionItemSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  target_kind: z.string(),
  target_label: z.string(),
  target_url: z.string().nullable(),
  target_prompt_id: uuid().nullable(),
  origin: z.enum(['evidence', 'agent']),
  status: actionStatusSchema,
  measurement: actionMeasurementSchema.nullable(),
  priority_score: z.number().nullable(),
  // Null while the Action has no score.
  priority_band: actionPriorityBandSchema.nullable(),
  families: z.array(z.string()),
  approach: z.string(),
  // Where the Actions page files it, as action sync persisted it.
  goal: actionGoalSchema,
  grouping: actionGroupingSchema,
  skill_id: z.string(),
  member_count: z.number().int(),
  // The findings a declaration would freeze: the current members, or the last
  // non-empty set once a recrawl resolved them all. Zero: nothing to declare.
  declarable_member_count: z.number().int(),
  // An issue-family Action's affected pages (its cohort's count); null for
  // every other target kind.
  page_count: z.number().int().nullable().default(null),
  // An issue-family Action's Site Health class, so an advisory reads as one;
  // null for every other target kind.
  finding_class: z.enum(['defect', 'advisory']).nullable().default(null),
  // The row's secondary line: an issue family's Site Health fix as Issues
  // shows it, else the strongest finding's title; null when it has neither.
  summary: z.string().nullable().default(null),
  handoff: actionHandoffSchema,
  evidence_cleared_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const diagnosisMemberSchema = responseObject({
  opportunity_id: uuid(),
  rule_id: z.string(),
  title: z.string(),
  family: z.string(),
  priority_score: z.number(),
});

// The deterministic diagnosis persisted at recompute. An agent-origin Action
// with no evidence yet carries an empty object, so every field is optional.
// Its handoff is read as the Action's `handoff`.
const actionDiagnosisSchema = responseObject({
  what_happened: z.array(diagnosisMemberSchema).optional(),
  approach: z.string().optional(),
  skill_id: z.string().optional(),
  donts: z.array(z.string()).optional(),
  measure_with: z.array(z.string()).optional(),
});

// What one loop leg of a declared Action is waiting for (plan §9).
export const measurementLegSchema = responseObject({
  leg: z.enum(['next_visibility_run', 'next_search_console_window', 'next_crawl']),
  state: z.enum(['waiting', 'not_scheduled', 'sync_needed', 'observed']),
  due_at: z.string().nullable(),
  last_evidence_at: z.string().nullable(),
  // The crawl, audit, traffic snapshot or schedule behind it.
  source_id: uuid().nullable(),
});

// An issue-family check's reading of its cohort in one crawl: the pages still
// failing, and how many pass, no longer apply or went unread. `uncovered`
// counts the family's pages beyond the frozen cohort, which no crawl checks.
export const issueFamilyPagesSchema = responseObject({
  failing: z.array(responseObject({ site_url_id: uuid(), url: z.string() })),
  passing: z.number().int(),
  not_applicable: z.number().int(),
  unread: z.number().int(),
  uncovered: z.number().int(),
});

// One expected check's latest reading. Each check keeps the state its own
// evidence last gave it, so a crawl and a Search Console window together can
// settle a page Action that neither settles alone.
export const declarationCheckSchema = responseObject({
  index: z.number().int(),
  kind: z.string(),
  leg: measurementLegSchema.shape.leg,
  // `waiting`: no comparable reading yet. `unavailable`: the reading could not
  // answer, with `reason`. `met` / `unmet`: the reading answered.
  state: z.enum(['waiting', 'met', 'unmet', 'unavailable']),
  reason: z.string().nullable(),
  observed_at: z.string().nullable(),
  // The exact source of that reading: a crawl, audit, traffic snapshot or
  // Search Intelligence dataset.
  source_kind: z.string().nullable(),
  source_id: z.string().nullable(),
  // What the check names: a rule, a prompt's text, a page or query, or a link.
  subject: z.string().nullable(),
  // The tracked prompt a visibility check measures, whose history it links to.
  prompt_id: uuid().nullable().optional(),
  // An issue-family check's per-page reading: the cohort pages still failing,
  // and how many passed or the crawl did not read. Null for every other kind.
  pages: issueFamilyPagesSchema.nullable().optional(),
});

// The user's declaration, frozen server-side: members, targets and checks.
export const actionDeclarationSchema = responseObject({
  id: uuid(),
  action_id: uuid(),
  output_revision_id: uuid().nullable(),
  member_opportunity_ids: z.array(uuid()),
  // The newest snapshot at or before go-live; null when none existed, so the
  // baseline is unavailable.
  opportunity_snapshot_id: uuid().nullable(),
  // The refresh that resolved the declared findings at or before go-live: the
  // outcome predates the deployment and is never credited to it. Null when
  // the findings were still live at go-live.
  resolved_before_snapshot_id: uuid().nullable(),
  target_site_url_ids: z.array(uuid()),
  // Populated instead of the owned ids for an earned Action: the publisher
  // page the listing was requested on. Never both.
  target_external_url: z.string().nullable(),
  // The recorded deployment step: when the fix shipped (the go-live above),
  // the workspace member who recorded it (null once they left the workspace)
  // and what shipped it, as they typed it (null when none was given).
  declared_implemented_at: z.string(),
  deployed_by: z.string().nullable().default(null),
  deployment_reference: z.string().nullable().default(null),
  expected_checks: z.array(expectedCheckSchema),
  state: implementationStateSchema,
  limitations: z.array(z.string()),
  verification_events: z.array(verificationEventSchema),
  legs: z.array(measurementLegSchema),
  checks: z.array(declarationCheckSchema),
  // When new evidence stops re-checking this declaration.
  measured_until: z.string(),
  created_at: z.string(),
});

/**
 * One URL an Action touches, with its page type in the crawl that last saw it
 * (null when that crawl did not classify it) and how many open Actions (New
 * and In progress) touch it.
 */
export const actionUrlSchema = responseObject({
  site_url_id: uuid(),
  url: z.string(),
  page_kind: z.string().nullable(),
  open_action_count: z.number().int(),
});

/**
 * A page of an Action's URLs in URL order, `total` over all of them. An issue
 * group of a site-level rule whose evidence names no page is `whole_site`,
 * with no URLs.
 */
export const actionUrlsPageSchema = responseObject({
  whole_site: z.boolean(),
  total: z.number().int(),
  items: z.array(actionUrlSchema),
  next_cursor: z.string().nullable(),
});

export const actionDetailSchema = actionItemSchema.extend({
  // Per member opportunity id: the reading that would measure it once
  // declared, or null when no automatic check applies.
  member_measurement: z.record(z.string(), measurementLegSchema.shape.leg.nullable()),
  // The earliest implementation time a declaration accepts.
  declarable_since: z.string(),
  diagnosis: actionDiagnosisSchema,
  // Each live finding with what to do about it; a content-gap finding also
  // carries its stored evidence (null for every other rule).
  members: z.array(
    opportunitySchema.extend({
      remediation: z.string(),
      content_gap_evidence: contentGapFindingEvidenceSchema.nullable(),
    }),
  ),
  declaration: actionDeclarationSchema.nullable(),
  // The target is one of the latest crawl's content pages (CO15), so Work with
  // the agent opens it as a page document (phase 2, E3). Read-time only.
  editable_page: z.boolean().default(false),
  // An issue-family Action's cohort without its pages, with when its crawl
  // completed and how many URLs it analyzed (null when unrecorded): the
  // declared cohort once declared, else the latest refresh's.
  // Null for every other target kind. `urls` pages the group's current URLs,
  // which a later refresh can change after a declaration froze this cohort.
  cohort: issueFamilyCohortSchema
    .omit({ pages: true })
    .extend({
      crawl_completed_at: z.string().nullable(),
      crawl_analyzed_url_count: z.number().int().nullable().default(null),
    })
    .nullable()
    .default(null),
  // The first page of the URLs the Action touches (`action_urls`).
  urls: actionUrlsPageSchema.default({ whole_site: false, total: 0, items: [], next_cursor: null }),
});

// What the Actions tree groups by first; its second level is always the
// persisted grouping.
export const actionTreeGroupBySchema = z.enum([
  'goal',
  'what_to_do',
  'impact',
  'ownership',
  'topic',
]);
export type ActionTreeGroupBy = z.infer<typeof actionTreeGroupBySchema>;
export const actionOwnershipSchema = z.enum(['owned', 'earned']);

/**
 * The Actions page in one persisted read (plan v3). `status_counts` are
 * project-wide in the four statuses; `goals` count each goal's open Actions
 * (New and In progress) under the other filters whatever the status filter,
 * in fixed order, `blocking` when a critical SEO or AEO Action is New. Each
 * group (by `group_by`: a goal, an approach, a priority band with unscored
 * Actions in `low`, `owned`/`earned`, or a topic, '' for none) holds its
 * groupings, each with its count and first rows by impact; `next_cursor` is
 * the list read's cursor for the next rows of exactly that grouping.
 */
export const actionTreeSchema = responseObject({
  group_by: actionTreeGroupBySchema,
  status_counts: z.record(z.string(), z.number().int()),
  goals: z.array(
    responseObject({ goal: actionGoalSchema, count: z.number().int(), blocking: z.boolean() }),
  ),
  groups: z.array(
    responseObject({
      key: z.string(),
      count: z.number().int(),
      groupings: z.array(
        responseObject({
          grouping: actionGroupingSchema,
          count: z.number().int(),
          items: z.array(actionItemSchema),
          next_cursor: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type ActionTree = z.infer<typeof actionTreeSchema>;

/**
 * Every listed Action touching one URL, by impact, with the URL's page type
 * and when a crawl last saw it.
 */
export const urlActionsSchema = responseObject({
  site_url_id: uuid(),
  url: z.string(),
  page_kind: z.string().nullable(),
  last_crawled_at: z.string(),
  items: z.array(actionItemSchema),
});

export const actionsPageSchema = responseObject({
  items: z.array(actionItemSchema),
  next_cursor: z.string().nullable(),
  // Project-wide, unfiltered: one count per status (New, In progress, Done, Declined).
  status_counts: z.record(z.string(), z.number().int()),
});

/**
 * The statuses a user decision stores: `in_progress` (Accept), `dismissed`
 * (Decline) and `open` (Restore). Done is only declared.
 */
export const actionUserStatusSchema = actionStatusSchema.extract([
  'open',
  'in_progress',
  'dismissed',
]);
export type ActionUserStatus = z.infer<typeof actionUserStatusSchema>;

export const actionStatusUpdateRequestSchema = z.strictObject({ status: actionUserStatusSchema });
export type ActionStatusUpdateRequest = z.input<typeof actionStatusUpdateRequestSchema>;

/** A topic filter's longest value: the persisted theme's column width. */
export const ACTION_TOPIC_MAX_CHARS = 255;

/** The list filters a bulk change reaches through: the Actions list's own. */
export const actionBulkFilterSchema = z.strictObject({
  status: actionStatusSchema,
  q: z.string().max(200).optional(),
  target_kind: actionTargetKindSchema.optional(),
  approach: z.string().optional(),
  priority: actionPriorityBandSchema.optional(),
  family: z.string().optional(),
  // A ticked grouping of the tree, under its group's key when not by goal.
  grouping: actionGroupingSchema.optional(),
  ownership: actionOwnershipSchema.optional(),
  topic: z.string().max(ACTION_TOPIC_MAX_CHARS).optional(),
});

/**
 * One status decision on many Actions: the ticked ids, or every Action the
 * filter matches (Accept all), at most `ACTION_BULK_MAX` either way. A legal
 * transition is applied; the rest are skipped.
 */
export const ACTION_BULK_MAX = 100;
export const actionBulkStatusRequestSchema = z
  .strictObject({
    ids: z.array(uuid()).min(1).max(ACTION_BULK_MAX).optional(),
    filter: actionBulkFilterSchema.optional(),
    to: actionUserStatusSchema,
  })
  .refine((body) => (body.ids === undefined) !== (body.filter === undefined), {
    message: 'Name either ids or a filter',
  });
export type ActionBulkStatusRequest = z.input<typeof actionBulkStatusRequestSchema>;

export const actionBulkStatusResultSchema = responseObject({
  updated: z.number().int(),
  // Named or matched but not moved: unknown, another workspace's, already
  // there, or no legal transition to `to`.
  skipped: z.number().int(),
  // The filter matched more than one change takes; repeat it for the rest.
  truncated: z.boolean(),
});

/**
 * An implementation declaration, the Action's recorded deployment step. Targets
 * and expected checks are server-owned; the user names the recommendations
 * done, the revision shipped (null for work done outside CiteLadder), when it
 * went live and, optionally, what shipped it. Who recorded it is the
 * authenticated user, never a request field.
 */
export const actionDeclarationRequestSchema = z.strictObject({
  recommendation_ids: z.array(uuid()).max(100).default([]),
  output_revision_id: uuid().nullable().default(null),
  declared_implemented_at: z.iso
    .datetime({ offset: true })
    .refine((value) => !value.startsWith('0000-'), 'A valid calendar year is required'),
  // What shipped it: a release, pull request or commit. One line without
  // control characters (PostgreSQL text cannot store NUL), at most 500
  // characters once trimmed; blank records none.
  deployment_reference: z
    .string()
    .trim()
    .max(500)
    .regex(/^\P{Cc}*$/u, 'Use one line of text')
    .nullable()
    .default(null),
});
export type ActionDeclarationRequest = z.input<typeof actionDeclarationRequestSchema>;

/**
 * The content pages Analyze a page offers: the latest crawl's pages of a
 * content kind (CO15) matching the search, at most the server's cap.
 * `crawl_id` is null when the project has no usable crawl yet.
 */
export const analyzablePagesSchema = responseObject({
  crawl_id: uuid().nullable(),
  items: z.array(
    responseObject({
      site_url_id: uuid(),
      url: z.string(),
      // The crawl's title for the page; '' when it had none.
      title: z.string(),
      page_kind: z.string(),
    }),
  ),
  // More pages match than are listed: narrow the search.
  truncated: z.boolean(),
});

/**
 * Analyze a page (CO6): one of the latest crawl's content pages, a topic with
 * prompts, and the prompts of that topic to optimize the page for.
 */
export const actionAnalyzeRequestSchema = z.strictObject({
  site_url_id: uuid(),
  topic_id: uuid(),
  prompt_ids: z
    .array(uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each prompt once'),
});
export type ActionAnalyzeRequest = z.input<typeof actionAnalyzeRequestSchema>;

/**
 * The page's Action (created or reused) and the `optimize_page` chat started
 * on it. `run` is null while the page is being read, as for any page chat.
 */
export const actionAnalyzeResultSchema = responseObject({
  action_id: uuid(),
  chat_id: uuid(),
  run: agentRunSchema.nullable(),
});
