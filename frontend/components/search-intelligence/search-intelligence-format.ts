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

export function datasetCount(
  dataset: { provider_total: number | null; unique_rows_saved: number } | undefined,
): string {
  if (!dataset) return 'Not fetched';
  if (dataset.provider_total !== null) return formatSearchNumber(dataset.provider_total);
  return dataset.unique_rows_saved
    ? `${formatSearchNumber(dataset.unique_rows_saved)} saved`
    : 'No results';
}
