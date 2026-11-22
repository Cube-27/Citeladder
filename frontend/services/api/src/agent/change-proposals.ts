import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { agentDeclarationProposalSchema, type AgentProposal } from '@citeladder/contracts/agent';
import type { Actor } from '../auth/actor.ts';
import { findWorkspaceMember } from '../auth/workspace.ts';
import { changePreviewSchema, type ChangePreview } from '../changes/kind.ts';
import { changeAreas, changeKinds, type ChangeKind } from '../changes/kinds.ts';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import { argumentProblem } from '../mcp/tools.ts';
import type { BuiltinOutcome } from './builtin-tools.ts';
import { payloadShape } from './payload-shape.ts';
import { agentPolicy, type Scope } from './contracts.ts';
import { stepText } from './sources.ts';
import type { TurnState } from './turn-budget.ts';

export const PROPOSE_CHANGE = 'propose_change';

export const AGENT_CHANGE_KINDS = [
  'add_prompts',
  'update_prompts',
  'update_prompt_text',
  'create_topic',
  'rename_topic',
  'confirm_topics',
  'delete_topic',
  'create_prompt_set',
  'rename_prompt_set',
  'delete_prompt_set',
  'delete_prompts',
  'review_prompt_candidates',
  'generate_prompts',
  'update_project',
  'add_competitor',
  'review_competitor_suggestion',
  'update_competitor',
  'remove_competitor',
  'add_market',
  'remove_market',
  'refresh_logos',
  'launch_audit',
  'cancel_audit',
  'schedule',
  'rerun_audit_failures',
  'update_audit_schedule',
  'delete_audit_schedule',
  'run_probe',
  'set_probe_schedule',
  'rename_objection_group',
  'merge_objection_groups',
  'delete_objection_group',
  'start_crawl',
  'cancel_crawl',
  'set_crawl_schedule',
  'rerun_page',
  'mark_issue_group_fixed',
  'rerun_issue_group',
  'start_link_analysis',
  'cancel_link_analysis',
  'update_action_status',
  'update_actions_status',
  'analyze_page',
  'reorder_opportunities',
  'create_keyword_review',
  'confirm_keyword_run',
  'cancel_keyword_run',
  'save_keyword_preferences',
  'derive_citation_matches',
  'recompute_demand',
  'override_query_classification',
  'sync_performance',
  'sync_integration',
  'request_performance_range',
  'discover_commerce_competitors',
  'generate_buyer_prompts',
  'add_buyer_prompt',
  'edit_product',
  'set_product_lifecycle',
  'decide_competitor_candidate',
  'decide_buyer_prompt',
  'update_brand_profile',
  'update_business_map',
  'create_brand_fact',
  'update_brand_fact',
  'override_claim_verdict',
  'create_theme',
  'rename_theme',
  'delete_theme',
  'start_brand_discovery',
  'rerun_brand_discovery',
  'complete_brand_discovery',
  'import_prompts',
  'import_brand_facts',
  'import_catalog',
] as const satisfies readonly ChangeKind[];
export type AgentChangeKind = (typeof AGENT_CHANGE_KINDS)[number];

export function isAgentChangeKind(kind: string): kind is AgentChangeKind {
  return AGENT_CHANGE_KINDS.some((known) => known === kind);
}

const storedProposalSchema = z.discriminatedUnion('kind', [
  agentDeclarationProposalSchema,
  z.strictObject({
    kind: z.literal('change'),
    change: z.string(),
    payload: z.json(),
    preview: changePreviewSchema,
  }),
]);
export type StoredProposal = z.infer<typeof storedProposalSchema>;
export const storedProposals = z.array(storedProposalSchema);

export const proposeChangeArguments = z.strictObject({
  kind: z.enum(AGENT_CHANGE_KINDS).describe('The kind of change, from the list above.'),
  payload: z
    .record(z.string(), z.json())
    .optional()
    .describe(
      'The change itself, in its kind’s shape. Omit it to get the shape; nothing is proposed.',
    ),
});

function areaLine([area, kinds]: [string, Record<string, { purpose: string }>]) {
  const listed = Object.entries(kinds).filter(([kind]) => isAgentChangeKind(kind));
  return [`${area}:`, ...listed.map(([kind, entry]) => `- ${kind}: ${entry.purpose}`)];
}

export const PROPOSE_CHANGE_DESCRIPTION = [
  'Propose one change to the project’s data for the person to confirm: the app shows it as a card under your reply, and only their click makes it, as them. Propose only what the person asked for or agreed to; use ids from your reads. A paid change spends nothing until the click. Each call is checked as a dry run: a refusal tells you what to correct. To learn a kind’s payload shape, call with the kind alone; a payload that does not fit is refused with the shape.',
  'Kinds, by area:',
  ...Object.entries(changeAreas).flatMap(areaLine),
].join('\n');

