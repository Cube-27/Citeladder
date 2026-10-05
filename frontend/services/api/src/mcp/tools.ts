import { z } from 'zod';
import { policy } from '../config.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import type { Database } from '../db/database.ts';
import { mcpPolicy } from './config.ts';
import { authorizeProject, listAccountProjects, searchBusinessContext } from './data.ts';
import { projectBusinessContext, readEvidence, type ReadArguments } from './evidence.ts';
import { readSiteEvidence } from './evidence-site.ts';
import { fetchRecord } from './retrieval.ts';
import { McpInputError, type Evidence, type EvidencePrincipal } from './types.ts';

const nullable = <T extends z.ZodType>(schema: T) => schema.nullish();
const uuid = z.uuid();
const pageLimit = nullable(z.number().int().min(1).max(mcpPolicy.max_list_limit));
const cursor = nullable(z.string());
const scope = { project_id: uuid };
const page = { cursor, limit: pageLimit };
// Crawl-log reads page at their own, smaller bound.
const crawlPage = { cursor, limit: nullable(z.number().int().min(1).max(crawlLogs.max_page_size)) };
const range = nullable(z.enum(policy.traffic.PERFORMANCE_RANGES));
const dates = { start_date: nullable(z.iso.date()), end_date: nullable(z.iso.date()) };
const visibility = {
  ...scope,
  audit_id: uuid,
  engine: nullable(z.string()),
  cohort: z.enum(['core', 'comparison']).default('core'),
  ...page,
};
const sections = z.enum([
  'profile',
  'prompts',
  'site_health',
  'crawlability',
  'crawl_logs',
  'demand',
  'opportunities',
  'visibility',
  'performance',
  'referrals',
  'integrations',
  'search_intelligence',
]);
export const definitions = {
  list_projects: {
    title: 'List CiteLadder projects',
    availability: 'successful_read' as const,
    description:
      'List a bounded page of projects visible to the connected account; follow next_cursor to enumerate the rest.',
    schema: z.strictObject(page),
  },
  get_project_business_context: {
    title: 'Get complete project business context',
    availability: 'successful_read' as const,
    description:
      'Read persisted project profile, prompt portfolio, Site Health, demand, opportunities, visibility, traffic and connection coverage. Missing projections stay unavailable.',
    schema: z.strictObject({ ...scope, sections: nullable(z.array(sections)) }),
  },
  search: {
    title: 'Search CiteLadder business context',
    availability: 'successful_read' as const,
    description:
      'Search authorized persisted projects, opportunities and prompts. Pass returned citeladder:// record URIs to fetch.',
    schema: z.strictObject({
      query: z.string().trim().min(1),
      project_id: nullable(uuid),
      limit: z
        .number()
        .int()
        .min(1)
        .max(mcpPolicy.max_search_results)
        .default(mcpPolicy.default_search_limit),
    }),
  },
  fetch: {
    title: 'Fetch a CiteLadder record',
    availability: 'successful_read' as const,
    description:
      'Fetch an authorized citeladder:// record URI. Large documents return bounded parts and continuation URIs.',
    schema: z.strictObject({ id: z.string() }),
  },
  read_site_health: {
    title: 'Read latest Site Health',
    availability: 'state' as const,
    description: 'Read the latest persisted Site Health score and coverage projection.',
    schema: z.strictObject(scope),
  },
  read_ai_crawlability: {
    title: 'Read AI crawlability',
    availability: 'state' as const,
    description:
      'Read persisted per-bot robots policy, root access, fetch status, snapshot ID and catalog version. Pass crawl_id for exact historical scope; omitted selects latest. Unobserved robots evidence is unavailable, never allowed or zero. Robots policy describes permission, not observed retrieval.',
    schema: z.strictObject({ ...scope, crawl_id: nullable(uuid) }),
  },
  read_crawl_logs: {
    title: 'Read crawl log analytics',
    availability: 'state' as const,
    description:
      'Read persisted recognized automated requests with inclusive date windows. verification describes crawler identity evidence, not crawl success. Requests, sessions and citations are separate units. Missing coverage never implies zero.',
    schema: z.strictObject({
      ...scope,
      view: z.enum(['summary', 'crawlers', 'coverage']).default('summary'),
      range: nullable(z.enum(Object.keys(policy.analytics.preset_range_days))),
      ...dates,
      verification: nullable(z.enum(['verified', 'unverifiable', 'failed_verification'])),
      ...crawlPage,
    }),
  },
  list_bot_requests: {
    title: 'List sanitized bot requests',
    availability: 'state' as const,
    description:
      'Read retained path-level automated requests, privacy redaction and IP verification provenance. No IPs, queries or full user agents are returned.',
    schema: z.strictObject({
      ...scope,
      bot_id: nullable(z.string()),
      status: nullable(z.int().min(100).max(599)),
      folder: nullable(z.string().max(2048)),
      resource_class: nullable(z.string()),
      ...crawlPage,
    }),
  },
  read_demand: {
    title: 'Read latest demand intelligence',
    availability: 'state' as const,
    description: 'Read the latest persisted demand snapshot, coverage and comparison.',
    schema: z.strictObject(scope),
  },
  read_opportunities: {
    title: 'Read ranked opportunities',
    availability: 'state' as const,
    description:
      'Read current ranked opportunities with evidence references and optional workflow status.',
    schema: z.strictObject({ ...scope, ...page, status: nullable(z.string()) }),
  },
  read_visibility_audit: {
    title: 'Read latest visibility audit',
    availability: 'state' as const,
    description:
      'Read an audit status and summary. Use its audit_id with read_visibility_results or read_visibility_sources for diagnosis.',
    schema: z.strictObject({
      ...scope,
      audit_id: nullable(uuid),
      completed_baseline: z.boolean().default(false),
    }),
  },
  read_performance: {
    title: 'Read Search Console performance',
    availability: 'state' as const,
    description:
      'Read persisted Search Console and GA4 performance for a range, with an optional comparison. Custom ranges require start_date and end_date.',
    schema: z.strictObject({
      ...scope,
      range,
      ...dates,
      granularity: nullable(z.enum(policy.traffic.TRAFFIC_SNAPSHOT_GRANULARITIES)),
      compare: nullable(z.enum(policy.traffic.PERFORMANCE_COMPARE_MODES)),
      compare_start_date: nullable(z.iso.date()),
      compare_end_date: nullable(z.iso.date()),
    }),
  },
  read_performance_table: {
    title: 'Read a performance breakdown',
    availability: 'state' as const,
    description:
      'Read a paged persisted performance breakdown. Supply snapshot_id or a range; custom ranges require start_date and end_date.',
    schema: z.strictObject({
      ...scope,
      range,
      ...dates,
      dimension: nullable(
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
      snapshot_id: nullable(uuid),
      sort: nullable(z.string()),
      cursor,
      page_size: nullable(z.literal(policy.traffic.PERFORMANCE_PAGE_SIZE_OPTIONS)),
      compare_snapshot_id: nullable(uuid),
    }),
  },
  read_ai_referrals: {
    title: 'Read AI referral traffic',
    availability: 'state' as const,
    description:
      'Read persisted property-wide referral sessions, share, key events per source, host-scoped landing pages, quality flags and channel comparison.',
    schema: z.strictObject({
      ...scope,
      range: nullable(z.enum(Object.keys(policy.analytics.preset_range_days))),
      ...dates,
    }),
  },
  read_ai_traffic_pages: {
    title: 'Read AI Traffic pages',
    availability: 'state' as const,
    description:
      'Read path-level crawler requests, AI referral sessions, tracked citations and Site Health findings with independent leg states.',
    schema: z.strictObject({
      ...scope,
      range: nullable(z.enum(Object.keys(policy.analytics.preset_range_days))),
      ...dates,
      folder: nullable(z.string().max(2048)),
      resource_class: nullable(z.string().max(24)),
      verification: nullable(z.string().max(128)),
      sort: nullable(
        z.enum(['requests_desc', 'sessions_desc', 'key_events_desc', 'citations_desc', 'url_asc']),
      ),
      ...crawlPage,
    }),
  },
  read_ai_traffic_url: {
    title: 'Read AI Traffic for a URL',
    availability: 'state' as const,
    description:
      'Read a persisted path timeline for a canonical same-origin project URL. Refuses off-origin URLs.',
    schema: z.strictObject({
      ...scope,
      url: z.string().trim().min(1).max(4096),
      range: nullable(z.enum(Object.keys(policy.analytics.preset_range_days))),
      ...dates,
    }),
  },
  read_ai_traffic_insights: {
    title: 'Read AI Traffic insights',
    availability: 'state' as const,
    description:
      'Read persisted coverage-gated co-occurrence patterns. Never implies causation or starts refresh work.',
    schema: z.strictObject({
      ...scope,
      range: nullable(z.enum(Object.keys(policy.analytics.preset_range_days))),
      ...dates,
    }),
  },
  read_integration_status: {
    title: 'Read data connection status',
    availability: 'state' as const,
    description:
      'Read mapped connections, live grant status, history import progress and projection coverage. No connection is an available observed state.',
    schema: z.strictObject(scope),
  },
  read_prompt_portfolio: {
    title: 'Read the prompt portfolio',
    availability: 'state' as const,
    description:
      'Enumerate persisted prompts with activation status, provenance and pagination. Core is the canonical scoring cohort; comparison is a separate panel. Empty available results mean no matching prompts.',
    schema: z.strictObject({
      ...scope,
      ...page,
      prompt_set_id: nullable(uuid),
      cohort: nullable(z.string()),
    }),
  },
  read_query_evidence: {
    title: 'Read page-linked query evidence',
    availability: 'state' as const,
    description:
      'Read an exact saved query/page/date window (inclusive dates). Missing windows never fall back. resolution_outcome filters persisted URL binding, not performance. Observed zero differs from unavailable.',
    schema: z.strictObject({
      ...scope,
      ...page,
      window_start: z.iso.date(),
      window_end: z.iso.date(),
      query: nullable(z.string()),
      site_url_id: nullable(uuid),
      resolution_outcome: nullable(z.string()),
    }),
  },
  read_site_pages: {
    title: 'Read Site Health pages',
    availability: 'state' as const,
    description:
      'Read bounded persisted page facts, analysis references, issue counts, coverage and applicability from a crawl.',
    schema: z.strictObject({
      ...scope,
      ...page,
      crawl_id: nullable(uuid),
      page_kind: nullable(z.string()),
      status: nullable(z.string()),
    }),
  },
  read_site_links: {
    title: 'Read Site Health link metrics',
    availability: 'state' as const,
    description:
      'Read aggregate page link metrics with bounded captured neighbors; aggregates are not individual backlink edges.',
    schema: z.strictObject({ ...scope, ...page, crawl_id: uuid, site_url_id: nullable(uuid) }),
  },
  read_visibility_results: {
    title: 'Read visibility results',
    availability: 'state' as const,
    description:
      'Read persisted answers and observations for one audit. Core is the canonical scoring panel; comparison is separately reported. Empty results differ from unavailable audit evidence. No provider rerun occurs.',
    schema: z.strictObject({ ...visibility, prompt_id: nullable(uuid) }),
  },
  read_visibility_sources: {
    title: 'Read visibility sources',
    availability: 'state' as const,
    description:
      'Read source usage and denominators for one audit. Answer citation co-occurrence remains distinct from inspected publisher-page presence.',
    schema: z.strictObject({ ...visibility, level: z.enum(['domain', 'url']).default('domain') }),
  },
  read_search_intelligence: {
    title: 'Read Search Intelligence',
    availability: 'state' as const,
    description: 'Inspect the persisted Search Intelligence dataset inventory and run provenance.',
    schema: z.strictObject(scope),
  },
  read_search_dataset: {
    title: 'Read a Search Intelligence dataset',
    availability: 'state' as const,
    description:
      'Page through a published dataset. Referring-domain and destination-page aggregates are not individual backlink edges.',
    schema: z.strictObject({
      ...scope,
      ...page,
      dataset_id: uuid,
      sort: nullable(z.string()),
      direction: z.enum(['asc', 'desc']).default('asc'),
    }),
  },
};
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const output = z.record(z.string(), z.json());
function readApplicability(name: string, evidence: Evidence) {
  const integrations = name === 'read_integration_status';
  return {
    identity: integrations
      ? {
          state: 'applicable',
          connection_id: 'applicable',
          snapshot_id: 'not_applicable',
          audit_id: 'not_applicable',
          crawl_id: 'not_applicable',
          dataset_id: 'not_applicable',
        }
      : 'applicable',
    coverage: 'applicable',
    pagination: 'pagination' in evidence ? 'applicable' : 'not_applicable',
    follow_through: integrations ? 'not_applicable' : 'applicable',
  };
}
export const tools = Object.entries(definitions).map(([name, definition]) => ({
  name,
  title: definition.title,
  description: definition.description,
  inputSchema: z.toJSONSchema(definition.schema, { io: 'input' }),
  outputSchema: z.toJSONSchema(output),
  annotations,
}));

export async function dispatchTool(
  db: Database,
  principal: EvidencePrincipal,
  name: string,
  input: unknown,
  origin: string,
  documentMaxBytes?: number,
): Promise<Evidence> {
  if (!Object.hasOwn(definitions, name)) throw new McpInputError('Unknown tool');
  const definition = definitions[name as keyof typeof definitions];
  const parsed = definition.schema.safeParse(input);
  if (!parsed.success) throw new McpInputError('Invalid tool arguments');
  const args = parsed.data as ReadArguments;
  let result: Evidence;
  if (name === 'list_projects')
    result = await listAccountProjects(
      db,
      principal,
      Number(args.limit ?? mcpPolicy.default_list_limit),
      typeof args.cursor === 'string' ? args.cursor : null,
    );
  else if (name === 'search')
    result = await searchBusinessContext(
      db,
      principal,
      String(args.query),
      typeof args.project_id === 'string' ? args.project_id : null,
      Number(args.limit),
      origin,
    );
  else if (name === 'fetch')
    result = await fetchRecord(db, principal, String(args.id), origin, documentMaxBytes);
  else if (name === 'get_project_business_context')
    result = await projectBusinessContext(
      db,
      principal,
      String(args.project_id),
      Array.isArray(args.sections) ? args.sections : undefined,
    );
  else {
    const project = await authorizeProject(db, principal, String(args.project_id));
    const authorized = { workspaceId: project.workspace_id, projectId: project.id };
    const evidence =
      name === 'read_site_pages' || name === 'read_site_links'
        ? await readSiteEvidence(db, authorized, name, args)
        : await readEvidence(db, authorized, name, args);
    // Every project read names its scope and applicability; a tool's own values win.
    result = {
      project_id: project.id,
      applicability: readApplicability(name, evidence),
      ...evidence,
    };
  }
  // Dates serialize as ISO instants, then every tool returns its declared JSON
  // object contract. An invalid persisted projection fails here on the server.
  return output.parse(JSON.parse(JSON.stringify(result)));
}
