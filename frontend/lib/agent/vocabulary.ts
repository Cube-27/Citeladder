/**
 * The one place an Agent or Action token becomes something a reader reads.
 *
 * An unmapped token renders as nothing (or a neutral fallback where a label is
 * structurally required), never as the raw backend identifier.
 */
import type { ActionStatus } from '@/lib/api/actions';

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  implemented: 'Implemented',
  measuring: 'Measuring',
  done: 'Done',
  dismissed: 'Dismissed',
};

/** Badge tone per status; meaning is always carried by the label too. */
export const ACTION_STATUS_TONE: Record<ActionStatus, 'neutral' | 'info' | 'success' | 'warning'> =
  {
    open: 'neutral',
    in_progress: 'info',
    implemented: 'info',
    measuring: 'warning',
    done: 'success',
    dismissed: 'neutral',
  };

const TARGET_KIND_LABEL: Record<string, string> = {
  page: 'Page',
  earned_page: 'Earned page',
  product: 'Product',
  category: 'Category',
  query: 'Search query',
  prompt: 'Prompt',
  planned_page: 'Planned page',
};

export const ACTION_TARGET_KINDS = Object.keys(TARGET_KIND_LABEL);

export function targetKindLabel(kind: string | null | undefined): string | null {
  return kind ? (TARGET_KIND_LABEL[kind] ?? null) : null;
}

const FAMILY_LABEL: Record<string, string> = {
  ai_visibility: 'AI Visibility',
  sources: 'Sources',
  search_console: 'Search Console',
  site_health: 'Site Health',
  link_graph: 'Link graph',
  site_changes: 'Site changes',
  commerce: 'Commerce',
};

export function familyLabel(family: string): string | null {
  return FAMILY_LABEL[family] ?? null;
}

export const FAMILY_STATE_LABEL: Record<string, string> = {
  observed: 'Observed',
  no_finding: 'No finding',
  unavailable: 'Unavailable',
};

const APPROACH_LABEL: Record<string, string> = {
  improve_existing: 'Improve the existing page',
  consolidate: 'Consolidate overlapping pages',
  create_new: 'Create a new page',
  fix_technical: 'Fix a technical issue',
  earned_placement: 'Earn a placement',
  research: 'Research the source',
  improve_links: 'Improve internal links',
};

export function approachLabel(approach: string | null | undefined): string | null {
  return approach ? (APPROACH_LABEL[approach] ?? null) : null;
}

const MEASUREMENT_LEG_LABEL: Record<string, string> = {
  next_visibility_run: 'The next visibility run on the affected prompts',
  next_search_console_window: 'The next complete Search Console window',
  next_crawl: 'The next crawl of this page',
  placement_recheck: 'The earned-page recheck',
  next_commerce_audit: 'The next commerce audit',
};

export function measurementLegLabel(leg: string): string | null {
  return MEASUREMENT_LEG_LABEL[leg] ?? null;
}

const OUTPUT_KIND_LABEL: Record<string, string> = {
  plan: 'Growth plan',
  measurement: 'Measurement plan',
  research: 'Research brief',
  prompt_portfolio: 'Prompt portfolio',
  page_edits: 'Page edits',
  link_plan: 'Internal-link plan',
  technical_fix: 'Technical fix',
  diagnosis: 'Diagnosis',
  earned_brief: 'Earned-placement brief',
  content: 'Content',
};

export function outputKindLabel(kind: string | null | undefined): string {
  return (kind && OUTPUT_KIND_LABEL[kind]) || 'Output';
}

export const OUTPUT_PHASE_LABEL: Record<'outline' | 'draft' | 'final', string> = {
  outline: 'Outline',
  draft: 'Draft',
  final: 'Final',
};

const SKILL_GROUP_LABEL: Record<string, string> = {
  strategy: 'Strategy',
  demand: 'Search demand',
  owned_site: 'Your site',
  visibility: 'AI visibility',
  content: 'Content',
};

export function skillGroupLabel(group: string): string {
  return SKILL_GROUP_LABEL[group] ?? 'Other';
}

/**
 * Terminal run failures, in the reader's terms. Each names what happened and
 * what the reader can do; none claims an output was saved.
 */
const RUN_ERROR_COPY: Record<string, string> = {
  stopped_at_limit:
    'The agent stopped at its step limit before finishing. Nothing was saved; ask again with a narrower request.',
  access_revoked: 'You no longer have permission to run the agent in this workspace.',
  model_changed: 'The agent model changed after this request was queued. Send it again.',
  output_conflict:
    'The output changed while the agent was working, so its revision was not saved. Ask again to revise the latest version.',
  route_unavailable:
    'The model connection for the agent changed or was removed. Check Settings › Providers and try again.',
  funding_unavailable: 'There are not enough AI credits to finish this request.',
  capability_unavailable: 'Your plan does not include the agent.',
  provider_error: 'The model provider returned an error. Try again.',
  tool_failed: 'A data read failed. Try again.',
  protocol_violation: 'The agent returned a response it could not use. Try again.',
};

export function runErrorCopy(code: string): string {
  return RUN_ERROR_COPY[code] ?? 'The agent could not finish this request. Try again.';
}
