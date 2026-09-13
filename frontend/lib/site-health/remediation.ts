/**
 * Where a Site Health finding goes to get fixed.
 *
 * Every issue the product reports must name one next action. A catalog that
 * lists two hundred failures and offers nothing but a description is a list of
 * complaints; the reader's question is always "so what do I do", and the answer
 * differs by what the check is actually about:
 *
 *   - `content`  — a Content draft can write the fix (a title, a meta
 *                  description). These open the Site Health → Content hand-off
 *                  with the failing page already selected.
 *   - `agent`    — the fix is a judgement about what the page SAYS (missing
 *                  answers, absent evidence, no attribution). The Growth Agent
 *                  can plan it against the saved crawl evidence.
 *   - `code`     — the fix is a template, markup, header or config change.
 *                  Nothing in the product can apply it; the reader gets the
 *                  exact instruction to hand a developer.
 *
 * THE BACKEND DECIDES. `remediation_route` is derived there from each rule's
 * own dimension, category and scope and is carried on every issue row and
 * failing check. A hand-kept list of rule ids in this file was a guess that was
 * already wrong — it sent `architecture.duplicate_metadata_in_page_kind`, a
 * cluster-scope technical finding, to the editorial agent, and it could not
 * tell `aeo.heading_hierarchy` (a writer's section structure) from
 * `web.accessibility_heading_order` (document markup) because both are named
 * "heading". Read the field; never re-derive it here.
 */

export type RemediationRoute = 'content' | 'agent' | 'code';

const ROUTES: ReadonlySet<string> = new Set<RemediationRoute>(['content', 'agent', 'code']);

/**
 * Narrow a server-supplied route.
 *
 * An unrecognised value means this client is older than the catalog that
 * produced it. `code` is the safe answer: it hands the reader the instruction
 * rather than offering an automated fix the backend may not honour.
 */
export function remediationRoute(route: string | undefined): RemediationRoute {
  return route !== undefined && ROUTES.has(route) ? (route as RemediationRoute) : 'code';
}

/**
 * The Content hand-off destination for one failing page.
 *
 * Deliberately omits `source_analysis_id`: terminalization appends a new
 * current analysis, so a revision id captured when the link was rendered names
 * a superseded row. The crawl and the URL identify the page; the server
 * resolves its current terminal analysis itself.
 *
 * `ruleIds` must already be the checks the SERVER routed to `content` — the
 * hand-off endpoint authorizes against that same catalog, so anything else is
 * a link that 404s.
 */
export function contentHandoffHref(input: {
  projectId: string;
  crawlId: string;
  siteUrlId: string;
  ruleIds: readonly string[];
}): string | null {
  if (input.ruleIds.length === 0) return null;
  const params = new URLSearchParams({
    project_id: input.projectId,
    site_health_crawl_id: input.crawlId,
    site_url_id: input.siteUrlId,
    dimension: 'metadata',
  });
  for (const ruleId of input.ruleIds) params.append('checkpoint_ids', ruleId);
  return `/content?${params.toString()}`;
}
