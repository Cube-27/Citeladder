/**
 * Market probes on Perception (AV-29 to AV-36): the probe bar and Run probe
 * quote, the launch, the Market and Objections reads and the objection-group
 * edits. Each handler calls one owner in `src/probes/`.
 */
import { auditSchema } from '@citeladder/contracts/audits';
import {
  objectionGroupMergeRequestSchema,
  probeMarketSchema,
  probeObjectionsSchema,
  probeStatusSchema,
} from '@citeladder/contracts/probes';
import type { Context } from 'hono';
import { z } from 'zod';

import { auditRuntime } from '../audits/config.ts';
import { readAudits } from '../audits/reads.ts';
import type { AppEnv } from '../context.ts';
import { readBody } from '../http/body.ts';
import { probeMarket } from '../probes/market.ts';
import { deleteGroup, groupRequest, mergeGroups, renameGroup } from '../probes/objection-groups.ts';
import { probeObjections } from '../probes/objections.ts';
import { probeStatus, runProbe } from '../probes/status.ts';
import { defineDeleteRoute, defineGetRoute, definePatchRoute, definePostRoute } from './define.ts';

const activeProject = { family: 'probes', authorize: 'active-project' } as const;
const root = '/api/v1/projects/{project_id}/probes';
const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const projectPath = { project_id: uuid } as const;
const groupPath = { ...projectPath, group_id: uuid } as const;
const groupSchema = z.object({ id: z.uuid(), name: z.string() });

function scopeOf(c: Context<AppEnv>, projectId: string) {
  return { workspaceId: c.get('workspace').workspaceId, projectId };
}

export const probeRoutes = [
  defineGetRoute({
    ...activeProject,
    path: root,
    params: { path: projectPath, query: {} },
    response: probeStatusSchema,
    handle: ({ c, db }, { path }) => probeStatus(db, scopeOf(c, path.project_id)),
  }),
  definePostRoute({
    ...activeProject,
    path: root,
    capability: 'run',
    status: 201,
    params: { path: projectPath, query: {} },
    response: z.array(auditSchema),
    async handle({ c, db, config }, { path }) {
      const scope = scopeOf(c, path.project_id);
      const ids = await runProbe(db, scope, auditRuntime(config.settings));
      return readAudits(db, scope.workspaceId, ids);
    },
  }),
  defineGetRoute({
    ...activeProject,
    path: `${root}/market`,
    params: { path: projectPath, query: {} },
    response: probeMarketSchema,
    handle: ({ c, db }, { path }) => probeMarket(db, scopeOf(c, path.project_id)),
  }),
  defineGetRoute({
    ...activeProject,
    path: `${root}/objections`,
    params: { path: projectPath, query: {} },
    response: probeObjectionsSchema,
    handle: ({ c, db }, { path }) => probeObjections(db, scopeOf(c, path.project_id)),
  }),
  definePatchRoute({
    ...activeProject,
    path: `${root}/objection-groups/{group_id}`,
    capability: 'write',
    params: { path: groupPath, query: {} },
    body: groupRequest,
    response: groupSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, groupRequest);
      return renameGroup(db, { ...scopeOf(c, path.project_id), groupId: path.group_id }, input);
    },
  }),
  definePostRoute({
    ...activeProject,
    path: `${root}/objection-groups/{group_id}/merge`,
    capability: 'write',
    params: { path: groupPath, query: {} },
    body: objectionGroupMergeRequestSchema,
    response: groupSchema,
    async handle({ c, db }, { path }) {
      const { into_id: intoId } = await readBody(c, objectionGroupMergeRequestSchema);
      return mergeGroups(db, { ...scopeOf(c, path.project_id), groupId: path.group_id, intoId });
    },
  }),
  defineDeleteRoute({
    ...activeProject,
    path: `${root}/objection-groups/{group_id}`,
    capability: 'write',
    params: { path: groupPath, query: {} },
    handle: ({ c, db }, { path }) =>
      deleteGroup(db, { ...scopeOf(c, path.project_id), groupId: path.group_id }),
  }),
];
