import {
  contentStructureInputSchema,
  contentStructureReadSchema,
} from '@citeladder/contracts/site-health';

import { readBody } from '../http/body.ts';
import { requireProject } from '../projects/access.ts';
import { admitContentRun, cancelContentRun, contentRun } from '../site-health/content-runs.ts';
import { defineGetRoute, definePostRoute } from './define.ts';

const family = 'site-health-content-structure';
const root = '/api/v1/projects/{project_id}/site-health/content-structure';
const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const projectPath = { project_id: uuid } as const;

export const contentStructureRoutes = [
  defineGetRoute({
    family,
    path: root,
    params: { path: projectPath, query: { analysis_id: { scalar: { kind: 'uuid' } } } },
    response: contentStructureReadSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return contentRun(
        db,
        { workspaceId: workspace.workspaceId, projectId: path.project_id },
        query.analysis_id ?? undefined,
      );
    },
  }),
  definePostRoute({
    family,
    path: `${root}/analyses`,
    capability: 'run',
    status: 202,
    params: { path: projectPath, query: {} },
    body: contentStructureInputSchema,
    response: contentStructureReadSchema,
    async handle({ c, db }, { path }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return admitContentRun(
        db,
        { workspaceId: workspace.workspaceId, projectId: path.project_id },
        c.get('user').id,
        await readBody(c, contentStructureInputSchema),
      );
    },
  }),
  definePostRoute({
    family,
    path: `${root}/analyses/{analysis_id}/cancel`,
    capability: 'run',
    params: { path: { ...projectPath, analysis_id: uuid }, query: {} },
    response: contentStructureReadSchema,
    async handle({ c, db }, { path }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return cancelContentRun(
        db,
        { workspaceId: workspace.workspaceId, projectId: path.project_id },
        path.analysis_id,
      );
    },
  }),
];
