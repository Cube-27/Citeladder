/** Workspace-authorized Action reads, workflow decisions and declarations. */
import { z } from 'zod';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { readBody } from '../http/body.ts';
import { parseUuid } from '../http/uuid.ts';
import { getAction, listActions, updateActionStatus } from '../opportunities/actions.ts';
import { declareAction } from '../opportunities/declarations.ts';
import { declarationView as projectDeclaration } from '../opportunities/declaration-view.ts';
import { defineGetRoute, definePatchRoute, definePostRoute } from './define.ts';
import {
  actionDetail,
  actionItem,
  actionsPage,
  declarationCreate,
  declarationView,
  statusPatch,
} from './action-contracts.ts';

const family = 'actions';
const a = policy.opportunity.actions;
const o = policy.opportunity.opportunities;
const actionPath = { action_id: { scalar: { kind: 'uuid' }, required: true } } as const;
export const actionRoutes = [
  defineGetRoute({
    family,
    path: '/api/v1/projects/{project_id}/actions',
    params: {
      path: { project_id: { scalar: { kind: 'uuid' }, required: true } },
      query: {
        limit: {
          scalar: { kind: 'int', ge: 1, le: a.ACTION_LIST_MAX_LIMIT },
          default: a.ACTION_LIST_DEFAULT_LIMIT,
        },
        cursor: { scalar: { kind: 'str' } },
        status_filter: { scalar: { kind: 'str' }, alias: 'status' },
        target_kind: { scalar: { kind: 'str' } },
      },
    },
    response: actionsPage,
    async handle({ c, db }, { path, query }) {
      return listActions(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        { ...query, status: query.status_filter },
      );
    },
  }),
  defineGetRoute({
    family,
    path: '/api/v1/actions/{action_id}',
    params: { path: actionPath, query: {} },
    response: actionDetail,
    async handle({ c, db }, { path }) {
      return getAction(db, c.get('workspace').workspaceId, path.action_id);
    },
  }),
  definePatchRoute({
    family,
    path: '/api/v1/actions/{action_id}',
    capability: 'write',
    params: { path: actionPath, query: {} },
    body: statusPatch,
    response: actionItem,
    async handle({ c, db }, { path }) {
      const body = await readBody(c, statusPatch);
      return updateActionStatus(
        db,
        c.get('workspace').workspaceId,
        path.action_id,
        body.status,
        c.get('user').id,
      );
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/actions/{action_id}/declaration',
    capability: 'write',
    params: { path: actionPath, query: {} },
    body: declarationCreate,
    response: declarationView,
    status: 201,
    raw: true,
    headers: z.object({
      'Idempotency-Key': z
        .string()
        .max(o.IMPLEMENTATION_IDEMPOTENCY_KEY_MAX_LEN)
        .nullable()
        .optional(),
    }),
    async handle({ c, db }, { path }) {
      const header = c.req.header('Idempotency-Key') ?? '';
      if (!header.trim() || header.length > o.IMPLEMENTATION_IDEMPOTENCY_KEY_MAX_LEN)
        throw new ApiError(422, 'A bounded Idempotency-Key is required');
      const body = await readBody(c, declarationCreate);
      const result = await declareAction(
        db,
        c.get('workspace').workspaceId,
        path.action_id,
        c.get('user').id,
        header.trim(),
        {
          ...body,
          output_revision_id: body.output_revision_id ? parseUuid(body.output_revision_id)! : null,
        },
      );
      return c.json(await projectDeclaration(db, result.row), result.created ? 201 : 200);
    },
  }),
];
