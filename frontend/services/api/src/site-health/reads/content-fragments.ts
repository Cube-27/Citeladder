/** Bounded lexical selection over persisted crawl evidence; no acquisition. */
import { sql } from 'kysely';
import { policy } from '../../config.ts';
import type { Database } from '../../db/database.ts';
import { record, strings } from '../../db/json.ts';
import { lexicalTokens } from '../../analysis/lexical.ts';
import { compareText, scalarText, stripTrailing } from '../../text-order.ts';
import type { Scope } from '../../opportunities/sources.ts';

const p = policy.agent_context;
export const comparableUrl = (value: string) =>
  stripTrailing(
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//u, ''),
    '/',
  );
function clean(value: unknown, cap = p.content_context_field_max_chars) {
  return [...scalarText(value)]
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return code > 159 || (code > 31 && code < 127) || code === 9 || code === 10;
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, cap);
}
function pagesQuery(db: Database, scope: Scope) {
  return db
    .selectFrom('site_page_analyses as a')
    .innerJoin('site_fetch_artifacts as f', (join) =>
      join
        .onRef('f.id', '=', 'a.artifact_id')
        .onRef('f.workspace_id', '=', 'a.workspace_id')
        .onRef('f.crawl_id', '=', 'a.crawl_id'),
    )
    .innerJoin('site_urls as u', (join) =>
      join
        .onRef('u.id', '=', 'a.site_url_id')
        .onRef('u.workspace_id', '=', 'a.workspace_id')
        .onRef('u.project_id', '=', 'a.project_id'),
    )
    .where('a.workspace_id', '=', scope.workspaceId)
    .where('a.project_id', '=', scope.projectId)
    .where('a.is_current', '=', true)
    .where('a.finalized_at', 'is not', null)
    .where(
      sql<boolean>`jsonb_typeof(f.normalized_facts) = 'object' and f.normalized_facts <> '{}'::jsonb`,
    );
}
type PageRow = Awaited<ReturnType<typeof rows>>[number];
function rows(db: Database, scope: Scope, crawlId: string) {
  return pagesQuery(db, scope)
    .where('a.crawl_id', '=', crawlId)
    .select([
      'u.id as site_url_id',
      'u.normalized_url',
      'a.page_kind',
      'a.id as analysis_id',
      'a.analyzer_version',
      'a.classifier_version',
      'a.scoring_version',
      'f.id as artifact_id',
      'f.final_url',
      'f.normalized_facts',
      'f.content_hash',
      'f.fetched_at',
      'f.extractor_version',
    ])
    .execute();
}
function pageBlock(row: PageRow) {
  const facts = record(row.normalized_facts),
    headings = record(facts.headings);
  return {
    site_url_id: row.site_url_id,
    page_kind: row.page_kind,
    structured_data_types: strings(record(facts.structured_data).types).map((value) =>
      clean(value),
    ),
    final_url: clean(row.final_url || row.normalized_url),
    title: clean(facts.title),
    meta_description: clean(facts.meta_description),
    h1: strings(headings.h1_texts)
      .slice(0, p.context_max_h1)
      .map((value) => clean(value)),
    h2: strings(headings.h2_texts)
      .slice(0, p.context_max_h2)
      .map((value) => clean(value)),
    body_text: clean(record(facts.body).text, p.content_context_per_page_body_chars),
  };
}
function score(row: PageRow, terms: Set<string>, target: string, monitored: Set<string>) {
  if (
    target &&
    [row.final_url ?? '', row.normalized_url].some((url) => comparableUrl(url) === target)
  )
    return p.content_score_target_url;
  const facts = record(row.normalized_facts),
    headings = record(facts.headings);
  const overlap = (value: unknown) =>
    [...lexicalTokens(scalarText(value), 3)].filter((term) => terms.has(term)).length;
  return (
    p.content_score_title * overlap(facts.title) +
    p.content_score_h1 * overlap(strings(headings.h1_texts).join(' ')) +
    p.content_score_h2 * overlap(strings(headings.h2_texts).join(' ')) +
    p.content_score_url * overlap(row.normalized_url) +
    p.content_score_body *
      overlap(scalarText(record(facts.body).text).slice(0, p.content_context_per_page_body_chars)) +
    (monitored.has(row.site_url_id) ? p.content_score_monitored : 0)
  );
}
function projection(ordered: PageRow[]) {
  const pages: ReturnType<typeof pageBlock>[] = [],
    provenance: Record<string, unknown>[] = [],
    omissions: { reason: string; count: number }[] = [];
  let charCount = 0,
    skipped = 0;
  for (const [index, row] of ordered.entries()) {
    if (pages.length >= p.content_context_max_pages) {
      omissions.push({ reason: 'page_limit', count: ordered.length - index });
      break;
    }
    const page = pageBlock(row);
    const size = Object.values(page).reduce(
      (sum, value) => sum + (Array.isArray(value) ? value.join('').length : value.length),
      0,
    );
    if (charCount + size > p.content_context_max_chars) {
      skipped++;
      continue;
    }
    charCount += size;
    pages.push(page);
    provenance.push({
      site_url_id: row.site_url_id,
      analysis_id: row.analysis_id,
      artifact_id: row.artifact_id,
      content_hash: row.content_hash,
      fetched_at: row.fetched_at?.toISOString() ?? null,
      extractor_version: row.extractor_version,
      analyzer_version: row.analyzer_version,
      classifier_version: row.classifier_version,
      scoring_version: row.scoring_version,
    });
  }
  if (skipped) omissions.push({ reason: 'character_budget', count: skipped });
  return {
    pages,
    summary: {
      page_count: pages.length,
      char_count: charCount,
      provenance,
      omissions,
      site_url_ids: provenance.map((row) => row.site_url_id),
      artifact_ids: provenance.map((row) => row.artifact_id),
      selection_policy_version: p.content_crawl_fragment_selection_version,
    },
  };
}
export async function selectContentFragments(
  db: Database,
  scope: Scope,
  query = '',
  targetUrl = '',
) {
  const crawl = await db
    .selectFrom('site_crawls as c')
    .select(['c.id', 'c.completed_at'])
    .where('c.workspace_id', '=', scope.workspaceId)
    .where('c.project_id', '=', scope.projectId)
    .where('c.status', 'in', policy.site_health.reads.terminal_crawl_statuses)
    .where((eb) =>
      eb.exists(
        pagesQuery(db, scope)
          .select('a.id')
          .where('a.crawl_id', '=', sql<string>`c.id`),
      ),
    )
    .orderBy('c.created_at', 'desc')
    .orderBy('c.id', 'desc')
    .executeTakeFirst();
  if (!crawl)
    return {
      pages: [],
      summary: {
        omissions: [{ reason: 'no_usable_crawl' }],
        selection_policy_version: p.content_crawl_fragment_selection_version,
      },
    };
  const profile = await db
    .selectFrom('site_health_profiles')
    .select(['root_url', 'root_host'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  const monitored = new Set(
    (
      await db
        .selectFrom('monitored_site_urls')
        .select('site_url_id')
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('active', '=', true)
        .execute()
    ).map((row) => row.site_url_id),
  );
  const terms = lexicalTokens(query, 3),
    target = comparableUrl(targetUrl),
    candidates = await rows(db, scope, crawl.id);
  const home = (row: PageRow) =>
    comparableUrl(row.normalized_url) === comparableUrl(profile?.root_url ?? '') ||
    comparableUrl(row.normalized_url) === (profile?.root_host ?? '');
  const tier = (row: PageRow) => {
    if (home(row)) return 0;
    return monitored.has(row.site_url_id) ? 1 : 2;
  };
  const background = (row: PageRow) =>
    home(row) &&
    !(
      target &&
      [row.final_url ?? '', row.normalized_url].some((url) => comparableUrl(url) === target)
    );
  candidates.sort(
    (a, b) =>
      (terms.size || target
        ? Number(background(a)) - Number(background(b)) ||
          score(b, terms, target, monitored) - score(a, terms, target, monitored)
        : tier(a) - tier(b)) ||
      compareText(a.normalized_url, b.normalized_url) ||
      compareText(a.site_url_id, b.site_url_id),
  );
  const result = projection(candidates);
  return {
    pages: result.pages,
    summary: {
      ...result.summary,
      crawl_id: crawl.id,
      crawl_completed_at: crawl.completed_at?.toISOString() ?? null,
    },
  };
}
