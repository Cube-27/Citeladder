import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Inline } from '@/components/ui/layout';
import { Tooltip } from '@/components/ui/tooltip';
import { serverMessage } from '@/lib/api/mutation-notice';
import { useCrawlBudget } from '@/lib/site-health/crawl-budget';
import { siteHealthMutations, siteHealthQueries } from '@/lib/api/site-health-queries';
import { pluralCount } from '@/lib/format';
import { useWorkspaceCapability } from '@/lib/project/project-scope';
import { Notice, readErrorProps } from '@/components/ui/notice';

export type IssueFixScope = Readonly<{ workspaceId: string; projectId: string }>;

type Notice = { tone: 'info' | 'negative'; text: string };
type ActionProps = Readonly<{
  scope: IssueFixScope;
  crawlId: string;
  groupId: string;
  onNotice: (notice: Notice | null) => void;
}>;

export function IssueFixActions({
  scope,
  crawlId,
  groupId,
}: Readonly<{ scope: IssueFixScope; crawlId: string; groupId: string }>) {
  const query = useQuery(siteHealthQueries.issueFixes(scope.workspaceId, crawlId));
  const canWrite = useWorkspaceCapability('write');
  const canRun = useWorkspaceCapability('run');
  const [notice, setNotice] = useState<Notice | null>(null);
  const pages = useCrawlBudget(scope, 'page_crawls', canRun);
  if (query.isError && !query.data)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        fallback="Couldn't load how many pages are fixed."
        title="Couldn't load how many pages are fixed"
      />
    );
  const progress = query.data?.items.find((item) => item.group_id === groupId);
  if (!progress) return null;
  const rerunCount = progress.rerun_url_count;
  const note = rerunNote(rerunCount, pages);
  const rerunButton = (
    <RerunAllButton
      scope={scope}
      crawlId={crawlId}
      groupId={groupId}
      onNotice={setNotice}
      none={rerunCount === 0 || note.usedUp}
      hint={note.caption}
    />
  );
  return (
    <>
      <Inline wrap>
        {canWrite ? (
          <MarkFixedButton
            scope={scope}
            crawlId={crawlId}
            groupId={groupId}
            onNotice={setNotice}
            done={progress.fixed_url_count >= progress.affected_url_count}
          />
        ) : null}
        {canRun && rerunCount !== null ? rerunButton : null}
      </Inline>
      {notice ? (
        <Notice tone={notice.tone} className="basis-full">
          {notice.text}
        </Notice>
      ) : null}
    </>
  );
}

function MarkFixedButton({
  scope,
  crawlId,
  groupId,
  onNotice,
  done,
}: ActionProps & Readonly<{ done: boolean }>) {
  const mark = useMutation(siteHealthMutations.markIssueFixed(scope.workspaceId, crawlId));
  return (
    <Button
      disabled={mark.isPending || done}
      onClick={() => {
        onNotice(null);
        mark.mutate(groupId, {
          onError: () =>
            onNotice({
              tone: 'negative',
              text: 'Could not mark this issue fixed. Please try again.',
            }),
        });
      }}
    >
      {mark.isPending ? 'Marking fixed…' : 'Mark fixed'}
    </Button>
  );
}

function RerunAllButton({
  scope,
  crawlId,
  groupId,
  onNotice,
  none,
  hint,
}: ActionProps & Readonly<{ none: boolean; hint: string }>) {
  const rerun = useMutation(siteHealthMutations.rerunIssue(scope, crawlId));
  return (
    <Tooltip content={hint}>
      <Button
        disabled={rerun.isPending || none}
        onClick={() => {
          onNotice(null);
          rerun.mutate(groupId, {
            onSuccess: (result) =>
              onNotice({
                tone: 'info',
                text: `Re-auditing ${pluralCount(result.page_count, 'page')}.`,
              }),
            onError: (error) => onNotice({ tone: 'negative', text: rerunErrorMessage(error) }),
          });
        }}
      >
        {rerun.isPending ? 'Re-running…' : 'Re-run all'}
      </Button>
    </Tooltip>
  );
}

function rerunNote(
  count: number | null,
  pages: Readonly<{ usedUp: string | null; left: string | null }>,
) {
  if (count === null || !pages.usedUp)
    return {
      usedUp: false,
      caption: [rerunCaption(count), count === null ? null : pages.left].filter(Boolean).join(' '),
    };
  return { usedUp: true, caption: pages.usedUp };
}

function rerunCaption(count: number | null): string {
  if (count === null) return '';
  if (count === 0) return 'No tracked page with this issue is left to re-audit.';
  return `Re-run all re-audits ${pluralCount(count, 'page')}, one page fetch each.`;
}

function rerunErrorMessage(error: unknown): string {
  return serverMessage(error) ?? 'Could not re-run this issue. Please try again.';
}
