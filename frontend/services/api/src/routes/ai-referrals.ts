/**
 * `ai-referrals`: the persisted AI-referral projection for one project.
 *
 * Moved from `backend/app/api/ai_referrals.py`. `range` names a preset and
 * resolves the newest persisted snapshot of that length; `from`/`to` selects
 * one exact persisted window; neither serves the latest snapshot.
 */
import { aiReferralsSchema } from '@citeladder/contracts/ai-referrals';

import { AiReferralsQueryError, getAiReferrals } from '../analytics/ai-referrals.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { requireProject } from '../projects/access.ts';
import { defineGetRoute } from './define.ts';

export const aiReferralRoutes = [
  defineGetRoute({
    family: 'ai-referrals',
    path: '/api/v1/projects/{project_id}/ai-referrals',
    params: {
      path: { project_id: { scalar: { kind: 'uuid' }, required: true } },
      query: {
        from_date: { scalar: { kind: 'date' }, alias: 'from' },
        to_date: { scalar: { kind: 'date' }, alias: 'to' },
        range_token: { scalar: { kind: 'str' }, alias: 'range' },
        granularity: {
          scalar: { kind: 'str' },
          default: policy.analytics.default_granularity,
        },
      },
    },
    response: aiReferralsSchema,
    async handle({ c, db }, { path, query }) {
      const workspace = c.get('workspace');
      await requireProject(db, workspace, path.project_id);
      try {
        return await getAiReferrals(db, {
          workspaceId: workspace.workspaceId,
          projectId: path.project_id,
          fromDate: query.from_date,
          toDate: query.to_date,
          rangeToken: query.range_token,
          granularity: query.granularity,
        });
      } catch (error) {
        // A bad granularity, window or range is a 422, never a 404 or a 500.
        if (error instanceof AiReferralsQueryError) throw new ApiError(422, error.message);
        throw error;
      }
    },
  }),
];
