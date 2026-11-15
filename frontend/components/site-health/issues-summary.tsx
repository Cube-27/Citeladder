import { useId } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { fixedLabel } from '@/components/site-health/issue-fix-actions';
import { IssueMetadata } from '@/components/site-health/issue-metadata';
import { Stack } from '@/components/ui/layout';
import { OpenRow } from '@/components/ui/list-row';
import { PartBar, type Part } from '@/components/ui/part-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import type { IssueFixProgress, SiteIssue, SiteIssuesPage } from '@citeladder/contracts';
import { formatCount } from '@/lib/format';
import { issueTitle, severityCount } from '@/lib/site-health/issues';
import { Notice } from '@/components/ui/notice';
import { READ_FAILED } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

/**
 * The top of the Issues screen: how many issue types the crawl has, how many
 * are high severity, and the few to fix first. It reads the crawl's
 * unfiltered defects, so it never changes as the list below is searched or
 * filtered.
 */
export function IssuesSummary({
  query,
  fixes = [],
  onOpen,
}: Readonly<{
  /** The crawl's worst defects, unfiltered; its summary counts the whole crawl. */
  query: UseQueryResult<SiteIssuesPage>;
  /** How far each issue's fix has come; an issue with none fixed shows no line. */
  fixes?: readonly IssueFixProgress[];
  onOpen: (groupId: string) => void;
}>) {
  if (query.isError && !query.data)
    return (
      <Notice
        kind="read"
        error={query.error}
        fallback={READ_FAILED}
        title="Couldn't load the issue summary"
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  if (!query.data) return <IssuesSummaryLoading />;
  const { summary, items } = query.data;
  // The severity card is far shorter than the priority list, so it takes the
  // full row above it rather than stretching beside it.
  return (
    <Stack gap="workspace" className="min-w-0">
      <SeverityCard summary={summary} />
      {items.length > 0 ? <FixFirst issues={items} fixes={fixes} onOpen={onOpen} /> : null}
    </Stack>
  );
}

/** The loaded layout's two cards, as blocks, so the table below does not move. */
export function IssuesSummaryLoading() {
  return (
    <Stack gap="workspace" className="min-w-0">
      <Section>
        <Skeleton variant="text" lines={2} label="Loading the issue summary" />
      </Section>
      <Section>
        <Skeleton variant="block" rows={3} label="Loading the issue summary" />
      </Section>
    </Stack>
  );
}

/** Issue types by severity: the count, the high-severity count, the pages they reach. */
function SeverityCard({ summary }: Readonly<{ summary: SiteIssuesPage['summary'] }>) {
  const titleId = useId();
  const total = summary.defect_issue_type_count;
  const high = severityCount(summary.severity_counts, 'high');
  const parts: readonly Part[] = [
    { label: 'High', value: high, status: 'negative' },
    { label: 'Medium', value: severityCount(summary.severity_counts, 'medium'), status: 'warning' },
    { label: 'Low', value: severityCount(summary.severity_counts, 'low'), status: 'neutral' },
  ];
  return (
    <Section aria-labelledby={titleId}>
      <SectionHeader>
        <SectionTitle id={titleId}>{issueTypesLabel(total)}</SectionTitle>
        <SectionDescription>{attentionLine(high, summary)}</SectionDescription>
      </SectionHeader>
      {parts.some((part) => part.value > 0) ? (
        <SectionContent>
          <PartBar
            parts={parts}
            legend="row"
            labelledBy={titleId}
            label="Issue types by severity"
          />
        </SectionContent>
      ) : null}
    </Section>
  );
}

function issueTypesLabel(total: number): string {
  if (total === 0) return 'No issue types to fix';
  return `${formatCount(total)} ${total === 1 ? 'issue type' : 'issue types'}`;
}

/** How many are high severity, and how many pages the issue types reach. */
function attentionLine(high: number, summary: SiteIssuesPage['summary']): string {
  const pages = summary.affected_url_count;
  if (summary.defect_issue_type_count === 0) return 'This crawl found nothing to fix.';
  return `${formatCount(high)} high severity · ${formatCount(pages)} ${pages === 1 ? 'page' : 'pages'} affected`;
}

/** The first sentence of a rule's fix, so a priority line stays one line of advice. */
function firstSentence(text: string): string {
  const match = /^[\s\S]*?[.!?](?=\s|$)/u.exec(text.trim());
  return (match ? match[0] : text).trim();
}

/** The worst issues, worst first, each opening its own detail. */
function FixFirst({
  issues,
  fixes,
  onOpen,
}: Readonly<{
  issues: readonly SiteIssue[];
  fixes: readonly IssueFixProgress[];
  onOpen: (groupId: string) => void;
}>) {
  const fixOf = new Map(fixes.map((fix) => [fix.group_id, fix]));
  return (
    <Section aria-labelledby="issues-fix-first">
      <SectionHeader>
        <SectionTitle id="issues-fix-first">Fix these first</SectionTitle>
        <SectionDescription>Top 3 by severity, then reach</SectionDescription>
      </SectionHeader>
      <ol className={ledgerClasses()}>
        {issues.map((issue) => {
          const fix = fixOf.get(issue.group_id);
          return (
            <li key={issue.group_id} className={ledgerItemClasses()}>
              <OpenRow
                onOpen={() => onOpen(issue.group_id)}
                title={issueTitle(issue)}
                meta={
                  <IssueMetadata issue={issue}>
                    <span className="tabular-nums">
                      {formatCount(issue.affected_url_count)}{' '}
                      {issue.affected_url_count === 1 ? 'page affected' : 'pages affected'}
                    </span>
                    {fix && fix.fixed_url_count > 0 ? (
                      <span className="tabular-nums">{fixedLabel(fix)}</span>
                    ) : null}
                  </IssueMetadata>
                }
                caption={issue.remediation ? firstSentence(issue.remediation) : null}
              />
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
