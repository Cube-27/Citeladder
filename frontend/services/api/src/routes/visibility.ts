/**
 * `visibility`: every persisted visibility read for one measurement
 * selection: the dashboard, prompt scores and one prompt's history, trends,
 * query fanout, Sources (table, series and one URL), per-answer evidence, answer perception
 * (summary and quotes), fact-check accuracy (summary, claims, claims CSV and by fact), ads in AI
 * answers and the observed AI Overview rates.
 *
 * Reads of persisted projections; nothing is
 * fetched. An unknown or out-of-scope run is `Audit not found`, and a
 * malformed selection is a 422 carrying the reader's message.
 */
import { surfaceRatesSchema } from '@citeladder/contracts/audits';
import {
  accuracyClaimPageSchema,
  accuracyFactListSchema,
  accuracyResponseSchema,
  claimVerdictSchema,
} from '@citeladder/contracts/fact-checking';
import {
  promptHistorySchema,
  promptMetricItemSchema,
  visibilityMarketsSchema,
  visibilitySchema,
} from '@citeladder/contracts/visibility';
import { visibilityFanoutSummarySchema } from '@citeladder/contracts/visibility-evidence';
import {
  perceptionQuotePageSchema,
  perceptionResponseSchema,
} from '@citeladder/contracts/visibility-perception';
import { visibilityMatrixSchema } from '@citeladder/contracts/visibility-matrix';
import { visibilityTopicsSchema } from '@citeladder/contracts/visibility-topics';
import { visibilityTrendListSchema } from '@citeladder/contracts/visibility-trends';
import { visibilityAdsResponseSchema } from '@citeladder/contracts/visibility-ads';
import { z } from 'zod';

import { policy } from '../config.ts';
import { csvDownload } from '../http/table-export.ts';
import {
  accuracyClaimRows,
  CLAIM_EXPORT_COLUMNS,
  getAccuracy,
  getAccuracyClaims,
  getAccuracyFacts,
} from '../visibility/accuracy.ts';
import { getAds } from '../visibility/ads.ts';
import { getRankedVisibility } from '../visibility/ranking-sentiment.ts';
import { getVisibilityFanout } from '../visibility/fanout.ts';
import { getMarketVisibility } from '../visibility/markets.ts';
import { getPerception, getPerceptionQuotes } from '../visibility/perception.ts';
import { getPromptHistory } from '../visibility/prompt-history.ts';
import { getLatestPromptMetrics } from '../visibility/prompt-latest.ts';
import { getPromptMetrics } from '../visibility/prompts.ts';
import { surfaceRates } from '../visibility/surface.ts';
import { getVisibilityMatrix } from '../visibility/matrix.ts';
import { getVisibilityTopics } from '../visibility/topics.ts';
import { getVisibilityTrends } from '../visibility/trends.ts';
import { defineGetRoute } from './define.ts';
import { competitorFocusRoute } from './visibility-competitor.ts';
import {
  BASELINE_RUNS,
  COHORT,
  family,
  LIMIT,
  MARKET,
  marketScope,
  PERCEPTION_SELECTION,
  PROJECT_PATH,
  RUNS,
  runSelection,
  selectionErrors,
  TOPIC,
  WINDOW,
} from './visibility-selection.ts';
import { visibilitySourceRoutes } from './visibility-sources.ts';

/** The dashboard's selection: the latest run, one run, or a period of one configuration. */
const DASHBOARD_SELECTION = {
  audit_id: { scalar: { kind: 'uuid' } },
  ...MARKET,
  ...TOPIC,
  engine: { scalar: { kind: 'str' } },
  selection_mode: {
    scalar: { kind: 'literal', values: ['latest', 'run', 'range'] },
    default: 'latest',
  },
  ...WINDOW,
  configuration_key: { scalar: { kind: 'str' } },
  cohort: COHORT,
} as const;

type DashboardParams = {
  audit_id: string | null;
  engine: string | null;
  selection_mode: 'latest' | 'run' | 'range';
  from_at: Parameters<typeof getRankedVisibility>[2]['fromAt'];
  to_at: Parameters<typeof getRankedVisibility>[2]['toAt'];
  configuration_key: string | null;
  cohort: string;
};

const dashboardQuery = (query: DashboardParams) => ({
  auditId: query.audit_id,
  logicalEngine: query.engine,
  selectionMode: query.selection_mode,
  fromAt: query.from_at,
  toAt: query.to_at,
  configurationKey: query.configuration_key,
  cohort: query.cohort,
});

