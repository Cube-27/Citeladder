import type { ReactNode } from 'react';

import type { SiteIssue } from '@citeladder/contracts';

import { IssueSeverityMark } from '@/components/site-health/issue-metadata';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Delta } from '@/components/ui/delta';
import { TableCell, TableRow } from '@/components/ui/table';
import { absent, formatCount, type Formatted } from '@/lib/format';
import { issueTitle } from '@/lib/site-health/issues';

export type IssueRowFacts = Pick<
  SiteIssue,
  | 'group_id'
  | 'rule_id'
  | 'title'
  | 'severity'
  | 'affected_url_count'
  | 'new_url_count'
  | 'resolved_url_count'
>;

const ISSUE_ROW_COLUMNS = {
  issue: { key: 'issue', label: 'Issue', kind: 'identity' },
  severity: { key: 'severity', label: 'Severity', kind: 'status', width: 'status' },
  pages: { key: 'pages', label: 'Pages', kind: 'number', width: 'metric' },
  change: { key: 'change', label: 'Change', kind: 'number', width: 'metric' },
  new: { key: 'new', label: 'New', kind: 'number', width: 'metric' },
  fixed: { key: 'fixed', label: 'Fixed', kind: 'number', width: 'metric' },
} as const satisfies Record<string, DataTableColumn>;

export const ISSUE_COLUMNS: readonly DataTableColumn[] = Object.values(ISSUE_ROW_COLUMNS);

function sinceLastCrawl(count: number | null): Formatted {
  return count === null ? absent('unavailable') : formatCount(count);
}

function netChange(issue: IssueRowFacts): number | null {
  if (issue.new_url_count === null || issue.resolved_url_count === null) return null;
  return issue.new_url_count - issue.resolved_url_count;
}

export function IssueRow({
  issue,
  renderName,
  onOpen,
}: Readonly<{
  issue: IssueRowFacts;
  renderName: (title: string) => ReactNode;
  onOpen?: () => void;
}>) {
  const title = issueTitle(issue);
  return (
    <TableRow onOpen={onOpen}>
      <TableCell>{renderName(title)}</TableCell>
      <TableCell wrap="nowrap">
        <IssueSeverityMark issue={issue} />
      </TableCell>
      <TableCell numeric>{formatCount(issue.affected_url_count)}</TableCell>
      <TableCell numeric>
        <Delta
          value={netChange(issue)}
          policy="lower-is-better"
          precision={0}
          missingReason="No earlier crawl to compare"
        />
      </TableCell>
      <TableCell numeric>{sinceLastCrawl(issue.new_url_count)}</TableCell>
      <TableCell numeric>{sinceLastCrawl(issue.resolved_url_count)}</TableCell>
    </TableRow>
  );
}
