/**
 * Evidence-screen handoffs into the Agent.
 *
 * **Work with the agent** opens New chat attached to an Action, which writes
 * the Action's message once it reads it. **Ask agent** opens
 * New chat with typed evidence references and an optional prefilled question.
 * The URL carries identifiers only: the server resolves and authorizes each
 * one when the chat is created, so a tampered or stale id fails there, never
 * here. Parsing drops anything malformed rather than guessing.
 */
import type { ActionHandoff } from '@citeladder/contracts/actions';
import type { AgentChatOrigin, AgentContextRefs } from '@citeladder/contracts/agent';

import type { DatedEvidence } from '@/lib/agent/evidence';
import { checkKindLabel, checkStateLabel, measurementLegLabel } from '@/lib/agent/vocabulary';
import type { ActionDetail } from '@/lib/api/actions';

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
} as const;

/** The most URLs one hand-off names (the server's `action_url_ids` bound). */
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
  /** URLs ticked on the attached Action (`action_urls`), at most `HANDOFF_URLS_MAX`. */
  actionUrlIds?: readonly string[];
  /** One URL with every Action touching it. */
  urlActionsSiteUrlId?: string;
  prompt?: string | null;
  skillId?: string | null;
  workflowId?: string | null;
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
  set(PARAM.issueCrawl, input.issueGroup?.crawlId);
  set(PARAM.issueGroup, input.issueGroup?.groupId);
  set(PARAM.issuePage, input.issueGroup?.siteUrlId);
  set(PARAM.factsCrawl, input.siteFacts?.crawlId);
  set(PARAM.output, input.outputRevision?.outputId);
  set(PARAM.revision, input.outputRevision?.revisionId);
  for (const id of input.actionUrlIds?.slice(0, HANDOFF_URLS_MAX) ?? [])
    params.append(PARAM.actionUrls, id);
  set(PARAM.urlActions, input.urlActionsSiteUrlId);
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

/** The workflow that fetches a page into a page document and opens its workspace. */
const PAGE_WORKFLOW = 'optimize_page';

/**
 * New chat on an Action (AS3): the Action attached, and the workflow its
 * diagnosis names with the finding's Opportunity or the Action's page. An
 * Action on one of the latest crawl's content pages (`editable_page`, as the
 * Action detail reads it) opens that page in the page workspace instead
 * (phase 2, E3). The message stays out of the URL (it names evidence history
 * and logs must not keep); New chat reads it from the attached Action, so it
 * is the same either way.
 */
export function actionHandoffHref(
  action: Readonly<{
    id: string;
    target_url: string | null;
    handoff: ActionHandoff;
    editable_page?: boolean;
  }>,
  /** Only these of the Action's URLs (ticked on its page); none sends the whole Action. */
  actionUrlIds: readonly string[] = [],
): string {
  const { handoff } = action;
  const base = { actionId: action.id, actionUrlIds };
  if (action.editable_page && action.target_url)
    return agentHandoffHref({ ...base, targetUrl: action.target_url, workflowId: PAGE_WORKFLOW });
  switch (handoff.context) {
    case 'opportunity':
      return agentHandoffHref({
        ...base,
        opportunityId: handoff.opportunity_id,
        workflowId: handoff.workflow_id,
      });
    case 'page_url':
      return agentHandoffHref({
        ...base,
        targetUrl: action.target_url,
        workflowId: handoff.workflow_id,
      });
    case 'action':
      return agentHandoffHref(base);
    default: {
      const unknownHandoff: never = handoff;
      throw new Error(`Unknown Action handoff: ${JSON.stringify(unknownHandoff)}`);
    }
  }
}

/**
 * The same references as a typed handoff, for the global agent panel. The
 * caller's values come from persisted reads, and the server still resolves and
 * authorizes each one when the chat is created.
 */
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

function uuidParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value && UUID.test(value) ? value : undefined;
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
  return context;
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
  // Ticked URLs belong to the attached Action; without one they mean nothing.
  if (ticked.length > 0 && uuidParam(params, PARAM.action))
    context.action_url_ids = ticked.slice(0, HANDOFF_URLS_MAX);
  const urlActions = uuidParam(params, PARAM.urlActions);
  if (urlActions) context.url_actions_reference = { site_url_id: urlActions };
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

/** A skill or workflow id; the server catalog validates membership. */
function catalogIdParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : undefined;
}

/** The handoff a New chat URL carries, with malformed values dropped. */
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
  // The server catalog validates membership; preserve explicit skill selections.
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

/** Human labels for the references a composer shows as removable chips. */
export type ContextChip = { key: keyof AgentContextRefs; label: string };

