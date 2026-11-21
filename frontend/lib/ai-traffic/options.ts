import type { z } from 'zod';

import type { AiReferralsRangeParams } from '@/lib/api/ai-traffic';
import type { snapshotGranularitySchema } from '@citeladder/contracts/analytics';
export type AiReferralsRange = 'latest' | '30d' | '90d' | '1y';

export const DEFAULT_RANGE: AiReferralsRange = '30d';

export const RANGE_OPTIONS: readonly { value: AiReferralsRange; label: string }[] = [
  { value: 'latest', label: 'Latest synced window' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last 12 months' },
] as const;

export function rangeLabel(value: AiReferralsRange): string {
  return RANGE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function rangeToParams(range: AiReferralsRange): AiReferralsRangeParams {
  return range === 'latest' ? {} : { range };
}

export type AiReferralsGranularity = z.infer<typeof snapshotGranularitySchema>;

const BUCKET_NOUN: Record<AiReferralsGranularity, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

export function bucketCountLabel(granularity: AiReferralsGranularity, count: number): string {
  const noun = BUCKET_NOUN[granularity];
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
