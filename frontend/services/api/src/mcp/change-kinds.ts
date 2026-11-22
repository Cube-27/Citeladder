import { changeAreas, type ChangeKind } from '../changes/kinds.ts';

export const MCP_CHANGE_KINDS = [
  'add_prompts',
  'update_prompts',
  'update_prompt_text',
  'create_topic',
  'rename_topic',
  'confirm_topics',
  'generate_prompts',
  'import_prompts',
  'add_competitor',
  'review_competitor_suggestion',
  'add_market',
  'launch_audit',
  'cancel_audit',
  'rerun_audit_failures',
  'schedule',
  'run_probe',
  'start_crawl',
  'cancel_crawl',
  'rerun_page',
  'start_link_analysis',
  'update_action_status',
  'declare_implemented',
  'analyze_page',
  'import_brand_facts',
  'import_catalog',
  'remove_competitor',
  'delete_topic',
] as const satisfies readonly ChangeKind[];
export type McpChangeKind = (typeof MCP_CHANGE_KINDS)[number];

export function isMcpChangeKind(kind: string): kind is McpChangeKind {
  return MCP_CHANGE_KINDS.some((offered) => offered === kind);
}

function areaLines([area, kinds]: [string, Record<string, { purpose: string }>]) {
  const offered = Object.entries(kinds).filter(([kind]) => isMcpChangeKind(kind));
  if (!offered.length) return [];
  return [`${area}:`, ...offered.map(([kind, entry]) => `- ${kind}: ${entry.purpose}`)];
}

export const PREPARE_CHANGE_DESCRIPTION = [
  'Preview one change to a project for the user to agree to: every check the change makes runs as a dry run and nothing is saved, held, spent, fetched or sent to a model. Returns a preview without ids and a confirmation_token; show the preview, and call confirm_change only after the user explicitly agrees. A delete or a paid run needs that yes each time. Use ids from the reads. Call with the kind alone to get its payload shape; a payload that does not fit is refused with the shape.',
  'Kinds, by area:',
  ...Object.entries(changeAreas).flatMap(areaLines),
].join('\n');
