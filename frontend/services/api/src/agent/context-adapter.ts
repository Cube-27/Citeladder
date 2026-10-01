/** Agent context orchestrates existing persisted owners, never acquisition. */
import { agentContextRefsSchema } from '@citeladder/contracts/agent';
import { policy } from '../config.ts';
import { record } from '../db/json.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError } from '../errors.ts';
import { readBrandMemory } from '../projects/brand-profile.ts';
import { readDemandOrigin } from '../demand/reads.ts';
import { getOpportunity } from '../opportunities/reads.ts';
import { contentHandoff as siteHandoff } from '../site-health/reads/content-handoff.ts';
import { contentHandoff as searchHandoff } from '../search-intelligence/reads.ts';
import { comparableUrl, selectContentFragments } from '../site-health/reads/content-fragments.ts';
import type { ContextReader } from './context.ts';
import { AgentError } from './contracts.ts';
import { z } from 'zod';

const block = (label: string, value: unknown) =>
  value ? `${label}\n${JSON.stringify(value)}` : '';
function owned(candidate: unknown, website: string) {
  if (typeof candidate !== 'string' || !candidate) return '';
  try {
    return new URL(candidate).hostname.toLowerCase() === new URL(website).hostname.toLowerCase()
      ? candidate
      : '';
  } catch {
    return '';
  }
}
export const readAgentContext: ContextReader = async (db, scope, raw, request) => {
  try {
    const refs = agentContextRefsSchema.parse(raw);
    const project = await db
      .selectFrom('projects')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', '=', scope.projectId)
      .executeTakeFirst();
    if (!project) throw new AgentError('agent_context_unavailable');
    const target = refs.target_site_url_id
      ? await db
          .selectFrom('site_urls')
          .selectAll()
          .where('workspace_id', '=', scope.workspaceId)
          .where('project_id', '=', scope.projectId)
          .where('id', '=', refs.target_site_url_id)
          .executeTakeFirst()
      : null;
    if (refs.target_site_url_id && !target) throw new AgentError('agent_context_unavailable');
    const opportunity = refs.opportunity_id
      ? await getOpportunity(db, scope.workspaceId, refs.opportunity_id)
      : null;
    if (opportunity && opportunity.project_id !== scope.projectId)
      throw new AgentError('agent_context_unavailable');
    const demand = refs.demand_signal_id
      ? await readDemandOrigin(db, scope, refs.demand_signal_id)
      : null;
    const site = refs.site_health_reference
      ? await siteHandoff(db, scope, refs.site_health_reference)
      : null;
    if (target && site && target.id !== site.site_url_id)
      throw new AgentError('agent_context_conflict');
    const search = refs.search_intelligence_reference
      ? await searchHandoff(
          db,
          { workspace: new WorkspaceScope(scope.workspaceId), projectId: scope.projectId },
          refs.search_intelligence_reference.dataset_id,
          refs.search_intelligence_reference.row_ids,
        )
      : null;
    const targetUrl =
      target?.normalized_url ||
      refs.target_url?.trim() ||
      site?.normalized_url ||
      owned(opportunity?.target_url, project.website_url) ||
      owned(demand?.signal.page_url, project.website_url) ||
      '';
    const query = [request, opportunity?.target_theme, demand?.signal.topic_cluster]
      .filter(Boolean)
      .join(' ');
    const selection = await selectContentFragments(db, scope, query, targetUrl);
    const targetPage = selection.pages.find(
      (page) =>
        page.site_url_id === target?.id ||
        (targetUrl && comparableUrl(page.final_url) === comparableUrl(targetUrl)),
    );
    const related = selection.pages.filter((page) => page !== targetPage);
    const memory = await readBrandMemory(db, scope);
    const aliases = await db
      .selectFrom('brand_aliases as a')
      .innerJoin('brands as b', 'b.id', 'a.brand_id')
      .innerJoin('projects as p', 'p.id', 'b.project_id')
      .select('a.alias')
      .where('p.workspace_id', '=', scope.workspaceId)
      .where('p.id', '=', scope.projectId)
      .orderBy('a.created_at')
      .execute();
    const competitors = await db
      .selectFrom('competitors as c')
      .innerJoin('projects as p', 'p.id', 'c.project_id')
      .select('c.name')
      .where('p.workspace_id', '=', scope.workspaceId)
      .where('p.id', '=', scope.projectId)
      .orderBy('c.created_at')
      .execute();
    const brand = {
      name: project.brand_name || project.name,
      website: project.website_url,
      country_code: project.country_code,
      primary_market: project.primary_market,
      language_code: project.language_code,
      aliases: aliases.map((row) => row.alias),
      competitors: competitors.map((row) => row.name),
      memory,
    };
    const evidence = [
      block('OPPORTUNITY EVIDENCE', opportunity),
      block('DEMAND EVIDENCE', demand),
      block('SITE HEALTH EVIDENCE', site),
      block('SEARCH INTELLIGENCE EVIDENCE', search),
    ].filter(Boolean);
    return {
      version: policy.agent_context.content_context_version,
      brand_block: block('BRAND', brand),
      target_page_block: block(
        'TARGET PAGE',
        targetPage ?? (targetUrl ? { url: targetUrl, state: 'unavailable' } : null),
      ),
      related_site_block: related.length ? block('RELATED SITE CONTEXT', related) : '',
      issue_block: evidence.join('\n\n'),
      summary: z.record(z.string(), z.json()).parse(
        JSON.parse(
          JSON.stringify({
            ...record(selection.summary),
            brand_memory: memory !== null,
            brand_fields: memory ? Object.keys(memory.business_context) : [],
            target_page: targetPage?.title || targetUrl,
            target_url: targetUrl || null,
            related_page_count: related.length,
            crawl_page_count: selection.pages.length,
            crawl_urls: selection.pages.map((page) => page.final_url),
            issue_count: evidence.length,
            opportunity_id: opportunity?.id ?? null,
            demand_signal_id: demand?.signal.id ?? null,
            demand_snapshot_id: demand?.snapshot.id ?? null,
            site_health_reference: site ?? null,
            search_intelligence_reference: search ?? null,
          }),
        ),
      ),
    };
  } catch (error) {
    if (error instanceof ApiError && [404, 422].includes(error.status))
      throw new AgentError('agent_context_unavailable');
    throw error;
  }
};
