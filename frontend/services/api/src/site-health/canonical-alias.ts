/**
 * Discovery-time canonical aliases: a fetched, system-selected page whose
 * declared canonical names another active page of this crawl is excluded
 * rather than analyzed twice. The whole-crawl alias graph (cycles,
 * representatives) is resolved again at finalization.
 */
import { getDomain } from 'tldts';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { deactivateSystemMemberships } from './frontier.ts';
import type { Crawl } from './task-fence.ts';
import { inScope } from './url-admission.ts';
import { canonicalIdentity } from './url-identity.ts';

function targetHash(crawl: Crawl, hash: string, declared: string, base: string) {
  if (!declared.trim()) return '';
  const configured = record(crawl.configuration).root_registrable_domain;
  let root = typeof configured === 'string' ? configured : '';
  let target: { url: string; hash: string };
  try {
    root ||= getDomain(new URL(crawl.root_url).hostname) ?? '';
    target = canonicalIdentity(declared.trim(), base);
  } catch {
    return '';
  }
  if (target.hash === hash || !root || !inScope(target.url, root)) return '';
  return target.hash;
}

/** The hash this page aliases when it is a system-managed member and its target is an active one. */
export async function duplicateOf(
  trx: Database,
  crawl: Crawl,
  page: { hash: string; declaredCanonical: string; baseUrl: string },
) {
  const target = targetHash(crawl, page.hash, page.declaredCanonical, page.baseUrl);
  if (!target) return '';
  const rows = await trx
    .selectFrom('site_urls as u')
    .innerJoin('site_url_observations as o', (join) =>
      join
        .onRef('o.site_url_id', '=', 'u.id')
        .onRef('o.workspace_id', '=', 'u.workspace_id')
        .onRef('o.project_id', '=', 'u.project_id')
        .on('o.crawl_id', '=', crawl.id),
    )
    .innerJoin('monitored_site_urls as m', (join) =>
      join
        .onRef('m.site_url_id', '=', 'u.id')
        .onRef('m.workspace_id', '=', 'u.workspace_id')
        .onRef('m.project_id', '=', 'u.project_id'),
    )
    .select(['u.url_hash', 'm.active', 'm.selection_source'])
    .distinct()
    .where('u.workspace_id', '=', crawl.workspace_id)
    .where('u.project_id', '=', crawl.project_id)
    .where('u.url_hash', 'in', [page.hash, target])
    .execute();
  const source = rows.find((row) => row.url_hash === page.hash);
  const destination = rows.find((row) => row.url_hash === target);
  if (!source?.active || source.selection_source === 'user') return '';
  return destination?.active ? target : '';
}

/** Exclude one fetched alias, release its system membership and retire its current analysis. */
export async function markDuplicate(trx: Database, crawl: Crawl, hash: string) {
  const url = await trx
    .updateTable('site_urls')
    .set({
      corpus_disposition: 'exclude',
      disposition_reason: policy.site_health.crawl.exclusions.duplicate,
      disposition_version: policy.site_health.crawl.disposition_version,
    })
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('url_hash', '=', hash)
    .returning('id')
    .executeTakeFirst();
  if (!url) return;
  await deactivateSystemMemberships(trx, crawl, [url.id]);
  await trx
    .updateTable('site_page_analyses')
    .set({ is_current: false })
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('crawl_id', '=', crawl.id)
    .where('site_url_id', '=', url.id)
    .where('is_current', '=', true)
    .execute();
}
