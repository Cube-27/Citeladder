import { words } from '@/lib/ai-traffic/vocabulary';
import type { CredentialMode } from '@/lib/api/billing';
import {
  absent,
  formatAmount,
  formatDisplayDate,
  type Formatted,
  formatWindowDate,
  pluralCount,
} from '@/lib/format';

import type { SearchIntelligenceRow } from '@/lib/api/search-intelligence';
import {
  PROVIDER_BLOCKED_STATUSES,
  SEARCH_COLUMNS_BY_KIND,
} from '@/lib/config/search-intelligence';

const numberFormats = new Map<number, Intl.NumberFormat>();

function providerNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean')
    return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function searchAmount(value: unknown, currency: string | null): string | null {
  const number = providerNumber(value);
  return number === null ? null : formatAmount(number, currency);
}

export function searchNumber(value: unknown, maximumFractionDigits = 0): string | null {
  const number = providerNumber(value);
  if (number === null) return null;
  let format = numberFormats.get(maximumFractionDigits);
  if (!format) {
    format = new Intl.NumberFormat('en', { maximumFractionDigits });
    numberFormats.set(maximumFractionDigits, format);
  }
  return format.format(number);
}

type RunCost = {
  credential_mode: CredentialMode;
  confirmed_at: string | null;
  estimated_cost_usd: string | null;
  provider_reported_cost_usd: string | null;
  estimated_credits: number | null;
  charged_credits: number | null;
};

export function runEstimate(run: RunCost): Formatted {
  if (run.credential_mode === 'funded')
    return run.estimated_credits === null
      ? absent('unavailable')
      : pluralCount(run.estimated_credits, 'AI credit');
  return '$' + estimateUsd(run.estimated_cost_usd ?? '0');
}

export function reportedCost(run: RunCost): string {
  if (!run.confirmed_at) return 'Not charged';
  if (run.credential_mode === 'funded')
    return run.charged_credits === null ? 'Pending' : pluralCount(run.charged_credits, 'AI credit');
  if (run.provider_reported_cost_usd === null) return 'Unresolved';
  return '$' + (searchNumber(run.provider_reported_cost_usd, 6) ?? run.provider_reported_cost_usd);
}

export function estimateUsd(value: string): string {
  if (!/^\d+(\.\d+)?$/u.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) ? (Math.ceil(number * 10000) / 10000).toFixed(4) : value;
  }
  const [whole = '0', fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10000n + BigInt((fraction + '0000').slice(0, 4));
  const rounded = units + (/[1-9]/.test(fraction.slice(4)) ? 1n : 0n);
  return `${rounded / 10000n}.${String(rounded % 10000n).padStart(4, '0')}`;
}

type SavedCount = { provider_total: number | null; unique_rows_saved: number };

const savedOfTotal = ({ provider_total, unique_rows_saved }: SavedCount) =>
  provider_total !== null && unique_rows_saved < provider_total
    ? `${searchNumber(unique_rows_saved)} of ${searchNumber(provider_total)}`
    : null;

export function datasetCount(dataset: SavedCount | undefined): string {
  if (!dataset) return 'Not fetched';
  if (dataset.provider_total !== null)
    return savedOfTotal(dataset) ?? searchNumber(dataset.provider_total) ?? '';
  return dataset.unique_rows_saved
    ? `${searchNumber(dataset.unique_rows_saved)} saved`
    : 'No results';
}

export function comparedAgainst(compared: unknown, total: unknown): string | null {
  const saved = searchNumber(compared);
  if (saved === null) return null;
  const available = searchNumber(total);
  return `Against ${available === null || available === saved ? saved : `${saved} of ${available}`} referring domains`;
}

export function datasetCoverage(
  dataset: SavedCount & {
    dataset_kind: string;
    truncated: boolean;
    summary: Readonly<Record<string, unknown>>;
  },
): string | null {
  if (dataset.dataset_kind === 'citation_matches')
    return comparedAgainst(
      dataset.summary.referring_domains_compared,
      dataset.summary.referring_domains_total,
    );
  const fewer = savedOfTotal(dataset);
  if (fewer) return `${fewer} saved`;
  return dataset.truncated && dataset.provider_total === null ? 'Truncated' : null;
}

export const referringLists = <T extends { dataset_kind: string; unique_rows_saved: number }>(
  datasets: readonly T[],
) =>
  datasets.filter(
    (dataset) => dataset.dataset_kind === 'referring_domains' && dataset.unique_rows_saved > 0,
  );

const HIDDEN_FIELDS = new Set([
  'id',
  'dataset_id',
  'call_id',
  'row_kind',
  'auxiliary',
  'provider_row_key',
  'citation_id',
  'audit_id',
  'artifact_id',
  'analyzer_version',
  'action_id',
]);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export type EvidenceField = { key: string; label: string; value: string | null };

const EVIDENCE_LABELS: Readonly<Record<string, string>> = { url_to_status_code: 'Target status' };

function shownInTable(kind: string): ReadonlySet<string> {
  return new Set(
    (SEARCH_COLUMNS_BY_KIND[kind] ?? []).flatMap((column) => [
      ...(column.detail || column.low ? [] : [column.field]),
      ...(column.currencyField ? [column.currencyField] : []),
    ]),
  );
}

const blockedCrawl = (row: Readonly<Record<string, unknown>>) =>
  typeof row.url_to_status_code === 'number' &&
  PROVIDER_BLOCKED_STATUSES.includes(row.url_to_status_code);

export function evidenceFields({
  kind,
  row,
  timeZone,
}: Readonly<{
  kind: string;
  row: Readonly<Record<string, unknown>>;
  timeZone: string;
}>): EvidenceField[] {
  const inTable = shownInTable(kind);
  const labels = Object.fromEntries(
    (SEARCH_COLUMNS_BY_KIND[kind] ?? []).map((column) => [column.field, column.label]),
  );
  return Object.entries(row).flatMap(([key, raw]) => {
    if (HIDDEN_FIELDS.has(key) || inTable.has(key)) return [];
    if (key === 'is_broken' && blockedCrawl(row)) return [];
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) return [];
    const value = evidenceValue(raw, timeZone);
    if (value === null) return [];
    return [{ key, label: labels[key] ?? EVIDENCE_LABELS[key] ?? words(key), value }];
  });
}

export const opensEvidence = (kind: string, row: SearchIntelligenceRow) =>
  Boolean(row.action_id) ||
  row.row_kind === 'citation_match' ||
  evidenceFields({ kind, row, timeZone: 'UTC' }).length > 0;

const listText = (value: unknown[]) =>
  value.length && value.every((item) => typeof item !== 'object') ? value.join(', ') : null;

function evidenceValue(value: unknown, timeZone: string): string | null {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return searchNumber(value, 4);
  if (Array.isArray(value)) return listText(value);
  if (typeof value !== 'string' || !value) return null;
  if (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) return value;
  return DATE_ONLY.test(value) ? formatWindowDate(value) : formatDisplayDate(value, timeZone);
}
