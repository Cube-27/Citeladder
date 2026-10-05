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
const textArg = (args: ReadArguments, key: string) =>
  typeof args[key] === 'string' ? args[key] : null;

async function readTrends(db: Database, scope: ReadScope, args: ReadArguments): Promise<Evidence> {
  if (typeof args.from_at !== 'string' || typeof args.to_at !== 'string')
    throw new McpInputError('Trends requires an explicit window');
  const fromAt = parseDatetime(args.from_at);
  const toAt = parseDatetime(args.to_at);
  if (!fromAt || !toAt) throw new McpInputError('Trends window must contain valid datetimes');
  if (
    Date.parse(args.to_at) - Date.parse(args.from_at) >
    mcpPolicy.trend_max_window_days * 86400000
  )
    throw new McpInputError(`Trend windows are limited to ${mcpPolicy.trend_max_window_days} days`);
  const points = visibilityTrendListSchema.parse(
    await getVisibilityTrends(db, scope, {
      logicalEngine: textArg(args, 'engine'),
      fromAt,
      toAt,
      granularity: textArg(args, 'granularity') ?? 'run',
      transportModel: textArg(args, 'transport_model'),
      retrievalEnabled: typeof args.retrieval_enabled === 'boolean' ? args.retrieval_enabled : null,
      cohort: textArg(args, 'cohort') ?? 'core',
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

export async function readAnalytics(
  db: Database,
  scope: ReadScope,
  name: string,
  args: ReadArguments,
): Promise<Evidence> {
  try {
    if (name === 'read_visibility_trends') return await readTrends(db, scope, args);
    if (typeof args.baseline_id === 'string') await authorizeRunSet(db, scope, [args.baseline_id]);
    const projection = visibilitySchema.parse(
      await getVisibility(db, scope, {
        auditId: textArg(args, 'audit_id'),
        logicalEngine: textArg(args, 'engine'),
        baselineId: textArg(args, 'baseline_id'),
        selectionMode: args.audit_id ? 'run' : 'latest',
        fromAt: null,
        toAt: null,
        configurationKey: null,
        cohort: textArg(args, 'cohort') ?? 'core',
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

function validateFilters(selection: AnalyticsSelection) {
  const { view } = selection;
  if (
    (selection.from_at ||
      selection.to_at ||
      selection.transport_model != null ||
      selection.retrieval_enabled != null) &&
    view !== 'trends'
  )
    throw new McpInputError('Period and model filters apply only to Trends');
  if ((selection.domain || selection.cursor || selection.level === 'url') && view !== 'sources')
    throw new McpInputError('Source paging filters apply only to Sources');
  if (selection.snapshot_id && view !== 'site_health')
    throw new McpInputError('snapshot_id applies only to Site Health');
  if (selection.competitor && view !== 'overview' && view !== 'trends')
    throw new McpInputError('Competitor selection applies only to Overview and Trends');
}

function validateRequiredScope(selection: AnalyticsSelection) {
  if (selection.view === 'trends' && (!selection.from_at || !selection.to_at || selection.audit_id))
    throw new McpInputError('Trends requires an explicit window and no audit_id');
  if (
    selection.view === 'site_health' &&
    (selection.audit_id || selection.engine || selection.competitor || selection.cohort !== 'core')
  )
    throw new McpInputError('Site Health does not support visibility filters');
}

function validateCompetitor(selection: AnalyticsSelection, evidence: Evidence) {
  // Names must occur in canonical evidence; they select display, not new scoring.
  if (!selection.competitor || evidence.state !== 'available') return;
  const rankings = Array.isArray(evidence.rankings) ? evidence.rankings : [];
  const points = Array.isArray(evidence.points) ? evidence.points : [];
  const rows = [
    ...rankings,
    ...points.flatMap((p) =>
      p && typeof p === 'object' && 'rankings' in p && Array.isArray(p.rankings) ? p.rankings : [],
    ),
  ];
  if (
    !rows.some((r) => r && typeof r === 'object' && 'name' in r && r.name === selection.competitor)
  )
    throw new McpInputError('Competitor is absent from the selected evidence');
}

export async function renderAnalytics(
  db: Database,
  scope: ReadScope,
  selection: AnalyticsSelection,
  origin: string,
): Promise<Evidence> {
  validateRequiredScope(selection);
  validateFilters(selection);
  const { view } = selection;
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
  validateCompetitor(selection, evidence);
  return {
    surface: 'citeladder_analytics',
    selection: resolved,
    evidence,
    links: {
      application: `${origin}/${view === 'site_health' ? 'website' : 'visibility'}?${new URLSearchParams({ project: scope.projectId, ...(resolved.audit_id ? { run: resolved.audit_id } : {}) })}`,
      onboarding: `${origin}/onboarding`,
    },
  };
}
