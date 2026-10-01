import type { Context } from 'hono';
import { auditScheduleSchema } from '@citeladder/contracts/audits';
import { scheduleCreate, scheduleUpdate } from '../audits/schedule-inputs.ts';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  readSchedule,
  type ScheduleScope,
  updateSchedule,
} from '../audits/schedules.ts';
import type { AppEnv } from '../context.ts';
import { readBody } from '../http/body.ts';
import { defineDeleteRoute, defineGetRoute, definePatchRoute, definePostRoute } from './define.ts';

const root = '/api/v1/projects/{project_id}/audit-schedules';
const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const projectPath = { project_id: uuid } as const;
const itemPath = { ...projectPath, schedule_id: uuid } as const;
const defaults = { family: 'audit-schedules', authorize: 'project' } as const;

function scopeOf(c: Context<AppEnv>, projectId: string): ScheduleScope {
  return { workspaceId: c.get('workspace').workspaceId, projectId };
}

export const auditScheduleRoutes = [
  definePostRoute({
    ...defaults,
    path: root,
    params: { path: projectPath, query: {} },
    capability: 'write',
    status: 201,
    body: scheduleCreate,
    response: auditScheduleSchema,
    async handle({ c, db }, { path }) {
      return createSchedule(db, scopeOf(c, path.project_id), await readBody(c, scheduleCreate));
    },
  }),
  defineGetRoute({
    ...defaults,
    path: root,
    params: { path: projectPath, query: {} },
    response: auditScheduleSchema.array(),
    async handle({ c, db }, { path }) {
      return listSchedules(db, scopeOf(c, path.project_id));
    },
  }),
  defineGetRoute({
    ...defaults,
    path: `${root}/{schedule_id}`,
    params: { path: itemPath, query: {} },
    response: auditScheduleSchema,
    async handle({ c, db }, { path }) {
      return readSchedule(db, scopeOf(c, path.project_id), path.schedule_id);
    },
  }),
  definePatchRoute({
    ...defaults,
    path: `${root}/{schedule_id}`,
    params: { path: itemPath, query: {} },
    capability: 'write',
    body: scheduleUpdate,
    response: auditScheduleSchema,
    async handle({ c, db }, { path }) {
      return updateSchedule(
        db,
        scopeOf(c, path.project_id),
        path.schedule_id,
        await readBody(c, scheduleUpdate),
      );
    },
  }),
  defineDeleteRoute({
    ...defaults,
    path: `${root}/{schedule_id}`,
    params: { path: itemPath, query: {} },
    capability: 'write',
    async handle({ c, db }, { path }) {
      await deleteSchedule(db, scopeOf(c, path.project_id), path.schedule_id);
    },
  }),
];
