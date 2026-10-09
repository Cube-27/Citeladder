/** The one read catalogue shared by hosted MCP and the in-app Agent. */
import { z } from 'zod';
import { analyticsSelectionSchema } from '@citeladder/contracts/mcp-app';
import { policy } from '../config.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import type { Database } from '../db/database.ts';
import { mcpPolicy } from './config.ts';
import {
  authorizeProject,
  listAccountProjects,
  principalForCall,
  searchBusinessContext,
} from './data.ts';
import {
  actionsRead,
  demandSnapshot,
  differentiationRead,
  integrationStatus,
  promptPortfolio,
  searchDataset,
  searchIntelligence,
  shelfRead,
} from './evidence.ts';
import {
  renderAnalytics,
  sourceUrl,
  visibilityOverview,
  visibilityResults,
  visibilitySources,
  visibilityTrends,
} from './evidence-analytics.ts';
import { crawlability, siteLinks, sitePages, siteSnapshot } from './evidence-site.ts';
import {
  aiTrafficInsights,
  aiTrafficPages,
  aiTrafficUrl,
  crawlLogsRead,
  performanceRead,
  queryEvidence,
  referrals,
} from './evidence-traffic.ts';
import { businessContext } from './context.ts';
import { fetchRecord } from './retrieval.ts';
import { McpInputError, type Evidence, type EvidencePrincipal, type ProjectRead } from './types.ts';

const optional = <T extends z.ZodType>(schema: T) => schema.nullish();
const uuid = z.uuid();
const limit = optional(z.number().int().min(1).max(mcpPolicy.max_list_limit));
const page = { cursor: optional(z.string()), limit };
const project = { project_id: uuid };
const engine = optional(z.enum(policy.visibility.logical_engines));
const cohort = z.enum(['core', 'comparison']).default('core');
const analyticsRange = optional(z.enum(Object.keys(policy.analytics.preset_range_days)));
const dates = { start_date: optional(z.iso.date()), end_date: optional(z.iso.date()) };
const crawlPage = {
  cursor: optional(z.string()),
  limit: optional(z.number().int().min(1).max(crawlLogs.max_page_size)),
};
const verification = optional(z.enum(['verified', 'unverifiable', 'failed_verification']));
export const contextSections = [
  'profile',
  'prompts',
  'visibility',
  'actions',
  'site_health',
  'crawlability',
  'demand',
  'performance',
  'referrals',
  'crawl_logs',
  'integrations',
  'search_intelligence',
] as const;

type Context = {
  db: Database;
  principal: EvidencePrincipal;
  origin: string;
  maxBytes?: number;
};
type Definition<S extends z.ZodObject> = {
  title: string;
  description: string;
  schema: S;
  read: (context: Context, args: z.output<S>) => Promise<Evidence>;
};
const tool = <S extends z.ZodObject>(definition: Definition<S>) => definition;
/** A project read: the project is authorized on every call, never by its ID alone. */
function projectTool<S extends z.ZodObject<{ project_id: typeof uuid }>>(definition: {
  title: string;
  description: string;
  schema: S;
  read: (read: ProjectRead, args: z.output<S>) => Promise<Evidence>;
}): Definition<S> {
  return {
    ...definition,
    read: async ({ db, principal, origin }, args) => {
      const row = await authorizeProject(db, principal, args.project_id);
      const evidence = await definition.read(
        { db, origin, scope: { workspaceId: row.workspace_id, projectId: row.id } },
        args,
      );
      // Unknown availability is a defect, never a silent "available".
      if (typeof evidence.state !== 'string' && !('surface' in evidence))
        throw new Error('Project read returned no state');
      return evidence;
    },
  };
}

