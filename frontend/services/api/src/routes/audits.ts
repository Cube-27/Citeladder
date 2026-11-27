import { z } from 'zod';
import {
  AUDIT_LIST_DEFAULT_MARKET,
  auditListSortSchema,
  auditPageSchema,
  auditSchema,
  auditScopeSchema,
  auditStatusSchema,
  auditEstimateSchema,
  auditPerformanceSchema,
  auditMetricsSchema,
  executionSchema,
} from '@citeladder/contracts/audits';
import { auditEventSchema } from '@citeladder/contracts/audit-events';
import { policy } from '../config.ts';
import { readBody } from '../http/body.ts';
import { ApiError } from '../errors.ts';
import { requestProjectOf } from '../auth/actor.ts';
import {
  AUDITS_CANCEL,
  AUDITS_RUN,
  cancelAudit,
  createQueuedAudit,
  runAudit,
} from '../commands/audits.ts';
import { routeActor } from '../commands/permission.ts';
import { auditRequestInput } from '../audits/inputs.ts';
import { auditRuntime } from '../audits/config.ts';
import { estimateAudit, estimateInput } from '../audits/estimate.ts';
import {
  readAudit,
  pageAudits,
  listExecutions,
  type AuditMarketFilter,
  readAuditMetrics,
  auditEvents,
} from '../audits/reads.ts';
import { auditPerformance } from '../audits/performance.ts';
import { createRepairAudit, repairInput } from '../audits/repair.ts';
import { exportAudit } from '../audits/exports.ts';
import { auditEventStreamResponse } from '../audits/events.ts';
import { resumeCursor } from '../http/event-stream.ts';
import { streamOwner } from '../http/stream-slots.ts';
import { defineGetRoute, definePostRoute } from './define.ts';

const family = 'audits',
  root = '/api/v1/audits',
  publicRoot = `${policy.api.machine_prefix}/projects/{project_id}/audits`;
