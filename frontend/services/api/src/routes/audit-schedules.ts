import { auditScheduleSchema } from '@citeladder/contracts/audits';
import { scheduleCreate, scheduleUpdate } from '../audits/schedule-inputs.ts';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  readSchedule,
  updateSchedule,
} from '../audits/schedules.ts';
import { readBody } from '../http/body.ts';
import { defineDeleteRoute, defineGetRoute, definePatchRoute, definePostRoute } from './define.ts';

const root = '/api/v1/projects/{project_id}/audit-schedules';
const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const projectPath = { project_id: uuid } as const;
const itemPath = { ...projectPath, schedule_id: uuid } as const;
const defaults = { family: 'audit-schedules', authorize: 'project' } as const;

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
      return createSchedule(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        await readBody(c, scheduleCreate),
      );
    },
  }),
  defineGetRoute({
    ...defaults,
    path: root,
    params: { path: projectPath, query: {} },
    response: auditScheduleSchema.array(),
    async handle({ c, db }, { path }) {
      return listSchedules(db, {
        workspaceId: c.get('workspace').workspaceId,
        projectId: path.project_id,
      });
    },
  }),
  defineGetRoute({
    ...defaults,
    path: `${root}/{schedule_id}`,
    params: { path: itemPath, query: {} },
    response: auditScheduleSchema,
    async handle({ c, db }, { path }) {
      return readSchedule(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        path.schedule_id,
      );
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
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
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
      await deleteSchedule(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        path.schedule_id,
      );
    },
  }),
];
