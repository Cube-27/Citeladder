import {
  absent,
  formatMean,
  formatPercent,
  formatDisplayTimestamp,
  type Formatted,
} from '@/lib/format';
import type {
  AuditStatus,
  LogicalEngine,
  Visibility,
  VisibilityEngine,
} from '@citeladder/contracts';
import type { VisibilityTab } from './tabs';

export const DASHBOARD_STATUSES: readonly AuditStatus[] = ['completed', 'partially_completed'];

export { VISIBILITY_TABS, type VisibilityTab } from './tabs';

export type SourceTab = Extract<VisibilityTab, 'domains' | 'urls' | 'read-not-cited'>;

export type VisibilityView =
  | VisibilityTab
  | 'insights'
  | 'competitors'
  | 'competitor'
  | 'perception';

export function isEvidenceTab(tab: VisibilityView): boolean {
  return tab === 'query-fanout';
}

export type VisibilityFilters = {
  engine: LogicalEngine | 'all';
};

export type RunOption = {
  id: string;
  status: AuditStatus;
  label: string;
  completedAt: string | null;
};

export function toRunOptions(
  audits: ReadonlyArray<{
    id: string;
    status: AuditStatus;
    completed_at: string | null;
    created_at: string;
  }>,
  timeZone = 'UTC',
): RunOption[] {
  return audits.map((audit) => ({
    id: audit.id,
    status: audit.status,
    completedAt: audit.completed_at,
    label: formatDisplayTimestamp(audit.completed_at ?? audit.created_at, timeZone),
  }));
}

export type ActiveRun = {
  id: string;
  status: AuditStatus;
  createdAt: string;
};

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

export function formatRate(rate: number | null): Formatted {
  if (rate === null || Number.isNaN(rate)) return absent();
  return formatPercent(rate);
}

export function formatWholePercent(value: number | null): Formatted {
  if (value === null || Number.isNaN(value)) return absent();
  return `${Math.round(value)}%`;
}

export { formatScore } from '@/lib/format';

export function formatRank(rank: number | null): Formatted {
  if (rank === null || Number.isNaN(rank)) return absent();
  return `#${Math.max(1, Math.round(rank))}`;
}

export function formatPositionExact(position: number | null): Formatted {
  if (position === null || Number.isNaN(position)) return absent();
  return formatMean(position);
}

export type PromptOption = {
  id: string;
  label: string;
};
