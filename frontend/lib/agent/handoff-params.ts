import type { AgentContextRefs } from '@citeladder/contracts/agent';

import { HANDOFF_URLS_MAX, PARAM, type AgentHandoff } from '@/lib/agent/handoff';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value && UUID.test(value) ? value : undefined;
}
function parsedOriginContext(params: URLSearchParams): AgentContextRefs {
  const context: AgentContextRefs = {};
  const issueCrawl = uuidParam(params, PARAM.issueCrawl),
    issueGroup = uuidParam(params, PARAM.issueGroup),
    issuePage = uuidParam(params, PARAM.issuePage);
  if (issueCrawl && issueGroup)
    context.issue_group_reference = {
      crawl_id: issueCrawl,
      group_id: issueGroup,
      ...(issuePage ? { site_url_id: issuePage } : {}),
    };
  const factsCrawl = uuidParam(params, PARAM.factsCrawl);
  if (factsCrawl) context.site_facts_reference = { crawl_id: factsCrawl };
  const output = uuidParam(params, PARAM.output),
    revision = uuidParam(params, PARAM.revision);
  if (output && revision)
    context.output_revision_reference = { output_id: output, revision_id: revision };
  const ticked = [...new Set(params.getAll(PARAM.actionUrls).filter((id) => UUID.test(id)))];
  if (ticked.length > 0 && uuidParam(params, PARAM.action))
    context.action_url_ids = ticked.slice(0, HANDOFF_URLS_MAX);
  const urlActions = uuidParam(params, PARAM.urlActions);
  if (urlActions) context.url_actions_reference = { site_url_id: urlActions };
  const objection = uuidParam(params, PARAM.objection);
  if (objection) context.objection_group_id = objection;
  return context;
}

function httpUrlParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function catalogIdParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : undefined;
}

export function parseAgentHandoff(params: URLSearchParams): AgentHandoff {
  const context = parsedOriginContext(params);
  const opportunity = uuidParam(params, PARAM.opportunity);
  if (opportunity) context.opportunity_id = opportunity;
  const signal = uuidParam(params, PARAM.demandSignal);
  if (signal) context.demand_signal_id = signal;
  const siteUrl = uuidParam(params, PARAM.siteUrl);
  if (siteUrl) context.target_site_url_id = siteUrl;
  const targetUrl = httpUrlParam(params, PARAM.targetUrl);
  if (targetUrl) context.target_url = targetUrl;
  const dataset = uuidParam(params, PARAM.dataset);
  const rows = [...new Set(params.getAll(PARAM.rows).filter((row) => UUID.test(row)))];
  if (dataset && rows.length > 0) {
    context.search_intelligence_reference = { dataset_id: dataset, row_ids: rows };
  }
  const prompt = params.get(PARAM.prompt)?.trim() || undefined;
  const skillId = catalogIdParam(params, PARAM.skill);
  const workflowId = catalogIdParam(params, PARAM.workflow);
  return {
    actionId: uuidParam(params, PARAM.action),
    context,
    prompt,
    ...(skillId ? { skillId } : {}),
    ...(workflowId ? { workflowId } : {}),
  };
}
