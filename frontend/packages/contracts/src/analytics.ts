import { z } from 'zod';

export const snapshotGranularitySchema = z.enum(['day', 'week', 'month']);

const metricSeriesPointSchema = z.object({
  date: z.string(),
  value: z.number().nullable(),
});

export const metricSeriesSchema = z.array(metricSeriesPointSchema);
