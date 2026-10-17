/**
 * A recrawl reruns an earlier crawl's frozen scope and settings, so Changes
 * always has a comparable baseline. It goes through ordinary crawl admission:
 * plan grants, fetch budgets and the one-active-crawl rule are unchanged.
 */
import type { Database } from '../db/database.ts';
import { jsonObject, strings } from '../db/json.ts';
import { createCrawlRequest, type CreateCrawlRequest } from './planner-policy.ts';
import { loadCrawl } from './reads/crawl.ts';

export async function recrawlRequest(
  db: Database,
  workspaceId: string,
  crawlId: string,
): Promise<CreateCrawlRequest> {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  const frozen = jsonObject(crawl.configuration, 'site_crawls.configuration');
  // The same random seed draws the same sample, so a sampled crawl compares too.
  return createCrawlRequest.parse({
    project_id: crawl.project_id,
    include_globs: strings(frozen.include_globs),
    exclude_globs: strings(frozen.exclude_globs),
    input_mode: frozen.input_mode,
    requested_page_limit: frozen.requested_page_limit,
    seed_urls: strings(frozen.seed_urls),
    page_kinds: strings(frozen.page_kinds),
    seed: crawl.random_seed,
  });
}