// `topic` here is a claim's fact-check topic, not a project topic.
const CLAIM_FILTERS = {
  ...PERCEPTION_SELECTION,
  topic: { scalar: { kind: 'literal', values: policy.perception.fact_check.topics } },
  verdict: { scalar: { kind: 'literal', values: claimVerdictSchema.options } },
} as const;

/** A claims read's selection: its `topic` filters claims, never answers by project topic. */
const claimSelection = (
  workspaceId: string,
  projectId: string,
  query: Parameters<typeof runSelection>[2],
) => runSelection(workspaceId, projectId, { ...query, topic: null });

export const visibilityRoutes = [
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/ads',
    params: {
      path: PROJECT_PATH,
      query: {
        ...PERCEPTION_SELECTION,
        ...TOPIC,
        cursor: { scalar: { kind: 'str', maxLength: 2048 } },
        limit: {
          scalar: { kind: 'int', ge: 1, le: policy.visibility.ads_creatives_max_limit },
          default: policy.visibility.ads_creatives_default_limit,
        },
      },
    },
    response: visibilityAdsResponseSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getAds(db, runSelection(workspace.workspaceId, path.project_id, query), {
          cursor: query.cursor,
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/perception',
    params: { path: PROJECT_PATH, query: PERCEPTION_SELECTION },
    response: perceptionResponseSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getPerception(db, runSelection(workspace.workspaceId, path.project_id, query)),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/perception/quotes',
    params: {
      path: PROJECT_PATH,
      query: {
        ...PERCEPTION_SELECTION,
        entity: { scalar: { kind: 'str', maxLength: 255 } },
        theme: { scalar: { kind: 'literal', values: policy.perception.themes } },
        polarity: { scalar: { kind: 'literal', values: ['positive', 'negative'] } },
        cursor: { scalar: { kind: 'str', maxLength: 2048 } },
        limit: {
          scalar: { kind: 'int', ge: 1, le: policy.perception.quotes_max_limit },
          default: policy.perception.quotes_default_limit,
        },
      },
    },
    response: perceptionQuotePageSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getPerceptionQuotes(db, runSelection(workspace.workspaceId, path.project_id, query), {
          entity: query.entity,
          theme: query.theme,
          polarity: query.polarity,
          cursor: query.cursor,
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/accuracy',
    params: { path: PROJECT_PATH, query: PERCEPTION_SELECTION },
    response: accuracyResponseSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getAccuracy(db, runSelection(workspace.workspaceId, path.project_id, query)),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/accuracy/claims',
    params: {
      path: PROJECT_PATH,
      query: {
        ...CLAIM_FILTERS,
        cursor: { scalar: { kind: 'str', maxLength: 2048 } },
        limit: {
          scalar: { kind: 'int', ge: 1, le: policy.perception.fact_check.claims_max_limit },
          default: policy.perception.fact_check.claims_default_limit,
        },
      },
    },
    response: accuracyClaimPageSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getAccuracyClaims(db, claimSelection(workspace.workspaceId, path.project_id, query), {
          topic: query.topic,
          verdict: query.verdict,
          cursor: query.cursor,
          limit: query.limit,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/accuracy/claims/export',
    params: { path: PROJECT_PATH, query: CLAIM_FILTERS },
    raw: true,
    response: z.string().meta({ format: 'binary' }),
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      const rows = await selectionErrors(() =>
        accuracyClaimRows(db, claimSelection(workspace.workspaceId, path.project_id, query), {
          topic: query.topic,
          verdict: query.verdict,
        }),
      );
      return csvDownload('fact-check-claims.csv', CLAIM_EXPORT_COLUMNS, [rows]);
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/accuracy/facts',
    params: { path: PROJECT_PATH, query: PERCEPTION_SELECTION },
    response: accuracyFactListSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getAccuracyFacts(db, runSelection(workspace.workspaceId, path.project_id, query)),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility',
    params: {
      path: PROJECT_PATH,
      query: { ...DASHBOARD_SELECTION, baseline_id: { scalar: { kind: 'uuid' } } },
    },
    response: visibilitySchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getRankedVisibility(db, marketScope(workspace.workspaceId, path.project_id, query), {
          ...dashboardQuery(query),
          baselineId: query.baseline_id,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/topics',
    params: { path: PROJECT_PATH, query: DASHBOARD_SELECTION },
    response: visibilityTopicsSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getVisibilityTopics(
          db,
          marketScope(workspace.workspaceId, path.project_id, query),
          dashboardQuery(query),
        ),
      );
    },
  }),
  defineGetRoute({
    ...family,
    path: '/api/v1/projects/{project_id}/visibility/matrix',
    params: { path: PROJECT_PATH, query: DASHBOARD_SELECTION },
    response: visibilityMatrixSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getVisibilityMatrix(
          db,
          marketScope(workspace.workspaceId, path.project_id, query),
          dashboardQuery(query),
        ),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/prompts',
    params: {
      path: PROJECT_PATH,
      query: {
        ...RUNS,
        baseline_audit_ids: BASELINE_RUNS,
        engine: { scalar: { kind: 'str' } },
        baseline_id: { scalar: { kind: 'uuid' } },
        // Omitted reads core; a per-prompt latest read takes none.
        cohort: { scalar: COHORT.scalar },
        // `prompt` reads each tracked prompt's own latest run: the prompt library.
        latest: { scalar: { kind: 'literal', values: ['run', 'prompt'] }, default: 'run' },
      },
    },
    response: z.array(promptMetricItemSchema),
    async handle({ c, db }, { path, query }) {
      const scope = marketScope(c.get('workspace').workspaceId, path.project_id, query);
      const runs = {
        auditId: query.audit_id,
        auditIds: query.audit_ids,
        baselineAuditIds: query.baseline_audit_ids,
        baselineId: query.baseline_id,
      };
      return selectionErrors(() =>
        query.latest === 'prompt'
          ? getLatestPromptMetrics(db, scope, {
              narrowed: [query.engine, query.cohort, ...Object.values(runs)].some(
                (value) => value != null,
              ),
            })
          : getPromptMetrics(db, scope, {
              ...runs,
              logicalEngine: query.engine,
              cohort: query.cohort ?? 'core',
            }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/prompts/{prompt_id}/history',
    params: {
      path: { ...PROJECT_PATH, prompt_id: { scalar: { kind: 'uuid' }, required: true } },
      // No cohort reads the prompt's own.
      query: { ...MARKET, engine: { scalar: { kind: 'str' } }, cohort: { scalar: COHORT.scalar } },
    },
    response: promptHistorySchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getPromptHistory(db, marketScope(workspace.workspaceId, path.project_id, query), {
          promptId: path.prompt_id,
          logicalEngine: query.engine,
          cohort: query.cohort,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/trends',
    params: {
      path: PROJECT_PATH,
      query: {
        ...MARKET,
        ...TOPIC,
        engine: { scalar: { kind: 'str' } },
        ...WINDOW,
        granularity: {
          scalar: { kind: 'str' },
          default: policy.visibility.trend_default_granularity,
        },
        transport_model: { scalar: { kind: 'str' } },
        retrieval_enabled: { scalar: { kind: 'bool' } },
        cohort: COHORT,
      },
    },
    response: visibilityTrendListSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getVisibilityTrends(db, marketScope(workspace.workspaceId, path.project_id, query), {
          logicalEngine: query.engine,
          fromAt: query.from_at,
          toAt: query.to_at,
          granularity: query.granularity,
          transportModel: query.transport_model,
          retrievalEnabled: query.retrieval_enabled,
          cohort: query.cohort,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/fanout',
    params: {
      path: PROJECT_PATH,
      query: {
        ...RUNS,
        ...TOPIC,
        engine: { scalar: { kind: 'str' } },
        cohort: COHORT,
        query: { scalar: { kind: 'str', maxLength: 8192 } },
        search: { scalar: { kind: 'str', maxLength: 512 } },
        cursor: { scalar: { kind: 'str', maxLength: 2048 } },
        limit: LIMIT,
      },
    },
    response: visibilityFanoutSummarySchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getVisibilityFanout(
          db,
          runSelection(workspace.workspaceId, path.project_id, {
            ...query,
            from_at: null,
            to_at: null,
          }),
          { query: query.query, search: query.search, cursor: query.cursor, limit: query.limit },
        ),
      );
    },
  }),
  ...visibilitySourceRoutes,
  defineGetRoute({
    ...family,
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
      return selectionErrors(() =>
        surfaceRates(db, {
          workspaceId: workspace.workspaceId,
          projectId: path.project_id,
          marketId: query.market,
          logicalEngine: query.engine,
          auditId: query.audit_id,
          auditIds: query.audit_ids,
          cohort: query.cohort,
        }),
      );
    },
  }),
  defineGetRoute({
    ...family,
    exposure: 'both',
    path: '/api/v1/projects/{project_id}/visibility/markets',
    params: { path: PROJECT_PATH, query: { cohort: COHORT, ...TOPIC } },
    response: visibilityMarketsSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      return selectionErrors(() =>
        getMarketVisibility(
          db,
          { workspaceId: workspace.workspaceId, projectId: path.project_id, topicId: query.topic },
          query.cohort,
        ),
      );
    },
  }),
  competitorFocusRoute,
];
