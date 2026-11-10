import {
  actionHandoffSchema,
  type ActionGroup,
  type ActionHandoff,
  type ActionPriorityBand,
} from '@citeladder/contracts/actions';

import { policy } from '../../config.ts';
import type { ActionGroupRule } from '../../config/actions.ts';
import { roundScaled } from '../../numbers.ts';
import { normalizedUrlForCompare } from '../url-compare.ts';
import { compareText } from '../../text-order.ts';
import type { NonEmpty } from '../../lists.ts';
import { targetColumns, targetKey, type TargetRef } from './targets.ts';
const p = policy.opportunity.actions;
const MEASUREMENT_LEG_ORDER = [p.LEG_VISIBILITY_RUN, p.LEG_SEARCH_CONSOLE_WINDOW, p.LEG_CRAWL];
export type ActionMember = {
  opportunity_id: string;
  rule_id: string;
  target: TargetRef;
  label_hint: string | null;
  /** The reading a declaration would freeze for this member; null when none can. */
  measured_by: string | null;
  title: string;
  priority_score: number;
  source_analysis_ids: string[];
  source_issue_ids: string[];
  source_metric_ids: string[];
  /** What the member's evidence states that a handoff message names. */
  facts: HandoffFacts;
};
/** The competitors read on an earned page, and a content gap's angle; empty when the rule has none. */
export type HandoffFacts = Readonly<{ competitors: readonly string[]; angle: string | null }>;
export const NO_HANDOFF_FACTS: HandoffFacts = { competitors: [], angle: null };
type MessageFacts = Readonly<Partial<Record<string, string>>>;
const NAMES = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
/**
 * The first template every placeholder of which `facts` fills (`config/actions.ts`
 * `messages`), filled. A branch's last template names `{target}` alone.
 */
function handoffMessage(templates: readonly string[], facts: MessageFacts): string {
  for (const template of templates) {
    let complete = true;
    const message = template.replaceAll(/\{(\w+)\}/g, (_, name: string) => {
      const value = facts[name];
      if (!value) complete = false;
      return value ?? '';
    });
    if (complete) return message;
  }
  return facts.target ?? '';
}
export const pageGroupKey = (url: string) => `page:${normalizedUrlForCompare(url)}`;
/** One planned page per topic, whether the Agent or evidence names it first; null without one. */
export function plannedPageKey(topic: string): string | null {
  // Letters in any script, so a keyword in Hindi or Japanese still names a page.
  const slug = topic
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-|-$/gu, '');
  return slug ? `planned:${[...slug].slice(0, p.PLANNED_PAGE_TOPIC_MAX_CHARS).join('')}` : null;
}
function target(
  key: string,
  kind: string,
  member: ActionMember,
  url: string | null = null,
  prompt: string | null = null,
) {
  const theme = targetColumns(member.target).target_theme;
  return {
    group_key: key,
    kind,
    label: [...(url || member.label_hint || theme || member.title)]
      .slice(0, p.ACTION_LABEL_MAX_CHARS)
      .join(''),
    url,
    prompt_id: prompt,
  };
}
const pageTarget = (member: ActionMember, url: string) =>
  target(pageGroupKey(url), p.TARGET_PAGE, member, url);
/** The Action a member groups into: one per page, prompt, query, product or listing. */
export function targetFor(member: ActionMember) {
  const ref = member.target;
  const key = targetKey(ref);
  switch (ref.kind) {
    case 'earned_page':
      return target(`earned:${key}`, p.TARGET_EARNED_PAGE, member, ref.url);
    case 'product':
      return target(key, p.TARGET_PRODUCT, member);
    case 'category':
      return target(key, p.TARGET_CATEGORY, member);
    case 'prompt':
      return target(key, p.TARGET_PROMPT, member, null, ref.prompt_id);
    case 'prompt_index':
      return target(key, p.TARGET_PROMPT, member);
    case 'site_page':
    case 'site_change':
    case 'link_source':
      return pageTarget(member, ref.url);
    case 'demand':
      if (ref.url) return pageTarget(member, ref.url);
      return ref.query
        ? target(`query:${ref.query.toLowerCase().trim()}`, p.TARGET_QUERY, member)
        : target(key, p.TARGET_QUERY, member);
    case 'search_gap': {
      if (ref.url) return pageTarget(member, ref.url);
      // A keyword gap no existing page covers is a page to create.
      const planned = plannedPageKey(ref.keyword);
      return planned
        ? target(planned, p.TARGET_PLANNED_PAGE, member)
        : target(key, p.TARGET_QUERY, member);
    }
    case 'planned_page':
      // The stored key is the group key, so a renamed label keeps its Action.
      return target(ref.key, p.TARGET_PLANNED_PAGE, member);
    default: {
      const unknownTarget: never = ref;
      throw new Error(`Unknown Opportunity target: ${JSON.stringify(unknownTarget)}`);
    }
  }
}

type ApproachBranch = ReturnType<typeof selectApproach>;

/** A branch's templates filled from one member's facts and the Action's label. */
function messageFor(branch: Pick<ApproachBranch, 'messages'>, member: ActionMember, label: string) {
  return handoffMessage(branch.messages, {
    target: label,
    issue: member.title,
    angle: member.facts.angle ?? undefined,
    competitors: member.facts.competitors.length
      ? NAMES.format(member.facts.competitors)
      : undefined,
  });
}

/**
 * The Agent handoff. The first member, in priority order, whose rule's
 * approach branch names a workflow is the one selection: that branch's
 * message, filled from that member, opens the chat on its workflow. Without
 * one, the chat starts on the Action alone with the Action's own branch's
 * message, filled from that branch's strongest member (the strongest member
 * for the default branch).
 */
