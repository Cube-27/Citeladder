/**
 * The persisted inputs of one content-angle refresh (content optimization
 * section 1): the window's audits, the competitor and editorial pages their
 * answers cited, the owned pages they cited, and the latest crawl's content
 * pages. Reads only; every query is scoped to the workspace and project.
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { utcTextOf } from '../db/timestamps.ts';
import { hash } from '../crypto-text.ts';
import { chunked, groupBy } from '../lists.ts';
import { resolveAudit, resolveCrawl, type Scope } from '../opportunities/sources.ts';
import { canonicalPage } from '../page-identity.ts';
import { ownedFacts } from '../source-pages/differentiation.ts';
import { compareText, scalarText } from '../text-order.ts';

const p = policy.content_optimization;
const visibility = policy.visibility;

/** One citation of a URL, with the prompt and engine of the answer that made it. */
type CitationRef = { id: string; promptId: string | null; engine: string };

/** One cited competitor or editorial URL under one prompt topic (null: topicless prompts). */
export type CitedUrl = {
  topicId: string | null;
  canonicalUrl: string;
  urlHash: string;
  title: string;
  /** The title was empty in every citation, so it is the URL's path slug. */
  titleFromSlug: boolean;
  domain: string;
  classification: string;
  matchedCompetitor: string | null;
  sourceClass: string | null;
  citations: CitationRef[];
};

/** One owned URL cited in the window, with each citation's prompt. */
export type OwnedCitation = { canonicalUrl: string; citations: CitationRef[] };

/** A content page of the latest crawl, as the prefilter and the model read it. */
export type CandidatePage = {
  siteUrlId: string;
  canonicalUrl: string;
  title: string;
  headings: string[];
  excerpt: string;
};

export type Limitation =
  | { code: 'topicless_prompts'; count: number; total: number }
  | { code: 'empty_titles'; count: number; total: number }
  | { code: 'too_few_citations'; topics: number }
  | { code: 'urls_truncated'; topics: number; dropped: number }
  | { code: 'no_gap_citations' }
  | { code: 'no_content_crawl' };

/** The newest dashboard-ready brand audit of the default market, and the window it anchors. */
export type Anchor = {
  auditId: string;
  /** UTC text with microseconds (`utcText`), so the anchor itself is never cut out. */
  windowStart: string;
  windowEnd: string;
};

export type AngleInputs = {
  audits: { anchor: Anchor; ids: string[] };
  market: { country: string; language: string };
  crawlId: string | null;
  external: CitedUrl[];
  owned: OwnedCitation[];
  contentPages: CandidatePage[];
  limitations: Limitation[];
};

/** The anchor audit and its window, or null when the project has no dashboard-ready audit. */
export async function resolveAnchor(db: Database, scope: Scope): Promise<Anchor | null> {
  const audit = await resolveAudit(db, scope);
  if (audit === null) return null;
  const observed = sql`coalesce(completed_at, created_at)`;
  const row = await db
    .selectFrom('audits')
    .select([
      utcTextOf(observed).as('end_text'),
      utcTextOf(sql`(${observed} - make_interval(days => ${p.window_days}::integer))`).as(
        'start_text',
      ),
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('id', '=', audit.id)
    .executeTakeFirstOrThrow();
  return { auditId: audit.id, windowStart: row.start_text, windowEnd: row.end_text };
}

/** The path slug a page with no title is named by. */
function slugTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split('/').findLast(Boolean);
    const text = segment
      ? decodeURIComponent(segment)
          .replace(/\.[a-z0-9]{1,5}$/iu, '')
          .replaceAll(/[-_+]+/gu, ' ')
          .trim()
      : '';
    return text || parsed.hostname;
  } catch {
    return url;
  }
}

