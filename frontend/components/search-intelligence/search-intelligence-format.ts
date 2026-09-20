export function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not measured';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'Not measured';
}

export function formatSearchNumber(value: unknown, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || value === '') return 'Not measured';
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 'Not measured';
  return new Intl.NumberFormat('en', { maximumFractionDigits }).format(number);
}

export function reportedCost(run: {
  confirmed_at: string | null;
  provider_reported_cost_usd: string | null;
}): string {
  if (!run.confirmed_at) return 'Not charged';
  if (run.provider_reported_cost_usd === null) return 'Unresolved';
  return '$' + formatSearchNumber(run.provider_reported_cost_usd, 6);
}

export function estimateUsd(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10000n + BigInt((fraction + '0000').slice(0, 4));
  const rounded = units + (/[1-9]/.test(fraction.slice(4)) ? 1n : 0n);
  return `${rounded / 10000n}.${String(rounded % 10000n).padStart(4, '0')}`;
}

export function datasetCount(
  dataset: { provider_total: number | null; unique_rows_saved: number } | undefined,
): string {
  if (!dataset) return 'Not fetched';
  if (dataset.provider_total !== null) return formatSearchNumber(dataset.provider_total);
  return dataset.unique_rows_saved
    ? `${formatSearchNumber(dataset.unique_rows_saved)} saved`
    : 'No results';
}
