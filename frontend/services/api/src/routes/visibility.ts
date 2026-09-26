/**
 * `visibility`: the Sources series, one cited URL's detail and the observed
 * AI Overview rates, for one measurement selection.
 *
 * Moved from `backend/app/api/visibility_sources.py` and
 * `visibility_surfaces.py`. Reads of persisted projections; nothing is
 * fetched. An unknown or out-of-scope run is `Audit not found`, and a
 * malformed selection is a 422 carrying the reader's message.
 */
import { z } from 'zod';

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

const datetime = z.iso.datetime({ offset: true });

const sourceSeriesResponse = z.object({
  dimension: z.enum(['domain', 'url']),
  granularity: z.string(),
  buckets: z.array(datetime).optional(),
  series: z
    .array(
      z.object({
        key: z.string(),
        citations: z.int().default(0),
        points: z
          .array(
            z.object({
              at: datetime,
              responses: z.int().default(0),
              share: z.number().nullable().default(null),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const sourceUrlDetail = z.object({
  url: z.string(),
  title: z.string().default(''),
  retrievals: z.int().default(0),
  citations: z.int().default(0),
  responses: z.int().default(0),
  citation_rate: z.number().nullable().default(null),
  prompts: z.int().default(0),
  first_seen: datetime.nullable().default(null),
  last_seen: datetime.nullable().default(null),
  engines: z
    .array(
      z.object({
        logical_engine: z.string(),
        transport_model: z.string().nullable().default(null),
        retrievals: z.int().default(0),
      }),
    )
    .optional(),
  prompt_rows: z
    .array(
      z.object({
        prompt_text: z.string(),
        topic: z.string().nullable().default(null),
        responses: z.int().default(0),
        last_seen: datetime.nullable().default(null),
        engines: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  brands: z
    .array(
      z.object({
        kind: z.enum(['brand', 'competitor']),
        name: z.string(),
        responses: z.int().default(0),
        logo_url: z.string().nullable().default(null),
        website: z.string().nullable().default(null),
      }),
    )
    .optional(),
});

const aioRateValue = z.object({
  numerator: z.int().default(0),
  denominator: z.int().default(0),
  denominator_kind: z.string().default(''),
  value: z.number().nullable().default(null),
});

const surfaceRatesResponse = z.object({
  logical_engine: z.string().default(''),
  successful: z.int().default(0),
  with_overview: z.int().default(0),
  excluded: z.int().default(0),
  trigger_rate: aioRateValue.optional(),
  brand_mention_rate_when_present: aioRateValue.optional(),
  overall_brand_visibility: aioRateValue.optional(),
  owned_citation_rate_when_present: aioRateValue.optional(),
  competitor_mention_rates: z.array(z.object({ name: z.string(), rate: aioRateValue })).optional(),
});

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
    response: sourceSeriesResponse,
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
    response: sourceUrlDetail,
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
    response: surfaceRatesResponse,
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
