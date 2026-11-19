/**
 * Visibility dashboard helpers (F9).
 *
 * Pure, framework-free helpers the dashboard uses to pick the default run,
 * format the projection for display, and apply the client-side engine filter.
 * The B6 `/projects/{id}/visibility` endpoint is a selected-run projection
 * keyed only by `audit_id`; the engine filter is a client-side display filter
 * that also participates in the React Query key. There is NO per-prompt-type
 * (branded / non-branded) breakdown in `VisibilityResponse` yet, so no such
 * control is offered.
 */
import { availabilityLabel, formatMean, formatPercent, formatStripTimestamp } from '@/lib/format';
import { AUDIT_STATES } from '@/lib/runs/status';
import type {
  AuditStatus,
  LogicalEngine,
  Visibility,
  VisibilityEngine,
} from '@citeladder/contracts';
import type { VisibilityTab } from './tabs';

/** Audit statuses that carry a dashboard-ready metric snapshot (B6). */
const DASHBOARD_STATUSES: ReadonlySet<AuditStatus> = new Set<AuditStatus>([
  'completed',
  'partially_completed',
]);

export { VISIBILITY_TABS, type VisibilityTab } from './tabs';

/** The tabs that draw the Sources inventory. */
export type SourceTab = Extract<VisibilityTab, 'domains' | 'urls' | 'read-not-cited'>;

/**
 * Which screen reads the shared selection: a Visibility tab, or a Brand page
 * (Insights and one competitor's page draw the trend; Competitors and Perception
 * read the selection).
 */
export type VisibilityView =
  | VisibilityTab
  | 'insights'
  | 'competitors'
  | 'competitor'
  | 'perception';

/** The tabs backed by the shared execution-evidence query + cache key. */
export function isEvidenceTab(tab: VisibilityView): boolean {
  return tab === 'query-fanout';
}

/** Filters that drive the visibility query key + client-side display. */
export type VisibilityFilters = {
  /** `'all'` shows every engine; otherwise narrows the per-engine comparison. */
  engine: LogicalEngine | 'all';
};

/** A run option for the selector, ordered latest-first. */
export type RunOption = {
  id: string;
  status: AuditStatus;
  label: string;
  completedAt: string | null;
};

/** Is this a status the dashboard projection can be built from? */
export function isDashboardStatus(status: AuditStatus): boolean {
  return DASHBOARD_STATUSES.has(status);
}

/**
 * Build the run-selector options from the project's audits: keep only
 * dashboard-ready runs, newest first (by completed-at, then created-at) —
 * mirroring the backend's default-run resolution so the first option is the
 * one the endpoint defaults to when `audit_id` is omitted.
 */
export function toRunOptions(
  audits: ReadonlyArray<{
    id: string;
    status: AuditStatus;
    completed_at: string | null;
    created_at: string;
  }>,
  timeZone = 'UTC',
): RunOption[] {
  return audits
    .filter((audit) => isDashboardStatus(audit.status))
    .slice()
    .sort((a, b) => {
      const aKey = a.completed_at ?? a.created_at;
      const bKey = b.completed_at ?? b.created_at;
      return bKey.localeCompare(aKey);
    })
    .map((audit) => ({
      id: audit.id,
      status: audit.status,
      completedAt: audit.completed_at,
      label: formatStripTimestamp(audit.completed_at ?? audit.created_at, timeZone),
    }));
}

/** Brand pages read brand runs only: a Commerce run is never a brand selection. */
export function brandRuns<T extends { audit_scope: 'brand' | 'commerce' }>(
  audits: readonly T[] | undefined,
): T[] {
  return (audits ?? []).filter((audit) => audit.audit_scope === 'brand');
}

/** A run that is still progressing (queued/running/analyzing/…). */
export type ActiveRun = {
  id: string;
  status: AuditStatus;
  createdAt: string;
};

/**
 * The newest run that is still progressing, if any. A run that is active is
 * NOT dashboard-ready (its metric snapshot doesn't exist yet), so it never
 * appears in `toRunOptions` — this is the companion signal the dashboard uses
 * to say "a run is in progress" (and to keep polling the audits list) instead
 * of silently showing stale data or a bare empty state.
 */
export function findActiveRun(
  audits: ReadonlyArray<{ id: string; status: AuditStatus; created_at: string }>,
): ActiveRun | null {
  const active = audits
    .filter((audit) => AUDIT_STATES[audit.status].active)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const newest = active[0];
  return newest ? { id: newest.id, status: newest.status, createdAt: newest.created_at } : null;
}

/**
 * Per-engine comparison rows for display: apply the engine filter, then order
 * by the catalogue's engine order so cards are stable across runs.
 */
export function visibleEngines(
  visibility: Visibility,
  filter: VisibilityFilters['engine'],
  engineOrder: readonly string[],
): VisibilityEngine[] {
  const rows =
    filter === 'all'
      ? visibility.per_engine
      : visibility.per_engine.filter((engine) => engine.logical_engine === filter);
  const order = new Map(engineOrder.map((engine, index) => [engine, index]));
  return rows.slice().sort((a, b) => {
    const ai = order.get(a.logical_engine) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.logical_engine) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.logical_engine.localeCompare(b.logical_engine);
  });
}

/** Format a 0–1 rate as a one-decimal percentage, or the placeholder. */
export function formatRate(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return PLACEHOLDER;
  return formatPercent(rate);
}

/**
 * Format a value that is ALREADY a percentage, or the placeholder.
 *
 * `formatRate` takes a 0–1 rate and scales it. The trend series is built in
 * whole percent, so passing its points through `formatRate` multiplied them a
 * second time and labelled a 38% point "3800%". Named apart from
 * `formatPercent` in `lib/format`, which takes a 0–1 fraction: the two shared a
 * name and signature, so an auto-import of the wrong one type-checked.
 */
export function formatWholePercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return PLACEHOLDER;
  return `${Math.round(value)}%`;
}

/** Format a 0–100 score as a whole number, or the placeholder. */
export { formatScore } from '@/lib/format';

/** A whole place in an ordered list ("#3"); never an average, which is `formatPositionExact`. */
export function formatRank(rank: number | null): string {
  if (rank === null || Number.isNaN(rank)) return PLACEHOLDER;
  return `#${Math.max(1, Math.round(rank))}`;
}

/** An average position as a decimal ("2.5"): a mean over answers, not a rank. */
export function formatPositionExact(position: number | null): string {
  if (position === null || Number.isNaN(position)) return PLACEHOLDER;
  return formatMean(position);
}

/** The not-measured placeholder for an absent average position. */
export const PLACEHOLDER = availabilityLabel('not_measured');

/**
 * A formatted value, or `null` where the formatter had nothing to format.
 *
 * The formatters answer in WORDS, and the COMPONENT that renders them decides
 * to draw the shared mark instead — `Value` and `Absence` both do, pairing
 * it with those words as its accessible name. Keeping the mark out
 * of the string is what makes that possible: a bare dash in a formatter's
 * output reaches the screen with nothing to announce it.
 */
export { measured } from '@/lib/format';

/**
 * A prompt option for the Query Fanout evidence prompt selector. This is
 * EVIDENCE filtering (restrict by `AuditPromptSnapshot.prompt_id`), NOT the
 * Overview prompt-type taxonomy affordance — it never claims prompt-type
 * semantics. A deleted source prompt has a null `prompt_id` and cannot be
 * selected by a current id, so it is offered only under "All prompts".
 */
export type PromptOption = {
  /** The source prompt id; only selectable options carry a non-null id. */
  id: string;
  /** The frozen prompt text (display label). */
  label: string;
};