function handoffFor(
  approach: ApproachBranch,
  members: NonEmpty<ActionMember>,
  label: string,
): ActionHandoff {
  for (const member of members) {
    const branch = p.APPROACH_TREE.find(
      (candidate) => candidate.handoff && candidate.rule_ids.includes(member.rule_id),
    );
    const handoff = branch?.handoff;
    if (!branch || !handoff) continue;
    const message = messageFor(branch, member, label);
    if (handoff.context === 'opportunity')
      return {
        context: 'opportunity',
        workflow_id: handoff.workflow_id,
        opportunity_id: member.opportunity_id,
        message,
      };
    return { context: 'page_url', workflow_id: handoff.workflow_id, message };
  }
  const rules: readonly string[] = approach.rule_ids;
  const member = members.find((m) => rules.includes(m.rule_id)) ?? members[0];
  return { context: 'action', message: messageFor(approach, member, label) };
}

/**
 * The handoff an Action's read returns: the one its diagnosis persisted, or,
 * for an Action with no current evidence (an Agent row, a cleared Action),
 * the default branch's message about its label.
 */
export function readHandoff(persisted: unknown, label: string): ActionHandoff {
  const parsed = actionHandoffSchema.safeParse(persisted);
  return parsed.success
    ? parsed.data
    : {
        context: 'action',
        message: handoffMessage(p.DEFAULT_APPROACH.messages, { target: label }),
      };
}
type GroupedAction = Readonly<{ approach: string; target_kind: string }>;

function groupAdmits(rule: ActionGroupRule, action: GroupedAction): boolean {
  return (
    (!rule.target_kinds || rule.target_kinds.includes(action.target_kind)) &&
    (!rule.approaches || rule.approaches.includes(action.approach))
  );
}

/** The Actions list group an Action belongs to: the first rule that admits it, else the default. */
export function actionGroup(action: GroupedAction): ActionGroup {
  const rule = p.ACTION_GROUPS.find((candidate) => groupAdmits(candidate, action));
  return rule?.group ?? p.ACTION_GROUP_DEFAULT;
}

/** The band a priority score falls in; an unscored Action has none. */
export function priorityBand(score: number | null): ActionPriorityBand | null {
  if (score === null) return null;
  if (score >= p.ACTION_PRIORITY_BANDS.high) return 'high';
  return score >= p.ACTION_PRIORITY_BANDS.medium ? 'medium' : 'low';
}

export function selectApproach(ids: string[], kind: string) {
  return (
    p.APPROACH_TREE.find(
      (b) =>
        (!b.target_kinds.length || b.target_kinds.includes(kind)) &&
        b.rule_ids.some((r) => ids.includes(r)),
    ) ?? p.DEFAULT_APPROACH
  );
}
function group(t: ReturnType<typeof targetFor>, members: NonEmpty<ActionMember>) {
  const ordered: [ActionMember, ...ActionMember[]] = [...members];
  ordered.sort(
    (a, b) =>
      b.priority_score - a.priority_score ||
      compareText(a.rule_id, b.rule_id) ||
      compareText(a.opportunity_id, b.opportunity_id),
  );
  const familyMap: Record<string, string> = p.RULE_EVIDENCE_FAMILY;
  const families = p.EVIDENCE_FAMILIES.filter((f) =>
    ordered.some((m) => familyMap[m.rule_id] === f),
  );
  // The readings the members would freeze; a member nothing measures promises none.
  const legs = MEASUREMENT_LEG_ORDER.filter((leg) => ordered.some((m) => m.measured_by === leg));
  const branch = selectApproach(
    ordered.map((m) => m.rule_id),
    t.kind,
  );
  return {
    target: t,
    members: ordered,
    families,
    // The strongest finding ranks the Action. Agreement is not rewarded: most
    // findings on a page come from the one crawl, so a count would double it.
    priority_score: roundScaled(ordered[0].priority_score, p.ACTION_PRIORITY_ROUNDING_DECIMALS),
    approach: branch.approach,
    skill_id: branch.skill_id,
    diagnosis: {
      what_happened: ordered.map((m) => ({
        opportunity_id: m.opportunity_id,
        rule_id: m.rule_id,
        title: m.title,
        family: familyMap[m.rule_id],
        priority_score: m.priority_score,
        source_analysis_ids: [...m.source_analysis_ids],
        source_issue_ids: [...m.source_issue_ids],
        source_metric_ids: [...m.source_metric_ids],
      })),
      approach: branch.approach,
      skill_id: branch.skill_id,
      donts: [...branch.donts],
      measure_with: legs,
      handoff: handoffFor(branch, ordered, t.label),
      versions: {
        grouping: p.ACTION_GROUPING_VERSION,
        diagnosis: p.ACTION_DIAGNOSIS_VERSION,
        priority: p.ACTION_PRIORITY_VERSION,
      },
    },
  };
}
export function groupMembers(members: ActionMember[]) {
  const groups = new Map<
    string,
    { target: ReturnType<typeof targetFor>; members: [ActionMember, ...ActionMember[]] }
  >();
  for (const member of members) {
    const t = targetFor(member);
    const entry = groups.get(t.group_key);
    if (entry) entry.members.push(member);
    else groups.set(t.group_key, { target: t, members: [member] });
  }
  return [...groups.values()]
    .map((g) => group(g.target, g.members))
    .sort(
      (a, b) =>
        b.priority_score - a.priority_score || compareText(a.target.group_key, b.target.group_key),
    );
}
