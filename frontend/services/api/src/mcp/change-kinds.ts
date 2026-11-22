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
  'Checks one change to a project as a dry run and returns a preview of it, without ids, and a confirmation_token. Nothing is saved, held, spent, fetched or sent to a model here; confirm_change with the token makes the change once the user has agreed to the preview. Ids come from the read tools. With a kind and no payload it returns that kind’s payload shape; a payload that does not fit is refused with the shape.',
  'Kinds, by area:',
  ...Object.entries(changeAreas).flatMap(areaLines),
].join('\n');
