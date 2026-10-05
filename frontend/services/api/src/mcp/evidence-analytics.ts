/** Presentation composes canonical persisted readers; it owns no metrics. */
import type { AnalyticsSelection } from '@citeladder/contracts/mcp-app';
import { visibilitySchema } from '@citeladder/contracts/visibility';
import { visibilityTrendListSchema } from '@citeladder/contracts/visibility-trends';
import type { Database } from '../db/database.ts';
import { parseDatetime } from '../http/datetimes.ts';
import { getVisibility } from '../visibility/dashboard.ts';
import { getVisibilityTrends } from '../visibility/trends.ts';
import {
  AnalysisNotFoundError,
  TrendQueryError,
  authorizeRunSet,
} from '../visibility/selection.ts';
import { readEvidence, type ReadArguments } from './evidence.ts';
import { McpInputError, type Evidence, type ReadScope } from './types.ts';
import { mcpPolicy } from './config.ts';

const ref = (kind: string, id: string) => ({ kind, id, record_uri: `citeladder://${kind}/${id}` });

export async function readAnalytics(
  db: Database,
  scope: ReadScope,
  name: string,
  args: ReadArguments,
): Promise<Evidence> {
  try {
    if (name === 'read_visibility_trends') {
      if (typeof args.from_at !== 'string' || typeof args.to_at !== 'string')
        throw new McpInputError('Trends requires an explicit window');
      if (
        Date.parse(args.to_at) - Date.parse(args.from_at) >
        mcpPolicy.trend_max_window_days * 86400000
      )
        throw new McpInputError(
          `Trend windows are limited to ${mcpPolicy.trend_max_window_days} days`,
        );
      const points = visibilityTrendListSchema.parse(
        await getVisibilityTrends(db, scope, {
          logicalEngine: typeof args.engine === 'string' ? args.engine : null,
          fromAt: typeof args.from_at === 'string' ? parseDatetime(args.from_at) : null,
          toAt: typeof args.to_at === 'string' ? parseDatetime(args.to_at) : null,
          granularity: typeof args.granularity === 'string' ? args.granularity : 'run',
          transportModel: typeof args.transport_model === 'string' ? args.transport_model : null,
          retrievalEnabled:
            typeof args.retrieval_enabled === 'boolean' ? args.retrieval_enabled : null,
          cohort: typeof args.cohort === 'string' ? args.cohort : 'core',
        }),
      );
      return {
        state: points.length ? 'available' : 'unavailable',
        reason: points.length ? null : 'no_measured_runs',
        window: { from_at: args.from_at, to_at: args.to_at },
        points,
        artifact_refs: [...new Set(points.flatMap((p) => p.source_audit_ids ?? []))].map((id) =>
          ref('audit', id),
        ),
        limitations: [
          'Bounded persisted history; compare only matching comparison keys and versions. Missing points are not zero.',
        ],
      };
    }
    if (typeof args.baseline_id === 'string') await authorizeRunSet(db, scope, [args.baseline_id]);
    const projection = visibilitySchema.parse(
      await getVisibility(db, scope, {
        auditId: typeof args.audit_id === 'string' ? args.audit_id : null,
        logicalEngine: typeof args.engine === 'string' ? args.engine : null,
        baselineId: typeof args.baseline_id === 'string' ? args.baseline_id : null,
        selectionMode: args.audit_id ? 'run' : 'latest',
        fromAt: null,
        toAt: null,
        configurationKey: null,
        cohort: typeof args.cohort === 'string' ? args.cohort : 'core',
      }),
    );
    return {
      state: 'available',
      ...projection,
      artifact_refs: [ref('audit', projection.audit_id)],
      omissions: [],
    };
  } catch (error) {
    if (error instanceof TrendQueryError) throw new McpInputError(error.message);
    if (error instanceof AnalysisNotFoundError) {
      if (args.audit_id || args.baseline_id)
        throw new McpInputError('Selected measurement is unavailable');
      return {
        state: 'unavailable',
        reason: 'no_completed_measurement',
        artifact_refs: [],
        omissions: [],
      };
    }
    throw error;
  }
}

export async function renderAnalytics(
  db: Database,
  scope: ReadScope,
  selection: AnalyticsSelection,
  origin: string,
): Promise<Evidence> {
  const { view } = selection;
  if (
    (selection.from_at ||
      selection.to_at ||
      selection.transport_model != null ||
      selection.retrieval_enabled != null) &&
    view !== 'trends'
  )
    throw new McpInputError('Period and model filters apply only to Trends');
  if (view === 'trends' && (!selection.from_at || !selection.to_at || selection.audit_id))
    throw new McpInputError('Trends requires an explicit window and no audit_id');
  if ((selection.domain || selection.cursor || selection.level === 'url') && view !== 'sources')
    throw new McpInputError('Source paging filters apply only to Sources');
  if (selection.snapshot_id && view !== 'site_health')
    throw new McpInputError('snapshot_id applies only to Site Health');
  if (
    view === 'site_health' &&
    (selection.audit_id || selection.engine || selection.competitor || selection.cohort !== 'core')
  )
    throw new McpInputError('Site Health does not support visibility filters');
  if (selection.competitor && view !== 'overview' && view !== 'trends')
    throw new McpInputError('Competitor selection applies only to Overview and Trends');
  const resolved = { ...selection };
  let evidence: Evidence;
  if (view === 'site_health') {
    evidence = await readEvidence(db, scope, 'read_site_health', selection);
    if (typeof evidence.snapshot_id === 'string') resolved.snapshot_id = evidence.snapshot_id;
  } else if (view === 'trends') {
    evidence = await readAnalytics(db, scope, 'read_visibility_trends', {
      ...selection,
      granularity: 'run',
    });
  } else {
    const overview = await readAnalytics(db, scope, 'read_visibility_overview', selection);
    if (typeof overview.audit_id === 'string') resolved.audit_id = overview.audit_id;
    evidence =
      view === 'sources' && resolved.audit_id
        ? await readEvidence(db, scope, 'read_visibility_sources', resolved)
        : overview;
  }
  // Never accept arbitrary model-computed datasets. Competitor names must occur
  // in the canonical selection, and remain display selection, not new scoring.
  if (selection.competitor && evidence.state === 'available') {
    const rankings = Array.isArray(evidence.rankings) ? evidence.rankings : [];
    const points = Array.isArray(evidence.points) ? evidence.points : [];
    const rows = [
      ...rankings,
      ...points.flatMap((p) => {
        return p && typeof p === 'object' && 'rankings' in p && Array.isArray(p.rankings)
          ? p.rankings
          : [];
      }),
    ];
    if (
      !rows.some(
        (r) => r && typeof r === 'object' && 'name' in r && r.name === selection.competitor,
      )
    )
      throw new McpInputError('Competitor is absent from the selected evidence');
  }
  return {
    surface: 'citeladder_analytics',
    selection: resolved,
    evidence,
    links: {
      application: `${origin}/${view === 'site_health' ? 'website' : 'visibility'}?${new URLSearchParams({ project: scope.projectId, ...(resolved.audit_id ? { audit: resolved.audit_id } : {}) })}`,
      onboarding: `${origin}/onboarding`,
    },
  };
}
