import type { ActionHandoff } from '@citeladder/contracts/actions';
import type { AgentChatOrigin, AgentContextRefs } from '@citeladder/contracts/agent';

import { pluralCount } from '@/lib/format';

export const PARAM = {
  action: 'action_id',
  opportunity: 'opportunity_id',
  demandSignal: 'demand_signal_id',
  siteUrl: 'target_site_url_id',
  targetUrl: 'target_url',
  dataset: 'si_dataset_id',
  rows: 'si_row_id',
  prompt: 'prompt',
  skill: 'skill',
  workflow: 'workflow',
  issueCrawl: 'issue_crawl_id',
  issueGroup: 'issue_group_id',
  issuePage: 'issue_page_id',
  factsCrawl: 'facts_crawl_id',
  output: 'output_id',
  revision: 'revision_id',
  actionUrls: 'action_url_id',
  urlActions: 'url_actions_id',
  objection: 'objection_id',
} as const;

export const HANDOFF_URLS_MAX = 50;

export type AgentHandoff = {
  actionId?: string;
  context: AgentContextRefs;
  prompt?: string;
  skillId?: string;
  workflowId?: string;
};

export type HandoffInput = {
  actionId?: string | null;
  opportunityId?: string | null;
  demandSignalId?: string | null;
  siteUrlId?: string | null;
  targetUrl?: string | null;
  searchIntelligence?: { datasetId: string; rowIds: readonly string[] } | null;
  issueGroup?: { crawlId: string; groupId: string; siteUrlId?: string };
  siteFacts?: { crawlId: string };
  outputRevision?: { outputId: string; revisionId: string };
  actionUrlIds?: readonly string[];
  urlActionsSiteUrlId?: string;
  objectionGroupId?: string;
  prompt?: string | null;
  skillId?: string | null;
  workflowId?: string | null;
};

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
  set(PARAM.issueCrawl, input.issueGroup?.crawlId);
  set(PARAM.issueGroup, input.issueGroup?.groupId);
  set(PARAM.issuePage, input.issueGroup?.siteUrlId);
  set(PARAM.factsCrawl, input.siteFacts?.crawlId);
  set(PARAM.output, input.outputRevision?.outputId);
  set(PARAM.revision, input.outputRevision?.revisionId);
  for (const id of input.actionUrlIds?.slice(0, HANDOFF_URLS_MAX) ?? [])
    params.append(PARAM.actionUrls, id);
  set(PARAM.urlActions, input.urlActionsSiteUrlId);
  set(PARAM.objection, input.objectionGroupId);
  if (input.searchIntelligence && input.searchIntelligence.rowIds.length > 0) {
    params.set(PARAM.dataset, input.searchIntelligence.datasetId);
    for (const row of input.searchIntelligence.rowIds) params.append(PARAM.rows, row);
  }
  set(PARAM.prompt, input.prompt?.trim());
  set(PARAM.skill, input.skillId);
  set(PARAM.workflow, input.workflowId);
  const query = params.toString();
  return query ? `/agent?${query}` : '/agent';
}

const PAGE_WORKFLOW = 'optimize_page';

type HandoffAction = Readonly<{
  id: string;
  target_url: string | null;
  handoff: ActionHandoff;
  editable_page?: boolean;
}>;

export function actionHandoffInput(
  action: HandoffAction,
  actionUrlIds: readonly string[] = [],
): HandoffInput {
  const { handoff } = action;
  const base = { actionId: action.id, actionUrlIds };
  if (action.editable_page && action.target_url)
    return { ...base, targetUrl: action.target_url, workflowId: PAGE_WORKFLOW };
  switch (handoff.context) {
    case 'opportunity':
      return { ...base, opportunityId: handoff.opportunity_id, workflowId: handoff.workflow_id };
    case 'page_url':
      return { ...base, targetUrl: action.target_url, workflowId: handoff.workflow_id };
    case 'action':
      return base;
    default: {
      const unknownHandoff: never = handoff;
      throw new Error(`Unknown Action handoff: ${JSON.stringify(unknownHandoff)}`);
    }
  }
}

export function actionHandoffHref(
  action: HandoffAction,
  actionUrlIds: readonly string[] = [],
): string {
  return agentHandoffHref(actionHandoffInput(action, actionUrlIds));
}