export const definitions = {
  list_projects: tool({
    title: 'List projects',
    description: 'List the projects this connection can read. Start here when no project is known.',
    schema: z.strictObject(page),
    read: ({ db, principal }, args) =>
      listAccountProjects(
        db,
        principal,
        args.limit ?? mcpPolicy.default_list_limit,
        args.cursor ?? null,
      ),
  }),
  get_project_business_context: tool({
    title: 'Get project overview',
    description:
      'One overview of a project: business profile, competitors, active prompts, latest visibility, top Actions, Site Health and connected data. Pass sections to read fewer.',
    schema: z.strictObject({ ...project, sections: optional(z.array(z.enum(contextSections))) }),
    read: ({ db, principal, origin }, args) =>
      businessContext(db, principal, args.project_id, origin, args.sections ?? undefined),
  }),
  search: tool({
    title: 'Search',
    description: 'Find projects, active Actions and prompts by text. Pass a result id to fetch.',
    schema: z.strictObject({
      query: z.string().trim().min(1),
      project_id: optional(uuid),
      limit: z
        .number()
        .int()
        .min(1)
        .max(mcpPolicy.max_search_results)
        .default(mcpPolicy.default_search_limit),
    }),
    read: ({ db, principal, origin }, args) =>
      searchBusinessContext(db, principal, args.query, args.project_id ?? null, args.limit, origin),
  }),
  fetch: tool({
    title: 'Fetch a record',
    description: 'Read one record by the citeladder:// id another read returned.',
    schema: z.strictObject({ id: z.string() }),
    read: ({ db, principal, origin, maxBytes }, args) =>
      fetchRecord(db, principal, args.id, origin, maxBytes),
  }),
  read_visibility_overview: projectTool({
    title: 'Read AI visibility',
    description:
      'Mention rate, citation rate, rankings against competitors and run status for the latest or a chosen run. Pass baseline_id to compare two runs.',
    schema: z.strictObject({
      ...project,
      audit_id: optional(uuid),
      baseline_id: optional(uuid),
      engine,
      cohort,
    }),
    read: visibilityOverview,
  }),
  read_visibility_trends: projectTool({
    title: 'Read visibility trends',
    description:
      'Visibility over time for an explicit window. Points with different comparison keys are not comparable; gaps are missing runs, not zero.',
    schema: z.strictObject({
      ...project,
      from_at: z.iso.datetime({ offset: true }),
      to_at: z.iso.datetime({ offset: true }),
      engine,
      cohort,
      granularity: z.enum(['run', 'day', 'week', 'month']).default('run'),
      transport_model: optional(z.string().trim().min(1)),
      retrieval_enabled: optional(z.boolean()),
    }),
    read: visibilityTrends,
  }),
  read_visibility_results: projectTool({
    title: 'Read AI answers',
    description:
      'The answers engines gave in one run, with mentions and cited sources. Filter by prompt, cited domain or URL.',
    schema: z.strictObject({
      ...project,
      audit_id: uuid,
      engine,
      cohort,
      prompt_id: optional(uuid),
      domain: optional(z.string().trim().min(1).max(253)),
      url: optional(z.url()),
      ...page,
    }),
    read: visibilityResults,
  }),
  read_visibility_sources: projectTool({
    title: 'Read cited sources',
    description:
      'Which domains or URLs engines cited in one run, how often, and whether you or competitors are listed on them.',
    schema: z.strictObject({
      ...project,
      audit_id: uuid,
      engine,
      cohort,
      level: z.enum(['domain', 'url']).default('domain'),
      domain: optional(z.string().trim().min(1).max(253)),
      ...page,
    }),
    read: visibilitySources,
  }),
  read_source_url: projectTool({
    title: 'Read a cited page',
    description:
      'One cited URL: the prompts and engines that cite it, the brands it lists and whether your brand is on it. Omit audit_id for every run.',
    schema: z.strictObject({
      ...project,
      url: z.string().trim().min(1).max(8192),
      audit_id: optional(uuid),
      engine,
      cohort,
    }),
    read: sourceUrl,
  }),
  read_prompt_portfolio: projectTool({
    title: 'Read prompts',
    description:
      'The tracked prompts with topic, intent and status. Core prompts are scored; comparison prompts are reported separately.',
    schema: z.strictObject({
      ...project,
      prompt_set_id: optional(uuid),
      cohort: optional(z.enum(['core', 'comparison'])),
      active_only: z.boolean().default(false),
      ...page,
    }),
    read: promptPortfolio,
  }),
  read_actions: projectTool({
    title: 'Read Actions',
    description:
      'The prioritized Actions to improve visibility, with status. Pass action_id for one Action with its findings, remediation and measured outcome.',
    schema: z.strictObject({
      ...project,
      action_id: optional(uuid),
      status: optional(z.enum(policy.opportunity.actions.ACTION_STATUSES)),
      ...page,
    }),
    read: actionsRead,
  }),
  read_content_differentiation: projectTool({
    title: 'Read content comparisons',
    description: 'How cited competitor pages differ from yours, from pages CiteLadder has read.',
    schema: z.strictObject(project),
    read: differentiationRead,
  }),
  read_ai_shelf: projectTool({
    title: 'Read the AI Shelf',
    description:
      'Product recommendations in AI answers. Without a target, lists categories and products; with one, its visibility, share of shelf and who holds the shelf.',
    schema: z.strictObject({
      ...project,
      target_kind: optional(z.enum(['category', 'product'])),
      target_id: optional(uuid),
    }),
    read: shelfRead,
  }),
  read_site_health: projectTool({
    title: 'Read Site Health',
    description:
      'Site Health scores, coverage and top issues for the latest crawl, or a chosen snapshot_id.',
    schema: z.strictObject({ ...project, snapshot_id: optional(uuid) }),
    read: siteSnapshot,
  }),
  read_site_pages: projectTool({
    title: 'Read site pages',
    description: 'Pages from a crawl with page type, scores and issue counts.',
    schema: z.strictObject({
      ...project,
      crawl_id: optional(uuid),
      page_kind: optional(z.string()),
      status: optional(z.string()),
      ...page,
    }),
    read: sitePages,
  }),
  read_site_links: projectTool({
    title: 'Read internal links',
    description:
      'Internal link counts per page for a crawl, with sampled linking pages and anchors.',
    schema: z.strictObject({
      ...project,
      crawl_id: optional(uuid),
      site_url_id: optional(uuid),
      ...page,
    }),
    read: siteLinks,
  }),
  read_ai_crawlability: projectTool({
    title: 'Read AI crawler access',
    description:
      'Whether robots.txt lets each AI crawler in, for the latest or a chosen crawl. Permission, not observed visits.',
    schema: z.strictObject({ ...project, crawl_id: optional(uuid) }),
    read: crawlability,
  }),
  read_crawl_logs: projectTool({
    title: 'Read AI crawler visits',
    description:
      'AI crawler requests from server logs: summary, per crawler, log coverage, or individual requests (view requests). Missing coverage is not zero.',
    schema: z.strictObject({
      ...project,
      view: z.enum(['summary', 'crawlers', 'coverage', 'requests']).default('summary'),
      range: analyticsRange,
      ...dates,
      verification,
      bot_id: optional(z.string()),
      status: optional(z.int().min(100).max(599)),
      folder: optional(z.string().max(2048)),
      resource_class: optional(z.string().max(24)),
      ...crawlPage,
    }),
    read: crawlLogsRead,
  }),
  read_ai_traffic_pages: projectTool({
    title: 'Read AI traffic by page',
    description:
      'Per page: AI crawler requests, AI referral sessions, citations and Site Health findings, each with its own coverage.',
    schema: z.strictObject({
      ...project,
      range: analyticsRange,
      ...dates,
      folder: optional(z.string().max(2048)),
      resource_class: optional(z.string().max(24)),
      verification,
      sort: optional(
        z.enum(['requests_desc', 'sessions_desc', 'key_events_desc', 'citations_desc', 'url_asc']),
      ),
      ...crawlPage,
    }),
    read: aiTrafficPages,
  }),
  read_ai_traffic_url: projectTool({
    title: 'Read AI traffic for a URL',
    description: 'The AI traffic timeline of one page on the project site.',
    schema: z.strictObject({
      ...project,
      url: z.string().trim().min(1).max(4096),
      range: analyticsRange,
      ...dates,
    }),
    read: aiTrafficUrl,
  }),
  read_ai_traffic_insights: projectTool({
    title: 'Read AI traffic insights',
    description:
      'Patterns across AI crawler, referral and citation data. Co-occurrence, not cause.',
    schema: z.strictObject({ ...project, range: analyticsRange, ...dates }),
    read: aiTrafficInsights,
  }),
  read_ai_referrals: projectTool({
    title: 'Read AI referral traffic',
    description:
      'Visits from AI assistants (GA4): sessions, share of traffic, key events, landing pages.',
    schema: z.strictObject({ ...project, range: analyticsRange, ...dates }),
    read: referrals,
  }),
  read_performance: projectTool({
    title: 'Read search performance',
    description:
      'Search Console and GA4 totals for a range with an optional comparison. Pass dimension for a breakdown by query, page, country, device or day.',
    schema: z.strictObject({
      ...project,
      range: optional(z.enum(policy.traffic.PERFORMANCE_RANGES)),
      ...dates,
      granularity: optional(z.enum(policy.traffic.TRAFFIC_SNAPSHOT_GRANULARITIES)),
      compare: optional(z.enum(policy.traffic.PERFORMANCE_COMPARE_MODES)),
      compare_start_date: optional(z.iso.date()),
      compare_end_date: optional(z.iso.date()),
      dimension: optional(
        z.enum([
          'query',
          'page',
          'country',
          'device',
          'search_appearance',
          'day',
          'bing_query',
          'bing_page',
        ]),
      ),
      sort: optional(z.string()),
      cursor: optional(z.string()),
      limit: optional(z.literal(policy.traffic.PERFORMANCE_PAGE_SIZE_OPTIONS)),
    }),
    read: performanceRead,
  }),
  read_query_evidence: projectTool({
    title: 'Read queries by page',
    description:
      'Search Console queries matched to site pages for an exact saved window (inclusive dates).',
    schema: z.strictObject({
      ...project,
      window_start: z.iso.date(),
      window_end: z.iso.date(),
      query: optional(z.string()),
      site_url_id: optional(uuid),
      resolution_outcome: optional(z.string()),
      ...page,
    }),
    read: queryEvidence,
  }),
  read_demand: projectTool({
    title: 'Read search demand',
    description: 'Latest search demand: what people search for in this market and how it changed.',
    schema: z.strictObject(project),
    read: demandSnapshot,
  }),
  read_integration_status: projectTool({
    title: 'Read connected data',
    description: 'Which data sources are connected and how far their import has got.',
    schema: z.strictObject(project),
    read: integrationStatus,
  }),
  read_search_intelligence: projectTool({
    title: 'Read keyword and backlink research',
    description: 'The keyword, competitor and backlink datasets researched for this project.',
    schema: z.strictObject(project),
    read: searchIntelligence,
  }),
  read_search_dataset: projectTool({
    title: 'Read a research dataset',
    description:
      'Rows of one keyword or backlink dataset. Referring-domain and page totals are aggregates, not individual links.',
    schema: z.strictObject({
      ...project,
      dataset_id: uuid,
      sort: optional(z.string()),
      direction: z.enum(['asc', 'desc']).default('asc'),
      ...page,
    }),
    read: searchDataset,
  }),
  render_visibility: projectTool({
    title: 'Show AI visibility',
    description:
      'Show an interactive visibility view: overview, trends over a window, or cited sources for one run.',
    schema: analyticsSelectionSchema.extend({
      view: z.enum(['overview', 'trends', 'sources']).default('overview'),
    }),
    read: ({ db, scope, origin }, args) => renderAnalytics(db, scope, args, origin),
  }),
  render_site_health: projectTool({
    title: 'Show Site Health',
    description: 'Show an interactive Site Health view for the latest or a chosen snapshot.',
    schema: z.strictObject({ ...project, snapshot_id: optional(uuid) }),
    read: ({ db, scope, origin }, args) =>
      renderAnalytics(
        db,
        scope,
        analyticsSelectionSchema.parse({ ...args, view: 'site_health' }),
        origin,
      ),
  }),
  open_analytics: tool({
    title: 'Open CiteLadder',
    description: 'Open the CiteLadder project picker.',
    schema: z.strictObject({}),
    read: async ({ origin }) => ({
      surface: 'citeladder_analytics',
      selection: null,
      evidence: {},
      links: { application: origin, onboarding: `${origin}/onboarding` },
    }),
  }),
};
export type ToolName = keyof typeof definitions;
export const presentationTools: ReadonlySet<string> = new Set<ToolName>([
  'render_visibility',
  'render_site_health',
  'open_analytics',
]);