/** The most frequent non-empty title, ties in text order; '' when every title is empty. */
function commonTitle(titles: string[]): string {
  const counts = new Map<string, number>();
  for (const title of titles.map((value) => value.trim()).filter(Boolean))
    counts.set(title, (counts.get(title) ?? 0) + 1);
  return (
    [...counts].sort(([a, ca], [b, cb]) => cb - ca || compareText(a, b)).map(([t]) => t)[0] ?? ''
  );
}

const isGapSource = (row: { classification: string; source_class: string | null }) =>
  (p.gap_sources.classifications as readonly string[]).includes(row.classification) ||
  (row.source_class !== null &&
    (p.gap_sources.source_classes as readonly string[]).includes(row.source_class));

async function windowAuditIds(db: Database, scope: Scope, anchor: Anchor) {
  const rows = await db
    .selectFrom('audits')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('audit_scope', '=', visibility.brand_audit_scope)
    .where('market_id', 'is', null)
    .where('status', 'in', visibility.dashboard_audit_statuses)
    .where(
      sql`coalesce(completed_at, created_at)`,
      '>=',
      sql`${anchor.windowStart + 'Z'}::timestamptz`,
    )
    .where(
      sql`coalesce(completed_at, created_at)`,
      '<=',
      sql`${anchor.windowEnd + 'Z'}::timestamptz`,
    )
    .orderBy('id')
    .execute();
  return rows.map((row) => row.id);
}

function citationRows(db: Database, scope: Scope, auditIds: string[]) {
  return chunked(auditIds, (chunk) =>
    db
      .selectFrom('citations as c')
      .innerJoin('response_analyses as ra', 'ra.id', 'c.analysis_id')
      .innerJoin('audit_tasks as task', 'task.id', 'ra.task_id')
      .innerJoin('audit_prompt_snapshots as snapshot', 'snapshot.id', 'task.prompt_snapshot_id')
      .leftJoin('prompts as prompt', (join) =>
        join
          .onRef('prompt.id', '=', 'snapshot.prompt_id')
          .on('prompt.workspace_id', '=', scope.workspaceId),
      )
      .select([
        'c.id',
        'c.url',
        'c.canonical_url',
        'c.url_hash',
        'c.title',
        'c.domain',
        'c.classification',
        'c.source_class',
        'c.matched_competitor',
        'c.is_owned',
        'c.is_unintended',
        'ra.logical_engine as engine',
        'snapshot.id as snapshot_id',
        'snapshot.prompt_id',
        'prompt.topic_id',
      ])
      .where('c.workspace_id', '=', scope.workspaceId)
      .where('ra.workspace_id', '=', scope.workspaceId)
      .where('task.workspace_id', '=', scope.workspaceId)
      .where('task.project_id', '=', scope.projectId)
      .where('task.status', '=', visibility.succeeded_task_status)
      .where('c.audit_id', 'in', chunk)
      .orderBy('c.id')
      .execute(),
  );
}

type CitationRow = Awaited<ReturnType<typeof citationRows>>[number];

const canonicalOf = (row: CitationRow) => {
  const raw = row.canonical_url ?? row.url;
  return canonicalPage(raw) ?? raw;
};

function externalUrls(rows: CitationRow[]): CitedUrl[] {
  const groups = groupBy(rows, (row) => JSON.stringify([row.topic_id, canonicalOf(row)]));
  return [...groups.values()].map((group) => {
    const [first] = group;
    const canonicalUrl = canonicalOf(first);
    const title = commonTitle(group.map((row) => row.title));
    const competitor = group.find((row) => row.classification === 'competitor');
    const representative = competitor ?? first;
    return {
      topicId: first.topic_id,
      canonicalUrl,
      urlHash: group.find((row) => row.url_hash)?.url_hash ?? hash(canonicalUrl),
      title: title || slugTitle(canonicalUrl),
      titleFromSlug: !title,
      domain: representative.domain,
      classification: representative.classification,
      matchedCompetitor: group.find((row) => row.matched_competitor)?.matched_competitor ?? null,
      sourceClass: group.find((row) => row.source_class)?.source_class ?? null,
      citations: group.map((row) => ({ id: row.id, promptId: row.prompt_id, engine: row.engine })),
    };
  });
}

