import { providerNumber } from './client.ts';
import { integrationPolicy, type Dataset } from './config.ts';

function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const date = /^\d{8}$/u.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
    ? date
    : null;
}
function values(row: Record<string, unknown>): unknown[] {
  return Array.isArray(row.keys) ? row.keys : [];
}
export function normalizedRows(
  provider: string,
  dataset: string,
  template: Dataset,
  payload: Record<string, unknown>,
  start: string,
  end: string,
) {
  const source = Array.isArray(payload.rows) ? payload.rows : [];
  return source.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    let row = item as Record<string, unknown>;
    if (provider === 'ga4') {
      const dimensions = Array.isArray(row.dimensionValues) ? row.dimensionValues : [];
      const metrics = Array.isArray(row.metricValues) ? row.metricValues : [];
      if (
        dimensions.length !== template.dimensions.length ||
        metrics.length !== template.metrics.length
      )
        return [];
      const keys = dimensions.map((value) =>
        value !== null && typeof value === 'object' && 'value' in value ? value.value : null,
      );
      const numeric = metrics.map((value) =>
        value !== null && typeof value === 'object' && 'value' in value
          ? providerNumber(value.value)
          : null,
      );
      if (keys.some((value) => typeof value !== 'string') || numeric.includes(null)) return [];
      row = {
        keys,
        ...Object.fromEntries(template.metrics.map((name, index) => [name, numeric[index]])),
      };
    }
    const keys = values(row);
    if (keys.length !== template.dimensions.length || keys.some((key) => typeof key !== 'string'))
      return [];
    const dateIndex = template.dimensions.findIndex(
      (dimension) => dimension.toLowerCase() === 'date',
    );
    if (dateIndex < 0) return [];
    const date = isoDate(keys[dateIndex]);
    if (date === null || date < start || date > end) return [];
    const metrics = Object.fromEntries(
      template.metrics.flatMap((name) => {
        const metric = row[name];
        return typeof metric === 'number' && Number.isFinite(metric) ? [[name, metric]] : [];
      }),
    );
    if (Object.keys(metrics).length !== template.metrics.length) return [];
    const dimensionKey = keys.join(integrationPolicy.dimension_separator);
    return [{ provider, dataset, date, dimension_key: dimensionKey, metrics }];
  });
}