export function contextChips(
  context: AgentContextRefs,
  /** A read's own words for a reference, where the screen has them. */
  labels: Partial<Record<keyof AgentContextRefs, string>> = {},
): ContextChip[] {
  const chips: ContextChip[] = [];
  if (context.url_actions_reference)
    chips.push({
      key: 'url_actions_reference',
      label: labels.url_actions_reference ?? 'Selected URL and its actions',
    });
  if (context.action_url_ids)
    chips.push({
      key: 'action_url_ids',
      label: `${context.action_url_ids.length} selected ${context.action_url_ids.length === 1 ? 'URL' : 'URLs'}`,
    });
  if (context.issue_group_reference)
    chips.push({
      key: 'issue_group_reference',
      label: context.issue_group_reference.site_url_id
        ? 'Selected page issue'
        : 'Selected issue group',
    });
  if (context.site_facts_reference)
    chips.push({ key: 'site_facts_reference', label: 'Selected crawl robots policy' });
  if (context.output_revision_reference)
    chips.push({ key: 'output_revision_reference', label: 'Selected document revision' });
  if (context.target_url) chips.push({ key: 'target_url', label: context.target_url });
  else if (context.target_site_url_id)
    chips.push({ key: 'target_site_url_id', label: 'Selected page' });
  if (context.opportunity_id) chips.push({ key: 'opportunity_id', label: 'Recommendation' });
  if (context.demand_signal_id) chips.push({ key: 'demand_signal_id', label: 'Demand signal' });
  if (context.search_intelligence_reference) {
    const count = context.search_intelligence_reference.row_ids.length;
    chips.push({
      key: 'search_intelligence_reference',
      label: `${count} Keyword Research ${count === 1 ? 'row' : 'rows'}`,
    });
  }
  return chips;
}

/** Where a chat started, in the words its context chips use. */
export const CHAT_ORIGIN_LABELS = {
  site_health: 'Website',
  page: 'Page',
  recommendation: 'Recommendation',
  demand: 'Demand signal',
  keyword_research: 'Keyword Research',
  prompts: 'Prompts',
  action: 'Action',
  chat: 'Chat',
} as const satisfies Record<AgentChatOrigin, string>;

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

type Declaration = NonNullable<ActionDetail['declaration']>;

/** What a developer ticket reads from an Action's detail. */
type TicketAction = Pick<ActionDetail, 'target_label' | 'target_url' | 'member_measurement'> & {
  handoff: Pick<ActionDetail['handoff'], 'message'>;
  members: readonly Pick<ActionDetail['members'][number], 'id' | 'title' | 'remediation'>[];
  diagnosis: Pick<ActionDetail['diagnosis'], 'donts'>;
  declaration:
    | (Pick<Declaration, 'declared_implemented_at' | 'deployed_by' | 'deployment_reference'> & {
        checks: readonly Pick<Declaration['checks'][number], 'kind' | 'state'>[];
      })
    | null;
};

/** Stored text on one line, so it never breaks the Markdown around it. */
const oneLine = (text: string) => text.replaceAll(/\s+/g, ' ').trim();
/** One Markdown list line. */
const line = (text: string) => `- ${oneLine(text)}`;
/** A Markdown list of `items`, or one line saying there are `none`. */
const list = (items: readonly string[], none: string) =>
  items.length ? items.map((item) => line(item)) : [line(none)];
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

function verification(action: TicketAction, formatDate: (iso: string) => string): string[] {
  const { declaration } = action;
  if (declaration) {
    const by = declaration.deployed_by ?? 'a former workspace member';
    const reference = declaration.deployment_reference
      ? ` (${declaration.deployment_reference})`
      : '';
    return [
      `Deployed on ${formatDate(declaration.declared_implemented_at)}, recorded by ${by}${reference}.`,
      '',
      ...list(
        declaration.checks.map(
          (check) => `${checkKindLabel(check.kind)}: ${checkStateLabel(check)}`,
        ),
        'No automatic check applies; CiteLadder records the work but cannot verify it.',
      ),
    ];
  }
  return [
    ...action.members.map((member) => {
      const leg = action.member_measurement[member.id];
      const by = leg ? measurementLegLabel(leg) : null;
      const how = by ? 'checked by ' + by.toLowerCase() : 'not measured automatically';
      return line(`${member.title}: ${how}`);
    }),
    '',
    'When it ships, record the deployment on the Action in CiteLadder: Mark implemented with the day it went live and the release, pull request or commit. Readings before that day are not counted.',
  ];
}

/**
 * "Prepare developer ticket": the Action as Markdown a developer can paste
 * into an issue tracker. The issue, the affected page, the
 * dated evidence, the minimal patch and how CiteLadder will verify it, all
 * from the Action's persisted read. `formatDate` renders a stored timestamp
 * in the reader's display time zone.
 */
export function developerTicket(
  action: TicketAction,
  evidence: readonly DatedEvidence[],
  formatDate: (iso: string) => string,
): string {
  const findings = unique(action.members.map((member) => member.title));
  const steps = unique(action.members.map((member) => member.remediation));
  const donts = action.diagnosis.donts ?? [];
  const sections: string[][] = [
    [`# ${oneLine(action.target_label)}`, '', action.handoff.message],
    ['## Issue', '', ...list(findings, 'No current finding targets this Action.')],
    ['## Affected pages', '', line(action.target_url ?? action.target_label)],
    [
      '## Evidence',
      '',
      ...list(
        evidence.map(
          (item) =>
            `${item.label}: ${item.basis}, ${item.at ? formatDate(item.at) : 'date not recorded'}`,
        ),
        'No evidence is recorded for this Action.',
      ),
    ],
    [
      '## Minimal patch',
      '',
      ...(steps.length
        ? steps.map((step, index) => `${index + 1}. ${oneLine(step)}`)
        : [line('No step is recorded; see the issue above.')]),
      ...(donts.length ? ['', 'Avoid:', '', ...donts.map(line)] : []),
    ],
    ['## How it will be verified', '', ...verification(action, formatDate)],
  ];
  return `${sections.map((section) => section.join('\n')).join('\n\n')}\n`;
}