export function agentHandoff(input: HandoffInput): AgentHandoff {
  const context = originContext(input);
  if (input.opportunityId) context.opportunity_id = input.opportunityId;
  if (input.demandSignalId) context.demand_signal_id = input.demandSignalId;
  if (input.siteUrlId) context.target_site_url_id = input.siteUrlId;
  if (input.targetUrl) context.target_url = input.targetUrl;
  if (input.searchIntelligence && input.searchIntelligence.rowIds.length > 0) {
    context.search_intelligence_reference = {
      dataset_id: input.searchIntelligence.datasetId,
      row_ids: [...new Set(input.searchIntelligence.rowIds)],
    };
  }
  return {
    actionId: input.actionId ?? undefined,
    context,
    prompt: input.prompt?.trim() || undefined,
    ...(input.skillId ? { skillId: input.skillId } : {}),
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
  };
}

function originContext(input: HandoffInput): AgentContextRefs {
  const context: AgentContextRefs = {};
  if (input.issueGroup)
    context.issue_group_reference = {
      crawl_id: input.issueGroup.crawlId,
      group_id: input.issueGroup.groupId,
      ...(input.issueGroup.siteUrlId ? { site_url_id: input.issueGroup.siteUrlId } : {}),
    };
  if (input.siteFacts) context.site_facts_reference = { crawl_id: input.siteFacts.crawlId };
  if (input.outputRevision)
    context.output_revision_reference = {
      output_id: input.outputRevision.outputId,
      revision_id: input.outputRevision.revisionId,
    };
  const ticked = [...new Set(input.actionUrlIds ?? [])].slice(0, HANDOFF_URLS_MAX);
  if (input.actionId && ticked.length > 0) context.action_url_ids = ticked;
  if (input.urlActionsSiteUrlId)
    context.url_actions_reference = { site_url_id: input.urlActionsSiteUrlId };
  if (input.objectionGroupId) context.objection_group_id = input.objectionGroupId;
  return context;
}
export type ContextChip = { key: keyof AgentContextRefs; label: string };

type ChipLabels = Partial<Record<keyof AgentContextRefs, string>>;

const CHIPS: readonly [
  keyof AgentContextRefs,
  (context: AgentContextRefs, labels: ChipLabels) => string | null | undefined,
][] = [
  [
    'url_actions_reference',
    (c, labels) =>
      c.url_actions_reference && (labels.url_actions_reference ?? 'Selected URL and its actions'),
  ],
  [
    'action_url_ids',
    (c) => c.action_url_ids && pluralCount(c.action_url_ids.length, 'selected URL'),
  ],
  [
    'issue_group_reference',
    (c) =>
      c.issue_group_reference &&
      (c.issue_group_reference.site_url_id ? 'Selected page issue' : 'Selected issue group'),
  ],
  ['site_facts_reference', (c) => c.site_facts_reference && 'Selected crawl robots policy'],
  ['output_revision_reference', (c) => c.output_revision_reference && 'Selected document revision'],
  ['target_url', (c) => c.target_url],
  ['target_site_url_id', (c) => (c.target_url ? null : c.target_site_url_id && 'Selected page')],
  ['opportunity_id', (c) => c.opportunity_id && 'Recommendation'],
  ['demand_signal_id', (c) => c.demand_signal_id && 'Demand signal'],
  ['objection_group_id', (c) => c.objection_group_id && 'Objection'],
  [
    'search_intelligence_reference',
    (c) =>
      c.search_intelligence_reference &&
      pluralCount(c.search_intelligence_reference.row_ids.length, 'Keyword research row'),
  ],
];

export function contextChips(context: AgentContextRefs, labels: ChipLabels = {}): ContextChip[] {
  return CHIPS.flatMap(([key, chip]) => {
    const label = chip(context, labels);
    return label ? [{ key, label }] : [];
  });
}

export const CHAT_ORIGIN_LABELS = {
  site_health: 'Website',
  page: 'Page',
  recommendation: 'Recommendation',
  demand: 'Demand signal',
  keyword_research: 'Keyword research',
  prompts: 'Prompts',
  objection: 'Objection',
  action: 'Action',
  chat: 'Chat',
} as const satisfies Record<AgentChatOrigin, string>;

export function withoutContext(
  context: AgentContextRefs,
  key: keyof AgentContextRefs,
): AgentContextRefs {
  const next = { ...context };
  delete next[key];
  if (key === 'target_url' || key === 'target_site_url_id') {
    delete next.target_url;
    delete next.target_site_url_id;
  }
  return next;
}
