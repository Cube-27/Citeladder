/**
 * The `opportunities` family: the persisted catalog, its summary and history,
 * the shared order, the manual recompute and the exports. Every lookup is
 * filtered by the active workspace, so a foreign id is a 404.
 */
import { policy } from '../config.ts';
import { rowsToCsv, rowsToMarkdown } from '../analysis/opportunities/exports.ts';
import { readBody, readOptionalBody } from '../http/body.ts';
import { parseUuid } from '../http/uuid.ts';
import {
  getOpportunity,
  groupedHistory,
  listOpportunities,
  loadExportRows,
} from '../opportunities/reads.ts';
import { updateOrder } from '../opportunities/order.ts';
import { recomputeOpportunities } from '../opportunities/refresh.ts';
import { opportunitySummary } from '../opportunities/summary.ts';
import { defineGetRoute, definePostRoute, definePutRoute } from './define.ts';
import {
  fileResponse,
  historyResponse,
  opportunitiesPage,
  opportunityDetail,
  opportunitySummary as summarySchema,
  orderResponse,
  orderUpdate,
  recomputeRequest,
  recomputeResponse,
} from './opportunity-contracts.ts';

const family = 'opportunities';
const root = '/api/v1/projects/{project_id}/opportunities';
const o = policy.opportunity.opportunities;
const projectPath = { project_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const filterQuery = {
  type_filter: { scalar: { kind: 'str' }, alias: 'type' },
  severity: { scalar: { kind: 'str' } },
  status_filter: { scalar: { kind: 'str' }, alias: 'status' },
  rule_id: { scalar: { kind: 'str' } },
  min_priority: { scalar: { kind: 'float' } },
} as const;

type FilterValues = {
  type_filter: string | null;
  severity: string | null;
  status_filter: string | null;
  rule_id: string | null;
  min_priority: number | null;
};

const filters = (query: FilterValues) => ({
  type: query.type_filter,
  severity: query.severity,
  status: query.status_filter,
  rule_id: query.rule_id,
  min_priority: query.min_priority,
});

function exportRoute(extension: 'csv' | 'md') {
  const [render, mediaType] =
    extension === 'csv' ? [rowsToCsv, 'text/csv'] : [rowsToMarkdown, 'text/markdown'];
  return defineGetRoute({
    family,
    path: `${root}/export.${extension}`,
    params: { path: projectPath, query: filterQuery },
    response: fileResponse,
    raw: true,
    async handle({ c, db }, { path, query }) {
      const scope = { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id };
      const rows = await loadExportRows(db, scope, filters(query));
      return new Response(render(rows), {
        headers: {
          'content-type': `${mediaType}; charset=utf-8`,
          'content-disposition': `attachment; filename="opportunities-${path.project_id}.${extension}"`,
        },
      });
    },
  });
}

export const opportunityRoutes = [
  defineGetRoute({
    family,
    path: root,
    params: {
      path: projectPath,
      query: {
        ...filterQuery,
        action_path: { scalar: { kind: 'str' } },
        limit: {
          scalar: { kind: 'int', ge: 1, le: o.LIST_MAX_LIMIT },
          default: o.LIST_DEFAULT_LIMIT,
        },
        cursor: { scalar: { kind: 'str' } },
      },
    },
    response: opportunitiesPage,
    async handle({ c, db }, { path, query }) {
      const scope = { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id };
      return listOpportunities(
        db,
        scope,
        { ...filters(query), action_path: query.action_path },
        { limit: query.limit, cursor: query.cursor },
      );
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/summary`,
    params: { path: projectPath, query: {} },
    response: summarySchema,
    async handle({ c, db }, { path }) {
      return opportunitySummary(db, {
        workspaceId: c.get('workspace').workspaceId,
        projectId: path.project_id,
      });
    },
  }),
  definePostRoute({
    family,
    path: `${root}/recompute`,
    params: { path: projectPath, query: {} },
    body: recomputeRequest,
    response: recomputeResponse,
    async handle({ c, db }, { path }) {
      const body = await readOptionalBody(c, recomputeRequest);
      return recomputeOpportunities(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        { auditId: body?.audit_id ?? null, siteCrawlId: body?.site_crawl_id ?? null },
      );
    },
  }),
  defineGetRoute({
    family,
    path: `${root}/history`,
    params: { path: projectPath, query: {} },
    response: historyResponse,
    async handle({ c, db }, { path }) {
      return groupedHistory(db, {
        workspaceId: c.get('workspace').workspaceId,
        projectId: path.project_id,
      });
    },
  }),
  defineGetRoute({
    family,
    path: '/api/v1/opportunities/{opportunity_id}',
    params: {
      path: { opportunity_id: { scalar: { kind: 'uuid' }, required: true } },
      query: {},
    },
    response: opportunityDetail,
    async handle({ c, db }, { path }) {
      return getOpportunity(db, c.get('workspace').workspaceId, path.opportunity_id);
    },
  }),
  definePutRoute({
    family,
    path: `${root}/order`,
    capability: 'write',
    params: { path: projectPath, query: {} },
    body: orderUpdate,
    response: orderResponse,
    async handle({ c, db }, { path }) {
      const body = await readBody(c, orderUpdate);
      return updateOrder(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        {
          orderedIds: body.ordered_opportunity_ids.map((id) => parseUuid(id)!),
          expectedVersion: body.expected_version,
          userId: c.get('user').id,
        },
      );
    },
  }),
  exportRoute('csv'),
  exportRoute('md'),
];
