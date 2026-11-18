/**
 * The measurement selection every visibility route reads: its query
 * parameters, the `RunSelection` they decode to, and the translation of the
 * readers' selection errors into responses.
 */
import { policy } from '../config.ts';
import { ApiError, notFound } from '../errors.ts';
import type { ParamSpecs } from '../http/params.ts';
import { InvalidCursorError } from '../http/keyset-cursor.ts';
import {
  AnalysisNotFoundError,
  TrendQueryError,
  type RunSelection,
} from '../visibility/selection.ts';

export const PROJECT_PATH = { project_id: { scalar: { kind: 'uuid' }, required: true } } as const;
export const COHORT = {
  scalar: { kind: 'literal', values: ['core', 'comparison', 'all'] },
  default: 'core',
} as const;
/** The measurement market; omitted is the project default. Named runs imply their own. */
export const MARKET = { market: { scalar: { kind: 'uuid' } } } as const satisfies ParamSpecs;
export const RUNS = {
  audit_id: { scalar: { kind: 'uuid' } },
  audit_ids: { scalar: { kind: 'uuid' }, list: true },
  ...MARKET,
} as const satisfies ParamSpecs;
export const WINDOW = {
  from_at: { scalar: { kind: 'datetime' }, alias: 'from' },
  to_at: { scalar: { kind: 'datetime' }, alias: 'to' },
} as const satisfies ParamSpecs;
/** Answers to prompts filed under this project topic when their run froze them. */
export const TOPIC = { topic: { scalar: { kind: 'uuid' } } } as const satisfies ParamSpecs;
export const LIMIT = {
  scalar: { kind: 'int', ge: 1, le: policy.visibility.evidence_max_limit },
  default: policy.visibility.evidence_default_limit,
} as const;
export const BASELINE_RUNS = { scalar: { kind: 'uuid' }, list: true } as const;
// `citations.url` is unbounded text, so this cap decides which pages have a
// detail view at all: the practical ceiling a query string survives.
export const MAX_URL_LENGTH = 8192;

/** Every route here reads the path project inside the active workspace. */
export const family = { family: 'visibility', authorize: 'active-project' } as const;

/**
 * A selection with nothing measured yet and one whose metrics are still being
 * written are their own answers, each with its own code, so a client never
 * shows one as the other or as something that does not exist.
 */
const UNMEASURED_CODES = {
  not_measured: 'visibility_not_measured',
  metrics_pending: 'visibility_metrics_pending',
} as const;

/**
 * Translate the readers' selection errors: an unservable selection is a 404
 * (`Audit not found` unless the route names what is missing, or a code saying
 * it is not measured yet) and a malformed one a 422 carrying the reader's message.
 */
export async function selectionErrors<T>(
  read: () => Promise<T>,
  missing: () => ApiError = () => notFound('Audit'),
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AnalysisNotFoundError) {
      if (error.reason === 'not_found') throw missing();
      throw new ApiError(404, error.message, { code: UNMEASURED_CODES[error.reason] });
    }
    if (error instanceof TrendQueryError || error instanceof InvalidCursorError)
      throw new ApiError(422, error.message);
    throw error;
  }
}

type SelectionQuery = {
  market: string | null;
  audit_id: string | null;
  audit_ids: string[] | null;
  engine: string | null;
  cohort: string;
  from_at: RunSelection['fromAt'];
  to_at: RunSelection['toAt'];
  topic?: string | null;
};

/** A project's runs in the requested market (omitted: the default) and topic. */
export const marketScope = (
  workspaceId: string,
  projectId: string,
  query: { market: string | null; topic?: string | null },
) => ({ workspaceId, projectId, marketId: query.market, topicId: query.topic ?? null });

export function runSelection(
  workspaceId: string,
  projectId: string,
  query: SelectionQuery,
): RunSelection {
  return {
    workspaceId,
    projectId,
    marketId: query.market,
    auditId: query.audit_id,
    auditIds: query.audit_ids,
    logicalEngine: query.engine,
    cohort: query.cohort,
    fromAt: query.from_at,
    toAt: query.to_at,
    topicId: query.topic ?? null,
  };
}

export const PERCEPTION_SELECTION = {
  ...RUNS,
  engine: { scalar: { kind: 'str' } },
  cohort: COHORT,
  ...WINDOW,
} as const satisfies ParamSpecs;