const item = { audit_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const empty = { path: {}, query: {} } as const;
const marketId = z.uuid();
function auditMarketFilter(market: string | null | undefined): AuditMarketFilter {
  if (market === null || market === undefined) return { kind: 'any' };
  if (market === AUDIT_LIST_DEFAULT_MARKET) return { kind: 'one', id: null };
  const id = marketId.safeParse(market);
  if (!id.success) throw new ApiError(422, 'market must be a market id or default');
  return { kind: 'one', id: id.data };
}
const params = { path: item, query: {} } as const;
function exportRoute(format: 'csv' | 'md') {
  return defineGetRoute({
    family,
    path: `${root}/{audit_id}/export.${format}`,
    params,
    response: z.string(),
    raw: true,
    async handle({ c, db }, { path }) {
      return new Response(
        await exportAudit(db, c.get('workspace').workspaceId, path.audit_id, format),
        {
          headers: {
            'content-type': `${format === 'csv' ? 'text/csv' : 'text/markdown'}; charset=utf-8`,
            'content-disposition': `attachment; filename="audit-${path.audit_id}.${format}"`,
          },
        },
      );
    },
  });
}
export const auditRoutes = [
  definePostRoute({
    family,
    path: `${root}/{audit_id}/run`,
    params,
    permission: AUDITS_RUN,
    response: auditSchema,
    handle: ({ c, db, config }, { path }) =>
      runAudit(db, config, routeActor(c, AUDITS_RUN), path.audit_id),
  }),
  definePostRoute({
    family,
    path: root,
    params: empty,
    status: 201,
    permission: AUDITS_RUN,
    body: auditRequestInput,
    response: auditSchema.array(),
    handle: async ({ c, db, config }) =>
      createQueuedAudit(
        db,
        config,
        routeActor(c, AUDITS_RUN),
        await readBody(c, auditRequestInput),
      ),
  }),
  definePostRoute({
    family,
    path: `${root}/estimate`,
    params: empty,
    capability: 'read',
    body: estimateInput,
    response: auditEstimateSchema,
    async handle({ c, db, config }) {
      return estimateAudit(
        db,
        c.get('workspace').workspaceId,
        await readBody(c, estimateInput),
        auditRuntime(config.settings),
      );
    },
  }),
  defineGetRoute({
    family,
    path: root,
    params: {
      path: {},
      query: {
        project_id: { scalar: { kind: 'uuid' } },
        audit_scope: { scalar: { kind: 'literal', values: auditScopeSchema.options } },
        market: { scalar: { kind: 'str', maxLength: 64 } },
        status: { scalar: { kind: 'literal', values: auditStatusSchema.options }, list: true },
        completed_from: { scalar: { kind: 'datetime' } },
        completed_to: { scalar: { kind: 'datetime' } },
        sort: {
          scalar: { kind: 'literal', values: auditListSortSchema.options },
          default: 'created',
        },
        descending: { scalar: { kind: 'bool' }, default: true },
        page: { scalar: { kind: 'int', ge: 1 }, default: 1 },
        page_size: { scalar: { kind: 'int', ge: 1, le: 100 }, default: 10 },
      },
    },
    response: auditPageSchema,
    async handle({ c, db }, { query }) {
      return pageAudits(db, {
        workspaceId: c.get('workspace').workspaceId,
        projectId: query.project_id ?? null,
        scope: query.audit_scope ?? null,
        market: auditMarketFilter(query.market),
        statuses: query.status ?? [],
        completed: { from: query.completed_from ?? null, to: query.completed_to ?? null },
        sort: { key: query.sort, descending: query.descending },
        page: query.page,
        pageSize: query.page_size,
      });
    },
  }),
  defineGetRoute({
    family,
    exposure: 'both',
    publicPath: `${publicRoot}/{audit_id}`,
    path: `${root}/{audit_id}`,
    params,
    response: auditSchema,
    async handle({ c, db }, { path }) {
      return readAudit(db, c.get('workspace').workspaceId, path.audit_id);
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/{audit_id}/performance`,
    params,
    response: auditPerformanceSchema,
    async handle({ c, db }, { path }) {
      return auditPerformance(db, c.get('workspace').workspaceId, path.audit_id);
    },
  }),
  definePostRoute({
    family,
    exposure: 'both',
    permission: AUDITS_CANCEL,
    publicPath: `${publicRoot}/{audit_id}/cancel`,
    path: `${root}/{audit_id}/cancel`,
    params,
    response: auditSchema,
    handle: ({ c, db }, { path }) =>
      cancelAudit(db, routeActor(c, AUDITS_CANCEL), requestProjectOf(c), path.audit_id),
  }),
  definePostRoute({
    family,
    path: `${root}/{audit_id}/rerun-failures`,
    params,
    status: 201,
    alsoStatus: 200,
    capability: 'run',
    body: repairInput,
    response: auditSchema,
    raw: true,
    async handle({ c, db, config }, { path }) {
      const workspace = c.get('workspace').workspaceId,
        result = await createRepairAudit(
          db,
          workspace,
          path.audit_id,
          await readBody(c, repairInput),
          auditRuntime(config.settings),
        );
      return c.json(await readAudit(db, workspace, result.auditId), result.created ? 201 : 200);
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/{audit_id}/executions`,
    params,
    response: executionSchema.array(),
    async handle({ c, db }, { path }) {
      return listExecutions(db, c.get('workspace').workspaceId, path.audit_id);
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/{audit_id}/metrics`,
    params,
    response: auditMetricsSchema,
    async handle({ c, db }, { path }) {
      return readAuditMetrics(db, c.get('workspace').workspaceId, path.audit_id);
    },
  }),
  exportRoute('csv'),
  exportRoute('md'),
  defineGetRoute({
    family,
    path: `${root}/{audit_id}/events`,
    params: { path: item, query: { stream: { scalar: { kind: 'bool' }, default: false } } },
    headers: z.object({ 'last-event-id': z.uuid().optional() }),
    response: auditEventSchema.array(),
    raw: true,
    async handle({ c, db, config }, { path, query }) {
      const workspace = c.get('workspace').workspaceId,
        runtime = auditRuntime(config.settings);
      const after = resumeCursor({ header: c.req.header('last-event-id') });
      const events = await auditEvents(
        db,
        workspace,
        path.audit_id,
        after,
        runtime.audits.max_event_page,
      );
      return query.stream
        ? auditEventStreamResponse(
            db,
            { workspaceId: workspace, auditId: path.audit_id, after, initial: events },
            runtime,
            c.req.raw.signal,
            streamOwner(c, db, config.auth.limits),
          )
        : c.json(events);
    },
  }),
];