function ownedUrls(rows: CitationRow[]): OwnedCitation[] {
  return [...groupBy(rows, canonicalOf)].map(([canonicalUrl, group]) => ({
    canonicalUrl,
    citations: group.map((row) => ({ id: row.id, promptId: row.prompt_id, engine: row.engine })),
  }));
}

async function contentPages(db: Database, scope: Scope, crawlId: string): Promise<CandidatePage[]> {
  const rows = await db
    .selectFrom('site_page_analyses as analysis')
    .innerJoin('site_urls as url', 'url.id', 'analysis.site_url_id')
    .innerJoin('site_fetch_artifacts as artifact', 'artifact.id', 'analysis.artifact_id')
    .select([
      'url.id',
      'url.host',
      'url.normalized_url',
      'url.latest_title',
      'artifact.normalized_facts',
    ])
    .where('analysis.workspace_id', '=', scope.workspaceId)
    .where('analysis.project_id', '=', scope.projectId)
    .where('url.workspace_id', '=', scope.workspaceId)
    .where('url.project_id', '=', scope.projectId)
    .where('artifact.workspace_id', '=', scope.workspaceId)
    .where('analysis.crawl_id', '=', crawlId)
    .where('analysis.is_current', '=', true)
    .where('analysis.status', '=', 'completed')
    .where('analysis.page_kind', 'in', p.content_page_kinds)
    .orderBy('url.id')
    .limit(p.max_content_pages)
    .execute();
  return rows.map((row) => {
    const facts = record(row.normalized_facts);
    return {
      siteUrlId: row.id,
      canonicalUrl: canonicalPage(row.normalized_url) ?? row.normalized_url,
      title: scalarText(facts.title) || row.latest_title,
      headings: ownedFacts(row.id, row.normalized_facts, row.host).headings,
      excerpt: scalarText(facts.primary_content_text).slice(0, p.content_excerpt_chars),
    };
  });
}

/** Everything one refresh reads, anchored at `anchor`. */
export async function loadAngleInputs(
  db: Database,
  scope: Scope,
  anchor: Anchor,
): Promise<AngleInputs> {
  const [ids, project, crawl] = await Promise.all([
    windowAuditIds(db, scope, anchor),
    db
      .selectFrom('projects')
      .select(['country_code', 'language_code'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', '=', scope.projectId)
      .executeTakeFirstOrThrow(),
    resolveCrawl(db, scope),
  ]);
  const rows = await citationRows(db, scope, ids);
  const external = externalUrls(
    rows.filter((row) => !row.is_owned && !row.is_unintended && isGapSource(row)),
  );
  const limitations: Limitation[] = [];
  // A cited answer's prompt; a snapshot of a since-deleted prompt counts once, topicless.
  const prompts = new Map(rows.map((row) => [row.prompt_id ?? row.snapshot_id, row.topic_id]));
  const topicless = [...prompts.values()].filter((topic) => topic === null).length;
  if (topicless)
    limitations.push({ code: 'topicless_prompts', count: topicless, total: prompts.size });
  const untitled = external.filter((url) => url.titleFromSlug).length;
  if (untitled) limitations.push({ code: 'empty_titles', count: untitled, total: external.length });
  if (!external.length) limitations.push({ code: 'no_gap_citations' });
  if (crawl === null) limitations.push({ code: 'no_content_crawl' });
  return {
    audits: { anchor, ids },
    market: { country: project.country_code, language: project.language_code },
    crawlId: crawl?.id ?? null,
    external,
    owned: ownedUrls(rows.filter((row) => row.is_owned)),
    contentPages: crawl ? await contentPages(db, scope, crawl.id) : [],
    limitations,
  };
}