export async function memberActor(
  db: Database,
  scope: Pick<Scope, 'workspaceId' | 'userId'>,
  lock?: 'share',
): Promise<Actor> {
  const member = await findWorkspaceMember(db, scope.userId, scope.workspaceId, lock);
  if (!member) throw notFound('Workspace');
  return {
    kind: 'member',
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    role: member.role,
    scopes: 'all',
  };
}

export function proposalLimit(state: Pick<TurnState, 'proposals'>): BuiltinOutcome | null {
  if (state.proposals.length < agentPolicy.max_proposals_per_turn) return null;
  return {
    ok: false,
    text: `At most ${agentPolicy.max_proposals_per_turn} changes can be proposed in one turn. Reply now; the person can ask for more.`,
  };
}

function bounded(preview: ChangePreview): ChangePreview {
  const rowsMax = agentPolicy.proposal_preview_rows_max;
  const chars = agentPolicy.proposal_preview_value_max_chars;
  const clip = (text: string) => (text.length > chars ? `${text.slice(0, chars - 1)}…` : text);
  const rows = preview.rows.map((row) => ({ label: row.label, value: clip(row.value) }));
  if (rows.length <= rowsMax) return { ...preview, rows };
  const hidden = rows.length - rowsMax + 1;
  return {
    ...preview,
    rows: [...rows.slice(0, rowsMax - 1), { label: 'More', value: `${hidden} more` }],
  };
}

function refusal(error: unknown): BuiltinOutcome {
  if (error instanceof z.ZodError) return { ok: false, text: argumentProblem(error) };
  if (error instanceof ApiError && error.code === policy.workspaces.forbidden_code)
    return {
      ok: false,
      text: 'The person’s role cannot make this change. Tell them instead of proposing it.',
    };
  if (error instanceof ApiError && error.status >= 400 && error.status < 500)
    return {
      ok: false,
      text: `This change would be refused now: ${error.message.replace(/\.$/u, '')}. Correct it, or tell the person why it cannot be made.`,
    };
  throw error;
}

export async function proposeChange(
  db: Database,
  config: ServiceConfig,
  { scope, state }: { scope: Scope; state: Pick<TurnState, 'proposals' | 'steps'> },
  input: unknown,
): Promise<BuiltinOutcome> {
  const parsed = proposeChangeArguments.safeParse(input);
  if (!parsed.success) return { ok: false, text: argumentProblem(parsed.error) };
  const { kind, payload: proposed } = parsed.data;
  const entry = changeKinds[kind];
  if (proposed === undefined)
    return {
      ok: true,
      text: `Nothing proposed. The ${kind} payload is ${payloadShape(entry.proposal)}`,
    };
  const full = proposalLimit(state);
  if (full) return full;
  const checked = entry.proposal.safeParse(proposed);
  if (!checked.success)
    return {
      ok: false,
      text: `${argumentProblem(checked.error)}. The ${kind} payload is ${payloadShape(entry.proposal)}`,
    };
  const context = { db, config, workspaceId: scope.workspaceId, projectId: scope.projectId };
  const change = { id: randomUUID(), projectId: scope.projectId };
  let staged;
  try {
    staged = await entry.stage(context, await memberActor(db, scope), change, proposed);
  } catch (error) {
    return refusal(error);
  }
  const filled = proposalLimit(state);
  if (filled) return filled;
  state.proposals.push({
    kind: 'change',
    change: kind,
    payload: z.json().parse(staged.payload),
    preview: bounded(staged.preview),
  });
  state.steps.push({ kind: 'change', label: stepText(staged.preview.title) });
  const job = staged.preview.opens
    ? ' Once confirmed it starts and runs on its own; nothing waits for it.'
    : '';
  return {
    ok: true,
    text: `Proposed: a card under your reply shows “${staged.preview.title}”. Nothing has changed until the person confirms it.${job} Reply briefly; never say it is done.`,
  };
}

type Outcome = { proposal_index: number; state: string };

export function proposalViews(stored: unknown, outcomes: readonly Outcome[]): AgentProposal[] {
  const decided = new Map<number, 'executed' | 'dismissed'>();
  for (const row of outcomes)
    if (row.state === 'executed' || row.state === 'dismissed')
      decided.set(row.proposal_index, row.state);
  return storedProposals.parse(stored).map((proposal, index): AgentProposal => {
    if (proposal.kind === 'declaration') return proposal;
    const { title, rows, spend, opens } = proposal.preview;
    const outcome = isAgentChangeKind(proposal.change)
      ? (decided.get(index) ?? 'open')
      : 'unavailable';
    return { kind: 'change', index, title, rows, spend, opens, outcome };
  });
}
