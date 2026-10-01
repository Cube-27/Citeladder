import {
  performanceDashboardSchema,
  performanceRangeTaskSchema,
  performanceTablePageSchema,
  projectReadinessSchema,
} from '@citeladder/contracts/performance';
import { z } from 'zod';

import { loadWorkerSettings } from '../config.ts';
import { notFound } from '../errors.ts';
import { requireProject } from '../projects/access.ts';
import { enqueueTask, taskKey } from '../referrals/enqueue.ts';
import { customWindow, getPerformance, getPerformanceTable } from '../traffic/performance.ts';
import { record } from '../db/json.ts';
import { defineGetRoute, definePostRoute } from './define.ts';
import { readProjectReadiness } from '../integrations/readiness.ts';

const root = '/api/v1/projects/{project_id}/performance';
const projectPath = { project_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const date = { scalar: { kind: 'date' } } as const;
const string = { scalar: { kind: 'str' } } as const;
const uuid = { scalar: { kind: 'uuid' } } as const;
const family = 'performance';
function taskResponse(task: { id: string; status: string; payload: unknown }) {
  const payload = record(task.payload);
  return {
    task_id: task.id,
    status: task.status,
    window_start: String(payload.window_start ?? ''),
    window_end: String(payload.window_end ?? ''),
  };
}

export const performanceRoutes = [
  defineGetRoute({
    family: 'readiness',
    path: '/api/v1/projects/{project_id}/readiness',
    params: { path: projectPath, query: {} },
    response: projectReadinessSchema,
    async handle({ db, c }, { path }) {
      const scope = { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id };
      await requireProject(db, c.get('workspace'), scope.projectId);
      return projectReadinessSchema.parse(await readProjectReadiness(db, scope));
    },
  }),
  defineGetRoute({
    family,
    path: root,
    params: {
      path: projectPath,
      query: {
        range: string,
        from: date,
        to: date,
        compare: string,
        compare_from: date,
        compare_to: date,
        granularity: string,
      },
    },
    response: performanceDashboardSchema.extend({
      range: z.string(),
      granularity: z.string(),
      compare: z.string(),
      unavailable_dimensions: z.array(z.string()),
    }),
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return getPerformance(db, {
        workspaceId: workspace.workspaceId,
        projectId: path.project_id,
        ...query,
      });
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/table`,
    params: {
      path: projectPath,
      query: {
        snapshot_id: { ...uuid, required: true },
        dimension: string,
        sort: string,
        cursor: string,
        page_size: { scalar: { kind: 'int' } },
        compare_snapshot_id: uuid,
      },
    },
    response: performanceTablePageSchema.extend({ dimension: z.string() }),
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return getPerformanceTable(db, {
        workspaceId: workspace.workspaceId,
        projectId: path.project_id,
        ...query,
      });
    },
  }),
  definePostRoute({
    family,
    path: `${root}/range`,
    status: 202,
    params: {
      path: projectPath,
      query: { from: { ...date, required: true }, to: { ...date, required: true } },
    },
    response: performanceRangeTaskSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      customWindow(query.from, query.to);
      const keyParts = [path.project_id, query.from, query.to];
      const kind = 'performance_range_projection';
      // A repeat of the same range dedupes to the existing task, so the
      // response always reads the row back by its key.
      await enqueueTask(db, {
        workspaceId: workspace.workspaceId,
        projectId: path.project_id,
        kind,
        payload: { window_start: query.from, window_end: query.to },
        keyParts,
        maxAttempts: loadWorkerSettings().taskMaxAttempts,
      });
      const row = await workspace.scope
        .selectFrom(db, 'analytics_tasks')
        .select(['id', 'status', 'payload'])
        .where('project_id', '=', path.project_id)
        .where('idempotency_key', '=', taskKey(kind, keyParts))
        .executeTakeFirst();
      if (!row) throw notFound('Performance range task');
      return taskResponse(row);
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/range/{task_id}`,
    params: { path: { ...projectPath, task_id: { ...uuid, required: true } }, query: {} },
    response: performanceRangeTaskSchema,
    async handle({ c, db }, { path }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      const row = await workspace.scope
        .selectFrom(db, 'analytics_tasks')
        .select(['id', 'status', 'payload'])
        .where('project_id', '=', path.project_id)
        .where('task_kind', '=', 'performance_range_projection')
        .where('id', '=', path.task_id)
        .executeTakeFirst();
      if (!row) throw notFound('Performance range task');
      return taskResponse(row);
    },
  }),
];
