'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { IssueFixProgress } from '@citeladder/contracts';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { ApiError } from '@/lib/api/errors';
import { siteHealthMutations, siteHealthQueries } from '@/lib/api/site-health-queries';
import { formatCount } from '@/lib/format';

/** The project whose crawl the issue is in: Re-run all refreshes its dashboard. */
export type IssueFixScope = Readonly<{ workspaceId: string; projectId: string }>;

/** "N of M pages fixed": pages marked fixed or verified fixed, of the pages the crawl found it on. */
export function fixedLabel(
  progress: Pick<IssueFixProgress, 'fixed_url_count' | 'affected_url_count'>,
) {
  const total = progress.affected_url_count;
  return `${formatCount(progress.fixed_url_count)} of ${formatCount(total)} ${total === 1 ? 'page' : 'pages'} fixed`;
}

/** One issue's fix progress in a crawl, from the crawl's one fix-progress read. */
export function useIssueFixProgress(workspaceId: string, crawlId: string, groupId: string) {
  const query = useQuery(siteHealthQueries.issueFixes(workspaceId, crawlId));
  return query.data?.items.find((item) => item.group_id === groupId);
}

type Notice = { tone: 'info' | 'negative'; text: string };

/**
 * Mark fixed and Re-run all for one issue (SH-B12), with how far its fix has
 * come. Marking says the person fixed it; only an audit verifies it. Re-run all
 * re-audits the tracked pages the issue is still open on, one page fetch each.
 */
export function IssueFixActions({
  scope,
  crawlId,
  groupId,
}: Readonly<{ scope: IssueFixScope; crawlId: string; groupId: string }>) {
  const progress = useIssueFixProgress(scope.workspaceId, crawlId, groupId);
  const mark = useMutation(siteHealthMutations.markIssueFixed(scope.workspaceId, crawlId));
  const rerun = useMutation(siteHealthMutations.rerunIssue(scope, crawlId));
  const [notice, setNotice] = useState<Notice | null>(null);
  if (!progress) return null;
  const awaiting = progress.fixed_url_count - progress.verified_url_count;
  const rerunCount = progress.rerun_url_count;
  return (
    <Stack gap="tight" className="min-w-0">
      <Inline className="flex-wrap">
        <span className={textRole('itemTitle', 'tabular-nums')}>{fixedLabel(progress)}</span>
        {awaiting > 0 ? (
          <span className="type-caption tabular-nums">
            {formatCount(awaiting)} awaiting a re-audit
          </span>
        ) : null}
      </Inline>
      <Inline className="flex-wrap">
        <Button
          disabled={mark.isPending || progress.fixed_url_count >= progress.affected_url_count}
          onClick={() => {
            setNotice(null);
            mark.mutate(groupId, {
              onError: () =>
                setNotice({
                  tone: 'negative',
                  text: 'Could not mark this issue fixed. Please try again.',
                }),
            });
          }}
        >
          {mark.isPending ? 'Marking fixed…' : 'Mark fixed'}
        </Button>
        <Button
          disabled={rerun.isPending || rerunCount === 0}
          onClick={() => {
            setNotice(null);
            rerun.mutate(groupId, {
              onSuccess: (result) =>
                setNotice({
                  tone: 'info',
                  text: `Re-auditing ${pagesLabel(result.page_count)}. The progress updates when the audit finishes.`,
                }),
              onError: (error) => setNotice({ tone: 'negative', text: rerunErrorMessage(error) }),
            });
          }}
        >
          {rerun.isPending ? 'Re-running…' : 'Re-run all'}
        </Button>
      </Inline>
      <span className="type-caption">
        {rerunCount > 0
          ? `Re-run all re-audits ${pagesLabel(rerunCount)}, one page fetch each.`
          : 'A full crawl re-checks this issue.'}
      </span>
      {notice ? <Callout tone={notice.tone}>{notice.text}</Callout> : null}
    </Stack>
  );
}

const pagesLabel = (count: number) => `${formatCount(count)} ${count === 1 ? 'page' : 'pages'}`;

function rerunErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not re-run this issue. Please try again.';
  if (error.code === 'crawl_already_active')
    return 'A crawl is running. Re-run this issue when it finishes.';
  if (error.code === 'site_health_fetches_exhausted')
    return 'Not enough page fetches remain this period to re-audit every page.';
  if (error.status === 403) return 'Re-auditing pages requires a Starter plan.';
  if (error.status === 409) return 'No tracked page with this issue can be re-audited.';
  return 'Could not re-run this issue. Please try again.';
}
