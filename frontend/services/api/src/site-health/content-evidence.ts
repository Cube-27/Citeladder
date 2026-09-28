import {
  contentPageSchema,
  contentPassageSchema,
  type ContentPage,
} from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';

export type ContentScope = { workspaceId: string; projectId: string };
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Keep query identity; only fragments are irrelevant to a page-level edge. */
export function linkUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function contentLinks(facts: Record<string, unknown>, complete: boolean, url: string) {
  const anchors = record(facts.links).anchors;
  const contextual = new Set<string>();
  const navigation = new Set<string>();
  for (const raw of Array.isArray(anchors) ? anchors : []) {
    const anchor = record(raw);
    if (anchor.is_internal !== true) continue;
    const target = linkUrl(text(anchor.url), url);
    if (!target) continue;
    if (anchor.region === 'main') contextual.add(target);
    else if (['nav', 'header', 'footer', 'aside'].includes(text(anchor.region)))
      navigation.add(target);
    else complete = false;
  }
  return {
    contextual_targets: [...contextual],
    navigation_targets: [...navigation],
    links_complete: complete,
  };
}

function pageEvidence(
  facts: Record<string, unknown>,
  content: Record<string, unknown>,
  url: string,
) {
  const links = contentLinks(facts, content.links_complete === true, url);
  const passages = contentPassageSchema.array().safeParse(content.passages);
  const headings = Array.isArray(facts.primary_heading_outline)
    ? facts.primary_heading_outline
    : [];
  return {
    omittedPassages: !links.links_complete || !passages.success ? 1 : 0,
    evidence: {
      ...links,
      title: text(facts.title),
      excerpt: text(facts.primary_content_text).slice(
        0,
        policy.content_structure.max_excerpt_chars,
      ),
      headings: headings
        .map((heading) => (typeof heading === 'string' ? heading : text(record(heading).text)))
        .filter(Boolean),
      passages: passages.success ? passages.data : [],
      extractor_version: text(facts.extractor_version),
    },
  };
}

export async function loadContentPages(db: Database, scope: ContentScope, crawlId: string) {
  const query = db
    .selectFrom('site_page_analyses as analysis')
    .innerJoin('site_fetch_artifacts as artifact', 'artifact.id', 'analysis.artifact_id')
    .innerJoin('site_urls as url', 'url.id', 'analysis.site_url_id')
    .where('analysis.workspace_id', '=', scope.workspaceId)
    .where('analysis.project_id', '=', scope.projectId)
    .where('analysis.crawl_id', '=', crawlId)
    .where('artifact.workspace_id', '=', scope.workspaceId)
    .where('artifact.crawl_id', '=', crawlId)
    .where('url.workspace_id', '=', scope.workspaceId)
    .where('url.project_id', '=', scope.projectId)
    .where('analysis.is_current', '=', true)
    .where('analysis.finalized_at', 'is not', null);
  const total = await query
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow();
  const rows = await query
    .select([
      'analysis.id',
      'analysis.artifact_id',
      'analysis.site_url_id',
      'analysis.main_content_indexable',
      'artifact.normalized_facts',
      'artifact.final_url',
      'url.normalized_url',
    ])
    .orderBy('url.normalized_url')
    .limit(policy.content_structure.max_pages)
    .execute();
  const pages: ContentPage[] = [];
  let omittedPassages = 0;
  const urls = new Set<string>();
  for (const row of rows) {
    const facts = record(row.normalized_facts);
    const extraction = record(facts.extraction);
    const content = record(facts.content_structure);
    if (
      extraction.state !== 'available' ||
      extraction.truncated ||
      content.version !== policy.content_structure.version
    )
      continue;
    omittedPassages += typeof content.omitted_passages === 'number' ? content.omitted_passages : 0;
    if (facts.primary_content_truncated === true) omittedPassages += 1;
    const url = linkUrl(row.final_url || row.normalized_url, row.normalized_url);
    if (!url || urls.has(url)) continue;
    urls.add(url);
    const captured = pageEvidence(facts, content, url);
    omittedPassages += captured.omittedPassages;
    pages.push(
      contentPageSchema.parse({
        analysis_id: row.id,
        artifact_id: row.artifact_id,
        site_url_id: row.site_url_id,
        url,
        ...captured.evidence,
        eligible_target: row.main_content_indexable === true,
      }),
    );
  }
  return { pages, omittedPassages, omittedPages: Number(total.count) - pages.length };
}
