/**
 * `visibility`: the Sources series, one cited URL's detail and the observed
 * AI Overview rates, for one measurement selection.
 *
 * Moved from `backend/app/api/visibility_sources.py` and
 * `visibility_surfaces.py`. Reads of persisted projections; nothing is
 * fetched. An unknown or out-of-scope run is `Audit not found`, and a
 * malformed selection is a 422 carrying the reader's message.
 */
import { surfaceRatesSchema } from '@citeladder/contracts/audits';
import {
  visibilitySourceSeriesSchema,
  visibilitySourceUrlSchema,
} from '@citeladder/contracts/visibility-evidence';

import { ApiError, notFound } from '../errors.ts';
import type { ParamSpecs } from '../http/params.ts';
import { requireProject } from '../projects/access.ts';
import {
  AnalysisNotFoundError,
  TrendQueryError,
  type RunSelection,
} from '../visibility/selection.ts';
import { getSourceSeries, SOURCE_SERIES_MAX_SERIES } from '../visibility/source-series.ts';
import { getSourceUrlDetail } from '../visibility/source-url.ts';
import { surfaceRates } from '../visibility/surface.ts';
import { defineGetRoute } from './define.ts';

const PROJECT_PATH = { project_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const COHORT = {
  scalar: { kind: 'literal', values: ['core', 'comparison'] },
  default: 'core',
} as const;
const RUNS = {
  audit_id: { scalar: { kind: 'uuid' } },
  audit_ids: { scalar: { kind: 'uuid' }, list: true },
} as const satisfies ParamSpecs;
const WINDOW = {
  from_at: { scalar: { kind: 'datetime' }, alias: 'from' },
  to_at: { scalar: { kind: 'datetime' }, alias: 'to' },
} as const satisfies ParamSpecs;
// `citations.url` is unbounded text, so this cap decides which pages have a
// detail view at all: the practical ceiling a query string survives.
const MAX_URL_LENGTH = 8192;

/** Translate the readers' selection errors as the Python routers did. */
async function selectionErrors<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AnalysisNotFoundError) throw notFound('Audit');
    if (error instanceof TrendQueryError) throw new ApiError(422, error.message);
    throw error;
  }
}

type SelectionQuery = {
  audit_id: string | null;
  audit_ids: string[] | null;
  engine: string | null;
  cohort: string;
  from_at: RunSelection['fromAt'];
  to_at: RunSelection['toAt'];
};

function runSelection(workspaceId: string, projectId: string, query: SelectionQuery): RunSelection {
  return {
    workspaceId,
    projectId,
    auditId: query.audit_id,
    auditIds: query.audit_ids,
    logicalEngine: query.engine,
    cohort: query.cohort,
    fromAt: query.from_at,
    toAt: query.to_at,
  };
}

export const visibilityRoutes = [
  defineGetRoute({
    family: 'visibility',
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
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        domain: { scalar: { kind: 'str', maxLength: 255 } },
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
      await requireProject(db, workspace, path.project_id);
      return selectionErrors(() =>
        getSourceSeries(db, runSelection(workspace.workspaceId, path.project_id, query), {
          dimension: query.dimension,
          granularity: query.granularity,
          domain: query.domain,
          sourceClass: query.source_type,
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    family: 'visibility',
    path: '/api/v1/projects/{project_id}/visibility/sources/url',
    params: {
      path: PROJECT_PATH,
      query: {
        url: { scalar: { kind: 'str', minLength: 1, maxLength: MAX_URL_LENGTH }, required: true },
        ...RUNS,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        ...WINDOW,
      },
    },
    response: visibilitySourceUrlSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return selectionErrors(() =>
        getSourceUrlDetail(
          db,
          runSelection(workspace.workspaceId, path.project_id, query),
          query.url,
        ),
      );
    },
  }),
  defineGetRoute({
    family: 'visibility',
    path: '/api/v1/projects/{project_id}/visibility/surface-rates',
    params: {
      path: PROJECT_PATH,
      query: {
        engine: { scalar: { kind: 'str' }, required: true },
        ...RUNS,
        cohort: COHORT,
      },
    },
    response: surfaceRatesSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      return selectionErrors(() =>
        surfaceRates(db, {
          workspaceId: workspace.workspaceId,
          projectId: path.project_id,
          logicalEngine: query.engine,
          auditId: query.audit_id,
          auditIds: query.audit_ids,
          cohort: query.cohort,
        }),
      );
    },
  }),
];
