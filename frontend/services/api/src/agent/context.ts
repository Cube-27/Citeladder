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
  brand_block: z.string().default(''),
  target_page_block: z.string().default(''),
  issue_block: z.string().default(''),
  related_site_block: z.string().default(''),
  sections: z.record(z.string(), z.json()).default({}),
  summary: z.record(z.string(), z.json()),
});
export const manifestSchema = z.object({
  version: z.string(),
  refs: z.record(z.string(), z.json()),
  package: packageSchema,
  action: actionSchema.nullable(),
  mentions: z.array(actionSchema),
  instructions: z.object({ revision: z.number().int(), text: z.string() }).nullable(),
  prompt_summary: z.record(z.string(), z.json()).optional(),
  approval: z.object({ revision_id: z.uuid() }).optional(),
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
export function suppliedManifest(
  manifest: Manifest,
  limit = agentPolicy.context_package_max_chars,
) {
  const omissions: string[] = [];
  const supplied = {
    instructions: manifest.instructions,
    package: { ...manifest.package, sections: { ...manifest.package.sections } },
    action: manifest.action,
    mentions: [...manifest.mentions],
    omissions,
  };
  const size = () => JSON.stringify(supplied).length;
  // Background loses its place before the evidence the user selected. JSONB
  // key order is not selection priority.
  if (size() > limit && Object.hasOwn(supplied.package.sections, 'related_site')) {
    delete supplied.package.sections.related_site;
    omissions.push('package.sections.related_site');
  }
  const group = supplied.package.sections.issue_group;
  if (group && typeof group === 'object' && !Array.isArray(group)) {
    const issueReference = manifest.refs.issue_group_reference;
    const selectedPage =
      manifest.refs.target_url ||
      manifest.refs.target_site_url_id ||
      (issueReference &&
        typeof issueReference === 'object' &&
        !Array.isArray(issueReference) &&
        issueReference.site_url_id);
    // Preserve the selected issue before optional company/page background.
    // A specifically selected page remains evidence, not background.
    for (const key of ['target_page', 'brand']) {
      if (key === 'target_page' && selectedPage) continue;
      if (size() > limit && Object.hasOwn(supplied.package.sections, key)) {
        delete supplied.package.sections[key];
        omissions.push(`package.sections.${key}`);
      }
    }
    const occurrences = group.occurrences;
    const sample = group.sample;
    if (
      Array.isArray(occurrences) &&
      sample &&
      typeof sample === 'object' &&
      !Array.isArray(sample)
    ) {
      const selected = [...occurrences];
      const suppliedSample = { ...sample };
      supplied.package.sections.issue_group = {
        ...group,
        occurrences: selected,
        sample: suppliedSample,
      };
      while (size() > limit && selected.length) {
        selected.pop();
        suppliedSample.supplied_occurrences = selected.length;
        suppliedSample.complete = false;
        if (!omissions.includes('package.sections.issue_group.occurrences'))
          omissions.push('package.sections.issue_group.occurrences');
      }
    }
  }
  for (const key of Object.keys(supplied.package.sections).reverse()) {
    if (size() <= limit) break;
    // Selected upstream documents must remain exact, even when they cannot fit.
    if (key === 'upstream_revision') continue;
    delete supplied.package.sections[key];
    omissions.push(`package.sections.${key}`);
  }
  for (const key of [
    'related_site_block',
    'issue_block',
    'target_page_block',
    'brand_block',
  ] as const) {
    if (size() <= limit) break;
    if (supplied.package[key]) {
      supplied.package[key] = '';
      omissions.push(`package.${key}`);
    }
  }
  while (size() > limit && supplied.mentions.length) {
    const removed = supplied.mentions.pop()!;
    omissions.push(`mentioned_action:${removed.id}`);
  }
  if (size() > limit && supplied.action) {
    omissions.push(`action.diagnosis:${supplied.action.id}`);
    supplied.action = { ...supplied.action, diagnosis: {} };
  }
  // Keep metadata bounded while retaining named evidence and exact upstream revision.
  if (size() > limit) {
    supplied.package.summary = { omissions: ['context_summary_size_limit'] };
    omissions.push('package.summary');
  }
  if (size() > limit) throw new AgentError('context_size_limit');
  return {
    text: JSON.stringify(supplied),
    citations: contextCitations(supplied),
    omissions,
    included: Object.keys(supplied.package.sections),
  };
}
export function renderManifest(manifest: Manifest) {
  return suppliedManifest(manifest).text;
}
export function contextCitations(manifest: Pick<Manifest, 'action' | 'mentions'>): Set<string> {
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