/** JSON Schema without the noise models pay for: no $schema, UUID patterns or null branches. */
function compact(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(compact);
  if (node === null || typeof node !== 'object') return node;
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === '$schema' || (key === 'pattern' && source.format === 'uuid')) continue;
    out[key] = compact(value);
  }
  const options = out.anyOf;
  if (Array.isArray(options) && Object.keys(out).length === 1) {
    const kept = options.filter(
      (option) =>
        !(option && typeof option === 'object' && 'type' in option && option.type === 'null'),
    );
    if (kept.length === 1) return kept[0];
  }
  return out;
}
export function inputSchema(schema: z.ZodType) {
  return compact(z.toJSONSchema(schema, { io: 'input' }));
}
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export const tools = Object.entries(definitions).map(([name, definition]) => ({
  name,
  title: definition.title,
  description: definition.description,
  inputSchema: inputSchema(definition.schema),
  annotations,
}));

const output = z.record(z.string(), z.json());
function isToolName(name: string): name is ToolName {
  return Object.hasOwn(definitions, name);
}
/** Names each invalid field so the model can correct its call. */
function argumentProblem(error: z.ZodError) {
  return `Invalid arguments: ${error.issues
    .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
    .join('; ')}`;
}

export async function dispatchTool(
  db: Database,
  principal: EvidencePrincipal,
  name: string,
  input: unknown,
  origin: string,
  maxBytes?: number,
): Promise<Evidence> {
  if (!isToolName(name)) throw new McpInputError(`Unknown tool: ${name}`);
  const definition: Definition<z.ZodObject> = definitions[name];
  const parsed = definition.schema.safeParse(input);
  if (!parsed.success) throw new McpInputError(argumentProblem(parsed.error));
  const call = principalForCall(principal);
  const result = await definition.read({ db, principal: call, origin, maxBytes }, parsed.data);
  // Dates serialize as ISO instants; an invalid persisted projection fails here.
  return output.parse(JSON.parse(JSON.stringify(result)));
}
