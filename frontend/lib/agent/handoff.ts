/**
 * Evidence-screen handoffs into the Agent.
 *
 * **Work on this** opens New chat attached to an Action. **Ask agent** opens
 * New chat with typed evidence references and an optional prefilled question.
 * The URL carries identifiers only: the server resolves and authorizes each
 * one when the chat is created, so a tampered or stale id fails there, never
 * here. Parsing drops anything malformed rather than guessing.
 */
import type { AgentContextRefs } from '@/lib/api/agent';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PARAM = {
  action: 'action_id',
  opportunity: 'opportunity_id',
  demandSignal: 'demand_signal_id',
  siteUrl: 'target_site_url_id',
  targetUrl: 'target_url',
  dataset: 'si_dataset_id',
  rows: 'si_row_id',
  prompt: 'prompt',
} as const;

export type AgentHandoff = {
  actionId?: string;
  context: AgentContextRefs;
  prompt?: string;
};

type HandoffInput = {
  actionId?: string | null;
  opportunityId?: string | null;
  demandSignalId?: string | null;
  siteUrlId?: string | null;
  targetUrl?: string | null;
  searchIntelligence?: { datasetId: string; rowIds: readonly string[] } | null;
  prompt?: string | null;
};

/** `/agent` with the typed references a new chat should start from. */
export function agentHandoffHref(input: HandoffInput): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null | undefined) => {
    if (value) params.set(key, value);
  };
  set(PARAM.action, input.actionId);
  set(PARAM.opportunity, input.opportunityId);
  set(PARAM.demandSignal, input.demandSignalId);
  set(PARAM.siteUrl, input.siteUrlId);
  set(PARAM.targetUrl, input.targetUrl);
  if (input.searchIntelligence && input.searchIntelligence.rowIds.length > 0) {
    params.set(PARAM.dataset, input.searchIntelligence.datasetId);
    for (const row of input.searchIntelligence.rowIds) params.append(PARAM.rows, row);
  }
  set(PARAM.prompt, input.prompt?.trim());
  const query = params.toString();
  return query ? `/agent?${query}` : '/agent';
}

function uuidParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value && UUID.test(value) ? value : undefined;
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

/** The handoff a New chat URL carries, with malformed values dropped. */
export function parseAgentHandoff(params: URLSearchParams): AgentHandoff {
  const context: AgentContextRefs = {};
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
  return { actionId: uuidParam(params, PARAM.action), context, prompt };
}

/** Human labels for the references a composer shows as removable chips. */
export type ContextChip = { key: keyof AgentContextRefs; label: string };

export function contextChips(context: AgentContextRefs): ContextChip[] {
  const chips: ContextChip[] = [];
  if (context.target_url) chips.push({ key: 'target_url', label: context.target_url });
  else if (context.target_site_url_id)
    chips.push({ key: 'target_site_url_id', label: 'Selected page' });
  if (context.opportunity_id) chips.push({ key: 'opportunity_id', label: 'Recommendation' });
  if (context.demand_signal_id) chips.push({ key: 'demand_signal_id', label: 'Demand signal' });
  if (context.search_intelligence_reference) {
    const count = context.search_intelligence_reference.row_ids.length;
    chips.push({
      key: 'search_intelligence_reference',
      label: `${count} Search Intelligence ${count === 1 ? 'row' : 'rows'}`,
    });
  }
  return chips;
}

export function withoutContext(
  context: AgentContextRefs,
  key: keyof AgentContextRefs,
): AgentContextRefs {
  const next = { ...context };
  delete next[key];
  // A URL chip and its page id describe one target; removing either drops both.
  if (key === 'target_url' || key === 'target_site_url_id') {
    delete next.target_url;
    delete next.target_site_url_id;
  }
  return next;
}
