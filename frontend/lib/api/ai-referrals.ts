/** Strict client for the persisted AI-referral projection. */
import type { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import {
  aiReferralsSchema,
  aiSourceSchema,
  strictValidate,
  type snapshotGranularitySchema,
} from './schemas';
import { definedQuery, withQuery } from './shared';

type SnapshotGranularity = z.infer<typeof snapshotGranularitySchema>;
export type AiReferrals = z.infer<typeof aiReferralsSchema>;
export type AiSource = z.infer<typeof aiSourceSchema>;

/** An exact persisted window. Composed into `AiReferralsWindowParams` below. */
type AiReferralsWindow = { from: string; to: string } | { from?: never; to?: never };

/**
 * How a caller names the window it wants: an explicit persisted `from`/`to`,
 * or a `range` preset the SERVER resolves against persisted evidence. The
 * two are mutually exclusive — a preset carries no client-computed dates,
 * which is what keeps a lagging provider's window from being missed.
 */
export type AiReferralsRangeParams =
  | { range: string; from?: never; to?: never }
  | { range?: never };

export type AiReferralsWindowParams = (AiReferralsWindow | AiReferralsRangeParams) & {
  granularity?: SnapshotGranularity;
};

export const aiReferralsApi = {
  getDashboard: async (
    projectId: string,
    params?: AiReferralsWindowParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(`/projects/${projectId}/ai-referrals`, definedQuery(params));
    const response = await apiClient.get<AiReferrals>(path, options);
    return strictValidate(aiReferralsSchema, response, 'aiReferrals.getDashboard');
  },
};
