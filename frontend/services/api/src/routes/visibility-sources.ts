/**
 * The `visibility` family's Sources reads: the table, per-answer evidence,
 * series, near misses, movers and one URL. Served by `visibility.ts`.
 */
import {
  visibilityEvidenceResponseSchema,
  visibilitySourceMoversSchema,
  visibilitySourceNearMissesSchema,
  visibilitySourceSeriesSchema,
  visibilitySourcesSchema,
  visibilitySourceUrlSchema,
} from '@citeladder/contracts/visibility-evidence';

import { policy } from '../config.ts';
import { getVisibilityEvidence } from '../visibility/evidence.ts';
import { getSourceMovers } from '../visibility/source-movers.ts';
import { getSourceNearMisses } from '../visibility/source-retrieval.ts';
import { getSourceSeries, SOURCE_SERIES_MAX_SERIES } from '../visibility/source-series.ts';
import { getSourceUrlDetail } from '../visibility/source-url.ts';
import { getVisibilitySources } from '../visibility/sources.ts';
import { defineGetRoute } from './define.ts';
import {
  BASELINE_RUNS,
  COHORT,
  family,
  LIMIT,
  MAX_URL_LENGTH,
  PROJECT_PATH,
  RUNS,
  runSelection,
  selectionErrors,
  TOPIC,
  WINDOW,
} from './visibility-selection.ts';

export const visibilitySourceRoutes = [
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/sources',
    params: {
      path: PROJECT_PATH,
      query: {
        ...RUNS,
        ...TOPIC,
        baseline_audit_ids: BASELINE_RUNS,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        domain: { scalar: { kind: 'str', maxLength: 255 } },
        source_type: { scalar: { kind: 'str', maxLength: 64 } },
        standing: { scalar: { kind: 'literal', values: ['gap'] } },
        dimension: { scalar: { kind: 'literal', values: ['domain', 'url'] }, default: 'domain' },
        ...WINDOW,
        as_of: { scalar: { kind: 'datetime' } },
        cursor: { scalar: { kind: 'str', maxLength: 2048 } },
        limit: LIMIT,
      },
    },
    response: visibilitySourcesSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getVisibilitySources(db, runSelection(workspace.workspaceId, path.project_id, query), {
          domain: query.domain,
          sourceClass: query.source_type,
          standing: query.standing,
          dimension: query.dimension,
          asOf: query.as_of,
          cursor: query.cursor,
          limit: query.limit,
          baselineAuditIds: query.baseline_audit_ids,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/evidence',
    params: {
      path: PROJECT_PATH,
      query: {
        ...RUNS,
        ...TOPIC,
        cursor: { scalar: { kind: 'str', maxLength: 2048 } },
        as_of: { scalar: { kind: 'datetime' } },
        outcome: {
          scalar: { kind: 'literal', values: ['brand_absent', 'uncited', 'competitor_gap'] },
        },
        competitor: { scalar: { kind: 'str', maxLength: 255 } },
        domain: { scalar: { kind: 'str', maxLength: 255 } },
        url: { scalar: { kind: 'str', maxLength: MAX_URL_LENGTH } },
        prompt_id: { scalar: { kind: 'uuid' } },
        engine: { scalar: { kind: 'str' } },
        ...WINDOW,
        limit: LIMIT,
        cohort: COHORT,
      },
    },
    response: visibilityEvidenceResponseSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getVisibilityEvidence(db, runSelection(workspace.workspaceId, path.project_id, query), {
          cursor: query.cursor,
          asOf: query.as_of,
          outcome: query.outcome,
          competitor: query.competitor,
          domain: query.domain,
          url: query.url,
          promptId: query.prompt_id,
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/sources/series',
    params: {
      path: PROJECT_PATH,
      query: {
        dimension: { scalar: { kind: 'literal', values: ['domain', 'url'] }, default: 'domain' },
        granularity: {
          scalar: { kind: 'literal', values: ['day', 'week', 'month'] },
          default: 'day',
        },
        ...RUNS,
        ...TOPIC,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        domain: { scalar: { kind: 'str', maxLength: 255 } },
        url: { scalar: { kind: 'str', minLength: 1, maxLength: MAX_URL_LENGTH } },
        source_type: { scalar: { kind: 'str', maxLength: 64 } },
        ...WINDOW,
        limit: {
          scalar: { kind: 'int', ge: 1, le: SOURCE_SERIES_MAX_SERIES },
          default: SOURCE_SERIES_MAX_SERIES,
        },
      },
    },
    response: visibilitySourceSeriesSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getSourceSeries(db, runSelection(workspace.workspaceId, path.project_id, query), {
          dimension: query.dimension,
          granularity: query.granularity,
          domain: query.domain,
          url: query.url,
          sourceClass: query.source_type,
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/sources/near-misses',
    params: {
      path: PROJECT_PATH,
      query: {
        ...RUNS,
        ...TOPIC,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        ...WINDOW,
        limit: LIMIT,
      },
    },
    response: visibilitySourceNearMissesSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getSourceNearMisses(db, runSelection(workspace.workspaceId, path.project_id, query), {
          asOf: new Date().toISOString(),
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/sources/movers',
    params: {
      path: PROJECT_PATH,
      query: {
        ...RUNS,
        ...TOPIC,
        baseline_audit_ids: BASELINE_RUNS,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        dimension: { scalar: { kind: 'literal', values: ['domain', 'url'] }, default: 'domain' },
        ...WINDOW,
        limit: {
          scalar: { kind: 'int', ge: 1, le: policy.visibility.source_movers_max_limit },
          default: policy.visibility.source_movers_default_limit,
        },
      },
    },
    response: visibilitySourceMoversSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getSourceMovers(db, runSelection(workspace.workspaceId, path.project_id, query), {
          dimension: query.dimension,
          baselineAuditIds: query.baseline_audit_ids ?? [],
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/sources/url',
    params: {
      path: PROJECT_PATH,
      query: {
        url: { scalar: { kind: 'str', minLength: 1, maxLength: MAX_URL_LENGTH }, required: true },
        ...RUNS,
        ...TOPIC,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        ...WINDOW,
      },
    },
    response: visibilitySourceUrlSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getSourceUrlDetail(
          db,
          runSelection(workspace.workspaceId, path.project_id, query),
          query.url,
        ),
      );
    },
  }),
];
