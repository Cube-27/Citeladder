import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import { authorize } from './access.ts';
import { agentPolicy, AgentError, type Scope, type Json } from './contracts.ts';

const actionSchema = z
  .object({
    id: z.uuid(),
    target_label: z.string(),
    skill_id: z.string().nullable(),
    diagnosis: z.record(z.string(), z.json()),
  })
  .catchall(z.json());
const packageSchema = z.object({
  version: z.string(),
  brand_block: z.string(),
  target_page_block: z.string(),
  issue_block: z.string(),
  related_site_block: z.string(),
  summary: z.record(z.string(), z.json()),
});
export const manifestSchema = z.object({
  version: z.string(),
  refs: z.record(z.string(), z.json()),
  package: packageSchema,
  action: actionSchema.nullable(),
  mentions: z.array(actionSchema),
  instructions: z.object({ revision: z.number().int(), text: z.string() }).nullable(),
});
export type Manifest = z.infer<typeof manifestSchema>;
/** Evidence owners authorize all origin IDs and return bounded persisted blocks.
 * No default adapter: a missing dependency must refuse admission, not drop origins. */
export type ContextReader = (
  db: Database,
  scope: Scope,
  refs: Record<string, Json>,
  request: string,
) => Promise<Manifest['package']>;

export async function buildManifest(
  db: Database,
  scope: Scope,
  input: {
    refs: Record<string, Json>;
    request: string;
    actionId: string | null;
    mentionIds: string[];
  },
  read: ContextReader,
): Promise<Manifest> {
  await authorize(db, scope);
  if (input.mentionIds.length > agentPolicy.mentions_max)
    throw new AgentError('agent_context_unavailable');
  const ids = [...new Set([...(input.actionId ? [input.actionId] : []), ...input.mentionIds])];
  const rows = ids.length
    ? await db
        .selectFrom('actions')
        .selectAll()
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('id', 'in', ids)
        .execute()
    : [];
  if (rows.length !== ids.length) throw new AgentError('agent_context_unavailable');
  const actions = new Map(
    rows.map((row) => [
      row.id,
      actionSchema.parse({
        id: row.id,
        target_label: row.target_label,
        skill_id: row.skill_id,
        target_kind: row.target_kind,
        target_url: row.target_url,
        approach: row.approach,
        families: row.families,
        opportunity_snapshot_id: row.opportunity_snapshot_id,
        diagnosis: jsonObject(row.diagnosis, 'actions.diagnosis'),
      }),
    ]),
  );
  const instructions = await db
    .selectFrom('agent_instruction_revisions')
    .select(['revision', 'text'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('revision', 'desc')
    .limit(1)
    .executeTakeFirst();
  return manifestSchema.parse({
    version: agentPolicy.context_manifest_version,
    refs: input.refs,
    package: await read(db, scope, input.refs, input.request),
    action: input.actionId ? actions.get(input.actionId) : null,
    mentions: input.mentionIds.map((id) => actions.get(id)),
    instructions: instructions ?? null,
  });
}
export function renderManifest(manifest: Manifest) {
  const value = JSON.stringify({
    instructions: manifest.instructions,
    package: manifest.package,
    action: manifest.action,
    mentions: manifest.mentions,
  });
  return value.length <= agentPolicy.context_package_max_chars
    ? value
    : value.slice(
        0,
        agentPolicy.context_package_max_chars - agentPolicy.context_truncation_marker.length,
      ) + agentPolicy.context_truncation_marker;
}
export function contextCitations(manifest: Manifest): Set<string> {
  // Other context blocks are working context, not a record citation grant.
  return new Set(
    [manifest.action, ...manifest.mentions].flatMap((action) => {
      const happened = action?.diagnosis.what_happened;
      if (!Array.isArray(happened)) return [];
      return happened.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const id = z.uuid().safeParse(item.opportunity_id);
        return id.success ? [`citeladder://opportunity/${id.data}`] : [];
      });
    }),
  );
}
