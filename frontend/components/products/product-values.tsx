import { Value } from '@/components/ui/value';
import { formatMean, formatPercent } from '@/lib/format';

export const meanValue = (value: number | null) => (
  <Value value={value === null ? null : formatMean(value)} absent="unavailable" />
);

export const rateValue = (value: number | null) => (
  <Value value={value === null ? null : formatPercent(value)} absent="unavailable" />
);
