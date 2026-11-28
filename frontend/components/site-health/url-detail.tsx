import { useContext, useRef, useState, type MutableRefObject } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { TableCell, TableRow, TableTime } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { History } from '@/lib/icons';
import { siteHealthMutations, siteHealthQueries } from '@/lib/api/site-health-queries';
import type { PageDetail } from '@citeladder/contracts';
import { serverMessage } from '@/lib/api/mutation-notice';
import { useCrawlBudget } from '@/lib/site-health/crawl-budget';
import { RERUN_MAX_PRE_ACTIVE_POLLS, RERUN_POLL_INTERVAL_MS } from '@/lib/config/site-health';
import { dimensionLabel, issueTitle, severityLabel } from '@/lib/site-health/issues';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';

import { UrlTraffic } from '@/components/ai-traffic/url-panel';
import { FixUrlWithAgent, UrlActionsList, useUrlActionCount } from '@/components/agent/url-actions';
import { PageDrawerView } from '@/components/site-health/page-drawer-view';
import { PageOpenContext } from '@/components/site-health/page-open-context';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { DrawerPane } from '@/components/ui/drawer';
import { StateBlock } from '@/components/ui/state-block';

export function UrlDetail({
  crawlId,
  siteUrlId,
  polling = false,
}: Readonly<{ crawlId: string; siteUrlId: string; polling?: boolean }>) {
  const { workspaceId, projectId } = useProjectScope();
  const openPage = useContext(PageOpenContext);
  const hasObservedActiveRerunRef = useRef(false);
  const preActivePollCountRef = useRef(0);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const detailQuery = useQuery({
    ...siteHealthQueries.page(workspaceId, crawlId, siteUrlId),
    refetchInterval: (query) =>
      rerunPollInterval(
        polling,
        query.state.data?.analysis_status,
        hasObservedActiveRerunRef,
        preActivePollCountRef,
      ),
  });
  const actionCount = useUrlActionCount(siteUrlId);
  const rerun = useMutation(siteHealthMutations.rerunPage(workspaceId));
  const canRun = useWorkspaceCapability('run');
  const { usedUp, left } = useCrawlBudget({ workspaceId, projectId }, 'page_crawls', canRun);
  const startRerun = () => {
    setRerunError(null);
    rerun.mutate(
      { crawlId, siteUrlId },
      {
        onSuccess: (result) =>
          openPage?.({ crawlId: result.crawl_id, siteUrlId: result.site_url_id, rerun: true }),
        onError: (error) => setRerunError(rerunErrorMessage(error)),
      },
    );
  };

  if (detailQuery.isLoading)
    return (
      <DrawerPane>
        <StateBlock
          kind="loading"
          label="Loading page detail…"
          shape={{ kind: 'facts', rows: 3, tagRows: [1] }}
        />
      </DrawerPane>
    );
  if (detailQuery.isError || !detailQuery.data)
    return (
      <DrawerPane>
        <StateBlock
          kind="error"
          {...readErrorProps(detailQuery)}
          fallback="Couldn't load this page. It may not exist in this crawl."
          title="Couldn't load this page"
        />
      </DrawerPane>
    );
  const detail = detailQuery.data;
  const rerunButton = (
    <Button variant="primary" onClick={startRerun} disabled={rerun.isPending || usedUp !== null}>
      {rerun.isPending ? 'Re-auditing…' : 'Re-audit this page'}
    </Button>
  );
  const rerunAction = left ? <Tooltip content={left}>{rerunButton}</Tooltip> : rerunButton;

  return (
    <PageDrawerView
      detail={detail}
      work={{
        count: actionCount,
        list: <UrlActionsList siteUrlId={siteUrlId} />,
      }}
      history={
        <IssueHistory
          key={detail.last_audited ?? ''}
          workspaceId={workspaceId}
          crawlId={crawlId}
          siteUrlId={siteUrlId}
        />
      }
      traffic={detail.url_hash ? <UrlTraffic urlHash={detail.url_hash} /> : null}
      actions={
        <>
          <FixUrlWithAgent siteUrlId={siteUrlId} />
          {canRun ? rerunAction : null}
        </>
      }
    >
      {usedUp ? <Notice tone="warning">{usedUp}</Notice> : null}
      {rerunError ? <Notice tone="negative">{rerunError}</Notice> : null}
    </PageDrawerView>
  );
}

function rerunPollInterval(
  polling: boolean,
  status: PageDetail['analysis_status'] | undefined,
  observedActive: MutableRefObject<boolean>,
  preActivePollCount: MutableRefObject<number>,
): number | false {
  if (!polling) return false;
  if (status === 'pending' || status === 'running') {
    observedActive.current = true;
    preActivePollCount.current = 0;
    return RERUN_POLL_INTERVAL_MS;
  }
  if (status === undefined || !observedActive.current) {
    if (preActivePollCount.current >= RERUN_MAX_PRE_ACTIVE_POLLS) return false;
    preActivePollCount.current += 1;
    return RERUN_POLL_INTERVAL_MS;
  }
  return false;
}

function rerunErrorMessage(error: unknown): string {
  return serverMessage(error) ?? 'Could not re-audit this page. Try again.';
}

type HistoryTarget = Readonly<{ workspaceId: string; crawlId: string; siteUrlId: string }>;

function IssueHistory({ workspaceId, crawlId, siteUrlId }: HistoryTarget) {
  const { page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: crawlId,
    scope: siteUrlId,
    query: (request) => ({
      ...siteHealthQueries.issueHistory(workspaceId, crawlId, siteUrlId, request),
      staleTime: 0,
    }),
    noun: 'resolved issues',
    loading: 'Loading issue history…',
    subject: 'the issue history',
    empty: (current) => ({
      kind: 'empty',
      icon: History,
      headingLevel: 3,
      heading: current.current_analysis_finalized ? 'No resolved issues' : 'Analysis not finished',
    }),
  });

  return (
    <DataTable label="Resolved issues" columns={HISTORY_COLUMNS} {...table}>
      {page?.items.map((row) => (
        <TableRow key={row.id}>
          <TableCell>{issueTitle(row)}</TableCell>
          <TableCell>
            <Tag>{dimensionLabel(row.dimension)}</Tag>
          </TableCell>
          <TableCell>
            <StatusMark variant="severity" value={row.severity}>
              {severityLabel(row.severity)}
            </StatusMark>
          </TableCell>
          <TableCell>
            <TableTime value={row.created_at} fallback={<Absence state="not_measured" />} />
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const HISTORY_COLUMNS: readonly DataTableColumn[] = [
  { key: 'issue', label: 'Issue', kind: 'identity' },
  { key: 'dimension', label: 'Dimension', kind: 'text', width: 'name' },
  { key: 'severity', label: 'Severity', kind: 'status' },
  { key: 'found', label: 'Last found', kind: 'date' },
];
